'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { apiFetch } from '@/lib/api';
import { useCartStore } from '@/store/cart.store';
import { getSocket } from '@/lib/socket';

interface CartItem {
  id: string; productId: string; quantity: number; savedLater: boolean;
  product: { id: string; name: string; slug: string; price: number; discountPct: number; stockQty: number; isActive: boolean; images: Array<{ url: string }> };
}

interface CartData {
  cartId: string; items: CartItem[]; savedForLater: CartItem[];
  subtotal: string; itemCount: number;
}

export default function CartPage() {
  const [cart, setCart] = useState<CartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: string; total: string } | null>(null);
  const [conflictItems, setConflictItems] = useState<Set<string>>(new Set());
  const { setCart: setCartStore } = useCartStore();

  const fetchCart = async () => {
    try {
      const res = await apiFetch<{ data: CartData }>('/cart');
      setCart(res.data);
      setCartStore({ items: res.data.items, savedForLater: res.data.savedForLater, subtotal: res.data.subtotal, itemCount: res.data.itemCount });
    } catch (err) {
      console.error('Failed to fetch cart:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCart();

    // Listen for cart conflicts (out-of-stock while in cart)
    const socket = getSocket();
    const handler = (data: { productId: string; availableQty: number }) => {
      setConflictItems((prev) => new Set([...prev, data.productId]));
    };
    socket.on('cart:conflict', handler);
    return () => { socket.off('cart:conflict', handler); };
  }, []);

  const updateQuantity = async (itemId: string, quantity: number) => {
    try {
      await apiFetch(`/cart/items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
      await fetchCart();
    } catch (err) { console.error(err); }
  };

  const removeItem = async (itemId: string) => {
    try {
      await apiFetch(`/cart/items/${itemId}`, { method: 'DELETE' });
      await fetchCart();
    } catch (err) { console.error(err); }
  };

  const applyCoupon = async () => {
    setCouponError('');
    try {
      const res = await apiFetch<{ data: { couponCode: string; discountAmount: string; total: string } }>(
        '/cart/coupon', { method: 'POST', body: JSON.stringify({ code: couponCode }) },
      );
      setAppliedCoupon({ code: res.data.couponCode, discount: res.data.discountAmount, total: res.data.total });
    } catch (err) {
      setCouponError(err instanceof Error ? err.message : 'Invalid coupon');
    }
  };

  const removeCoupon = async () => {
    await apiFetch('/cart/coupon', { method: 'DELETE' });
    setAppliedCoupon(null);
    setCouponCode('');
  };

  if (isLoading) return <div className="max-w-4xl mx-auto px-4 py-8 text-center">Loading cart...</div>;
  if (!cart || cart.items.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-4xl mb-4">🛒</p>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Your cart is empty</h2>
        <Link href="/products" className="text-primary-600 hover:text-primary-700 font-medium">Start shopping →</Link>
      </div>
    );
  }

  const total = appliedCoupon ? appliedCoupon.total : cart.subtotal;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Shopping Cart ({cart.itemCount} items)</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {cart.items.map((item) => {
            const discounted = item.product.price * (1 - item.product.discountPct / 100);
            const hasConflict = conflictItems.has(item.productId);
            return (
              <div key={item.id} className={`bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm ${hasConflict ? 'border-2 border-orange-400' : ''}`}>
                {hasConflict && (
                  <div className="mb-2 text-sm text-orange-600 dark:text-orange-400 font-medium" role="alert">
                    ⚠️ This item is now out of stock
                  </div>
                )}
                <div className="flex gap-4">
                  <div className="relative w-20 h-20 flex-none bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                    <Image src={item.product.images[0]?.url ?? '/placeholder-product.jpg'} alt={item.product.name} fill className="object-cover" />
                  </div>
                  <div className="flex-1">
                    <Link href={`/products/${item.product.slug}`} className="font-medium text-gray-900 dark:text-white hover:text-primary-600">{item.product.name}</Link>
                    <p className="text-primary-600 font-bold mt-1">₹{discounted.toFixed(0)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg">
                        <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="px-2 py-1 text-gray-600 dark:text-gray-300" aria-label="Decrease">−</button>
                        <span className="px-3 py-1 text-sm">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="px-2 py-1 text-gray-600 dark:text-gray-300" aria-label="Increase">+</button>
                      </div>
                      <button onClick={() => removeItem(item.id)} className="text-sm text-red-500 hover:text-red-600">Remove</button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900 dark:text-white">₹{(discounted * item.quantity).toFixed(0)}</p>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Saved for Later */}
          {cart.savedForLater.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">Saved for Later ({cart.savedForLater.length})</h3>
              {cart.savedForLater.map((item) => (
                <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm opacity-75">
                  <div className="flex gap-4 items-center">
                    <div className="relative w-16 h-16 flex-none bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden">
                      <Image src={item.product.images[0]?.url ?? '/placeholder-product.jpg'} alt={item.product.name} fill className="object-cover" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{item.product.name}</p>
                      <button
                        onClick={async () => { await apiFetch(`/cart/items/${item.id}/move-to-cart`, { method: 'POST' }); await fetchCart(); }}
                        className="text-sm text-primary-600 hover:text-primary-700 mt-1"
                      >
                        Move to Cart
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm h-fit space-y-4">
          <h2 className="font-bold text-gray-900 dark:text-white text-lg">Order Summary</h2>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Subtotal</span><span>₹{cart.subtotal}</span>
            </div>
            {appliedCoupon && (
              <div className="flex justify-between text-green-600">
                <span>Discount ({appliedCoupon.code})</span><span>-₹{appliedCoupon.discount}</span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold text-gray-900 dark:text-white">
              <span>Total</span><span>₹{total}</span>
            </div>
          </div>

          {/* Coupon */}
          {!appliedCoupon ? (
            <div>
              <div className="flex gap-2">
                <input
                  type="text" value={couponCode} onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  aria-label="Coupon code"
                />
                <button onClick={applyCoupon} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">Apply</button>
              </div>
              {couponError && <p className="mt-1 text-xs text-red-600">{couponError}</p>}
            </div>
          ) : (
            <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
              <span className="text-sm text-green-700 dark:text-green-400 font-medium">✓ {appliedCoupon.code}</span>
              <button onClick={removeCoupon} className="text-xs text-red-500 hover:text-red-600">Remove</button>
            </div>
          )}

          <Link
            href="/checkout"
            className="block w-full py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl text-center transition-colors"
          >
            Proceed to Checkout
          </Link>
        </div>
      </div>
    </div>
  );
}
