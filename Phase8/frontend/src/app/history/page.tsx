'use client';

import { useEffect, useState } from 'react';
import { getHistory, type HistoryEntry } from '@/lib/api';
import { Clock, MapPin, IndianRupee, Star, AlertTriangle } from 'lucide-react';

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHistory(50)
      .then((data) => setEntries(data))
      .catch((e) => setError(e?.message || 'Failed to load history.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clock className="w-6 h-6" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          Search History
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Past recommendation requests, most recent first.
        </p>
      </header>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 88 }} />
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
            <p className="font-semibold">Could not load history</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {error}
            </p>
          </div>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold">No history yet</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Run a recommendation from the dashboard and it will appear here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <article key={entry.requestId} className="card card-hover p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap gap-2">
                <span className="chip">
                  <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
                  {entry.location}
                </span>
                <span className="chip">{entry.cuisine}</span>
                <span className="chip">
                  <IndianRupee className="w-3.5 h-3.5" aria-hidden="true" />
                  {entry.budget}
                </span>
                <span className="chip">
                  <Star className="w-3.5 h-3.5" aria-hidden="true" />
                  ≥ {entry.minRating}
                </span>
              </div>
              <time
                dateTime={entry.timestamp}
                className="text-xs"
                style={{ color: 'var(--text-muted)' }}
              >
                {new Date(entry.timestamp).toLocaleString()}
              </time>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {entry.recommendations.slice(0, 5).map((rec) => (
                <li key={rec.restaurantId} className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{rec.rank}. {rec.name}</span>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>· {rec.cuisine}</span>
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {rec.rating}★ · ₹{rec.estimatedCost}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}
