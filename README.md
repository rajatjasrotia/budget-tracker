# budget-tracker
A web app for tracking earnings and expenses, with budget and balance summaries.

## Finance dashboard

Open `index.html` directly in a browser, or run a local server:

```bash
python3 -m http.server 4173
```

Then visit `http://localhost:4173`.

The dashboard includes:

- Total balance, income, expenses, and savings summaries
- Income versus expense cash-flow chart
- Monthly budget progress and spending breakdown
- Recent transactions, including recurring SIP and EMI payments
- Currency display selection (USD, INR, EUR, GBP, CAD, AUD, and AED)
- Household member management for partners and family members
- Multiple checking, savings, and cash accounts with per-member ownership
- Investment tracking with portfolio value and monthly contributions
- Local browser storage so dashboard changes are retained on the same device

Transactions are recorded against a household member and an account. Recurring payments can be marked monthly. This is a local dashboard prototype; it does not connect to banks, execute payments, or fetch live currency exchange rates. Currency selection changes the display format and assumes entered values are already in the selected currency.
