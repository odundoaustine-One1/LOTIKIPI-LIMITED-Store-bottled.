import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { todayKey } from "../lib/dates";
import { ageDays, creditRows, kdate, money, sum, wd3, type DayMap, type DueRow } from "../sales/model";
import { loadAllDays, recordCreditPayment } from "../sales/store";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const who = (r: { customer: string }) => r.customer || "Not named";

// All credit sales still owed, across every recorded day, oldest first,
// with repayments recorded against each one.
export default function CreditDue() {
  const { profile } = useAuth();
  const [days, setDays] = useState<DayMap | null>(null);
  const [err, setErr] = useState("");
  const [showCleared, setShowCleared] = useState(false);
  const [paying, setPaying] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayKey());
  const [busy, setBusy] = useState(false);

  const reload = () =>
    loadAllDays()
      .then(setDays)
      .catch((e) => setErr(`Could not load sales: ${String(e)}`));
  useEffect(() => { reload(); }, []);

  const today = todayKey();
  const rows = useMemo(() => (days ? creditRows(days) : []), [days]);
  const due = rows.filter((r) => r.balance > 0.5);
  const shown = showCleared ? rows : due;
  const total = sum(due.map((r) => r.balance));
  const over30 = sum(due.filter((r) => ageDays(r.date, today) > 30).map((r) => r.balance));
  const byCustomer = useMemo(() => {
    const m = new Map<string, { balance: number; n: number; oldest: string }>();
    for (const r of due) {
      const k = who(r);
      const x = m.get(k) ?? { balance: 0, n: 0, oldest: r.date };
      x.balance += r.balance;
      x.n += 1;
      if (r.date < x.oldest) x.oldest = r.date;
      m.set(k, x);
    }
    return [...m.entries()].sort((a, b) => b[1].balance - a[1].balance);
  }, [due]);

  const rowKey = (r: DueRow) => `${r.date}#${r.index}`;

  function startPay(r: DueRow) {
    setPaying(rowKey(r));
    setPayAmount(String(r.balance));
    setPayDate(today);
    setErr("");
  }

  async function pay(r: DueRow) {
    if (!profile) return;
    const amt = num(payAmount);
    if (Number.isNaN(amt) || amt <= 0) return setErr("Enter the amount received.");
    if (amt > r.balance + 0.5) return setErr(`That is more than the Ksh ${money(r.balance)} still due.`);
    setBusy(true);
    setErr("");
    try {
      await recordCreditPayment(r.date, r.index, payDate, amt, profile.uid);
      setPaying(null);
      await reload();
    } catch (e) {
      setErr(`Could not save payment: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  if (err && !days) return <div className="page"><h1>Credit due</h1><p className="error-text">{err}</p></div>;
  if (!days) return <div className="page"><p className="muted">Loading…</p></div>;

  return (
    <div className="page">
      <p><Link to="/sales">&larr; Sales</Link></p>
      <h1>Credit due</h1>
      <p className="muted">Every credit sale still owed, from all recorded days. Ksh.</p>

      <section className="card">
        <div className="kpi-grid">
          <div className="kpi kpi-credit"><span>Total due</span><strong>{money(total)}</strong><em>{due.length} {due.length === 1 ? "sale" : "sales"}</em></div>
          <div className="kpi kpi-credit"><span>Over 30 days</span><strong>{money(over30)}</strong><em>{pct0(over30, total)}% of due</em></div>
          <div className="kpi"><span>Credit given</span><strong>{money(sum(rows.map((r) => r.amount)))}</strong><em>all time</em></div>
          <div className="kpi"><span>Repaid</span><strong>{money(sum(rows.map((r) => r.paid)))}</strong><em>all time</em></div>
        </div>
      </section>

      {byCustomer.length > 0 && (
        <section className="card">
          <h2>By customer</h2>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Customer</th><th className="num">Sales</th><th>Oldest</th><th className="num">Due</th></tr></thead>
              <tbody>
                {byCustomer.map(([name, x]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="num">{x.n}</td>
                    <td>{kdate(x.oldest)}</td>
                    <td className="num credit">{money(x.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2>{showCleared ? "All credit sales" : "Sales due"}</h2>
        <label className="check-label">
          <input type="checkbox" checked={showCleared} onChange={(e) => setShowCleared(e.target.checked)} />
          Show sales already paid
        </label>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Date</th><th>Customer</th><th className="num">Credit</th><th className="num">Paid</th><th className="num">Due</th><th className="num">Age</th><th></th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={rowKey(r)}>
                  <tr>
                    <td><Link to={`/sales/day/${r.date}`}>{wd3(r.date)} {kdate(r.date)}</Link></td>
                    <td>{r.customer || <span className="muted">Not named</span>}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="num">{money(r.paid)}</td>
                    <td className="num credit">{money(r.balance)}</td>
                    <td className="num">{ageDays(r.date, today)}d</td>
                    <td>
                      {r.balance > 0.5
                        ? <button className="link-btn" onClick={() => startPay(r)}>Record payment</button>
                        : <span className="badge badge-ok">Paid{r.lastPaid ? ` ${kdate(r.lastPaid)}` : ""}</span>}
                    </td>
                  </tr>
                  {paying === rowKey(r) && (
                    <tr>
                      <td colSpan={7}>
                        <div className="sale-row">
                          <input inputMode="decimal" value={payAmount} placeholder="amount received" onChange={(e) => setPayAmount(e.target.value)} />
                          <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                          <button disabled={busy} onClick={() => pay(r)}>{busy ? "Saving…" : "Save"}</button>
                          <button className="link-btn" onClick={() => setPaying(null)}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {shown.length === 0 && <tr><td colSpan={7} className="muted">No credit sales due.</td></tr>}
              {shown.length > 0 && (
                <tr>
                  <th colSpan={2}>Total</th>
                  <th className="num">{money(sum(shown.map((r) => r.amount)))}</th>
                  <th className="num">{money(sum(shown.map((r) => r.paid)))}</th>
                  <th className="num credit">{money(sum(shown.map((r) => r.balance)))}</th>
                  <th colSpan={2}></th>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {err && <p className="error-text">{err}</p>}
        <p className="muted">To name who took credit on a day, open the day and fill in "Who took credit".</p>
      </section>
    </div>
  );
}

const pct0 = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
