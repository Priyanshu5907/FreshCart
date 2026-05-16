'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';

interface Props {
  productId: string;
  productName: string;
  stockQty: number;
}

export default function AddToCartButton({ productId, productName, stockQty }: Props) {
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    setIsAdding(true);
    try {
      await apiFetch('/cart/items', {
        method: 'POST',
        body: JSON.stringify({ productId, quantity }),
      });
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    } catch (err) {
      console.error('Failed to add to cart:', err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleAddToWishlist = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    try {
      await apiFetch('/wishlist', { method: 'POST', body: JSON.stringify({ productId }) });
    } catch (err) {
      console.error('Failed to add to wishlist:', err);
    }
  };

  return (
    <div className="space-y-3">
      {/* Quantity Selector */}
      <div className="flex items-center gap-3">
        <label htmlFor="quantity" className="text-sm font-medium text-gray-700 dark:text-gray-300">Qty:</label>
        <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-l-lg"
            aria-label="Decrease quantity"
          >−</button>
          <span id="quantity" className="px-4 py-2 text-gray-900 dark:text-white font-medium min-w-[3rem] text-center">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(stockQty, q + 1))}
            className="px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-r-lg"
            aria-label="Increase quantity"
          >+</button>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleAddToCart}
          disabled={stockQty === 0 || isAdding}
          className="flex-1 py-3 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors"
          aria-label={`Add ${productName} to cart`}
        >
          {isAdding ? 'Adding...' : added ? '✓ Added!' : stockQty === 0 ? 'Out of Stock' : 'Add to Cart'}
        </button>
        <button
          onClick={handleAddToWishlist}
          className="px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
          aria-label={`Add ${productName} to wishlist`}
        >
          ♡
        </button>
      </div>
    </div>
  );
}
