'use client';

import { useState } from 'react';
import type { RecommendationItem } from '@/lib/api';
import { addFavorite, removeFavorite, sendFeedback } from '@/lib/api';
import { getRestaurantImage, budgetSymbols } from '@/lib/restaurant-images';
import { Star, Heart, Share2, ThumbsUp, ThumbsDown, Sparkles } from 'lucide-react';

interface RecommendationCardProps {
  item: RecommendationItem;
  requestId: string;
  location?: string;
  budget?: string;
  onFavoriteToggle?: (restaurantId: string, favorited: boolean) => void;
}

function toTitle(s: string): string {
  return s
    .split(' ')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function RecommendationCard({
  item,
  requestId,
  location,
  budget = 'medium',
  onFavoriteToggle,
}: RecommendationCardProps) {
  const [favorited, setFavorited] = useState(false);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const imageUrl = getRestaurantImage(item.restaurantId);

  async function toggleFavorite() {
    try {
      if (favorited) {
        await removeFavorite(item.restaurantId);
        setFavorited(false);
        onFavoriteToggle?.(item.restaurantId, false);
      } else {
        await addFavorite({
          restaurantId: item.restaurantId,
          name: item.name,
          cuisine: item.cuisine,
          rating: item.rating,
          estimatedCost: item.estimatedCost,
        });
        setFavorited(true);
        onFavoriteToggle?.(item.restaurantId, true);
      }
    } catch (e) {
      console.error('favorite toggle failed', e);
    }
  }

  async function vote(value: 'up' | 'down') {
    setFeedback(value);
    try {
      await sendFeedback(requestId, item.restaurantId, value === 'up');
    } catch (e) {
      console.error('feedback failed', e);
    }
  }

  function share() {
    const text = `Check out ${item.name} (${item.cuisine}, ${item.rating}★)`;
    const url = `${window.location.origin}/?restaurant=${encodeURIComponent(item.restaurantId)}`;
    if (navigator.share) {
      navigator.share({ title: item.name, text, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(`${text} — ${url}`).catch(() => {});
      alert('Link copied to clipboard');
    }
  }

  return (
    <article
      className="card card-hover overflow-hidden flex flex-col md:flex-row"
      aria-label={`Recommendation ${item.rank}: ${item.name}`}
    >
      <div className="flex items-start gap-3 p-4 md:p-5 md:min-w-0 md:flex-1">
        <span className="rank-badge" aria-hidden="true">{item.rank}</span>

        <div className="relative w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base md:text-lg font-bold leading-tight">{item.name}</h3>
            <span className="rating-badge" aria-label={`Rating ${item.rating}`}>
              {item.rating.toFixed(1)} <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
            </span>
          </div>

          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {toTitle(item.cuisine.split(',')[0] || item.cuisine)}
            {location && <> · {toTitle(location)}</>}
            {' · '}{budgetSymbols(budget)}
            {' · '}₹{item.estimatedCost}
          </p>

          <div className="flex gap-1 pt-1">
            <button
              onClick={() => vote('up')}
              className="p-2 rounded-lg transition-colors"
              style={
                feedback === 'up'
                  ? { background: 'var(--accent-muted)', color: 'var(--accent)' }
                  : { color: 'var(--text-muted)' }
              }
              aria-label="Helpful"
              aria-pressed={feedback === 'up'}
            >
              <ThumbsUp className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={() => vote('down')}
              className="p-2 rounded-lg transition-colors"
              style={
                feedback === 'down'
                  ? { background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger)' }
                  : { color: 'var(--text-muted)' }
              }
              aria-label="Not helpful"
              aria-pressed={feedback === 'down'}
            >
              <ThumbsDown className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={share}
              className="p-2 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Share recommendation"
            >
              <Share2 className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              onClick={toggleFavorite}
              className="p-2 rounded-lg transition-colors ml-auto"
              style={{ color: favorited ? 'var(--accent)' : 'var(--text-muted)' }}
              aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
              aria-pressed={favorited}
            >
              <Heart className="w-4 h-4" fill={favorited ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div
        className="ai-insight m-4 mt-0 md:m-5 md:ml-0 md:max-w-xs md:flex-shrink-0"
      >
        <p className="text-xs font-bold mb-1.5 flex items-center gap-1" style={{ color: 'var(--accent)' }}>
          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
          Why recommended?
        </p>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {item.reason}
        </p>
      </div>
    </article>
  );
}
