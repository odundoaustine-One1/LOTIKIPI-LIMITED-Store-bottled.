import { useEffect, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../AuthContext";
import { getOrInitTodayCartonDay, saveTodayCartonDay } from "../lib/data";
import { PCS_PER_CARTON, PRODUCT_SIZES, type CartonStockDay, type ProductSize } from "../types";
import { formatDMY, todayKey } from "../lib/dates";

interface StaffMember {
  id: string;
  name: string;
  active: boolean;
}

export default function Production() {
  const { profile } = useAuth();
  const [size, setSize] = useState<ProductSize>("1L");
  const [bags, setBags] = useState("0");
  const [pieces, setPieces] = useState("0");
  const [autoPieces, setAutoPieces] = useState(true);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string[]>([]);
  const [cartons, setCartons] = useState<Record<ProductSize, CartonStockDay | null>>({
    "500ml": null,
    "1L": null,
    "1.5L": null,
  });
  const [soldDraft, setSoldDraft] = useState<Record<ProductSize, string>>({ "500ml": "", "1L": "", "1.5L": "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const staffSnap = await getDocs(query(collection(db, "staffMembers"), where("active", "==", true)));
      const list = staffSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as { name: string; active: boolean }) }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setStaff(list);
      await refreshCartons();
    })();
  }, [profile]);

  async function refreshCartons() {
    if (!profile) return;
    const entries = await Promise.all(PRODUCT_SIZES.map((s) => getOrInitTodayCartonDay(s, profile.uid)));
    setCartons({ "500ml": entries[0], "1L": entries[1], "1.5L": entries[2] });
  }

  function toggleStaff(id: string) {
    setSelectedStaff((sel) => (sel.includes(id) ? sel.filter((s) => s !== id) : [...sel, id]));
  }

  function handleBagsChange(v: string) {
    setBags(v);
    if (autoPieces) setPieces(String(Number(v || 0) * 120));
  }

  async function addProductionEntry() {
    if (!profile) return;
    const piecesNum = Number(pieces || 0);
    if (piecesNum <= 0) return;
    setBusy(true);
    try {
      await addDoc(collection(db, "production"), {
        date: todayKey(),
        size,
        bags: Number(bags || 0),
        pieces: piecesNum,
        staff: selectedStaff,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
      });
      const cartonsProduced = Math.floor(piecesNum / PCS_PER_CARTON[size]);
      const current = cartons[size];
      await saveTodayCartonDay(
        size,
        { producedCartons: (current?.producedCartons ?? 0) + cartonsProduced },
        profile.uid
      );
      setBags("0");
      setPieces("0");
      setSelectedStaff([]);
      await refreshCartons();
    } finally {
      setBusy(false);
    }
  }

  async function saveSold(s: ProductSize) {
    if (!profile) return;
    const val = Number(soldDraft[s] || 0);
    if (val <= 0) return;
    setBusy(true);
    try {
      const current = cartons[s];
      await saveTodayCartonDay(s, { soldCartons: (current?.soldCartons ?? 0) + val }, profile.uid);
      setSoldDraft((d) => ({ ...d, [s]: "" }));
      await refreshCartons();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Production Entry</h1>
      <p className="muted">{formatDMY(todayKey())}</p>

      <section className="card">
        <label>
          Product size
          <select value={size} onChange={(e) => setSize(e.target.value as ProductSize)}>
            {PRODUCT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          Bags used
          <input type="number" min={0} value={bags} onChange={(e) => handleBagsChange(e.target.value)} />
        </label>
        <label>
          Pieces produced
          <input
            type="number"
            min={0}
            value={pieces}
            onChange={(e) => {
              setAutoPieces(false);
              setPieces(e.target.value);
            }}
          />
        </label>
        <p className="muted">Auto-calculated at 120 pcs/bag — edit if the actual count differs.</p>

        <h3>Staff on shift</h3>
        {staff.length === 0 ? (
          <p className="muted">No staff added yet — ask management to add the production team on the Payroll page.</p>
        ) : (
          <div className="staff-chip-row">
            {staff.map((s) => (
              <button
                key={s.id}
                className={selectedStaff.includes(s.id) ? "chip chip-selected" : "chip"}
                onClick={() => toggleStaff(s.id)}
                type="button"
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        <button disabled={busy} onClick={addProductionEntry}>
          {busy ? "Saving…" : "Add production entry"}
        </button>
      </section>

      <section className="card">
        <h2>Carton stock today</h2>
        {PRODUCT_SIZES.map((s) => {
          const day = cartons[s];
          return (
            <div key={s} className="carton-today-row">
              <strong>{s}</strong>
              <span className="muted">
                Opening {day?.openingCartons ?? 0} · Produced {day?.producedCartons ?? 0} (auto) · Closing{" "}
                {day?.closingCartons ?? 0}
              </span>
              <div className="sale-row">
                <span>Sold cartons</span>
                <input
                  type="number"
                  min={0}
                  value={soldDraft[s]}
                  onChange={(e) => setSoldDraft((d) => ({ ...d, [s]: e.target.value }))}
                  placeholder="0"
                />
                <button disabled={busy} onClick={() => saveSold(s)}>
                  Save
                </button>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
