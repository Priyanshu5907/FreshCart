# Database Schema Documentation

## Overview

FreshCart uses PostgreSQL 15 with Prisma ORM. The schema is organized into the following domains:

## Entity Relationship Summary

```
users ──< oauth_accounts
users ──< refresh_tokens
users ──< addresses ──< orders
users ──< carts ──< cart_items >── products
users ──< wishlists >── products
users ──< device_tokens
users ──< loyalty_points
users ──< user_subscriptions >── subscription_plans
categories ──< products ──< product_images
products ──< reviews
orders ──< order_items
orders ──< order_status_history
orders >── delivery_slots
orders >── coupons
delivery_partner_locations >── users
```

## Tables

### users
Core user table supporting all three roles (customer, admin, delivery_partner).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Auto-generated |
| email | VARCHAR(255) UNIQUE | Nullable (phone-only users) |
| phone | VARCHAR(20) UNIQUE | Nullable (email-only users) |
| password_hash | VARCHAR(255) | Nullable (OAuth users) |
| role | VARCHAR(20) | customer / admin / delivery_partner |
| name | VARCHAR(200) | Required |
| is_active | BOOLEAN | Default true |
| email_verified | BOOLEAN | Default false |
| phone_verified | BOOLEAN | Default false |
| language_pref | VARCHAR(10) | Default 'en' |
| theme_pref | VARCHAR(10) | Default 'light' |

**Indexes:** idx_users_email, idx_users_phone, idx_users_role

### products
Product catalog with full-text search support.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| category_id | UUID FK | → categories |
| name | VARCHAR(200) | |
| slug | VARCHAR(200) UNIQUE | URL-friendly identifier |
| price | DECIMAL(10,2) | Must be > 0 |
| discount_pct | DECIMAL(5,2) | 0–99.99 |
| stock_qty | INT | Must be >= 0 |
| is_featured | BOOLEAN | |
| is_active | BOOLEAN | |
| is_deleted | BOOLEAN | Soft delete flag |
| search_vector | TSVECTOR | Auto-updated by trigger |

**Indexes:** idx_products_category, idx_products_active, idx_products_featured (partial), idx_products_search (GIN), idx_products_price, idx_products_stock

### orders
Order records with full financial snapshot.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK | → users |
| address_id | UUID FK | → addresses |
| delivery_slot_id | UUID FK | → delivery_slots |
| delivery_partner_id | UUID FK | → users (nullable) |
| coupon_id | UUID FK | → coupons (nullable) |
| status | VARCHAR(30) | confirmed/processing/shipped/out_for_delivery/delivered/cancelled |
| payment_method | VARCHAR(20) | upi/card/cod |
| payment_status | VARCHAR(20) | pending/paid/failed |
| subtotal | DECIMAL(10,2) | |
| discount_amount | DECIMAL(10,2) | |
| delivery_fee | DECIMAL(10,2) | |
| tax_amount | DECIMAL(10,2) | |
| total | DECIMAL(10,2) | subtotal - discount + delivery_fee + tax_amount |

**Indexes:** idx_orders_user, idx_orders_status, idx_orders_created_desc, idx_orders_delivery_partner

## Full-Text Search

The `products.search_vector` column is automatically maintained by a PostgreSQL trigger (`trg_products_search_vector`) that fires on INSERT or UPDATE of `name`, `brand`, or `description`. The trigger uses weighted vectors:
- Weight A: product name
- Weight B: brand
- Weight C: description

The `pg_trgm` extension enables fuzzy matching for auto-suggestions.

## Manual Migrations

Some database features cannot be expressed in Prisma schema and require manual SQL:
- `prisma/migrations/manual/001_search_vector_trigger.sql` — pg_trgm extension, search_vector column, trigger
- `prisma/migrations/manual/002_additional_indexes.sql` — partial indexes, composite indexes
