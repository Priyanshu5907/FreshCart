# Changelog

All notable changes to FreshCart are documented here.

## [1.0.0] - 2026-05-13

### Initial Release

#### Backend
- **Authentication:** Email/password, phone OTP, Google/Facebook OAuth, JWT with refresh token rotation
- **Products:** Full-text search (pg_trgm), filtering, sorting, Redis caching
- **Cart:** DB-persisted cart, save-for-later, coupon validation
- **Orders:** Checkout with delivery slot booking, stock decrement with optimistic locking
- **Payments:** Razorpay integration (UPI/card/COD), HMAC webhook verification
- **Admin Panel:** Dashboard analytics, product/category/order/coupon/banner management
- **Delivery Partner:** Assigned order management, GPS location updates
- **Real-Time:** Socket.io with Redis adapter, inventory/order/location broadcasts
- **Notifications:** FCM push, Web Push (VAPID), email (Nodemailer), SMS (Twilio)
- **Wishlist:** Idempotent add, restock notifications
- **Subscriptions:** Recurring billing via Razorpay, delivery fee waiver
- **Loyalty Points:** 1 point per ₹1 spent, max 20% redemption per order
- **AI Recommendations:** Item-based collaborative filtering, cold-start fallback

#### Frontend
- **Next.js 14 App Router** with SSR/SSG/ISR
- **PWA** with Web App Manifest and offline fallback
- **Dark mode** with OS preference detection
- **Multi-language** (English/Hindi) with localStorage persistence
- **Real-time** stock updates, order tracking, cart conflict warnings
- **Responsive** mobile-first design (320px–2560px)
- **Admin Panel** with KPI dashboard, product/order/coupon management
- **Delivery Partner App** with GPS tracking

#### Infrastructure
- Docker multi-stage build for backend
- Docker Compose for local development
- GitHub Actions CI/CD pipeline
- Nginx reverse proxy with SSL, rate limiting
- AWS ECS + RDS + ElastiCache + S3 + CloudFront

#### Testing
- Unit tests for all backend services (Jest + Supertest)
- Property-based tests for all 10 correctness properties (P1–P10)
- Playwright E2E tests for main user flow
- UI responsiveness tests at 4 breakpoints
