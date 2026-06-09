# Target Implementation Plan

## Tujuan Dokumen

Dokumen ini adalah revisi final acuan implementasi modul target kinerja berdasarkan kebutuhan terbaru:

- target bulanan sales
- jadwal kunjungan sales per wilayah dan per hari
- jadwal pengantaran operasional per wilayah dan per hari
- laporan kinerja sales
- laporan kontribusi driver

Dokumen ini melengkapi `target-plan.md` dan berfokus pada:

- wireframe revisi halaman
- desain tabel database revisi
- desain payload API revisi
- patch plan teknis per file
- batasan penggunaan tabel existing

## Batasan Penting

Modul ini wajib mengikuti batasan berikut:

- daftar `sales` diambil dari tabel `users` join `roles`
- daftar `driver` diambil dari tabel `users` join `roles`
- daftar `wilayah` diambil dari tabel `regions`
- tidak membuat tabel master baru untuk `sales`
- tidak membuat tabel master baru untuk `driver`
- tidak membuat tabel master baru untuk `wilayah`

Artinya:

- sumber personel tetap `users`
- sumber role tetap `roles`
- sumber wilayah tetap `regions`
- tabel baru hanya untuk menyimpan planning target dan jadwal

## Ringkasan Model Baru

Model implementasi final yang dipakai:

- `sales` memiliki target bulanan per orang
- dalam satu bulan, satu sales bisa memiliki beberapa jadwal kunjungan
- setiap jadwal kunjungan sales disimpan per `wilayah + hari`
- setiap jadwal kunjungan memiliki `target kunjungan per hari`
- target `penjualan` dan `sales order` tetap disimpan pada level bulanan per sales
- `driver` tidak di-assign saat planning
- pengantaran direncanakan sebagai kebutuhan operasional per `wilayah + hari`
- capaian driver dihitung dari realisasi aktual delivery yang dia tangani

## Sumber Data Existing

### Sales dan Driver

Sumber data:

- tabel `users`
- tabel `roles`

Aturan pengambilan data:

- `users.is_active = true`
- join `users.role_id = roles.id`
- filter `roles.name = 'Sales'` untuk sales
- filter `roles.name = 'Driver'` untuk driver

### Wilayah

Sumber data:

- tabel `regions`

Aturan pengambilan data:

- ambil seluruh wilayah dari `regions`

### Sumber Realisasi KPI

Sumber aktual yang akan dipakai:

- `sales_visits` untuk realisasi kunjungan sales
- `customers.region_id` untuk mapping wilayah kunjungan
- `sales_orders` untuk realisasi omzet dan jumlah SO
- `delivery_orders.created_by` untuk kontribusi driver
- `sales_orders.customer_id` untuk menghitung titik kirim aktual driver

## Desain Tabel Database Revisi

### 1. `performance_target_periods`

Fungsi:

- header periode target bulanan

Kolom utama:

- `id`
- `period_month`
- `period_year`
- `period_key`
- `status`
- `notes`
- `created_by`
- `finalized_by`
- `finalized_at`
- `created_at`
- `updated_at`

Catatan:

- tabel ini tetap dipakai
- unique utama pada `period_key`

### 2. `sales_monthly_targets`

Fungsi:

- header target bulanan per sales

Kolom utama:

- `id`
- `period_id`
- `sales_user_id`
- `target_sales_amount`
- `target_sales_order_count`
- `notes`
- `is_active`
- `created_at`
- `updated_at`

Constraint:

- unique `(period_id, sales_user_id)`

### 3. `sales_visit_target_schedules`

Fungsi:

- detail jadwal kunjungan sales per wilayah dan per hari

Kolom utama:

- `id`
- `sales_target_id`
- `region_id`
- `day_of_week`
- `target_visit_count`
- `route_notes`
- `created_at`
- `updated_at`

Constraint:

- unique `(sales_target_id, region_id, day_of_week)`

### 4. `delivery_target_periods`

Fungsi:

- header planning pengantaran per periode

Kolom utama:

- `id`
- `period_id`
- `notes`
- `created_at`
- `updated_at`

Constraint:

- unique `(period_id)`

### 5. `delivery_target_schedules`

Fungsi:

- detail jadwal pengantaran operasional per wilayah dan per hari

Kolom utama:

- `id`
- `delivery_target_period_id`
- `region_id`
- `day_of_week`
- `target_delivery_count`
- `target_delivery_points`
- `route_notes`
- `created_at`
- `updated_at`

Constraint:

- unique `(delivery_target_period_id, region_id, day_of_week)`

### Tabel Lama Yang Tidak Lagi Cocok

Struktur berikut tidak lagi menjadi model final:

- `performance_target_assignments`
- `performance_target_schedules`

Alasannya:

- model lama memaksa target sales dan driver sama-sama berbasis assignment user
- kebutuhan final memisahkan planning sales dan planning pengantaran
- driver tidak di-assign dalam tahap planning

## Wireframe Revisi

### Lokasi Menu

- menu: `Transaksi`
- nama halaman: `Target Kinerja`

### Struktur Halaman Final

Halaman dibagi menjadi 5 blok utama:

1. header dan aksi periode
2. filter periode
3. ringkasan atas
4. section `Target Sales`
5. section `Jadwal Pengantaran`

### Header Halaman

Elemen:

- judul halaman
- subjudul
- badge status periode
- tombol aksi utama

Tombol aksi:

- `Buat Periode`
- `Generate Sales Aktif`
- `Salin Bulan Sebelumnya`
- `Simpan Draft`
- `Finalkan`

Wireframe:

```text
+--------------------------------------------------------------------------------------------------+
| Target Kinerja                                                                        [Draft]    |
| Atur target sales bulanan dan jadwal pengantaran operasional per wilayah                        |
|                                                                 [Generate Sales] [Salin] [Simpan] [Finalkan] |
+--------------------------------------------------------------------------------------------------+
```

### Filter Periode

Field:

- `Bulan`
- `Tahun`
- `Wilayah`
- `Cari Sales`

Wireframe:

```text
+--------------------------------------------------------------------------------------------------+
| Bulan [07]  Tahun [2026]  Wilayah [Semua Wilayah]  Cari Sales [__________________________]      |
+--------------------------------------------------------------------------------------------------+
```

### Ringkasan Atas

Kartu ringkasan:

- `Sales aktif`
- `Total target kunjungan`
- `Total target SO`
- `Total target penjualan`
- `Total target pengantaran`
- `Total target titik kirim`

Wireframe:

```text
+-------------+-------------------+----------------+----------------------+------------------+------------------+
| Sales aktif | Target kunjungan  | Target SO      | Target penjualan     | Target antar     | Target titik     |
+-------------+-------------------+----------------+----------------------+------------------+------------------+
| 12          | 480               | 320            | 1.250.000.000        | 210              | 185              |
+-------------+-------------------+----------------+----------------------+------------------+------------------+
```

### Section Target Sales

Tujuan:

- menampilkan seluruh sales aktif
- setiap sales memiliki target bulanan
- setiap sales memiliki beberapa detail jadwal kunjungan

Struktur UI:

- 1 kartu per sales
- di dalam kartu ada 2 area:
  - `Target Bulanan`
  - `Jadwal Kunjungan Wilayah`

Wireframe ringkas:

```text
+==================================================================================================+
| TARGET SALES                                                                                     |
+==================================================================================================+
| Sales: Saputra                                                                                   |
|--------------------------------------------------------------------------------------------------|
| Target Penjualan Bulanan [150.000.000]   Target SO Bulanan [30]   Catatan [Fokus retail]        |
|--------------------------------------------------------------------------------------------------|
| Jadwal Kunjungan Wilayah                                                                         |
| Wilayah        | Hari      | Target Kunjungan/Hari | Catatan Rute                                |
|----------------|-----------|-----------------------|---------------------------------------------|
| Gerung         | Senin     | 5                     | Area pusat                                  |
| Sekotong       | Selasa    | 5                     | Toko grosir                                 |
| Lembar         | Kamis     | 4                     | Jalur pesisir                               |
|                                              [+ Tambah Jadwal]                                   |
+--------------------------------------------------------------------------------------------------+
| Sales: Andi                                                                                      |
| ...                                                                                              |
+==================================================================================================+
```

### Section Jadwal Pengantaran

Tujuan:

- menyusun rencana pengantaran operasional bulanan
- tidak menempel ke driver tertentu

Kolom:

- `Wilayah`
- `Hari`
- `Target Pengantaran`
- `Target Titik Kirim`
- `Catatan Rute`

Wireframe:

```text
+==================================================================================================+
| JADWAL PENGANTARAN                                                                               |
+==================================================================================================+
| Wilayah        | Hari      | Target Pengantaran | Target Titik Kirim | Catatan Rute              |
|----------------|-----------|--------------------|---------------------|---------------------------|
| Gerung         | Senin     | 12                 | 10                  | Rute pagi                 |
| Sekotong       | Selasa    | 8                  | 7                   | Prioritas toko grosir     |
| Lembar         | Kamis     | 9                  | 8                   | Jalur pesisir             |
|                                                     [+ Tambah Jadwal Pengantaran]                |
+==================================================================================================+
```

### Wireframe Laporan Sales

Tujuan:

- menampilkan target vs realisasi sales bulanan
- bisa dilihat per sales
- bisa menampilkan breakdown jadwal kunjungan

Wireframe:

```text
+==================================================================================================+
| LAPORAN KINERJA SALES                                                                            |
+==================================================================================================+
| Bulan [07] Tahun [2026] Wilayah [Semua] [Filter]                                                 |
|--------------------------------------------------------------------------------------------------|
| Sales     | Target Visit | Realisasi | % | Target SO | Realisasi | % | Target Jual | Realisasi | % |
|-----------|--------------|-----------|---|-----------|-----------|---|-------------|-----------|---|
| Saputra   | 40           | 34        |85 | 30        | 24        |80 | 150 jt      | 120 jt    |80 |
| Andi      | 32           | 29        |91 | 24        | 21        |88 | 120 jt      | 111 jt    |92 |
+--------------------------------------------------------------------------------------------------+
| Detail Jadwal Saputra                                                                            |
| Gerung - Senin - Target 20 - Realisasi 18 - 90%                                                  |
| Sekotong - Selasa - Target 20 - Realisasi 16 - 80%                                               |
+==================================================================================================+
```

### Wireframe Laporan Driver

Tujuan:

- menampilkan kontribusi driver aktual dalam bulan berjalan
- menampilkan ringkasan pemenuhan rencana pengantaran operasional

Wireframe:

```text
+==================================================================================================+
| LAPORAN KINERJA DRIVER                                                                           |
+==================================================================================================+
| Bulan [07] Tahun [2026] Wilayah [Semua] [Filter]                                                 |
|--------------------------------------------------------------------------------------------------|
| Ringkasan Operasional: Target Antar 210 | Realisasi 188 | Capaian 89,52%                         |
|--------------------------------------------------------------------------------------------------|
| Driver    | DO Ditangani | Titik Kirim | Kontribusi DO | Kontribusi Titik                        |
|-----------|--------------|-------------|---------------|------------------------------------------|
| Budi      | 42           | 35          | 22,34%        | 21,88%                                   |
| Hendra    | 38           | 33          | 20,21%        | 20,63%                                   |
+==================================================================================================+
```

## Desain Payload API Revisi

### 1. List Target Periods

Endpoint:

- `GET /api/v1/performance-targets`

Query:

- `month`
- `year`
- `status`
- `page`
- `pageSize`

Contoh response:

```json
{
  "data": [
    {
      "id": "period-1",
      "month": 7,
      "year": 2026,
      "periodKey": "2026-07",
      "status": "DRAFT",
      "notes": "Target Juli 2026",
      "salesCount": 12,
      "totalVisitTarget": 480,
      "totalSalesTarget": "1250000000",
      "totalSalesOrderTarget": 320,
      "totalDeliveryTarget": 210,
      "totalDeliveryPointTarget": 185,
      "createdAt": "2026-07-01T09:00:00.000Z",
      "updatedAt": "2026-07-01T10:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1
  }
}
```

### 2. Get Target Period Detail

Endpoint:

- `GET /api/v1/performance-targets/:periodId`

Contoh response:

```json
{
  "data": {
    "id": "period-1",
    "month": 7,
    "year": 2026,
    "periodKey": "2026-07",
    "status": "DRAFT",
    "notes": "Target Juli 2026",
    "salesTargets": [
      {
        "id": "sales-target-1",
        "salesUserId": "user-sales-1",
        "salesName": "Saputra",
        "targetSalesAmount": "150000000",
        "targetSalesOrderCount": 30,
        "notes": "Fokus retail",
        "visitSchedules": [
          {
            "id": "visit-sch-1",
            "regionId": "region-1",
            "regionName": "Gerung",
            "dayOfWeek": "MONDAY",
            "targetVisitCount": 5,
            "routeNotes": "Area pusat"
          },
          {
            "id": "visit-sch-2",
            "regionId": "region-2",
            "regionName": "Sekotong",
            "dayOfWeek": "TUESDAY",
            "targetVisitCount": 5,
            "routeNotes": "Toko grosir"
          }
        ]
      }
    ],
    "deliverySchedules": [
      {
        "id": "del-sch-1",
        "regionId": "region-1",
        "regionName": "Gerung",
        "dayOfWeek": "MONDAY",
        "targetDeliveryCount": 12,
        "targetDeliveryPoints": 10,
        "routeNotes": "Rute pagi"
      }
    ]
  }
}
```

### 3. Create Target Period

Endpoint:

- `POST /api/v1/performance-targets`

Request:

```json
{
  "month": 7,
  "year": 2026,
  "notes": "Target Juli 2026"
}
```

### 4. Generate Sales Aktif

Endpoint:

- `POST /api/v1/performance-targets/:periodId/generate-sales`

Request:

```json
{
  "overwriteExisting": false
}
```

Response:

```json
{
  "data": {
    "generated": 12,
    "skippedExisting": 3
  }
}
```

### 5. Update Target Bulanan Sales

Endpoint:

- `PUT /api/v1/performance-targets/:periodId/sales-targets/:salesTargetId`

Request:

```json
{
  "targetSalesAmount": 150000000,
  "targetSalesOrderCount": 30,
  "notes": "Fokus retail"
}
```

### 6. Replace Jadwal Kunjungan Sales

Endpoint:

- `PUT /api/v1/performance-targets/:periodId/sales-targets/:salesTargetId/visit-schedules`

Request:

```json
{
  "schedules": [
    {
      "regionId": "region-1",
      "dayOfWeek": "MONDAY",
      "targetVisitCount": 5,
      "routeNotes": "Area pusat"
    },
    {
      "regionId": "region-2",
      "dayOfWeek": "TUESDAY",
      "targetVisitCount": 5,
      "routeNotes": "Toko grosir"
    }
  ]
}
```

### 7. Replace Jadwal Pengantaran

Endpoint:

- `PUT /api/v1/performance-targets/:periodId/delivery-schedules`

Request:

```json
{
  "schedules": [
    {
      "regionId": "region-1",
      "dayOfWeek": "MONDAY",
      "targetDeliveryCount": 12,
      "targetDeliveryPoints": 10,
      "routeNotes": "Rute pagi"
    },
    {
      "regionId": "region-2",
      "dayOfWeek": "TUESDAY",
      "targetDeliveryCount": 8,
      "targetDeliveryPoints": 7,
      "routeNotes": "Prioritas grosir"
    }
  ]
}
```

### 8. Copy From Previous Period

Endpoint:

- `POST /api/v1/performance-targets/:periodId/copy-from-previous`

Request:

```json
{
  "sourcePeriodKey": "2026-06",
  "copySalesTargets": true,
  "copyVisitSchedules": true,
  "copyDeliverySchedules": true,
  "overwriteExisting": false
}
```

### 9. Finalize Target Period

Endpoint:

- `POST /api/v1/performance-targets/:periodId/finalize`

Request:

```json
{
  "notes": "Sudah disetujui manager"
}
```

### 10. Sales Performance Report

Endpoint:

- `GET /api/v1/reports/sales-performance-target`

Query:

- `month`
- `year`
- `regionId`
- `salesUserId`

Contoh response:

```json
{
  "data": [
    {
      "salesUserId": "user-sales-1",
      "salesName": "Saputra",
      "targetVisitCount": 40,
      "actualVisitCount": 34,
      "visitAchievementPct": 85,
      "targetSalesOrderCount": 30,
      "actualSalesOrderCount": 24,
      "salesOrderAchievementPct": 80,
      "targetSalesAmount": "150000000",
      "actualSalesAmount": "120000000",
      "salesAchievementPct": 80,
      "scheduleBreakdown": [
        {
          "regionId": "region-1",
          "regionName": "Gerung",
          "dayOfWeek": "MONDAY",
          "targetVisitCount": 20,
          "actualVisitCount": 18,
          "achievementPct": 90
        }
      ]
    }
  ]
}
```

### 11. Driver Performance Report

Endpoint:

- `GET /api/v1/reports/driver-performance-target`

Query:

- `month`
- `year`
- `regionId`
- `driverUserId`

Contoh response:

```json
{
  "data": [
    {
      "driverUserId": "user-driver-1",
      "driverName": "Budi",
      "actualDeliveryCount": 42,
      "actualDeliveryPoints": 35,
      "deliveryContributionPct": 22.34,
      "pointContributionPct": 21.88
    }
  ],
  "meta": {
    "plannedDeliveryCount": 210,
    "plannedDeliveryPoints": 185,
    "actualDeliveryCount": 188,
    "actualDeliveryPoints": 160,
    "plannedAchievementPct": 89.52
  }
}
```

## Patch Plan Teknis Per File

## Backend

### `migrations/034_performance_targets.sql`

Status:

- migration yang ada sudah dibuat berdasarkan model lama

Revisi final yang disarankan:

- pertahankan `performance_target_periods`
- jangan lanjut pakai:
  - `performance_target_assignments`
  - `performance_target_schedules`
- gunakan struktur final:
  - `sales_monthly_targets`
  - `sales_visit_target_schedules`
  - `delivery_target_periods`
  - `delivery_target_schedules`

Jika belum commit dan belum live:

- revisi migration lokal agar sinkron dengan model final

Jika ingin jejak perubahan lebih eksplisit:

- buat migration baru lanjutan untuk refactor schema

### `api/services/performanceTargetService.ts`

Revisi service:

- pertahankan:
  - `listTargetPeriods()`
  - `createTargetPeriod()`
  - `finalizeTargetPeriod()`
- ubah:
  - `getTargetPeriodDetail()` agar return:
    - `salesTargets`
    - `deliverySchedules`
- ganti:
  - `generateAssignmentsFromActiveUsers()`
  - menjadi `generateSalesTargetsFromActiveUsers()`
- pecah:
  - `updateTargetAssignment()`
  - menjadi:
    - `updateSalesMonthlyTarget()`
    - `replaceSalesVisitSchedules()`
    - `replaceDeliverySchedules()`
- ganti:
  - `copyAssignmentsFromPreviousPeriod()`
  - menjadi `copyTargetsFromPreviousPeriod()`
- revisi:
  - `getSalesPerformanceTargetReport()`
  - `getDriverPerformanceTargetReport()`

### `api/routes/v1/performance-targets.ts`

Revisi route final:

- `GET /`
- `POST /`
- `GET /:periodId`
- `POST /:periodId/generate-sales`
- `PUT /:periodId/sales-targets/:salesTargetId`
- `PUT /:periodId/sales-targets/:salesTargetId/visit-schedules`
- `PUT /:periodId/delivery-schedules`
- `POST /:periodId/copy-from-previous`
- `POST /:periodId/finalize`

### `api/routes/v1/reports.ts`

Pertahankan endpoint:

- `GET /sales-performance-target`
- `GET /driver-performance-target`

Tetapi revisi isi logic report:

- report sales membandingkan target bulanan dan breakdown jadwal kunjungan
- report driver menampilkan kontribusi driver aktual dan ringkasan pemenuhan operasional

### `api/routes/v1/index.ts`

Pastikan route tetap terdaftar:

- `performance-targets`

### `api/scripts/seed.ts`

Permission yang tetap dipakai:

- `performance_targets:read`
- `performance_targets:write`
- `performance_targets:finalize`

Tidak perlu permission master baru selama scope tetap satu modul.

## Frontend ERP Web

### `src/App.tsx`

Route yang diperlukan:

- `PerformanceTargets`
- `SalesPerformance`
- `DriverPerformance`

### `src/app/AppLayout.tsx`

Menu final:

- `Target Kinerja` di grup `Transaksi`
- `Kinerja Sales` di grup `Laporan`
- `Kinerja Driver` di grup `Laporan`

### `src/pages/PerformanceTargets.tsx`

Ini menjadi halaman utama modul target final.

Struktur final:

- filter periode
- kartu ringkasan
- section `Target Sales`
- section `Jadwal Pengantaran`
- tombol simpan draft dan finalkan

Konsep yang harus dihapus dari versi lama:

- assignment type sales vs driver dalam satu tabel yang sama
- target driver per user
- toggle hari sederhana tanpa detail wilayah

State utama yang disarankan:

- `period`
- `salesTargets[]`
- `deliverySchedules[]`
- `regions[]`
- `searchSales`
- `selectedRegionId`

### `src/pages/SalesPerformance.tsx`

Revisi final:

- filter `bulan`, `tahun`, `wilayah`
- tabel target vs realisasi sales
- tambahkan breakdown jadwal kunjungan per sales

Kolom utama:

- nama sales
- target kunjungan
- realisasi kunjungan
- persen capaian kunjungan
- target SO
- realisasi SO
- persen capaian SO
- target penjualan
- realisasi penjualan
- persen capaian penjualan

### `src/pages/DriverPerformance.tsx`

Revisi final:

- fokus pada kontribusi driver aktual
- tampilkan ringkasan pemenuhan operasional pengantaran

Kolom utama:

- nama driver
- DO ditangani
- titik kirim ditangani
- kontribusi DO
- kontribusi titik kirim

### `src/lib/numberFormat.ts`

Pastikan format konsisten untuk:

- target penjualan
- realisasi penjualan
- target pengantaran
- target titik kirim
- persentase capaian

## Komponen Frontend Yang Disarankan

### `src/components/PerformanceTargetHeader.tsx`

Berisi:

- filter periode
- status periode
- tombol aksi

### `src/components/SalesTargetCard.tsx`

Berisi:

- identitas sales
- input target bulanan
- tabel jadwal kunjungan sales

### `src/components/SalesVisitScheduleTable.tsx`

Berisi:

- tabel baris wilayah + hari + target kunjungan

### `src/components/DeliveryScheduleTable.tsx`

Berisi:

- tabel jadwal pengantaran wilayah

### `src/components/KpiSummaryCards.tsx`

Berisi:

- kartu ringkasan target periode

## State dan Flow Frontend

Urutan flow final:

1. load periode bulan berjalan
2. jika periode belum ada, tampilkan tombol buat periode
3. jika periode sudah ada, load detail `salesTargets` dan `deliverySchedules`
4. manager generate sales aktif
5. manager isi target bulanan tiap sales
6. manager isi detail jadwal kunjungan per wilayah dan hari
7. manager isi jadwal pengantaran wilayah
8. simpan draft
9. finalkan target

## Validasi Frontend

- target penjualan tidak boleh negatif
- target SO tidak boleh negatif
- target kunjungan per hari tidak boleh negatif
- target pengantaran tidak boleh negatif
- target titik kirim tidak boleh negatif
- jadwal kunjungan sales tidak boleh duplikat untuk kombinasi:
  - sales
  - wilayah
  - hari
- jadwal pengantaran tidak boleh duplikat untuk kombinasi:
  - wilayah
  - hari
- periode final tidak boleh diubah
- finalisasi harus melewati konfirmasi

## Urutan Implementasi Yang Disarankan

### Tahap 1

- revisi schema target
- revisi service backend target
- revisi route backend target
- revisi halaman `PerformanceTargets`

### Tahap 2

- revisi report sales performance
- revisi report driver performance
- finalisasi periode
- copy dari bulan sebelumnya

### Tahap 3

- breakdown laporan yang lebih detail
- export Excel lanjutan
- dashboard KPI yang lebih visual

## Kesimpulan

Dokumen revisi final ini menetapkan bahwa:

- `sales` memiliki target bulanan per orang
- `sales` dapat memiliki banyak jadwal kunjungan per wilayah dan per hari
- `driver` tidak di-assign saat planning
- `pengantaran` direncanakan sebagai kebutuhan operasional wilayah per hari
- `kinerja driver` dihitung dari realisasi aktual, bukan dari target personal yang diinput manager

Dokumen ini menjadi acuan teknis final sebelum eksekusi refactor implementasi modul target.
