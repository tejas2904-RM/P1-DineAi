'use client';

import { useEffect, useState, FormEvent } from 'react';
import type { PreferencePayload } from '@/lib/api';
import { getLocations } from '@/lib/api';
import { Sparkles, Loader2, MapPin, UtensilsCrossed } from 'lucide-react';

interface PreferenceFormProps {
  onSubmit: (payload: PreferencePayload) => void;
  loading: boolean;
  initialValues?: Partial<PreferencePayload>;
}

const CUISINE_SUGGESTIONS = ['Italian', 'Chinese', 'North Indian', 'Continental', 'South Indian', 'Biryani', 'Cafe'];

function toTitle(s: string): string {
  return s
    .split(' ')
    .map((w) => (w.length === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function PreferenceForm({ onSubmit, loading, initialValues }: PreferenceFormProps) {
  const [location, setLocation] = useState(initialValues?.location || '');
  const [budget, setBudget] = useState(initialValues?.budget || 'medium');
  const [cuisine, setCuisine] = useState(initialValues?.cuisine || '');
  const [minRating, setMinRating] = useState(initialValues?.minRating ?? 4.0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [locations, setLocations] = useState<string[]>([]);
  const [locLoading, setLocLoading] = useState(true);
  const [locError, setLocError] = useState<string | null>(null);

  function loadLocations() {
    setLocLoading(true);
    setLocError(null);
    getLocations()
      .then((items) => setLocations(Array.isArray(items) ? items : []))
      .catch((e) => {
        setLocError(e?.message || 'Failed to load locations');
        setLocations([]);
      })
      .finally(() => setLocLoading(false));
  }

  useEffect(() => {
    loadLocations();
  }, []);

  useEffect(() => {
    if (!location && locations.length > 0) setLocation(locations[0]);
  }, [locations, location]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!location.trim()) next.location = 'Location is required';
    if (!cuisine.trim()) next.cuisine = 'Cuisine is required';
    if (minRating < 0 || minRating > 5) next.minRating = 'Rating must be 0–5';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit({
      location: location.trim(),
      budget,
      cuisine: cuisine.trim(),
      minRating,
      topK: initialValues?.topK ?? 5,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 md:p-6 space-y-5" aria-label="Recommendation preferences">
      <div>
        <h2 className="text-xl font-bold">Your Preferences</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Tell us what you&apos;re craving and we&apos;ll find the best spots.
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <label htmlFor="location" className="label">Location</label>
          <div className="input-icon-wrap">
            <MapPin className="input-icon w-4 h-4" aria-hidden="true" />
            <select
              id="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={locLoading}
              aria-invalid={!!errors.location}
            >
              <option value="" disabled>
                {locLoading ? 'Loading…' : locations.length === 0 ? 'No locations' : 'Select location'}
              </option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{toTitle(loc)}</option>
              ))}
              {location && !locations.includes(location) && !locLoading && (
                <option value={location}>{toTitle(location)}</option>
              )}
            </select>
          </div>
          {locError && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>
              {locError}{' '}
              <button type="button" onClick={loadLocations} className="underline" style={{ color: 'var(--accent)' }}>
                Retry
              </button>
            </p>
          )}
          {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
        </div>

        <div>
          <span className="label">Budget</span>
          <div className="segmented" role="group" aria-label="Budget">
            {(['low', 'medium', 'high'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={budget === value ? 'active' : ''}
                onClick={() => setBudget(value)}
              >
                {value === 'low' ? 'Low' : value === 'high' ? 'High' : 'Medium'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="cuisine" className="label">Cuisine</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {CUISINE_SUGGESTIONS.map((item) => (
              <button
                key={item}
                type="button"
                className={`pill${cuisine.toLowerCase() === item.toLowerCase() ? ' active' : ''}`}
                onClick={() => setCuisine(item.toLowerCase())}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="input-icon-wrap">
            <UtensilsCrossed className="input-icon w-4 h-4" aria-hidden="true" />
            <input
              id="cuisine"
              type="text"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              placeholder="Or type a cuisine…"
              aria-invalid={!!errors.cuisine}
            />
          </div>
          {errors.cuisine && <p className="text-xs text-red-500 mt-1">{errors.cuisine}</p>}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="minRating" className="label mb-0">Minimum Rating</label>
            <span className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
              {minRating.toFixed(1)}+
            </span>
          </div>
          <input
            id="minRating"
            type="range"
            min="0"
            max="5"
            step="0.5"
            value={minRating}
            onChange={(e) => setMinRating(parseFloat(e.target.value))}
            className="range-slider"
          />
          {errors.minRating && <p className="text-xs text-red-500 mt-1">{errors.minRating}</p>}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full btn btn-primary py-3.5 text-base rounded-2xl disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> Finding restaurants…
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5" /> Find Restaurants
          </>
        )}
      </button>
    </form>
  );
}
