import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, PackageSearch, Save, Send } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "@/api/client";
import EmptyState from "@/components/EmptyState";
import SurfaceCard from "@/components/SurfaceCard";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { formatCurrency, generateLocalId } from "@/lib/format";
import { useFieldStore } from "@/stores/fieldStore";

type Customer = {
  id: string;
  name: string;
  code: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: string;
  unitPrices?: Record<string, number | string>;
};

type ProductUomMapping = {
  uomCode: string;
  uomName: string;
  toBaseFactor: number;
  isSale: boolean;
  isDefaultSale: boolean;
};

type UomOption = {
  code: string;
  name: string;
};

type SelectedItem = {
  productId: string;
  productName: string;
  qty: number;
  unitPrice: number;
  uom: string;
};

export default function SalesOrderPage() {
  const [params] = useSearchParams();
  const isOnline = useOnlineStatus();
  const addOrderDraft = useFieldStore((state) => state.addOrderDraft);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [customerName, setCustomerName] = useState(params.get("customerName") ?? "");
  const [productQuery, setProductQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [productCache, setProductCache] = useState<Record<string, Product>>({});
  const [productUomMappings, setProductUomMappings] = useState<Record<string, ProductUomMapping[]>>({});
  const [productUomOptions, setProductUomOptions] = useState<Record<string, UomOption[]>>({});

  const normalizedProductQuery = productQuery.trim();

  useEffect(() => {
    apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=60&includeUnassigned=true").then((response) => {
      setCustomers(response.data);
    });
  }, []);

  useEffect(() => {
    if (!normalizedProductQuery) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoadingProducts(true);
      apiFetch<{ data: Product[] }>(`/api/v1/products?page=1&pageSize=20&q=${encodeURIComponent(normalizedProductQuery)}`)
        .then((response) => {
          if (!cancelled) {
            setProducts(response.data);
            setProductCache((current) => ({
              ...current,
              ...Object.fromEntries(response.data.map((product) => [product.id, product])),
            }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProducts([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoadingProducts(false);
          }
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [normalizedProductQuery]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0),
    [items],
  );

  function handleSelectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customers.find((item) => item.id === nextCustomerId);
    setCustomerName(customer?.name ?? "");
  }

  function toNumericPrice(value: number | string | null | undefined) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function toSaleUomOptions(mappings: ProductUomMapping[], fallbackUnit: string) {
    const saleMappings = mappings.filter((item) => item.isSale);
    const source = saleMappings.length ? saleMappings : mappings;
    const options = source.map((item) => ({
      code: item.uomCode,
      name: item.uomName || item.uomCode,
    }));
    if (options.length) return options;
    return [{ code: fallbackUnit || "pcs", name: (fallbackUnit || "pcs").toUpperCase() }];
  }

  function pickDefaultSaleUom(mappings: ProductUomMapping[], fallbackUnit: string) {
    const saleMappings = mappings.filter((item) => item.isSale);
    const source = saleMappings.length ? saleMappings : mappings;
    const explicitDefault = source.find((item) => item.isDefaultSale);
    if (explicitDefault?.uomCode) return explicitDefault.uomCode;
    const base = source.find((item) => Number(item.toBaseFactor) === 1);
    if (base?.uomCode) return base.uomCode;
    return source[0]?.uomCode ?? fallbackUnit ?? "pcs";
  }

  function resolveUnitPrice(product: Product, mappings: ProductUomMapping[], uomCode: string) {
    const normalized = String(uomCode || "").trim().toLowerCase();
    const directPrice = product.unitPrices?.[normalized];
    if (directPrice !== undefined && toNumericPrice(directPrice) > 0) {
      return toNumericPrice(directPrice);
    }

    const mapping = mappings.find((item) => item.uomCode === normalized);
    const factor = Number(mapping?.toBaseFactor ?? 0);
    const basePrice = toNumericPrice(product.salePrice);
    if (factor > 0) return basePrice * factor;
    return basePrice;
  }

  async function ensureProductUomsLoaded(product: Product) {
    const cachedMappings = productUomMappings[product.id];
    if (cachedMappings) {
      return {
        mappings: cachedMappings,
        options:
          productUomOptions[product.id] ??
          toSaleUomOptions(cachedMappings, String(product.unit || "pcs").toLowerCase()),
      };
    }

    try {
      const response = await apiFetch<{ data: ProductUomMapping[] }>(`/api/v1/products/${product.id}/uoms`);
      const mappings = (response.data ?? []).map((item) => ({
        ...item,
        uomCode: String(item.uomCode || "").toLowerCase(),
        uomName: item.uomName || String(item.uomCode || "").toUpperCase(),
      }));
      const options = toSaleUomOptions(mappings, String(product.unit || "pcs").toLowerCase());
      setProductUomMappings((current) => ({ ...current, [product.id]: mappings }));
      setProductUomOptions((current) => ({ ...current, [product.id]: options }));
      return { mappings, options };
    } catch {
      const fallbackMappings: ProductUomMapping[] = [
        {
          uomCode: String(product.unit || "pcs").toLowerCase(),
          uomName: String(product.unit || "pcs").toUpperCase(),
          toBaseFactor: 1,
          isSale: true,
          isDefaultSale: true,
        },
      ];
      const options = toSaleUomOptions(fallbackMappings, String(product.unit || "pcs").toLowerCase());
      setProductUomMappings((current) => ({ ...current, [product.id]: fallbackMappings }));
      setProductUomOptions((current) => ({ ...current, [product.id]: options }));
      return { mappings: fallbackMappings, options };
    }
  }

  function getItemUomOptions(productId: string, fallbackUom: string) {
    return (
      productUomOptions[productId] ?? [
        {
          code: String(fallbackUom || "pcs").toLowerCase(),
          name: String(fallbackUom || "pcs").toUpperCase(),
        },
      ]
    );
  }

  async function addProduct(product: Product) {
    setProductQuery("");
    setProducts([]);
    setProductCache((current) => ({ ...current, [product.id]: product }));

    const { mappings } = await ensureProductUomsLoaded(product);
    const defaultUom = pickDefaultSaleUom(mappings, String(product.unit || "pcs").toLowerCase());
    const defaultPrice = resolveUnitPrice(product, mappings, defaultUom);

    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) =>
          item.productId === product.id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [
        {
          productId: product.id,
          productName: product.name,
          qty: 1,
          unitPrice: defaultPrice,
          uom: defaultUom,
        },
        ...current,
      ];
    });
  }

  function handleItemUomChange(productId: string, nextUom: string) {
    const product = productCache[productId];
    const mappings = productUomMappings[productId] ?? [];
    setItems((current) =>
      current.map((item) => {
        if (item.productId !== productId) return item;
        if (!product) return { ...item, uom: nextUom };
        const nextPrice = resolveUnitPrice(product, mappings, nextUom);
        return {
          ...item,
          uom: nextUom,
          unitPrice: nextPrice,
        };
      }),
    );
  }

  function saveDraft() {
    if (!customerId || !items.length) {
      setMessage("Pilih pelanggan dan minimal satu item sebelum menyimpan draft.");
      return;
    }
    addOrderDraft({
      localId: generateLocalId("so"),
      customerId,
      customerName,
      orderDate: new Date().toISOString().slice(0, 10),
      notes,
      items,
      createdAt: new Date().toISOString(),
      status: "PENDING_SYNC",
    });
    setMessage("Draft order disimpan ke perangkat dan siap disinkron saat online.");
  }

  async function submitOrder() {
    if (!customerId || !items.length) {
      setMessage("Pilih pelanggan dan minimal satu item sebelum mengirim order.");
      return;
    }

    if (!isOnline) {
      saveDraft();
      return;
    }

    setSubmitting(true);
    setMessage(null);
    setLastCreatedOrderId(null);
    try {
      const response = await apiFetch<{
        data: {
          orderNo?: string;
          salesOrder?: { id?: string; order_no?: string };
          approvalContext?: { requestSummary?: string };
        };
      }>("/api/v1/sales-orders", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          orderDate: new Date().toISOString().slice(0, 10),
          notes,
          items: items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            uom: item.uom,
            unitPrice: item.unitPrice,
            discountAmount: 0,
          })),
        }),
      });
      const orderNo = response.data.salesOrder?.order_no ?? response.data.orderNo ?? "SO baru";
      const createdOrderId = response.data.salesOrder?.id ?? null;
      const approval = response.data.approvalContext?.requestSummary;
      setItems([]);
      setNotes("");
      setLastCreatedOrderId(createdOrderId);
      setMessage(approval ? `${orderNo} masuk antrean approval. ${approval}` : `${orderNo} berhasil dikirim.`);
    } catch (err) {
      if (err instanceof ApiError) {
        setLastCreatedOrderId(null);
        setMessage(err.message);
      } else {
        setLastCreatedOrderId(null);
        setMessage("Gagal mengirim Sales Order.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <SurfaceCard>
        <div className="text-lg font-semibold text-zinc-950">Buat Sales Order</div>
        <div className="mt-1 text-sm text-zinc-500">Mode lapangan: cepat, hemat scroll, dan aman saat sinyal tidak stabil.</div>
        <div className="mt-4 space-y-3">
          <select value={customerId} onChange={(event) => handleSelectCustomer(event.target.value)} className="field-input">
            <option value="">Pilih pelanggan</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.code} - {customer.name}
              </option>
            ))}
          </select>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="field-input min-h-24 resize-none"
            placeholder="Catatan order atau catatan visit..."
          />
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-zinc-900">Cari Produk</div>
            <div className="text-sm text-zinc-500">Tambah item satu per satu, cocok untuk transaksi di toko.</div>
          </div>
          <PackageSearch className="h-5 w-5 text-emerald-700" />
        </div>
        <div className="mt-4">
          <input
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            className="field-input"
            placeholder="Cari produk atau SKU..."
            autoComplete="off"
          />
          {normalizedProductQuery ? (
            <div className="mt-2 overflow-hidden rounded-[22px] border border-zinc-200 bg-white shadow-lg">
              {loadingProducts ? (
                <div className="px-4 py-3 text-sm text-zinc-500">Mencari produk...</div>
              ) : products.length ? (
                <div className="max-h-72 overflow-y-auto p-2">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className="flex w-full items-center justify-between rounded-[18px] px-3 py-3 text-left transition hover:bg-zinc-50"
                    >
                      <div>
                        <div className="text-sm font-medium text-zinc-900">{product.name}</div>
                        <div className="text-xs text-zinc-500">
                          {product.sku} • {product.unit}
                        </div>
                      </div>
                      <div className="pl-3 text-sm font-semibold text-zinc-900">{formatCurrency(product.salePrice)}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-zinc-500">Produk tidak ditemukan.</div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-[22px] border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
              Ketik nama produk atau SKU untuk menampilkan dropdown pencarian.
            </div>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard>
        <div className="text-sm font-semibold text-zinc-900">Item Order</div>
        <div className="mt-4 space-y-3">
          {items.length ? (
            items.map((item) => (
              <div key={item.productId} className="rounded-[22px] border border-zinc-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{item.productName}</div>
                    <div className="text-sm text-zinc-500">Satuan: {item.uom}</div>
                  </div>
                  <div className="text-right text-sm font-semibold text-zinc-900">
                    {formatCurrency(item.qty * item.unitPrice)}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((currentItem) =>
                          currentItem.productId === item.productId
                            ? { ...currentItem, qty: Math.max(1, Number(event.target.value || 1)) }
                            : currentItem,
                        ),
                      )
                    }
                    className="field-input w-24"
                  />
                  <select
                    value={item.uom}
                    onChange={(event) => handleItemUomChange(item.productId, event.target.value)}
                    className="field-input"
                  >
                    {getItemUomOptions(item.productId, item.uom).map((option) => (
                      <option key={`${item.productId}-${option.code}`} value={option.code}>
                        {option.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="text-sm font-medium text-rose-600"
                    onClick={() => setItems((current) => current.filter((currentItem) => currentItem.productId !== item.productId))}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="Belum ada item" description="Tambahkan produk dari hasil pencarian untuk mulai menyusun order." />
          )}
        </div>
      </SurfaceCard>

      {message ? (
        <div className="rounded-[24px] bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <div className="space-y-2">
              <div>{message}</div>
              {lastCreatedOrderId ? (
                <Link to={`/sales-order/${lastCreatedOrderId}`} className="inline-flex font-semibold text-emerald-900 underline">
                  View SO
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <SurfaceCard className="sticky bottom-24 bg-white/95">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-zinc-500">Total order</div>
            <div className="text-2xl font-semibold text-zinc-950">{formatCurrency(totalAmount)}</div>
          </div>
          <div className="text-right text-xs text-zinc-500">
            {isOnline ? "Online: bisa kirim sekarang" : "Offline ringan: akan simpan draft"}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={saveDraft} className="secondary-button">
            <Save className="h-4 w-4" />
            Simpan Draft
          </button>
          <button type="button" onClick={submitOrder} disabled={submitting} className="primary-button">
            <Send className="h-4 w-4" />
            {submitting ? "Mengirim..." : isOnline ? "Kirim SO" : "Simpan Offline"}
          </button>
        </div>
      </SurfaceCard>
    </div>
  );
}
