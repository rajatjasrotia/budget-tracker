# budget-tracker
A household finance dashboard for tracking balances, income, expenses, accounts, investments, and recurring SIP/EMI payments.

## Run with Excel-backed storage

This version uses a Node.js server and stores profiles and finance records in an Excel workbook on the server. It does not use a database.

1. Install Node.js 18 or newer.
2. From the project directory, install dependencies and start the app:

```bash
npm install
npm start
```

3. Open `http://localhost:4173` and enter a profile name.
4. Open `data/finance-data.xlsx` with Microsoft Excel or LibreOffice Calc to view the data.

The workbook is created automatically after the first profile is saved and contains these sheets:

- `Users` — profile names, currency, summary totals, and timestamps
- `Members` — household members and relationships
- `Accounts` — account names, owners, and balances
- `Investments` — investment values and monthly contributions
- `Transactions` — incomes, expenses, SIPs, EMIs, account/member references, and dates

Each row is associated with a profile ID, so records are separated by user. The app attempts to migrate the prior `finova-dashboard-v2` browser data into the first profile that signs in. Profile changes are saved automatically to the workbook; a save status appears in the dashboard. The old local browser cache is also retained per profile as a temporary recovery copy.

## Important privacy and backup notes

Name-only sign-in is a profile selector, not secure authentication: anyone with access to this local server or workbook can view the financial records. Use it on a trusted machine and do not expose the server publicly with private data. For multi-user internet deployment, add password-based authentication and authorization before hosting it. The Excel workbook is the source of truth; back up `data/finance-data.xlsx` regularly, and close it in Excel before making dashboard changes to avoid file locking. The generated workbook is intentionally excluded from Git.
