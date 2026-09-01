import { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { getOrInitTodayStockItemDay, saveTodayStockItemDay } from "../lib/data";
import { ITEM_CATEGORIES, ITEMS } from "../types";
import type { StockItemDay } from "../types";
import { formatDMY, todayKey } from "../lib/dates";

export default function StockEntry() {
  const { profile } = useAuth();
  const [days, setDays] = useState<Record<string, StockItemDay>>({});
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ added: string; rejects: string; used: string }>({
    added: "0",
    rejects: "0",
    used: "0",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      const entries = await Promise.all(ITEMS.map((i) => getOrInitTodayStockItemDay(i.key, profile.uid)));
      const map: Record<string, StockItemDay> = {};
      ITEMS.forEach((i, idx) => (map[i.key] = entries[idx]));
      setDays(map);
    })();
  }, [profile]);

  function openItem(key: string) {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    setDraft({ added: "0", rejects: "0", used: "0" });
  }

  const openDay = openKey ? days[openKey] : null;
  const closingPreview = openDay
    ? openDay.openingQty + Number(draft.added || 0) - Number(draft.used || 0) - Number(draft.rejects || 0)
    : 0;

  async function save() {
    if (!openKey || !profile) return;
    setSaving(true);
    try {
      const updated = await saveTodayStockItemDay(
        openKey,
        { added: Number(draft.added || 0), used: Number(draft.used || 0), rejects: Number(draft.rejects || 0) },
        profile.uid
      );
      setDays((d) => ({ ...d, [openKey]: updated }));
      setOpenKey(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <h1>Daily Stock Entry</h1>
      <p className="muted">Tap an item to record today's movement</p>
      <p className="muted">Date: {formatDMY(todayKey())} (today only)</p>

      {ITEM_CATEGORIES.map((cat) => (
        <div key={cat} className="item-category">
          <h3>{cat}</h3>
          {ITEMS.filter((i) => i.category === cat).map((i) => {
            const day = days[i.key];
            return (
              <div key={i.key} className="card entry-card">
                <button className="entry-toggle" onClick={() => openItem(i.key)}>
                  <span>{i.label}</span>
                  <span className="muted">
                    Opening {day?.openingQty ?? "…"} · Closing {day?.closingQty ?? "…"} pcs
                  </span>
                </button>
                {openKey === i.key && day && (
                  <div className="entry-form">
                    <label>
                      Added
                      <input
                        type="number"
                        value={draft.added}
                        onChange={(e) => setDraft((d) => ({ ...d, added: e.target.value }))}
                      />
                    </label>
                    <label>
                      Rejects
                      <input
                        type="number"
                        value={draft.rejects}
                        onChange={(e) => setDraft((d) => ({ ...d, rejects: e.target.value }))}
                      />
                    </label>
                    <label>
                      Used / Released
                      <input
                        type="number"
                        value={draft.used}
                        onChange={(e) => setDraft((d) => ({ ...d, used: e.target.value }))}
                      />
                    </label>
                    <div className="closing-preview">
                      Closing preview: <strong>{closingPreview}</strong>
                    </div>
                    <button disabled={saving} onClick={save}>
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
