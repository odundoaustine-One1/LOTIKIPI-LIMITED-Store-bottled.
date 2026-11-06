// "sales" = sales rep: uses only the sales register site (lotikipi-sales.web.app).
export type Role = "management" | "store" | "production" | "sales";

export const SALES_ROLES: Role[] = ["management", "sales"];

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: Role;
  active: boolean;
}

// Product sizes for finished, packaged bottled water (cartons).
export const PRODUCT_SIZES = ["500ml", "1L", "1.5L"] as const;
export type ProductSize = (typeof PRODUCT_SIZES)[number];

// pcs per carton, confirmed from real historical data during recovery.
export const PCS_PER_CARTON: Record<ProductSize, number> = {
  "500ml": 24,
  "1L": 12,
  "1.5L": 8,
};

// Raw material items tracked in Stock Entry (Firestore collection: stockItems).
export interface ItemDef {
  key: string;
  label: string;
  category: string;
}

export const ITEMS: ItemDef[] = [
  { key: "bottle_500ml", label: "500ml Regular Bottle", category: "Bottles" },
  { key: "bottle_1l", label: "1L Regular Bottle", category: "Bottles" },
  { key: "bottle_1_5l", label: "1.5L Regular Bottle", category: "Bottles" },
  { key: "wrapper_500ml", label: "500ml Wrapper", category: "Wrappers" },
  { key: "wrapper_1l", label: "1L Wrapper", category: "Wrappers" },
  { key: "wrapper_1_5l", label: "1.5L Wrapper", category: "Wrappers" },
  { key: "security_seal_small", label: "Security Seal (500ml/1L/1.5L)", category: "Security Seals" },
  { key: "security_seal_large", label: "Security Seal (10L/20L)", category: "Security Seals" },
  { key: "top_seal", label: "Top Seal (10L/20L)", category: "Top Seals" },
  { key: "non_spill_cap", label: "Non-spill Cap (10L/20L)", category: "Non-spill Caps" },
  { key: "label_500ml", label: "500ml Label", category: "Labels" },
  { key: "label_1l", label: "1L Label", category: "Labels" },
  { key: "label_1_5l", label: "1.5L Label", category: "Labels" },
  { key: "jerrican_5l", label: "5L Disposable Jerrican", category: "Disposable Jerricans" },
  { key: "jerrican_10l", label: "10L Disposable Jerrican", category: "Disposable Jerricans" },
  { key: "jerrican_18_9l_hard", label: "18.9L Hard Disposable Jerrican", category: "Disposable Jerricans" },
  { key: "jerrican_20l_soft", label: "20L Soft Disposable Jerrican", category: "Disposable Jerricans" },
];

export const ITEM_CATEGORIES = Array.from(new Set(ITEMS.map((i) => i.category)));

// Firestore doc shape: stockItems/{itemKey}__{YYYY-MM-DD}
export interface StockItemDay {
  itemKey: string;
  date: string;
  openingQty: number;
  added: number;
  used: number;
  rejects: number;
  closingQty: number;
  createdBy?: string;
  updatedBy?: string;
}

// Firestore doc shape: cartonStock/{size}__{YYYY-MM-DD}
export interface CartonStockDay {
  size: ProductSize;
  date: string;
  openingCartons: number;
  producedCartons: number;
  soldCartons: number;
  closingCartons: number;
  createdBy?: string;
  updatedBy?: string;
}

// Firestore doc shape: production/{autoId}
export interface ProductionEntry {
  date: string;
  size: ProductSize;
  bags: number;
  pieces: number;
  staff: string[];
  createdBy: string;
  createdAt: unknown;
}
