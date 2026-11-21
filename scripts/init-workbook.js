const ExcelJS = require('exceljs');
const fs = require('fs/promises');
const path = require('path');

const dataDirectory = path.join(__dirname, '..', 'data');
const workbookPath = path.join(dataDirectory, 'finance-data.xlsx');
const sheets = {
  Users: ['id', 'name', 'normalizedName', 'currency', 'budget', 'balance', 'income', 'expenses', 'savings', 'createdAt', 'updatedAt'],
  Members: ['userId', 'id', 'name', 'role'],
  Accounts: ['userId', 'id', 'name', 'type', 'ownerId', 'balance'],
  Investments: ['userId', 'id', 'name', 'type', 'ownerId', 'value', 'contribution'],
  Transactions: ['userId', 'id', 'description', 'category', 'amount', 'type', 'date', 'memberId', 'accountId', 'recurrence', 'createdAt']
};

async function main() {
  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    await fs.access(workbookPath);
    console.log(`Excel workbook already exists; keeping existing data: ${workbookPath}`);
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Finova Finance Dashboard';
  workbook.created = new Date();
  for (const [sheetName, columns] of Object.entries(sheets)) {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns.map((key) => ({ header: key, key, width: Math.max(14, key.length + 3) }));
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.getRow(1).font = { bold: true };
    worksheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + columns.length)}1` };
  }
  await workbook.xlsx.writeFile(workbookPath);
  console.log(`Created Excel workbook with Users, Members, Accounts, Investments, and Transactions sheets:\n${workbookPath}`);
}

main().catch((error) => {
  console.error('Could not initialize the Excel workbook:', error);
  process.exitCode = 1;
});
