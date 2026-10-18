# RMS — Restaurant Management System

A real-time, multi-franchise restaurant platform: POS, table floor plan, kitchen display, cash shifts and analytics. Each franchise owner's data is isolated at the database level.

**Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) first**: system design, tenancy model, RBAC, real-time flow.

## Stack
Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · Radix UI · Lucide · Zustand · Prisma 6 · PostgreSQL (Row-Level Security) · Socket.io · jose (JWT)

## Quick start (laptop = backend + database)

Prerequisites: **Node.js 20+**, **Git**, and **PostgreSQL 16**. The easiest way to get Postgres is
[Docker Desktop](https://www.docker.com/products/docker-desktop/), then `docker compose up -d`.
Without Docker, install it from postgresql.org with user `postgres` / password `postgres`, and create a database named `rms`.

```bash
git clone https://github.com/sugamacharya890-rgb/pos.git
cd pos
git checkout claude/determined-lamport-6m0jek
cp .env.example .env              # Windows: copy .env.example .env  (then set JWT_SECRET)
npm install
docker compose up -d              # skip if you installed Postgres yourself
npm run setup                     # tables + isolation policies + demo data
npm run lan                       # production build, served to the whole Wi-Fi
```

The terminal prints the addresses:

```
> RMS ready (production)
  This laptop:   http://localhost:3000
  Other devices: http://192.168.1.42:3000   ← open this on the phone/tablet
```

### Using phones & tablets on the same Wi-Fi
1. Connect the phone or tablet to the **same Wi-Fi** as the laptop. Guest networks often block device-to-device traffic.
2. Open the `Other devices:` link in the phone's browser and log in with a demo account below.
3. If the page doesn't load, the laptop's firewall is blocking it:
   - **Windows:** allow "Node.js" on **Private** networks when prompted, or go to Windows Security, Firewall, Allow an app. Also set the Wi-Fi to *Private* (Settings, Network, your Wi-Fi, Network profile type).
   - **macOS:** System Settings, Network, Firewall, then allow incoming connections for `node`.
4. Optional: on iPad/Android choose *Add to Home Screen* for a full-screen, app-like POS or KDS.

The laptop's IP can change when the router restarts. Reserve it in the router (DHCP reservation) for a stable link.

`npm run lan` is fast and is what you want on tablets. While editing code, use `npm run dev` instead (hot reload, also reachable over the LAN; slower on first load).
Everything runs over plain `http://` inside your network, which is fine for a local setup. Put HTTPS in front before exposing the app to the internet.

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
| `npm run setup` | first-time database: migrate, RLS policies, demo data |
| `npm run lan` | build + start in production mode on all network interfaces |
| `npm run dev` / `build` / `start` | custom server (`server.ts`) = Next.js + Socket.io at `/rt` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` / `db:rls` / `db:seed` | schema, isolation policies, demo data |
