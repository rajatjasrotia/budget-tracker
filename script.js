const STORAGE_KEY = 'finova-dashboard-v2';
const CURRENCIES = {
  USD: { locale: 'en-US', name: 'US Dollar' },
  INR: { locale: 'en-IN', name: 'Indian Rupee' },
  EUR: { locale: 'de-DE', name: 'Euro' },
  GBP: { locale: 'en-GB', name: 'British Pound' },
  CAD: { locale: 'en-CA', name: 'Canadian Dollar' },
  AUD: { locale: 'en-AU', name: 'Australian Dollar' },
  AED: { locale: 'en-AE', name: 'UAE Dirham' }
};

const initialData = {
  currency: 'USD',
  balance: 24562,
  income: 8420,
  expenses: 3284,
  savings: 5136,
  budget: 5300,
  members: [
    { id: 'member-alex', name: 'Alex Johnson', role: 'You' },
    { id: 'member-jamie', name: 'Jamie Johnson', role: 'Spouse' }
  ],
  accounts: [
    { id: 'account-checking', name: 'Everyday checking', type: 'Checking', ownerId: 'member-alex', balance: 12562 },
    { id: 'account-savings', name: 'Family savings', type: 'Savings', ownerId: 'member-jamie', balance: 12000 }
  ],
  investments: [
    { id: 'investment-index', name: 'Index fund', type: 'Mutual fund', ownerId: 'member-alex', value: 8200, contribution: 250 },
    { id: 'investment-retirement', name: 'Retirement account', type: 'Retirement', ownerId: 'member-jamie', value: 15400, contribution: 400 }
  ],
  transactions: [
    { id: 't1', description: 'Apple Store', category: 'Shopping', amount: 129, type: 'expense', date: 'Jun 24', memberId: 'member-alex', accountId: 'account-checking' },
    { id: 't2', description: 'Salary deposit', category: 'Salary', amount: 4200, type: 'income', date: 'Jun 23', memberId: 'member-alex', accountId: 'account-checking' },
    { id: 't3', description: 'Blue Bottle Coffee', category: 'Food', amount: 18.5, type: 'expense', date: 'Jun 22', memberId: 'member-jamie', accountId: 'account-checking' },
    { id: 't4', description: 'Uber', category: 'Transport', amount: 32.8, type: 'expense', date: 'Jun 21', memberId: 'member-alex', accountId: 'account-checking' }
  ]
};

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.members) && Array.isArray(saved.accounts)) {
      return { ...initialData, ...saved };
    }
  } catch (error) {
    console.warn('Could not load saved dashboard data:', error);
  }
  return structuredClone(initialData);
}

const state = loadData();
const addTransactionButton = document.querySelector('#addTransaction');
const modalBackdrop = document.querySelector('#modalBackdrop');
const closeModalButton = document.querySelector('#closeModal');
const transactionForm = document.querySelector('#transactionForm');
const transactionList = document.querySelector('#transactionList');

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currency(value) {
  const selected = CURRENCIES[state.currency] || CURRENCIES.USD;
  return new Intl.NumberFormat(selected.locale, {
    style: 'currency',
    currency: state.currency,
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function getMemberName(id) {
  return state.members.find((member) => member.id === id)?.name || 'Household';
}

function updateBalanceFromAccounts() {
  state.balance = state.accounts.reduce((total, account) => total + Number(account.balance || 0), 0);
}

function addDashboardFeatures() {
  const actions = document.querySelector('.actions');
  const currencyLabel = document.createElement('label');
  currencyLabel.className = 'currency-control';
  currencyLabel.innerHTML = `<span>Currency</span><select id="currencySelect" aria-label="Display currency">${Object.entries(CURRENCIES).map(([code, details]) => `<option value="${code}">${code} · ${details.name}</option>`).join('')}</select>`;
  actions.insertBefore(currencyLabel, addTransactionButton);
  document.querySelector('#currencySelect').value = state.currency;
  document.querySelector('#currencySelect').addEventListener('change', (event) => {
    state.currency = event.target.value;
    saveData();
    renderAll();
  });

  const dashboardGrid = document.querySelector('.dashboard-grid');
  const familySection = document.createElement('section');
  familySection.className = 'household-grid';
  familySection.innerHTML = `
    <article class="panel household-panel">
      <div class="panel-header"><div><h2>Household members</h2><p>Manage people who share this budget</p></div><button class="small-action" id="addMember" type="button">+ Add member</button></div>
      <div class="member-list" id="memberList"></div>
    </article>
    <article class="panel household-panel">
      <div class="panel-header"><div><h2>Accounts available</h2><p>Cash and bank balances</p></div><button class="small-action" id="addAccount" type="button">+ Add account</button></div>
      <div class="account-list" id="accountList"></div>
      <div class="account-total"><span>Total available</span><strong id="accountTotal"></strong></div>
    </article>
    <article class="panel household-panel investments-panel">
      <div class="panel-header"><div><h2>Investments</h2><p>Portfolio and monthly contributions</p></div><button class="small-action" id="addInvestment" type="button">+ Add investment</button></div>
      <div class="investment-list" id="investmentList"></div>
      <div class="account-total"><span>Portfolio value</span><strong id="investmentTotal"></strong></div>
    </article>`;
  dashboardGrid.insertAdjacentElement('afterend', familySection);

  const form = document.querySelector('#transactionForm');
  const categorySelect = document.querySelector('#category');
  for (const category of ['SIP', 'EMI', 'Investment']) {
    if (![...categorySelect.options].some((option) => option.value === category)) {
      categorySelect.add(new Option(category, category));
    }
  }
  const memberField = document.createElement('label');
  memberField.innerHTML = 'Member<select id="transactionMember" required></select>';
  const accountField = document.createElement('label');
  accountField.innerHTML = 'Pay from / deposit to<select id="transactionAccount" required></select>';
  const recurringField = document.createElement('label');
  recurringField.className = 'recurring-field';
  recurringField.innerHTML = 'Recurring payment<select id="recurrence"><option value="none">One-time</option><option value="monthly">Monthly (SIP / EMI)</option></select>';
  const submitButton = form.querySelector('button[type="submit"]');
  form.insertBefore(memberField, submitButton);
  form.insertBefore(accountField, submitButton);
  form.insertBefore(recurringField, submitButton);

  document.querySelector('#addMember').addEventListener('click', addMember);
  document.querySelector('#addAccount').addEventListener('click', addAccount);
  document.querySelector('#addInvestment').addEventListener('click', addInvestment);
}

function addMember() {
  const name = window.prompt('Name of household member:');
  if (!name?.trim()) return;
  const role = window.prompt('Relationship (for example: Husband, Wife, Partner, Child):', 'Family member');
  const member = { id: `member-${crypto.randomUUID()}`, name: name.trim(), role: (role || 'Family member').trim() };
  state.members.push(member);
  saveData();
  renderAll();
}

function addAccount() {
  if (!state.members.length) return window.alert('Add a household member first.');
  const name = window.prompt('Account name (for example: Joint checking):');
  if (!name?.trim()) return;
  const type = window.prompt('Account type (Checking, Savings, Cash, Credit):', 'Checking');
  const amountText = window.prompt(`Current balance in ${state.currency}:`, '0');
  if (amountText === null || !Number.isFinite(Number(amountText))) return;
  const ownerId = chooseMember('Who owns this account?');
  if (!ownerId) return;
  state.accounts.push({ id: `account-${crypto.randomUUID()}`, name: name.trim(), type: (type || 'Checking').trim(), ownerId, balance: Number(amountText) });
  updateBalanceFromAccounts();
  saveData();
  renderAll();
}

function addInvestment() {
  if (!state.members.length) return window.alert('Add a household member first.');
  const name = window.prompt('Investment name (for example: Nifty 50 SIP):');
  if (!name?.trim()) return;
  const type = window.prompt('Investment type (Mutual fund, SIP, Stocks, Retirement):', 'SIP');
  const valueText = window.prompt(`Current investment value in ${state.currency}:`, '0');
  if (valueText === null || !Number.isFinite(Number(valueText))) return;
  const contributionText = window.prompt(`Monthly contribution in ${state.currency}:`, '0');
  if (contributionText === null || !Number.isFinite(Number(contributionText))) return;
  const ownerId = chooseMember('Who owns this investment?');
  if (!ownerId) return;
  state.investments.push({ id: `investment-${crypto.randomUUID()}`, name: name.trim(), type: (type || 'Investment').trim(), ownerId, value: Number(valueText), contribution: Number(contributionText) });
  saveData();
  renderAll();
}

function chooseMember(message) {
  const choices = state.members.map((member, index) => `${index + 1}. ${member.name} (${member.role})`).join('\n');
  const selected = Number(window.prompt(`${message}\n${choices}\nEnter a number:`, '1'));
  return Number.isInteger(selected) && selected > 0 && selected <= state.members.length ? state.members[selected - 1].id : null;
}

function renderMembers() {
  const list = document.querySelector('#memberList');
  list.innerHTML = state.members.map((member) => `
    <div class="household-row">
      <span class="mini-avatar">${escapeHtml(member.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase())}</span>
      <span class="household-copy"><strong>${escapeHtml(member.name)}</strong><small>${escapeHtml(member.role)}</small></span>
      <span class="member-account-count">${state.accounts.filter((account) => account.ownerId === member.id).length} accounts</span>
    </div>`).join('') || '<p class="empty-state">Add a member to start a shared household budget.</p>';
}

function renderAccounts() {
  const list = document.querySelector('#accountList');
  list.innerHTML = state.accounts.map((account) => `
    <div class="household-row">
      <span class="account-symbol">${account.type.toLowerCase().includes('saving') ? '◉' : '▤'}</span>
      <span class="household-copy"><strong>${escapeHtml(account.name)}</strong><small>${escapeHtml(account.type)} · ${escapeHtml(getMemberName(account.ownerId))}</small></span>
      <strong class="row-value">${currency(account.balance)}</strong>
    </div>`).join('') || '<p class="empty-state">Add a bank, savings, or cash account.</p>';
  document.querySelector('#accountTotal').textContent = currency(state.accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0));
}

function renderInvestments() {
  const list = document.querySelector('#investmentList');
  list.innerHTML = state.investments.map((investment) => `
    <div class="household-row">
      <span class="investment-symbol">↗</span>
      <span class="household-copy"><strong>${escapeHtml(investment.name)}</strong><small>${escapeHtml(investment.type)} · ${escapeHtml(getMemberName(investment.ownerId))}</small></span>
      <span class="investment-values"><strong>${currency(investment.value)}</strong><small>${currency(investment.contribution)}/mo</small></span>
    </div>`).join('') || '<p class="empty-state">Add SIPs, mutual funds, or other investments.</p>';
  document.querySelector('#investmentTotal').textContent = currency(state.investments.reduce((sum, investment) => sum + Number(investment.value || 0), 0));
}

function renderTransactionOptions() {
  const memberSelect = document.querySelector('#transactionMember');
  const accountSelect = document.querySelector('#transactionAccount');
  const previousMember = memberSelect.value;
  const previousAccount = accountSelect.value;
  memberSelect.innerHTML = state.members.map((member) => `<option value="${escapeHtml(member.id)}">${escapeHtml(member.name)} · ${escapeHtml(member.role)}</option>`).join('');
  accountSelect.innerHTML = state.accounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)} (${currency(account.balance)})</option>`).join('');
  if (state.members.some((member) => member.id === previousMember)) memberSelect.value = previousMember;
  if (state.accounts.some((account) => account.id === previousAccount)) accountSelect.value = previousAccount;
}

function renderTransactions() {
  transactionList.innerHTML = state.transactions.slice(0, 8).map((transaction) => {
    const isIncome = transaction.type === 'income';
    const icon = isIncome ? '↗' : transaction.category === 'Food' ? '♨' : transaction.category === 'Transport' ? '🚕' : transaction.category === 'Shopping' ? '🛍' : transaction.category === 'SIP' ? '◈' : transaction.category === 'EMI' ? '⌂' : '•';
    const iconClass = isIncome ? 'salary' : transaction.category.toLowerCase().replace(/[^a-z]/g, '');
    return `<div class="transaction"><span class="transaction-icon ${iconClass}">${icon}</span><span class="transaction-info"><strong>${escapeHtml(transaction.description)}</strong><small>${escapeHtml(transaction.category)} · ${escapeHtml(transaction.date)} · ${escapeHtml(getMemberName(transaction.memberId))}${transaction.recurrence === 'monthly' ? ' · Monthly' : ''}</small></span><span class="transaction-amount ${transaction.type}">${isIncome ? '+' : '−'}${currency(transaction.amount)}</span></div>`;
  }).join('');
}

function updateSummary() {
  updateBalanceFromAccounts();
  document.querySelector('#totalBalance').textContent = currency(state.balance);
  document.querySelector('#totalIncome').textContent = currency(state.income);
  document.querySelector('#totalExpenses').textContent = currency(state.expenses);
  document.querySelector('#totalSavings').textContent = currency(state.savings);
  const percent = Math.min(100, Math.round((state.expenses / state.budget) * 100));
  document.querySelector('#budgetPercent').textContent = `${percent}%`;
  document.querySelector('#budgetSpent').textContent = currency(state.expenses);
  document.querySelector('.budget-total span').textContent = ` of ${currency(state.budget)}`;
  document.querySelector('#budgetRemaining').textContent = `${currency(Math.max(0, state.budget - state.expenses))} left`;
  document.querySelector('.ring-progress').style.strokeDashoffset = String(452.39 * (1 - percent / 100));
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
  modalBackdrop.classList.add('open');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  document.querySelector('#description').focus();
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden', 'true');
  transactionForm.reset();
}

function transactionDate() {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date());
}

addTransactionButton.addEventListener('click', openModal);
closeModalButton.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (event) => {
  if (event.target === modalBackdrop) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModal();
});

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
  if (type === 'income') {
    state.income += amount;
    state.savings += amount;
    account.balance += amount;
  } else {
    state.expenses += amount;
    state.savings -= amount;
    account.balance -= amount;
  }
  state.transactions.unshift({
    id: `transaction-${crypto.randomUUID()}`,
    description,
    amount,
    category,
    type,
    memberId,
    accountId,
    recurrence,
    date: transactionDate()
  });
  saveData();
  renderAll();
  closeModal();
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
    .currency-control{display:flex;align-items:center;gap:7px;color:#777d86;font-size:10px;font-weight:600}
    .currency-control select{height:38px;max-width:155px;border:1px solid var(--line);border-radius:8px;padding:0 8px;background:#fff;color:#41464d;font-size:10px}
    .household-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
    .household-panel{min-height:180px;padding:19px 20px}.investments-panel{grid-column:1/-1}
    .small-action{border:0;border-radius:7px;background:#fff5d9;color:#9a701e;padding:8px 10px;font-size:10px;font-weight:700;white-space:nowrap;cursor:pointer}
    .member-list,.account-list,.investment-list{display:grid;gap:4px;margin-top:10px}
    .household-row{min-height:48px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #f1f2f4}.household-row:last-child{border-bottom:0}
    .mini-avatar,.account-symbol,.investment-symbol{width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:9px;background:#fff5d9;color:#947226;font-size:11px;font-weight:700}
    .account-symbol{background:#edf3f4;color:#607c82;font-size:17px}.investment-symbol{background:#e8f5ed;color:#48a174;font-size:18px}
    .household-copy{display:grid;flex:1;min-width:0}.household-copy strong,.row-value,.investment-values strong{overflow:hidden;color:#383d44;font-size:11px;text-overflow:ellipsis;white-space:nowrap}.household-copy small,.investment-values small{margin-top:3px;color:#9297a0;font-size:9px}
    .member-account-count{color:#8e949c;font-size:9px}.row-value{font-size:10px}.investment-values{display:grid;text-align:right}.account-total{display:flex;justify-content:space-between;border-top:1px solid var(--line);margin-top:9px;padding-top:10px;color:#858b93;font-size:10px}.account-total strong{color:#383d44;font-size:11px}.empty-state{margin:12px 0;color:#969ba3;font-size:10px}
    .recurring-field{border:1px solid #f0e5c9;border-radius:8px;background:#fffcf4;padding:9px}.recurring-field select{margin-top:6px}
    @media(max-width:820px){.household-grid{grid-template-columns:1fr}.investments-panel{grid-column:auto}}
    @media(max-width:560px){.currency-control span{display:none}.currency-control select{max-width:88px;height:38px}.actions{gap:6px}.household-panel{padding:16px}.small-action{padding:7px}}
  `;
  document.head.append(style);
}

addFeatureStyles();
addDashboardFeatures();
renderAll();
