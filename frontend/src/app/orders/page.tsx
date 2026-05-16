'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';

interface Order {
  id: string; status: string; total: number; createdAt: string;
  items: Array<{ productName: string; quantity: number }>;
  _count: { items: number };
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'bg-blue-100 text-blue-700',
  processing: 'bg-yellow-100 text-yellow-700',
  shipped: 'bg-purple-100 text-purple-700',
  out_for_delivery: 'bg-orange-100 text-orange-700',
  delivered: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      try {
        const res = await apiFetch<{ data: Order[]; pagination: { totalPages: number } }>(`/orders?page=${page}`);
        setOrders(res.data);
        setTotalPages(res.pagination.totalPages);
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
    };
    void fetchOrders();
  }, [page]);

  const handleReorder = async (orderId: string) => {
    try {
      const res = await apiFetch<{ message: string }>(`/orders/${orderId}/reorder`, { method: 'POST' });
      alert(res.message);
    } catch (err) { console.error(err); }
  };

  if (isLoading) return <div className="max-w-4xl mx-auto px-4 py-8 text-center">Loading orders...</div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">My Orders</h1>

      {orders.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📦</p>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No orders yet</h2>
          <Link href="/products" className="text-primary-600 hover:text-primary-700 font-medium">Start shopping →</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{new Date(order.createdAt).toLocaleDateString()}</p>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {order.status.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {order.items.slice(0, 2).map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                {order._count.items > 2 && ` +${order._count.items - 2} more`}
              </p>
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-900 dark:text-white">₹{Number(order.total).toFixed(0)}</p>
                <div className="flex gap-3">
                  <Link href={`/orders/${order.id}`} className="text-sm text-primary-600 hover:text-primary-700 font-medium">View Details</Link>
                  <button onClick={() => handleReorder(order.id)} className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Reorder</button>
                </div>
              </div>
            </div>
          ))}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button key={p} onClick={() => setPage(p)}
                  className={`px-3 py-1 rounded-lg text-sm ${p === page ? 'bg-primary-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                  aria-current={p === page ? 'page' : undefined}
                >{p}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
