'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

// ── Static product data with high-quality Unsplash images ─────────────────────

const PRODUCTS = [
  // Fruits
  { id: '1', name: 'Fresh Bananas', category: 'Fruits', price: 49, discountPct: 10, image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&q=80', emoji: '🍌' },
  { id: '2', name: 'Red Apples', category: 'Fruits', price: 120, discountPct: 5, image: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400&q=80', emoji: '🍎' },
  { id: '3', name: 'Alphonso Mangoes', category: 'Fruits', price: 350, discountPct: 15, image: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&q=80', emoji: '🥭' },
  { id: '4', name: 'Strawberries', category: 'Fruits', price: 129, discountPct: 0, image: 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&q=80', emoji: '🍓' },
  { id: '5', name: 'Watermelon', category: 'Fruits', price: 79, discountPct: 20, image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&q=80', emoji: '🍉' },

  // Vegetables
  { id: '6', name: 'Fresh Tomatoes', category: 'Vegetables', price: 39, discountPct: 0, image: 'https://images.unsplash.com/photo-1546094096-0df4bcaaa337?w=400&q=80', emoji: '🍅' },
  { id: '7', name: 'Broccoli', category: 'Vegetables', price: 79, discountPct: 10, image: 'https://images.unsplash.com/photo-1459411621453-7b03977f4bfc?w=400&q=80', emoji: '🥦' },
  { id: '8', name: 'Carrots', category: 'Vegetables', price: 45, discountPct: 0, image: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&q=80', emoji: '🥕' },
  { id: '9', name: 'Spinach', category: 'Vegetables', price: 29, discountPct: 0, image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=400&q=80', emoji: '🥬' },
  { id: '10', name: 'Bell Peppers', category: 'Vegetables', price: 69, discountPct: 15, image: 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&q=80', emoji: '🫑' },

  // Dairy
  { id: '11', name: 'Full Cream Milk 1L', category: 'Dairy', price: 68, discountPct: 0, image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80', emoji: '🥛' },
  { id: '12', name: 'Paneer 200g', category: 'Dairy', price: 89, discountPct: 5, image: 'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=400&q=80', emoji: '🧀' },
  { id: '13', name: 'Butter 100g', category: 'Dairy', price: 55, discountPct: 0, image: 'https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=400&q=80', emoji: '🧈' },
  { id: '14', name: 'Curd 400g', category: 'Dairy', price: 45, discountPct: 0, image: 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400&q=80', emoji: '🥣' },
  { id: '15', name: 'Ghee 500ml', category: 'Dairy', price: 299, discountPct: 5, image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&q=80', emoji: '🫙' },

  // Snacks
  { id: '16', name: "Lay's Classic Chips", category: 'Snacks', price: 20, discountPct: 0, image: 'https://images.unsplash.com/photo-1621939514649-280e2ee25f60?w=400&q=80', emoji: '🥔' },
  { id: '17', name: "Haldiram's Bhujia", category: 'Snacks', price: 120, discountPct: 10, image: 'https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400&q=80', emoji: '🍿' },
  { id: '18', name: 'Roasted Almonds', category: 'Snacks', price: 299, discountPct: 20, image: 'https://images.unsplash.com/photo-1508061253366-f7da158b6d46?w=400&q=80', emoji: '🌰' },
  { id: '19', name: 'Oreo Cookies', category: 'Snacks', price: 55, discountPct: 0, image: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=400&q=80', emoji: '🍪' },
  { id: '20', name: 'Maggi Noodles', category: 'Snacks', price: 14, discountPct: 0, image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80', emoji: '🍜' },

  // Beverages
  { id: '21', name: 'Coca-Cola 750ml', category: 'Beverages', price: 45, discountPct: 0, image: 'https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&q=80', emoji: '🥤' },
  { id: '22', name: 'Tropicana Orange Juice', category: 'Beverages', price: 120, discountPct: 10, image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&q=80', emoji: '🍊' },
  { id: '23', name: 'Nescafe Classic 50g', category: 'Beverages', price: 149, discountPct: 5, image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&q=80', emoji: '☕' },
  { id: '24', name: 'Tata Tea Premium', category: 'Beverages', price: 99, discountPct: 0, image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&q=80', emoji: '🍵' },
  { id: '25', name: 'Red Bull Energy Drink', category: 'Beverages', price: 125, discountPct: 0, image: 'https://images.unsplash.com/photo-1622543925917-763c34d1a86e?w=400&q=80', emoji: '⚡' },
];

const CATEGORIES = ['All', 'Fruits', 'Vegetables', 'Dairy', 'Snacks', 'Beverages'];

const CATEGORY_COLORS: Record<string, string> = {
  Fruits: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Vegetables: 'bg-green-500/20 text-green-400 border-green-500/30',
  Dairy: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Snacks: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Beverages: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
};

interface CartItem { id: string; name: string; quantity: number; price: number; discountPct: number; }

export default function ProductShowcasePage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [addedId, setAddedId] = useState<string | null>(null);

  // Real-time filtered products
  const filtered = useMemo(() => {
    return PRODUCTS.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [search, activeCategory]);

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.price * (1 - i.discountPct / 100) * i.quantity, 0);

  const addToCart = (product: typeof PRODUCTS[0]) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { id: product.id, name: product.name, quantity: 1, price: product.price, discountPct: product.discountPct }];
    });
    setAddedId(product.id);
    setTimeout(() => setAddedId(null), 1000);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <h1 className="text-xl font-bold text-white whitespace-nowrap">🛒 FreshCart</h1>

          {/* Search Bar */}
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search groceries..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors"
              aria-label="Search products"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">✕</button>
            )}
          </div>

          {/* Cart Badge */}
          <div className="relative flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-xl cursor-pointer transition-colors">
            <span>🛒</span>
            <span className="font-semibold text-sm">₹{cartTotal.toFixed(0)}</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Category Filter Pills */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`flex-none px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                activeCategory === cat
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-green-500 hover:text-green-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results count */}
        <p className="text-gray-400 text-sm mb-4">
          {search || activeCategory !== 'All'
            ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''} found`
            : `${PRODUCTS.length} products`}
        </p>

        {/* No results */}
        {filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">🔍</p>
            <h3 className="text-xl font-semibold text-white mb-2">No products found</h3>
            <p className="text-gray-400 mb-4">No results for &quot;{search}&quot;</p>
            <button
              onClick={() => { setSearch(''); setActiveCategory('All'); }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Product Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((product) => {
            const discounted = product.price * (1 - product.discountPct / 100);
            const isAdded = addedId === product.id;
            const inCart = cart.find((i) => i.id === product.id);

            return (
              <article
                key={product.id}
                className="group bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/10 transition-all duration-300 hover:-translate-y-1"
              >
                {/* Image */}
                <div className="relative h-40 bg-gray-800 overflow-hidden">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://via.placeholder.com/400x300/1f2937/6b7280?text=${product.emoji}`;
                    }}
                  />
                  {product.discountPct > 0 && (
                    <span className="absolute top-2 left-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      -{product.discountPct}%
                    </span>
                  )}
                  {inCart && (
                    <span className="absolute top-2 right-2 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      ×{inCart.quantity}
                    </span>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  {/* Category badge */}
                  <span className={`inline-block text-xs px-2 py-0.5 rounded-full border mb-1.5 ${CATEGORY_COLORS[product.category] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
                    {product.category}
                  </span>

                  <h3 className="text-sm font-medium text-white line-clamp-2 leading-tight mb-2">
                    {product.name}
                  </h3>

                  {/* Price */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-base font-bold text-green-400">₹{discounted.toFixed(0)}</span>
                    {product.discountPct > 0 && (
                      <span className="text-xs text-gray-500 line-through">₹{product.price}</span>
                    )}
                  </div>

                  {/* Add to Cart */}
                  <button
                    onClick={() => addToCart(product)}
                    className={`w-full py-2 rounded-xl text-sm font-semibold transition-all duration-200 ${
                      isAdded
                        ? 'bg-green-600 text-white scale-95'
                        : 'bg-gray-800 hover:bg-green-600 text-gray-300 hover:text-white border border-gray-700 hover:border-green-600'
                    }`}
                    aria-label={`Add ${product.name} to cart`}
                  >
                    {isAdded ? '✓ Added!' : '+ Add to Cart'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
