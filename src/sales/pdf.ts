import { jsPDF } from "jspdf";
import autoTable, { type CellHookData, type RowInput } from "jspdf-autotable";
import {
  SECTIONS, UNIT, MONTHS, addDays, agg, change, dateRange, daysIn, expenseItems, kdate, kday, lastOfMonth, lineSort,
  mix, money, parseKey, paybillTotal, pct, runChecks, secQty, toKey, wd3, weekBounds,
  type Agg, type DayMap, type MixRow, type SalesDay,
} from "./model";

type RGB = [number, number, number];
const BLUE: RGB = [0, 0, 185];
const GOLD: RGB = [212, 175, 55];
const GOLDTXT: RGB = [184, 144, 31];
const RUST: RGB = [194, 65, 12];
const INK: RGB = [27, 31, 46];
const GREY: RGB = [94, 100, 117];
const RULE: RGB = [226, 228, 238];
const TINT: RGB = [243, 244, 251];
const OKGREEN: RGB = [31, 122, 58];

const PW = 210, PH = 297, M = 15, CW = PW - 2 * M;
const TOP = 32, BOTTOM = PH - 18;

let logoCache: { data: string; ratio: number } | null = null;
async function loadLogo() {
  if (logoCache) return logoCache;
  const blob = await (await fetch("/lotikipi-logo-wide.png")).blob();
  const data: string = await new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.readAsDataURL(blob);
  });
  const ratio: number = await new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i.naturalWidth / i.naturalHeight);
    i.src = data;
  });
  logoCache = { data, ratio };
  return logoCache;
}

class Report {
  doc = new jsPDF({ unit: "mm", format: "a4" });
  y = TOP;
  coverPages = new Set<number>();
  compact = false; // daily report: tighter spacing so it stays on one page
  constructor(private title: string, private subtitle: string, private logo: { data: string; ratio: number }) {}

  private lastY() {
    return (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }
  ensure(h: number) {
    if (this.y + h > BOTTOM) this.newPage();
  }
  newPage() {
    this.doc.addPage();
    this.y = TOP;
  }
  h2(t: string, space = this.compact ? 5.5 : 7) {
    this.ensure(space + 14);
    this.y += space - 2;
    this.doc.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...BLUE).text(t, M, this.y);
    this.y += 3;
  }
  para(t: string, size = 8.5, color: RGB = INK, bold = false) {
    this.doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
    const lines = this.doc.splitTextToSize(t, CW);
    this.ensure(lines.length * size * 0.45 + 2);
    this.y += size * 0.4;
    this.doc.text(lines, M, this.y);
    this.y += lines.length * size * 0.42;
  }

  kpis(items: [string, string, string, RGB][]) {
    const gap = 3, w = (CW - gap * (items.length - 1)) / items.length, h = 21;
    this.ensure(h + 2);
    items.forEach(([lab, val, sub, col], i) => {
      const x = M + i * (w + gap);
      const d = this.doc;
      d.setFillColor(...TINT).rect(x, this.y, w, h, "F");
      d.setFillColor(...col).rect(x, this.y, w, 0.9, "F");
      d.setFont("helvetica", "normal").setFontSize(7).setTextColor(...GREY).text(lab.toUpperCase(), x + 3, this.y + 5.5);
      d.setFont("helvetica", "bold").setFontSize(13.5).setTextColor(...col).text(val, x + 3, this.y + 12.5);
      d.setFont("helvetica", "normal").setFontSize(6.8).setTextColor(...GREY).text(d.splitTextToSize(sub, w - 5)[0], x + 3, this.y + 17.5);
    });
    this.y += h + 2;
  }

  confirmBox(items: string[], title = "Assumed / to confirm") {
    const d = this.doc;
    d.setFontSize(8);
    const lines = items.flatMap((i) => d.splitTextToSize(`- ${i}`, CW - 8));
    const h = 8 + lines.length * 3.6;
    this.ensure(h + 3);
    d.setFillColor(251, 246, 230).setDrawColor(...GOLD).setLineWidth(0.4).rect(M, this.y, CW, h, "FD");
    d.setFont("helvetica", "bold").setFontSize(8.5).setTextColor(...GOLDTXT).text(title, M + 3, this.y + 5);
    d.setFont("helvetica", "normal").setFontSize(8).setTextColor(...INK).text(lines, M + 3, this.y + 9);
    this.y += h + 3;
  }

  /** Branded table. opts.sub/total are body row indexes. */
  table(
    head: string[],
    body: RowInput[],
    o: { num?: number[]; sub?: number[]; total?: number[]; creditCols?: number[]; widths?: number[]; font?: number; left?: number; width?: number; startY?: number; rowColors?: Record<number, RGB> } = {}
  ) {
    const width = o.width ?? CW, left = o.left ?? M;
    const colStyles: Record<number, { halign?: "right"; cellWidth?: number }> = {};
    head.forEach((_, i) => {
      colStyles[i] = {};
      if (o.num?.includes(i)) colStyles[i].halign = "right";
      if (o.widths) colStyles[i].cellWidth = o.widths[i] * width;
    });
    autoTable(this.doc, {
      head: [head],
      body,
      startY: o.startY ?? this.y,
      margin: { left, right: PW - left - width, top: TOP, bottom: PH - BOTTOM },
      tableWidth: width,
      theme: "plain",
      styles: { font: "helvetica", fontSize: o.font ?? 8, textColor: INK, cellPadding: { top: this.compact ? 0.75 : 1.1, bottom: this.compact ? 0.75 : 1.1, left: 1.6, right: 1.6 }, lineColor: RULE, overflow: "linebreak" },
      headStyles: { fontStyle: "bold", textColor: BLUE },
      columnStyles: colStyles,
      didParseCell: (h: CellHookData) => {
        if (h.section === "head" && o.num?.includes(h.column.index)) h.cell.styles.halign = "right";
        if (h.section !== "body") return;
        const r = h.row.index;
        if (o.sub?.includes(r)) { h.cell.styles.fontStyle = "bold"; h.cell.styles.fillColor = TINT; }
        if (o.total?.includes(r)) { h.cell.styles.fontStyle = "bold"; h.cell.styles.textColor = BLUE; }
        if (o.creditCols?.includes(h.column.index)) h.cell.styles.textColor = RUST;
        if (o.rowColors?.[r]) h.cell.styles.textColor = o.rowColors[r];
      },
      didDrawCell: (h: CellHookData) => {
        const d = this.doc, c = h.cell;
        if (h.section === "head") {
          d.setDrawColor(...GOLD).setLineWidth(0.5).line(c.x, c.y + c.height, c.x + c.width, c.y + c.height);
        } else if (o.total?.includes(h.row.index)) {
          d.setDrawColor(...BLUE).setLineWidth(0.35).line(c.x, c.y, c.x + c.width, c.y).line(c.x, c.y + c.height, c.x + c.width, c.y + c.height);
        } else {
          d.setDrawColor(...RULE).setLineWidth(0.1).line(c.x, c.y + c.height, c.x + c.width, c.y + c.height);
        }
      },
    });
    const fy = this.lastY();
    if (o.startY === undefined) this.y = fy + 1;
    return fy;
  }

  splitBar(paybill: number, cash: number, credit: number) {
    const d = this.doc, total = paybill + cash + credit, h = 8;
    this.ensure(h + 9);
    let x = M;
    const segs: [string, number, RGB, RGB][] = [
      ["Paybill", paybill, BLUE, [255, 255, 255]],
      ["Cash/M-PESA", cash, GOLD, INK],
      ["Credit", credit, RUST, [255, 255, 255]],
    ];
    if (total <= 0) d.setFillColor(...RULE).rect(M, this.y, CW, h, "F");
    for (const [, v, col, tc] of segs) {
      if (total <= 0 || v <= 0) continue;
      const w = (CW * v) / total;
      d.setFillColor(...col).rect(x, this.y, w, h, "F");
      if (w > 14) d.setFont("helvetica", "bold").setFontSize(8).setTextColor(...tc).text(`${pct(v, total).toFixed(0)}%`, x + w / 2, this.y + h / 2 + 1.2, { align: "center" });
      x += w;
    }
    this.y += h + 4;
    segs.forEach(([lab, v, col], i) => {
      const lx = M + (i * CW) / 3;
      d.setFillColor(...col).rect(lx, this.y - 2.4, 2.8, 2.8, "F");
      d.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...(lab === "Credit" ? RUST : INK))
        .text(`${lab}  Ksh ${money(v)}  (${pct(v, total).toFixed(1)}%)`, lx + 4, this.y);
    });
    this.y += 3;
  }

  barChart(labels: string[], values: number[], height: number, highlight?: number | null, sublabels?: string[]) {
    const d = this.doc;
    this.ensure(height + 2);
    const left = M + 14, bottom = this.y + height - (sublabels ? 10 : 7), top = this.y + 5;
    const ph = bottom - top, pw = M + CW - left;
    const vmax = Math.max(1, ...values);
    const mag = 10 ** (String(Math.floor(vmax)).length - 1);
    const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => vmax / s <= 5) ?? mag;
    const amax = Math.ceil(vmax / step) * step;
    for (let v = 0; v <= amax + 1e-9; v += step) {
      const yy = bottom - (ph * v) / amax;
      d.setDrawColor(...RULE).setLineWidth(0.15).line(left, yy, M + CW, yy);
      d.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...GREY).text(money(v), left - 2, yy + 1, { align: "right" });
    }
    const slot = pw / Math.max(values.length, 1), bw = Math.min(slot * 0.62, 16);
    values.forEach((val, i) => {
      const cx = left + slot * (i + 0.5), bh = (ph * val) / amax;
      d.setFillColor(...(highlight === i ? GOLD : BLUE)).rect(cx - bw / 2, bottom - bh, bw, bh, "F");
      if (val) d.setFont("helvetica", "bold").setFontSize(6.5).setTextColor(...INK).text(money(val), cx, bottom - bh - 1, { align: "center" });
      d.setFont("helvetica", "normal").setFontSize(7).setTextColor(...INK).text(labels[i], cx, bottom + 3.8, { align: "center" });
      if (sublabels) d.setFontSize(6.3).setTextColor(...GREY).text(sublabels[i], cx, bottom + 7.3, { align: "center" });
    });
    d.setDrawColor(...GREY).setLineWidth(0.2).line(left, bottom, M + CW, bottom);
    this.y += height;
  }

  /** Header band + footer on every non-cover page, "Page x of y". */
  finish(filename: string) {
    const d = this.doc, n = d.getNumberOfPages(), { data, ratio } = this.logo;
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      if (!this.coverPages.has(i)) {
        d.setFillColor(...BLUE).rect(0, 0, PW, 5, "F");
        const lh = 16;
        d.addImage(data, "PNG", M, 8, lh * ratio, lh);
        d.setFont("helvetica", "bold").setFontSize(13.5).setTextColor(...BLUE).text(this.title, PW - M, 15, { align: "right" });
        d.setFont("helvetica", "normal").setFontSize(8.5).setTextColor(...GREY).text(this.subtitle, PW - M, 20.5, { align: "right" });
        d.setDrawColor(...GOLD).setLineWidth(0.6).line(M, 27, PW - M, 27);
      }
      d.setDrawColor(...GOLD).setLineWidth(0.25).line(M, PH - 13, PW - M, PH - 13);
      d.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...GREY);
      d.text("Lotikipi Water Limited · Purified Drinking Water", M, PH - 9);
      d.text(`Page ${i} of ${n}`, PW / 2, PH - 9, { align: "center" });
      d.text("Prepared by Austine Odundo", PW - M, PH - 9, { align: "right" });
    }
    d.setProperties({ title: filename.replace(".pdf", ""), author: "Austine Odundo", subject: "Lotikipi Water Limited" });
    d.save(filename);
  }
}

// ---------------------------------------------------------------- shared blocks

function mixTable(r: Report, rows: MixRow[], showPrice: boolean) {
  const body: RowInput[] = [], sub: number[] = [];
  let tot = 0;
  for (const s of SECTIONS) {
    const rs = rows.filter((x) => x.section === s);
    if (!rs.length) continue;
    let q = 0, a = 0;
    rs.forEach((x, i) => {
      body.push([i === 0 ? s : "", x.size, money(x.qty), UNIT[s], ...(showPrice ? [money(x.price)] : []), money(x.amount)]);
      q += x.qty; a += x.amount;
    });
    body.push([`${s} subtotal`, "", money(q), UNIT[s], ...(showPrice ? [""] : []), money(a)]);
    sub.push(body.length - 1);
    tot += a;
  }
  body.push(["Total sales", "", "", "", ...(showPrice ? [""] : []), money(tot)]);
  r.table(
    ["Section", "Size", "Qty", "Unit", ...(showPrice ? ["Unit price"] : []), "Amount (Ksh)"],
    body,
    showPrice
      ? { num: [2, 4, 5], sub, total: [body.length - 1], widths: [0.24, 0.12, 0.13, 0.11, 0.18, 0.22] }
      : { num: [2, 4], sub, total: [body.length - 1], widths: [0.3, 0.15, 0.17, 0.13, 0.25] }
  );
}

function expensesAndDeposit(r: Report, items: [string, number][], total: number, gross: number, net: number, averages?: [string, number][]) {
  const half = (CW - 6) / 2;
  const rowsE = items.length + 2, rowsD = 5 + (averages ? averages.length + 2 : 0);
  r.ensure(14 + Math.max(rowsE, rowsD) * 5.2);
  r.h2("Expenses");
  const d = r.doc;
  d.setFont("helvetica", "bold").setFontSize(10.5).setTextColor(...BLUE).text("Deposit", M + half + 6, r.y - 3);
  const y0 = r.y;
  const body: RowInput[] = [...items.map(([k, v]) => [k, money(v)]), ["Total expenses", money(total)]];
  const y1 = r.table(["Expense item", "Amount (Ksh)"], body, { num: [1], total: [body.length - 1], widths: [0.62, 0.38], width: half, startY: y0 });
  const ok = Math.abs(gross - total - net) < 0.5;
  let y2 = r.table(
    ["Deposit reconciliation", "Ksh"],
    [["Gross deposit (Cash/M-PESA)", money(gross)], ["Less: expenses", `(${money(total)})`], ["Net deposit", money(net)],
     ["Check: Gross - Expenses = Net", ok ? "OK" : `DIFF ${money(gross - total - net)}`]],
    { num: [1], total: [2], widths: [0.62, 0.38], width: half, left: M + half + 6, startY: y0, rowColors: { 3: ok ? OKGREEN : RUST } }
  );
  if (averages)
    y2 = r.table(["Averages", "Ksh"], averages.map(([k, v]) => [k, money(Math.round(v))]),
      { num: [1], widths: [0.62, 0.38], width: half, left: M + half + 6, startY: y2 + 4 });
  r.y = Math.max(y1, y2) + 1;
}

const LEDGER_HEAD = ["Date", "Day", "Refills", "Completes", "Cartons", "Total", "Paybill", "Cash/M-PESA", "Credit", "Expenses", "Net dep."];
const LEDGER_W = [0.1, 0.05, 0.09, 0.095, 0.09, 0.1, 0.085, 0.115, 0.08, 0.09, 0.105];
function ledgerRow(days: DayMap, x: Date): RowInput {
  const d = days[toKey(x)];
  if (!d) return [kdate(x), wd3(x), { content: "no summary", colSpan: 9, styles: { textColor: GREY, fontStyle: "italic" } }];
  const a = agg([d]);
  return [kdate(x), wd3(x), money(a.refills), money(a.completes), money(a.cartons), money(a.sales), money(a.paybill), money(a.cash), money(a.credit), money(a.expenses), money(a.net)];
}
const aggRow = (label: string, a: Agg): RowInput =>
  [{ content: label, colSpan: 2 }, money(a.refills), money(a.completes), money(a.cartons), money(a.sales), money(a.paybill), money(a.cash), money(a.credit), money(a.expenses), money(a.net)];

const kpiSet = (a: Agg, first: string, firstSub: string): [string, string, string, RGB][] => [
  [first, `Ksh ${money(a.sales)}`, firstSub, BLUE],
  ["Cash/M-PESA", `Ksh ${money(a.cash)}`, `Paybill Ksh ${money(a.paybill)}`, BLUE],
  ["Credit", `Ksh ${money(a.credit)}`, `${pct(a.credit, a.sales).toFixed(1)}% of sales`, RUST],
  ["Net deposit", `Ksh ${money(a.net)}`, `after expenses Ksh ${money(a.expenses)}`, BLUE],
];

// ---------------------------------------------------------------- reports

export async function dailyReport(days: DayMap, date: string) {
  const d = days[date];
  const r = new Report(`Daily Sales Report - ${kday(date)}`, "Lotikipi Water Limited, Lodwar, Turkana", await loadLogo());
  r.compact = true;
  const flags = [...d.assumed, ...runChecks(d)];
  if (flags.length) r.confirmBox(flags);
  r.kpis([
    ["Total sales", `Ksh ${money(d.totalSales)}`, `${d.lines.length} product lines`, BLUE],
    ["Cash/M-PESA", `Ksh ${money(d.cashMpesa)}`, `Paybill Ksh ${money(paybillTotal(d))}`, BLUE],
    ["Credit", `Ksh ${money(d.credit)}`, `${pct(d.credit, d.totalSales).toFixed(1)}% of sales`, RUST],
    ["Net deposit", `Ksh ${money(d.netDeposit)}`, `after expenses Ksh ${money(d.expensesTotal)}`, BLUE],
  ]);
  r.h2("Product mix");
  mixTable(r, [...d.lines].sort(lineSort).map((l) => ({ ...l })), true);
  r.para(`Volumes: Refills ${money(secQty(d, "Refills"))} units · Completes ${money(secQty(d, "Completes"))} pcs · Cartons ${money(secQty(d, "Cartons"))} ctns`, 7.5, GREY);
  r.h2("Payment split");
  r.splitBar(paybillTotal(d), d.cashMpesa, d.credit);
  if (d.paybill.filter((x) => x).length > 1)
    r.para(`Paybill = ${d.paybill.filter((x) => x).map(money).join(" + ")} = ${money(paybillTotal(d))}`, 7.5, GREY);
  expensesAndDeposit(r, d.expenses.map((e) => [e.item, e.amount]), d.expensesTotal, d.grossDeposit, d.netDeposit);

  const prevKey = Object.keys(days).filter((k) => k < date).sort().pop();
  const p = prevKey ? days[prevKey] : null;
  const day = parseKey(date);
  const mtdDays = daysIn(days, new Date(day.getFullYear(), day.getMonth(), 1), day);
  const mtd = agg(mtdDays);
  const rows: [string, number, number | null, number][] = [
    ["Total sales", d.totalSales, p?.totalSales ?? null, mtd.sales],
    ["Cash/M-PESA", d.cashMpesa, p?.cashMpesa ?? null, mtd.cash],
    ["Credit", d.credit, p?.credit ?? null, mtd.credit],
    ["Expenses", d.expensesTotal, p?.expensesTotal ?? null, mtd.expenses],
    ["Net deposit", d.netDeposit, p?.netDeposit ?? null, mtd.net],
  ];
  r.h2("Comparison");
  r.table(
    ["Comparison", "Today", p ? `Previous (${kdate(p.date)})` : "Previous day", "Change", `Month to date (${mtdDays.length} d)`],
    rows.map(([l, c, pv, m]) => [l, money(c), money(pv), change(c, pv), money(m)]),
    { num: [1, 2, 3, 4], widths: [0.18, 0.16, 0.22, 0.22, 0.22], rowColors: { 2: RUST } }
  );
  r.h2("Notes");
  r.para(d.notes || "No notes.");
  r.finish(`Lotikipi_Daily_Report_${date}.pdf`);
}

export async function weeklyReport(days: DayMap, anyDate: string) {
  const [start, end] = weekBounds(parseKey(anyDate));
  const ds = daysIn(days, start, end);
  const a = agg(ds);
  const prevDs = daysIn(days, addDays(start, -7), addDays(end, -7));
  const pa = agg(prevDs);
  const r = new Report(`Weekly Sales Report - ${kdate(start)} to ${kdate(end)}`, "Monday to Sunday · Lodwar, Turkana", await loadLogo());
  r.kpis(kpiSet(a, "Week sales", `${ds.length} of 7 days · avg ${money(Math.round(ds.length ? a.sales / ds.length : 0))}/day`));
  r.h2("Day-by-day ledger (Ksh)");
  const dates = dateRange(start, end);
  const body = [...dates.map((x) => ledgerRow(days, x)), aggRow("Week total", a)];
  r.table(LEDGER_HEAD, body, { num: [2, 3, 4, 5, 6, 7, 8, 9, 10], total: [body.length - 1], creditCols: [8], widths: LEDGER_W, font: 7.5 });
  const vals = dates.map((x) => days[toKey(x)]?.totalSales ?? 0);
  const rec = dates.map((x, i) => (days[toKey(x)] ? i : -1)).filter((i) => i >= 0);
  const best = rec.length ? rec.reduce((b, i) => (vals[i] > vals[b] ? i : b), rec[0]) : null;
  const worst = rec.length ? rec.reduce((b, i) => (vals[i] < vals[b] ? i : b), rec[0]) : null;
  r.h2("Daily sales");
  r.barChart(dates.map(wd3), vals, 50, best, dates.map((x) => kdate(x).slice(0, 5)));
  r.para("Gold bar = best day.", 7, GREY);
  r.h2("Product mix totals");
  mixTable(r, mix(ds, false), false);
  r.h2("Payment split");
  r.splitBar(a.paybill, a.cash, a.credit);
  expensesAndDeposit(r, expenseItems(ds), a.expenses, a.gross, a.net);
  r.h2("Highlights");
  if (best !== null && worst !== null) {
    r.para(`Best day: ${kday(dates[best])} - Ksh ${money(vals[best])}`);
    r.para(`Weakest day: ${kday(dates[worst])} - Ksh ${money(vals[worst])}`);
  }
  r.para(prevDs.length
    ? `Vs previous week: Ksh ${money(pa.sales)} to Ksh ${money(a.sales)}, ${change(a.sales, pa.sales)}; net deposit ${change(a.net, pa.net)}`
    : "Vs previous week: no data recorded for previous week");
  const missing = dates.filter((x) => !days[toKey(x)]).map(kdate);
  if (missing.length) r.para(`Days without a summary: ${missing.join(", ")}`);
  r.h2("Days with notes");
  const notes = ds.filter((d) => d.notes);
  if (notes.length) notes.forEach((d) => r.para(`${kdate(d.date)}: ${d.notes}`));
  else r.para("No notes this week.");
  r.finish(`Lotikipi_Weekly_Report_${toKey(start)}_to_${toKey(end)}.pdf`);
}

export async function monthlyReport(days: DayMap, year: number, month0: number, prevTotal?: number | null) {
  const first = new Date(year, month0, 1), last = lastOfMonth(year, month0);
  const ds = daysIn(days, first, last);
  const a = agg(ds), n = ds.length;
  const mname = `${MONTHS[month0]} ${year}`;
  const pLast = addDays(first, -1);
  const pds = daysIn(days, new Date(pLast.getFullYear(), pLast.getMonth(), 1), pLast);
  if ((prevTotal === undefined || prevTotal === null) && pds.length) prevTotal = agg(pds).sales;
  const logo = await loadLogo();
  const r = new Report(`Monthly Sales Report - ${mname}`, `${kdate(first)} to ${kdate(last)}`, logo);
  const d = r.doc;

  // cover
  r.coverPages.add(1);
  d.setFillColor(...BLUE).rect(0, 0, PW, 8, "F");
  const lw = 120;
  d.addImage(logo.data, "PNG", (PW - lw) / 2, 60, lw, lw / logo.ratio);
  d.setDrawColor(...GOLD).setLineWidth(0.7).line(PW / 2 - 50, 140, PW / 2 + 50, 140);
  d.setFont("helvetica", "bold").setFontSize(26).setTextColor(...BLUE).text("Monthly Sales Report", PW / 2, 160, { align: "center" });
  d.setFont("helvetica", "normal").setFontSize(18).setTextColor(...GOLDTXT).text(mname, PW / 2, 172, { align: "center" });
  d.setFontSize(10).setTextColor(...GREY)
    .text(`Period ${kdate(first)} to ${kdate(last)} · ${n} trading days recorded`, PW / 2, 186, { align: "center" })
    .text("Lotikipi Water Limited · Lodwar, Turkana, Kenya", PW / 2, 193, { align: "center" });
  d.setTextColor(...INK).text("Prepared by Austine Odundo, Operations Manager", PW / 2, PH - 45, { align: "center" });
  d.setTextColor(...GREY).text(`Issued ${kdate(new Date())}`, PW / 2, PH - 39, { align: "center" });

  r.newPage();
  r.kpis(kpiSet(a, "Month sales", `${n} days · avg ${money(Math.round(n ? a.sales / n : 0))}/day`));
  r.h2("Daily ledger with weekly subtotals (Ksh)");
  const body: RowInput[] = [], sub: number[] = [], weeks: [Date, Date, Agg][] = [];
  for (let x = first; x <= last; ) {
    const we = weekBounds(x)[1] < last ? weekBounds(x)[1] : last;
    dateRange(x, we).forEach((dd) => body.push(ledgerRow(days, dd)));
    const wa = agg(daysIn(days, x, we));
    weeks.push([x, we, wa]);
    body.push(aggRow(`Week ${weeks.length} subtotal`, wa));
    sub.push(body.length - 1);
    x = addDays(we, 1);
  }
  body.push(aggRow("Month total", a));
  r.table(LEDGER_HEAD, body, { num: [2, 3, 4, 5, 6, 7, 8, 9, 10], sub, total: [body.length - 1], creditCols: [8], widths: LEDGER_W, font: 7 });

  r.newPage();
  r.h2("Weekly comparison", 2);
  r.barChart(weeks.map((_, i) => `Week ${i + 1}`), weeks.map((w) => w[2].sales), 55, null,
    weeks.map(([s, e]) => `${kdate(s).slice(0, 5)}-${kdate(e).slice(0, 5)}`));
  r.h2("Product mix by size and price");
  mixTable(r, mix(ds, true), true);
  r.h2("Payment split");
  r.splitBar(a.paybill, a.cash, a.credit);
  r.para(`Credit share of sales: ${pct(a.credit, a.sales).toFixed(1)}%`, 8.5, RUST, true);
  expensesAndDeposit(r, expenseItems(ds), a.expenses, a.gross, a.net, [
    ["Average daily sales", n ? a.sales / n : 0],
    ["Average daily expenses", n ? a.expenses / n : 0],
    ["Average daily net deposit", n ? a.net / n : 0],
  ]);
  r.h2("Change vs previous month");
  r.para(prevTotal !== undefined && prevTotal !== null
    ? `Previous month sales Ksh ${money(prevTotal)} to this month Ksh ${money(a.sales)}: ${change(a.sales, prevTotal)}`
    : "Previous month figure not provided.");
  r.h2("Summary of notes");
  const notes = ds.filter((x) => x.notes);
  if (notes.length) notes.forEach((x) => r.para(`${kdate(x.date)}: ${x.notes}`));
  else r.para("No notes recorded this month.");
  const missing = dateRange(first, last).filter((x) => !days[toKey(x)]).map(kdate);
  if (missing.length) r.para(`Days without a summary (${missing.length}): ${missing.join(", ")}`, 7.5, GREY);

  r.h2("Sign-off");
  r.ensure(34);
  const y = r.y + 16, half = CW * 0.42;
  d.setDrawColor(...INK).setLineWidth(0.3).line(M, y, M + half, y).line(PW - M - half, y, PW - M, y);
  d.setFont("helvetica", "bold").setFontSize(9).setTextColor(...BLUE).text("Austine Odundo", M, y + 5).text("Director", PW - M - half, y + 5);
  d.setFont("helvetica", "normal").setFontSize(8).setTextColor(...GREY).text("Operations Manager", M, y + 9.5)
    .text("Date: ____________________", M, y + 17).text("Date: ____________________", PW - M - half, y + 17);
  r.y = y + 20;
  r.finish(`Lotikipi_Monthly_Report_${MONTHS[month0]}_${year}.pdf`);
}
