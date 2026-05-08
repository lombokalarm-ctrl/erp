#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3005/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
STEP_MODE="${STEP_MODE:-true}"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "ERROR: set ADMIN_EMAIL dan ADMIN_PASSWORD terlebih dahulu."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq belum terinstall."
  exit 1
fi

TS="$(date +%s)"
SKU="UAT-IN-$TS"
PRODUCT_NAME="Produk UAT Inbound $TS"
SUPPLIER_CODE="SUPIN$TS"
SUPPLIER_NAME="Supplier UAT Inbound $TS"

TOKEN=""
PRODUCT_ID=""
SUPPLIER_ID=""
WAREHOUSE_ID=""
PO_ID=""
GRN_1_ID=""
GRN_2_ID=""

pass() { echo "[PASS] $1"; }
info() { echo "[INFO] $1"; }
fail() { echo "[FAIL] $1"; exit 1; }

pause_step() {
  if [[ "$STEP_MODE" == "true" ]]; then
    read -r -p "Tekan Enter untuk lanjut ke langkah berikutnya..."
  fi
}

api_post_public() {
  local endpoint="$1"
  local payload="$2"
  curl -sS -X POST "$BASE_URL$endpoint" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

api_with_auth() {
  local method="$1"
  local endpoint="$2"
  local payload="${3:-}"
  if [[ -n "$payload" ]]; then
    curl -sS -X "$method" "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$payload"
  else
    curl -sS -X "$method" "$BASE_URL$endpoint" \
      -H "Authorization: Bearer $TOKEN"
  fi
}

assert_equals() {
  local actual="$1"
  local expected="$2"
  local msg="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$msg (actual=$actual expected=$expected)"
  fi
  pass "$msg ($actual)"
}

get_stock_qty() {
  local sku="$1"
  local summary
  local qty
  summary="$(api_with_auth "GET" "/inventory/summary?q=$sku")"
  qty="$(echo "$summary" | jq -r --arg SKU "$sku" '.data[] | select(.sku == $SKU) | .qty' | head -n1)"
  if [[ -z "$qty" || "$qty" == "null" ]]; then
    echo "0"
  else
    echo "$qty"
  fi
}

to_int() {
  local n="$1"
  printf "%.0f" "$n"
}

echo "=== UAT UOM V2 INBOUND START ==="
echo "BASE_URL=$BASE_URL"

echo
echo "Scenario 1 - Login"
LOGIN_RES="$(api_post_public "/auth/login" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")"
TOKEN="$(echo "$LOGIN_RES" | jq -r '.data.accessToken // empty')"
[[ -n "$TOKEN" ]] || fail "Gagal login / token kosong"
pass "Login berhasil"
pause_step

echo
echo "Scenario 2 - Create product inbound"
CREATE_PRODUCT_PAYLOAD="$(cat <<JSON
{
  "sku":"$SKU",
  "name":"$PRODUCT_NAME",
  "unit":"pcs",
  "purchasePrice":10000,
  "salePrice":15000,
  "packSize":10,
  "packPerDus":10,
  "dusSize":100
}
JSON
)"
PRODUCT_RES="$(api_with_auth "POST" "/products" "$CREATE_PRODUCT_PAYLOAD")"
PRODUCT_ID="$(echo "$PRODUCT_RES" | jq -r '.data.id // empty')"
[[ -n "$PRODUCT_ID" ]] || fail "Gagal create product inbound"
pass "Product dibuat: $PRODUCT_ID"
pause_step

echo
echo "Scenario 3 - Set product UOM mappings"
SET_UOM_PAYLOAD='{
  "mappings":[
    {"uomCode":"pcs","toBaseFactor":1,"isSale":true,"isPurchase":true,"isDefaultSale":true,"isDefaultPurchase":true},
    {"uomCode":"pack","toBaseFactor":10,"isSale":true,"isPurchase":true},
    {"uomCode":"dus","toBaseFactor":100,"isSale":true,"isPurchase":true}
  ]
}'
UOM_RES="$(api_with_auth "PUT" "/products/$PRODUCT_ID/uoms" "$SET_UOM_PAYLOAD")"
MAPPING_COUNT="$(echo "$UOM_RES" | jq -r '.data | length')"
assert_equals "$MAPPING_COUNT" "3" "Jumlah mapping UOM = 3"
pause_step

echo
echo "Scenario 4 - Create supplier inbound"
CREATE_SUPPLIER_PAYLOAD="$(cat <<JSON
{
  "code":"$SUPPLIER_CODE",
  "name":"$SUPPLIER_NAME",
  "phone":"08123456789",
  "address":"Alamat Supplier UAT"
}
JSON
)"
SUPPLIER_RES="$(api_with_auth "POST" "/suppliers" "$CREATE_SUPPLIER_PAYLOAD")"
SUPPLIER_ID="$(echo "$SUPPLIER_RES" | jq -r '.data.id // empty')"
[[ -n "$SUPPLIER_ID" ]] || fail "Gagal create supplier"
pass "Supplier dibuat: $SUPPLIER_ID"
pause_step

echo
echo "Scenario 5 - Ambil warehouse default"
WAREHOUSE_RES="$(api_with_auth "GET" "/warehouses")"
WAREHOUSE_ID="$(echo "$WAREHOUSE_RES" | jq -r '.data[0].id // empty')"
[[ -n "$WAREHOUSE_ID" ]] || fail "Warehouse tidak ditemukan"
pass "Warehouse terpilih: $WAREHOUSE_ID"
pause_step

echo
echo "Scenario 6 - Ambil stok awal produk"
QTY_BEFORE_RAW="$(get_stock_qty "$SKU")"
QTY_BEFORE="$(to_int "$QTY_BEFORE_RAW")"
info "Stok awal = $QTY_BEFORE"
pause_step

echo
echo "Scenario 7 - Create PO 1 dus"
PO_PAYLOAD="$(cat <<JSON
{
  "supplierId":"$SUPPLIER_ID",
  "orderDate":"$(date +%F)",
  "notes":"UAT inbound PO",
  "items":[
    {"productId":"$PRODUCT_ID","qty":1,"uom":"dus","unitPrice":100000}
  ]
}
JSON
)"
PO_RES="$(api_with_auth "POST" "/purchase-orders" "$PO_PAYLOAD")"
PO_ID="$(echo "$PO_RES" | jq -r '.data.id // empty')"
[[ -n "$PO_ID" ]] || fail "Gagal create PO"
pass "PO dibuat: $PO_ID"
pause_step

echo
echo "Scenario 8 - GRN 1 pack (expected +10 base qty)"
GRN_1_PAYLOAD="$(cat <<JSON
{
  "purchaseOrderId":"$PO_ID",
  "warehouseId":"$WAREHOUSE_ID",
  "receivedDate":"$(date +%F)",
  "notes":"UAT GRN 1 pack",
  "items":[
    {"productId":"$PRODUCT_ID","qty":1,"uom":"pack"}
  ]
}
JSON
)"
GRN_1_RES="$(api_with_auth "POST" "/goods-receipts" "$GRN_1_PAYLOAD")"
GRN_1_ID="$(echo "$GRN_1_RES" | jq -r '.data.id // empty')"
[[ -n "$GRN_1_ID" ]] || fail "Gagal create GRN 1"
pass "GRN 1 dibuat: $GRN_1_ID"
pause_step

echo
echo "Scenario 9 - Verifikasi stok naik +10"
QTY_AFTER_GRN1_RAW="$(get_stock_qty "$SKU")"
QTY_AFTER_GRN1="$(to_int "$QTY_AFTER_GRN1_RAW")"
EXPECTED_1=$((QTY_BEFORE + 10))
assert_equals "$QTY_AFTER_GRN1" "$EXPECTED_1" "Stok setelah GRN 1 pack"
pause_step

echo
echo "Scenario 10 - GRN 90 pcs (expected total +100 dari stok awal)"
GRN_2_PAYLOAD="$(cat <<JSON
{
  "purchaseOrderId":"$PO_ID",
  "warehouseId":"$WAREHOUSE_ID",
  "receivedDate":"$(date +%F)",
  "notes":"UAT GRN 90 pcs",
  "items":[
    {"productId":"$PRODUCT_ID","qty":90,"uom":"pcs"}
  ]
}
JSON
)"
GRN_2_RES="$(api_with_auth "POST" "/goods-receipts" "$GRN_2_PAYLOAD")"
GRN_2_ID="$(echo "$GRN_2_RES" | jq -r '.data.id // empty')"
[[ -n "$GRN_2_ID" ]] || fail "Gagal create GRN 2"
pass "GRN 2 dibuat: $GRN_2_ID"
pause_step

echo
echo "Scenario 11 - Verifikasi stok total naik +100"
QTY_AFTER_GRN2_RAW="$(get_stock_qty "$SKU")"
QTY_AFTER_GRN2="$(to_int "$QTY_AFTER_GRN2_RAW")"
EXPECTED_2=$((QTY_BEFORE + 100))
assert_equals "$QTY_AFTER_GRN2" "$EXPECTED_2" "Stok setelah GRN 1 pack + 90 pcs"
pause_step

echo
echo "Scenario 12 - Validasi transaksi inventory PURCHASE_IN minimal 2 entry"
TX_RES="$(api_with_auth "GET" "/inventory/transactions?page=1&pageSize=200")"
PURCHASE_IN_COUNT="$(echo "$TX_RES" | jq -r --arg SKU "$SKU" '[.data[] | select(.type=="PURCHASE_IN" and .sku==$SKU)] | length')"
if [[ "$PURCHASE_IN_COUNT" -lt 2 ]]; then
  fail "Transaksi PURCHASE_IN kurang dari 2 untuk produk uji"
fi
pass "Transaksi PURCHASE_IN tervalidasi (count=$PURCHASE_IN_COUNT)"

echo
echo "=== UAT UOM V2 INBOUND SELESAI ==="
echo "PRODUCT_ID=$PRODUCT_ID"
echo "SUPPLIER_ID=$SUPPLIER_ID"
echo "WAREHOUSE_ID=$WAREHOUSE_ID"
echo "PO_ID=$PO_ID"
echo "GRN_1_ID=$GRN_1_ID"
echo "GRN_2_ID=$GRN_2_ID"
