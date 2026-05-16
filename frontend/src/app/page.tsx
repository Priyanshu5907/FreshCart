import { Suspense } from 'react';
import BannerCarousel from '@/components/home/BannerCarousel';
import ProductCard from '@/components/products/ProductCard';
import { SkeletonBanner, SkeletonCard } from '@/components/ui/SkeletonCard';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function getBanners() {
  try {
    const res = await fetch(`${API_URL}/admin/banners`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json() as { data: Array<{ id: string; title: string; imageUrl: string; linkUrl: string | null; isActive: boolean }> };
    return data.data.filter((b) => b.isActive);
  } catch { return []; }
}

async function getCategories() {
  try {
    const res = await fetch(`${API_URL}/categories`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json() as { data: Array<{ id: string; name: string; slug: string; imageUrl: string | null }> };
    return data.data;
  } catch { return []; }
}

async function getFeaturedProducts() {
  try {
    const res = await fetch(`${API_URL}/products/featured`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json() as { data: unknown[] };
    return data.data;
  } catch { return []; }
}

async function getDeals() {
  try {
    const res = await fetch(`${API_URL}/products/deals`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const data = await res.json() as { data: unknown[] };
    return data.data;
  } catch { return []; }
}

export default async function HomePage() {
  const [banners, categories, featured, deals] = await Promise.all([
    getBanners(),
    getCategories(),
    getFeaturedProducts(),
    getDeals(),
  ]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-10">
      {/* Banner Carousel */}
      <section aria-label="Promotions">
        <Suspense fallback={<SkeletonBanner />}>
          <BannerCarousel banners={banners} />
        </Suspense>
      </section>

      {/* Categories */}
      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="text-xl font-bold text-gray-900 dark:text-white mb-4">Shop by Category</h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/products?category=${cat.slug}`}
              className="flex flex-col items-center p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow text-center"
            >
              {cat.imageUrl && (
                <img src={cat.imageUrl} alt={cat.name} className="w-12 h-12 object-cover rounded-full mb-2" />
              )}
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.name}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      {featured.length > 0 && (
        <section aria-labelledby="featured-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="featured-heading" className="text-xl font-bold text-gray-900 dark:text-white">Featured Products</h2>
            <Link href="/products?featured=true" className="text-sm text-primary-600 hover:text-primary-700">View all →</Link>
          </div>
          <div className="flex space-x-4 overflow-x-auto pb-2 scrollbar-hide">
            {(featured as Parameters<typeof ProductCard>[0]['product'][]).map((product) => (
              <div key={product.id} className="flex-none w-48">
                <ProductCard product={product} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Deals of the Day */}
      {deals.length > 0 && (
        <section aria-labelledby="deals-heading">
          <div className="flex items-center justify-between mb-4">
            <h2 id="deals-heading" className="text-xl font-bold text-gray-900 dark:text-white">🔥 Deals of the Day</h2>
            <Link href="/products?sort=discount" className="text-sm text-primary-600 hover:text-primary-700">View all →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {(deals as Parameters<typeof ProductCard>[0]['product'][]).slice(0, 10).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
