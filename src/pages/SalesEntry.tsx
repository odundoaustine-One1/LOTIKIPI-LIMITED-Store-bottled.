import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { todayKey } from "../lib/dates";
import {
  DEFAULT_PRICE, SECTIONS, SIZES, UNIT, kday, lastOfMonth, money, parseKey, runChecks, summaryLines, sum,
  type Section, type SalesDay,
} from "../sales/model";
import { getDay, loadAllDays, saveDay } from "../sales/store";

interface LineForm { section: Section; size: string; qty: string; price: string; amount: string }
interface ExpForm { item: string; amount: string }

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const orElse = (s: string, fallback: number) => (Number.isNaN(num(s)) ? fallback : num(s));

const DEFAULT_EXPENSES = ["Lunch", "Supper", "Bike", "Loaders"];

function blankLines(): LineForm[] {
  return SECTIONS.flatMap((s) =>
    SIZES[s].map((size) => ({ section: s, size, qty: "", price: DEFAULT_PRICE[s][size] ? String(DEFAULT_PRICE[s][size]) : "", amount: "" }))
  );
}

export default function SalesEntry() {
  const { date: routeDate } = useParams();
  const nav = useNavigate();
  const { profile } = useAuth();
  const [date, setDate] = useState(routeDate && routeDate !== "new" ? routeDate : todayKey());
  const [existing, setExisting] = useState<SalesDay | null>(null);
  const [loading, setLoading] = useState(false);
  const [lines, setLines] = useState<LineForm[]>(blankLines());
  const [total, setTotal] = useState("");
  const [paybill, setPaybill] = useState<string[]>([""]);
  const [cash, setCash] = useState("");
  const [credit, setCredit] = useState("");
  const [exps, setExps] = useState<ExpForm[]>(DEFAULT_EXPENSES.map((item) => ({ item, amount: "" })));
  const [expTotal, setExpTotal] = useState("");
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [notes, setNotes] = useState("");
  const [assumed, setAssumed] = useState("");
  const [ack, setAck] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  // Load an existing day (for corrections) whenever the date changes.
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setSaved(false);
    setAck(false);
    getDay(date)
      .then((d) => {
        if (cancel) return;
        setExisting(d);
        if (!d) {
          // New day: start from a clean form so nothing carries over from another date.
          setLines(blankLines());
          setTotal("");
          setPaybill([""]);
          setCash("");
          setCredit("");
          setExps(DEFAULT_EXPENSES.map((item) => ({ item, amount: "" })));
          setExpTotal("");
          setGross("");
          setNet("");
          setNotes("");
          setAssumed("");
          return;
        }
        const base = blankLines().filter((b) => !d.lines.some((l) => l.section === b.section && l.size === b.size));
        setLines([...d.lines.map((l) => ({ section: l.section, size: l.size, qty: String(l.qty), price: String(l.price), amount: String(l.amount) })), ...base]
          .sort((a, b) => SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section)));
        setTotal(String(d.totalSales));
        setPaybill(d.paybill.length ? d.paybill.map(String) : [""]);
        setCash(String(d.cashMpesa));
        setCredit(String(d.credit));
        setExps(d.expenses.map((e) => ({ item: e.item, amount: String(e.amount) })));
        setExpTotal(String(d.expensesTotal));
        setGross(String(d.grossDeposit));
        setNet(String(d.netDeposit));
        setNotes(d.notes);
        setAssumed(d.assumed.join("\n"));
      })
      .catch((e) => setErr(String(e)))
      .finally(() => !cancel && setLoading(false));
    return () => { cancel = true; };
  }, [date]);

  // Build the day. Blank "written" totals fall back to the computed value.
  const day: SalesDay = useMemo(() => {
    const ls = lines
      .filter((l) => !Number.isNaN(num(l.qty)) && num(l.qty) !== 0)
      .map((l) => {
        const qty = num(l.qty), price = orElse(l.price, 0);
        return { section: l.section, size: l.size, qty, price, amount: orElse(l.amount, qty * price) };
      });
    const es = exps.filter((e) => e.item.trim() && !Number.isNaN(num(e.amount))).map((e) => ({ item: e.item.trim(), amount: num(e.amount) }));
    const pb = paybill.map((p) => orElse(p, 0)).filter((x) => x);
    const T = orElse(total, sum(ls.map((l) => l.amount)));
    const cr = orElse(credit, 0);
    const c = orElse(cash, T - sum(pb) - cr);
    const et = orElse(expTotal, sum(es.map((e) => e.amount)));
    const g = orElse(gross, c);
    return {
      date, lines: ls, totalSales: T, paybill: pb, cashMpesa: c, credit: cr, expenses: es, expensesTotal: et,
      grossDeposit: g, netDeposit: orElse(net, g - et), notes: notes.trim(),
      assumed: assumed.split("\n").map((s) => s.trim()).filter(Boolean),
    };
  }, [date, lines, total, paybill, cash, credit, exps, expTotal, gross, net, notes, assumed]);

  const issues = runChecks(day);
  const d0 = parseKey(date);
  const isSunday = d0.getDay() === 0;
  const isMonthEnd = d0.getDate() === lastOfMonth(d0.getFullYear(), d0.getMonth()).getDate();
  const canSave = !loading && day.lines.length > 0 && (!issues.length || ack) && (!existing || ack) && !saving;

  function setLine(i: number, patch: Partial<LineForm>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function addLine(section: Section) {
    setLines((ls) => {
      const idx = ls.map((l) => l.section).lastIndexOf(section);
      const copy = [...ls];
      copy.splice(idx + 1, 0, { section, size: SIZES[section][0], qty: "", price: "", amount: "" });
      return copy;
    });
  }

  async function save() {
    if (!profile) return;
    setSaving(true);
    setErr("");
    try {
      await saveDay(day, profile.uid, !existing);
      setExisting(day);
      setSaved(true);
      setAck(false);
    } catch (e) {
      setErr(`Could not save: ${String(e)}. If this says "permission", the Firestore rules need the salesDays rule (see README).`);
    } finally {
      setSaving(false);
    }
  }

  async function download(kind: "daily" | "weekly" | "monthly") {
    const pdf = await import("../sales/pdf");
    const all = await loadAllDays();
    if (kind === "daily") await pdf.dailyReport(all, date);
    if (kind === "weekly") await pdf.weeklyReport(all, date);
    if (kind === "monthly") await pdf.monthlyReport(all, d0.getFullYear(), d0.getMonth());
  }

  const computed = sum(day.lines.map((l) => l.amount));

  return (
    <div className="page">
      <p><Link to="/sales">&larr; Sales</Link></p>
      <h1>{existing ? "Correct day" : "Record day"}</h1>
      <p className="muted">Enter the figures exactly as written on the "SUMMARY ON" page. Leave a total blank to use the calculated value.</p>

      <section className="card">
        <label>
          Summary date
          <input type="date" value={date} onChange={(e) => { setDate(e.target.value); nav(`/sales/day/${e.target.value}`, { replace: true }); }} />
        </label>
        <p className="muted">{kday(date)}</p>
        {loading && <p className="muted">Loading…</p>}
        {existing && !saved && (
          <p className="attention-inline">This day is already recorded. Saving will replace it (correction).</p>
        )}
      </section>

      {/* Locked while a date loads, so figures typed meanwhile are not wiped when it arrives. */}
      <fieldset className="plain-fieldset" disabled={loading}>
      {SECTIONS.map((s) => (
        <section className="card" key={s}>
          <h2>{s} <span className="muted">({UNIT[s]})</span></h2>
          <div className="line-grid line-head">
            <span>Size</span><span>Qty</span><span>Price</span><span>Amount</span>
          </div>
          {lines.map((l, i) =>
            l.section !== s ? null : (
              <div className="line-grid" key={i}>
                <select value={l.size} onChange={(e) => setLine(i, { size: e.target.value })}>
                  {SIZES[s].map((z) => <option key={z}>{z}</option>)}
                </select>
                <input inputMode="decimal" value={l.qty} placeholder="0" onChange={(e) => setLine(i, { qty: e.target.value })} />
                <input inputMode="decimal" value={l.price} placeholder="price" onChange={(e) => setLine(i, { price: e.target.value })} />
                <input inputMode="decimal" value={l.amount}
                  placeholder={money(orElse(l.qty, 0) * orElse(l.price, 0))}
                  className={!Number.isNaN(num(l.amount)) && Math.abs(num(l.amount) - orElse(l.qty, 0) * orElse(l.price, 0)) > 0.5 ? "input-bad" : ""}
                  onChange={(e) => setLine(i, { amount: e.target.value })} />
              </div>
            )
          )}
          <button className="link-btn" onClick={() => addLine(s)}>+ Add {s.toLowerCase()} line (another size or price)</button>
          <p className="muted">Subtotal: Ksh {money(sum(day.lines.filter((l) => l.section === s).map((l) => l.amount)))}</p>
        </section>
      ))}

      <section className="card">
        <h2>Total sales &amp; breakdown</h2>
        <label>Total sales (as written)<input inputMode="decimal" value={total} placeholder={money(computed)} onChange={(e) => setTotal(e.target.value)} /></label>
        <label>Paybill</label>
        {paybill.map((p, i) => (
          <div className="sale-row" key={i}>
            <input inputMode="decimal" value={p} placeholder="amount" onChange={(e) => setPaybill(paybill.map((x, j) => (j === i ? e.target.value : x)))} />
            {paybill.length > 1 && <button className="link-btn" onClick={() => setPaybill(paybill.filter((_, j) => j !== i))}>Remove</button>}
          </div>
        ))}
        <button className="link-btn" onClick={() => setPaybill([...paybill, ""])}>+ Add another Paybill amount</button>
        <label>Cash/M-PESA<input inputMode="decimal" value={cash} placeholder={money(day.cashMpesa)} onChange={(e) => setCash(e.target.value)} /></label>
        <label>Credit<input inputMode="decimal" value={credit} placeholder="0" onChange={(e) => setCredit(e.target.value)} /></label>
      </section>

      <section className="card">
        <h2>Expenses</h2>
        {exps.map((e, i) => (
          <div className="sale-row" key={i}>
            <input value={e.item} placeholder="item" onChange={(ev) => setExps(exps.map((x, j) => (j === i ? { ...x, item: ev.target.value } : x)))} />
            <input inputMode="decimal" value={e.amount} placeholder="amount" onChange={(ev) => setExps(exps.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} />
            <button className="link-btn" onClick={() => setExps(exps.filter((_, j) => j !== i))}>&times;</button>
          </div>
        ))}
        <button className="link-btn" onClick={() => setExps([...exps, { item: "", amount: "" }])}>+ Add expense</button>
        <label>Total expenses (as written)<input inputMode="decimal" value={expTotal} placeholder={money(sum(day.expenses.map((x) => x.amount)))} onChange={(e) => setExpTotal(e.target.value)} /></label>
      </section>

      <section className="card">
        <h2>Deposit</h2>
        <label>Gross deposit<input inputMode="decimal" value={gross} placeholder={money(day.cashMpesa)} onChange={(e) => setGross(e.target.value)} /></label>
        <label>Net deposit<input inputMode="decimal" value={net} placeholder={money(day.grossDeposit - day.expensesTotal)} onChange={(e) => setNet(e.target.value)} /></label>
        <label>Note<textarea rows={2} value={notes} placeholder="e.g. power outage 2pm-5pm" onChange={(e) => setNotes(e.target.value)} /></label>
        <label>Assumed / unclear figures (one per line)<textarea rows={2} value={assumed} placeholder="e.g. Paybill 2nd amount read as 2,100 (smudged)" onChange={(e) => setAssumed(e.target.value)} /></label>
      </section>

      </fieldset>
      <section className={`card ${issues.length || day.assumed.length ? "attention-card" : ""}`}>
        <h2>Checks</h2>
        {issues.length === 0 ? (
          <p><span className="badge badge-ok">OK</span> All 5 checks passed.</p>
        ) : (
          <>
            <p><span className="badge badge-bad">Please confirm</span></p>
            <ul>{issues.map((x) => <li key={x}>{x}</li>)}</ul>
          </>
        )}
        {day.assumed.length > 0 && <><h3>Assumed</h3><ul>{day.assumed.map((x) => <li key={x}>{x}</li>)}</ul></>}
        <h3>Summary</h3>
        <ul className="summary-list">{summaryLines(day).map((x) => <li key={x}>{x}</li>)}</ul>
        {(issues.length > 0 || existing) && !saved && (
          <label className="check-label">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            {existing ? "Replace the saved figures for this day" : ""}
            {existing && issues.length ? " and " : ""}
            {issues.length ? "save with the issues above flagged on the report" : ""}
          </label>
        )}
        <button disabled={!canSave} onClick={save}>{saving ? "Saving…" : existing ? "Save correction" : "Save day"}</button>
        {err && <p className="error-text">{err}</p>}
        {day.lines.length === 0 && <p className="muted">Enter at least one quantity.</p>}
      </section>

      {saved && (
        <section className="card">
          <h2>Saved {kday(date)}</h2>
          <div className="btn-col">
            <button onClick={() => download("daily")}>Daily report (PDF)</button>
            {isSunday && <button onClick={() => download("weekly")}>Weekly report (PDF) - due today</button>}
            {isMonthEnd && <button onClick={() => download("monthly")}>Monthly report (PDF) - due today</button>}
            <button className="secondary" onClick={async () => (await import("../sales/excel")).downloadRegister(await loadAllDays(), d0.getFullYear())}>
              Excel register
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
