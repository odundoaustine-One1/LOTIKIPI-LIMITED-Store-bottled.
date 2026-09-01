import { useEffect, useState } from "react";
import { addDoc, collection, doc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import type { ProductionEntry } from "../types";
import { todayKey } from "../lib/dates";

interface StaffMember {
  id: string;
  name: string;
  active: boolean;
}

const RATE_PER_CARTON = 10; // KES

export default function Payroll() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [newName, setNewName] = useState("");
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [pay, setPay] = useState<Record<string, number> | null>(null);

  async function loadStaff() {
    const snap = await getDocs(collection(db, "staffMembers"));
    setStaff(
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as { name: string; active: boolean }) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  useEffect(() => {
    loadStaff();
  }, []);

  async function addStaff() {
    if (!newName.trim()) return;
    await addDoc(collection(db, "staffMembers"), { name: newName.trim(), active: true });
    setNewName("");
    await loadStaff();
  }

  async function toggleActive(s: StaffMember) {
    await updateDoc(doc(db, "staffMembers", s.id), { active: !s.active });
    await loadStaff();
  }

  async function calculate() {
    const snap = await getDocs(collection(db, "production"));
    const rows = snap.docs
      .map((d) => d.data() as ProductionEntry)
      .filter((r) => r.date >= from && r.date <= to);
    const totals: Record<string, number> = {};
    for (const row of rows) {
      const cartons = row.pieces / (row.size === "500ml" ? 24 : row.size === "1L" ? 12 : 8);
      const totalPay = cartons * RATE_PER_CARTON;
      const staffOnShift = row.staff && row.staff.length > 0 ? row.staff : [];
      if (staffOnShift.length === 0) continue;
      const share = totalPay / staffOnShift.length;
      for (const staffId of staffOnShift) {
        totals[staffId] = (totals[staffId] ?? 0) + share;
      }
    }
    setPay(totals);
  }

  return (
    <div className="page">
      <h1>Payroll</h1>
      <p className="muted">Cartons produced are split evenly among staff recorded on each shift, paid at KES {RATE_PER_CARTON}/carton.</p>

      <section className="card">
        <h2>Pay period</h2>
        <label>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button onClick={calculate}>Calculate payroll</button>
        {pay && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Staff</th>
                  <th>Pay (KES)</th>
                </tr>
              </thead>
              <tbody>
                {staff
                  .filter((s) => pay[s.id])
                  .map((s) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{pay[s.id].toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Production team</h2>
        <div className="sale-row">
          <input placeholder="Staff name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button onClick={addStaff}>Add</button>
        </div>
        {staff.map((s) => (
          <div key={s.id} className="item-row">
            <span>{s.name}</span>
            <button className="link-btn" onClick={() => toggleActive(s)}>
              {s.active ? "Active — deactivate" : "Inactive — reactivate"}
            </button>
          </div>
        ))}
        {staff.length === 0 && <p className="muted">No active staff yet.</p>}
      </section>
    </div>
  );
}
