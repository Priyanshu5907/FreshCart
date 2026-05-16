# FreshCart — Online Grocery Platform

A production-ready, full-stack online grocery shopping platform similar to BigBasket. Customers can browse, search, and purchase groceries online with real-time inventory management, order tracking, and delivery coordination.

## Features

- 🛒 **Customer:** Registration (email/phone/OAuth), product search, cart, checkout, order tracking
- 👨‍💼 **Admin:** Dashboard analytics, product/category/order/coupon management
- 🚚 **Delivery Partner:** Assigned orders, GPS location updates, status management
- ⚡ **Real-Time:** Live stock updates, order tracking, cart conflict warnings via Socket.io
- 🔔 **Notifications:** Push (FCM/Web Push), email, SMS
- 🤖 **AI Recommendations:** Item-based collaborative filtering
- 💳 **Payments:** Razorpay (UPI/card) + COD
- 🌙 **Dark Mode** + 🌐 **Multi-Language** (EN/HI)
- 📱 **PWA** — installable, offline-capable

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| State | Zustand |
| Backend | Node.js + Express.js, TypeScript |
| Database | PostgreSQL 15 + Prisma ORM |
| Cache | Redis 7 (ioredis) |
| Auth | JWT + Passport.js (Google/Facebook OAuth) |
| Payments | Razorpay |
| Real-Time | Socket.io + Redis Adapter |
| Storage | AWS S3 + CloudFront CDN |
| Search | PostgreSQL pg_trgm |
| Push | Firebase Cloud Messaging + Web Push API |
| CI/CD | GitHub Actions |
| Deployment | Vercel (frontend) + AWS ECS (backend) |

## Project Structure

```
online-grocery-platform/
├── frontend/          # Next.js 14 App Router PWA
│   ├── src/
│   │   ├── app/       # Pages (App Router)
│   │   ├── components/
│   │   ├── lib/       # API client, Socket.io
│   │   └── store/     # Zustand stores
│   └── e2e/           # Playwright tests
├── backend/           # Node.js + Express API
│   ├── src/
│   │   ├── routes/    # API route handlers
│   │   ├── services/  # Business logic
│   │   ├── middleware/ # Auth, RBAC, rate limiting
│   │   ├── lib/       # Prisma, Redis, Socket.io, JWT
│   │   └── __tests__/ # Unit + integration tests
│   └── prisma/        # Schema, migrations, seed
├── docs/              # Documentation
├── infrastructure/    # Nginx config
├── .github/workflows/ # CI/CD pipelines
├── docker-compose.yml # Local development
└── package.json       # Monorepo root
```

## Quick Start

```bash
# Prerequisites: Node.js >= 18, Docker

# 1. Start database and cache
docker-compose up postgres redis -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
# Edit both files with your values

# 4. Run migrations and seed
cd backend
npx prisma migrate dev --name init
npm run db:seed
cd ..

# 5. Start development
npm run dev
```

Open http://localhost:3000

**Seed accounts:** `admin@freshcart.com` / `alice@example.com` / `delivery@freshcart.com` — all with password `Password123!`

## Documentation

| Document | Description |
|----------|-------------|
| [Setup Guide](docs/setup.md) | Local development setup |
| [Deployment Guide](docs/deployment.md) | AWS + Vercel deployment |
| [API Reference](docs/openapi.yaml) | OpenAPI 3.0 specification |
| [Database Schema](docs/database-schema.md) | ER diagram and table docs |
| [Demo Script](docs/demo-script.md) | Walkthrough of all major flows |
| [CHANGELOG](CHANGELOG.md) | Release history |

## Testing

```bash
# Unit tests (backend)
npm run test --workspace=backend

# With coverage (must be >= 80%)
npm run test --workspace=backend -- --coverage

# E2E tests (frontend)
cd frontend && npx playwright test
```

## Architecture Highlights

- **Monorepo** with npm workspaces
- **Modular monolith** backend — services can be extracted to microservices
- **Property-based testing** for 10 correctness properties (P1–P10)
- **Optimistic locking** prevents overselling during concurrent checkouts
- **Redis adapter** for Socket.io horizontal scaling
- **Soft deletes** preserve order history when products are removed
- **JWT rotation** — refresh tokens are single-use (P6)
- **Role isolation** — RBAC enforced at middleware level (P5)
