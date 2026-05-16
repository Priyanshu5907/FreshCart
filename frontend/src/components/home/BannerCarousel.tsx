'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
}

export default function BannerCarousel({ banners }: { banners: Banner[] }) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => {
    setCurrent((c) => (c + 1) % banners.length);
  }, [banners.length]);

  const prev = () => setCurrent((c) => (c - 1 + banners.length) % banners.length);

  // Auto-play every 4 seconds
  useEffect(() => {
    if (isPaused || banners.length <= 1) return;
    const timer = setInterval(next, 4000);
    return () => clearInterval(timer);
  }, [isPaused, next, banners.length]);

  if (banners.length === 0) return null;

  const banner = banners[current];

  return (
    <div
      className="relative w-full h-48 sm:h-64 md:h-80 lg:h-96 overflow-hidden rounded-xl"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Promotional banners"
    >
      {banner.linkUrl ? (
        <Link href={banner.linkUrl}>
          <Image src={banner.imageUrl} alt={banner.title} fill className="object-cover" priority />
        </Link>
      ) : (
        <Image src={banner.imageUrl} alt={banner.title} fill className="object-cover" priority />
      )}

      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      <h2 className="absolute bottom-4 left-4 text-white text-xl font-bold">{banner.title}</h2>

      {banners.length > 1 && (
        <>
          <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-2 hover:bg-white" aria-label="Previous banner">‹</button>
          <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 rounded-full p-2 hover:bg-white" aria-label="Next banner">›</button>
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex space-x-1">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/50'}`}
                aria-label={`Go to banner ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
