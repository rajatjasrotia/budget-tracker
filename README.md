# budget-tracker
A household finance dashboard for tracking balances, income, expenses, accounts, investments, and recurring SIP/EMI payments.

## First-time setup and run

Install Node.js 18 or newer. From the project folder:

- **Windows:** run `setup.sh` from Git Bash once to install dependencies and create `data/finance-data.xlsx`. Then double-click `start.bat` whenever you want to run the app. It starts the server and opens the dashboard in your browser automatically.
- **macOS/Linux:** run `bash setup.sh` once, then `npm start` to start the server.

The setup command `npm run init-data` creates the Excel workbook with `Users`, `Members`, `Accounts`, `Investments`, and `Transactions` sheets. It does not overwrite an existing workbook. The server also creates the workbook automatically if it is missing.

The workbook is stored at `data/finance-data.xlsx`. Open it with Microsoft Excel or LibreOffice Calc to inspect profiles and finance records. Each row is associated with a profile ID, so records are separated by user. The app attempts to migrate prior `finova-dashboard-v2` browser data into the first profile that signs in. Profile changes are saved automatically, and a save status appears in the dashboard.

## Important privacy and backup notes

Name-only sign-in is a profile selector, not secure authentication: anyone with access to this local server or workbook can view the financial records. Use it on a trusted machine and do not expose the server publicly with private data. For internet deployment, add password-based authentication and authorization first. The Excel workbook is the source of truth; back up `data/finance-data.xlsx` regularly, and close it in Excel before making dashboard changes to avoid file locking. The generated workbook is intentionally excluded from Git.
