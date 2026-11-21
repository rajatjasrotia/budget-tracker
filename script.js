const SESSION_KEY = 'finova-excel-session-v1';
const LOCAL_PREFIX = 'finova-excel-profile:';
const LEGACY_KEY = 'finova-dashboard-v2';
const CURRENCIES = {
  USD: { locale: 'en-US', name: 'US Dollar' }, INR: { locale: 'en-IN', name: 'Indian Rupee' },
  EUR: { locale: 'de-DE', name: 'Euro' }, GBP: { locale: 'en-GB', name: 'British Pound' },
  CAD: { locale: 'en-CA', name: 'Canadian Dollar' }, AUD: { locale: 'en-AU', name: 'Australian Dollar' },
  AED: { locale: 'en-AE', name: 'UAE Dirham' }
};

const appMain = document.querySelector('.main');
const sidebar = document.querySelector('.sidebar');
const addTransactionButton = document.querySelector('#addTransaction');
const modalBackdrop = document.querySelector('#modalBackdrop');
const closeModalButton = document.querySelector('#closeModal');
const transactionForm = document.querySelector('#transactionForm');
const transactionList = document.querySelector('#transactionList');
let state;
let saveTimer;
let saving = false;
let saveAgain = false;

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function currency(value) {
  const selected = CURRENCIES[state?.currency] || CURRENCIES.USD;
  return new Intl.NumberFormat(selected.locale, { style: 'currency', currency: state?.currency || 'USD', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function newId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function getMemberName(id) {
  return state.members.find((member) => member.id === id)?.name || 'Household';
}

function addLoginScreen() {
  const screen = document.createElement('div');
  screen.id = 'loginScreen';
  screen.innerHTML = `
    <form class="login-card" id="loginForm">
      <div class="login-brand"><span class="brand-mark"><span></span><span></span></span><span>finova</span></div>
      <p class="eyebrow">Your household finances</p>
      <h1>Welcome back</h1>
      <p class="login-description">Enter your name to open or create your finance profile. Your dashboard is saved to this server’s Excel workbook.</p>
      <label for="loginName">Your name</label>
      <input id="loginName" name="name" type="text" autocomplete="name" maxlength="80" placeholder="e.g. Alex Johnson" required minlength="2">
      <button class="primary-button" type="submit">Continue</button>
      <p class="login-note">Name-only profiles are for a trusted local device. They do not provide password protection.</p>
      <p class="login-error" id="loginError" role="alert"></p>
    </form>`;
  document.body.append(screen);
  document.querySelector('#loginForm').addEventListener('submit', signIn);
  const session = readSession();
  if (session?.name) document.querySelector('#loginName').value = session.name;
  document.querySelector('#loginName').focus();
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

async function signIn(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const errorElement = document.querySelector('#loginError');
  const name = document.querySelector('#loginName').value.trim();
  button.disabled = true;
  button.textContent = 'Opening profile…';
  errorElement.textContent = '';
  try {
    let legacyData = null;
    try { legacyData = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch { /* ignore invalid old browser data */ }
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ name, legacyData }) });
    state = result.profile;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: state.id, name: state.name }));
    localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state));
    localStorage.removeItem(LEGACY_KEY);
    document.querySelector('#loginScreen').remove();
    startDashboard();
  } catch (error) {
    errorElement.textContent = `${error.message} Start the app using npm start.`;
  } finally {
    if (document.querySelector('#loginForm')) {
      button.disabled = false;
      button.textContent = 'Continue';
    }
  }
}

function queueSave() {
  localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 350);
}

async function saveNow() {
  if (!state) return;
  if (saving) { saveAgain = true; return; }
  saving = true;
  setStorageStatus('Saving to Excel…', 'saving');
  try {
    await api(`/api/users/${encodeURIComponent(state.id)}`, { method: 'PUT', body: JSON.stringify(state) });
    setStorageStatus('Saved to Excel', 'saved');
  } catch (error) {
    console.error(error);
    setStorageStatus('Save failed · retrying', 'failed');
    saveAgain = true;
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      if (!navigator.onLine) setStorageStatus('Offline · changes kept in this browser', 'failed');
      else setTimeout(saveNow, 900);
    }
  }
}

function setStorageStatus(text, status) {
  const element = document.querySelector('#storageStatus');
  if (element) { element.textContent = text; element.dataset.status = status; }
}

function addDashboardFeatures() {
  const actions = document.querySelector('.actions');
  const currencyLabel = document.createElement('label');
  currencyLabel.className = 'currency-control';
  currencyLabel.innerHTML = `<span>Currency</span><select id="currencySelect" aria-label="Display currency">${Object.entries(CURRENCIES).map(([code, details]) => `<option value="${code}">${code} · ${details.name}</option>`).join('')}</select>`;
  actions.insertBefore(currencyLabel, addTransactionButton);
  document.querySelector('#currencySelect').value = state.currency;
  document.querySelector('#currencySelect').addEventListener('change', (event) => { state.currency = event.target.value; renderAll(); queueSave(); });

  const status = document.createElement('span');
  status.id = 'storageStatus';
  status.className = 'storage-status';
  status.textContent = 'Saved to Excel';
  actions.insertBefore(status, addTransactionButton);

  const session = readSession();
  const profileButton = document.querySelector('.profile');
  profileButton.innerHTML = `<span class="avatar" id="profileAvatar"></span><span class="profile-copy"><strong id="profileName"></strong><small>Excel-backed profile</small></span><span class="chevron">⌄</span>`;
  profileButton.setAttribute('aria-label', 'Sign out');
  profileButton.addEventListener('click', () => {
    if (confirm(`Sign out of ${state.name}? Your data remains in the Excel workbook.`)) {
      localStorage.removeItem(SESSION_KEY);
      location.reload();
    }
  });

  const dashboardGrid = document.querySelector('.dashboard-grid');
  const familySection = document.createElement('section');
  familySection.className = 'household-grid';
  familySection.innerHTML = `
    <article class="panel household-panel"><div class="panel-header"><div><h2>Household members</h2><p>Manage people who share this budget</p></div><button class="small-action" id="addMember" type="button">+ Add member</button></div><div class="member-list" id="memberList"></div></article>
    <article class="panel household-panel"><div class="panel-header"><div><h2>Accounts available</h2><p>Cash and bank balances</p></div><button class="small-action" id="addAccount" type="button">+ Add account</button></div><div class="account-list" id="accountList"></div><div class="account-total"><span>Total available</span><strong id="accountTotal"></strong></div></article>
    <article class="panel household-panel investments-panel"><div class="panel-header"><div><h2>Investments</h2><p>Portfolio and monthly contributions</p></div><button class="small-action" id="addInvestment" type="button">+ Add investment</button></div><div class="investment-list" id="investmentList"></div><div class="account-total"><span>Portfolio value</span><strong id="investmentTotal"></strong></div></article>`;
  dashboardGrid.insertAdjacentElement('afterend', familySection);

  const form = document.querySelector('#transactionForm');
  const categories = document.querySelector('#category');
  for (const category of ['SIP', 'EMI', 'Investment']) if (![...categories.options].some((option) => option.value === category)) categories.add(new Option(category, category));
  const fields = [
    ['Member', '<select id="transactionMember" required></select>'],
    ['Pay from / deposit to', '<select id="transactionAccount" required></select>'],
    ['Recurring payment', '<select id="recurrence"><option value="none">One-time</option><option value="monthly">Monthly (SIP / EMI)</option></select>']
  ];
  const submitButton = form.querySelector('button[type="submit"]');
  for (const [title, control] of fields) {
    const label = document.createElement('label');
    label.innerHTML = `${title}${control}`;
    form.insertBefore(label, submitButton);
  }
  document.querySelector('#addMember').addEventListener('click', addMember);
  document.querySelector('#addAccount').addEventListener('click', addAccount);
  document.querySelector('#addInvestment').addEventListener('click', addInvestment);
}

function askAmount(message) {
  const raw = prompt(message, '0');
  if (raw === null) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount)) { alert('Please enter a valid amount.'); return null; }
  return amount;
}

function chooseMember(message) {
  const choices = state.members.map((member, index) => `${index + 1}. ${member.name} (${member.role})`).join('\n');
  const selected = Number(prompt(`${message}\n${choices}\nEnter a number:`, '1'));
  return Number.isInteger(selected) && selected > 0 && selected <= state.members.length ? state.members[selected - 1].id : null;
}

function addMember() {
  const name = prompt('Name of household member:')?.trim();
  if (!name) return;
  const role = prompt('Relationship (Husband, Wife, Partner, Child, etc.):', 'Family member')?.trim() || 'Family member';
  state.members.push({ id: newId('member'), name, role });
  renderAll(); queueSave();
}

function addAccount() {
  if (!state.members.length) return alert('Add a household member first.');
  const name = prompt('Account name (for example: Joint checking):')?.trim();
  if (!name) return;
  const type = prompt('Account type (Checking, Savings, Cash, Credit):', 'Checking')?.trim() || 'Checking';
  const balance = askAmount(`Current balance in ${state.currency}:`);
  if (balance === null) return;
  const ownerId = chooseMember('Who owns this account?');
  if (!ownerId) return;
  state.accounts.push({ id: newId('account'), name, type, ownerId, balance });
  updateBalanceFromAccounts(); renderAll(); queueSave();
}

function addInvestment() {
  if (!state.members.length) return alert('Add a household member first.');
  const name = prompt('Investment name (for example: Nifty 50 SIP):')?.trim();
  if (!name) return;
  const type = prompt('Investment type (Mutual fund, SIP, Stocks, Retirement):', 'SIP')?.trim() || 'Investment';
  const value = askAmount(`Current investment value in ${state.currency}:`);
  if (value === null) return;
  const contribution = askAmount(`Monthly contribution in ${state.currency}:`);
  if (contribution === null) return;
  const ownerId = chooseMember('Who owns this investment?');
  if (!ownerId) return;
  state.investments.push({ id: newId('investment'), name, type, ownerId, value, contribution });
  renderAll(); queueSave();
}

function renderMembers() {
  document.querySelector('#memberList').innerHTML = state.members.map((member) => `
    <div class="household-row"><span class="mini-avatar">${escapeHtml(member.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())}</span><span class="household-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)}</small></span><span class="member-account-count">${state.accounts.filter((account) => account.ownerId === member.id).length} accounts</span></div>`).join('') || '<p class="empty-state">Add a member to start a shared household budget.</p>';
}

function renderAccounts() {
  document.querySelector('#accountList').innerHTML = state.accounts.map((account) => `
    <div class="household-row"><span class="account-symbol">${account.type.toLowerCase().includes('saving') ? '◉' : '▤'}</span><span class="household-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.type)} · ${escapeHtml(getMemberName(account.ownerId))}</small></span><strong class="row-value">${currency(account.balance)}</strong></div>`).join('') || '<p class="empty-state">Add a bank, savings, or cash account.</p>';
  document.querySelector('#accountTotal').textContent = currency(state.accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0));
}

function renderInvestments() {
  document.querySelector('#investmentList').innerHTML = state.investments.map((investment) => `
    <div class="household-row"><span class="investment-symbol">↗</span><span class="household-copy"><strong>${escapeHtml(investment.name)}</strong><small>${escapeHtml(investment.type)} · ${escapeHtml(getMemberName(investment.ownerId))}</small></span><span class="investment-values"><strong>${currency(investment.value)}</strong><small>${currency(investment.contribution)}/mo</small></span></div>`).join('') || '<p class="empty-state">Add SIPs, mutual funds, or other investments.</p>';
  document.querySelector('#investmentTotal').textContent = currency(state.investments.reduce((sum, item) => sum + Number(item.value || 0), 0));
}

function renderTransactionOptions() {
  const memberSelect = document.querySelector('#transactionMember');
  const accountSelect = document.querySelector('#transactionAccount');
  if (!memberSelect || !accountSelect) return;
  const previousMember = memberSelect.value;
  const previousAccount = accountSelect.value;
  memberSelect.innerHTML = state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} · ${escapeHtml(member.role)}</option>`).join('');
  accountSelect.innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} (${currency(account.balance)})</option>`).join('');
  if (state.members.some((item) => item.id === previousMember)) memberSelect.value = previousMember;
  if (state.accounts.some((item) => item.id === previousAccount)) accountSelect.value = previousAccount;
}

function renderTransactions() {
  transactionList.innerHTML = state.transactions.slice(0, 8).map((transaction) => {
    const isIncome = transaction.type === 'income';
    const category = transaction.category;
    const icon = isIncome ? '↗' : category === 'Food' ? '♨' : category === 'Transport' ? '🚕' : category === 'Shopping' ? '🛍' : category === 'SIP' ? '◈' : category === 'EMI' ? '⌂' : '•';
    const iconClass = isIncome ? 'salary' : category.toLowerCase().replace(/[^a-z]/g, '');
    const details = [category, transaction.date, getMemberName(transaction.memberId), transaction.recurrence === 'monthly' ? 'Monthly' : ''].filter(Boolean).join(' · ');
    return `<div class="transaction"><span class="transaction-icon ${iconClass}">${icon}</span><span class="transaction-info"><strong>${escapeHtml(transaction.description)}</strong><small>${escapeHtml(details)}</small></span><span class="transaction-amount ${transaction.type}">${isIncome ? '+' : '−'}${currency(transaction.amount)}</span></div>`;
  }).join('') || '<p class="empty-state">Your transactions will appear here.</p>';
}

function updateBalanceFromAccounts() { state.balance = state.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0); }

function updateSummary() {
  updateBalanceFromAccounts();
  document.querySelector('#totalBalance').textContent = currency(state.balance);
  document.querySelector('#totalIncome').textContent = currency(state.income);
  document.querySelector('#totalExpenses').textContent = currency(state.expenses);
  document.querySelector('#totalSavings').textContent = currency(state.savings);
  const percent = state.budget > 0 ? Math.min(100, Math.round((state.expenses / state.budget) * 100)) : 0;
  document.querySelector('#budgetPercent').textContent = `${percent}%`;
  document.querySelector('#budgetSpent').textContent = currency(state.expenses);
  document.querySelector('.budget-total span').textContent = ` of ${currency(state.budget)}`;
  document.querySelector('#budgetRemaining').textContent = `${currency(Math.max(0, state.budget - state.expenses))} left`;
  document.querySelector('.ring-progress').style.strokeDashoffset = String(452.39 * (1 - percent / 100));
  document.querySelector('h1').textContent = `Good morning, ${state.name}`;
  document.querySelector('#profileName').textContent = state.name;
  document.querySelector('#profileAvatar').textContent = state.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function renderAll() {
  updateSummary();
  renderMembers();
  renderAccounts();
  renderInvestments();
  renderTransactionOptions();
  renderTransactions();
}

function openModal() {
  renderTransactionOptions();
  if (!state.accounts.length) { alert('Add an account before recording a transaction.'); return; }
  modalBackdrop.classList.add('open');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  document.querySelector('#description').focus();
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden', 'true');
  transactionForm.reset();
}

function transactionDate() { return new Date().toISOString().slice(0, 10); }

function startDashboard() {
  appMain.hidden = false;
  sidebar.hidden = false;
  addDashboardFeatures();
  document.querySelector('#currencySelect').value = state.currency;
  renderAll();
  setStorageStatus('Saved to Excel', 'saved');
}

addTransactionButton.addEventListener('click', openModal);
closeModalButton.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
window.addEventListener('beforeunload', () => { if (state) localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state)); });
window.addEventListener('online', () => { if (state) saveNow(); });

transactionForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const type = document.querySelector('#type').value;
  const description = document.querySelector('#description').value.trim();
  const amount = Number(document.querySelector('#amount').value);
  const category = document.querySelector('#category').value;
  const memberId = document.querySelector('#transactionMember').value;
  const accountId = document.querySelector('#transactionAccount').value;
  const recurrence = document.querySelector('#recurrence').value;
  if (!description || !Number.isFinite(amount) || amount <= 0 || !accountId || !memberId) return;
  const account = state.accounts.find((item) => item.id === accountId);
  if (!account) return;
  if (type === 'income') { state.income += amount; state.savings += amount; account.balance += amount; }
  else { state.expenses += amount; state.savings -= amount; account.balance -= amount; }
  state.transactions.unshift({ id: newId('transaction'), description, amount, category, type, memberId, accountId, recurrence, date: transactionDate(), createdAt: new Date().toISOString() });
  renderAll(); queueSave(); closeModal();
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
    item.classList.add('active');
  });
});

function addFeatureStyles() {
  const style = document.createElement('style');
  style.textContent = `
    [hidden]{display:none!important}#loginScreen{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:20px;background:#f6f7f9}.login-card{width:min(440px,100%);padding:32px;border:1px solid #e9ebef;border-radius:16px;background:#fff;box-shadow:0 12px 40px #20232a12}.login-brand{display:flex;align-items:center;gap:10px;margin-bottom:32px;font-family:Manrope,sans-serif;font-size:21px;font-weight:800}.login-card h1{margin:0 0 8px;font-size:26px}.login-description{margin:0 0 22px;color:#7e848d;font-size:13px;line-height:1.6}.login-card label{display:block;margin-bottom:7px;color:#555b64;font-size:12px;font-weight:700}.login-card input{width:100%;height:44px;border:1px solid #e9ebef;border-radius:8px;padding:0 12px;outline:none}.login-card input:focus{border-color:#c6a65d;box-shadow:0 0 0 3px #fff5d9}.login-card .primary-button{width:100%;margin-top:14px}.login-note{margin:16px 0 0;color:#969ba3;font-size:10px;line-height:1.5}.login-error{min-height:16px;margin:10px 0 0;color:#b43e39;font-size:11px}.currency-control{display:flex;align-items:center;gap:7px;color:#777d86;font-size:10px;font-weight:600}.currency-control select{height:38px;max-width:155px;border:1px solid var(--line);border-radius:8px;padding:0 8px;background:#fff;color:#41464d;font-size:10px}.storage-status{color:#7d858b;font-size:10px;white-space:nowrap}.storage-status:before{content:'●';margin-right:5px;color:#38a978}.storage-status[data-status=saving]:before{color:#efb84b}.storage-status[data-status=failed]{color:#b43e39}.storage-status[data-status=failed]:before{color:#dc6b62}.household-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.household-panel{min-height:180px;padding:19px 20px}.investments-panel{grid-column:1/-1}.small-action{border:0;border-radius:7px;background:#fff5d9;color:#9a701e;padding:8px 10px;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer}.member-list,.account-list,.investment-list{display:grid;gap:4px;margin-top:10px}.household-row{min-height:48px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f2f4}.household-row:last-child{border-bottom:0}.mini-avatar,.account-symbol,.investment-symbol{width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:9px;background:#fff5d9;color:#947226;font-size:11px;font-weight:700}.account-symbol{background:#edf3f4;color:#607c82;font-size:17px}.investment-symbol{background:#e8f5ed;color:#48a174;font-size:18px}.household-copy{display:grid;flex:1;min-width:0}.household-copy strong,.row-value,.investment-values strong{overflow:hidden;color:#383d44;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.household-copy small,.investment-values small{margin-top:3px;color:#9297a0;font-size:9px}.member-account-count{color:#8e949c;font-size:9px}.row-value{font-size:10px}.investment-values{display:grid;text-align:right}.account-total{display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:9px;padding-top:10px;color:#858b93;font-size:10px}.account-total strong{color:#383d44;font-size:11px}.empty-state{margin:12px 0;color:#969ba3;font-size:10px}@media(max-width:820px){.household-grid{grid-template-columns:1fr}.investments-panel{grid-column:auto}}@media(max-width:560px){.currency-control span,.storage-status{display:none}.currency-control select{max-width:88px;height:38px}.actions{gap:6px}.household-panel{padding:16px}.small-action{padding:7px}}
  `;
  document.head.append(style);
}

async function initialize() {
  addFeatureStyles();
  appMain.hidden = true;
  sidebar.hidden = true;
  addLoginScreen();
  const session = readSession();
  if (!session?.id) return;
  try {
    const result = await api(`/api/users/${encodeURIComponent(session.id)}`);
    state = result.profile;
    localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state));
    document.querySelector('#loginScreen').remove();
    startDashboard();
  } catch (error) {
    console.warn('Could not restore Excel-backed profile:', error);
    localStorage.removeItem(SESSION_KEY);
  }
}

initialize();
