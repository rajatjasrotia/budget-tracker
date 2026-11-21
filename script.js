const addTransactionButton = document.querySelector('#addTransaction');
const modalBackdrop = document.querySelector('#modalBackdrop');
const closeModalButton = document.querySelector('#closeModal');
const transactionForm = document.querySelector('#transactionForm');
const transactionList = document.querySelector('#transactionList');

const state = {
  balance: 24562,
  income: 8420,
  expenses: 3284,
  savings: 5136,
  budget: 5300
};

function currency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value);
}

function openModal() {
  modalBackdrop.classList.add('open');
  modalBackdrop.setAttribute('aria-hidden', 'false');
  document.querySelector('#description').focus();
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalBackdrop.setAttribute('aria-hidden', 'true');
  transactionForm.reset();
}

function updateSummary() {
  document.querySelector('#totalBalance').textContent = currency(state.balance);
  document.querySelector('#totalIncome').textContent = currency(state.income);
  document.querySelector('#totalExpenses').textContent = currency(state.expenses);
  document.querySelector('#totalSavings').textContent = currency(state.savings);

  const percent = Math.min(100, Math.round((state.expenses / state.budget) * 100));
  document.querySelector('#budgetPercent').textContent = `${percent}%`;
  document.querySelector('#budgetSpent').textContent = `$${Math.round(state.expenses).toLocaleString()}`;
  document.querySelector('#budgetRemaining').textContent = `$${Math.max(0, Math.round(state.budget - state.expenses)).toLocaleString()} left`;

  const ringProgress = document.querySelector('.ring-progress');
  ringProgress.style.strokeDashoffset = String(452.39 * (1 - percent / 100));
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
  event.preventEvent && event.preventEvent();
  event.preventDefault();

  const type = document.querySelector('#type').value;
  const description = document.querySelector('#description').value.trim();
  const amount = Number(document.querySelector('#amount').value);
  const category = document.querySelector('#category').value;

  if (!description || !Number.isFinite(amount) || amount <= 0) return;

  if (type === 'income') {
    state.income += amount;
    state.balance += amount;
  } else {
    state.expenses += amount;
    state.balance -= amount;
  }
  state.savings = state.balance - 24562 + 5136;

  const item = document.createElement('div');
  item.className = 'transaction';
  const icon = type === 'income' ? '↗' : category === 'Food' ? '♨' : category === 'Transport' ? '🚕' : category === 'Shopping' ? '🛍' : '•';
  const iconClass = type === 'income' ? 'salary' : category.toLowerCase();
  item.innerHTML = `
    <span class="transaction-icon ${iconClass}">${icon}</span>
    <span class="transaction-info"><strong>${escapeHtml(description)}</strong><small>${escapeHtml(category)} · Today</small></span>
    <span class="transaction-amount ${type}">${type === 'income' ? '+' : '−'}${currency(amount)}</span>
  `;
  transactionList.prepend(item);

  updateSummary();
  closeModal();
});

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = value;
  return element.innerHTML;
}

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((navItem) => navItem.classList.remove('active'));
    item.classList.add('active');
  });
});

updateSummary();
