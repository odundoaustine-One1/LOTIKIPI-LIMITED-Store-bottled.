import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { creditEntries, normalizeDay, type DayMap, type SalesDay } from "./model";

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

/** Record a repayment against one credit entry of a day. Re-reads the day
 *  first so a payment never overwrites a newer correction. */
export async function recordCreditPayment(date: string, index: number, payDate: string, amount: number, uid: string): Promise<void> {
  const day = await getDay(date);
  if (!day) throw new Error(`No sales recorded for ${date}`);
  const entries = creditEntries(day).map((c) => ({ ...c, paid: [...c.paid] }));
  if (!entries[index]) throw new Error("That credit entry no longer exists - reload the page");
  entries[index].paid.push({ date: payDate, amount });
  await updateDoc(doc(db, COL, date), { creditors: entries, updatedBy: uid, updatedAt: serverTimestamp() });
}
