# Demo Script

This script demonstrates all major flows using the seed data.

## Setup

Start the app locally and seed the database:
```bash
docker-compose up postgres redis -d
npm install && npm run dev
cd backend && npm run db:seed
```

## Flow 1: Customer Registration & Login

1. Open http://localhost:3000
2. Click **Login** → **Sign up**
3. Register with: name=`Demo User`, email=`demo@example.com`, password=`Password123!`
4. Or login with seed account: `alice@example.com` / `Password123!`

## Flow 2: Browse & Search

1. Homepage shows banner carousel, category grid, featured products, deals
2. Click **Fruits** category → filtered product listing
3. Search for "banana" in the search bar → auto-suggestions appear after 2 chars
4. Apply price filter: max ₹100 → filtered results
5. Sort by "Price: Low to High"

## Flow 3: Product Detail

1. Click on **Fresh Bananas** product card
2. View images, price (₹49, 10% off → ₹44), stock status
3. Select quantity 2 → click **Add to Cart**
4. Click **♡** to add to wishlist

## Flow 4: Cart & Coupon

1. Navigate to **Cart** (🛒 icon)
2. See items with quantity controls
3. Enter coupon code `WELCOME10` → 10% discount applied
4. See updated total
5. Move one item to **Saved for Later**

## Flow 5: Checkout & Order

1. Click **Proceed to Checkout**
2. Select delivery address (or add new)
3. Select delivery slot (e.g., Today 9 AM – 12 PM)
4. Select **Cash on Delivery**
5. Click **Place Order** → Order confirmation page with order ID

## Flow 6: Order Tracking

1. Go to **My Orders**
2. Click on the order → status timeline
3. Click **Track Order** → real-time tracking view

## Flow 7: Admin Panel

1. Login as `admin@freshcart.com` / `Password123!`
2. Navigate to http://localhost:3000/admin
3. Dashboard shows KPI cards and revenue chart
4. Go to **Products** → add a new product with image upload
5. Go to **Orders** → update order status to "Processing"
6. Go to **Coupons** → create a new coupon `DEMO20`

## Flow 8: Delivery Partner

1. Login as `delivery@freshcart.com` / `Password123!`
2. Navigate to http://localhost:3000/delivery
3. See assigned orders sorted by delivery slot
4. Click an order → update status to "Out for Delivery"
5. Location tracking starts (GPS permission required)
