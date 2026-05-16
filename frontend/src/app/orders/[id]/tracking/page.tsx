'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';

interface TrackingData {
  id: string; status: string; deliveredAt: string | null;
  statusHistory: Array<{ status: string; createdAt: string; note: string | null }>;
  deliveryPartnerLocation: { latitude: number; longitude: number; updatedAt: string } | null;
}

const STATUS_STEPS = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];

export default function OrderTrackingPage({ params }: { params: { id: string } }) {
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLocationStale, setIsLocationStale] = useState(false);

  useEffect(() => {
    const fetchTracking = async () => {
      try {
        const res = await apiFetch<{ data: TrackingData }>(`/orders/${params.id}/tracking`);
        setTracking(res.data);
      } catch (err) { console.error(err); }
      finally { setIsLoading(false); }
    };
    void fetchTracking();

    // Subscribe to real-time order status updates
    const socket = getSocket();
    socket.emit('join:order', { orderId: params.id });

    socket.on('order:status', (data: { orderId: string; status: string }) => {
      if (data.orderId === params.id) {
        setTracking((t) => t ? { ...t, status: data.status } : t);
      }
    });

    socket.on('delivery:location', (data: { orderId: string; lat: number; lng: number; updatedAt: string }) => {
      if (data.orderId === params.id) {
        setTracking((t) => t ? { ...t, deliveryPartnerLocation: { latitude: data.lat, longitude: data.lng, updatedAt: data.updatedAt } } : t);
        setIsLocationStale(false);
      }
    });

    // Stale location indicator after 60 seconds
    const staleTimer = setInterval(() => {
      setTracking((t) => {
        if (t?.deliveryPartnerLocation) {
          const lastUpdate = new Date(t.deliveryPartnerLocation.updatedAt).getTime();
          if (Date.now() - lastUpdate > 60000) setIsLocationStale(true);
        }
        return t;
      });
    }, 10000);

    return () => {
      socket.off('order:status');
      socket.off('delivery:location');
      clearInterval(staleTimer);
    };
  }, [params.id]);

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-8 text-center">Loading tracking...</div>;
  if (!tracking) return <div className="max-w-2xl mx-auto px-4 py-8 text-center">Order not found</div>;

  const currentStep = STATUS_STEPS.indexOf(tracking.status);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Order Tracking</h1>

      {/* Status Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm mb-6">
        <div className="relative">
          {STATUS_STEPS.map((step, i) => (
            <div key={step} className="flex items-start mb-4 last:mb-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-none mr-4 ${i <= currentStep ? 'bg-primary-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                {i < currentStep ? '✓' : i === currentStep ? '●' : '○'}
              </div>
              <div>
                <p className={`font-medium ${i <= currentStep ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                  {step.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </p>
                {tracking.statusHistory.find((h) => h.status === step) && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(tracking.statusHistory.find((h) => h.status === step)!.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery Location */}
      {tracking.status === 'out_for_delivery' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 className="font-bold text-gray-900 dark:text-white mb-3">Live Tracking</h2>
          {tracking.deliveryPartnerLocation ? (
            <div>
              {isLocationStale ? (
                <p className="text-orange-500 text-sm">📍 Location temporarily unavailable</p>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  📍 Delivery partner is on the way
                  <br />
                  Last updated: {new Date(tracking.deliveryPartnerLocation.updatedAt).toLocaleTimeString()}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">Waiting for location updates...</p>
          )}
        </div>
      )}
    </div>
  );
}
