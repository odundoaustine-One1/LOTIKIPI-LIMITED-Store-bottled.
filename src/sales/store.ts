import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { normalizeDay, type DayMap, type SalesDay } from "./model";

// salesDays/{YYYY-MM-DD}. One small doc per day, so fetching the whole
// collection and filtering client-side is cheap and needs no indexes
// (see the README note on composite indexes).
const COL = "salesDays";

export async function loadAllDays(): Promise<DayMap> {
  const snap = await getDocs(collection(db, COL));
  const out: DayMap = {};
  snap.docs.forEach((d) => {
    const day = normalizeDay(d.data());
    if (day.date) out[day.date] = day;
  });
  return out;
}

export async function getDay(date: string): Promise<SalesDay | null> {
  const s = await getDoc(doc(db, COL, date));
  return s.exists() ? normalizeDay(s.data()) : null;
}

export async function saveDay(day: SalesDay, uid: string, isNew: boolean): Promise<void> {
  await setDoc(doc(db, COL, day.date), {
    ...day,
    updatedBy: uid,
    updatedAt: serverTimestamp(),
    ...(isNew ? { createdBy: uid, createdAt: serverTimestamp() } : {}),
  }, { merge: true }); // merge keeps createdBy/createdAt on corrections; arrays are replaced whole
}
