'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { apiFetch } from '@/lib/api';

export default function Navbar() {
  const { isMobileMenuOpen, toggleMobileMenu, theme, setTheme, language, setLanguage } = useUIStore();
  const { user, isAuthenticated, logout } = useAuthStore();
  const { itemCount } = useCartStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced auto-suggestions (300ms, min 2 chars)
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await apiFetch<{ data: string[] }>(`/products?q=${encodeURIComponent(searchQuery)}&suggest=true`);
        setSuggestions(res.data.slice(0, 10));
        setShowSuggestions(true);
      } catch {
        // Fallback: show static suggestions from product names
        setSuggestions([]);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/products/showcase?q=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  const handleLogout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) });
      }
    } finally {
      logout();
    }
  };

  return (
    <nav className="bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <span className="text-2xl font-bold text-primary-600">🛒 FreshCart</span>
          </Link>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-lg mx-8 relative">
            <form onSubmit={handleSearch} className="w-full">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Search for groceries..."
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label="Search products"
              />
            </form>
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute top-full left-0 right-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg mt-1 z-50">
                {suggestions.map((s) => (
                  <li key={s}>
                    <Link
                      href={`/products?q=${encodeURIComponent(s)}`}
                      className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300"
                    >
                      {s}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right Actions */}
          <div className="flex items-center space-x-4">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Language Switcher */}
            <button
              onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
              className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-primary-600"
              aria-label="Switch language"
            >
              {language === 'en' ? 'हिं' : 'EN'}
            </button>

            {/* Cart Icon */}
            <Link href="/cart" className="relative p-2 text-gray-600 dark:text-gray-300 hover:text-primary-600" aria-label="Cart">
              🛒
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </Link>

            {/* User Menu */}
            {isAuthenticated ? (
              <div className="relative group">
                <button className="flex items-center space-x-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                  <span>👤 {user?.name?.split(' ')[0]}</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hidden group-hover:block">
                  <Link href="/profile" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Profile</Link>
                  <Link href="/orders" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Orders</Link>
                  <Link href="/wishlist" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Wishlist</Link>
                  {user?.role === 'admin' && (
                    <Link href="/admin" className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">Admin Panel</Link>
                  )}
                  <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                    Logout
                  </button>
                </div>
              </div>
            ) : (
              <Link href="/login" className="text-sm font-medium text-primary-600 hover:text-primary-700">
                Login
              </Link>
            )}

            {/* Mobile Menu Button */}
            <button
              onClick={toggleMobileMenu}
              className="md:hidden p-2 text-gray-600 dark:text-gray-300"
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for groceries..."
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800"
                aria-label="Search products mobile"
              />
            </div>
            <nav className="space-y-2">
              <Link href="/" className="block py-2 text-gray-700 dark:text-gray-300" onClick={toggleMobileMenu}>Home</Link>
              <Link href="/products" className="block py-2 text-gray-700 dark:text-gray-300" onClick={toggleMobileMenu}>Products</Link>
              <Link href="/cart" className="block py-2 text-gray-700 dark:text-gray-300" onClick={toggleMobileMenu}>Cart ({itemCount})</Link>
              {isAuthenticated ? (
                <>
                  <Link href="/profile" className="block py-2 text-gray-700 dark:text-gray-300" onClick={toggleMobileMenu}>Profile</Link>
                  <Link href="/orders" className="block py-2 text-gray-700 dark:text-gray-300" onClick={toggleMobileMenu}>Orders</Link>
                  <button onClick={handleLogout} className="block py-2 text-red-600">Logout</button>
                </>
              ) : (
                <Link href="/login" className="block py-2 text-primary-600" onClick={toggleMobileMenu}>Login</Link>
              )}
            </nav>
          </div>
        )}
      </div>
    </nav>
  );
}
