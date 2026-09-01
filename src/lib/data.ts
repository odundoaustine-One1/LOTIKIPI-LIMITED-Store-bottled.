import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { todayKey } from "./dates";
import type { CartonStockDay, ProductSize, StockItemDay } from "../types";

/**
 * All of these deliberately avoid Firestore composite indexes (single-field
 * `where`, no `orderBy` on a different field) and sort client-side instead.
 * These collections are small (one row per item/size per day), so this is
 * cheap — and it means a fresh deployment never needs anyone to remember to
 * go create an index in the Firebase console before things work.
 */

export async function getLatestCartonDay(size: ProductSize): Promise<CartonStockDay | null> {
  const q = query(collection(db, "cartonStock"), where("size", "==", size));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docs = snap.docs.map((d) => d.data() as CartonStockDay);
  docs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return docs[0];
}

export async function getOrInitTodayCartonDay(size: ProductSize, uid: string): Promise<CartonStockDay> {
  const today = todayKey();
  const id = `${size}__${today}`;
  const ref = doc(db, "cartonStock", id);
  const existing = await getDoc(ref);
  if (existing.exists()) return existing.data() as CartonStockDay;

  const latest = await getLatestCartonDay(size);
  const opening = latest ? latest.closingCartons : 0;
  const fresh: CartonStockDay = {
    size,
    date: today,
    openingCartons: opening,
    producedCartons: 0,
    soldCartons: 0,
    closingCartons: opening,
    createdBy: uid,
    updatedBy: uid,
  };
  await setDoc(ref, { ...fresh, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return fresh;
}

export async function saveTodayCartonDay(
  size: ProductSize,
  patch: Partial<Pick<CartonStockDay, "producedCartons" | "soldCartons">>,
  uid: string
): Promise<CartonStockDay> {
  const current = await getOrInitTodayCartonDay(size, uid);
  const merged: CartonStockDay = {
    ...current,
    ...patch,
  };
  merged.closingCartons = merged.openingCartons + merged.producedCartons - merged.soldCartons;
  const id = `${size}__${merged.date}`;
  await setDoc(
    doc(db, "cartonStock", id),
    { ...merged, updatedBy: uid, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return merged;
}

export async function getLatestStockItemDay(itemKey: string): Promise<StockItemDay | null> {
  const q = query(collection(db, "stockItems"), where("itemKey", "==", itemKey));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docs = snap.docs.map((d) => d.data() as StockItemDay);
  docs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return docs[0];
}

export async function getOrInitTodayStockItemDay(itemKey: string, uid: string): Promise<StockItemDay> {
  const today = todayKey();
  const id = `${itemKey}__${today}`;
  const ref = doc(db, "stockItems", id);
  const existing = await getDoc(ref);
  if (existing.exists()) return existing.data() as StockItemDay;

  const latest = await getLatestStockItemDay(itemKey);
  const opening = latest ? latest.closingQty : 0;
  const fresh: StockItemDay = {
    itemKey,
    date: today,
    openingQty: opening,
    added: 0,
    used: 0,
    rejects: 0,
    closingQty: opening,
    createdBy: uid,
    updatedBy: uid,
  };
  await setDoc(ref, { ...fresh, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  return fresh;
}

export async function saveTodayStockItemDay(
  itemKey: string,
  patch: Partial<Pick<StockItemDay, "added" | "used" | "rejects">>,
  uid: string
): Promise<StockItemDay> {
  const current = await getOrInitTodayStockItemDay(itemKey, uid);
  const merged: StockItemDay = { ...current, ...patch };
  merged.closingQty = merged.openingQty + merged.added - merged.used - merged.rejects;
  const id = `${itemKey}__${merged.date}`;
  await setDoc(
    doc(db, "stockItems", id),
    { ...merged, updatedBy: uid, updatedAt: serverTimestamp() },
    { merge: true }
  );
  return merged;
}
