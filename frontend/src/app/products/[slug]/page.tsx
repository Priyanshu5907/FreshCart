import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AddToCartButton from '@/components/products/AddToCartButton';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface Product {
  id: string; name: string; slug: string; description: string | null;
  brand: string | null; price: number; discountPct: number; stockQty: number;
  isFeatured: boolean; averageRating: number | null;
  category: { id: string; name: string; slug: string };
  images: Array<{ id: string; url: string; sortOrder: number }>;
  _count: { reviews: number };
}

async function getProduct(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_URL}/products/${slug}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json() as { data: Product };
    return data.data;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) return { title: 'Product Not Found' };
  return {
    title: `${product.name} - FreshCart`,
    description: product.description ?? `Buy ${product.name} online at FreshCart`,
  };
}

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = await getProduct(params.slug);
  if (!product) notFound();

  const discountedPrice = product.price * (1 - product.discountPct / 100);
  const mainImage = product.images[0]?.url ?? '/placeholder-product.jpg';

  const stockStatus = product.stockQty === 0
    ? { label: 'Out of Stock', color: 'text-red-600' }
    : product.stockQty <= 5
    ? { label: `Only ${product.stockQty} left`, color: 'text-orange-500' }
    : { label: 'In Stock', color: 'text-green-600' };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <div>
          <div className="relative h-80 md:h-96 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
            <Image src={mainImage} alt={product.name} fill className="object-contain" priority />
          </div>
          {product.images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto">
              {product.images.map((img) => (
                <div key={img.id} className="relative w-16 h-16 flex-none bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <Image src={img.url} alt={product.name} fill className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{product.category.name}</p>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{product.name}</h1>
            {product.brand && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">by {product.brand}</p>}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">₹{discountedPrice.toFixed(0)}</span>
            {product.discountPct > 0 && (
              <>
                <span className="text-lg text-gray-400 line-through">₹{product.price}</span>
                <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-semibold px-2 py-1 rounded-full">
                  {product.discountPct}% OFF
                </span>
              </>
            )}
          </div>

          {product.averageRating && (
            <div className="flex items-center gap-2">
              <span className="text-yellow-400">{'★'.repeat(Math.round(product.averageRating))}</span>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {product.averageRating.toFixed(1)} ({product._count.reviews} reviews)
              </span>
            </div>
          )}

          <p className={`text-sm font-semibold ${stockStatus.color}`}>{stockStatus.label}</p>

          {product.description && (
            <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{product.description}</p>
          )}

          <AddToCartButton productId={product.id} productName={product.name} stockQty={product.stockQty} />
        </div>
      </div>
    </div>
  );
}
