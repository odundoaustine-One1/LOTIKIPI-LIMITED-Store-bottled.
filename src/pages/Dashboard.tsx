import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { getLatestCartonDay, getLatestStockItemDay, saveTodayCartonDay } from "../lib/data";
import { ITEM_CATEGORIES, ITEMS, PRODUCT_SIZES, type CartonStockDay, type ProductSize } from "../types";
import { formatDMY, todayKey } from "../lib/dates";

export default function Dashboard() {
  const { profile } = useAuth();
  const [cartons, setCartons] = useState<Record<ProductSize, CartonStockDay | null>>({
    "500ml": null,
    "1L": null,
    "1.5L": null,
  });
  const [items, setItems] = useState<Record<string, number>>({});
  const [soldInputs, setSoldInputs] = useState<Record<ProductSize, string>>({
    "500ml": "",
    "1L": "",
    "1.5L": "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ProductSize | null>(null);

  async function loadAll() {
    setLoading(true);
    const cartonEntries = await Promise.all(PRODUCT_SIZES.map((s) => getLatestCartonDay(s)));
    setCartons({
      "500ml": cartonEntries[0],
      "1L": cartonEntries[1],
      "1.5L": cartonEntries[2],
    });
    const itemEntries = await Promise.all(ITEMS.map((i) => getLatestStockItemDay(i.key)));
    const itemMap: Record<string, number> = {};
    ITEMS.forEach((i, idx) => {
      itemMap[i.key] = itemEntries[idx]?.closingQty ?? 0;
    });
    setItems(itemMap);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function recordSale(size: ProductSize) {
    const val = Number(soldInputs[size]);
    if (!val || val <= 0 || !profile) return;
    setSaving(size);
    try {
      await saveTodayCartonDay(size, { soldCartons: val }, profile.uid);
      setSoldInputs((s) => ({ ...s, [size]: "" }));
      await loadAll();
    } finally {
      setSaving(null);
    }
  }

  const attention = ITEMS.filter((i) => (items[i.key] ?? 0) <= 0);

  return (
    <div className="page">
      <h1>Good day, {profile?.displayName ?? profile?.email}</h1>
      <p className="muted">{formatDMY(todayKey())}</p>

      {!loading && attention.length > 0 && (
        <div className="card attention-card">
          <strong>{attention.length} item(s) need attention</strong>
          <ul>
            {attention.map((i) => (
              <li key={i.key}>{i.label}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="card">
        <h2>Cartons available</h2>
        <div className="carton-grid">
          {PRODUCT_SIZES.map((size) => (
            <div key={size} className="carton-tile">
              <div className="size-label">{size}</div>
              <div className="qty">{loading ? "…" : (cartons[size]?.closingCartons ?? 0)}</div>
              <div className="muted">cartons</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Record a sale</h2>
        <p className="muted">Enter today's total cartons sold per size — this reduces cartons available above.</p>
        {PRODUCT_SIZES.map((size) => (
          <div key={size} className="sale-row">
            <span className="size-label">{size} sold</span>
            <input
              type="number"
              min={0}
              value={soldInputs[size]}
              onChange={(e) => setSoldInputs((s) => ({ ...s, [size]: e.target.value }))}
              placeholder="0"
            />
            <button disabled={saving === size} onClick={() => recordSale(size)}>
              {saving === size ? "Saving…" : "Save"}
            </button>
          </div>
        ))}
      </section>

      <section className="card">
        <h2>Materials</h2>
        {ITEM_CATEGORIES.map((cat) => (
          <div key={cat} className="item-category">
            <h3>{cat}</h3>
            {ITEMS.filter((i) => i.category === cat).map((i) => {
              const qty = items[i.key] ?? 0;
              const status = qty <= 0 ? "OUT OF STOCK" : "OK";
              return (
                <div key={i.key} className="item-row">
                  <span>{i.label}</span>
                  <span className="item-qty">
                    {loading ? "…" : `${qty} pcs`}{" "}
                    <span className={status === "OK" ? "badge badge-ok" : "badge badge-bad"}>{status}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
