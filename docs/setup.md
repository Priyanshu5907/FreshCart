# Local Setup Guide

## Prerequisites

- Node.js >= 18 (recommend using [nvm](https://github.com/nvm-sh/nvm))
- npm >= 9
- Docker & Docker Compose (for PostgreSQL and Redis)
- Git

## Quick Start (Docker)

The fastest way to get everything running:

```bash
# 1. Clone the repository
git clone <repo-url>
cd online-grocery-platform

# 2. Start PostgreSQL and Redis
docker-compose up postgres redis -d

# 3. Install dependencies
npm install

# 4. Set up backend environment
cp backend/.env.example backend/.env
# Edit backend/.env with your values (minimum: DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET)

# 5. Set up frontend environment
cp frontend/.env.example frontend/.env.local

# 6. Run database migrations
cd backend
npx prisma migrate dev --name init

# 7. Apply manual migrations (search vector trigger)
psql $DATABASE_URL -f prisma/migrations/manual/001_search_vector_trigger.sql
psql $DATABASE_URL -f prisma/migrations/manual/002_additional_indexes.sql

# 8. Seed the database
npm run db:seed

# 9. Start development servers (from root)
cd ..
npm run dev
```

The app will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- API Health: http://localhost:3001/api/health

## Seed Accounts

After running `npm run db:seed`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@freshcart.com | Password123! |
| Customer | alice@example.com | Password123! |
| Delivery Partner | delivery@freshcart.com | Password123! |

## Environment Variables

See `backend/.env.example` and `frontend/.env.example` for all required variables.

**Minimum required for local development:**

```env
# backend/.env
DATABASE_URL=postgresql://freshcart:freshcart_dev@localhost:5432/grocery_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=any-random-string-at-least-32-chars
JWT_REFRESH_SECRET=another-random-string-at-least-32-chars
```

## Running Tests

```bash
# Backend unit tests
npm run test --workspace=backend

# Backend tests with coverage
npm run test --workspace=backend -- --coverage

# Frontend E2E tests (requires running app)
cd frontend && npx playwright test
```

## Troubleshooting

**Database connection failed:** Ensure Docker is running and PostgreSQL container is healthy:
```bash
docker-compose ps
docker-compose logs postgres
```

**Redis connection failed:** Check Redis container:
```bash
docker-compose logs redis
```

**Prisma client not generated:** Run `npm run db:generate` in the backend directory.
