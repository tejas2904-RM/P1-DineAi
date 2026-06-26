'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

export function MobileHeader() {
  return (
    <header className="mobile-header">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-lg font-extrabold gradient-text">DineWise</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
          <Sparkles className="w-2.5 h-2.5" aria-hidden="true" />
          AI
        </span>
      </Link>
    </header>
  );
}
