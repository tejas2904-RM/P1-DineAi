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
import { List, Map as MapIcon, Sparkles, AlertTriangle, Loader2, Pencil, SlidersHorizontal } from 'lucide-react';

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
    <div className="space-y-5">
      {/* Hero greeting */}
      <section className="hero-card p-5 md:p-6">
        <div className="relative z-10 max-w-[85%]">
          <p
            className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2"
            style={{ color: 'var(--accent)' }}
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            AI Powered Dining
          </p>
          <h1 className="text-2xl md:text-3xl font-bold leading-tight">
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
                className="inline-flex items-center gap-1 hover:underline"
                title="Edit your name"
                aria-label="Edit your name"
              >
                {profile?.name || 'Guest'}
                <Pencil className="w-4 h-4 inline" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
              </button>
            )}
          </h1>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Find tailored dining recommendations powered by AI. Tell us what you crave and we&apos;ll handpick the best spots.
          </p>
        </div>
        {/* Decorative shapes */}
        <div className="absolute right-0 top-0 bottom-0 w-1/3 pointer-events-none overflow-hidden" aria-hidden="true">
          <div
            className="absolute right-4 top-6 w-16 h-16 rounded-full opacity-40"
            style={{ background: 'var(--rating-bg)' }}
          />
          <div
            className="absolute right-10 top-20 w-8 h-24 rounded-full opacity-30"
            style={{ background: 'var(--accent-soft)' }}
          />
          <div
            className="absolute right-2 bottom-8 w-20 h-20 rounded-2xl opacity-25 rotate-12"
            style={{ background: 'var(--rating-bg)' }}
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
            <div key={i} className="skeleton" style={{ height: 320 }} />
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
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold">
                {response.recommendations.length} recommendations
              </h2>
              <span className="tag-ai">
                {response.usedFallback ? 'Ranked' : 'AI-matched'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <div
                role="tablist"
                aria-label="View mode"
                className="hidden sm:inline-flex rounded-xl border p-0.5"
                style={{ borderColor: 'var(--border)' }}
              >
                <button
                  role="tab"
                  aria-selected={view === 'list'}
                  className="px-2.5 py-1.5 rounded-lg text-sm transition-colors"
                  style={
                    view === 'list'
                      ? { background: 'var(--accent-muted)', color: 'var(--accent)' }
                      : { color: 'var(--text-secondary)' }
                  }
                  onClick={() => setView('list')}
                >
                  <List className="w-4 h-4 inline" /> List
                </button>
                <button
                  role="tab"
                  aria-selected={view === 'map'}
                  className="px-2.5 py-1.5 rounded-lg text-sm transition-colors"
                  style={
                    view === 'map'
                      ? { background: 'var(--accent-muted)', color: 'var(--accent)' }
                      : { color: 'var(--text-secondary)' }
                  }
                  onClick={() => setView('map')}
                >
                  <MapIcon className="w-4 h-4 inline" /> Map
                </button>
              </div>
              <button
                type="button"
                className="p-2 rounded-lg border"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                aria-label="Filter options"
              >
                <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {response.summary && (
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{response.summary}</p>
          )}

          {view === 'list' ? (
            <div className="space-y-4 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">
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
        </section>
      )}

      {!loading && !response && !error && (
        <div className="card p-8 text-center">
          <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--accent)' }} aria-hidden="true" />
          <h2 className="text-lg font-bold">Ready when you are</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Fill in your preferences above and we&apos;ll do the rest.
          </p>
        </div>
      )}
    </div>
  );
}
