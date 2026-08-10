import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, PackageSearch, Plus, Save, Search, Send } from "lucide-react";
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
  regionName?: string | null;
};

type Supplier = {
  id: string;
  code: string;
  name: string;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  salePrice: string;
  unitPrices?: Record<string, number | string>;
  currentStockBase?: string;
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
  qty: string;
  unitPrice: number;
  uom: string;
};

export default function SalesOrderPage() {
  const [params] = useSearchParams();
  const isOnline = useOnlineStatus();
  const addOrderDraft = useFieldStore((state) => state.addOrderDraft);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState(params.get("customerId") ?? "");
  const [customerName, setCustomerName] = useState(params.get("customerName") ?? "");
  const [customerQuery, setCustomerQuery] = useState(params.get("customerName") ?? "");
  const [supplierId, setSupplierId] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [lastCreatedOrderId, setLastCreatedOrderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [customerCache, setCustomerCache] = useState<Record<string, Customer>>({});
  const [supplierCache, setSupplierCache] = useState<Record<string, Supplier>>({});
  const [productCache, setProductCache] = useState<Record<string, Product>>({});
  const [productUomMappings, setProductUomMappings] = useState<Record<string, ProductUomMapping[]>>({});
  const [productUomOptions, setProductUomOptions] = useState<Record<string, UomOption[]>>({});
  const productSearchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedCustomerQuery = customerQuery.trim();
  const normalizedSupplierQuery = supplierQuery.trim();
  const normalizedProductQuery = productQuery.trim();
  const selectedCustomerLabel = customerId
    ? `${customerCache[customerId]?.code ?? ""} - ${customerCache[customerId]?.name ?? customerName}`.trim()
    : "";
  const selectedSupplierLabel = supplierId
    ? `${supplierCache[supplierId]?.code ?? ""} - ${supplierCache[supplierId]?.name ?? ""}`.trim()
    : "";
  const showCustomerResults = Boolean(normalizedCustomerQuery) && normalizedCustomerQuery !== selectedCustomerLabel;
  const showSupplierResults = Boolean(normalizedSupplierQuery) && normalizedSupplierQuery !== selectedSupplierLabel;

  useEffect(() => {
    apiFetch<{ data: Customer[] }>("/api/v1/customers?page=1&pageSize=60&includeUnassigned=true").then((response) => {
      setCustomers(response.data);
      setCustomerCache(Object.fromEntries(response.data.map((customer) => [customer.id, customer])));
    });
  }, []);

  useEffect(() => {
    setLoadingSuppliers(true);
    apiFetch<{ data: Supplier[] }>("/api/v1/suppliers?page=1&pageSize=200")
      .then((response) => {
        setSuppliers(response.data);
        setSupplierCache(Object.fromEntries(response.data.map((supplier) => [supplier.id, supplier])));
      })
      .finally(() => {
        setLoadingSuppliers(false);
      });
  }, []);

  const filteredCustomerResults = useMemo(() => {
    const keyword = normalizedCustomerQuery.toLowerCase();
    const source = keyword
      ? customers.filter((customer) => {
          const haystack = [customer.name, customer.code, customer.regionName ?? ""].join(" ").toLowerCase();
          return haystack.includes(keyword);
        })
      : customers;
    return source.slice(0, 20);
  }, [customers, normalizedCustomerQuery]);

  const filteredSupplierResults = useMemo(() => {
    const keyword = normalizedSupplierQuery.toLowerCase();
    const source = keyword
      ? suppliers.filter((supplier) => {
          const haystack = [supplier.name, supplier.code].join(" ").toLowerCase();
          return haystack.includes(keyword);
        })
      : suppliers;
    return source.slice(0, 20);
  }, [suppliers, normalizedSupplierQuery]);

  const filteredProducts = useMemo(() => {
    const keyword = normalizedProductQuery.toLowerCase();
    const source = keyword
      ? products.filter((product) => {
          const haystack = [product.name, product.sku].join(" ").toLowerCase();
          return haystack.includes(keyword);
        })
      : products;
    return source;
  }, [products, normalizedProductQuery]);

  const selectedProductIds = useMemo(() => new Set(items.map((item) => item.productId)), [items]);

  useEffect(() => {
    if (!normalizedCustomerQuery) {
      setLoadingCustomers(false);
      return;
    }

    if (selectedCustomerLabel && normalizedCustomerQuery === selectedCustomerLabel) {
      setLoadingCustomers(false);
      return;
    }

    const handle = window.setTimeout(() => {
      setLoadingCustomers(true);
      setLoadingCustomers(false);
    }, 200);

    return () => {
      window.clearTimeout(handle);
    };
  }, [normalizedCustomerQuery, selectedCustomerLabel]);

  useEffect(() => {
    if (!supplierId) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoadingProducts(true);
      apiFetch<{ data: Product[] }>(`/api/v1/products?page=1&pageSize=200&supplierId=${supplierId}`)
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
  }, [supplierId]);

  useEffect(() => {
    for (const product of filteredProducts.slice(0, 12)) {
      if (!productUomMappings[product.id]) {
        void ensureProductUomsLoaded(product);
      }
    }
  }, [filteredProducts, productUomMappings]);

  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.qty || 0) * item.unitPrice, 0),
    [items],
  );

  function handleSelectCustomer(nextCustomerId: string) {
    setCustomerId(nextCustomerId);
    const customer = customerCache[nextCustomerId] ?? customers.find((item) => item.id === nextCustomerId);
    setCustomerName(customer?.name ?? "");
    setCustomerQuery(customer ? `${customer.code} - ${customer.name}` : "");
  }

  function handleSelectSupplier(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    const supplier = supplierCache[nextSupplierId] ?? suppliers.find((item) => item.id === nextSupplierId);
    setSupplierQuery(supplier ? `${supplier.code} - ${supplier.name}` : "");
    setProductQuery("");
    setMessage(null);
  }

  function handleRemoveItem(productId: string) {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }

  function toNumericPrice(value: number | string | null | undefined) {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function formatQuantity(value: number | string | null | undefined) {
    const numeric = Number(value ?? 0);
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    }).format(Number.isFinite(numeric) ? numeric : 0);
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

  function pickLargestSaleUom(mappings: ProductUomMapping[], fallbackUnit: string) {
    const saleMappings = mappings.filter((item) => item.isSale);
    const source = saleMappings.length ? saleMappings : mappings;
    const sorted = [...source].sort((left, right) => Number(right.toBaseFactor) - Number(left.toBaseFactor));
    const largest = sorted[0];
    if (largest?.uomCode) {
      return {
        code: largest.uomCode,
        name: largest.uomName || largest.uomCode.toUpperCase(),
      };
    }
    const fallbackCode = String(fallbackUnit || "pcs").toLowerCase();
    return {
      code: fallbackCode,
      name: fallbackCode.toUpperCase(),
    };
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

  function getProductSearchMeta(product: Product) {
    const mappings = productUomMappings[product.id] ?? [];
    const largestUom = pickLargestSaleUom(mappings, String(product.unit || "pcs").toLowerCase());
    const baseMapping =
      mappings.find((item) => Number(item.toBaseFactor) === 1) ??
      mappings.find((item) => item.uomCode === String(product.unit || "pcs").toLowerCase());
    const stockBase = Number(product.currentStockBase ?? 0);
    const largestMapping = mappings.find((item) => item.uomCode === largestUom.code);
    const largestFactor = Number(largestMapping?.toBaseFactor ?? 1);
    return {
      largestUom,
      displayPrice: resolveUnitPrice(product, mappings, largestUom.code),
      stockBase,
      baseUomName: (baseMapping?.uomName || product.unit || "pcs").toUpperCase(),
      largestStockQty: largestFactor > 1 ? stockBase / largestFactor : null,
    };
  }

  function focusProductSearch() {
    window.setTimeout(() => {
      productSearchInputRef.current?.focus();
      productSearchInputRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  }

  async function addProduct(product: Product) {
    setProductCache((current) => ({ ...current, [product.id]: product }));

    const { mappings } = await ensureProductUomsLoaded(product);
    const defaultUom = pickLargestSaleUom(mappings, String(product.unit || "pcs").toLowerCase()).code;
    const defaultPrice = resolveUnitPrice(product, mappings, defaultUom);

    setItems((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current;
      }
      return [
        {
          productId: product.id,
          productName: product.name,
          qty: "",
          unitPrice: defaultPrice,
          uom: defaultUom,
        },
        ...current,
      ];
    });
    setMessage(null);
  }

  function getInvalidItemMessage() {
    const invalidItem = items.find((item) => {
      const qty = Number(item.qty);
      return !item.uom || !item.qty.trim() || !Number.isFinite(qty) || qty <= 0;
    });
    if (!invalidItem) return null;
    return `Lengkapi qty dan satuan untuk produk "${invalidItem.productName}" sebelum menyimpan atau mengirim SO.`;
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
    const invalidItemMessage = getInvalidItemMessage();
    if (invalidItemMessage) {
      setMessage(invalidItemMessage);
      return;
    }
    addOrderDraft({
      localId: generateLocalId("so"),
      customerId,
      customerName,
      orderDate: new Date().toISOString().slice(0, 10),
      notes,
      items: items.map((item) => ({
        ...item,
        qty: Number(item.qty),
      })),
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
    const invalidItemMessage = getInvalidItemMessage();
    if (invalidItemMessage) {
      setMessage(invalidItemMessage);
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
            qty: Number(item.qty),
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
    <div className="space-y-3">
      <SurfaceCard className="rounded-[22px] px-3 py-3">
        <div className="text-base font-semibold text-zinc-950">Buat Sales Order</div>
        <div className="mt-1 text-[11px] text-zinc-500">Mode lapangan yang lebih rapat, cepat, dan hemat scroll.</div>
        <div className="mt-3 space-y-3">
          <div>
            <div className="mb-2 text-[12px] font-semibold text-zinc-900">Cari Pelanggan</div>
            <div className="flex items-center gap-2 rounded-[16px] border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                value={customerQuery}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCustomerQuery(nextValue);
                  if (!nextValue.trim()) {
                    setCustomerId("");
                    setCustomerName("");
                  } else if (
                    customerId &&
                    nextValue !== `${customerCache[customerId]?.code ?? ""} - ${customerCache[customerId]?.name ?? customerName}`
                  ) {
                    setCustomerId("");
                    setCustomerName("");
                  }
                }}
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                placeholder="Cari nama toko atau kode pelanggan..."
                autoComplete="off"
              />
            </div>
            {showCustomerResults ? (
              <div className="mt-2 overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-lg">
                {loadingCustomers ? (
                  <div className="px-3 py-2.5 text-sm text-zinc-500">Mencari pelanggan...</div>
                ) : filteredCustomerResults.length ? (
                  <div className="max-h-72 overflow-y-auto p-1.5">
                    {filteredCustomerResults.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => handleSelectCustomer(customer.id)}
                        className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left transition hover:bg-zinc-50"
                      >
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{customer.name}</div>
                          <div className="text-xs text-zinc-500">
                            {customer.code}
                            {customer.regionName ? ` - ${customer.regionName}` : ""}
                          </div>
                        </div>
                        {customerId === customer.id ? (
                          <span className="text-xs font-semibold text-emerald-700">Dipilih</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-sm text-zinc-500">Pelanggan tidak ditemukan.</div>
                )}
              </div>
            ) : !normalizedCustomerQuery ? (
              <div className="mt-2 rounded-[16px] border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
                Ketik nama toko atau kode pelanggan untuk menampilkan dropdown pencarian.
              </div>
            ) : null}
            {customerId && customerName ? (
              <div className="mt-2 rounded-[16px] bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                Pelanggan terpilih: <span className="font-semibold">{customerName}</span>
                {customerCache[customerId]?.regionName ? ` - ${customerCache[customerId]?.regionName}` : ""}
              </div>
            ) : null}
          </div>
          <div>
            <div className="mb-2 text-[12px] font-semibold text-zinc-900">Filter Supplier</div>
            <div className="flex items-center gap-2 rounded-[16px] border border-zinc-200 bg-zinc-50 px-3 py-2.5">
              <Search className="h-4 w-4 text-zinc-400" />
              <input
                value={supplierQuery}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSupplierQuery(nextValue);
                  if (!nextValue.trim()) {
                    setSupplierId("");
                    setProductQuery("");
                  } else if (
                    supplierId &&
                    nextValue !== `${supplierCache[supplierId]?.code ?? ""} - ${supplierCache[supplierId]?.name ?? ""}`
                  ) {
                    setSupplierId("");
                  }
                }}
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                placeholder="Cari supplier untuk tampilkan katalog produk..."
                autoComplete="off"
              />
            </div>
            {showSupplierResults ? (
              <div className="mt-2 overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-lg">
                {loadingSuppliers ? (
                  <div className="px-3 py-2.5 text-sm text-zinc-500">Memuat supplier...</div>
                ) : filteredSupplierResults.length ? (
                  <div className="max-h-72 overflow-y-auto p-1.5">
                    {filteredSupplierResults.map((supplier) => (
                      <button
                        key={supplier.id}
                        type="button"
                        onClick={() => handleSelectSupplier(supplier.id)}
                        className="flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left transition hover:bg-zinc-50"
                      >
                        <div>
                          <div className="text-sm font-medium text-zinc-900">{supplier.name}</div>
                          <div className="text-xs text-zinc-500">{supplier.code}</div>
                        </div>
                        {supplierId === supplier.id ? (
                          <span className="text-xs font-semibold text-emerald-700">Dipilih</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-3 py-2.5 text-sm text-zinc-500">Supplier tidak ditemukan.</div>
                )}
              </div>
            ) : !normalizedSupplierQuery ? (
              <div className="mt-2 rounded-[16px] border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
                Pilih supplier dulu, lalu semua produk supplier itu akan tampil seperti katalog POS.
              </div>
            ) : null}
            {supplierId ? (
              <div className="mt-2 rounded-[16px] bg-sky-50 px-3 py-2.5 text-sm text-sky-900">
                Supplier aktif: <span className="font-semibold">{supplierCache[supplierId]?.name}</span>
              </div>
            ) : null}
          </div>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="field-input min-h-20 resize-none"
            placeholder="Catatan order atau catatan visit..."
          />
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-[22px] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-zinc-900">Katalog Produk Supplier</div>
            <div className="text-[11px] text-zinc-500">Pilih supplier, lihat semua produknya, lalu tambah ke keranjang seperti POS.</div>
          </div>
          <PackageSearch className="h-4 w-4 text-emerald-700" />
        </div>
        <div className="mt-3">
          <input
            ref={productSearchInputRef}
            value={productQuery}
            onChange={(event) => setProductQuery(event.target.value)}
            className="field-input"
            placeholder={supplierId ? "Saring produk atau SKU dalam supplier ini..." : "Pilih supplier dulu..."}
            disabled={!supplierId}
            autoComplete="off"
          />
          {!supplierId ? (
            <div className="mt-2 rounded-[16px] border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 text-[11px] text-zinc-500">
              Supplier menjadi filter utama supaya daftar produk lebih ringkas dan cepat dipilih di lapangan.
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-lg">
              {loadingProducts ? (
                <div className="px-3 py-2.5 text-sm text-zinc-500">Memuat produk supplier...</div>
              ) : filteredProducts.length ? (
                <div className="max-h-72 overflow-y-auto p-1.5">
                  {filteredProducts.map((product) => (
                    (() => {
                      const meta = getProductSearchMeta(product);
                      const isSelected = selectedProductIds.has(product.id);
                      return (
                        <div key={product.id} className="rounded-[14px] border border-zinc-100 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium text-zinc-900">{product.name}</div>
                              <div className="text-[11px] text-zinc-500">
                                {product.sku} • Stok gudang:{" "}
                                {meta.largestStockQty !== null
                                  ? `${formatQuantity(meta.largestStockQty)} ${meta.largestUom.name} • `
                                  : ""}
                                {formatQuantity(meta.stockBase)} {meta.baseUomName}
                              </div>
                              <div className="mt-1 text-[11px] font-medium text-emerald-700">
                                Harga {meta.largestUom.name}: {formatCurrency(meta.displayPrice)}
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                                {String(meta.largestUom.code || product.unit || "pcs").toUpperCase()}
                              </div>
                              <button
                                type="button"
                                onClick={() => addProduct(product)}
                                disabled={isSelected}
                                className={`inline-flex items-center justify-center rounded-[12px] px-3 py-2 text-[11px] font-semibold transition ${
                                  isSelected
                                    ? "bg-zinc-100 text-zinc-400"
                                    : "bg-emerald-950 text-white hover:bg-emerald-900"
                                }`}
                              >
                                {isSelected ? "Di Keranjang" : "Tambah"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()
                  ))}
                </div>
              ) : (
                <div className="px-3 py-3 text-sm text-zinc-500">
                  {normalizedProductQuery ? "Produk tidak ditemukan pada supplier ini." : "Belum ada produk aktif pada supplier ini."}
                </div>
              )}
            </div>
          )}
        </div>
      </SurfaceCard>

      <SurfaceCard className="rounded-[22px] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-zinc-900">Keranjang SO</div>
            <div className="text-[11px] text-zinc-500">Atur qty dan satuan di sini sebelum simpan draft atau kirim SO.</div>
          </div>
          <div className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-700">
            {items.length} item
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {items.length ? (
            items.map((item) => (
              <div key={item.productId} className="rounded-[16px] border border-zinc-200 px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                          <div>
                    <div className="text-sm font-medium text-zinc-900">{item.productName}</div>
                    <div className="text-[11px] text-zinc-500">Harga satuan: {formatCurrency(item.unitPrice)}</div>
                    <div className="text-[11px] text-zinc-500">Satuan aktif: {item.uom.toUpperCase()}</div>
                  </div>
                  <div className="text-right text-[11px] font-semibold text-zinc-900">
                    {formatCurrency(Number(item.qty || 0) * item.unitPrice)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-[72px_1fr_auto] items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={item.qty}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((currentItem) =>
                          currentItem.productId === item.productId
                            ? { ...currentItem, qty: event.target.value }
                            : currentItem,
                        ),
                      )
                    }
                    className="field-input w-[72px] text-center"
                    placeholder="Qty"
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
                    className="text-[11px] font-semibold text-rose-600"
                    onClick={() => handleRemoveItem(item.productId)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          ) : (
            <EmptyState title="Keranjang masih kosong" description="Pilih supplier lalu tambahkan produk dari katalog ke keranjang." />
          )}
          {supplierId ? (
            <button
              type="button"
              onClick={focusProductSearch}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm font-semibold text-zinc-700"
            >
              <Plus className="h-4 w-4" />
              Cari Produk Supplier Lagi
            </button>
          ) : null}
        </div>
      </SurfaceCard>

      {message ? (
        <div className="rounded-[18px] bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
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

      <SurfaceCard className="sticky bottom-24 rounded-[22px] bg-white/95 px-3 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-zinc-500">Total order</div>
            <div className="text-[1.35rem] font-semibold text-zinc-950">{formatCurrency(totalAmount)}</div>
          </div>
          <div className="text-right text-[11px] text-zinc-500">
            {isOnline ? "Online: bisa kirim sekarang" : "Offline ringan: akan simpan draft"}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
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
