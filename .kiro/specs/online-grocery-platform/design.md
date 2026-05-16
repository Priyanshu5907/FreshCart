# Design Document: Online Grocery Platform

## 1. System Architecture Overview

The platform follows a modular monolith architecture on the backend, structured as independent service modules that can be extracted into microservices. The frontend is a Next.js 14 PWA consuming REST APIs and WebSocket connections.

```
[Customer/Admin/Delivery Browser]
        |  HTTPS / WSS
[Nginx - Rate Limiting, SSL, Load Balancer]
        |
[Node.js + Express Backend]
  Auth | Product | Cart | Order | Payment | Notification | Admin | Delivery
        |
[PostgreSQL RDS] [Redis ElastiCache] [AWS S3 + CloudFront CDN]
        |
[Socket.io Server] [FCM / Web Push] [Razorpay / Stripe]
```

## 2. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 App Router | SSR/SSG for SEO, React Server Components, image optimization |
| Styling | Tailwind CSS | Utility-first, mobile-first, dark mode via dark: variants |
| PWA | next-pwa + Workbox | Service Worker, offline caching, installable |
| Backend | Node.js + Express.js | Non-blocking I/O, large ecosystem, real-time friendly |
| ORM | Prisma | Type-safe queries, migrations, PostgreSQL support |
| Database | PostgreSQL 15 | ACID, full-text search via pg_trgm, JSON support |
| Cache | Redis 7 | Query cache, session store, pub/sub for real-time |
| Auth | JWT + Passport.js | Stateless RBAC; Passport for OAuth strategies |
| Payments | Razorpay (primary) / Stripe | India-first UPI/card; Stripe as international fallback |
| Real-time | Socket.io | WebSocket with fallback, room-based broadcasting |
| File Storage | AWS S3 + CloudFront | Scalable object storage, global CDN |
| Search | PostgreSQL pg_trgm | Full-text + fuzzy search, no external service needed |
| Push | Firebase Cloud Messaging | Cross-platform web + Android + iOS push |
| CI/CD | GitHub Actions | Native GitHub integration, matrix builds |
| Monitoring | Winston + Prometheus + Grafana | Structured logs, metrics, alerting |
| Deployment | Vercel (frontend) + AWS ECS (backend) + RDS + ElastiCache | Managed, scalable |
| Property Testing | fast-check | TypeScript-native property-based testing library |

## 3. Database Schema

### users
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK, default gen_random_uuid() |
| email | VARCHAR(255) | UNIQUE, nullable |
| phone | VARCHAR(20) | UNIQUE, nullable |
| password_hash | VARCHAR(255) | nullable |
| role | VARCHAR(20) | NOT NULL, DEFAULT 'customer' (customer/admin/delivery_partner) |
| name | VARCHAR(200) | NOT NULL |
| is_active | BOOLEAN | NOT NULL, DEFAULT true |
| email_verified | BOOLEAN | NOT NULL, DEFAULT false |
| phone_verified | BOOLEAN | NOT NULL, DEFAULT false |
| language_pref | VARCHAR(10) | NOT NULL, DEFAULT 'en' |
| theme_pref | VARCHAR(10) | NOT NULL, DEFAULT 'light' |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Indexes: idx_users_email, idx_users_phone, idx_users_role

### oauth_accounts
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| provider | VARCHAR(50) | NOT NULL (google/facebook) |
| provider_id | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

UNIQUE(provider, provider_id)

### refresh_tokens
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| token_hash | VARCHAR(255) | NOT NULL UNIQUE |
| expires_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL |

### addresses
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| label | VARCHAR(50) | NOT NULL DEFAULT 'Home' |
| street | TEXT | NOT NULL |
| city | VARCHAR(100) | NOT NULL |
| state | VARCHAR(100) | NOT NULL |
| pin_code | CHAR(6) | NOT NULL, CHECK pin_code ~ '^\d{6}$' |
| landmark | VARCHAR(200) | nullable |
| is_default | BOOLEAN | NOT NULL DEFAULT false |

### categories
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(100) | NOT NULL UNIQUE |
| slug | VARCHAR(100) | NOT NULL UNIQUE |
| image_url | TEXT | nullable |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| sort_order | INT | NOT NULL DEFAULT 0 |

### products
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| category_id | UUID | FK categories(id) |
| name | VARCHAR(200) | NOT NULL |
| slug | VARCHAR(200) | NOT NULL UNIQUE |
| description | TEXT | nullable |
| brand | VARCHAR(100) | nullable |
| price | NUMERIC(10,2) | NOT NULL, CHECK price > 0 |
| discount_pct | NUMERIC(5,2) | NOT NULL DEFAULT 0, CHECK 0-99.99 |
| stock_qty | INT | NOT NULL DEFAULT 0, CHECK >= 0 |
| is_featured | BOOLEAN | NOT NULL DEFAULT false |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| is_deleted | BOOLEAN | NOT NULL DEFAULT false |
| deal_expires_at | TIMESTAMPTZ | nullable |
| search_vector | TSVECTOR | auto-updated via trigger |

Indexes: idx_products_category, idx_products_active, idx_products_featured (partial), idx_products_search (GIN), idx_products_price, idx_products_stock

### product_images
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| product_id | UUID | FK products(id) CASCADE DELETE |
| url | TEXT | NOT NULL |
| sort_order | INT | NOT NULL DEFAULT 0 |

### reviews
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| product_id | UUID | FK products(id) CASCADE DELETE |
| user_id | UUID | FK users(id) CASCADE DELETE |
| rating | SMALLINT | NOT NULL, CHECK 1-5 |
| comment | VARCHAR(500) | nullable |
| is_verified_purchase | BOOLEAN | NOT NULL DEFAULT false |

UNIQUE(product_id, user_id)

### carts
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | UNIQUE FK users(id) CASCADE DELETE |

### cart_items
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| cart_id | UUID | FK carts(id) CASCADE DELETE |
| product_id | UUID | FK products(id) |
| quantity | INT | NOT NULL DEFAULT 1, CHECK > 0 |
| saved_later | BOOLEAN | NOT NULL DEFAULT false |

UNIQUE(cart_id, product_id)

### coupons
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| code | VARCHAR(20) | NOT NULL UNIQUE |
| discount_type | VARCHAR(20) | NOT NULL (percentage/fixed) |
| discount_value | NUMERIC(10,2) | NOT NULL, CHECK > 0 |
| min_order_value | NUMERIC(10,2) | nullable |
| max_uses | INT | nullable |
| uses_count | INT | NOT NULL DEFAULT 0 |
| starts_at | TIMESTAMPTZ | NOT NULL |
| expires_at | TIMESTAMPTZ | NOT NULL |
| is_active | BOOLEAN | NOT NULL DEFAULT true |

### delivery_slots
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| slot_date | DATE | NOT NULL |
| start_time | TIME | NOT NULL |
| end_time | TIME | NOT NULL |
| max_orders | INT | NOT NULL DEFAULT 20 |
| booked_count | INT | NOT NULL DEFAULT 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |

UNIQUE(slot_date, start_time)

### orders
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) |
| address_id | UUID | FK addresses(id) |
| delivery_slot_id | UUID | FK delivery_slots(id) |
| delivery_partner_id | UUID | FK users(id), nullable |
| coupon_id | UUID | FK coupons(id), nullable |
| status | VARCHAR(30) | NOT NULL DEFAULT 'confirmed' |
| payment_method | VARCHAR(20) | NOT NULL (upi/card/cod) |
| payment_status | VARCHAR(20) | NOT NULL DEFAULT 'pending' |
| payment_gateway_id | VARCHAR(255) | nullable |
| subtotal | NUMERIC(10,2) | NOT NULL |
| discount_amount | NUMERIC(10,2) | NOT NULL DEFAULT 0 |
| delivery_fee | NUMERIC(10,2) | NOT NULL DEFAULT 0 |
| tax_amount | NUMERIC(10,2) | NOT NULL DEFAULT 0 |
| total | NUMERIC(10,2) | NOT NULL |
| cancellation_reason | TEXT | nullable |
| delivered_at | TIMESTAMPTZ | nullable |

Indexes: idx_orders_user, idx_orders_status, idx_orders_created DESC, idx_orders_delivery_partner

### order_items
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK orders(id) CASCADE DELETE |
| product_id | UUID | FK products(id) |
| product_name | VARCHAR(200) | NOT NULL (snapshot) |
| quantity | INT | NOT NULL, CHECK > 0 |
| unit_price | NUMERIC(10,2) | NOT NULL (snapshot) |
| discount_pct | NUMERIC(5,2) | NOT NULL DEFAULT 0 |
| total_price | NUMERIC(10,2) | NOT NULL |

### order_status_history
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| order_id | UUID | FK orders(id) CASCADE DELETE |
| status | VARCHAR(30) | NOT NULL |
| changed_by | UUID | FK users(id), nullable |
| note | TEXT | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |

### wishlists
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| product_id | UUID | FK products(id) CASCADE DELETE |

UNIQUE(user_id, product_id)

### device_tokens
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| token | TEXT | NOT NULL UNIQUE |
| platform | VARCHAR(20) | NOT NULL DEFAULT 'web' (web/android/ios) |
| is_active | BOOLEAN | NOT NULL DEFAULT true |

### banners
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| title | VARCHAR(200) | NOT NULL |
| image_url | TEXT | NOT NULL |
| link_url | TEXT | nullable |
| sort_order | INT | NOT NULL DEFAULT 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |
| starts_at | TIMESTAMPTZ | nullable |
| expires_at | TIMESTAMPTZ | nullable |

### subscription_plans
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| name | VARCHAR(100) | NOT NULL |
| billing_cycle | VARCHAR(20) | NOT NULL (monthly/annual) |
| price | NUMERIC(10,2) | NOT NULL |
| free_delivery | BOOLEAN | NOT NULL DEFAULT true |
| order_discount | NUMERIC(5,2) | NOT NULL DEFAULT 0 |
| is_active | BOOLEAN | NOT NULL DEFAULT true |

### user_subscriptions
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| plan_id | UUID | FK subscription_plans(id) |
| status | VARCHAR(20) | NOT NULL DEFAULT 'active' |
| gateway_sub_id | VARCHAR(255) | nullable |
| starts_at | TIMESTAMPTZ | NOT NULL |
| renews_at | TIMESTAMPTZ | NOT NULL |
| grace_period_ends | TIMESTAMPTZ | nullable |

### loyalty_points
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK users(id) CASCADE DELETE |
| order_id | UUID | FK orders(id), nullable |
| points | INT | NOT NULL |
| type | VARCHAR(20) | NOT NULL (credit/debit) |
| description | VARCHAR(200) | nullable |
| created_at | TIMESTAMPTZ | NOT NULL |

### delivery_partner_locations
| Column | Type | Constraints |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | UNIQUE FK users(id) CASCADE DELETE |
| latitude | NUMERIC(10,7) | NOT NULL |
| longitude | NUMERIC(10,7) | NOT NULL |
| updated_at | TIMESTAMPTZ | NOT NULL |

## 4. API Design

### 4.1 Auth Service (/api/auth)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | /register | Email/password registration | Public |
| POST | /register/phone | Request OTP | Public |
| POST | /register/phone/verify | Verify OTP | Public |
| POST | /login | Email/password login | Public |
| POST | /login/social | OAuth social login | Public |
| POST | /refresh | Refresh access token | Public |
| POST | /logout | Invalidate refresh token | Customer |
| POST | /password/reset | Request reset email | Public |
| POST | /password/reset/confirm | Confirm reset | Public |

### 4.2 User Service (/api/users)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /me | Get profile | Customer |
| PATCH | /me | Update profile | Customer |
| GET | /me/addresses | List addresses | Customer |
| POST | /me/addresses | Add address | Customer |
| PUT | /me/addresses/:id | Update address | Customer |
| DELETE | /me/addresses/:id | Delete address | Customer |
| PATCH | /me/addresses/:id/default | Set default | Customer |

### 4.3 Product Service (/api/products)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /categories | List active categories | Public |
| GET | /products | List/search/filter products | Public |
| GET | /products/:slug | Product detail | Public |
| GET | /products/:id/reviews | Product reviews | Public |
| POST | /products/:id/reviews | Submit review | Customer |
| GET | /products/featured | Featured products | Public |
| GET | /products/deals | Deals of the day | Public |
| GET | /recommendations | Personalized recommendations | Customer |

### 4.4 Cart Service (/api/cart)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | / | Get cart | Customer |
| POST | /items | Add item | Customer |
| PATCH | /items/:id | Update quantity | Customer |
| DELETE | /items/:id | Remove item | Customer |
| POST | /items/:id/save-later | Move to saved | Customer |
| POST | /items/:id/move-to-cart | Move to cart | Customer |
| POST | /coupon | Apply coupon | Customer |
| DELETE | /coupon | Remove coupon | Customer |

### 4.5 Order Service (/api/orders)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /delivery-slots | Available slots | Customer |
| POST | / | Place order | Customer |
| GET | / | Order history | Customer |
| GET | /:id | Order detail | Customer |
| POST | /:id/reorder | Reorder | Customer |
| GET | /:id/tracking | Real-time tracking | Customer |

### 4.6 Payment Service (/api/payments)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | /initiate | Create payment order | Customer |
| POST | /webhook | Gateway webhook | Gateway HMAC |
| GET | /:orderId/status | Payment status | Customer |

### 4.7 Wishlist (/api/wishlist)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | / | Get wishlist | Customer |
| POST | / | Add to wishlist | Customer |
| DELETE | /:productId | Remove from wishlist | Customer |
| POST | /:productId/move-to-cart | Move to cart | Customer |

### 4.8 Subscriptions and Loyalty
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /subscriptions/plans | List plans | Public |
| POST | /subscriptions | Subscribe | Customer |
| DELETE | /subscriptions | Cancel | Customer |
| GET | /loyalty/balance | Points balance | Customer |
| GET | /loyalty/history | Points history | Customer |

### 4.9 Admin Panel (/api/admin)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /dashboard | Analytics summary | Admin |
| GET | /products | All products | Admin |
| POST | /products | Create product | Admin |
| PUT | /products/:id | Update product | Admin |
| DELETE | /products/:id | Soft-delete product | Admin |
| POST | /products/upload | Get S3 presigned URL | Admin |
| GET | /categories | All categories | Admin |
| POST | /categories | Create category | Admin |
| PUT | /categories/:id | Update/deactivate | Admin |
| GET | /orders | All orders with filters | Admin |
| PATCH | /orders/:id/status | Update order status | Admin |
| POST | /orders/:id/assign | Assign delivery partner | Admin |
| GET | /coupons | All coupons | Admin |
| POST | /coupons | Create coupon | Admin |
| PUT | /coupons/:id | Update coupon | Admin |
| GET | /users | All users | Admin |
| GET | /banners | All banners | Admin |
| POST | /banners | Create banner | Admin |
| PUT | /banners/:id | Update banner | Admin |

### 4.10 Delivery Partner (/api/delivery)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /orders | Assigned orders | Delivery |
| PATCH | /orders/:id/status | Update status | Delivery |
| POST | /location | Update GPS location | Delivery |

### 4.11 Notifications (/api/notifications)
| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | /device-token | Register device token | Customer |
| DELETE | /device-token | Unregister token | Customer |
| PATCH | /preferences | Update preferences | Customer |

### 4.12 Health Check
| Method | Path | Description |
|---|---|---|
| GET | /health | Service health status |

## 5. Authentication and Authorization

### 5.1 JWT Lifecycle
```
Login
  -> Access Token (15 min expiry, signed with JWT_SECRET)
  -> Refresh Token (7 day expiry, hashed with bcrypt, stored in DB)

Request with expired access token
  -> POST /auth/refresh with refresh token (httpOnly cookie or Authorization header)
  -> Validate token hash against DB
  -> Issue new access token + rotate refresh token

Logout
  -> Delete refresh token from DB
  -> Client clears tokens
```

### 5.2 RBAC Middleware
Three roles with distinct permissions:
- **customer**: access own data, browse, cart, orders, wishlist
- **admin**: full platform management, cannot place customer orders
- **delivery_partner**: view assigned orders, update delivery status and location

Middleware checks JWT role claim on every protected route. Non-matching roles receive HTTP 403.

### 5.3 OAuth 2.0 Flow (Google / Facebook)
```
1. GET /auth/google -> Passport.js redirects to Google OAuth consent
2. Google redirects to /auth/google/callback with authorization code
3. Passport exchanges code for profile (email, name, provider_id)
4. Find existing user by email or create new user
5. Upsert oauth_accounts record
6. Issue JWT access + refresh tokens
7. Redirect to frontend with tokens
```

### 5.4 OTP Flow (Phone Registration)
```
1. POST /auth/register/phone { phone }
2. Generate 6-digit OTP, store hash in Redis with 5-min TTL
3. Send OTP via Twilio SMS
4. POST /auth/register/phone/verify { phone, otp }
5. Validate OTP hash from Redis
6. Mark phone_verified = true, complete registration
7. Delete OTP from Redis
```

### 5.5 Rate Limiting
- Auth endpoints: max 10 requests per IP per 15-minute window
- API endpoints: max 100 requests per user per minute
- Upload endpoints: max 10 requests per user per hour
- Implemented via express-rate-limit + Redis store

## 6. Real-Time Communication (Socket.io)

### 6.1 Connection and Authentication
```
Client connects to /socket.io with JWT in handshake auth
Server validates JWT on connection
User joins personal room: user:{userId}
```

### 6.2 Rooms
| Room | Members | Purpose |
|---|---|---|
| user:{userId} | Single customer | Personal notifications, order updates |
| order:{orderId} | Customer + Delivery Partner | Order tracking, location |
| admin | All admin users | Live dashboard updates |
| inventory:{productId} | All connected clients | Stock level changes |

### 6.3 Events
| Event | Direction | Payload |
|---|---|---|
| inventory:update | Server -> Client | { productId, stockQty, isInStock } |
| order:status | Server -> Client | { orderId, status, timestamp } |
| delivery:location | Server -> Client | { orderId, lat, lng, eta, updatedAt } |
| location:update | Client -> Server | { lat, lng } (Delivery Partner only) |
| cart:conflict | Server -> Client | { productId, availableQty } |
| notification:new | Server -> Client | { title, body, type, data } |

### 6.4 Horizontal Scaling with Redis Adapter
```
Multiple Node.js instances share Socket.io state via @socket.io/redis-adapter
Service publishes event to Redis channel
Redis adapter broadcasts to all connected clients across all instances
```

### 6.5 Stale Location Handling
When no `location:update` is received from a delivery partner for more than 60 seconds, the server sets a stale flag on the order tracking state. The client displays "Location temporarily unavailable" instead of the last known position. When the order transitions to "Delivered", the server closes the real-time connection for that order and stops broadcasting location events.

## 7. Caching Strategy (Redis)

| Cache Key | TTL | Invalidated When |
|---|---|---|
| categories:all | 5 min | Category created/updated/deactivated |
| products:featured | 5 min | Product featured flag changed |
| products:deals | 5 min | Product discount or deal_expires_at changed |
| product:{id} | 10 min | Product updated |
| search:{hash(query+filters)} | 2 min | Any product stock/price change |
| cart:{userId} | 30 min | Cart mutated |
| delivery-slots:{date} | 1 min | Slot booked |
| recommendations:{userId} | 30 min | New order placed by user |
| coupon:{code} | 5 min | Coupon updated |
| dashboard:stats | 5 min | New order placed |

Cache-aside pattern: check Redis first, on miss query DB and populate cache. Write-through for cart to ensure consistency.

## 8. File and Image Storage

### 8.1 Upload Flow
```
1. Admin requests presigned URL: POST /api/admin/products/upload
2. Backend generates S3 presigned PUT URL (15-min expiry)
3. Frontend uploads file directly to S3 (bypasses backend)
4. Frontend sends CloudFront CDN URL to backend in product create/update request
5. Backend stores CDN URL in product_images table
```

### 8.2 S3 Configuration
- Bucket: grocery-platform-assets (private, versioning enabled)
- Path structure: products/{productId}/{uuid}.{ext}
- Accepted formats: JPEG, PNG, WebP (max 5 MB per file)
- CloudFront distribution with S3 origin
- Cache-Control: max-age=31536000 for product images
- Signed URLs for private assets if needed

### 8.3 File Validation
Backend validates MIME type and file size before issuing the presigned URL. Accepted MIME types: image/jpeg, image/png, image/webp. Maximum size: 5 MB. Requests exceeding these constraints return HTTP 400.

## 9. Payment Integration

### 9.1 Razorpay Flow
```
1. Customer confirms order -> POST /api/payments/initiate
2. Backend creates Razorpay Order via API -> returns { razorpayOrderId, amount, currency, key }
3. Frontend opens Razorpay checkout modal
4. Customer completes payment
5. Razorpay returns { razorpay_payment_id, razorpay_order_id, razorpay_signature }
6. Frontend sends these to POST /api/orders
7. Backend verifies HMAC-SHA256 signature
8. On valid signature: create Order (status: confirmed), decrement stock, send confirmation
9. On invalid signature: return 400, no order created
10. Razorpay webhook (POST /api/payments/webhook): secondary verification, idempotent
```

### 9.2 COD Flow
```
1. Customer selects COD -> POST /api/orders (no payment initiation)
2. Backend creates Order (status: confirmed, payment_status: pending)
3. Delivery partner collects cash on delivery
4. Admin/delivery partner marks payment_status: paid
```

### 9.3 Webhook Security
- Verify Razorpay webhook signature using X-Razorpay-Signature header
- Idempotency: check if order already processed before acting
- Return 200 immediately to prevent retries, process asynchronously

## 10. AI Recommendation Engine

### 10.1 Approach: Hybrid Collaborative + Content-Based Filtering
```
Data Inputs:
  - Order history matrix (user x product purchase counts)
  - Browsing events stored in Redis (product views, category visits, last 30 days)
  - Product attributes (category, brand, price range)

Algorithm:
  1. Item-based collaborative filtering
     - Build product co-occurrence matrix from order history
     - Compute cosine similarity between products
     - For a user: find their purchased products, get top similar products
  2. Content-based fallback
     - Match products by same category and brand
  3. Cold-start fallback
     - New user with no history: show top-selling products globally
     - User browsed a category: show top-selling in that category

Precomputation:
  - Nightly cron job recomputes similarity matrix
  - Per-user recommendations cached in Redis (key: recommendations:{userId}, TTL: 30 min)
  - Refreshed on new order placement

Exclusions:
  - Out-of-stock products filtered at query time
  - Already-in-cart products de-prioritized
  - Max 10 on homepage, max 6 on product detail page
```

## 11. Notification Service

### 11.1 Architecture
```
Event Source (Order/Product/Subscription Service)
  -> Publish to Redis channel "notifications:{userId}"
  -> Notification Worker subscribes and processes
  -> Routes to appropriate channel:
     - FCM (Android/iOS mobile push)
     - Web Push API (browser push via VAPID keys)
     - Email (Nodemailer + AWS SES)
     - SMS (Twilio - OTP and critical alerts only)
```

### 11.2 Notification Triggers
| Event | Channels | SLA |
|---|---|---|
| Order confirmed | Email + Push | 60 sec |
| Order status change | Push | 60 sec |
| Out for delivery | Push + SMS | 60 sec |
| Delivered | Push + Email | 60 sec |
| Restock (wishlisted item) | Push | 5 min |
| Promotional campaign | Push (opted-in) | 10 min |
| Subscription renewal failure | Email + Push | 60 sec |
| OTP | SMS | 30 sec |

### 11.3 Device Token Management
- Tokens stored in device_tokens table per user per device
- Stale tokens (FCM returns InvalidRegistration) auto-removed
- Users can opt out per channel (push/email/sms) via preferences

## 12. CI/CD Pipeline (GitHub Actions)

### 12.1 Pipeline Stages
```
On Pull Request to main:
  1. lint          -> ESLint + Prettier (frontend + backend)
  2. type-check    -> tsc --noEmit
  3. unit-tests    -> Jest (backend, coverage >= 80%) + Vitest (frontend)
  4. e2e-tests     -> Playwright: auth -> browse -> cart -> checkout -> order
  5. api-contract  -> Spectral validates OpenAPI spec; Dredd tests endpoints
  6. build         -> next build + Docker image build

On merge to main:
  7. deploy-staging   -> Vercel preview deploy (frontend) + ECS staging (backend)
  8. db-migrate       -> prisma migrate deploy on staging DB
  9. smoke-tests      -> Playwright smoke suite against staging URL
  10. deploy-prod     -> Manual approval gate required
  11. db-migrate-prod -> prisma migrate deploy on production DB
  12. deploy-prod-app -> ECS production deploy (blue/green)
  13. notify          -> Slack + email with version and environment
```

### 12.2 Rollback Procedure
- **Frontend**: Vercel instant rollback to previous deployment
- **Backend**: ECS blue/green switch back to previous task definition
- **Database**: Prisma migration rollback script (documented per migration)
- Target: full rollback within 15 minutes

### 12.3 Schema Drift Detection
The CI pipeline includes a step that compares the applied Prisma migration state against the documented schema file. If they diverge, the build fails. This ensures the design document and the live schema remain in sync.

## 13. Monitoring and Logging

### 13.1 Structured Logging (Winston)
All logs emitted as JSON with fields:
- timestamp, level, service, requestId, userId (if authenticated)
- method, path, statusCode, responseTimeMs (for HTTP logs)
- error, stack (for error logs)

Log levels: error, warn, info, http, debug
Transports: Console (dev), AWS CloudWatch Logs (production)

### 13.2 Metrics (Prometheus)
Exposed at GET /metrics (Prometheus format):
- http_requests_total (counter, labels: method, path, status)
- http_request_duration_seconds (histogram, p50/p95/p99)
- active_websocket_connections (gauge)
- cache_hit_ratio (gauge, per cache key pattern)
- queue_depth (gauge, notification queue)

Grafana dashboards: request rate, error rate, p95 latency, cache hit ratio, active connections.

### 13.3 Alerting
| Condition | Alert Channel | Response Time |
|---|---|---|
| Service returns HTTP 5xx > 1% of requests | Slack + Email | 5 min |
| Service unavailable (health check fails) | PagerDuty | 5 min |
| p95 latency > 1000ms for 5 min | Slack | 15 min |
| Database connection pool exhausted | PagerDuty | 5 min |
| Payment webhook failure | Email | 15 min |

### 13.4 Health Check Response
```json
GET /health
{
  "status": "ok",
  "timestamp": "2026-05-09T10:00:00Z",
  "services": {
    "database": "ok",
    "redis": "ok",
    "paymentGateway": "ok"
  }
}
```
Returns HTTP 503 with failing service identified if any dependency is down.

## 14. Security Architecture

### 14.1 Transport Security
- HTTPS enforced via Nginx (HTTP redirects to HTTPS)
- HSTS header: Strict-Transport-Security: max-age=31536000; includeSubDomains
- TLS 1.2+ only, strong cipher suites

### 14.2 HTTP Security Headers (helmet.js)
- Content-Security-Policy: restrict script/style sources
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

### 14.3 Input Validation (Zod)
- All request bodies, query params, and path params validated with Zod schemas
- Validation middleware runs before route handlers
- Invalid input returns HTTP 400 with field-level error details

### 14.4 SQL Injection Prevention
- All DB queries via Prisma ORM with parameterized bindings
- No raw SQL queries with user input
- pg_trgm search uses parameterized plainto_tsquery()

### 14.5 XSS Prevention
- All user-generated content sanitized with DOMPurify (frontend) and sanitize-html (backend)
- CSP header restricts inline scripts
- React JSX auto-escapes output

### 14.6 CSRF Protection
- SameSite=Strict on authentication cookies
- CSRF token (double-submit cookie pattern) on state-changing endpoints
- API-only endpoints use Authorization header (not cookies) - inherently CSRF-safe

### 14.7 Rate Limiting
- Auth endpoints: 10 requests / IP / 15 min (express-rate-limit + Redis)
- API endpoints: 100 requests / user / min
- Upload endpoints: 10 requests / user / hour

### 14.8 Secrets Management
- All secrets in environment variables (never in source code)
- .env.example documents all required variables
- AWS Secrets Manager for production secrets rotation
- GitHub Actions secrets for CI/CD credentials

### 14.9 CORS Configuration
CORS is configured to allow only trusted frontend origins (configured via ALLOWED_ORIGINS environment variable). All other origins receive HTTP 403 on preflight.

## 15. Correctness Properties for Property-Based Testing

*A property is a characteristic or behavior that should hold true across all valid executions of a system - essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The following properties are implemented as property-based tests using **fast-check** (TypeScript). Each test runs a minimum of 100 iterations with randomly generated inputs. Tests are tagged with the format: `Feature: online-grocery-platform, Property {N}: {property_text}`

### P1: Cart Subtotal Consistency

*For any* cart containing N items where each item has quantity `q_i` and discounted unit price `p_i`, the computed subtotal must equal `sum(q_i * p_i)` for all i. This invariant must hold for all possible combinations of items, quantities, prices, and discount percentages — including zero-discount items, maximum-discount items, and single-item carts.

**Validates: Requirements 6.8**

### P2: Stock Non-Negativity

*For any* sequence of add-to-cart and checkout operations on a product with initial stock `S`, the product's `stock_qty` must always remain greater than or equal to 0. If a requested quantity exceeds available stock, the operation must be rejected or capped — never resulting in negative stock. This holds under concurrent requests via optimistic locking.

**Validates: Requirements 6.4, 16.1**

### P3: Coupon Idempotency

*For any* valid coupon code and cart state, applying the same coupon code twice must produce the same discount amount as applying it once. The second application must be rejected with an error, and the cart total must remain unchanged from the first application. This holds for both percentage and fixed-amount coupon types.

**Validates: Requirements 7.1, 7.4**

### P4: Order Total Integrity

*For any* confirmed order with any combination of items, coupon type, subscription status, and payment method, the following invariant must hold:

```
total = subtotal - discount_amount + delivery_fee + tax_amount
```

This must hold for percentage coupons, fixed-amount coupons, subscription delivery-fee waivers, subscription order discounts, and loyalty point redemptions — in all combinations.

**Validates: Requirements 8.1, 8.7, 34.3**

### P5: JWT Role Isolation

*For any* JWT token carrying role `R`, accessing any endpoint that requires role `R'` where `R != R'` must always return HTTP 403 Forbidden. No combination of token manipulation, header injection, or role value can grant access to a higher-privileged endpoint. This holds for all three roles: customer, admin, and delivery_partner.

**Validates: Requirements 11.3, 21.4**

### P6: Refresh Token Single-Use

*For any* valid refresh token, using it once to obtain a new access token must succeed (HTTP 200) and immediately invalidate the original token. Any subsequent use of the same refresh token — including concurrent requests — must return HTTP 401 Unauthorized. The rotated token must itself be valid for exactly one use.

**Validates: Requirements 1.7**

### P7: Delivery Slot Capacity

*For any* delivery slot with `max_orders = M`, the total number of confirmed bookings for that slot must never exceed `M`. Under concurrent order placements targeting the same slot, the system must use database-level locking to ensure the (M+1)th booking is rejected with an appropriate error. The `booked_count` column must always satisfy `booked_count <= max_orders`.

**Validates: Requirements 8.3, 8.4**

### P8: Loyalty Points Balance Non-Negativity

*For any* sequence of loyalty point credit and debit operations on a customer's account, the running balance must always remain greater than or equal to 0. A debit operation that would result in a negative balance must be rejected. This holds regardless of the order of operations, concurrent requests, or order cancellations that trigger automatic point deductions.

**Validates: Requirements 34.5, 34.6, 34.7**

### P9: Subscription Discount Application

*For any* order placed by a customer with an active subscription plan that includes a delivery-fee waiver (`free_delivery = true`) and/or an order discount percentage `D`, the computed order total must satisfy:

```
delivery_fee = 0                              (when free_delivery = true)
discount_amount >= subtotal * (D / 100)       (when order_discount > 0)
```

This must hold for all order sizes, item combinations, and coupon combinations applied on top of the subscription discount.

**Validates: Requirements 34.1, 34.3**

### P10: Wishlist Uniqueness Invariant

*For any* customer and product, adding the same product to the wishlist N times (where N >= 1) must result in exactly one entry in the wishlist for that product. The wishlist must never contain duplicate entries for the same (user_id, product_id) pair, regardless of how many times the add operation is called or whether calls are concurrent.

**Validates: Requirements 10.1**

## 16. Error Handling

### 16.1 HTTP Error Response Format
All API errors return a consistent JSON structure:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": [
      { "field": "email", "message": "Invalid email format" }
    ]
  }
}
```

### 16.2 Error Code Taxonomy
| HTTP Status | Code | Scenario |
|---|---|---|
| 400 | VALIDATION_ERROR | Zod schema validation failure |
| 400 | INVALID_COUPON | Coupon expired, invalid, or already used |
| 400 | PAYMENT_SIGNATURE_INVALID | Razorpay HMAC verification failed |
| 401 | UNAUTHORIZED | Missing or invalid JWT |
| 401 | TOKEN_EXPIRED | Access token expired |
| 401 | REFRESH_TOKEN_INVALID | Refresh token used, expired, or not found |
| 403 | FORBIDDEN | Authenticated but insufficient role |
| 404 | NOT_FOUND | Resource does not exist |
| 409 | CONFLICT | Duplicate resource (e.g., duplicate review) |
| 409 | SLOT_FULL | Delivery slot at capacity |
| 409 | INSUFFICIENT_STOCK | Requested quantity exceeds stock |
| 422 | UNPROCESSABLE | Business rule violation |
| 429 | RATE_LIMITED | Rate limit exceeded |
| 500 | INTERNAL_ERROR | Unexpected server error |
| 503 | SERVICE_UNAVAILABLE | Dependency (DB/Redis) unavailable |

### 16.3 Unhandled Error Middleware
Express global error handler catches all unhandled errors, logs full context (stack trace, request ID, user ID), emits a Prometheus counter increment, and returns a sanitized HTTP 500 response. Stack traces are never exposed to clients in production.

### 16.4 Payment Failure Handling
When the payment gateway returns a failure, no Order record is created. The frontend receives a structured error with a `retryable: true` flag, allowing the customer to retry without re-entering cart details. The Razorpay order ID is preserved for retry attempts.

### 16.5 Startup Validation
On application startup, the server validates all required environment variables. If any are missing, it logs a descriptive error identifying each missing variable and exits with code 1. This prevents silent misconfiguration in production.

## 17. Testing Strategy

### 17.1 Overview

The platform uses a dual testing approach combining example-based unit/integration tests with property-based tests. Together they provide comprehensive correctness coverage.

### 17.2 Unit Tests (Jest - Backend, Vitest - Frontend)

Unit tests cover specific examples, edge cases, and error conditions for each service module. Target: >= 80% code coverage enforced in CI.

Key areas:
- Auth service: registration, login, token refresh, OTP validation, password reset
- Cart service: add/update/remove items, coupon application, subtotal calculation
- Order service: order placement, total calculation, stock decrement, slot booking
- Payment service: HMAC signature verification, webhook idempotency
- Notification service: routing logic, channel selection, token management
- Admin service: dashboard aggregation queries, product CRUD, coupon validation
- Subscription service: billing initiation, grace period logic, discount application
- Loyalty service: point credit/debit, balance calculation, redemption cap enforcement

### 17.3 Integration Tests (Supertest)

Integration tests exercise the full HTTP stack against a test database (PostgreSQL in Docker). Each test suite resets the database to a known state before running.

Coverage: all API endpoints with success, validation error, and auth/authorization failure cases.

### 17.4 End-to-End Tests (Playwright)

E2E tests cover the complete customer flow:
```
Registration -> Login -> Browse categories -> Search products ->
Add to cart -> Apply coupon -> Checkout (address + slot + payment) ->
Order confirmation -> Order tracking -> Reorder
```

Additional flows:
- Admin: login -> create product -> update stock -> manage orders -> assign delivery partner
- Delivery partner: login -> view assigned orders -> update status -> location update

### 17.5 Property-Based Tests (fast-check)

Each correctness property (P1-P10) is implemented as a single property-based test with a minimum of 100 iterations. Tests are tagged with the property they validate:

```typescript
// Feature: online-grocery-platform, Property 1: Cart Subtotal Consistency
fc.assert(
  fc.property(cartItemsArbitrary, (items) => {
    const subtotal = computeSubtotal(items);
    const expected = items.reduce(
      (sum, item) => sum + item.quantity * item.discountedPrice,
      0
    );
    return Math.abs(subtotal - expected) < 0.001; // floating point tolerance
  }),
  { numRuns: 100 }
);
```

Tag format: `Feature: online-grocery-platform, Property {N}: {property_text}`

### 17.6 UI Responsiveness Tests

Playwright viewport tests verify correct layout rendering at:
- 320px (small mobile)
- 768px (tablet)
- 1024px (small desktop)
- 1440px (large desktop)

### 17.7 API Contract Tests

Spectral lints the OpenAPI 3.0 spec on every PR. Dredd (or Playwright API tests) executes all documented example requests against a running instance and verifies response schemas match the specification. The build fails if any endpoint deviates from the spec.

### 17.8 Performance Targets
- Product listing/search API: p95 < 500ms at 100 concurrent users
- Homepage initial load: < 3 seconds on 10 Mbps connection
- Lighthouse performance score: >= 80 on mobile
- Lighthouse PWA audit score: >= 80
- CDN cache hit ratio: >= 80%

### 17.9 PWA Verification
The Workbox service worker is verified to:
- Cache static assets and the application shell on install
- Serve cached pages when offline (previously visited routes)
- Use network-first strategy for API calls with cache fallback
- Register the Web App Manifest with correct icons, theme color, and standalone display mode
