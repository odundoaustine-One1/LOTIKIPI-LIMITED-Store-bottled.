import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";

export default function AuditLog() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Try an ordered query first; fall back to unordered if the field/index
        // doesn't exist so this page never gets stuck blank over a missing index.
        let snap;
        try {
          snap = await getDocs(query(collection(db, "auditLog"), orderBy("timestamp", "desc"), limit(200)));
        } catch {
          snap = await getDocs(collection(db, "auditLog"));
        }
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error(err);
        setError("Could not load the audit log.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="page">
      <h1>Audit Log</h1>
      <p className="muted">Every write to production data, recorded automatically by Cloud Functions.</p>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error-text">{error}</p>}
      {!loading &&
        rows.map((r) => (
          <div key={String(r.id)} className="card audit-row">
            <pre>{JSON.stringify(r, null, 2)}</pre>
          </div>
        ))}
      {!loading && rows.length === 0 && !error && <p className="muted">No entries yet.</p>}
    </div>
  );
}
