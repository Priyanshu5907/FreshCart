import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Categories ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { name: 'Fruits', slug: 'fruits', imageUrl: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?w=400', sortOrder: 1 },
  { name: 'Vegetables', slug: 'vegetables', imageUrl: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400', sortOrder: 2 },
  { name: 'Dairy', slug: 'dairy', imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400', sortOrder: 3 },
  { name: 'Snacks', slug: 'snacks', imageUrl: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400', sortOrder: 4 },
  { name: 'Beverages', slug: 'beverages', imageUrl: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400', sortOrder: 5 },
];

// ── Products (10 per category = 50 total) ─────────────────────────────────────

const PRODUCTS_BY_CATEGORY: Record<string, Array<{
  name: string; slug: string; description: string; brand: string;
  price: number; discountPct: number; stockQty: number; isFeatured: boolean;
}>> = {
  fruits: [
    { name: 'Fresh Bananas', slug: 'fresh-bananas', description: 'Sweet and ripe bananas, perfect for snacking.', brand: 'FarmFresh', price: 49, discountPct: 10, stockQty: 200, isFeatured: true },
    { name: 'Red Apples', slug: 'red-apples', description: 'Crisp and juicy red apples from Himachal Pradesh.', brand: 'HillFarm', price: 120, discountPct: 5, stockQty: 150, isFeatured: true },
    { name: 'Alphonso Mangoes', slug: 'alphonso-mangoes', description: 'Premium Alphonso mangoes from Ratnagiri.', brand: 'Ratnagiri Gold', price: 350, discountPct: 15, stockQty: 80, isFeatured: true },
    { name: 'Seedless Grapes', slug: 'seedless-grapes', description: 'Sweet green seedless grapes.', brand: 'FarmFresh', price: 89, discountPct: 0, stockQty: 120, isFeatured: false },
    { name: 'Watermelon', slug: 'watermelon', description: 'Large sweet watermelon, perfect for summer.', brand: 'NatureBest', price: 79, discountPct: 20, stockQty: 50, isFeatured: false },
    { name: 'Papaya', slug: 'papaya', description: 'Ripe and sweet papaya rich in vitamins.', brand: 'FarmFresh', price: 65, discountPct: 0, stockQty: 90, isFeatured: false },
    { name: 'Pomegranate', slug: 'pomegranate', description: 'Fresh pomegranates packed with antioxidants.', brand: 'HillFarm', price: 149, discountPct: 10, stockQty: 70, isFeatured: false },
    { name: 'Kiwi', slug: 'kiwi', description: 'Imported kiwi fruits, rich in Vitamin C.', brand: 'GlobalFresh', price: 199, discountPct: 5, stockQty: 60, isFeatured: false },
    { name: 'Strawberries', slug: 'strawberries', description: 'Fresh strawberries from Mahabaleshwar.', brand: 'BerryFarm', price: 129, discountPct: 0, stockQty: 40, isFeatured: true },
    { name: 'Pineapple', slug: 'pineapple', description: 'Sweet and tangy pineapple from Kerala.', brand: 'TropicFresh', price: 89, discountPct: 0, stockQty: 55, isFeatured: false },
  ],
  vegetables: [
    { name: 'Tomatoes', slug: 'tomatoes', description: 'Fresh red tomatoes, perfect for cooking.', brand: 'FarmFresh', price: 39, discountPct: 0, stockQty: 300, isFeatured: true },
    { name: 'Onions', slug: 'onions', description: 'Fresh red onions, essential kitchen staple.', brand: 'FarmFresh', price: 29, discountPct: 0, stockQty: 400, isFeatured: false },
    { name: 'Potatoes', slug: 'potatoes', description: 'Fresh potatoes from Punjab farms.', brand: 'PunjabFarm', price: 35, discountPct: 5, stockQty: 350, isFeatured: false },
    { name: 'Spinach', slug: 'spinach', description: 'Fresh organic spinach leaves.', brand: 'OrganicGreen', price: 29, discountPct: 0, stockQty: 100, isFeatured: false },
    { name: 'Broccoli', slug: 'broccoli', description: 'Fresh broccoli florets, rich in nutrients.', brand: 'NatureBest', price: 79, discountPct: 10, stockQty: 80, isFeatured: true },
    { name: 'Carrots', slug: 'carrots', description: 'Crunchy orange carrots from Ooty.', brand: 'HillFarm', price: 45, discountPct: 0, stockQty: 200, isFeatured: false },
    { name: 'Capsicum', slug: 'capsicum', description: 'Colorful bell peppers, great for salads.', brand: 'FarmFresh', price: 69, discountPct: 15, stockQty: 90, isFeatured: false },
    { name: 'Cauliflower', slug: 'cauliflower', description: 'Fresh white cauliflower head.', brand: 'FarmFresh', price: 49, discountPct: 0, stockQty: 120, isFeatured: false },
    { name: 'Green Peas', slug: 'green-peas', description: 'Fresh green peas, perfect for curries.', brand: 'FarmFresh', price: 59, discountPct: 0, stockQty: 150, isFeatured: false },
    { name: 'Cucumber', slug: 'cucumber', description: 'Cool and refreshing cucumbers.', brand: 'NatureBest', price: 25, discountPct: 0, stockQty: 180, isFeatured: false },
  ],
  dairy: [
    { name: 'Full Cream Milk 1L', slug: 'full-cream-milk-1l', description: 'Fresh full cream milk, pasteurized and homogenized.', brand: 'Amul', price: 68, discountPct: 0, stockQty: 500, isFeatured: true },
    { name: 'Paneer 200g', slug: 'paneer-200g', description: 'Fresh cottage cheese made from pure milk.', brand: 'Amul', price: 89, discountPct: 5, stockQty: 200, isFeatured: true },
    { name: 'Curd 400g', slug: 'curd-400g', description: 'Thick and creamy set curd.', brand: 'Mother Dairy', price: 45, discountPct: 0, stockQty: 300, isFeatured: false },
    { name: 'Butter 100g', slug: 'butter-100g', description: 'Salted butter made from fresh cream.', brand: 'Amul', price: 55, discountPct: 0, stockQty: 250, isFeatured: false },
    { name: 'Cheese Slices 200g', slug: 'cheese-slices-200g', description: 'Processed cheese slices for sandwiches.', brand: 'Amul', price: 99, discountPct: 10, stockQty: 150, isFeatured: false },
    { name: 'Ghee 500ml', slug: 'ghee-500ml', description: 'Pure cow ghee, traditionally churned.', brand: 'Patanjali', price: 299, discountPct: 5, stockQty: 100, isFeatured: true },
    { name: 'Lassi 200ml', slug: 'lassi-200ml', description: 'Sweet mango lassi, chilled and refreshing.', brand: 'Amul', price: 30, discountPct: 0, stockQty: 200, isFeatured: false },
    { name: 'Cream 200ml', slug: 'cream-200ml', description: 'Fresh cooking cream for gravies and desserts.', brand: 'Amul', price: 65, discountPct: 0, stockQty: 120, isFeatured: false },
    { name: 'Flavored Milk 200ml', slug: 'flavored-milk-200ml', description: 'Chocolate flavored milk drink.', brand: 'Amul', price: 25, discountPct: 0, stockQty: 300, isFeatured: false },
    { name: 'Skimmed Milk Powder 500g', slug: 'skimmed-milk-powder-500g', description: 'Low-fat skimmed milk powder.', brand: 'Nestle', price: 249, discountPct: 8, stockQty: 80, isFeatured: false },
  ],
  snacks: [
    { name: 'Lay\'s Classic Salted 52g', slug: 'lays-classic-salted-52g', description: 'Classic salted potato chips.', brand: 'Lay\'s', price: 20, discountPct: 0, stockQty: 500, isFeatured: false },
    { name: 'Kurkure Masala Munch 90g', slug: 'kurkure-masala-munch-90g', description: 'Crunchy corn puffs with masala flavor.', brand: 'Kurkure', price: 20, discountPct: 0, stockQty: 400, isFeatured: false },
    { name: 'Biscuits Parle-G 800g', slug: 'biscuits-parle-g-800g', description: 'Classic glucose biscuits, family pack.', brand: 'Parle', price: 65, discountPct: 5, stockQty: 300, isFeatured: true },
    { name: 'Dark Fantasy Choco Fills 75g', slug: 'dark-fantasy-choco-fills-75g', description: 'Chocolate filled cookies.', brand: 'Sunfeast', price: 35, discountPct: 0, stockQty: 250, isFeatured: false },
    { name: 'Haldiram\'s Bhujia 400g', slug: 'haldirams-bhujia-400g', description: 'Crispy and spicy bhujia namkeen.', brand: 'Haldiram\'s', price: 120, discountPct: 10, stockQty: 200, isFeatured: true },
    { name: 'Maggi Noodles 70g', slug: 'maggi-noodles-70g', description: '2-minute masala noodles.', brand: 'Maggi', price: 14, discountPct: 0, stockQty: 600, isFeatured: false },
    { name: 'Pringles Original 107g', slug: 'pringles-original-107g', description: 'Original flavor stackable chips.', brand: 'Pringles', price: 149, discountPct: 15, stockQty: 150, isFeatured: false },
    { name: 'Oreo Cookies 120g', slug: 'oreo-cookies-120g', description: 'Classic chocolate sandwich cookies.', brand: 'Oreo', price: 55, discountPct: 0, stockQty: 300, isFeatured: false },
    { name: 'Roasted Almonds 200g', slug: 'roasted-almonds-200g', description: 'Lightly salted roasted almonds.', brand: 'Happilo', price: 299, discountPct: 20, stockQty: 100, isFeatured: true },
    { name: 'Popcorn Butter 100g', slug: 'popcorn-butter-100g', description: 'Ready-to-eat butter popcorn.', brand: 'Act II', price: 30, discountPct: 0, stockQty: 200, isFeatured: false },
  ],
  beverages: [
    { name: 'Coca-Cola 750ml', slug: 'coca-cola-750ml', description: 'Classic Coca-Cola carbonated drink.', brand: 'Coca-Cola', price: 45, discountPct: 0, stockQty: 400, isFeatured: false },
    { name: 'Tropicana Orange Juice 1L', slug: 'tropicana-orange-juice-1l', description: '100% pure orange juice, no added sugar.', brand: 'Tropicana', price: 120, discountPct: 10, stockQty: 200, isFeatured: true },
    { name: 'Red Bull Energy Drink 250ml', slug: 'red-bull-energy-drink-250ml', description: 'Energy drink with caffeine and taurine.', brand: 'Red Bull', price: 125, discountPct: 0, stockQty: 150, isFeatured: false },
    { name: 'Bisleri Water 1L', slug: 'bisleri-water-1l', description: 'Pure and safe packaged drinking water.', brand: 'Bisleri', price: 20, discountPct: 0, stockQty: 600, isFeatured: false },
    { name: 'Nescafe Classic 50g', slug: 'nescafe-classic-50g', description: 'Instant coffee powder for a quick brew.', brand: 'Nescafe', price: 149, discountPct: 5, stockQty: 200, isFeatured: true },
    { name: 'Tata Tea Premium 250g', slug: 'tata-tea-premium-250g', description: 'Premium blend of Assam tea leaves.', brand: 'Tata Tea', price: 99, discountPct: 0, stockQty: 250, isFeatured: false },
    { name: 'Sprite 750ml', slug: 'sprite-750ml', description: 'Lemon-lime flavored carbonated drink.', brand: 'Sprite', price: 45, discountPct: 0, stockQty: 350, isFeatured: false },
    { name: 'Maaza Mango Drink 600ml', slug: 'maaza-mango-drink-600ml', description: 'Mango fruit drink, thick and refreshing.', brand: 'Maaza', price: 35, discountPct: 0, stockQty: 300, isFeatured: false },
    { name: 'Horlicks 500g', slug: 'horlicks-500g', description: 'Health and nutrition drink for the family.', brand: 'Horlicks', price: 249, discountPct: 8, stockQty: 120, isFeatured: false },
    { name: 'Minute Maid Pulpy Orange 1L', slug: 'minute-maid-pulpy-orange-1l', description: 'Orange juice with real fruit pulp.', brand: 'Minute Maid', price: 99, discountPct: 15, stockQty: 180, isFeatured: true },
  ],
};

// ── Main seed function ────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting database seed...\n');

  // ── Step 1: Categories ──────────────────────────────────────────────────────
  console.log('📂 Seeding categories...');
  const categoryMap: Record<string, string> = {};

  for (const cat of CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
    categoryMap[cat.slug] = created.id;
    console.log(`  ✓ ${cat.name}`);
  }

  // ── Step 2: Products ────────────────────────────────────────────────────────
  console.log('\n🛒 Seeding products...');
  let productCount = 0;

  for (const [categorySlug, products] of Object.entries(PRODUCTS_BY_CATEGORY)) {
    const categoryId = categoryMap[categorySlug];
    for (const product of products) {
      await prisma.product.upsert({
        where: { slug: product.slug },
        update: {},
        create: {
          ...product,
          categoryId,
          price: product.price,
          discountPct: product.discountPct,
        },
      });
      productCount++;
    }
    console.log(`  ✓ ${products.length} products in ${categorySlug}`);
  }

  // ── Step 3: Users ───────────────────────────────────────────────────────────
  console.log('\n👤 Seeding users...');
  const passwordHash = await bcrypt.hash('Password123!', 12);

  const adminUsers = [
    { email: 'admin@freshcart.com', name: 'Admin User', role: 'admin' },
    { email: 'superadmin@freshcart.com', name: 'Super Admin', role: 'admin' },
  ];

  const customerUsers = [
    { email: 'alice@example.com', name: 'Alice Johnson', role: 'customer' },
    { email: 'bob@example.com', name: 'Bob Smith', role: 'customer' },
    { email: 'charlie@example.com', name: 'Charlie Brown', role: 'customer' },
    { email: 'diana@example.com', name: 'Diana Prince', role: 'customer' },
    { email: 'eve@example.com', name: 'Eve Wilson', role: 'customer' },
  ];

  for (const user of [...adminUsers, ...customerUsers]) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash,
        emailVerified: true,
        isActive: true,
      },
    });
    console.log(`  ✓ ${user.role}: ${user.email}`);
  }

  // ── Step 4: Delivery Partner ────────────────────────────────────────────────
  console.log('\n🚚 Seeding delivery partner...');
  await prisma.user.upsert({
    where: { email: 'delivery@freshcart.com' },
    update: {},
    create: {
      email: 'delivery@freshcart.com',
      name: 'Ravi Kumar',
      role: 'delivery_partner',
      passwordHash,
      emailVerified: true,
      isActive: true,
    },
  });
  console.log('  ✓ delivery_partner: delivery@freshcart.com');

  // ── Step 5: Delivery Slots ──────────────────────────────────────────────────
  console.log('\n📅 Seeding delivery slots...');
  const timeWindows = [
    { start: '09:00', end: '12:00' },
    { start: '12:00', end: '15:00' },
    { start: '15:00', end: '18:00' },
    { start: '18:00', end: '21:00' },
  ];

  let slotCount = 0;
  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    const slotDate = new Date();
    slotDate.setDate(slotDate.getDate() + dayOffset);
    slotDate.setHours(0, 0, 0, 0);

    for (const window of timeWindows) {
      const [startH, startM] = window.start.split(':').map(Number);
      const [endH, endM] = window.end.split(':').map(Number);

      const startTime = new Date(slotDate);
      startTime.setHours(startH, startM, 0, 0);

      const endTime = new Date(slotDate);
      endTime.setHours(endH, endM, 0, 0);

      await prisma.deliverySlot.upsert({
        where: { slotDate_startTime: { slotDate, startTime } },
        update: {},
        create: {
          slotDate,
          startTime,
          endTime,
          maxOrders: 20,
          bookedCount: 0,
          isActive: true,
        },
      });
      slotCount++;
    }
  }
  console.log(`  ✓ ${slotCount} delivery slots (7 days × 4 windows)`);

  // ── Step 6: Coupons ─────────────────────────────────────────────────────────
  console.log('\n🎟️  Seeding coupons...');
  const now = new Date();
  const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

  const coupons = [
    {
      code: 'WELCOME10',
      discountType: 'percentage',
      discountValue: 10,
      minOrderValue: 200,
      maxUses: 1000,
      startsAt: now,
      expiresAt: futureDate,
      isActive: true,
    },
    {
      code: 'FLAT50',
      discountType: 'fixed',
      discountValue: 50,
      minOrderValue: 500,
      maxUses: null,
      startsAt: now,
      expiresAt: futureDate,
      isActive: true,
    },
    {
      code: 'EXPIRED20',
      discountType: 'percentage',
      discountValue: 20,
      minOrderValue: null,
      maxUses: 100,
      startsAt: new Date(pastDate.getTime() - 7 * 24 * 60 * 60 * 1000),
      expiresAt: pastDate,
      isActive: false,
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: coupon,
    });
    console.log(`  ✓ ${coupon.code} (${coupon.discountType}, ${coupon.isActive ? 'active' : 'expired'})`);
  }

  // ── Step 7: Banners ─────────────────────────────────────────────────────────
  console.log('\n🖼️  Seeding banners...');
  const banners = [
    {
      title: 'Fresh Fruits & Vegetables',
      imageUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=1200',
      linkUrl: '/products?category=fruits',
      sortOrder: 1,
      isActive: true,
    },
    {
      title: 'Dairy Deals - Up to 20% Off',
      imageUrl: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=1200',
      linkUrl: '/products?category=dairy',
      sortOrder: 2,
      isActive: true,
    },
    {
      title: 'Snacks & Beverages Sale',
      imageUrl: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=1200',
      linkUrl: '/products?category=snacks',
      sortOrder: 3,
      isActive: true,
    },
  ];

  for (const banner of banners) {
    await prisma.banner.create({ data: banner });
    console.log(`  ✓ ${banner.title}`);
  }

  // ── Step 8: Subscription Plan ───────────────────────────────────────────────
  console.log('\n💳 Seeding subscription plan...');
  await prisma.subscriptionPlan.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'FreshCart Plus',
      billingCycle: 'monthly',
      price: 199,
      freeDelivery: true,
      orderDiscount: 5,
      isActive: true,
    },
  });
  console.log('  ✓ FreshCart Plus (monthly, ₹199)');

  // ── Summary ─────────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.category.count(),
    prisma.product.count(),
    prisma.user.count(),
    prisma.deliverySlot.count(),
    prisma.coupon.count(),
    prisma.banner.count(),
    prisma.subscriptionPlan.count(),
  ]);

  console.log('\n✅ Seed complete! Summary:');
  console.log(`  Categories:       ${counts[0]}`);
  console.log(`  Products:         ${counts[1]}`);
  console.log(`  Users:            ${counts[2]}`);
  console.log(`  Delivery Slots:   ${counts[3]}`);
  console.log(`  Coupons:          ${counts[4]}`);
  console.log(`  Banners:          ${counts[5]}`);
  console.log(`  Subscription Plans: ${counts[6]}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
