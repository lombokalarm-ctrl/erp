#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:3000/api/v1}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
PSQL_DSN="${PSQL_DSN:-}"
STEP_MODE="${STEP_MODE:-true}"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "ERROR: set ADMIN_EMAIL and ADMIN_PASSWORD terlebih dahulu."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq belum terinstall."
  exit 1
fi

TS="$(date +%s)"
SKU="UAT-UOM-$TS"
PRODUCT_NAME="Produk UAT UOM $TS"
CUSTOMER_CODE="CUAT$TS"
CUSTOMER_NAME="Customer UAT $TS"

TOKEN=""
PRODUCT_ID=""
CUSTOMER_ID=""
SO_ID=""
INVOICE_ID=""
RETURN_1_ID=""
RETURN_2_ID=""
RETURN_3_ID=""

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

api_expect_non_2xx() {
  local method="$1"
  local endpoint="$2"
  local payload="$3"
  local status
  status="$(curl -sS -o /tmp/uat_uom_err.json -w "%{http_code}" -X "$method" "$BASE_URL$endpoint" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")"
  if [[ "$status" =~ ^2 ]]; then
    fail "Expected non-2xx untuk $endpoint, tapi dapat $status"
  fi
  info "Expected reject on $endpoint (status=$status)"
}

assert_num_equals() {
  local actual="$1"
  local expected="$2"
  local msg="$3"
  if [[ "$actual" != "$expected" ]]; then
    fail "$msg (actual=$actual expected=$expected)"
  fi
  pass "$msg ($actual)"
}

echo "=== UAT UOM V2 START ==="
echo "BASE_URL=$BASE_URL"

echo
echo "Scenario 1 - Login"
LOGIN_RES="$(api_post_public "/auth/login" "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")"
TOKEN="$(echo "$LOGIN_RES" | jq -r '.data.accessToken // empty')"
[[ -n "$TOKEN" ]] || fail "Gagal login / token kosong"
pass "Login berhasil"
pause_step

echo
echo "Scenario 2 - Create product"
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
[[ -n "$PRODUCT_ID" ]] || fail "Gagal create product"
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
assert_num_equals "$MAPPING_COUNT" "3" "Jumlah mapping UOM = 3"
pause_step

echo
echo "Scenario 4 - Invalid mapping factor must be rejected"
INVALID_UOM_PAYLOAD='{
  "mappings":[
    {"uomCode":"pcs","toBaseFactor":1,"isSale":true,"isPurchase":true,"isDefaultSale":true,"isDefaultPurchase":true},
    {"uomCode":"pack","toBaseFactor":0,"isSale":true,"isPurchase":true}
  ]
}'
api_expect_non_2xx "PUT" "/products/$PRODUCT_ID/uoms" "$INVALID_UOM_PAYLOAD"
pass "Invalid factor ditolak"
pause_step

echo
echo "Scenario 5 - Create customer"
CREATE_CUSTOMER_PAYLOAD="$(cat <<JSON
{
  "code":"$CUSTOMER_CODE",
  "name":"$CUSTOMER_NAME",
  "category":"RETAIL",
  "phone":"08123456789",
  "address":"Alamat UAT"
}
JSON
)"
CUSTOMER_RES="$(api_with_auth "POST" "/customers" "$CREATE_CUSTOMER_PAYLOAD")"
CUSTOMER_ID="$(echo "$CUSTOMER_RES" | jq -r '.data.id // empty')"
[[ -n "$CUSTOMER_ID" ]] || fail "Gagal create customer"
pass "Customer dibuat: $CUSTOMER_ID"
pause_step

echo
echo "Scenario 6 - Set customer credit profile"
CREDIT_PROFILE_PAYLOAD='{
  "creditLimit":1000000,
  "salesOrderLimit":10,
  "paymentTermDays":14,
  "maxOverdueDaysBeforeBlock":30
}'
PROFILE_RES="$(api_with_auth "PUT" "/customers/$CUSTOMER_ID/credit-profile" "$CREDIT_PROFILE_PAYLOAD")"
PROFILE_CUST_ID="$(echo "$PROFILE_RES" | jq -r '.data.customerId // empty')"
[[ "$PROFILE_CUST_ID" == "$CUSTOMER_ID" ]] || fail "Credit profile tidak tersimpan benar"
pass "Credit profile tersimpan"
pause_step

echo
echo "Scenario 7 - Create sales order (1 pack @15000)"
SO_PAYLOAD="$(cat <<JSON
{
  "customerId":"$CUSTOMER_ID",
  "orderDate":"$(date +%F)",
  "discountAmount":0,
  "items":[
    {
      "productId":"$PRODUCT_ID",
      "qty":1,
      "uom":"pack",
      "unitPrice":15000
    }
  ]
}
JSON
)"
SO_RES="$(api_with_auth "POST" "/sales-orders" "$SO_PAYLOAD")"
SO_ID="$(echo "$SO_RES" | jq -r '.data.salesOrder.id // empty')"
[[ -n "$SO_ID" ]] || fail "Gagal create sales order"
pass "Sales order dibuat: $SO_ID"
pause_step

echo
echo "Scenario 8 - Deliver SO -> create invoice"
DELIVER_PAYLOAD="{\"deliveryDate\":\"$(date +%F)\"}"
DELIVER_RES="$(api_with_auth "POST" "/sales-orders/$SO_ID/deliver" "$DELIVER_PAYLOAD")"
INVOICE_ID="$(echo "$DELIVER_RES" | jq -r '.data.invoice.id // empty')"
[[ -n "$INVOICE_ID" ]] || fail "Gagal deliver SO / invoice tidak terbentuk"
pass "Invoice terbentuk: $INVOICE_ID"
pause_step

echo
echo "Scenario 9 - Verify invoice detail exists"
INV_DETAIL="$(api_with_auth "GET" "/invoices/$INVOICE_ID/detail")"
INV_ITEM_COUNT="$(echo "$INV_DETAIL" | jq -r '.data.items | length')"
assert_num_equals "$INV_ITEM_COUNT" "1" "Invoice item count = 1"
pause_step

echo
echo "Scenario 10 - Return partial 5 pcs and post"
RETURN_1_PAYLOAD="$(cat <<JSON
{
  "type":"SALES_RETURN",
  "customerId":"$CUSTOMER_ID",
  "sourceInvoiceId":"$INVOICE_ID",
  "returnDate":"$(date +%F)",
  "notes":"UAT retur 5 pcs",
  "items":[
    {
      "productId":"$PRODUCT_ID",
      "qty":5,
      "uom":"pcs",
      "reason":"UAT parsial 5 pcs"
    }
  ]
}
JSON
)"
RETURN_1_RES="$(api_with_auth "POST" "/returns" "$RETURN_1_PAYLOAD")"
RETURN_1_ID="$(echo "$RETURN_1_RES" | jq -r '.data.id // empty')"
[[ -n "$RETURN_1_ID" ]] || fail "Gagal create return 1"
POST_RETURN_1="$(api_with_auth "POST" "/returns/$RETURN_1_ID/post" "{}")"
CN1_TOTAL="$(echo "$POST_RETURN_1" | jq -r '.data.creditNote.totalAmount // empty')"
assert_num_equals "$CN1_TOTAL" "7500" "CN retur 5 pcs = 7500"
pass "Retur parsial 5 pcs tervalidasi"
pause_step

echo
echo "Scenario 11 - Over-return 6 pcs must fail on post"
RETURN_2_PAYLOAD="$(cat <<JSON
{
  "type":"SALES_RETURN",
  "customerId":"$CUSTOMER_ID",
  "sourceInvoiceId":"$INVOICE_ID",
  "returnDate":"$(date +%F)",
  "notes":"UAT over return",
  "items":[
    {
      "productId":"$PRODUCT_ID",
      "qty":6,
      "uom":"pcs",
      "reason":"UAT over return 6 pcs"
    }
  ]
}
JSON
)"
RETURN_2_RES="$(api_with_auth "POST" "/returns" "$RETURN_2_PAYLOAD")"
RETURN_2_ID="$(echo "$RETURN_2_RES" | jq -r '.data.id // empty')"
[[ -n "$RETURN_2_ID" ]] || fail "Gagal create return 2"
api_expect_non_2xx "POST" "/returns/$RETURN_2_ID/post" "{}"
pass "Over-return tertolak sesuai ekspektasi"
pause_step

echo
echo "Scenario 12 - Return sisa 5 pcs and post"
RETURN_3_PAYLOAD="$(cat <<JSON
{
  "type":"SALES_RETURN",
  "customerId":"$CUSTOMER_ID",
  "sourceInvoiceId":"$INVOICE_ID",
  "returnDate":"$(date +%F)",
  "notes":"UAT sisa 5 pcs",
  "items":[
    {
      "productId":"$PRODUCT_ID",
      "qty":5,
      "uom":"pcs",
      "reason":"UAT sisa 5 pcs"
    }
  ]
}
JSON
)"
RETURN_3_RES="$(api_with_auth "POST" "/returns" "$RETURN_3_PAYLOAD")"
RETURN_3_ID="$(echo "$RETURN_3_RES" | jq -r '.data.id // empty')"
[[ -n "$RETURN_3_ID" ]] || fail "Gagal create return 3"
POST_RETURN_3="$(api_with_auth "POST" "/returns/$RETURN_3_ID/post" "{}")"
CN3_TOTAL="$(echo "$POST_RETURN_3" | jq -r '.data.creditNote.totalAmount // empty')"
assert_num_equals "$CN3_TOTAL" "7500" "CN retur sisa 5 pcs = 7500"
pass "Retur sisa tervalidasi"
pause_step

if [[ -n "$PSQL_DSN" ]] && command -v psql >/dev/null 2>&1; then
  echo
  echo "SQL validation (optional)"
  INV_BASE="$(psql "$PSQL_DSN" -tA -c "select coalesce(sum(qty_base),0) from invoice_items where invoice_id = '$INVOICE_ID';" | xargs)"
  RET_BASE="$(psql "$PSQL_DSN" -tA -c "select coalesce(sum(ri.qty_base),0) from returns r join return_items ri on ri.return_id=r.id where r.source_invoice_id='$INVOICE_ID' and r.status in ('POSTED','COMPLETED');" | xargs)"
  echo "invoice_qty_base=$INV_BASE"
  echo "returned_qty_base=$RET_BASE"
fi

echo
echo "=== UAT UOM V2 SELESAI ==="
echo "PRODUCT_ID=$PRODUCT_ID"
echo "CUSTOMER_ID=$CUSTOMER_ID"
echo "SO_ID=$SO_ID"
echo "INVOICE_ID=$INVOICE_ID"
echo "RETURN_1_ID=$RETURN_1_ID"
echo "RETURN_2_ID=$RETURN_2_ID"
echo "RETURN_3_ID=$RETURN_3_ID"
