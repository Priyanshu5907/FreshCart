# Implementation Tasks

## Task 1: Project Scaffolding and Infrastructure Setup
- [x] 1.1 Initialize monorepo structure with frontend/ and backend/ directories and root package.json
- [x] 1.2 Set up Next.js 14 App Router project with TypeScript and Tailwind CSS in frontend/
- [x] 1.3 Set up Node.js + Express project with TypeScript in backend/
- [x] 1.4 Configure ESLint, Prettier, and TypeScript strict mode for both frontend and backend
- [x] 1.5 Set up Prisma ORM with PostgreSQL connection and initial schema file
- [x] 1.6 Configure Redis client (ioredis) in backend
- [x] 1.7 Create .env.example with all required environment variables documented
- [x] 1.8 Set up Winston logger with structured JSON output and request logging middleware
- [x] 1.9 Set up Prometheus metrics middleware (prom-client) and expose /metrics endpoint
- [x] 1.10 Create /health endpoint returning service status for database and Redis

## Task 2: Database Schema and Migrations
- [x] 2.1 Define Prisma schema for users, oauth_accounts, and refresh_tokens tables
- [x] 2.2 Define Prisma schema for addresses table with PIN code validation
- [x] 2.3 Define Prisma schema for categories and products tables with full-text search vector
- [x] 2.4 Define Prisma schema for product_images and reviews tables
- [x] 2.5 Define Prisma schema for carts and cart_items tables
- [x] 2.6 Define Prisma schema for coupons and delivery_slots tables
- [x] 2.7 Define Prisma schema for orders, order_items, and order_status_history tables
- [x] 2.8 Define Prisma schema for wishlists, device_tokens, and banners tables
- [x] 2.9 Define Prisma schema for subscription_plans, user_subscriptions, loyalty_points, and delivery_partner_locations tables
- [x] 2.10 Create PostgreSQL trigger to auto-update products.search_vector on insert/update
- [x] 2.11 Create all database indexes as defined in the design document
- [x] 2.12 Run initial migration and verify schema in development database

## Task 3: Seed Data Script
- [x] 3.1 Create prisma/seed.ts with 5 categories (Fruits, Vegetables, Dairy, Snacks, Beverages)
- [x] 3.2 Seed 50 products distributed across the 5 categories with images, prices, and stock
- [x] 3.3 Seed 2 admin accounts and 5 customer accounts with hashed passwords
- [x] 3.4 Seed 1 delivery partner account
- [x] 3.5 Seed delivery slots for the next 7 days with multiple time windows
- [x] 3.6 Seed 3 sample coupons (percentage, fixed, and expired)
- [x] 3.7 Seed 3 promotional banners
- [x] 3.8 Seed 1 subscription plan
- [x] 3.9 Add referential integrity verification and rollback on seed failure
- [x] 3.10 Add seed summary log output (counts per table)

## Task 4: Authentication Service
- [x] 4.1 Implement POST /api/auth/register with email/password, bcrypt hashing (cost 12), JWT issuance
- [x] 4.2 Implement POST /api/auth/register/phone - generate OTP, store hash in Redis with 5-min TTL, send via Twilio
- [x] 4.3 Implement POST /api/auth/register/phone/verify - validate OTP, complete registration
- [x] 4.4 Implement POST /api/auth/login with email/password, return access token (15 min) + refresh token (7 days)
- [x] 4.5 Implement POST /api/auth/login/social with Passport.js Google and Facebook OAuth strategies
- [x] 4.6 Implement POST /api/auth/refresh - validate refresh token hash, rotate token, issue new access token
- [x] 4.7 Implement POST /api/auth/logout - delete refresh token from database
- [x] 4.8 Implement POST /api/auth/password/reset - send reset email with 1-hour expiry token
- [x] 4.9 Implement POST /api/auth/password/reset/confirm - validate token, update password hash
- [x] 4.10 Create JWT authentication middleware for protected routes
- [x] 4.11 Create RBAC middleware for role-based access control (customer/admin/delivery_partner)
- [x] 4.12 Implement rate limiting on auth endpoints (10 req/IP/15 min via express-rate-limit + Redis)
- [x] 4.13 Write unit tests for all auth endpoints covering success, invalid input, and expired token cases

## Task 5: User Profile and Address Management
- [x] 5.1 Implement GET /api/users/me - return authenticated user profile
- [x] 5.2 Implement PATCH /api/users/me - update name, email (with verification email), phone
- [x] 5.3 Implement GET /api/users/me/addresses - list user addresses
- [x] 5.4 Implement POST /api/users/me/addresses - add address with PIN code validation
- [x] 5.5 Implement PUT /api/users/me/addresses/:id - update address
- [x] 5.6 Implement DELETE /api/users/me/addresses/:id - delete address (preserve in order history)
- [x] 5.7 Implement PATCH /api/users/me/addresses/:id/default - set default address
- [x] 5.8 Enforce maximum 10 addresses per user
- [x] 5.9 Write unit tests for profile and address endpoints

## Task 6: Product and Category Service
- [x] 6.1 Implement GET /api/categories - list active categories with Redis caching (5 min TTL)
- [x] 6.2 Implement GET /api/products - paginated product listing with filters (price, category, rating, brand) and sort
- [x] 6.3 Implement full-text search using PostgreSQL pg_trgm with auto-suggestions (GET /api/products?q=)
- [x] 6.4 Implement GET /api/products/featured - featured products with Redis caching
- [x] 6.5 Implement GET /api/products/deals - deals of the day sorted by discount, with Redis caching
- [x] 6.6 Implement GET /api/products/:slug - product detail with images, reviews summary
- [x] 6.7 Implement GET /api/products/:id/reviews - paginated reviews
- [x] 6.8 Implement POST /api/products/:id/reviews - submit review with verified purchase check and duplicate prevention
- [x] 6.9 Implement GET /api/recommendations - personalized recommendations using precomputed Redis cache
- [x] 6.10 Write unit tests for product search, filtering, and sorting logic

## Task 7: Cart Service
- [x] 7.1 Implement GET /api/cart - return cart with items, subtotal, and saved-for-later list
- [x] 7.2 Implement POST /api/cart/items - add item, increment if exists, cap at stock quantity
- [x] 7.3 Implement PATCH /api/cart/items/:id - update quantity, remove if quantity = 0
- [x] 7.4 Implement DELETE /api/cart/items/:id - remove item from cart
- [x] 7.5 Implement POST /api/cart/items/:id/save-later - move item to saved-for-later
- [x] 7.6 Implement POST /api/cart/items/:id/move-to-cart - move item back to active cart
- [x] 7.7 Implement POST /api/cart/coupon - validate and apply coupon code
- [x] 7.8 Implement DELETE /api/cart/coupon - remove applied coupon, recalculate total
- [x] 7.9 Persist cart across sessions (DB-backed, not session-only)
- [x] 7.10 Write property-based tests for cart subtotal consistency (P1) and stock non-negativity (P2)

## Task 8: Order Service and Checkout
- [x] 8.1 Implement GET /api/orders/delivery-slots - available slots for next 7 days
- [x] 8.2 Implement POST /api/orders - place order with address, slot, payment method validation
- [x] 8.3 Implement order total calculation: subtotal - discount + delivery_fee + tax
- [x] 8.4 Implement stock decrement on order confirmation with optimistic locking to prevent oversell
- [x] 8.5 Implement delivery slot capacity enforcement with database-level locking
- [x] 8.6 Implement GET /api/orders - paginated order history (10 per page, newest first)
- [x] 8.7 Implement GET /api/orders/:id - full order detail
- [x] 8.8 Implement POST /api/orders/:id/reorder - add past order items to cart, skip out-of-stock
- [x] 8.9 Implement GET /api/orders/:id/tracking - return status, delivery partner info, location
- [x] 8.10 Record order status history on every status change
- [x] 8.11 Write property-based tests for order total integrity (P4) and delivery slot capacity (P7)

## Task 9: Payment Integration
- [x] 9.1 Implement POST /api/payments/initiate - create Razorpay order, return order details to frontend
- [x] 9.2 Implement HMAC-SHA256 signature verification for Razorpay payment confirmation
- [x] 9.3 Implement POST /api/payments/webhook - idempotent webhook handler with signature verification
- [x] 9.4 Implement COD order flow (no payment initiation, status: confirmed)
- [x] 9.5 Implement GET /api/payments/:orderId/status - return payment status
- [x] 9.6 Handle payment failure: return error with retry option, do not create order
- [x] 9.7 Write unit tests for payment signature verification and webhook idempotency

## Task 10: Admin Panel APIs
- [x] 10.1 Implement GET /api/admin/dashboard - daily/weekly/monthly orders, revenue, new customers, top 10 products
- [x] 10.2 Implement full CRUD for products: GET, POST, PUT, DELETE (soft-delete) with image upload presigned URL
- [x] 10.3 Implement real-time stock update broadcast via Socket.io when admin updates stock to 0
- [x] 10.4 Implement category management: create, rename, deactivate (hides products)
- [x] 10.5 Implement GET /api/admin/orders with filters (status, date range, customer name/email), 20 per page
- [x] 10.6 Implement PATCH /api/admin/orders/:id/status with status history recording and customer notification
- [x] 10.7 Implement POST /api/admin/orders/:id/assign - assign delivery partner (active partners only)
- [x] 10.8 Implement order cancellation with mandatory reason (not allowed if status = Delivered)
- [x] 10.9 Implement coupon CRUD with validation (code format, percentage 1-100, date range)
- [x] 10.10 Implement banner management CRUD
- [x] 10.11 Write unit tests for admin dashboard aggregation queries

## Task 11: Delivery Partner Service
- [x] 11.1 Implement GET /api/delivery/orders - assigned orders with status Shipped or Out for Delivery
- [x] 11.2 Implement PATCH /api/delivery/orders/:id/status - update to Out for Delivery or Delivered
- [x] 11.3 Enforce that delivery partner can only update orders assigned to them (HTTP 403 otherwise)
- [x] 11.4 Record delivered_at timestamp when order marked as Delivered
- [x] 11.5 Implement POST /api/delivery/location - update GPS coordinates in delivery_partner_locations
- [x] 11.6 Broadcast location update via Socket.io to order:{orderId} room
- [x] 11.7 Write unit tests for delivery partner authorization enforcement

## Task 12: Real-Time Features (Socket.io)
- [x] 12.1 Set up Socket.io server with JWT authentication on handshake
- [x] 12.2 Implement room management: user:{userId}, order:{orderId}, admin, inventory:{productId}
- [x] 12.3 Configure @socket.io/redis-adapter for horizontal scaling
- [x] 12.4 Implement inventory:update event broadcast when product stock changes
- [x] 12.5 Implement order:status event broadcast on order status change
- [x] 12.6 Implement delivery:location event broadcast every 15 seconds from delivery partner location updates
- [x] 12.7 Implement cart:conflict event when product goes out of stock while in customer cart
- [x] 12.8 Implement ETA calculation for delivery tracking based on distance and average speed
- [x] 12.9 Handle stale location indicator when no update received for > 60 seconds
- [x] 12.10 Implement auto-reconnect logic on client side with exponential backoff

## Task 13: Notification Service
- [x] 13.1 Set up Redis pub/sub notification worker
- [x] 13.2 Implement FCM push notification sending for mobile devices
- [x] 13.3 Implement Web Push API notification sending with VAPID keys for browsers
- [x] 13.4 Implement email notifications via Nodemailer + AWS SES (order confirmation, delivery)
- [x] 13.5 Implement SMS via Twilio for OTP and out-for-delivery alerts
- [x] 13.6 Implement POST /api/notifications/device-token - register/update device token
- [x] 13.7 Implement DELETE /api/notifications/device-token - unregister token
- [x] 13.8 Implement PATCH /api/notifications/preferences - update notification opt-in/out per channel
- [x] 13.9 Auto-remove stale FCM tokens on InvalidRegistration response
- [x] 13.10 Write unit tests for notification routing logic

## Task 14: Wishlist and Restock Notifications
- [x] 14.1 Implement GET /api/wishlist - return wishlist with current price, discount, stock status
- [x] 14.2 Implement POST /api/wishlist - add product (idempotent, no duplicates)
- [x] 14.3 Implement DELETE /api/wishlist/:productId - remove from wishlist
- [x] 14.4 Implement POST /api/wishlist/:productId/move-to-cart - move to active cart
- [x] 14.5 Trigger restock push notification when wishlisted product stock goes from 0 to > 0
- [x] 14.6 Write property-based test for wishlist uniqueness invariant (P10)

## Task 15: Subscription Plans and Loyalty Program
- [x] 15.1 Implement GET /api/subscriptions/plans - list active plans
- [x] 15.2 Implement POST /api/subscriptions - initiate recurring billing with Razorpay, store subscription
- [x] 15.3 Apply subscription delivery-fee waiver and order discount at checkout
- [x] 15.4 Handle subscription renewal failure: notify customer, apply 3-day grace period
- [x] 15.5 Implement loyalty points credit on order confirmation (1 point per currency unit)
- [x] 15.6 Implement loyalty points redemption at checkout (max 20% of order total)
- [x] 15.7 Implement loyalty points debit on order cancellation
- [x] 15.8 Implement GET /api/loyalty/balance and GET /api/loyalty/history (20 per page)
- [x] 15.9 Write property-based tests for loyalty points non-negativity (P8)

## Task 16: AI Recommendation Engine
- [x] 16.1 Implement browsing event tracking (product views, category visits) stored in Redis
- [x] 16.2 Implement nightly cron job to compute item-based collaborative filtering similarity matrix
- [x] 16.3 Implement per-user recommendation generation and caching in Redis (30 min TTL)
- [x] 16.4 Implement cold-start fallback: top-selling by category or globally
- [x] 16.5 Filter out-of-stock products from all recommendation results at query time
- [x] 16.6 Refresh recommendations on new order placement
- [x] 16.7 Expose recommendations via GET /api/recommendations (homepage) and product detail page

## Task 17: Frontend - Core Layout and Navigation
- [x] 17.1 Create root layout with Navbar (search bar, cart icon, user menu), Footer, and theme provider
- [x] 17.2 Implement dark mode toggle with localStorage persistence and OS preference detection
- [x] 17.3 Implement language switcher (English / Hindi) with next-i18next and localStorage persistence
- [x] 17.4 Create responsive mobile-first navigation with hamburger menu for mobile
- [x] 17.5 Set up Zustand stores for cart state, auth state, and UI state
- [x] 17.6 Set up API client (axios/fetch wrapper) with JWT token injection and refresh interceptor
- [x] 17.7 Set up Socket.io client with auto-reconnect and JWT handshake

## Task 18: Frontend - Authentication Pages
- [x] 18.1 Build signup page with email/password form and Zod client-side validation
- [x] 18.2 Build phone OTP registration flow with OTP input component and countdown timer
- [x] 18.3 Build login page with email/password and social login buttons (Google, Facebook)
- [x] 18.4 Build password reset request and confirm pages
- [x] 18.5 Implement protected route HOC/middleware redirecting unauthenticated users to login
- [x] 18.6 Implement auth state persistence with token refresh on page load

## Task 19: Frontend - Homepage
- [x] 19.1 Build banner carousel component with auto-play, touch swipe, and pause on hover
- [x] 19.2 Build category grid component with icons/images and navigation on click
- [x] 19.3 Build featured products horizontal scroll section
- [x] 19.4 Build deals of the day section with countdown timer per deal
- [x] 19.5 Implement homepage data fetching with Next.js SSR for SEO
- [x] 19.6 Implement skeleton loading states for all homepage sections

## Task 20: Frontend - Product Browsing and Search
- [x] 20.1 Build product listing page with grid layout, pagination, and URL-based filter state
- [x] 20.2 Build search bar with debounced auto-suggestions dropdown (300ms, min 2 chars)
- [x] 20.3 Build filter sidebar with price range slider, category checkboxes, rating filter, brand filter
- [x] 20.4 Build sort dropdown (price asc/desc, rating, newest)
- [x] 20.5 Build product card component with image, name, price, discount badge, add-to-cart button
- [x] 20.6 Show "No products found" state with category suggestions
- [x] 20.7 Implement real-time stock status update on product cards via Socket.io inventory:update event

## Task 21: Frontend - Product Detail Page
- [x] 21.1 Build product image gallery with thumbnail navigation and zoom
- [x] 21.2 Display product name, price, discount, brand, category, description
- [x] 21.3 Display stock status (In Stock / Out of Stock / Only N left)
- [x] 21.4 Build add-to-cart and add-to-wishlist buttons with quantity selector
- [x] 21.5 Build reviews section with star rating display, verified purchase badge, and review form
- [x] 21.6 Build recommendations section (Customers also bought / Similar products)
- [x] 21.7 Implement Next.js SSG/ISR for product detail pages for performance

## Task 22: Frontend - Cart and Checkout
- [x] 22.1 Build cart page with item list, quantity controls, remove button, and subtotal
- [x] 22.2 Build saved-for-later section with move-to-cart action
- [x] 22.3 Build coupon input with validation feedback and applied discount display
- [x] 22.4 Show cart conflict warning when item goes out of stock (via Socket.io cart:conflict event)
- [x] 22.5 Build checkout page: address selection/add, delivery slot picker, payment method selector
- [x] 22.6 Build order summary panel with itemized breakdown (subtotal, discount, delivery, tax, total)
- [x] 22.7 Integrate Razorpay checkout modal for UPI/card payments
- [x] 22.8 Handle payment success (redirect to order confirmation) and failure (retry option)
- [x] 22.9 Build order confirmation page with order ID and estimated delivery

## Task 23: Frontend - Order Tracking and History
- [x] 23.1 Build order history page with paginated list and reorder button
- [x] 23.2 Build order detail page with status timeline, items, address, and delivery info
- [x] 23.3 Build real-time order tracking view with map (Leaflet.js or Google Maps) showing delivery partner location
- [x] 23.4 Display ETA and update every 15 seconds via Socket.io delivery:location event
- [x] 23.5 Show "Location temporarily unavailable" when no update for > 60 seconds
- [x] 23.6 Subscribe to order:status Socket.io events and update status timeline in real time

## Task 24: Frontend - Profile, Wishlist, and Notifications
- [x] 24.1 Build profile page with editable name, email, phone fields
- [x] 24.2 Build address management UI (list, add, edit, delete, set default)
- [x] 24.3 Build wishlist page with product cards showing current price and stock status
- [x] 24.4 Build loyalty points balance and history page
- [x] 24.5 Build subscription plan selection and management page
- [x] 24.6 Implement push notification permission request on first login
- [x] 24.7 Register Service Worker and FCM device token on permission grant

## Task 25: Frontend - Admin Panel
- [x] 25.1 Build admin dashboard with KPI cards (orders, revenue, customers) and revenue line chart (Recharts)
- [x] 25.2 Build product management table with search, add/edit/delete product modal and image upload
- [x] 25.3 Build category management UI (create, rename, activate/deactivate)
- [x] 25.4 Build order management table with filters, status update dropdown, and delivery partner assignment
- [x] 25.5 Build coupon management UI (create, edit, view usage stats)
- [x] 25.6 Build banner management UI (create, edit, reorder)
- [x] 25.7 Build user management table (view, activate/deactivate)
- [x] 25.8 Protect all admin routes with role-based redirect

## Task 26: Frontend - Delivery Partner App
- [x] 26.1 Build delivery partner login page
- [x] 26.2 Build assigned orders list sorted by delivery slot
- [x] 26.3 Build order detail view with status update buttons (Out for Delivery, Delivered)
- [x] 26.4 Implement GPS location tracking and periodic POST /api/delivery/location (every 15 sec)
- [x] 26.5 Protect delivery partner routes with role-based redirect

## Task 27: PWA Configuration
- [x] 27.1 Configure next-pwa with Workbox for Service Worker generation
- [x] 27.2 Create Web App Manifest (manifest.json) with app name, icons, theme color, standalone display
- [x] 27.3 Configure Workbox caching strategies: cache-first for static assets, network-first for API
- [x] 27.4 Implement offline fallback page for previously uncached routes
- [x] 27.5 Verify Lighthouse PWA audit score >= 80

## Task 28: Image Storage Integration (AWS S3 + CloudFront)
- [x] 28.1 Configure AWS S3 bucket with private access and versioning
- [x] 28.2 Implement presigned URL generation endpoint for admin image uploads
- [x] 28.3 Configure CloudFront distribution with S3 origin and cache headers
- [x] 28.4 Validate uploaded file type (JPEG/PNG/WebP) and size (max 5 MB) on backend
- [x] 28.5 Use Next.js Image component with CloudFront CDN URLs for optimized delivery

## Task 29: Security Hardening
- [x] 29.1 Configure helmet.js with CSP, X-Content-Type-Options, X-Frame-Options, HSTS headers
- [x] 29.2 Implement Zod validation schemas for all API request bodies, query params, and path params
- [x] 29.3 Implement CSRF protection with SameSite=Strict cookies and double-submit token pattern
- [x] 29.4 Sanitize all user-generated content with sanitize-html on backend and DOMPurify on frontend
- [x] 29.5 Enforce HTTPS redirect in Nginx configuration
- [x] 29.6 Configure CORS to allow only trusted frontend origins
- [x] 29.7 Implement upload rate limiting (10 req/user/hour)
- [x] 29.8 Write property-based tests for JWT role isolation (P5) and refresh token single-use (P6)

## Task 30: Testing Suite
- [x] 30.1 Write unit tests for all backend service modules (auth, products, cart, orders, payments) targeting >= 80% coverage
- [x] 30.2 Write integration tests for all API endpoints using supertest
- [x] 30.3 Write Playwright end-to-end tests: registration -> login -> browse -> add to cart -> checkout -> order confirmation -> order tracking
- [x] 30.4 Write property-based tests using fast-check for all 10 correctness properties (P1-P10)
- [x] 30.5 Write UI responsiveness tests verifying layout at 320px, 768px, 1024px, 1440px
- [x] 30.6 Create Postman collection covering all API endpoints with example requests and assertions
- [x] 30.7 Configure Jest coverage reporting and fail CI if coverage drops below 80%

## Task 31: CI/CD Pipeline
- [x] 31.1 Create .github/workflows/ci.yml with lint, type-check, unit-test, e2e-test, api-contract, and build stages
- [ ] 31.2 Create .github/workflows/deploy.yml with staging auto-deploy and production manual approval gate
- [x] 31.3 Configure Spectral for OpenAPI spec linting in CI pipeline
- [x] 31.4 Configure Dredd or Playwright API tests for contract testing against running instance
- [x] 31.5 Add database migration step (prisma migrate deploy) before backend deployment
- [x] 31.6 Configure Slack/email deployment notification on successful deploy
- [x] 31.7 Document rollback procedure for frontend (Vercel) and backend (ECS blue/green)

## Task 32: Production Deployment Configuration
- [x] 32.1 Create Dockerfile for backend with multi-stage build (build + production stages)
- [x] 32.2 Create docker-compose.yml for local development (postgres, redis, backend, frontend)
- [x] 32.3 Configure AWS ECS task definition and service for backend deployment
- [x] 32.4 Configure Vercel project settings for frontend deployment with environment variables
- [x] 32.5 Configure AWS RDS PostgreSQL instance with connection pooling (PgBouncer)
- [x] 32.6 Configure AWS ElastiCache Redis cluster
- [x] 32.7 Configure Nginx reverse proxy with SSL termination, rate limiting, and load balancing
- [x] 32.8 Set up AWS CloudWatch log groups and metric alarms
- [x] 32.9 Configure separate .env files for development, staging, and production environments
- [x] 32.10 Validate that missing required environment variables cause startup failure with descriptive error

## Task 33: Documentation
- [x] 33.1 Write OpenAPI 3.0 specification (docs/openapi.yaml) covering all endpoints with request/response schemas and examples
- [x] 33.2 Write database schema documentation (docs/database-schema.md) with ER diagram description
- [x] 33.3 Write setup instructions (docs/setup.md) covering clean-system setup from zero to running locally
- [x] 33.4 Write deployment guide (docs/deployment.md) with AWS and Vercel deployment steps and rollback procedure
- [x] 33.5 Write QA checklist (docs/qa-checklist.md) mapping each requirement to its test coverage
- [x] 33.6 Write demo script (docs/demo-script.md) for demonstrating all major flows using seed data
- [x] 33.7 Write CHANGELOG with initial release features
- [x] 33.8 Write root README.md with project overview, tech stack, architecture summary, and links to all docs
- [x] 33.9 Add OpenAPI contract validation to CI pipeline (Spectral lint + Dredd endpoint tests)
- [x] 33.10 Add database schema drift detection to CI pipeline (compare migration state vs documented schema)
