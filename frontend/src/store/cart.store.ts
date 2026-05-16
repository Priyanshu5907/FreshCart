'use client';

import { create } from 'zustand';

interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    discountPct: number;
    stockQty: number;
    images: Array<{ url: string }>;
  };
}

interface CartState {
  items: CartItem[];
  savedForLater: CartItem[];
  subtotal: string;
  itemCount: number;
  couponCode: string | null;
  discountAmount: string;
  setCart: (cart: { items: CartItem[]; savedForLater: CartItem[]; subtotal: string; itemCount: number }) => void;
  setCoupon: (code: string | null, discount: string) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  items: [],
  savedForLater: [],
  subtotal: '0.00',
  itemCount: 0,
  couponCode: null,
  discountAmount: '0.00',
  setCart: (cart) => set(cart),
  setCoupon: (code, discount) => set({ couponCode: code, discountAmount: discount }),
  clearCart: () => set({ items: [], savedForLater: [], subtotal: '0.00', itemCount: 0, couponCode: null, discountAmount: '0.00' }),
}));
