import { apiFetch } from "@/api/client";

export type UomOption = {
  code: string;
  name: string;
};

export type ProductUomMapping = {
  uomCode: string;
  uomName: string;
  toBaseFactor: number;
  isSale: boolean;
  isPurchase: boolean;
  isDefaultSale: boolean;
  isDefaultPurchase: boolean;
};

export async function fetchActiveUoms() {
  const res = await apiFetch<{ data: Array<{ code: string; name: string }> }>(
    "/api/v1/uoms?page=1&pageSize=200&isActive=true",
  );
  return res.data ?? [];
}

export async function fetchProductUomMappings(productId: string) {
  if (!productId) return [] as ProductUomMapping[];
  const res = await apiFetch<{ data: ProductUomMapping[] }>(`/api/v1/products/${productId}/uoms`);
  return res.data ?? [];
}

export function pickDefaultUom(mappings: ProductUomMapping[], mode: "sale" | "purchase" | "any" = "any") {
  const filtered = mappings.filter((m) =>
    mode === "sale" ? m.isSale : mode === "purchase" ? m.isPurchase : true,
  );
  const list = filtered.length ? filtered : mappings;
  if (!list.length) return "pcs";
  const explicitDefault = list.find((m) => (mode === "purchase" ? m.isDefaultPurchase : m.isDefaultSale));
  if (explicitDefault) return explicitDefault.uomCode;
  const base = list.find((m) => Number(m.toBaseFactor) === 1);
  if (base) return base.uomCode;
  return list[0].uomCode;
}

export function toUomOptions(mappings: ProductUomMapping[], mode: "sale" | "purchase" | "any" = "any") {
  const filtered = mappings.filter((m) =>
    mode === "sale" ? m.isSale : mode === "purchase" ? m.isPurchase : true,
  );
  const list = filtered.length ? filtered : mappings;
  return list.map((m) => ({ code: m.uomCode, name: m.uomName }));
}
