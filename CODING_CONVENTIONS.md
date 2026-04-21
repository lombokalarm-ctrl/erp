## Tujuan
Dokumen ini jadi acuan konsistensi coding untuk ERP Distributor F&B (frontend + backend) agar mudah di-maintain, scalable, dan minim bug.

## Bahasa & Penamaan
- Bahasa kode: Inggris (nama variabel, fungsi, class, endpoint, DB column)
- Bahasa UI: Indonesia (label, judul halaman, pesan validasi)
- Format nama:
  - file/folder: kebab-case (contoh: sales-order.service.ts, stock-cards)
  - class: PascalCase (SalesOrderService)
  - function/variable: camelCase (calculateCustomerScore)
  - konstanta: SCREAMING_SNAKE_CASE (INVOICE_STATUS)

## Struktur Repo (disarankan)
- /apps/api: backend NestJS
- /apps/web: frontend React
- /packages/shared: shared types (DTO/enum) dan util yang aman untuk dipakai lintas app
- /docs: dokumentasi tambahan (opsional)

## Backend (NestJS) Conventions

### Modularisasi Domain
Satu domain = satu module, contoh:
- master (customers, suppliers, products)
- inventory
- purchasing
- sales
- ar (payments, receivables)
- credit (limit, scoring)
- reporting

Tiap domain minimal berisi:
- controller (HTTP layer)
- service (business logic)
- repository/data-access (ORM query)
- dto (request/response validation)

### API & Versioning
- Prefix: /api/v1
- Resource plural: /sales-orders, /purchase-orders
- Filter/sort/pagination standar:
  - page, pageSize, sort (contoh: sort=createdAt:desc)
  - q untuk pencarian bebas
  - filters[field]=value untuk filter spesifik

### Error Handling
- Satu format error konsisten:
  - { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
- Validasi input wajib di DTO
- Jangan bocorkan detail internal (stack trace) ke client

### Audit Trail
Operasi yang wajib audit:
- perubahan credit limit & scoring config
- approval override limit/discount
- stock adjustment
- penerbitan invoice dan pencatatan pembayaran

Audit log minimal menyimpan:
- actor (user_id), action, entity, entity_id, sebelum/sesudah (patch ringkas), timestamp

### Transaksi Database
Gunakan transaksi untuk operasi yang memengaruhi konsistensi:
- GRN (goods receipt) → inventory + cost update
- delivery/invoice → inventory out + AR
- pembayaran → payment record + update status invoice + update sisa limit

## Database (PostgreSQL) Conventions
- Primary key: uuid
- Timestamp: created_at, updated_at (timestamptz)
- Soft delete (opsional): deleted_at
- Index:
  - foreign keys
  - invoice_no, due_date, customer_id untuk AR
  - sku untuk produk
- Enum di level aplikasi (disarankan) atau enum PostgreSQL jika sudah stabil

## Frontend (React) Conventions

### Struktur Folder (web)
- src/app: routing dan layout utama (sidebar/topbar)
- src/modules/<domain>: halaman, komponen, hooks per domain
- src/components: komponen reusable lintas domain (Table, Modal, FormField)
- src/api: client dan definisi endpoint
- src/styles: tokens, theme, dan global styles

### Komponen & State
- Komponen domain disimpan dekat dengan halaman modulnya
- Form besar: gunakan form schema + validation
- Tabel besar: server-side pagination, filter, sort

### UI/UX Konsistensi
- Satu library komponen UI (dipilih saat implementasi) untuk konsistensi
- Semua tabel wajib punya: loading state, empty state, error state
- Semua aksi mutasi (create/update/delete) wajib punya: konfirmasi (jika destruktif) + toast hasil

## Keamanan (Wajib)
- Jangan log token, password, atau data sensitif pelanggan
- Sanitasi input teks untuk mencegah XSS (terutama rich text jika ada)
- File upload (bukti transfer):
  - batasi tipe file (image/pdf)
  - batasi ukuran
  - randomize filename + simpan metadata di DB

## Testing (bertahap)
- Backend:
  - unit test untuk perhitungan scoring dan validasi kredit
  - integration test untuk flow: SO → delivery → invoice → payment
- Frontend:
  - smoke test halaman inti (login, SO, invoice, payment)

## Git & Review (opsional tapi disarankan)
- Branch: feature/<scope>, fix/<scope>
- Commit message: feat:, fix:, chore:, refactor:
- Checklist review:
  - RBAC enforced di backend
  - validasi input lengkap
  - pagination server-side untuk list besar
  - audit log untuk aksi kritikal
