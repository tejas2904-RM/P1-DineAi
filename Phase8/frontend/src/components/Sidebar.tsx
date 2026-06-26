'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Clock, Heart, Sparkles } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

const links = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/favorites', label: 'Saved', icon: Heart },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar" aria-label="Sidebar navigation">
      <div className="sidebar-logo">
        <span className="sidebar-logo-mark">DineWise</span>
        <span className="sidebar-logo-sub flex items-center gap-1">
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          AI Recommender
        </span>
      </div>

      <nav className="sidebar-nav">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`sidebar-link${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="flex items-center justify-between px-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
            Theme
          </span>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
