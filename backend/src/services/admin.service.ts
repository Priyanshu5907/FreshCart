import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

// ── Dashboard ──────────────────────────────────────────────────────────────────

export async function getDashboardStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    dailyOrders, weeklyOrders, monthlyOrders,
    dailyRevenue, weeklyRevenue, monthlyRevenue,
    dailyNewCustomers, weeklyNewCustomers, monthlyNewCustomers,
    topProducts,
    dailyRevenueChart,
  ] = await Promise.all([
    // Order counts
    prisma.order.count({ where: { createdAt: { gte: startOfDay }, status: { not: 'cancelled' } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfWeek }, status: { not: 'cancelled' } } }),
    prisma.order.count({ where: { createdAt: { gte: startOfMonth }, status: { not: 'cancelled' } } }),

    // Revenue aggregates
    prisma.order.aggregate({ where: { createdAt: { gte: startOfDay }, status: { not: 'cancelled' } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: startOfWeek }, status: { not: 'cancelled' } }, _sum: { total: true } }),
    prisma.order.aggregate({ where: { createdAt: { gte: startOfMonth }, status: { not: 'cancelled' } }, _sum: { total: true } }),

    // New customers
    prisma.user.count({ where: { role: 'customer', createdAt: { gte: startOfDay } } }),
    prisma.user.count({ where: { role: 'customer', createdAt: { gte: startOfWeek } } }),
    prisma.user.count({ where: { role: 'customer', createdAt: { gte: startOfMonth } } }),

    // Top 10 products by units sold this month
    prisma.orderItem.groupBy({
      by: ['productId', 'productName'],
      where: { order: { createdAt: { gte: startOfMonth }, status: { not: 'cancelled' } } },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    }),

    // Daily revenue for last 30 days
    prisma.$queryRaw<Array<{ date: string; revenue: number }>>`
      SELECT DATE(created_at) as date, SUM(total)::float as revenue
      FROM orders
      WHERE created_at >= ${thirtyDaysAgo} AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `,
  ]);

  return {
    orders: { daily: dailyOrders, weekly: weeklyOrders, monthly: monthlyOrders },
    revenue: {
      daily: Number(dailyRevenue._sum.total ?? 0),
      weekly: Number(weeklyRevenue._sum.total ?? 0),
      monthly: Number(monthlyRevenue._sum.total ?? 0),
    },
    newCustomers: { daily: dailyNewCustomers, weekly: weeklyNewCustomers, monthly: monthlyNewCustomers },
    topProducts,
    dailyRevenueChart,
  };
}

// ── Product Management ─────────────────────────────────────────────────────────

export async function adminListProducts(page = 1, pageSize = 20, search?: string) {
  const skip = (page - 1) * pageSize;
  const where = search
    ? { isDeleted: false, name: { contains: search, mode: 'insensitive' as const } }
    : { isDeleted: false };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: { category: true, images: { take: 1 } },
      orderBy: { id: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function adminCreateProduct(data: {
  categoryId: string;
  name: string;
  slug: string;
  description?: string;
  brand?: string;
  price: number;
  discountPct?: number;
  stockQty?: number;
  isFeatured?: boolean;
  imageUrls?: string[];
}) {
  const existing = await prisma.product.findUnique({ where: { slug: data.slug } });
  if (existing) throw new AppError('Product with this slug already exists', 409);

  const product = await prisma.product.create({
    data: {
      categoryId: data.categoryId,
      name: data.name,
      slug: data.slug,
      description: data.description,
      brand: data.brand,
      price: data.price,
      discountPct: data.discountPct ?? 0,
      stockQty: data.stockQty ?? 0,
      isFeatured: data.isFeatured ?? false,
      images: data.imageUrls
        ? { create: data.imageUrls.map((url, i) => ({ url, sortOrder: i })) }
        : undefined,
    },
    include: { images: true, category: true },
  });

  logger.info('Product created by admin', { productId: product.id });
  return product;
}

export async function adminUpdateProduct(
  productId: string,
  data: Partial<{
    name: string; description: string; brand: string; price: number;
    discountPct: number; stockQty: number; isFeatured: boolean; isActive: boolean; categoryId: string;
  }>,
) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new AppError('Product not found', 404);

  const updated = await prisma.product.update({
    where: { id: productId },
    data,
    include: { images: true, category: true },
  });

  // Invalidate cache
  await redis.del(`product:slug:${updated.slug}`, 'products:featured', 'products:deals');

  logger.info('Product updated by admin', { productId });
  return updated;
}

export async function adminDeleteProduct(productId: string) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDeleted: false } });
  if (!product) throw new AppError('Product not found', 404);

  await prisma.product.update({ where: { id: productId }, data: { isDeleted: true, isActive: false } });
  logger.info('Product soft-deleted by admin', { productId });
}

export async function generatePresignedUrl(fileName: string, contentType: string) {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

  const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });
  const key = `products/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET ?? 'grocery-platform-assets',
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 900 }); // 15 min
  const cdnUrl = `${process.env.CLOUDFRONT_URL ?? ''}/${key}`;

  return { uploadUrl: url, cdnUrl, key };
}

// ── Category Management ────────────────────────────────────────────────────────

export async function adminCreateCategory(data: { name: string; slug: string; imageUrl?: string }) {
  const existing = await prisma.category.findUnique({ where: { slug: data.slug } });
  if (existing) throw new AppError('Category with this slug already exists', 409);

  const category = await prisma.category.create({ data });
  await redis.del('categories:all');
  return category;
}

export async function adminUpdateCategory(
  categoryId: string,
  data: { name?: string; isActive?: boolean; imageUrl?: string },
) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new AppError('Category not found', 404);

  const updated = await prisma.category.update({ where: { id: categoryId }, data });
  await redis.del('categories:all');
  return updated;
}

// ── Order Management ───────────────────────────────────────────────────────────

export async function adminListOrders(filters: {
  status?: string; startDate?: Date; endDate?: Date;
  customerName?: string; customerEmail?: string;
  page?: number; pageSize?: number;
}) {
  const { status, startDate, endDate, customerName, customerEmail, page = 1, pageSize = 20 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate && { gte: startDate }),
      ...(endDate && { lte: endDate }),
    };
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        address: true,
        deliverySlot: true,
        items: { take: 3 },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function adminUpdateOrderStatus(
  orderId: string,
  status: string,
  adminId: string,
  note?: string,
) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status, ...(status === 'delivered' && { deliveredAt: new Date() }) },
  });

  await prisma.orderStatusHistory.create({
    data: { orderId, status, changedBy: adminId, note },
  });

  logger.info('Order status updated by admin', { orderId, status, adminId });
  return updated;
}

export async function adminAssignDeliveryPartner(orderId: string, deliveryPartnerId: string) {
  const partner = await prisma.user.findFirst({
    where: { id: deliveryPartnerId, role: 'delivery_partner', isActive: true },
  });
  if (!partner) throw new AppError('Active delivery partner not found', 404);

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404);

  return prisma.order.update({ where: { id: orderId }, data: { deliveryPartnerId } });
}

export async function adminCancelOrder(orderId: string, reason: string, adminId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status === 'delivered') throw new AppError('Cannot cancel a delivered order', 400);

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'cancelled', cancellationReason: reason },
  });

  await prisma.orderStatusHistory.create({
    data: { orderId, status: 'cancelled', changedBy: adminId, note: reason },
  });

  return updated;
}

// ── Coupon Management ──────────────────────────────────────────────────────────

export async function adminListCoupons() {
  return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
}

export async function adminCreateCoupon(data: {
  code: string; discountType: 'percentage' | 'fixed'; discountValue: number;
  minOrderValue?: number; maxUses?: number; startsAt: Date; expiresAt: Date;
}) {
  if (data.discountType === 'percentage' && (data.discountValue < 1 || data.discountValue > 100)) {
    throw new AppError('Percentage discount must be between 1 and 100', 400);
  }

  const existing = await prisma.coupon.findUnique({ where: { code: data.code } });
  if (existing) throw new AppError('Coupon code already exists', 409);

  return prisma.coupon.create({ data });
}

export async function adminUpdateCoupon(couponId: string, data: Partial<{
  discountValue: number; minOrderValue: number; maxUses: number;
  startsAt: Date; expiresAt: Date; isActive: boolean;
}>) {
  const coupon = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!coupon) throw new AppError('Coupon not found', 404);
  return prisma.coupon.update({ where: { id: couponId }, data });
}

// ── Banner Management ──────────────────────────────────────────────────────────

export async function adminListBanners() {
  return prisma.banner.findMany({ orderBy: { sortOrder: 'asc' } });
}

export async function adminCreateBanner(data: {
  title: string; imageUrl: string; linkUrl?: string; sortOrder?: number;
}) {
  return prisma.banner.create({ data });
}

export async function adminUpdateBanner(bannerId: string, data: Partial<{
  title: string; imageUrl: string; linkUrl: string; sortOrder: number; isActive: boolean;
}>) {
  const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
  if (!banner) throw new AppError('Banner not found', 404);
  return prisma.banner.update({ where: { id: bannerId }, data });
}

export async function adminDeleteBanner(bannerId: string) {
  const banner = await prisma.banner.findUnique({ where: { id: bannerId } });
  if (!banner) throw new AppError('Banner not found', 404);
  await prisma.banner.delete({ where: { id: bannerId } });
}
