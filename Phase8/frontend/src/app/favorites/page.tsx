'use client';

import { useEffect, useState } from 'react';
import {
  getFavorites,
  removeFavorite,
  type FavoriteItem,
} from '@/lib/api';
import { Heart, Star, IndianRupee, Trash2, AlertTriangle } from 'lucide-react';

export default function FavoritesPage() {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const data = await getFavorites();
      setItems(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load favorites.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRemove(restaurantId: string) {
    setItems((prev) => prev.filter((i) => i.restaurantId !== restaurantId));
    try {
      await removeFavorite(restaurantId);
    } catch {
      load();
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Heart className="w-6 h-6" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          Saved Restaurants
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Restaurants you&apos;ve saved for later.
        </p>
      </header>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160 }} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="card p-4 flex items-start gap-3"
          style={{ borderColor: 'var(--danger)' }}
        >
          <AlertTriangle className="w-5 h-5" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="font-semibold">Could not load favorites</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {error}
            </p>
          </div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="card p-8 text-center">
          <Heart
            className="w-10 h-10 mx-auto mb-3"
            style={{ color: 'var(--accent)' }}
            aria-hidden="true"
          />
          <p className="text-lg font-semibold">No favorites yet</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Tap the heart on any recommendation to save it here.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <article key={item.restaurantId} className="card card-hover p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-lg leading-tight">{item.name}</h2>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {item.cuisine}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(item.restaurantId)}
                  className="btn btn-ghost"
                  aria-label={`Remove ${item.name} from favorites`}
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="chip">
                  <Star className="w-3.5 h-3.5" aria-hidden="true" />
                  {item.rating}
                </span>
                <span className="chip">
                  <IndianRupee className="w-3.5 h-3.5" aria-hidden="true" />
                  {item.estimatedCost}
                </span>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                Added {new Date(item.addedAt).toLocaleDateString()}
              </p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
