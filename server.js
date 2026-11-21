const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 4173;
const DATA_DIR = path.join(__dirname, 'data');
const WORKBOOK_PATH = path.join(DATA_DIR, 'finance-data.xlsx');
const CURRENCIES = new Set(['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'AED']);
const SHEETS = {
  Users: ['id', 'name', 'normalizedName', 'currency', 'budget', 'balance', 'income', 'expenses', 'savings', 'createdAt', 'updatedAt'],
  Members: ['userId', 'id', 'name', 'role'],
  Accounts: ['userId', 'id', 'name', 'type', 'ownerId', 'balance'],
  Investments: ['userId', 'id', 'name', 'type', 'ownerId', 'value', 'contribution'],
  Transactions: ['userId', 'id', 'description', 'category', 'amount', 'type', 'date', 'memberId', 'accountId', 'recurrence', 'createdAt']
};

app.use(express.json({ limit: '5mb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

let writeQueue = Promise.resolve();
function serializedWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

function normalizeName(name) { return String(name || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase(); }

function makeWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Finova Finance Dashboard';
  workbook.created = new Date();
  for (const [name, columns] of Object.entries(SHEETS)) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 3) }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
  }
  return workbook;
}

async function openWorkbook() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.readFile(WORKBOOK_PATH); }
  catch (error) { if (error.code === 'ENOENT') return makeWorkbook(); throw error; }
  for (const [name, columns] of Object.entries(SHEETS)) {
    let sheet = workbook.getWorksheet(name);
    if (!sheet) sheet = workbook.addWorksheet(name);
    sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 3) }));
  }
  return workbook;
}

async function writeWorkbook(workbook) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempPath = path.join(DATA_DIR, `finance-data-${process.pid}-${crypto.randomUUID()}.tmp.xlsx`);
  try {
    await workbook.xlsx.writeFile(tempPath);
    await fs.rename(tempPath, WORKBOOK_PATH);
  } catch (error) {
    await fs.rm(tempPath, { force: true }).catch(() => {});
    if (['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) {
      throw new Error('Close data/finance-data.xlsx in Excel or LibreOffice, allow writes to the project folder, then try again.');
    }
    throw error;
  }
}

async function ensureWorkbookFile() {
  await serializedWrite(async () => {
    try { await fs.access(WORKBOOK_PATH); }
    catch (error) { if (error.code === 'ENOENT') await writeWorkbook(makeWorkbook()); else throw error; }
  });
}

function cellValue(value) { return value == null ? '' : value; }
function asNumber(value, fallback = 0) { const number = Number(value); return Number.isFinite(number) ? number : fallback; }

function rowsFor(sheet, userId) {
  const rows = [];
  const columns = SHEETS[sheet.name] || [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && String(row.getCell(1).value || '') === userId) {
      const record = {};
      columns.forEach((key, index) => { record[key] = cellValue(row.getCell(index + 1).value); });
      rows.push(record);
    }
  });
  return rows;
}

function profileFromWorkbook(workbook, userRow) {
  const userId = String(userRow.getCell(1).value);
  const columns = SHEETS.Users;
  const value = (key) => userRow.getCell(columns.indexOf(key) + 1).value;
  return {
    id: userId,
    name: String(value('name') || 'User'),
    currency: CURRENCIES.has(String(value('currency'))) ? String(value('currency')) : 'INR',
    budget: asNumber(value('budget'), 5300), balance: asNumber(value('balance')), income: asNumber(value('income')),
    expenses: asNumber(value('expenses')), savings: asNumber(value('savings')), createdAt: value('createdAt'),
    members: rowsFor(workbook.getWorksheet('Members'), userId).map((row) => ({ id: String(row.id), name: String(row.name), role: String(row.role) })),
    accounts: rowsFor(workbook.getWorksheet('Accounts'), userId).map((row) => ({ id: String(row.id), name: String(row.name), type: String(row.type), ownerId: String(row.ownerId), balance: asNumber(row.balance) })),
    investments: rowsFor(workbook.getWorksheet('Investments'), userId).map((row) => ({ id: String(row.id), name: String(row.name), type: String(row.type), ownerId: String(row.ownerId), value: asNumber(row.value), contribution: asNumber(row.contribution) })),
    transactions: rowsFor(workbook.getWorksheet('Transactions'), userId).map((row) => ({ id: String(row.id), description: String(row.description), category: String(row.category), amount: asNumber(row.amount), type: String(row.type), date: String(row.date), memberId: String(row.memberId), accountId: String(row.accountId), recurrence: String(row.recurrence || 'none'), createdAt: String(row.createdAt || '') }))
  };
}

function cleanText(value, fallback = '', maxLength = 160) { return String(value ?? fallback).trim().slice(0, maxLength); }
function cleanRows(rows, mapper, maxRows) { return Array.isArray(rows) ? rows.slice(0, maxRows).map((item) => mapper(item || {})) : []; }

function sanitizeProfile(input, name, id, createdAt) {
  const members = cleanRows(input.members, (item) => ({ id: cleanText(item.id, crypto.randomUUID(), 100), name: cleanText(item.name, 'Member', 100), role: cleanText(item.role, 'Family member', 60) }), 200);
  if (!members.length) members.push({ id: crypto.randomUUID(), name, role: 'You' });
  const memberIds = new Set(members.map((item) => item.id));
  const accounts = cleanRows(input.accounts, (item) => ({ id: cleanText(item.id, crypto.randomUUID(), 100), name: cleanText(item.name, 'Account', 100), type: cleanText(item.type, 'Checking', 50), ownerId: memberIds.has(String(item.ownerId)) ? String(item.ownerId) : members[0].id, balance: asNumber(item.balance) }), 500);
  const accountIds = new Set(accounts.map((item) => item.id));
  const investments = cleanRows(input.investments, (item) => ({ id: cleanText(item.id, crypto.randomUUID(), 100), name: cleanText(item.name, 'Investment', 100), type: cleanText(item.type, 'Investment', 50), ownerId: memberIds.has(String(item.ownerId)) ? String(item.ownerId) : members[0].id, value: asNumber(item.value), contribution: asNumber(item.contribution) }), 500);
  const transactions = cleanRows(input.transactions, (item) => ({ id: cleanText(item.id, crypto.randomUUID(), 100), description: cleanText(item.description, 'Transaction', 160), category: cleanText(item.category, 'Other', 60), amount: Math.max(0, asNumber(item.amount)), type: item.type === 'income' ? 'income' : 'expense', date: cleanText(item.date, new Date().toISOString().slice(0, 10), 40), memberId: memberIds.has(String(item.memberId)) ? String(item.memberId) : members[0].id, accountId: accountIds.has(String(item.accountId)) ? String(item.accountId) : '', recurrence: item.recurrence === 'monthly' ? 'monthly' : 'none', createdAt: cleanText(item.createdAt, '', 50) }), 10000);
  return { id, name, currency: CURRENCIES.has(input.currency) ? input.currency : 'INR', budget: Math.max(0, asNumber(input.budget, 5300)), balance: asNumber(input.balance), income: asNumber(input.income), expenses: asNumber(input.expenses), savings: asNumber(input.savings), createdAt: createdAt || new Date().toISOString(), members, accounts, investments, transactions };
}

function findUserRow(workbook, userId) { const sheet = workbook.getWorksheet('Users'); let found; sheet.eachRow((row, rowNumber) => { if (rowNumber > 1 && String(row.getCell(1).value || '') === userId) found = row; }); return found; }

async function saveProfile(profile) {
  await serializedWrite(async () => {
    const workbook = await openWorkbook();
    const users = workbook.getWorksheet('Users');
    const existing = findUserRow(workbook, profile.id);
    const now = new Date().toISOString();
    const record = { id: profile.id, name: profile.name, normalizedName: normalizeName(profile.name), currency: profile.currency, budget: profile.budget, balance: profile.balance, income: profile.income, expenses: profile.expenses, savings: profile.savings, createdAt: profile.createdAt || now, updatedAt: now };
    if (existing) SHEETS.Users.forEach((key, index) => existing.getCell(index + 1).value = record[key]);
    else users.addRow(record);
    const collections = { Members: profile.members, Accounts: profile.accounts, Investments: profile.investments, Transactions: profile.transactions };
    for (const [sheetName, records] of Object.entries(collections)) {
      const sheet = workbook.getWorksheet(sheetName);
      for (let index = sheet.rowCount; index >= 2; index -= 1) if (String(sheet.getRow(index).getCell(1).value || '') === profile.id) sheet.spliceRows(index, 1);
      for (const item of records) sheet.addRow({ userId: profile.id, ...item });
    }
    await writeWorkbook(workbook);
  });
}

app.post('/api/login', async (req, res) => {
  try {
    const name = cleanText(req.body?.name, '', 80).replace(/\s+/g, ' ');
    if (name.length < 2) return res.status(400).json({ error: 'Please enter a name with at least 2 characters.' });
    const workbook = await openWorkbook();
    const users = workbook.getWorksheet('Users');
    const normalizedName = normalizeName(name);
    let userRow;
    users.eachRow((row, rowNumber) => { if (rowNumber > 1 && normalizeName(row.getCell(3).value || row.getCell(2).value) === normalizedName) userRow = row; });
    if (userRow) return res.json({ profile: profileFromWorkbook(workbook, userRow), existing: true });
    const id = crypto.randomUUID();
    let profile = sanitizeProfile({}, name, id, new Date().toISOString());
    const legacy = req.body?.legacyData;
    if (legacy && typeof legacy === 'object') {
      profile = sanitizeProfile(legacy, name, id, profile.createdAt);
      const owner = profile.members.find((member) => member.role === 'You') || profile.members[0];
      if (owner) { owner.name = name; owner.role = 'You'; }
    }
    await saveProfile(profile); res.status(201).json({ profile, existing: false });
  } catch (error) { console.error('Login failed:', error); res.status(500).json({ error: error.message || 'Could not open or save the Excel workbook.' }); }
});

app.get('/api/users/:id', async (req, res) => {
  try { const workbook = await openWorkbook(); const row = findUserRow(workbook, req.params.id); if (!row) return res.status(404).json({ error: 'Profile not found.' }); res.json({ profile: profileFromWorkbook(workbook, row) }); }
  catch (error) { console.error('Could not read profile:', error); res.status(500).json({ error: error.message || 'Could not read the Excel workbook.' }); }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const workbook = await openWorkbook(); const row = findUserRow(workbook, req.params.id);
    if (!row) return res.status(404).json({ error: 'Profile not found. Sign in with your name again.' });
    const current = profileFromWorkbook(workbook, row); const submitted = req.body && typeof req.body === 'object' ? req.body : {};
    const merged = { ...current, ...submitted }; for (const key of ['members', 'accounts', 'investments', 'transactions']) if (!Array.isArray(submitted[key])) merged[key] = current[key];
    const profile = sanitizeProfile(merged, cleanText(submitted.name, current.name, 80) || current.name, current.id, current.createdAt);
    await saveProfile(profile); res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) { console.error('Could not save profile:', error); res.status(500).json({ error: error.message || 'Could not save to the Excel workbook.' }); }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'Excel workbook', file: 'data/finance-data.xlsx' }));
ensureWorkbookFile().then(() => app.listen(PORT, () => { console.log(`Finova server started on port ${PORT}.`); console.log(`Excel workbook: ${WORKBOOK_PATH}`); })).catch((error) => { console.error(error); process.exitCode = 1; });
