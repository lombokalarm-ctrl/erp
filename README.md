# ERP Distributor F&B (Web)

Monorepo sederhana (single package.json) berisi:
- Frontend: React + Vite + Tailwind
- Backend API: Express (TypeScript, ESM)
- Database: PostgreSQL (via `DATABASE_URL`)

## 1) Setup Env
1. Copy file env:
   - `.env.example` → `.env`
2. Isi `DATABASE_URL` dan `JWT_ACCESS_SECRET`.

Contoh:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/erp_distributor
JWT_ACCESS_SECRET=change-me
APP_ORIGIN=http://localhost:5173
```

## 2) Database
Jalankan migrasi dan seed:
```bash
npm run db:migrate
npm run db:seed
```

Catatan:
- Membutuhkan PostgreSQL (ekstensi `pgcrypto` dipakai untuk UUID).

Seed default:
- email: `admin@local.test`
- password: `admin123`

## 3) Dev Server
Menjalankan frontend + backend sekaligus:
```bash
npm run dev
```

Frontend:
- http://localhost:5173

Backend:
- http://localhost:3001/api/v1/health

## 4) Dokumen
- PRD: [.trae/documents/PRD-ERP-Distributor-FnB.md](file:///workspace/.trae/documents/PRD-ERP-Distributor-FnB.md)
- Arsitektur: [.trae/documents/Arsitektur-Teknis-ERP-Distributor-FnB.md](file:///workspace/.trae/documents/Arsitektur-Teknis-ERP-Distributor-FnB.md)
- Coding conventions: [CODING_CONVENTIONS.md](file:///workspace/CODING_CONVENTIONS.md)
