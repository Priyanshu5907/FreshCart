# Deployment Guide

## Architecture

- **Frontend:** Vercel (Next.js)
- **Backend:** AWS ECS Fargate (Docker)
- **Database:** AWS RDS PostgreSQL 15
- **Cache:** AWS ElastiCache Redis 7
- **CDN:** AWS CloudFront + S3
- **Reverse Proxy:** Nginx (on EC2 or ECS)

## Frontend Deployment (Vercel)

1. Connect your GitHub repository to Vercel
2. Set the root directory to `frontend/`
3. Configure environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL`
   - `NEXT_PUBLIC_SOCKET_URL`
   - `NEXT_PUBLIC_RAZORPAY_KEY_ID`
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
4. Deploy automatically on push to `main`

**Rollback:** In Vercel dashboard → Deployments → click any previous deployment → "Promote to Production"

## Backend Deployment (AWS ECS)

### Initial Setup

```bash
# Build and push Docker image to ECR
aws ecr get-login-password --region ap-south-1 | docker login --username AWS --password-stdin <account>.dkr.ecr.ap-south-1.amazonaws.com
docker build -t freshcart-backend ./backend
docker tag freshcart-backend:latest <account>.dkr.ecr.ap-south-1.amazonaws.com/freshcart-backend:latest
docker push <account>.dkr.ecr.ap-south-1.amazonaws.com/freshcart-backend:latest
```

### Deploy New Version

```bash
# Update ECS service (triggers blue/green deployment)
aws ecs update-service \
  --cluster freshcart-prod \
  --service freshcart-backend \
  --force-new-deployment \
  --region ap-south-1
```

### Run Database Migrations

Always run migrations before deploying new backend code:

```bash
DATABASE_URL=<prod-url> npx prisma migrate deploy
```

**Rollback:** Switch ECS service back to previous task definition revision:
```bash
aws ecs update-service \
  --cluster freshcart-prod \
  --service freshcart-backend \
  --task-definition freshcart-backend:<previous-revision>
```

## Database Migrations

- **Never** run `prisma migrate dev` in production
- Always use `prisma migrate deploy` for production
- Test migrations on staging first
- Keep migration rollback scripts for each migration

## Rollback Procedure

| Component | Rollback Method | Time |
|-----------|----------------|------|
| Frontend | Vercel instant rollback | < 1 min |
| Backend | ECS task definition rollback | 2–5 min |
| Database | Migration rollback script | Varies |

**Target:** Full rollback within 15 minutes.

## Health Checks

- Backend: `GET /api/health` — returns 200 if DB and Redis are healthy
- Frontend: Vercel built-in health monitoring
- ECS: Container health check every 30s
