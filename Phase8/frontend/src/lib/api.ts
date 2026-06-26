const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api/v1';
const USER_ID_KEY = 'phase8-user-id';
const REQUEST_TIMEOUT_MS = 90_000;
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3_000;

let warmupPromise: Promise<void> | null = null;

export interface PreferencePayload {
  location: string;
  budget: string;
  cuisine: string;
  minRating: number;
  tags?: string[];
  topK?: number;
  userId?: string;
}

export interface RecommendationItem {
  rank: number;
  restaurantId: string;
  name: string;
  cuisine: string;
  rating: number;
  estimatedCost: number;
  reason: string;
}

export interface RecommendationResponse {
  requestId: string;
  recommendations: RecommendationItem[];
  summary?: string;
  usedFallback: boolean;
  latencyMs: number;
  fallbackReason?: string;
  circuitBreakerState?: string;
}

export interface UserProfile {
  userId: string;
  name: string;
  email?: string | null;
  createdAt: string;
}

export interface HistoryEntry {
  requestId: string;
  timestamp: string;
  userId: string;
  location: string;
  budget: string;
  cuisine: string;
  minRating: number;
  recommendations: RecommendationItem[];
}

export interface FavoriteItem {
  restaurantId: string;
  name: string;
  cuisine: string;
  rating: number;
  estimatedCost: number;
  addedAt: string;
}

const DEFAULT_API_KEY = 'phase7-demo-key';

export function getUserId(): string {
  if (typeof window === 'undefined') return 'anonymous';
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = 'user-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

function authHeaders(): Record<string, string> {
  const apiKey =
    (typeof window !== 'undefined' && localStorage.getItem('phase8-api-key')) ||
    DEFAULT_API_KEY;
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function friendlyError(status: number, body: string): string {
  if (status === 502 || status === 503 || status === 504) {
    return 'The recommendation service is waking up or temporarily unavailable. Please wait a moment and try again.';
  }
  if (status === 401 || status === 403) {
    return 'API authorization failed. Check that the backend API key is configured correctly.';
  }
  return `${status}: ${body || 'Request failed'}`;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { ...authHeaders(), ...(init?.headers || {}) },
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(
        'The request timed out while waiting for recommendations. The backend may be waking up — please try again.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, init);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (RETRYABLE_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new Error(friendlyError(res.status, text));
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Request failed');
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
    }
  }

  throw lastError ?? new Error('Request failed');
}

/** Wake Render backends before the first recommendation search. */
export function warmupBackend(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!warmupPromise) {
    warmupPromise = fetchWithTimeout(`${API_BASE}/health`)
      .then(() => undefined)
      .catch(() => undefined);
  }
  return warmupPromise;
}

// Recommendations ---------------------------------------------------------
export async function getRecommendations(payload: PreferencePayload): Promise<RecommendationResponse> {
  await warmupBackend();
  return jsonFetch<RecommendationResponse>(`${API_BASE}/recommendations`, {
    method: 'POST',
    body: JSON.stringify({ ...payload, userId: payload.userId || getUserId() }),
  });
}

// Locations --------------------------------------------------------------
export interface LocationsResponse {
  count: number;
  locations: string[];
}

export async function getLocations(): Promise<string[]> {
  const res = await jsonFetch<LocationsResponse>(`${API_BASE}/locations`);
  return res.locations;
}

// Cuisines ---------------------------------------------------------------
export interface CuisinesResponse {
  count: number;
  cuisines: string[];
}

export async function getCuisines(): Promise<string[]> {
  const res = await jsonFetch<CuisinesResponse>(`${API_BASE}/cuisines`);
  return res.cuisines;
}

// User --------------------------------------------------------------------
export async function getUserProfile(userId?: string): Promise<UserProfile> {
  const id = userId || getUserId();
  return jsonFetch<UserProfile>(`${API_BASE}/users/${id}`);
}

export async function updateUserProfile(name: string, email?: string): Promise<UserProfile> {
  const id = getUserId();
  return jsonFetch<UserProfile>(`${API_BASE}/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, email }),
  });
}

// History -----------------------------------------------------------------
export async function getHistory(limit = 20): Promise<HistoryEntry[]> {
  const id = getUserId();
  return jsonFetch<HistoryEntry[]>(`${API_BASE}/history?userId=${id}&limit=${limit}`);
}

// Favorites ---------------------------------------------------------------
export async function getFavorites(): Promise<FavoriteItem[]> {
  const id = getUserId();
  return jsonFetch<FavoriteItem[]>(`${API_BASE}/favorites?userId=${id}`);
}

export async function addFavorite(item: Omit<FavoriteItem, 'addedAt'>): Promise<FavoriteItem> {
  const id = getUserId();
  return jsonFetch<FavoriteItem>(`${API_BASE}/favorites`, {
    method: 'POST',
    body: JSON.stringify({ ...item, userId: id }),
  });
}

export async function removeFavorite(restaurantId: string): Promise<void> {
  const id = getUserId();
  await fetch(`${API_BASE}/favorites/${encodeURIComponent(restaurantId)}?userId=${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

// Feedback ----------------------------------------------------------------
export async function sendFeedback(requestId: string, restaurantId: string, helpful: boolean, comment?: string): Promise<void> {
  await fetch(`${API_BASE}/feedback`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ requestId, restaurantId, helpful, comment, userId: getUserId() }),
  });
}
