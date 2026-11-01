import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { todayKey } from "../lib/dates";
import {
  MONTHS, agg, daysIn, kdate, lastOfMonth, money, parseKey, pct, runChecks, wd3, type DayMap,
} from "../sales/model";
import { loadAllDays } from "../sales/store";

export default function Sales() {
  const [days, setDays] = useState<DayMap | null>(null);
  const [err, setErr] = useState("");
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [dailyDate, setDailyDate] = useState("");
  const [weekDate, setWeekDate] = useState(todayKey());
  const [prevTotal, setPrevTotal] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    loadAllDays()
      .then((d) => {
        setDays(d);
        const latest = Object.keys(d).sort().pop();
        if (latest) { setDailyDate(latest); setWeekDate(latest); setMonth(latest.slice(0, 7)); }
      })
      .catch((e) => setErr(`Could not load sales: ${String(e)}. If this says "permission", add the salesDays rule (see README).`));
  }, []);

  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1), last = lastOfMonth(y, m - 1);
  const monthDays = useMemo(() => (days ? daysIn(days, first, last) : []), [days, month]);
  const a = agg(monthDays);
  const keys = days ? Object.keys(days).sort() : [];
  const latest = keys[keys.length - 1];

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try { await fn(); } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  }
  const pdf = () => import("../sales/pdf");

  if (err && !days) return <div className="page"><h1>Sales</h1><p className="error-text">{err}</p></div>;
  if (!days) return <div className="page"><p className="muted">Loading…</p></div>;

  const latestD = latest ? parseKey(latest) : null;
  const weeklyDue = latestD && latestD.getDay() === 0;
  const monthlyDue = latestD && latestD.getDate() === lastOfMonth(latestD.getFullYear(), latestD.getMonth()).getDate();

  return (
    <div className="page">
      <h1>Sales register</h1>
      <p className="muted">Daily "SUMMARY ON" pages, checks and branded reports. Ksh.</p>
      <Link to="/sales/day/new"><button>+ Record a day</button></Link>

      {(weeklyDue || monthlyDue) && latest && (
        <section className="card attention-card">
          {weeklyDue && <p>Weekly report is due (week ending {kdate(latest)}).{" "}
            <button className="link-btn" onClick={() => run("w", async () => (await pdf()).weeklyReport(days, latest))}>Download</button></p>}
          {monthlyDue && latestD && <p>Monthly report is due for {MONTHS[latestD.getMonth()]}.{" "}
            <button className="link-btn" onClick={() => run("m", async () => (await pdf()).monthlyReport(days, latestD.getFullYear(), latestD.getMonth()))}>Download</button></p>}
        </section>
      )}

      <section className="card">
        <label>
          Month
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <div className="kpi-grid">
          <div className="kpi"><span>Sales</span><strong>{money(a.sales)}</strong><em>{a.n} days</em></div>
          <div className="kpi"><span>Cash/M-PESA</span><strong>{money(a.cash)}</strong><em>Paybill {money(a.paybill)}</em></div>
          <div className="kpi kpi-credit"><span>Credit</span><strong>{money(a.credit)}</strong><em>{pct(a.credit, a.sales).toFixed(1)}% of sales</em></div>
          <div className="kpi"><span>Net deposit</span><strong>{money(a.net)}</strong><em>Expenses {money(a.expenses)}</em></div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date</th><th className="num">Sales</th><th className="num">Credit</th><th className="num">Net dep.</th><th>Checks</th></tr>
            </thead>
            <tbody>
              {[...monthDays].reverse().map((d) => {
                const bad = runChecks(d).length > 0 || d.assumed.length > 0;
                return (
                  <tr key={d.date}>
                    <td><Link to={`/sales/day/${d.date}`}>{wd3(d.date)} {kdate(d.date)}</Link></td>
                    <td className="num">{money(d.totalSales)}</td>
                    <td className="num credit">{money(d.credit)}</td>
                    <td className="num">{money(d.netDeposit)}</td>
                    <td>{bad ? <span className="badge badge-bad">confirm</span> : <span className="badge badge-ok">OK</span>}</td>
                  </tr>
                );
              })}
              {monthDays.length === 0 && <tr><td colSpan={5} className="muted">No days recorded this month.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Reports</h2>
        <label>
          Daily report
          <select value={dailyDate} onChange={(e) => setDailyDate(e.target.value)}>
            {keys.length === 0 && <option value="">No days recorded yet</option>}
            {[...keys].reverse().map((k) => <option key={k} value={k}>{wd3(k)} {kdate(k)}</option>)}
          </select>
        </label>
        <button disabled={!dailyDate || !!busy} onClick={() => run("d", async () => (await pdf()).dailyReport(days, dailyDate))}>
          {busy === "d" ? "Preparing…" : "Download daily PDF"}
        </button>

        <label>
          Weekly report (Mon–Sun week containing)
          <input type="date" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
        </label>
        <button disabled={!!busy} onClick={() => run("w", async () => (await pdf()).weeklyReport(days, weekDate))}>
          {busy === "w" ? "Preparing…" : "Download weekly PDF"}
        </button>

        <label>
          Monthly report: {MONTHS[m - 1]} {y}
          <input inputMode="decimal" placeholder="Previous month's sales (optional)" value={prevTotal} onChange={(e) => setPrevTotal(e.target.value)} />
        </label>
        <button disabled={!!busy} onClick={() => run("m", async () => (await pdf()).monthlyReport(days, y, m - 1, prevTotal.trim() ? Number(prevTotal.replace(/,/g, "")) : null))}>
          {busy === "m" ? "Preparing…" : "Download monthly PDF"}
        </button>

        <h3>Excel register</h3>
        <button className="secondary" disabled={!!busy} onClick={() => run("x", async () => (await import("../sales/excel")).downloadRegister(days, y))}>
          {busy === "x" ? "Preparing…" : `Download Lotikipi_Sales_Register_${y}.xlsx`}
        </button>
        {err && <p className="error-text">{err}</p>}
      </section>
    </div>
  );
}
