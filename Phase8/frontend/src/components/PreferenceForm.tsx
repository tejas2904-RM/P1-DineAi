'use client';

import { useEffect, useState, FormEvent } from 'react';
import type { PreferencePayload } from '@/lib/api';
import { getLocations } from '@/lib/api';
import { Search, Loader2, MapPin, UtensilsCrossed } from 'lucide-react';

interface PreferenceFormProps {
  onSubmit: (payload: PreferencePayload) => void;
  loading: boolean;
  initialValues?: Partial<PreferencePayload>;
}

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
  const [minRating, setMinRating] = useState(initialValues?.minRating?.toString() || '4.0');
  const [topK, setTopK] = useState(initialValues?.topK?.toString() || '5');
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
    const r = parseFloat(minRating);
    if (Number.isNaN(r) || r < 0 || r > 5) next.minRating = 'Rating must be 0–5';
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
      minRating: parseFloat(minRating),
      topK: parseInt(topK, 10) || 5,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 space-y-4" aria-label="Recommendation preferences">
      <h2 className="text-lg font-bold">Find restaurants</h2>

      <div className="space-y-4">
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
            <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
              {locError}{' '}
              <button type="button" onClick={loadLocations} className="underline" style={{ color: 'var(--accent)' }}>
                Retry
              </button>
            </p>
          )}
          {errors.location && <p className="text-xs text-red-500 mt-1">{errors.location}</p>}
        </div>

        <div>
          <label htmlFor="cuisine" className="label">Cuisine</label>
          <div className="input-icon-wrap">
            <UtensilsCrossed className="input-icon w-4 h-4" aria-hidden="true" />
            <input
              id="cuisine"
              type="text"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              placeholder="e.g. north indian"
              className="input"
              aria-invalid={!!errors.cuisine}
            />
          </div>
          {errors.cuisine && <p className="text-xs text-red-500 mt-1">{errors.cuisine}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="budget" className="label">Budget</label>
            <select id="budget" value={budget} onChange={(e) => setBudget(e.target.value)} className="input">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label htmlFor="minRating" className="label">Rating</label>
            <input
              id="minRating"
              type="number"
              min="0"
              max="5"
              step="0.1"
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="input"
            />
            {errors.minRating && <p className="text-xs text-red-500 mt-1">{errors.minRating}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="topK" className="label">Top K</label>
          <input
            id="topK"
            type="number"
            min="1"
            max="20"
            value={topK}
            onChange={(e) => setTopK(e.target.value)}
            className="input"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full btn btn-primary py-3 text-base rounded-xl disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" /> Searching…
          </>
        ) : (
          <>
            <Search className="w-5 h-5" /> Find restaurants
          </>
        )}
      </button>
    </form>
  );
}
