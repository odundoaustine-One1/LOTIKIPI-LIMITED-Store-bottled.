import ExcelJS from "exceljs";
import { lineSort, money, parseKey, paybillTotal, runChecks, secTotal, wd3, type DayMap } from "./model";

const BLUE = "FF0000B9", GOLD = "FFD4AF37", RUST = "FFC2410C";
const NUM = "#,##0;-#,##0;0";

/** Lotikipi_Sales_Register_YYYY.xlsx built from every saved day of that year. */
export async function downloadRegister(all: DayMap, year: number) {
  const days = Object.keys(all).filter((k) => k.startsWith(`${year}-`)).sort().map((k) => all[k]);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Austine Odundo";

  function sheet(name: string, cols: [string, number][], rows: unknown[][], o: { num?: number[]; credit?: number; wrap?: number[] } = {}) {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = cols.map(([header, width]) => ({ header, width }));
    rows.forEach((r) => ws.addRow(r));
    ws.getRow(1).eachCell((c) => {
      c.font = { bold: true, color: { argb: "FFFFFFFF" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
      c.border = { bottom: { style: "medium", color: { argb: GOLD } } };
      c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    });
    ws.eachRow((row, i) => {
      if (i === 1) return;
      row.eachCell({ includeEmpty: true }, (c, col) => {
        if (col === 1 && c.value instanceof Date) c.numFmt = "dd/mm/yyyy";
        if (o.num?.includes(col)) { c.numFmt = NUM; c.alignment = { horizontal: "right" }; }
        if (o.wrap?.includes(col)) c.alignment = { wrapText: true, vertical: "top" };
        if (o.credit === col) c.font = { color: { argb: RUST } };
      });
    });
    if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    return ws;
  }
  // UTC midnight so Excel shows the same calendar date everywhere.
  const xd = (k: string) => { const d = parseKey(k); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); };

  sheet("Daily Lines", [["Date", 12], ["Section", 12], ["Size", 8], ["Qty", 8], ["Unit price (Ksh)", 16], ["Amount (Ksh)", 15]],
    days.flatMap((d) => [...d.lines].sort(lineSort).map((l) => [xd(d.date), l.section, l.size, l.qty, l.price, l.amount])),
    { num: [4, 5, 6] });

  const sum = sheet("Daily Summary",
    [["Date", 12], ["Day", 6], ["Refills", 11], ["Completes", 11], ["Cartons", 11], ["Total sales", 12], ["Paybill", 11],
     ["Paybill breakdown", 18], ["Cash/M-PESA", 12], ["Credit", 10], ["Expenses (itemised)", 34], ["Expenses total", 11],
     ["Gross deposit", 12], ["Net deposit", 12], ["Notes", 36], ["Checks", 14], ["Assumed / to confirm", 30]],
    days.map((d) => {
      const iss = runChecks(d);
      const pb = d.paybill.filter((x) => x);
      return [xd(d.date), wd3(d.date), secTotal(d, "Refills"), secTotal(d, "Completes"), secTotal(d, "Cartons"), d.totalSales,
        paybillTotal(d), pb.length > 1 ? pb.map(money).join(" + ") : "", d.cashMpesa, d.credit,
        d.expenses.map((e) => `${e.item} ${money(e.amount)}`).join("; "), d.expensesTotal, d.grossDeposit, d.netDeposit,
        d.notes, iss.length ? iss.join("; ") : "OK", d.assumed.join("; ")];
    }),
    { num: [3, 4, 5, 6, 7, 9, 10, 12, 13, 14], credit: 10, wrap: [11, 15, 16, 17] });
  if (days.length) {
    const n = days.length + 1;
    const f = (c: string) => ({ formula: `SUM(${c}2:${c}${n})` });
    const row = sum.addRow(["TOTAL", null, f("C"), f("D"), f("E"), f("F"), f("G"), null, f("I"), f("J"), null, f("L"), f("M"), f("N")]);
    row.eachCell((c, col) => {
      c.font = { bold: true, color: { argb: col === 10 ? RUST : BLUE } };
      c.numFmt = NUM;
      c.border = { top: { style: "thin", color: { argb: BLUE } } };
    });
  }

  sheet("Expenses", [["Date", 12], ["Item", 24], ["Amount (Ksh)", 14]],
    days.flatMap((d) => d.expenses.map((e) => [xd(d.date), e.item, e.amount])), { num: [3] });

  sheet("Notes", [["Date", 12], ["Note", 70], ["Assumed / to confirm", 50]],
    days.filter((d) => d.notes || d.assumed.length).map((d) => [xd(d.date), d.notes, d.assumed.join("; ")]), { wrap: [2, 3] });

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Lotikipi_Sales_Register_${year}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
