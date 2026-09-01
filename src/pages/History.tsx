import { useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import { ITEMS, type CartonStockDay, type ProductionEntry, type StockItemDay } from "../types";
import { formatDMY, todayKey } from "../lib/dates";

type ReportType = "stock" | "production";

export default function History() {
  const [report, setReport] = useState<ReportType>("stock");
  const [itemFilter, setItemFilter] = useState("__all__");
  const [from, setFrom] = useState("2020-01-01");
  const [to, setTo] = useState(todayKey());
  const [stockRows, setStockRows] = useState<StockItemDay[]>([]);
  const [cartonRows, setCartonRows] = useState<CartonStockDay[]>([]);
  const [productionRows, setProductionRows] = useState<ProductionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    setLoading(true);
    setSearched(true);
    try {
      if (report === "stock") {
        const snap = await getDocs(collection(db, "stockItems"));
        let rows = snap.docs.map((d) => d.data() as StockItemDay);
        rows = rows.filter((r) => r.date >= from && r.date <= to);
        if (itemFilter !== "__all__") rows = rows.filter((r) => r.itemKey === itemFilter);
        rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        setStockRows(rows);
      } else {
        const [cartonSnap, prodSnap] = await Promise.all([
          getDocs(collection(db, "cartonStock")),
          getDocs(collection(db, "production")),
        ]);
        let cRows = cartonSnap.docs.map((d) => d.data() as CartonStockDay);
        cRows = cRows.filter((r) => r.date >= from && r.date <= to);
        cRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        setCartonRows(cRows);

        let pRows = prodSnap.docs.map((d) => d.data() as ProductionEntry);
        pRows = pRows.filter((r) => r.date >= from && r.date <= to);
        pRows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        setProductionRows(pRows);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <h1>History &amp; Reports</h1>
      <section className="card">
        <label>
          Report
          <select value={report} onChange={(e) => setReport(e.target.value as ReportType)}>
            <option value="stock">Stock items (materials)</option>
            <option value="production">Production &amp; carton history</option>
          </select>
        </label>
        {report === "stock" && (
          <label>
            Item
            <select value={itemFilter} onChange={(e) => setItemFilter(e.target.value)}>
              <option value="__all__">All items</option>
              {ITEMS.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button disabled={loading} onClick={search}>
          {loading ? "Searching…" : "Search"}
        </button>
      </section>

      {searched && report === "stock" && (
        <section className="card">
          <h2>{stockRows.length} entries</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Open</th>
                  <th>Added</th>
                  <th>Used</th>
                  <th>Rejects</th>
                  <th>Close</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{formatDMY(r.date)}</td>
                    <td>{ITEMS.find((i) => i.key === r.itemKey)?.label ?? r.itemKey}</td>
                    <td>{r.openingQty}</td>
                    <td>{r.added}</td>
                    <td>{r.used}</td>
                    <td>{r.rejects}</td>
                    <td>{r.closingQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {searched && report === "production" && (
        <>
          <section className="card">
            <h2>Carton stock — {cartonRows.length} entries</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Size</th>
                    <th>Opening</th>
                    <th>Produced</th>
                    <th>Sold</th>
                    <th>Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {cartonRows.map((r, idx) => (
                    <tr key={idx}>
                      <td>{formatDMY(r.date)}</td>
                      <td>{r.size}</td>
                      <td>{r.openingCartons}</td>
                      <td>{r.producedCartons}</td>
                      <td>{r.soldCartons}</td>
                      <td>{r.closingCartons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <h2>Production log — {productionRows.length} entries</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Size</th>
                    <th>Bags</th>
                    <th>Pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {productionRows.map((r, idx) => (
                    <tr key={idx}>
                      <td>{formatDMY(r.date)}</td>
                      <td>{r.size}</td>
                      <td>{r.bags}</td>
                      <td>{r.pieces.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
