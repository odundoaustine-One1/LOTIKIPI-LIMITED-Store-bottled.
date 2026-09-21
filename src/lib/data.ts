import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { todayKey } from "./dates";
import type { CartonStockDay, ProductionEntry, ProductSize, StockItemDay } from "../types";

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

/**
 * Corrects a production log entry after the fact (wrong date, size, bag/piece
 * count from a data-entry slip, etc). This only rewrites the `production` doc
 * itself — it does NOT touch cartonStock or stockItems, since those cascade
 * day-to-day and a safe automatic re-cascade isn't possible from a single
 * edited entry. Reconcile cartonStock/stockItems by hand (Stock Entry /
 * Firestore console) if the correction changes pieces produced or moves the
 * entry to a different date.
 */
export async function updateProductionEntry(
  id: string,
  patch: Partial<Pick<ProductionEntry, "date" | "size" | "bags" | "pieces">>,
  legacy = false
): Promise<void> {
  // Keep an entry in whichever field names it already uses, so an edit never
  // leaves a doc half old-style, half new-style.
  if (!legacy) {
    await updateDoc(doc(db, "production", id), patch);
    return;
  }
  const out: Record<string, unknown> = {};
  if (patch.date !== undefined) out.date = patch.date;
  if (patch.size !== undefined) out.productSize = patch.size;
  if (patch.bags !== undefined) out.bagsUsed = patch.bags;
  if (patch.pieces !== undefined) out.piecesProduced = patch.pieces;
  await updateDoc(doc(db, "production", id), out);
}

/**
 * `production` docs exist in two shapes. The original app wrote
 * piecesProduced / productSize / bagsUsed / staffOnShift; this rebuild writes
 * pieces / size / bags / staff. Read both, so old and new entries all show up
 * instead of the History page crashing on a missing field.
 */
export type ProductionRow = ProductionEntry & { id: string; legacy: boolean };

export function normalizeProduction(id: string, raw: Record<string, unknown>): ProductionRow {
  return {
    id,
    legacy: raw.pieces === undefined && raw.piecesProduced !== undefined,
    date: String(raw.date ?? ""),
    size: (raw.size ?? raw.productSize ?? "1L") as ProductSize,
    bags: Number(raw.bags ?? raw.bagsUsed ?? 0),
    pieces: Number(raw.pieces ?? raw.piecesProduced ?? 0),
    staff: (raw.staff ?? raw.staffOnShift ?? []) as string[],
    createdBy: String(raw.createdBy ?? ""),
    createdAt: raw.createdAt,
  };
}

export async function deleteProductionEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, "production", id));
}
