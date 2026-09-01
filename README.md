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
