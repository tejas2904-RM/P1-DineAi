'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Clock, Heart } from 'lucide-react';

export function MobileTabBar() {
  const pathname = usePathname();

  const links = [
    { href: '/', label: 'Home', icon: Home },
    { href: '/history', label: 'History', icon: Clock },
    { href: '/favorites', label: 'Saved', icon: Heart },
  ];

  return (
    <>
      <div className="mobile-tabbar-spacer" aria-hidden="true" />
      <nav className="mobile-tabbar" role="navigation" aria-label="Mobile tabs">
        {links.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
            >
              {active ? (
                <span className="tab-icon-active">
                  <Icon className="w-5 h-5" aria-hidden="true" />
                </span>
              ) : (
                <Icon className="w-5 h-5" aria-hidden="true" />
              )}
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
