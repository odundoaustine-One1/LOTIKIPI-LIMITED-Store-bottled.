// Sales register: one Firestore doc per day, salesDays/{YYYY-MM-DD}.
// All maths for checks, aggregation and formatting lives here so the
// entry form, the PDF reports and the Excel register agree exactly.

export const SECTIONS = ["Refills", "Completes", "Cartons"] as const;
export type Section = (typeof SECTIONS)[number];

export const UNIT: Record<Section, string> = { Refills: "units", Completes: "pcs", Cartons: "ctns" };

export const SIZES: Record<Section, string[]> = {
  Refills: ["1L", "5L", "10L", "20L"],
  Completes: ["1L", "5L", "10L", "18.9L", "20L"],
  Cartons: ["500ml", "1L", "1.5L", "5L"],
};

export const DEFAULT_PRICE: Record<Section, Record<string, number>> = {
  Refills: { "1L": 10, "5L": 50, "10L": 100, "20L": 200 },
  Completes: { "1L": 50, "18.9L": 1600 },
  Cartons: { "1L": 350 },
};

const SIZE_ORDER: Record<string, number> = { "500ml": 0, "1L": 1, "1.5L": 2, "5L": 3, "10L": 4, "18.9L": 5, "20L": 6 };

export interface SaleLine {
  section: Section;
  size: string;
  qty: number;
  price: number;
  amount: number;
}

export interface ExpenseItem {
  item: string;
  amount: number;
}

/** A repayment received against a credit sale. */
export interface CreditPayment {
  date: string; // YYYY-MM-DD
  amount: number;
}

/** Who a day's credit is owed by. Optional: a day with credit and no
 *  entries is treated as one unnamed entry for the whole credit. */
export interface CreditEntry {
  customer: string;
  amount: number;
  paid: CreditPayment[];
}

export interface SalesDay {
  date: string; // YYYY-MM-DD
  lines: SaleLine[];
  totalSales: number;
  paybill: number[];
  cashMpesa: number;
  credit: number;
  creditors: CreditEntry[];
  expenses: ExpenseItem[];
  expensesTotal: number;
  grossDeposit: number;
  netDeposit: number;
  notes: string;
  assumed: string[];
  updatedBy?: string;
}

export const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number(b) || 0), 0);
export const paybillTotal = (d: SalesDay) => sum(d.paybill);
export const secTotal = (d: SalesDay, s: Section) => sum(d.lines.filter((l) => l.section === s).map((l) => l.amount));
export const secQty = (d: SalesDay, s: Section) => sum(d.lines.filter((l) => l.section === s).map((l) => l.qty));

export function lineSort(a: SaleLine, b: SaleLine) {
  return (
    SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
    (SIZE_ORDER[a.size] ?? 99) - (SIZE_ORDER[b.size] ?? 99) ||
    b.price - a.price
  );
}

export function money(x: number | null | undefined): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "-";
  const r = Math.round(x * 100) / 100;
  return Number.isInteger(r)
    ? r.toLocaleString("en-KE")
    : r.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const pct = (a: number, b: number) => (b ? (a / b) * 100 : 0);

const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

/** The checks (five, plus credit customers = credit when customers are named). Returns human-readable problems (empty = all passed). */
export function runChecks(d: SalesDay): string[] {
  const out: string[] = [];
  for (const l of d.lines) {
    if (!near(l.qty * l.price, l.amount))
      out.push(`${l.section} ${l.size}: ${money(l.qty)} x ${money(l.price)} = ${money(l.qty * l.price)}, written ${money(l.amount)}`);
  }
  const s = sum(d.lines.map((l) => l.amount));
  if (!near(s, d.totalSales)) out.push(`Refills + Completes + Cartons = ${money(s)}, Total sales = ${money(d.totalSales)}`);
  const p = paybillTotal(d) + d.cashMpesa + d.credit;
  if (!near(p, d.totalSales)) out.push(`Paybill + Cash/M-PESA + Credit = ${money(p)}, Total sales = ${money(d.totalSales)}`);
  if (d.creditors.length) {
    const c = sum(d.creditors.map((x) => x.amount));
    if (!near(c, d.credit)) out.push(`Credit customers add to ${money(c)}, Credit = ${money(d.credit)}`);
  }
  const e = sum(d.expenses.map((x) => x.amount));
  if (!near(e, d.expensesTotal)) out.push(`Expense items add to ${money(e)}, Total expenses = ${money(d.expensesTotal)}`);
  if (!near(d.grossDeposit - d.expensesTotal, d.netDeposit))
    out.push(
      `Gross ${money(d.grossDeposit)} - Expenses ${money(d.expensesTotal)} = ${money(d.grossDeposit - d.expensesTotal)}, Net written ${money(d.netDeposit)}`
    );
  if (!near(d.grossDeposit, d.cashMpesa))
    out.push(`Gross deposit ${money(d.grossDeposit)} differs from Cash/M-PESA ${money(d.cashMpesa)}`);
  return out;
}

export function normalizeDay(raw: Record<string, unknown>): SalesDay {
  const n = (v: unknown) => Number(v) || 0;
  const lines = (Array.isArray(raw.lines) ? raw.lines : []) as Record<string, unknown>[];
  const crs = (Array.isArray(raw.creditors) ? raw.creditors : []) as Record<string, unknown>[];
  const exps = (Array.isArray(raw.expenses) ? raw.expenses : []) as Record<string, unknown>[];
  return {
    date: String(raw.date ?? ""),
    lines: lines.map((l) => ({
      section: (l.section as Section) ?? "Refills",
      size: String(l.size ?? ""),
      qty: n(l.qty),
      price: n(l.price),
      amount: n(l.amount),
    })),
    totalSales: n(raw.totalSales),
    paybill: (Array.isArray(raw.paybill) ? raw.paybill : [raw.paybill]).map(n),
    cashMpesa: n(raw.cashMpesa),
    credit: n(raw.credit),
    creditors: crs.map((c) => ({
      customer: String(c.customer ?? ""),
      amount: n(c.amount),
      paid: ((Array.isArray(c.paid) ? c.paid : []) as Record<string, unknown>[]).map((p) => ({ date: String(p.date ?? ""), amount: n(p.amount) })),
    })),
    expenses: exps.map((e) => ({ item: String(e.item ?? ""), amount: n(e.amount) })),
    expensesTotal: n(raw.expensesTotal),
    grossDeposit: n(raw.grossDeposit),
    netDeposit: n(raw.netDeposit),
    notes: String(raw.notes ?? ""),
    assumed: (Array.isArray(raw.assumed) ? raw.assumed : []).map(String),
  };
}

// ---------------------------------------------------------------- dates

export const parseKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const kdate = (k: string | Date) => {
  const d = typeof k === "string" ? parseKey(k) : k;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekday = (k: string | Date) => WEEKDAYS[(typeof k === "string" ? parseKey(k) : k).getDay()];
export const wd3 = (k: string | Date) => weekday(k).slice(0, 3);
export const kday = (k: string | Date) => `${weekday(k)}, ${kdate(k)}`;
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Monday..Sunday containing d */
export function weekBounds(d: Date): [Date, Date] {
  const offset = (d.getDay() + 6) % 7;
  const start = addDays(d, -offset);
  return [start, addDays(start, 6)];
}
export const lastOfMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0);
export function dateRange(a: Date, b: Date): Date[] {
  const out: Date[] = [];
  for (let x = a; x <= b; x = addDays(x, 1)) out.push(x);
  return out;
}

// ---------------------------------------------------------------- aggregation

export type DayMap = Record<string, SalesDay>;

export function daysIn(days: DayMap, a: Date, b: Date): SalesDay[] {
  const ka = toKey(a), kb = toKey(b);
  return Object.keys(days).filter((k) => k >= ka && k <= kb).sort().map((k) => days[k]);
}

export interface Agg {
  sales: number; refills: number; completes: number; cartons: number; paybill: number;
  cash: number; credit: number; expenses: number; gross: number; net: number; n: number;
}

export function agg(ds: SalesDay[]): Agg {
  const a: Agg = { sales: 0, refills: 0, completes: 0, cartons: 0, paybill: 0, cash: 0, credit: 0, expenses: 0, gross: 0, net: 0, n: ds.length };
  for (const d of ds) {
    a.sales += d.totalSales;
    a.refills += secTotal(d, "Refills");
    a.completes += secTotal(d, "Completes");
    a.cartons += secTotal(d, "Cartons");
    a.paybill += paybillTotal(d);
    a.cash += d.cashMpesa;
    a.credit += d.credit;
    a.expenses += d.expensesTotal;
    a.gross += d.grossDeposit;
    a.net += d.netDeposit;
  }
  return a;
}

export interface MixRow { section: Section; size: string; price: number | null; qty: number; amount: number }

export function mix(ds: SalesDay[], byPrice: boolean): MixRow[] {
  const m = new Map<string, MixRow>();
  for (const d of ds)
    for (const l of d.lines) {
      const price = byPrice ? l.price : null;
      const k = `${l.section}|${l.size}|${price}`;
      const r = m.get(k) ?? { section: l.section, size: l.size, price, qty: 0, amount: 0 };
      r.qty += l.qty;
      r.amount += l.amount;
      m.set(k, r);
    }
  return [...m.values()].sort(
    (a, b) =>
      SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section) ||
      (SIZE_ORDER[a.size] ?? 99) - (SIZE_ORDER[b.size] ?? 99) ||
      (b.price ?? 0) - (a.price ?? 0)
  );
}

export function expenseItems(ds: SalesDay[]): [string, number][] {
  const m = new Map<string, number>();
  for (const d of ds)
    for (const e of d.expenses) {
      const k = e.item.trim().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\B\w+/g, (w) => w.toLowerCase());
      m.set(k, (m.get(k) ?? 0) + e.amount);
    }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function change(cur: number, prev: number | null | undefined): string {
  if (prev === null || prev === undefined) return "-";
  const diff = cur - prev;
  const s = (diff > 0 ? "+" : "") + money(diff);
  return prev ? `${s} (${diff >= 0 ? "+" : ""}${pct(diff, prev).toFixed(1)}%)` : s;
}

export function summaryLines(d: SalesDay): string[] {
  return [
    `Total sales ${kdate(d.date)}: Ksh ${money(d.totalSales)} (Refills ${money(secTotal(d, "Refills"))} | Completes ${money(secTotal(d, "Completes"))} | Cartons ${money(secTotal(d, "Cartons"))})`,
    `Payment: Paybill ${money(paybillTotal(d))} | Cash/M-PESA ${money(d.cashMpesa)} | Credit ${money(d.credit)} (${pct(d.credit, d.totalSales).toFixed(1)}%)`,
    `Expenses: Ksh ${money(d.expensesTotal)} (${d.expenses.map((e) => `${e.item} ${money(e.amount)}`).join(", ")})`,
    `Net deposit: Ksh ${money(d.netDeposit)} (Gross ${money(d.grossDeposit)} - Expenses ${money(d.expensesTotal)})`,
  ];
}

// ---------------------------------------------------------------- credit due

/** The day's credit as entries; an unnamed day becomes one entry. */
export function creditEntries(d: SalesDay): CreditEntry[] {
  if (d.creditors.length) return d.creditors;
  return d.credit > 0 ? [{ customer: "", amount: d.credit, paid: [] }] : [];
}

export const creditPaid = (c: CreditEntry) => sum(c.paid.map((p) => p.amount));
export const creditBalance = (c: CreditEntry) => Math.max(0, c.amount - creditPaid(c));

export interface DueRow {
  date: string;
  index: number; // position in creditEntries(day)
  customer: string;
  amount: number;
  paid: number;
  balance: number;
  lastPaid: string | null;
}

/** Every credit sale across all days, oldest first. */
export function creditRows(days: DayMap): DueRow[] {
  const out: DueRow[] = [];
  for (const k of Object.keys(days).sort())
    creditEntries(days[k]).forEach((c, index) => {
      const lastPaid = c.paid.map((p) => p.date).sort().pop() ?? null;
      out.push({ date: k, index, customer: c.customer, amount: c.amount, paid: creditPaid(c), balance: creditBalance(c), lastPaid });
    });
  return out;
}

export const totalDue = (days: DayMap) => sum(creditRows(days).map((r) => r.balance));

/** Whole days between a sale date and today. */
export const ageDays = (k: string, today: string) =>
  Math.round((parseKey(today).getTime() - parseKey(k).getTime()) / 86400000);
