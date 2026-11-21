const SESSION_KEY = 'finova-excel-session-v1';
const LOCAL_PREFIX = 'finova-excel-profile:';
const LEGACY_KEY = 'finova-dashboard-v2';
const VIEW_KEY = 'finova-household-view-v1';
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
let householdView = 'joint';
let saveTimer;
let retryTimer;
let saving = false;
let saveAgain = false;
let retryDelay = 1500;

function escapeHtml(value) { const element = document.createElement('span'); element.textContent = String(value ?? ''); return element.innerHTML; }
function currency(value) { const code = state?.currency || 'INR'; const selected = CURRENCIES[code] || CURRENCIES.INR; return new Intl.NumberFormat(selected.locale, { style: 'currency', currency: code, maximumFractionDigits: 2 }).format(Number(value) || 0); }
function newId(prefix) { return `${prefix}-${crypto.randomUUID()}`; }
function getMemberName(id) { return state.members.find((member) => member.id === id)?.name || 'Household'; }

function addLoginScreen() {
  const screen = document.createElement('div'); screen.id = 'loginScreen';
  screen.innerHTML = `<form class="login-card" id="loginForm"><div class="login-brand"><span class="brand-mark"><span></span><span></span></span><span>finova</span></div><p class="eyebrow">Your household finances</p><h1>Welcome back</h1><p class="login-description">Enter your name to open or create your finance profile.</p><label for="loginName">Your name</label><input id="loginName" name="name" type="text" autocomplete="name" maxlength="80" placeholder="e.g. Alex Johnson" required minlength="2"><button class="primary-button" type="submit">Continue</button><p class="login-error" id="loginError" role="alert"></p></form>`;
  document.body.append(screen); document.querySelector('#loginForm').addEventListener('submit', signIn);
  const session = readSession(); if (session?.name) document.querySelector('#loginName').value = session.name; document.querySelector('#loginName').focus();
}
function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }

async function api(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } }); }
  catch { throw new Error('Cannot reach the local server. Run start.bat and keep its window open.'); }
  const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`); return body;
}

async function signIn(event) {
  event.preventDefault(); const button = event.currentTarget.querySelector('button[type="submit"]'); const errorElement = document.querySelector('#loginError'); const name = document.querySelector('#loginName').value.trim();
  button.disabled = true; button.textContent = 'Opening profile…'; errorElement.textContent = '';
  try {
    let legacyData = null; try { legacyData = JSON.parse(localStorage.getItem(LEGACY_KEY)); } catch {}
    const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ name, legacyData }) });
    state = result.profile; if (!state.currency) state.currency = 'INR';
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id: state.id, name: state.name })); localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state)); localStorage.removeItem(LEGACY_KEY);
    document.querySelector('#loginScreen').remove(); startDashboard(result.existing);
  } catch (error) { errorElement.textContent = error.message; }
  finally { if (document.querySelector('#loginForm')) { button.disabled = false; button.textContent = 'Continue'; } }
}

function queueSave() {
  localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state)); clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400);
}
async function saveNow() {
  if (!state) return; if (saving) { saveAgain = true; return; } saving = true; setStorageStatus('Saving to Excel…', 'saving');
  try { await api(`/api/users/${encodeURIComponent(state.id)}`, { method: 'PUT', body: JSON.stringify(state) }); retryDelay = 1500; setStorageStatus('Saved to Excel', 'saved'); }
  catch (error) { console.error(error); setStorageStatus(`Save failed: ${error.message}`, 'failed'); saveAgain = true; }
  finally { saving = false; if (saveAgain) { saveAgain = false; clearTimeout(retryTimer); retryTimer = setTimeout(saveNow, retryDelay); retryDelay = Math.min(retryDelay * 2, 30000); } }
}
function setStorageStatus(text, status) { const element = document.querySelector('#storageStatus'); if (element) { element.textContent = text; element.dataset.status = status; } }

function filteredMemberIds() {
  if (householdView === 'joint') return null;
  return state.members.filter((member) => member.id === householdView).map((member) => member.id);
}
function visibleAccounts() { const ids = filteredMemberIds(); return ids ? state.accounts.filter((account) => ids.includes(account.ownerId) || ['joint', 'Joint', 'Household'].includes(account.type)) : state.accounts; }
function visibleInvestments() { const ids = filteredMemberIds(); return ids ? state.investments.filter((investment) => ids.includes(investment.ownerId) || ['joint', 'Joint', 'Household'].includes(investment.type)) : state.investments; }
function visibleTransactions() { const ids = filteredMemberIds(); return ids ? state.transactions.filter((transaction) => ids.includes(transaction.memberId)) : state.transactions; }

function addDashboardFeatures() {
  const actions = document.querySelector('.actions');
  const viewLabel = document.createElement('label'); viewLabel.className = 'household-view-control';
  viewLabel.innerHTML = `<span>View</span><select id="householdView" aria-label="Household view"><option value="joint">Joint</option></select>`;
  actions.insertBefore(viewLabel, addTransactionButton);
  const viewSelect = document.querySelector('#householdView');
  for (const member of state.members) viewSelect.add(new Option(member.name, member.id));
  householdView = localStorage.getItem(VIEW_KEY) || 'joint'; if (!['joint', ...state.members.map((member) => member.id)].includes(householdView)) householdView = 'joint';
  viewSelect.value = householdView; viewSelect.addEventListener('change', (event) => { householdView = event.target.value; localStorage.setItem(VIEW_KEY, householdView); renderAll(); });

  const currencyLabel = document.createElement('label'); currencyLabel.className = 'currency-control';
  currencyLabel.innerHTML = `<span>Currency</span><select id="currencySelect" aria-label="Display currency">${Object.entries(CURRENCIES).map(([code, details]) => `<option value="${code}">${code} · ${details.name}</option>`).join('')}</select>`;
  actions.insertBefore(currencyLabel, addTransactionButton); document.querySelector('#currencySelect').value = state.currency;
  document.querySelector('#currencySelect').addEventListener('change', (event) => { state.currency = event.target.value; renderAll(); queueSave(); });

  const status = document.createElement('span'); status.id = 'storageStatus'; status.className = 'storage-status'; status.textContent = 'Loaded from Excel'; actions.insertBefore(status, addTransactionButton);
  const profileButton = document.querySelector('.profile');
  profileButton.innerHTML = `<span class="avatar" id="profileAvatar"></span><span class="profile-copy"><strong id="profileName"></strong><small>Excel-backed profile</small></span><span class="chevron">⌄</span>`;
  profileButton.setAttribute('aria-label', 'Sign out'); profileButton.addEventListener('click', () => { if (confirm(`Sign out of ${state.name}?`)) { localStorage.removeItem(SESSION_KEY); location.reload(); } });

  const dashboardGrid = document.querySelector('.dashboard-grid');
  const setupPanel = document.createElement('section'); setupPanel.className = 'monthly-panel';
  setupPanel.innerHTML = `<article class="panel monthly-setup"><div class="panel-header"><div><h2>Monthly setup</h2><p>Starting balance + salaries − recurring expenses − investments</p></div><button class="small-action" id="runMonthlySetup" type="button">Run month setup</button></div><div class="monthly-summary" id="monthlySummary"></div></article>`;
  dashboardGrid.insertAdjacentElement('beforebegin', setupPanel);
  document.querySelector('#runMonthlySetup').addEventListener('click', openMonthlySetup);

  const familySection = document.createElement('section'); familySection.className = 'household-grid';
  familySection.innerHTML = `<article class="panel household-panel"><div class="panel-header"><div><h2>Household members</h2><p>Husband, wife and dependants</p></div><button class="small-action" id="addMember" type="button">+ Add member</button></div><div id="memberList"></div></article><article class="panel household-panel"><div class="panel-header"><div><h2>Accounts</h2><p>Joint and individual balances</p></div><button class="small-action" id="addAccount" type="button">+ Add account</button></div><div id="accountList"></div><div class="account-total"><span>Total available</span><strong id="accountTotal"></strong></div></article><article class="panel household-panel investments-panel"><div class="panel-header"><div><h2>Investments</h2><p>Joint and individual investments</p></div><button class="small-action" id="addInvestment" type="button">+ Add investment</button></div><div id="investmentList"></div><div class="account-total"><span>Portfolio value</span><strong id="investmentTotal"></strong></div></article>`;
  dashboardGrid.insertAdjacentElement('afterend', familySection);
  document.querySelector('#addMember').addEventListener('click', addMember); document.querySelector('#addAccount').addEventListener('click', addAccount); document.querySelector('#addInvestment').addEventListener('click', addInvestment);

  const form = document.querySelector('#transactionForm'); const categories = document.querySelector('#category');
  for (const category of ['Salary', 'EMI', 'Rent', 'Bills', 'Credit Card', 'SIP', 'EMI', 'Investment']) if (![...categories.options].some((option) => option.value === category)) categories.add(new Option(category, category));
  const fields = [['Member', '<select id="transactionMember" required></select>'], ['Account', '<select id="transactionAccount" required></select>'], ['Ownership', '<select id="transactionOwnership"><option value="joint">Joint</option><option value="individual">Individual</option></select>'], ['Recurring', '<select id="recurrence"><option value="none">One-time</option><option value="monthly">Monthly</option></select>']];
  const submitButton = form.querySelector('button[type="submit"]');
  for (const [title, control] of fields) { const label = document.createElement('label'); label.innerHTML = `${title}${control}`; form.insertBefore(label, submitButton); }
}

function askAmount(message) { const raw = prompt(message, '0'); if (raw === null) return null; const amount = Number(raw); if (!Number.isFinite(amount)) { alert('Please enter a valid amount.'); return null; } return amount; }
function chooseMember(message) { const choices = state.members.map((member, index) => `${index + 1}. ${member.name} (${member.role})`).join('\n'); const selected = Number(prompt(`${message}\n${choices}\nEnter a number:`, '1')); return Number.isInteger(selected) && selected > 0 && selected <= state.members.length ? state.members[selected - 1].id : null; }

function addMember() { const name = prompt('Name of household member:')?.trim(); if (!name) return; const role = prompt('Relationship (Husband, Wife, Partner, Child):', 'Family member')?.trim() || 'Family member'; state.members.push({ id: newId('member'), name, role }); renderAll(); queueSave(); }
function addAccount() { if (!state.members.length) return alert('Add a household member first.'); const name = prompt('Account name:', 'Joint checking')?.trim(); if (!name) return; const type = prompt('Account type (Joint, Checking, Savings, Cash, Credit):', 'Joint')?.trim() || 'Joint'; const balance = askAmount(`Current balance in ${state.currency}:`); if (balance === null) return; const ownerId = chooseMember('Who owns this account? Choose a member; Joint accounts can be linked by typing Joint at the ownership prompt.'); if (!ownerId) return; state.accounts.push({ id: newId('account'), name, type, ownerId, balance }); renderAll(); queueSave(); }
function addInvestment() { if (!state.members.length) return alert('Add a household member first.'); const name = prompt('Investment name:', 'Nifty 50 SIP')?.trim(); if (!name) return; const type = prompt('Investment type (Joint, SIP, Mutual fund, Stocks):', 'Joint')?.trim() || 'Joint'; const value = askAmount(`Current value in ${state.currency}:`); if (value === null) return; const contribution = askAmount(`Monthly contribution in ${state.currency}:`); if (contribution === null) return; const ownerId = chooseMember('Who owns this investment?'); if (!ownerId) return; state.investments.push({ id: newId('investment'), name, type, ownerId, value, contribution }); renderAll(); queueSave(); }

function openMonthlySetup() {
  if (!state.accounts.length) { alert('Add at least one account first.'); return; }
  const month = prompt('Month (YYYY-MM):', new Date().toISOString().slice(0, 7)); if (!month || !/^\d{4}-\d{2}$/.test(month)) return;
  const existingSetup = state.transactions.find((transaction) => transaction.description === `Monthly setup ${month}`);
  if (existingSetup && !confirm(`A setup for ${month} already exists. Replace its monthly transactions?`)) return;
  const memberId = chooseMember('Choose the primary salary owner (use the joint account for shared income):'); if (!memberId) return;
  const accountId = chooseMemberAccount('Choose the bank account to receive salary and pay expenses'); if (!accountId) return;
  const salary = askAmount('Enter total salary for this month'); if (salary === null) return;
  const fixedExpenses = askAmount('Enter EMI + rent + bills + credit card total'); if (fixedExpenses === null) return;
  const investment = askAmount('Enter investment amount for this month'); if (investment === null) return;
  state.transactions = state.transactions.filter((transaction) => !transaction.description?.startsWith(`Monthly setup ${month}`));
  const date = `${month}-01`;
  const account = state.accounts.find((item) => item.id === accountId); if (!account) return;
  const entries = [{ description: `Monthly setup ${month}: Salary`, category: 'Salary', amount: salary, type: 'income' }, { description: `Monthly setup ${month}: Expenses`, category: 'EMI/Bills/Rent/Credit Card', amount: fixedExpenses, type: 'expense' }, { description: `Monthly setup ${month}: Investment`, category: 'Investment', amount: investment, type: 'expense' }];
  for (const entry of entries) { account.balance += entry.type === 'income' ? entry.amount : -entry.amount; state.income += entry.type === 'income' ? entry.amount : 0; state.expenses += entry.type === 'expense' ? entry.amount : 0; state.savings = state.income - state.expenses; state.transactions.unshift({ id: newId('transaction'), description: entry.description, category: entry.category, amount: entry.amount, type: entry.type, date, memberId, accountId, recurrence: 'monthly', createdAt: new Date().toISOString() }); }
  for (const investmentItem of state.investments) if (investmentItem.ownerId === memberId || ['joint', 'Joint', 'Household'].includes(investmentItem.type)) investmentItem.value += investmentItem.contribution || 0;
  renderAll(); queueSave(); alert(`Monthly setup completed for ${month}.`);
}
function chooseMemberAccount(message) { const choices = state.accounts.map((account, index) => `${index + 1}. ${account.name} (${currency(account.balance)})`).join('\n'); const selected = Number(prompt(`${message}\n${choices}\nEnter a number:`, '1')); return Number.isInteger(selected) && selected > 0 && selected <= state.accounts.length ? state.accounts[selected - 1].id : null; }

function renderMembers() { const ids = filteredMemberIds(); const members = ids ? state.members.filter((member) => ids.includes(member.id)) : state.members; document.querySelector('#memberList').innerHTML = members.map((member) => `<div class="household-row"><span class="mini-avatar">${escapeHtml(member.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())}</span><span class="household-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)}</small></span></div>`).join('') || '<p class="empty-state">Add a member.</p>'; }
function renderAccounts() { const accounts = visibleAccounts(); document.querySelector('#accountList').innerHTML = accounts.map((account) => `<div class="household-row"><span class="account-symbol">${String(account.type).toLowerCase().includes('saving') ? '◉' : '▤'}</span><span class="household-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.type)} · ${escapeHtml(getMemberName(account.ownerId))}</small></span><strong>${currency(account.balance)}</strong></div>`).join('') || '<p class="empty-state">No accounts in this view.</p>'; document.querySelector('#accountTotal').textContent = currency(accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0)); }
function renderInvestments() { const investments = visibleInvestments(); document.querySelector('#investmentList').innerHTML = investments.map((investment) => `<div class="household-row"><span class="investment-symbol">↗</span><span class="household-copy"><strong>${escapeHtml(investment.name)}</strong><small>${escapeHtml(investment.type)} · ${escapeHtml(getMemberName(investment.ownerId))}</small></span><span class="investment-values"><strong>${currency(investment.value)}</strong><small>${currency(investment.contribution)}/mo</small></span></div>`).join('') || '<p class="empty-state">No investments in this view.</p>'; document.querySelector('#investmentTotal').textContent = currency(investments.reduce((sum, item) => sum + Number(item.value || 0), 0)); }

function renderTransactionOptions() {
  const memberSelect = document.querySelector('#transactionMember'); const accountSelect = document.querySelector('#transactionAccount'); if (!memberSelect || !accountSelect) return;
  memberSelect.innerHTML = state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} · ${escapeHtml(member.role)}</option>`).join('');
  accountSelect.innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} (${currency(account.balance)})</option>`).join('');
}
function renderTransactions() { const transactions = visibleTransactions(); transactionList.innerHTML = transactions.slice(0, 12).map((transaction) => `<div class="transaction"><span class="transaction-info"><strong>${escapeHtml(transaction.description)}</strong><small>${escapeHtml(transaction.category)} · ${escapeHtml(transaction.date)} · ${escapeHtml(getMemberName(transaction.memberId))}</small></span><span class="transaction-amount ${transaction.type}">${transaction.type === 'income' ? '+' : '−'}${currency(transaction.amount)}</span></div>`).join('') || '<p class="empty-state">No transactions in this view.</p>'; }

function renderMonthlySummary() {
  const accounts = visibleAccounts(); const investments = visibleInvestments(); const transactions = visibleTransactions();
  const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const element = document.querySelector('#monthlySummary'); if (element) element.innerHTML = `<div><span>Starting/available accounts</span><strong>${currency(accounts.reduce((sum, item) => sum + Number(item.balance || 0), 0))}</strong></div><div><span>Salary</span><strong>${currency(income)}</strong></div><div><span>Fixed and monthly expenses</span><strong>${currency(expenses)}</strong></div><div><span>Investments</span><strong>${currency(investments.reduce((sum, item) => sum + Number(item.contribution || 0), 0))}</strong></div>`;
}

function updateSummary() {
  const accounts = visibleAccounts(); const transactions = visibleTransactions();
  const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const balance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  document.querySelector('#totalBalance').textContent = currency(balance); document.querySelector('#totalIncome').textContent = currency(income); document.querySelector('#totalExpenses').textContent = currency(expenses); document.querySelector('#totalSavings').textContent = currency(Math.max(0, balance - expenses));
  const percent = state.budget > 0 ? Math.min(100, Math.round((expenses / state.budget) * 100)) : 0; document.querySelector('#budgetPercent').textContent = `${percent}%`; document.querySelector('#budgetSpent').textContent = currency(expenses); document.querySelector('.budget-total span').textContent = ` of ${currency(state.budget)}`; document.querySelector('#budgetRemaining').textContent = `${currency(Math.max(0, state.budget - expenses))} left`; document.querySelector('.ring-progress').style.strokeDashoffset = String(452.39 * (1 - percent / 100));
  document.querySelector('h1').textContent = householdView === 'joint' ? `Good morning, ${state.name}` : `Good morning, ${getMemberName(householdView)}`;
  document.querySelector('#profileName').textContent = state.name;
}

function renderAll() { updateSummary(); renderMonthlySummary(); renderMembers(); renderAccounts(); renderInvestments(); renderTransactionOptions(); renderTransactions(); }
function openModal() { renderTransactionOptions(); if (!state.accounts.length) { alert('Add an account before recording a transaction.'); return; } modalBackdrop.classList.add('open'); modalBackdrop.setAttribute('aria-hidden', 'false'); document.querySelector('#description').focus(); }
function closeModal() { modalBackdrop.classList.remove('open'); modalBackdrop.setAttribute('aria-hidden', 'true'); transactionForm.reset(); }
function transactionDate() { return new Date().toISOString().slice(0, 10); }

function startDashboard(existing = true) { appMain.hidden = false; sidebar.hidden = false; addDashboardFeatures(); document.querySelector('#currencySelect').value = state.currency || 'INR'; renderAll(); setStorageStatus(existing ? 'Loaded existing data from Excel' : 'New profile saved to Excel', 'saved'); }

addTransactionButton.addEventListener('click', openModal); closeModalButton.addEventListener('click', closeModal); modalBackdrop.addEventListener('click', (event) => { if (event.target === modalBackdrop) closeModal(); }); document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); }); window.addEventListener('beforeunload', () => { if (state) localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state)); }); window.addEventListener('online', () => { if (state) saveNow(); });

transactionForm.addEventListener('submit', (event) => {
  event.preventDefault(); const type = document.querySelector('#type').value; const description = document.querySelector('#description').value.trim(); const amount = Number(document.querySelector('#amount').value); const category = document.querySelector('#category').value; const memberId = document.querySelector('#transactionMember').value; const accountId = document.querySelector('#transactionAccount').value; const ownership = document.querySelector('#transactionOwnership').value; const recurrence = document.querySelector('#recurrence').value;
  if (!description || !Number.isFinite(amount) || amount <= 0 || !accountId || !memberId) return; const account = state.accounts.find((item) => item.id === accountId); if (!account) return;
  if (type === 'income') { account.balance += amount; state.income += amount; state.savings += amount; } else { account.balance -= amount; state.expenses += amount; state.savings -= amount; }
  if (ownership === 'joint' && account.type !== 'Joint') account.type = 'Joint';
  state.transactions.unshift({ id: newId('transaction'), description, amount, category, type, memberId, accountId, recurrence, date: transactionDate(), createdAt: new Date().toISOString() });
  renderAll(); queueSave(); closeModal();
});

function addFeatureStyles() { const style = document.createElement('style'); style.textContent = `[hidden]{display:none!important}.household-view-control,.currency-control{display:flex;align-items:center;gap:7px;font-size:10px;color:#777d86}.household-view-control select,.currency-control select{height:38px;max-width:155px;border:1px solid #e9ebef;border-radius:8px;padding:0 8px;background:#fff}.storage-status{max-width:220px;font-size:10px;color:#7d858b}.storage-status:before{content:'●';color:#38a978;margin-right:5px}.storage-status[data-status=failed]{color:#b43e39}.monthly-panel{margin:16px 0}.monthly-setup{min-height:118px}.monthly-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.monthly-summary div{display:grid;gap:5px;padding:10px;border-radius:8px;background:#f8f8f8}.monthly-summary span{font-size:9px;color:#8b9099}.monthly-summary strong{font-size:12px}.household-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}.household-panel{min-height:180px}.investments-panel{grid-column:1/-1}.small-action{border:0;border-radius:7px;background:#fff5d9;color:#9a701e;padding:8px 10px;font-size:10px;font-weight:700;cursor:pointer}.household-row{min-height:48px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f2f4}.household-row:last-child{border-bottom:0}.mini-avatar,.account-symbol,.investment-symbol{width:32px;height:32px;display:grid;place-items:center;border-radius:9px;background:#fff5d9;color:#947226}.household-copy{display:grid;flex:1}.household-copy strong{font-size:11px}.household-copy small{margin-top:3px;color:#9297a0;font-size:9px}.account-total{display:flex;justify-content:space-between;border-top:1px solid #e9ebef;margin-top:9px;padding-top:10px;font-size:10px}.investment-values{display:grid;text-align:right}.empty-state{color:#969ba3;font-size:10px}.login-card{width:min(440px,100%);padding:32px;border:1px solid #e9ebef;border-radius:16px;background:#fff}.login-card input{width:100%;height:44px;border:1px solid #e9ebef;border-radius:8px;padding:0 12px}.login-error{color:#b43e39;font-size:11px}@media(max-width:820px){.monthly-summary{grid-template-columns:repeat(2,1fr)}.household-grid{grid-template-columns:1fr}.investments-panel{grid-column:auto}}@media(max-width:560px){.household-view-control span,.currency-control span,.storage-status{display:none}.household-view-control select,.currency-control select{max-width:88px}.monthly-summary{grid-template-columns:1fr}}`; document.head.append(style); }

async function initialize() { addFeatureStyles(); appMain.hidden = true; sidebar.hidden = true; addLoginScreen(); const session = readSession(); if (!session?.id) return; try { const result = await api(`/api/users/${encodeURIComponent(session.id)}`); state = result.profile; if (!state.currency) state.currency = 'INR'; localStorage.setItem(`${LOCAL_PREFIX}${state.id}`, JSON.stringify(state)); document.querySelector('#loginScreen').remove(); startDashboard(true); } catch (error) { localStorage.removeItem(SESSION_KEY); console.warn(error); } }
initialize();
