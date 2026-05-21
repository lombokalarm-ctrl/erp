import { create } from "zustand";

export type OrderDraft = {
  localId: string;
  customerId: string;
  customerName: string;
  orderDate: string;
  notes: string;
  items: Array<{
    productId: string;
    productName: string;
    qty: number;
    unitPrice: number;
    uom: string;
  }>;
  createdAt: string;
  status: "PENDING_SYNC" | "FAILED";
};

export type VisitDraft = {
  localId: string;
  customerId: string;
  customerName: string;
  visitStatus: "OPEN" | "CLOSED" | "NOT_FOUND" | "FOLLOW_UP";
  note: string;
  visitedAt: string;
  status: "LOCAL_ONLY" | "PENDING_SYNC";
};

type FieldState = {
  orderDrafts: OrderDraft[];
  visitDrafts: VisitDraft[];
  addOrderDraft: (draft: OrderDraft) => void;
  removeOrderDraft: (localId: string) => void;
  addVisitDraft: (draft: VisitDraft) => void;
  removeVisitDraft: (localId: string) => void;
  hydrate: () => void;
};

const STORAGE_KEY = "madani_field_drafts_v1";

export const useFieldStore = create<FieldState>((set, get) => ({
  orderDrafts: [],
  visitDrafts: [],
  addOrderDraft: (draft) => {
    const next = [draft, ...get().orderDrafts];
    set({ orderDrafts: next });
    saveState(next, get().visitDrafts);
  },
  removeOrderDraft: (localId) => {
    const next = get().orderDrafts.filter((draft) => draft.localId !== localId);
    set({ orderDrafts: next });
    saveState(next, get().visitDrafts);
  },
  addVisitDraft: (draft) => {
    const next = [draft, ...get().visitDrafts];
    set({ visitDrafts: next });
    saveState(get().orderDrafts, next);
  },
  removeVisitDraft: (localId) => {
    const next = get().visitDrafts.filter((draft) => draft.localId !== localId);
    set({ visitDrafts: next });
    saveState(get().orderDrafts, next);
  },
  hydrate: () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        orderDrafts?: OrderDraft[];
        visitDrafts?: VisitDraft[];
      };
      set({
        orderDrafts: parsed.orderDrafts ?? [],
        visitDrafts: parsed.visitDrafts ?? [],
      });
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  },
}));

function saveState(orderDrafts: OrderDraft[], visitDrafts: VisitDraft[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ orderDrafts, visitDrafts }));
}
