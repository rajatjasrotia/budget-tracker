const express = require('express');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 4173;
const DATA_DIR = path.join(__dirname, 'data');
const WORKBOOK_PATH = path.join(DATA_DIR, 'finance-data.xlsx');
const TEMP_PATH = path.join(DATA_DIR, 'finance-data.tmp.xlsx');
const CURRENCIES = new Set(['USD', 'INR', 'EUR', 'GBP', 'CAD', 'AUD', 'AED']);
const SHEETS = {
  Users: ['id', 'name', 'normalizedName', 'currency', 'budget', 'balance', 'income', 'expenses', 'savings', 'createdAt', 'updatedAt'],
  Members: ['userId', 'id', 'name', 'role'],
  Accounts: ['userId', 'id', 'name', 'type', 'ownerId', 'balance'],
  Investments: ['userId', 'id', 'name', 'type', 'ownerId', 'value', 'contribution'],
  Transactions: ['userId', 'id', 'description', 'category', 'amount', 'type', 'date', 'memberId', 'accountId', 'recurrence', 'createdAt']
};

app.use(express.json({ limit: '2mb' }));
app.use(express.static(__dirname, { extensions: ['html'] }));

let writeQueue = Promise.resolve();
function serializedWrite(operation) {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.catch(() => {});
  return next;
}

function makeWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Finova Finance Dashboard';
  workbook.created = new Date();
  for (const [name, columns] of Object.entries(SHEETS)) {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 3) }));
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
  }
  return workbook;
}

async function openWorkbook() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(WORKBOOK_PATH);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return makeWorkbook();
  }
  for (const [name, columns] of Object.entries(SHEETS)) {
    let sheet = workbook.getWorksheet(name);
    if (!sheet) {
      sheet = workbook.addWorksheet(name);
      sheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 3) }));
      sheet.getRow(1).font = { bold: true };
    }
  }
  return workbook;
}

function cellValue(value) {
  return value == null ? '' : value;
}

function rowsFor(sheet, userId) {
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && String(row.getCell(1).value || '') === userId) {
      const record = {};
      sheet.columns.forEach((column, index) => {
        if (column.key) record[column.key] = cellValue(row.getCell(index + 1).value);
      });
      rows.push(record);
    }
  });
  return rows;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function profileFromWorkbook(workbook, userRow) {
  const userId = String(userRow.getCell(1).value);
  const users = workbook.getWorksheet('Users');
  const header = Object.fromEntries(users.getRow(1).values.slice(1).map((key, index) => [key, index + 1]));
  const value = (key) => userRow.getCell(header[key]).value;
  return {
    id: userId,
    name: String(value('name') || 'User'),
    currency: CURRENCIES.has(String(value('currency'))) ? String(value('currency')) : 'USD',
    budget: asNumber(value('budget')),
    balance: asNumber(value('balance')),
    income: asNumber(value('income')),
    expenses: asNumber(value('expenses')),
    savings: asNumber(value('savings')),
    createdAt: value('createdAt'),
    members: rowsFor(workbook.getWorksheet('Members'), userId).map((row) => ({ id: String(row.id), name: String(row.name), role: String(row.role) })),
    accounts: rowsFor(workbook.getWorksheet('Accounts'), userId).map((row) => ({ id: String(row.id), name: String(row.name), type: String(row.type), ownerId: String(row.ownerId), balance: asNumber(row.balance) })),
    investments: rowsFor(workbook.getWorksheet('Investments'), userId).map((row) => ({ id: String(row.id), name: String(row.name), type: String(row.type), ownerId: String(row.ownerId), value: asNumber(row.value), contribution: asNumber(row.contribution) })),
    transactions: rowsFor(workbook.getWorksheet('Transactions'), userId).map((row) => ({ id: String(row.id), description: String(row.description), category: String(row.category), amount: asNumber(row.amount), type: String(row.type), date: String(row.date), memberId: String(row.memberId), accountId: String(row.accountId), recurrence: String(row.recurrence || 'none'), createdAt: String(row.createdAt || '') }))
  };
}

function cleanText(value, fallback = '', maxLength = 160) {
  return String(value ?? fallback).trim().slice(0, maxLength);
}

function cleanRows(rows, mapper, maxRows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, maxRows).map(mapper);
}

function sanitizeProfile(input, name, id, createdAt) {
  const members = cleanRows(input.members, (item) => ({
    id: cleanText(item.id, crypto.randomUUID(), 100), name: cleanText(item.name, 'Member', 100), role: cleanText(item.role, 'Family member', 60)
  }), 200);
  if (!members.length) members.push({ id: crypto.randomUUID(), name, role: 'You' });
  const memberIds = new Set(members.map((item) => item.id));
  const accounts = cleanRows(input.accounts, (item) => ({
    id: cleanText(item.id, crypto.randomUUID(), 100), name: cleanText(item.name, 'Account', 100), type: cleanText(item.type, 'Checking', 50), ownerId: memberIds.has(String(item.ownerId)) ? String(item.ownerId) : members[0].id, balance: asNumber(item.balance)
  }), 500);
  const accountIds = new Set(accounts.map((item) => item.id));
  const investments = cleanRows(input.investments, (item) => ({
    id: cleanText(item.id, crypto.randomUUID(), 100), name: cleanText(item.name, 'Investment', 100), type: cleanText(item.type, 'Investment', 50), ownerId: memberIds.has(String(item.ownerId)) ? String(item.ownerId) : members[0].id, value: asNumber(item.value), contribution: asNumber(item.contribution)
  }), 500);
  const transactions = cleanRows(input.transactions, (item) => ({
    id: cleanText(item.id, crypto.randomUUID(), 100), description: cleanText(item.description, 'Transaction', 160), category: cleanText(item.category, 'Other', 60), amount: Math.max(0, asNumber(item.amount)), type: item.type === 'income' ? 'income' : 'expense', date: cleanText(item.date, new Date().toISOString().slice(0, 10), 40), memberId: memberIds.has(String(item.memberId)) ? String(item.memberId) : members[0].id, accountId: accountIds.has(String(item.accountId)) ? String(item.accountId) : '', recurrence: item.recurrence === 'monthly' ? 'monthly' : 'none', createdAt: cleanText(item.createdAt, '', 50)
  }), 10000);
  return {
    id, name, currency: CURRENCIES.has(input.currency) ? input.currency : 'USD',
    budget: Math.max(0, asNumber(input.budget, 5300)),
    balance: asNumber(input.balance), income: asNumber(input.income), expenses: asNumber(input.expenses), savings: asNumber(input.savings),
    createdAt, members, accounts, investments, transactions
  };
}

async function saveProfile(profile) {
  await serializedWrite(async () => {
    const workbook = await openWorkbook();
    const users = workbook.getWorksheet('Users');
    const existing = users.findRow(profile.id);
    const now = new Date().toISOString();
    const userRecord = {
      id: profile.id, name: profile.name, normalizedName: profile.name.toLocaleLowerCase(), currency: profile.currency,
      budget: profile.budget, balance: profile.balance, income: profile.income, expenses: profile.expenses, savings: profile.savings,
      createdAt: profile.createdAt || now, updatedAt: now
    };
    if (existing) existing.values = [undefined, ...SHEETS.Users.map((key) => userRecord[key])];
    else users.addRow(userRecord);

    const collections = { Members: profile.members, Accounts: profile.accounts, Investments: profile.investments, Transactions: profile.transactions };
    for (const [sheetName, records] of Object.entries(collections)) {
      const sheet = workbook.getWorksheet(sheetName);
      for (let index = sheet.rowCount; index >= 2; index -= 1) {
        if (String(sheet.getRow(index).getCell(1).value || '') === profile.id) sheet.spliceRows(index, 1);
      }
      for (const record of records) sheet.addRow({ userId: profile.id, ...record });
    }
    await workbook.xlsx.writeFile(TEMP_PATH);
    await fs.rename(TEMP_PATH, WORKBOOK_PATH);
  });
}

function findUserRow(workbook, userId) {
  const sheet = workbook.getWorksheet('Users');
  let found;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && String(row.getCell(1).value || '') === userId) found = row;
  });
  return found;
}

app.post('/api/login', async (req, res) => {
  try {
    const name = cleanText(req.body?.name, '', 80);
    if (name.length < 2) return res.status(400).json({ error: 'Please enter a name with at least 2 characters.' });
    const workbook = await openWorkbook();
    const users = workbook.getWorksheet('Users');
    const normalizedName = name.toLocaleLowerCase();
    let userRow;
    users.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && String(row.getCell(3).value || '') === normalizedName) userRow = row;
    });
    if (userRow) return res.json({ profile: profileFromWorkbook(workbook, userRow), existing: true });

    const id = crypto.randomUUID();
    let profile = sanitizeProfile({}, name, id, new Date().toISOString());
    const legacy = req.body?.legacyData;
    if (legacy && typeof legacy === 'object') {
      profile = sanitizeProfile(legacy, name, id, profile.createdAt);
      const owner = profile.members.find((member) => member.role === 'You') || profile.members[0];
      if (owner) { owner.name = name; owner.role = 'You'; }
    }
    await saveProfile(profile);
    res.status(201).json({ profile, existing: false });
  } catch (error) {
    console.error('Login failed:', error);
    res.status(500).json({ error: 'Could not open the Excel workbook. Check the server logs and try again.' });
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const workbook = await openWorkbook();
    const userRow = findUserRow(workbook, req.params.id);
    if (!userRow) return res.status(404).json({ error: 'Profile not found. Sign in with your name again.' });
    res.json({ profile: profileFromWorkbook(workbook, userRow) });
  } catch (error) {
    console.error('Could not read profile:', error);
    res.status(500).json({ error: 'Could not read the Excel workbook.' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const workbook = await openWorkbook();
    const userRow = findUserRow(workbook, req.params.id);
    if (!userRow) return res.status(404).json({ error: 'Profile not found.' });
    const current = profileFromWorkbook(workbook, userRow);
    const submittedName = cleanText(req.body?.name, current.name, 80);
    const profile = sanitizeProfile(req.body || {}, submittedName, current.id, current.createdAt);
    await saveProfile(profile);
    res.json({ ok: true, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Could not save profile:', error);
    res.status(500).json({ error: 'Could not save to the Excel workbook. Your browser still has the last saved copy.' });
  }
});

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'Excel workbook', file: 'data/finance-data.xlsx' }));

app.listen(PORT, () => {
  console.log(`Finova is running at http://localhost:${PORT}`);
  console.log(`Excel data will be stored in ${WORKBOOK_PATH}`);
});
