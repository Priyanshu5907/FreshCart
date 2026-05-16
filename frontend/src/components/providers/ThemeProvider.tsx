'use client';

import { useEffect } from 'react';
import { useUIStore } from '@/store/ui.store';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setTheme, setLanguage } = useUIStore();

  useEffect(() => {
    // Load persisted theme preference
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      // Default to OS preference on first visit
      setTheme('dark');
    }

    // Load persisted language preference
    const savedLang = localStorage.getItem('language') as 'en' | 'hi' | null;
    if (savedLang) {
      setLanguage(savedLang);
    }
  }, [setTheme, setLanguage]);

  return <>{children}</>;
}
