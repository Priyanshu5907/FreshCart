# Deployment Guide: Netlify (Frontend) + Render (Backend)

> **Stack:** Next.js 14 on Netlify · Express/Node on Render · PostgreSQL on Render · Redis on Upstash

---

## Quick Reference — Build Commands

| Service | Build Command | Start Command |
|---------|--------------|---------------|
| **Backend (Render)** | `npm install && npx prisma generate && npm run build` | `npx prisma migrate deploy && node dist/index.js` |
| **Frontend (Netlify)** | `npm install && npm run build` | *(none — Netlify handles serving)* |

---

## Step 1 — Push Code to GitHub

```bash
# Run from the project root
git init
git add .
git commit -m "Initial commit: FreshCart online grocery platform"
git branch -M main
git remote add origin https://github.com/Priyanshu5907/FreshCart.git
git push -u origin main
```

If the remote already exists:
```bash
git remote set-url origin https://github.com/Priyanshu5907/FreshCart.git
git push -u origin main
```

---

## Step 2 — Set Up Render (Backend + Database + Redis)

### 2a. Create PostgreSQL Database

1. Go to [render.com](https://render.com) → **New** → **PostgreSQL**
2. Fill in:
   - **Name:** `freshcart-db`
   - **Database:** `grocery_db`
   - **User:** `freshcart`
   - **Plan:** Free
3. Click **Create Database**
4. Once created, copy the **Internal Database URL** — you'll use it as `DATABASE_URL`

> Use the **Internal** URL (not External) when both the DB and backend are on Render. The External URL is only for connecting from your local machine.

### 2b. Create Redis (Upstash — recommended free tier)

1. Go to [upstash.com](https://upstash.com) → **Create Database**
2. Choose a region close to your Render region (e.g., `ap-southeast-1` for India)
3. After creation, copy the **REDIS_URL** — it looks like:
   ```
   rediss://default:<password>@<host>.upstash.io:6379
   ```

**Alternative — Render Redis:**
1. Render → **New** → **Redis** → Name: `freshcart-redis` → Plan: Free
2. Copy the **Internal Redis URL**

### 2c. Deploy Backend on Render

1. Render → **New** → **Web Service**
2. Connect GitHub → select `Priyanshu5907/FreshCart`
3. Configure:
   - **Name:** `freshcart-backend`
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install && npx prisma generate && npm run build`
   - **Start Command:** `npx prisma migrate deploy && node dist/index.js`
   - **Plan:** Free

4. Add the environment variables below (Render dashboard → **Environment** tab):

#### Required Variables (backend won't start without these)

| Variable | Value / How to get it |
|----------|-----------------------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | Internal Database URL from step 2a |
| `REDIS_URL` | Redis URL from step 2b |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_REFRESH_SECRET` | Run the same command again for a different value |
| `JWT_ACCESS_EXPIRY` | `15m` |
| `JWT_REFRESH_EXPIRY` | `7d` |
| `BCRYPT_ROUNDS` | `12` |
| `FRONTEND_URL` | `https://your-app.netlify.app` *(update after step 3)* |

#### Optional Variables (enable specific features)

| Variable | Value / How to get it |
|----------|-----------------------|
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same as above |
| `GOOGLE_CALLBACK_URL` | `https://freshcart-backend.onrender.com/api/auth/google/callback` |
| `FACEBOOK_APP_ID` | [Meta for Developers](https://developers.facebook.com) |
| `FACEBOOK_APP_SECRET` | Same as above |
| `FACEBOOK_CALLBACK_URL` | `https://freshcart-backend.onrender.com/api/auth/facebook/callback` |
| `RAZORPAY_KEY_ID` | [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys |
| `RAZORPAY_KEY_SECRET` | Same as above |
| `RAZORPAY_WEBHOOK_SECRET` | Razorpay Dashboard → Webhooks → set a secret |
| `TWILIO_ACCOUNT_SID` | [Twilio Console](https://console.twilio.com) |
| `TWILIO_AUTH_TOKEN` | Same as above |
| `TWILIO_PHONE_NUMBER` | Your Twilio number in E.164 format, e.g. `+1234567890` |
| `SMTP_HOST` | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your email address |
| `SMTP_PASS` | App-specific password (Gmail: Settings → Security → App passwords) |
| `EMAIL_FROM` | `FreshCart <noreply@freshcart.com>` |
| `AWS_ACCESS_KEY_ID` | IAM user with S3 permissions |
| `AWS_SECRET_ACCESS_KEY` | Same IAM user |
| `AWS_REGION` | e.g. `ap-south-1` |
| `AWS_S3_BUCKET` | Your S3 bucket name |
| `CLOUDFRONT_URL` | Your CloudFront distribution URL (no trailing slash) |
| `VAPID_PUBLIC_KEY` | Run: `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Same command as above |
| `VAPID_SUBJECT` | `mailto:admin@freshcart.com` |
| `FCM_SERVER_KEY` | Firebase Console → Project Settings → Cloud Messaging |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project Settings → Service Accounts → Generate new private key (paste the JSON as a single-line string) |

5. Click **Create Web Service**
6. Wait for the first deploy. Your backend URL: `https://freshcart-backend.onrender.com`
7. Verify: open `https://freshcart-backend.onrender.com/api/health` — should return `{"status":"ok"}`

### 2d. Seed the Database (one-time)

After the backend deploys successfully, go to Render → your service → **Shell** tab:

```bash
npx ts-node -r dotenv/config prisma/seed.ts
```

Default seed accounts:
- **Admin:** `admin@freshcart.com` / `Password123!`
- **Customer:** `alice@example.com` / `Password123!`

---

## Step 3 — Deploy Frontend on Netlify

### 3a. Connect GitHub to Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site** → **Import from Git**
2. Connect GitHub → select `Priyanshu5907/FreshCart`
3. Configure build settings:
   - **Base directory:** `frontend`
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `.next`
   - **Node version:** `20` (set under Site Settings → Build & Deploy → Environment)

> The `netlify.toml` in the repo root already sets these — Netlify will pick them up automatically.

### 3b. Add Environment Variables on Netlify

Go to **Site Settings** → **Environment Variables** → **Add a variable**:

#### Required Variables

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://freshcart-backend.onrender.com/api` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://freshcart-backend.onrender.com` |

#### Optional Variables

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Your Razorpay test key ID (starts with `rzp_test_`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The public key from `npx web-push generate-vapid-keys` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Console → Project Settings → General → Your apps |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | e.g. `your-project-id` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID from Firebase |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | App ID from Firebase |

### 3c. Deploy

Click **Deploy site**. Your frontend URL: `https://your-app.netlify.app`

### 3d. Update FRONTEND_URL on Render

Go back to Render → `freshcart-backend` → **Environment** → update `FRONTEND_URL` to your actual Netlify URL (no trailing slash):

```
FRONTEND_URL=https://your-app.netlify.app
```

Render will automatically redeploy after saving.

---

## Step 4 — Verify Everything Works

1. Open your Netlify URL
2. Backend health check: `https://freshcart-backend.onrender.com/api/health`
3. Try logging in with the seed accounts
4. Place a test order to verify the full flow

---

## Troubleshooting

**Render free tier cold starts**
Free services sleep after 15 minutes of inactivity. The first request after sleep takes 30–60 seconds. Upgrade to a paid plan or use a cron job to ping `/api/health` every 10 minutes to keep it warm.

**CORS errors in the browser**
`FRONTEND_URL` on Render must exactly match your Netlify URL — no trailing slash, correct protocol (`https://`).

**Database connection errors**
Make sure you're using the **Internal** Database URL on Render, not the External one.

**Socket.io not connecting**
Netlify doesn't support persistent WebSocket connections. The Socket.io client automatically falls back to HTTP long-polling, which works fine.

**Prisma migration errors on deploy**
If `prisma migrate deploy` fails, check that `DATABASE_URL` is set correctly and the database is reachable. You can run migrations manually from the Render Shell tab.

**`@netlify/plugin-nextjs` not found**
Netlify installs this automatically when it detects a Next.js project. If it fails, add it manually:
```bash
cd frontend && npm install -D @netlify/plugin-nextjs
```
Then commit and push.
