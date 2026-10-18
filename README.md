# RMS — Restaurant Management System

A real-time, multi-franchise restaurant platform: POS, table floor plan, kitchen display, cash shifts and analytics. Each franchise owner's data is isolated at the database level.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first**: system design, tenancy model, RBAC, real-time flow.

## Stack
Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · Radix UI · Lucide · Zustand · Prisma 6 · PostgreSQL (Row-Level Security) · Socket.io · jose (JWT)

## Quick start

```bash
cp .env.example .env              # set JWT_SECRET; DB URLs point at local Postgres
npm install
npm run db:migrate                # create tables (owner role)
npm run db:rls                    # create rms_app role + tenant isolation policies
npm run db:seed                   # demo: 2 franchise owners, 3 outlets, 30 days of sales
npm run dev                       # http://localhost:3000 (Next + Socket.io on one port)
```

Run `npm run db:rls` again after every migration that adds tables.

### Demo logins (password `password123`)

| Franchise | Email | Role | Sees |
|---|---|---|---|
| Everest Foods | `owner@everest.test` | Owner | Portfolio of Thamel + Patan, every module |
| | `manager@everest.test` | Manager | Both outlets, every module |
| | `cashier@everest.test` | Cashier | Thamel: Checkout, Shift |
| | `waiter@everest.test` | Waiter | Thamel: Tables, Orders |
| | `kitchen@everest.test` / `bar@everest.test` | Kitchen / Bar | Thamel KDS, own station only |
| Annapurna Hospitality | `owner@annapurna.test` (+ same roles) | Owner | Lakeside only, and gets a 404 on anything Everest |

Try it: open the waiter, kitchen and cashier logins in three windows. Take an order on a table and it shows up on the KDS instantly. Bump it, then settle it at the POS with a split bill. The table turns purple ("needs cleaning") on every floor screen, and the owner's analytics update.

## Scripts
| | |
|---|---|
| `npm run dev` / `build` / `start` | custom server (`server.ts`) = Next.js + Socket.io at `/rt` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` / `db:rls` / `db:seed` | schema, isolation policies, demo data |
