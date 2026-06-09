# Target Kunjungan, Penjualan, dan Pengantaran

## Tujuan

Dokumen ini menjadi acuan pengembangan modul penetapan target bulanan untuk `Sales` dan `Driver`.

Modul ini ditujukan untuk:

- menetapkan target kunjungan bulanan sales
- menetapkan target penjualan bulanan sales
- menetapkan target pengantaran bulanan driver
- mengatur wilayah kerja dan jadwal operasional
- menjadi baseline untuk laporan kinerja bulanan

Modul direncanakan berada di menu `Transaksi` dan digunakan oleh `Manager` atau role lain yang diberi otorisasi setara.

## Ringkasan Konsep

Manager menetapkan target bulanan untuk personel aktif berdasarkan periode dan wilayah.

Data target kemudian dipakai sebagai pembanding terhadap realisasi operasional, sehingga sistem bisa menghitung:

- berapa kali kunjungan dilakukan dalam satu bulan
- berapa target penjualan yang tercapai
- berapa pengantaran yang berhasil dilakukan
- berapa persen pencapaian dibanding target

Modul ini bukan halaman input transaksi harian, tetapi halaman perencanaan dan penetapan target resmi.

## Ruang Lingkup

Ruang lingkup tahap awal:

- input target kunjungan sales
- input target penjualan sales
- input target pengantaran driver
- penetapan wilayah kerja
- penetapan jadwal kunjungan
- penetapan jadwal pengantaran per wilayah
- konsumsi data target oleh laporan kinerja sales dan driver

## Struktur Halaman

### Lokasi Menu

- menu utama: `Transaksi`
- nama halaman yang disarankan: `Target Kunjungan & Penjualan`

### Akses

- `Manager`
- `Admin`
- role khusus lain jika nanti diberikan permission spesifik

### Struktur UI Utama

Halaman dibagi menjadi beberapa blok:

1. Filter periode
2. Ringkasan target
3. Tab atau section target sales
4. Tab atau section target driver
5. Blok jadwal per wilayah
6. Ringkasan KPI

### Header / Filter Periode

Field yang muncul di bagian atas:

- bulan
- tahun
- wilayah
- status target

Status target yang disarankan:

- `DRAFT`
- `ACTIVE`
- `FINAL`

### Tombol Aksi Utama

- `Muat personel aktif`
- `Tambah target`
- `Simpan draft`
- `Finalkan target`
- `Salin dari bulan sebelumnya`
- `Export`
- `Reset draft bulan ini` opsional

### Struktur Tampilan Target Sales

Bagian ini memuat semua sales aktif untuk periode yang dipilih.

Setiap baris mewakili penugasan target seorang sales pada satu wilayah atau lebih, tergantung aturan yang diterapkan nanti.

Informasi utama:

- nama sales
- wilayah
- target kunjungan
- target penjualan
- jadwal kunjungan
- catatan

### Struktur Tampilan Target Driver

Bagian ini memuat semua driver aktif untuk periode yang dipilih.

Informasi utama:

- nama driver
- wilayah
- target pengantaran
- jadwal pengantaran
- catatan

### Struktur Tampilan Jadwal

Bagian jadwal digunakan untuk melihat pembagian hari operasional per wilayah dan per personel.

Format dapat berupa:

- grid mingguan
- daftar per hari
- kalender sederhana

## Field Yang Harus Ada

### Header Target Bulanan

Field utama:

- `bulan`
- `tahun`
- `period_key` misalnya `2026-06`
- `status`
- `notes`
- `created_by`
- `finalized_by`
- `finalized_at`
- `created_at`
- `updated_at`

### Field Target Sales

- `sales_user_id`
- `sales_name`
- `region_id`
- `region_name`
- `target_visit_count`
- `target_customer_coverage` opsional
- `target_sales_amount`
- `target_sales_order_count` opsional
- `visit_schedule_summary`
- `visit_days`
- `visit_frequency`
- `notes`
- `is_active_for_period`

### Field Target Driver

- `driver_user_id`
- `driver_name`
- `region_id`
- `region_name`
- `target_delivery_count`
- `target_delivery_points` opsional
- `delivery_schedule_summary`
- `delivery_days`
- `delivery_frequency`
- `notes`
- `is_active_for_period`

### Field Jadwal

- `schedule_type`
- `day_of_week`
- `week_of_month` opsional
- `start_time` opsional
- `end_time` opsional
- `route_notes` opsional
- `region_id`
- `user_id`

### Field Yang Ditampilkan Di Grid

- nama personel
- role
- wilayah
- hari kerja target
- target kunjungan
- target penjualan
- target pengantaran
- status target
- catatan
- aksi

## Perilaku Fungsional

1. Manager memilih bulan dan tahun.
2. Sistem memeriksa apakah target untuk periode tersebut sudah ada.
3. Jika belum ada, manager dapat memuat seluruh sales aktif dan driver aktif.
4. Manager mengisi target per personel.
5. Manager mengatur wilayah dan jadwal operasional.
6. Manager menyimpan data sebagai draft.
7. Setelah review selesai, manager memfinalkan target.
8. Laporan kinerja menggunakan target final sebagai baseline.

## Aturan Bisnis

- target penjualan hanya berlaku untuk `Sales`
- target pengantaran hanya berlaku untuk `Driver`
- satu personel dapat memiliki lebih dari satu wilayah dalam satu bulan jika kebijakan bisnis membolehkan
- satu personel dapat memiliki beberapa jadwal dalam satu bulan
- target berstatus `FINAL` menjadi sumber resmi laporan
- jika belum ada target final, laporan harus memberi penanda bahwa target belum ditetapkan

## Logika Perhitungan KPI

### KPI Sales

Komponen KPI sales:

- realisasi kunjungan
- realisasi penjualan nominal
- realisasi jumlah order
- customer coverage opsional

Rumus:

- `Persentase kunjungan = (realisasi_kunjungan / target_kunjungan) x 100`
- `Persentase penjualan = (realisasi_penjualan / target_penjualan) x 100`
- `Persentase order = (realisasi_order / target_order) x 100`
- `Persentase customer coverage = (customer_unik_realisasi / target_customer_unik) x 100`

### KPI Driver

Komponen KPI driver:

- realisasi pengantaran
- realisasi titik kirim
- kepatuhan jadwal opsional

Rumus:

- `Persentase pengantaran = (realisasi_pengantaran / target_pengantaran) x 100`
- `Persentase titik kirim = (realisasi_titik / target_titik_kirim) x 100`
- `Kepatuhan jadwal = (pengantaran_sesuai_jadwal / total_pengantaran) x 100`

### Aturan Validasi KPI

- jika target bernilai `0`, hindari pembagian nol
- jika target `0` dan realisasi `0`, tampilkan `-`
- jika target `0` dan realisasi lebih dari `0`, tampilkan `di luar target` atau format serupa
- KPI dapat dihitung per personel, per wilayah, per role, dan per bulan

## Sumber Data Realisasi

### Realisasi Kunjungan

Diambil dari data visit yang valid pada periode berjalan.

Definisi visit valid minimal:

- memiliki pelanggan
- memiliki timestamp
- status kunjungan valid
- opsional: memiliki foto dan geotag

### Realisasi Penjualan

Harus ditentukan satu basis resmi, misalnya:

- `Sales Order confirmed`
- atau `Invoice`

Keputusan ini harus konsisten agar angka KPI stabil.

### Realisasi Pengantaran

Diambil dari transaksi pengantaran yang berstatus selesai, misalnya:

- `DELIVERED`

## Desain Tabel Database

Desain database disarankan dipisah menjadi header periode, detail target per personel, dan jadwal.

### 1. `performance_target_periods`

Fungsi:

- menyimpan header target bulanan

Field:

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

Constraint:

- unique pada `period_key`

### 2. `performance_target_assignments`

Fungsi:

- menyimpan target per personel, per wilayah, per periode

Field:

- `id`
- `period_id`
- `user_id`
- `assignment_type` dengan nilai `SALES` atau `DRIVER`
- `region_id`
- `target_visit_count`
- `target_sales_amount`
- `target_sales_order_count`
- `target_delivery_count`
- `target_customer_coverage`
- `target_delivery_points`
- `notes`
- `is_active`
- `created_at`
- `updated_at`

Constraint yang disarankan:

- unique per kombinasi `period_id`, `user_id`, `region_id`, `assignment_type`

### 3. `performance_target_schedules`

Fungsi:

- menyimpan jadwal kunjungan atau pengantaran untuk setiap assignment

Field:

- `id`
- `assignment_id`
- `schedule_type` dengan nilai `VISIT` atau `DELIVERY`
- `day_of_week`
- `week_of_month` opsional
- `start_time` opsional
- `end_time` opsional
- `route_notes`
- `created_at`
- `updated_at`

### 4. `performance_target_revisions` (opsional tapi disarankan)

Fungsi:

- audit trail perubahan target

Field:

- `id`
- `period_id`
- `assignment_id`
- `action`
- `before_payload`
- `after_payload`
- `changed_by`
- `changed_at`

Action yang mungkin:

- `CREATE`
- `UPDATE`
- `FINALIZE`
- `REOPEN`

### 5. View Laporan Target vs Realisasi

Tidak harus berupa tabel fisik pada tahap awal. Bisa berupa query report atau view.

Contoh nama:

- `vw_performance_target_vs_actual`

Kolom yang diharapkan:

- `period_key`
- `user_id`
- `role`
- `region_id`
- `target_visit_count`
- `actual_visit_count`
- `visit_achievement_pct`
- `target_sales_amount`
- `actual_sales_amount`
- `sales_achievement_pct`
- `target_delivery_count`
- `actual_delivery_count`
- `delivery_achievement_pct`

## Relasi Antar Tabel

- `performance_target_periods.id` ke `performance_target_assignments.period_id`
- `performance_target_assignments.id` ke `performance_target_schedules.assignment_id`
- `performance_target_assignments.user_id` ke `users.id`
- `performance_target_assignments.region_id` ke `regions.id`

## Hak Akses

### Manager / Admin

- membuat target
- mengedit draft
- memfinalkan target
- melihat semua data target

### Sales

- opsional: melihat target miliknya sendiri

### Driver

- opsional: melihat target miliknya sendiri

### Supervisor

- opsional: melihat rekap dan performa tim

## Validasi Input

- tidak boleh ada target duplikat untuk personel, wilayah, role, dan bulan yang sama
- target numerik tidak boleh negatif
- target penjualan hanya diisi untuk `Sales`
- target pengantaran hanya diisi untuk `Driver`
- jadwal harus terkait ke assignment yang valid
- saat finalisasi, sistem memeriksa kelengkapan field minimum

## Fitur Tambahan Yang Disarankan

- salin target dari bulan sebelumnya
- generate otomatis dari personel aktif
- bulk edit target
- import Excel target
- freeze setelah final
- revision log

## Tahapan Implementasi Yang Disarankan

### Tahap 1

- halaman target bulanan
- target sales dan driver
- wilayah
- jadwal sederhana
- laporan target vs realisasi dasar

### Tahap 2

- salin dari bulan sebelumnya
- bulk update
- filter wilayah lebih lengkap
- audit revision

### Tahap 3

- import Excel
- dashboard visual KPI
- alert pencapaian di bawah target

## Kesimpulan

Modul ini adalah fondasi perencanaan target operasional bulanan untuk `Sales` dan `Driver`.

Struktur yang paling aman untuk dikembangkan:

- header periode
- detail assignment per personel
- jadwal per assignment

Dengan pendekatan ini, laporan kinerja nanti dapat menampilkan:

- target vs realisasi
- pencapaian per bulan
- pencapaian per wilayah
- pencapaian per personel

Dokumen ini dipakai sebagai acuan awal sebelum masuk ke tahap desain API, wireframe, dan implementasi teknis.
