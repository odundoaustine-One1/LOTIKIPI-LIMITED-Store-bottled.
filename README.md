# Lotikipi Water — Stock Tracker

Rebuilt from scratch on 2026-08/09 after the original deployed app (compiled-only,
no source ever kept) got stuck in a redirect loop after login with no recoverable
source code. **Keep this repo — push it to a real git remote (GitHub) as soon as
possible** so this never happens again.

## Firebase project

- Project ID: `lotikipi-1-stock-production`
- Hosting: `https://lotikipi-1-stock-production.web.app`
- Firestore database: `(default)`, region `africa-south1`

## Roles (Firestore `users/{uid}`: `active`, `displayName`, `email`, `role`, `uid`)

Role is a single exact-match string checked client-side — there's no way to
combine roles on one account. Give someone two accounts if they need two roles.

- `management` — Dashboard, Production, History, Audit Log, Payroll
- `store` — Dashboard, Stock Entry, Production, History
- `production` — Dashboard, Production, History

## Firestore collections

- `users/{uid}` — see above
- `stockItems/{itemKey}__{YYYY-MM-DD}` — daily material movement: `openingQty`,
  `added`, `used`, `rejects`, `closingQty`
- `cartonStock/{size}__{YYYY-MM-DD}` — daily finished-goods cartons: `openingCartons`,
  `producedCartons`, `soldCartons`, `closingCartons`
- `production/{autoId}` — one doc per production run: `date`, `size`, `bags`,
  `pieces`, `staff` (array of staffMembers doc IDs)
- `staffMembers/{autoId}` — `name`, `active`
- `auditLog/{autoId}` — written automatically by Cloud Functions (see below), never
  by the client
- `salesDays/{YYYY-MM-DD}` — daily sales register (Sales section, management
  only): `lines[]` (`section`, `size`, `qty`, `price`, `amount`), `totalSales`,
  `paybill[]`, `cashMpesa`, `credit`, `expenses[]` (`item`, `amount`),
  `expensesTotal`, `grossDeposit`, `netDeposit`, `notes`, `assumed[]`
- `refills`, `itemConfig`, `payrollConfig`, `productSizeConfig` — seen in the
  original DB but not yet used by this rebuild; check the Firebase console before
  assuming they're empty

## Cloud Functions (already deployed, untouched by this rebuild)

`auditProductionDeletion`, `auditCartonStock`, `auditRefills`, `auditProduction`,
`auditStockItems` — Firestore triggers that write to `auditLog` on
update/delete of the corresponding collection. `scheduledFirestoreExport` — daily
backup export.

## Product sizes / pack conversion (confirmed from real historical data)

- 500ml: 24 pcs/carton
- 1L: 12 pcs/carton
- 1.5L: 8 pcs/carton

## Known gotcha that caused the original outage

A Firestore query needs a composite index the *first* time its result set grows
past a certain size, not necessarily when the query is first written — a query
that "always worked" can suddenly start throwing `failed-precondition` weeks
later with no code change. This rebuild avoids the problem entirely by never
using `orderBy` combined with a different `where` field — everything is fetched
with a single-field `where` (or no filter at all) and sorted client-side instead.
If you add a new query with `orderBy` + `where` on different fields, you will
need to create the matching index in the Firebase console (Firestore → Indexes)
or it will silently fail for real users once the collection grows.

## Sales register (management)

`/sales` — month overview, list of recorded days with check status, and report
downloads. `/sales/day/new` (or `/sales/day/YYYY-MM-DD` to correct a day) — the
"SUMMARY ON" entry form: refills, completes, cartons (extra lines for split
prices), total sales, paybill amounts, cash/M-PESA, credit, itemised expenses,
gross/net deposit, note, and assumed/unclear figures.

The five checks run live (qty x price = amount; sections = total; paybill + cash
+ credit = total; expense items = expenses total; gross - expenses = net). Saving
with a failed check, or replacing an existing day, needs a tick-box
confirmation, and the issue is printed in the "Assumed / to confirm" box on the
daily PDF.

Reports are generated in the browser (code in `src/sales/`, loaded only when
used): daily PDF (one page), weekly PDF (Mon–Sun), monthly PDF (cover, ledger
with weekly subtotals, sign-off), and `Lotikipi_Sales_Register_YYYY.xlsx`
(Daily Lines, Daily Summary, Expenses, Notes). Branding: logo blue `#0000B9`,
gold `#D4AF37` / `#B8901F`, credit in rust.

**Firestore rule needed.** The security rules live in the Firebase console
(not in this repo). Add this inside `match /databases/{database}/documents`
before first use, or saving a day fails with "permission denied":

```
match /salesDays/{day} {
  allow read, write: if request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == "management"
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.active == true;
}
```

## Local dev

```bash
npm install
npm run dev
```

## Deploy

```bash
npm run build
firebase deploy --only hosting --project lotikipi-1-stock-production
```

Always deploy to a preview channel first and test with a real login before
pushing to the live URL:

```bash
firebase hosting:channel:deploy preview-name --project lotikipi-1-stock-production --expires 2h
```

Or without a computer: GitHub → Actions → "Deploy to Firebase Hosting" → Run
workflow (choose `preview` first, then `live`). One-time setup: add repo secret
`FIREBASE_SERVICE_ACCOUNT` (Firebase console → Project settings → Service
accounts → Generate new private key; paste the whole JSON).
