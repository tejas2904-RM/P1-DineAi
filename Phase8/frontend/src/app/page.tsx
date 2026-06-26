'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { PreferenceForm } from '@/components/PreferenceForm';
import { RecommendationCard } from '@/components/RecommendationCard';
import { RecentSearches } from '@/components/RecentSearches';
import {
  getRecommendations,
  getUserProfile,
  updateUserProfile,
  warmupBackend,
  type PreferencePayload,
  type RecommendationResponse,
  type UserProfile,
} from '@/lib/api';
import { saveSearch } from '@/lib/user-store';
import { List, Map as MapIcon, Sparkles, AlertTriangle, Pencil, RefreshCw } from 'lucide-react';

const MapView = dynamic(
  () => import('@/components/MapView').then((m) => m.MapView),
  { ssr: false, loading: () => <div className="skeleton" style={{ height: 500 }} /> },
);

type ViewMode = 'list' | 'map';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<RecommendationResponse | null>(null);
  const [lastPayload, setLastPayload] = useState<PreferencePayload | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    warmupBackend();
    getUserProfile()
      .then((p) => {
        setProfile(p);
        setNameInput(p.name);
      })
      .catch(() => {});
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  async function handleSubmit(payload: PreferencePayload) {
    setLoading(true);
    setError(null);
    setResponse(null);
    setLastPayload(payload);
    try {
      const res = await getRecommendations(payload);
      setResponse(res);
      saveSearch(payload, res);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch recommendations.');
    } finally {
      setLoading(false);
    }
  }

  function handleSelectRecent(payload: PreferencePayload) {
    handleSubmit(payload);
  }

  async function saveName() {
    if (!nameInput.trim()) return;
    try {
      const p = await updateUserProfile(nameInput.trim(), profile?.email || undefined);
      setProfile(p);
      setEditingName(false);
    } catch {}
  }

  return (
    <div className="space-y-6">
      <section className="hero-card p-6 md:p-8">
        <div className="relative z-10 max-w-xl">
          <p
            className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-3"
            style={{ color: 'var(--accent)' }}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            AI Powered Dining
          </p>
          <h1 className="text-3xl md:text-4xl font-extrabold leading-tight tracking-tight">
            Find your perfect restaurant{' '}
            <span className="gradient-text">with AI</span>
          </h1>
          <p className="mt-3 text-sm md:text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {greeting},{' '}
            {editingName ? (
              <span className="inline-flex items-center gap-2 flex-wrap">
                <input
                  className="input max-w-[180px] py-1"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  aria-label="Your name"
                />
                <button className="btn btn-primary text-sm py-1" onClick={saveName}>Save</button>
                <button
                  className="btn btn-ghost text-sm py-1"
                  onClick={() => {
                    setEditingName(false);
                    setNameInput(profile?.name || '');
                  }}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="inline-flex items-center gap-1 hover:underline font-medium"
                style={{ color: 'var(--text-primary)' }}
                title="Edit your name"
                aria-label="Edit your name"
              >
                {profile?.name || 'Guest'}
                <Pencil className="w-3.5 h-3.5 inline" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              </button>
            )}
            . Tell us what you crave and we&apos;ll handpick the best spots.
          </p>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-2/5 pointer-events-none overflow-hidden hidden sm:block" aria-hidden="true">
          <div
            className="absolute right-6 top-8 w-28 h-28 rounded-3xl opacity-20 rotate-12"
            style={{ background: 'var(--accent-gradient)' }}
          />
          <div
            className="absolute right-16 bottom-10 w-20 h-20 rounded-full opacity-15"
            style={{ background: 'var(--accent)' }}
          />
        </div>
      </section>

      <PreferenceForm
        onSubmit={handleSubmit}
        loading={loading}
        initialValues={lastPayload || undefined}
      />

      <RecentSearches key={refreshKey} onSelect={handleSelectRecent} />

      {loading && (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 160 }} />
          ))}
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="card p-4 flex items-start gap-3" style={{ borderColor: 'var(--danger)' }}>
          <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--danger)' }} />
          <div>
            <p className="font-semibold">Something went wrong</p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          </div>
        </div>
      )}

      {response && !loading && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold">Top AI Recommendations</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {response.recommendations.length} results ·{' '}
                <span className="tag-ai">{response.usedFallback ? 'Ranked' : 'AI-matched'}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lastPayload && (
                <button
                  type="button"
                  onClick={() => handleSubmit(lastPayload)}
                  className="btn btn-ghost text-sm py-2"
                  aria-label="Regenerate recommendations"
                >
                  <RefreshCw className="w-4 h-4" /> Regenerate
                </button>
              )}
              <div
                role="tablist"
                aria-label="View mode"
                className="segmented"
              >
                <button
                  role="tab"
                  aria-selected={view === 'list'}
                  type="button"
                  className={view === 'list' ? 'active' : ''}
                  onClick={() => setView('list')}
                >
                  <List className="w-4 h-4 inline" /> List
                </button>
                <button
                  role="tab"
                  aria-selected={view === 'map'}
                  type="button"
                  className={view === 'map' ? 'active' : ''}
                  onClick={() => setView('map')}
                >
                  <MapIcon className="w-4 h-4 inline" /> Map
                </button>
              </div>
            </div>
          </div>

          {response.summary && (
            <p className="text-sm card p-4" style={{ color: 'var(--text-secondary)' }}>{response.summary}</p>
          )}

          {view === 'list' ? (
            <div className="space-y-4">
              {response.recommendations.map((item) => (
                <RecommendationCard
                  key={item.restaurantId}
                  item={item}
                  requestId={response.requestId}
                  location={lastPayload?.location}
                  budget={lastPayload?.budget}
                />
              ))}
            </div>
          ) : (
            <MapView
              location={lastPayload?.location || ''}
              recommendations={response.recommendations}
            />
          )}

          <p className="text-xs text-center pt-2" style={{ color: 'var(--text-muted)' }}>
            Recommendations are AI-generated based on your preferences.
          </p>
        </section>
      )}

      {!loading && !response && !error && (
        <div className="card p-10 text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          <h2 className="text-lg font-bold">Ready when you are</h2>
          <p className="text-sm mt-2 max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Set your preferences above and tap Find Restaurants to get personalized picks.
          </p>
        </div>
      )}
    </div>
  );
}
