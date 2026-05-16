'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { getSocket } from '@/lib/socket';

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  discountPct: number;
  stockQty: number;
  isActive: boolean;
  images: Array<{ url: string }>;
  category?: { name: string; slug: string };
}

export default function ProductCard({ product: initialProduct }: { product: Product }) {
  const [product, setProduct] = useState(initialProduct);
  const [isAdding, setIsAdding] = useState(false);
  const { isAuthenticated } = useAuthStore();

  const discountedPrice = product.price * (1 - product.discountPct / 100);
  const imageUrl = product.images[0]?.url ?? '/placeholder-product.jpg';

  // Real-time stock updates via Socket.io
  useEffect(() => {
    const socket = getSocket();
    const handler = (data: { productId: string; stockQty: number; isInStock: boolean }) => {
      if (data.productId === product.id) {
        setProduct((p) => ({ ...p, stockQty: data.stockQty }));
      }
    };
    socket.on('inventory:update', handler);
    return () => { socket.off('inventory:update', handler); };
  }, [product.id]);

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      window.location.href = '/login';
      return;
    }
    setIsAdding(true);
    try {
      await apiFetch('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
    } catch (err) {
      console.error('Failed to add to cart:', err);
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <article className="bg-white dark:bg-gray-800 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <Link href={`/products/${product.slug}`}>
        <div className="relative h-40 bg-gray-100 dark:bg-gray-700">
          <Image src={imageUrl} alt={product.name} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
          {product.discountPct > 0 && (
            <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
              -{product.discountPct}%
            </span>
          )}
          {product.stockQty === 0 && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white font-semibold text-sm">Out of Stock</span>
            </div>
          )}
        </div>
      </Link>

      <div className="p-3">
        <Link href={`/products/${product.slug}`}>
          <h3 className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 hover:text-primary-600">{product.name}</h3>
        </Link>

        <div className="mt-2 flex items-center justify-between">
          <div>
            <span className="text-base font-bold text-gray-900 dark:text-white">₹{discountedPrice.toFixed(0)}</span>
            {product.discountPct > 0 && (
              <span className="ml-1 text-xs text-gray-400 line-through">₹{product.price}</span>
            )}
          </div>
          {product.stockQty > 0 && product.stockQty <= 5 && (
            <span className="text-xs text-orange-500">Only {product.stockQty} left</span>
          )}
        </div>

        <button
          onClick={handleAddToCart}
          disabled={product.stockQty === 0 || isAdding}
          className="mt-3 w-full py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          aria-label={`Add ${product.name} to cart`}
        >
          {isAdding ? 'Adding...' : product.stockQty === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
      </div>
    </article>
  );
}
