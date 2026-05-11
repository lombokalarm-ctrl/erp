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
SKU="UAT-CPLUS-$TS"
PRODUCT_NAME="Produk UAT C+ $TS"
SUP_A_CODE="SUA$TS"
SUP_B_CODE="SUB$TS"
SUP_A_NAME="Supplier A UAT $TS"
SUP_B_NAME="Supplier B UAT $TS"
CLIENT_REF="uat-trf-$TS"

TOKEN=""
PRODUCT_ID=""
SUPPLIER_A_ID=""
SUPPLIER_B_ID=""
WAREHOUSE_A_ID=""
WAREHOUSE_B_ID=""
PO_A_ID=""
PO_B_ID=""
GRN_A_ID=""
GRN_B_ID=""
APPROVAL_L1_ID=""
APPROVAL_L2_ID=""

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

assert_non_empty() {
  local v="$1"
  local msg="$2"
  [[ -n "$v" && "$v" != "null" ]] || fail "$msg"
  pass "$msg"
}

echo "=== UAT Sprint C+ (Approval Transfer + Auto Supplier) START ==="
echo "BASE_URL=$BASE_URL"

echo
echo "Scenario 1 - Login admin"
LOGIN_RES="$(api_post_public "/auth/login" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")"
TOKEN="$(echo "$LOGIN_RES" | jq -r '.data.accessToken // empty')"
assert_non_empty "$TOKEN" "Login berhasil"
pause_step

echo
echo "Scenario 2 - Ambil 2 warehouse"
WH_RES="$(api_with_auth "GET" "/warehouses")"
WAREHOUSE_A_ID="$(echo "$WH_RES" | jq -r '.data[0].id // empty')"
WAREHOUSE_B_ID="$(echo "$WH_RES" | jq -r '.data[1].id // empty')"
assert_non_empty "$WAREHOUSE_A_ID" "Warehouse asal tersedia"
assert_non_empty "$WAREHOUSE_B_ID" "Warehouse tujuan tersedia"
if [[ "$WAREHOUSE_A_ID" == "$WAREHOUSE_B_ID" ]]; then
  fail "Warehouse asal dan tujuan tidak boleh sama"
fi
pause_step

echo
echo "Scenario 3 - Create supplier A dan B"
SUP_A_RES="$(api_with_auth "POST" "/suppliers" "{\"code\":\"$SUP_A_CODE\",\"name\":\"$SUP_A_NAME\"}")"
SUPPLIER_A_ID="$(echo "$SUP_A_RES" | jq -r '.data.id // empty')"
assert_non_empty "$SUPPLIER_A_ID" "Supplier A dibuat"

SUP_B_RES="$(api_with_auth "POST" "/suppliers" "{\"code\":\"$SUP_B_CODE\",\"name\":\"$SUP_B_NAME\"}")"
SUPPLIER_B_ID="$(echo "$SUP_B_RES" | jq -r '.data.id // empty')"
assert_non_empty "$SUPPLIER_B_ID" "Supplier B dibuat"
pause_step

echo
echo "Scenario 4 - Create produk + parameter replenishment"
CREATE_PRODUCT_PAYLOAD="$(cat <<JSON
{
  "sku":"$SKU",
  "name":"$PRODUCT_NAME",
  "unit":"pcs",
  "purchasePrice":8000,
  "salePrice":10000,
  "packSize":10,
  "packPerDus":10,
  "dusSize":100,
  "minStockBase":200,
  "reorderQtyBase":150,
  "leadTimeDays":2,
  "bufferDays":1
}
JSON
)"
PRODUCT_RES="$(api_with_auth "POST" "/products" "$CREATE_PRODUCT_PAYLOAD")"
PRODUCT_ID="$(echo "$PRODUCT_RES" | jq -r '.data.id // empty')"
assert_non_empty "$PRODUCT_ID" "Produk dibuat"
pause_step

echo
echo "Scenario 5 - Seed histori supplier via PO+GRN"
TODAY="$(date +%F)"
PO_A_RES="$(api_with_auth "POST" "/purchase-orders" "{\"supplierId\":\"$SUPPLIER_A_ID\",\"orderDate\":\"$TODAY\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":1,\"uom\":\"pack\",\"unitPrice\":80000}]}")"
PO_A_ID="$(echo "$PO_A_RES" | jq -r '.data.id // empty')"
assert_non_empty "$PO_A_ID" "PO supplier A dibuat"
GRN_A_RES="$(api_with_auth "POST" "/goods-receipts" "{\"purchaseOrderId\":\"$PO_A_ID\",\"warehouseId\":\"$WAREHOUSE_A_ID\",\"receivedDate\":\"$TODAY\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":1,\"uom\":\"pack\"}]}")"
GRN_A_ID="$(echo "$GRN_A_RES" | jq -r '.data.id // empty')"
assert_non_empty "$GRN_A_ID" "GRN supplier A dibuat"

PO_B_RES="$(api_with_auth "POST" "/purchase-orders" "{\"supplierId\":\"$SUPPLIER_B_ID\",\"orderDate\":\"$TODAY\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":1,\"uom\":\"pack\",\"unitPrice\":82000}]}")"
PO_B_ID="$(echo "$PO_B_RES" | jq -r '.data.id // empty')"
assert_non_empty "$PO_B_ID" "PO supplier B dibuat"
GRN_B_RES="$(api_with_auth "POST" "/goods-receipts" "{\"purchaseOrderId\":\"$PO_B_ID\",\"warehouseId\":\"$WAREHOUSE_A_ID\",\"receivedDate\":\"$TODAY\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"qty\":1,\"uom\":\"pack\"}]}")"
GRN_B_ID="$(echo "$GRN_B_RES" | jq -r '.data.id // empty')"
assert_non_empty "$GRN_B_ID" "GRN supplier B dibuat"
pause_step

echo
echo "Scenario 6 - Auto Draft PO by supplier dari replenishment"
DRAFT_RES="$(api_with_auth "POST" "/inventory/replenishment/draft-po" "{\"autoBySupplier\":true,\"fallbackSupplierId\":\"$SUPPLIER_A_ID\",\"orderDate\":\"$TODAY\",\"warehouseId\":\"$WAREHOUSE_A_ID\",\"lookbackDays\":30,\"productIds\":[\"$PRODUCT_ID\"]}")"
DRAFT_CREATED="$(echo "$DRAFT_RES" | jq -r '.data.created // false')"
[[ "$DRAFT_CREATED" == "true" ]] || fail "Auto Draft PO gagal dibuat"
PO_COUNT="$(echo "$DRAFT_RES" | jq -r '.data.poCount // 0')"
if [[ "$PO_COUNT" -lt 1 ]]; then
  fail "Auto Draft PO tidak menghasilkan dokumen"
fi
pass "Auto Draft PO berhasil (poCount=$PO_COUNT)"
pause_step

echo
echo "Scenario 7 - Ajukan transfer gudang (status request pending)"
TRF_REQ_RES="$(api_with_auth "POST" "/inventory/transfers" "{\"sourceWarehouseId\":\"$WAREHOUSE_A_ID\",\"targetWarehouseId\":\"$WAREHOUSE_B_ID\",\"transferDate\":\"$TODAY\",\"clientRef\":\"$CLIENT_REF\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"qtyBase\":2}]}")"
REQUEST_ID="$(echo "$TRF_REQ_RES" | jq -r '.data.requestId // empty')"
REQUEST_NO="$(echo "$TRF_REQ_RES" | jq -r '.data.requestNo // empty')"
REQUEST_STATUS="$(echo "$TRF_REQ_RES" | jq -r '.data.requestStatus // empty')"
assert_non_empty "$REQUEST_ID" "Request transfer dibuat"
assert_non_empty "$REQUEST_NO" "Nomor request transfer terbentuk"
[[ "$REQUEST_STATUS" == "PENDING_L1" ]] || fail "Status awal request harus PENDING_L1"
pass "Status awal request = PENDING_L1"
pause_step

echo
echo "Scenario 8 - Ambil approval L1 dan L2"
APPROVALS_RES="$(api_with_auth "GET" "/inventory/transfers/approvals?page=1&pageSize=100")"
APPROVAL_L1_ID="$(echo "$APPROVALS_RES" | jq -r --arg R "$REQUEST_ID" '.data[] | select(.requestId==$R and .level==1) | .approvalId' | head -n1)"
APPROVAL_L2_ID="$(echo "$APPROVALS_RES" | jq -r --arg R "$REQUEST_ID" '.data[] | select(.requestId==$R and .level==2) | .approvalId' | head -n1)"
assert_non_empty "$APPROVAL_L1_ID" "Approval level 1 tersedia"
assert_non_empty "$APPROVAL_L2_ID" "Approval level 2 tersedia"
pause_step

echo
echo "Scenario 9 - Proses approval level 1"
L1_RES="$(api_with_auth "POST" "/inventory/transfers/approvals/$APPROVAL_L1_ID/process" "{\"action\":\"APPROVED\"}")"
L1_STATUS="$(echo "$L1_RES" | jq -r '.data.newRequestStatus // empty')"
[[ "$L1_STATUS" == "PENDING_L2" ]] || fail "Setelah L1 approve, status harus PENDING_L2"
pass "Approval L1 sukses"
pause_step

echo
echo "Scenario 10 - Proses approval level 2 dan verifikasi posting transfer"
L2_RES="$(api_with_auth "POST" "/inventory/transfers/approvals/$APPROVAL_L2_ID/process" "{\"action\":\"APPROVED\"}")"
L2_STATUS="$(echo "$L2_RES" | jq -r '.data.newRequestStatus // empty')"
POSTED_TRF_NO="$(echo "$L2_RES" | jq -r '.data.postedTransferNo // empty')"
[[ "$L2_STATUS" == "APPROVED" ]] || fail "Setelah L2 approve, status harus APPROVED"
assert_non_empty "$POSTED_TRF_NO" "Transfer posted terbentuk setelah approval L2"
pass "Approval L2 sukses"
pause_step

echo
echo "Scenario 11 - Verifikasi dokumen transfer muncul di list transfer"
TRF_LIST="$(api_with_auth "GET" "/inventory/transfers?page=1&pageSize=100")"
HAS_POSTED="$(echo "$TRF_LIST" | jq -r --arg N "$POSTED_TRF_NO" '[.data[] | select(.transferNo==$N)] | length')"
[[ "$HAS_POSTED" -ge 1 ]] || fail "Dokumen transfer tidak ditemukan di daftar transfer"
pass "Dokumen transfer tampil di daftar transfer"
pause_step

echo
echo "Scenario 12 - Verifikasi idempotent clientRef"
TRF_DUP_RES="$(api_with_auth "POST" "/inventory/transfers" "{\"sourceWarehouseId\":\"$WAREHOUSE_A_ID\",\"targetWarehouseId\":\"$WAREHOUSE_B_ID\",\"transferDate\":\"$TODAY\",\"clientRef\":\"$CLIENT_REF\",\"items\":[{\"productId\":\"$PRODUCT_ID\",\"qtyBase\":2}]}")"
DUP_FLAG="$(echo "$TRF_DUP_RES" | jq -r '.data.duplicate // false')"
[[ "$DUP_FLAG" == "true" ]] || fail "Request transfer duplikat dengan clientRef yang sama seharusnya duplicate=true"
pass "Idempotent clientRef tervalidasi"

echo
echo "=== UAT Sprint C+ SELESAI ==="
echo "PRODUCT_ID=$PRODUCT_ID"
echo "SUPPLIER_A_ID=$SUPPLIER_A_ID"
echo "SUPPLIER_B_ID=$SUPPLIER_B_ID"
echo "REQUEST_ID=$REQUEST_ID"
echo "POSTED_TRANSFER_NO=$POSTED_TRF_NO"
