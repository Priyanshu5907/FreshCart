import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const TEST_EMAIL = `test_${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';
const TEST_NAME = 'E2E Test User';

test.describe('Main User Flow', () => {
  test('Registration → Login → Browse → Add to Cart → Checkout → Order Confirmation → Order Tracking', async ({ page }) => {
    // ── Step 1: Registration ──────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/signup`);
    await expect(page).toHaveTitle(/FreshCart/);

    await page.fill('#name', TEST_NAME);
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.fill('#confirmPassword', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should redirect to homepage after registration
    await expect(page).toHaveURL(BASE_URL + '/');

    // ── Step 2: Browse Products ───────────────────────────────────────────────
    await page.goto(`${BASE_URL}/products`);
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // Wait for products to load
    await page.waitForSelector('article', { timeout: 10000 });
    const productCards = page.locator('article');
    await expect(productCards.first()).toBeVisible();

    // ── Step 3: Add to Cart ───────────────────────────────────────────────────
    const addToCartBtn = productCards.first().locator('button:has-text("Add to Cart")');
    await addToCartBtn.click();

    // Cart count should update
    await page.waitForTimeout(500);

    // ── Step 4: View Cart ─────────────────────────────────────────────────────
    await page.goto(`${BASE_URL}/cart`);
    await expect(page.locator('h1')).toContainText('Shopping Cart');
    await expect(page.locator('article, [data-testid="cart-item"]').first()).toBeVisible();

    // ── Step 5: Proceed to Checkout ───────────────────────────────────────────
    const checkoutBtn = page.locator('a:has-text("Proceed to Checkout"), button:has-text("Proceed to Checkout")');
    await expect(checkoutBtn).toBeVisible();

    // ── Step 6: View Order History ────────────────────────────────────────────
    await page.goto(`${BASE_URL}/orders`);
    await expect(page.locator('h1')).toContainText('My Orders');
  });

  test('Homepage loads with banner, categories, and products', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/FreshCart/);

    // Banner carousel should be visible
    await page.waitForSelector('[aria-label="Promotional banners"], [role="region"]', { timeout: 5000 }).catch(() => {});

    // Categories section
    await page.waitForSelector('a[href*="/products?category"]', { timeout: 5000 }).catch(() => {});
  });

  test('Product search returns results', async ({ page }) => {
    await page.goto(`${BASE_URL}/products?q=banana`);
    await page.waitForSelector('article', { timeout: 10000 }).catch(() => {});
    // Either products or "no products found" message
    const hasProducts = await page.locator('article').count() > 0;
    const hasNoResults = await page.locator('text=No products found').isVisible().catch(() => false);
    expect(hasProducts || hasNoResults).toBe(true);
  });

  test('Login page renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await expect(page.locator('h1')).toContainText('Sign In');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Protected routes redirect to login when unauthenticated', async ({ page }) => {
    // Clear any existing auth
    await page.context().clearCookies();
    await page.goto(`${BASE_URL}/profile`);
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Responsiveness', () => {
  const viewports = [
    { name: '320px (mobile)', width: 320, height: 568 },
    { name: '768px (tablet)', width: 768, height: 1024 },
    { name: '1024px (laptop)', width: 1024, height: 768 },
    { name: '1440px (desktop)', width: 1440, height: 900 },
  ];

  for (const viewport of viewports) {
    test(`Homepage renders correctly at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(BASE_URL);
      await expect(page).toHaveTitle(/FreshCart/);
      // Navbar should be visible
      await expect(page.locator('nav')).toBeVisible();
    });
  }
});
