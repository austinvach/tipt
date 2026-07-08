import {
  createExtensionClient,
} from "@tipt/sdk";

const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
// Keep browser requests same-origin so Next.js rewrites handle proxying and
// we avoid CORS when targeting a local API host.
const API_BASE = configuredApiBase && /^https?:\/\//i.test(configuredApiBase)
  ? "/api"
  : (configuredApiBase || "/api");
const MPP_EXTENSION_EVENT = "mpp:extension";

export interface FilmInfo {
  id: string;
  title: string;
  year: number;
  duration: number;
  description: string;
  thumbnail: string;
  price: string;
  currency: string;
}

export interface StreamResult {
  url: string;
  title: string;
  year: number;
  duration: number;
}

export interface NewsPreview {
  id: string;
  title: string;
  publishedAt: string;
  summary: string;
  excerpt: string;
  articlePreview: string;
  author: string;
  price: string;
  currency: string;
  url?: string;
}

export interface NewsArticle extends NewsPreview {
  fullArticle: string;
}

export interface PremiumImageRequest {
  prompt: string;
}

function normalizeFilm(raw: unknown): FilmInfo | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const film = raw as Partial<FilmInfo>;
  if (!film.id || !film.title) {
    return null;
  }

  return {
    id: film.id,
    title: film.title,
    year: typeof film.year === "number" ? film.year : 0,
    duration: typeof film.duration === "number" ? film.duration : 0,
    description: film.description ?? "",
    thumbnail: film.thumbnail ?? "",
    price: film.price ?? "",
    currency: film.currency ?? "",
  };
}

function buildClient() {
  return createExtensionClient({
    polyfill: false,
    extensionProbeTimeoutMs: 1500,
  });
}

function explainUnlockError(message: string): string {
  if (message.toLowerCase().includes('extension context invalidated')) {
    return 'TIPT extension reloaded or updated while this page was open. Reload this tab and try again.';
  }
  if (message.includes('locked')) {
    return 'Wallet is locked. Open the extension popup and unlock with your PIN, then retry.';
  }
  if (message.includes('declined')) {
    return 'Payment was declined in the extension approval popup.';
  }
  if (message.includes('unavailable')) {
    return 'Wallet is not ready. Ensure TIPT is loaded, wallet setup is complete, and the extension was reloaded after the latest build.';
  }
  if (message.includes('failed')) {
    return 'Payment failed in the extension wallet flow. Check extension service-worker logs for the underlying wallet error and ensure the wallet has sufficient balance.';
  }
  return message;
}

function normalizeNewsPreview(raw: unknown): NewsPreview | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const news = raw as Record<string, unknown>;
  const id = typeof news.id === "string" ? news.id : "";
  const title = typeof news.title === "string" ? news.title : "";

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    publishedAt: typeof news.publishedAt === "string" ? news.publishedAt : "",
    summary: typeof news.summary === "string" ? news.summary : "",
    excerpt: typeof news.excerpt === "string" ? news.excerpt : "",
    articlePreview: typeof news.articlePreview === "string" ? news.articlePreview : "",
    author: typeof news.author === "string" ? news.author : "",
    price: typeof news.price === "string" ? news.price : "",
    currency: typeof news.currency === "string" ? news.currency : "BTC",
    url: typeof news.url === "string" ? news.url : undefined,
  };
}

function extractFullArticle(raw: unknown): string {
  if (!raw || typeof raw !== "object") {
    return "";
  }

  const news = raw as Record<string, unknown>;
  const candidates = [
    news.fullArticle,
    news.article,
    news.content,
    news.body,
    news.text,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  return "";
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as { error?: string; message?: string };
      return data.error || data.message || fallback;
    }

    const text = await response.text();
    if (text.trim()) {
      return text;
    }
  } catch {
    // If the body cannot be parsed, return a generic fallback.
  }

  return fallback;
}

export async function fetchFilms(limit = 5): Promise<FilmInfo[]> {
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  const target = `${API_BASE}/movies`;

  try {
    const res = await fetch(target);
    if (!res.ok) {
      const detail = await parseErrorMessage(res, `HTTP ${res.status}`);
      throw new Error(`Failed to fetch film list (${res.status}): ${detail}`);
    }

    const payload = await res.json();
    if (Array.isArray(payload)) {
      const films = payload
        .map((film) => normalizeFilm(film))
        .filter((film): film is FilmInfo => film !== null)
        .slice(0, safeLimit);

      if (!films.length) {
        throw new Error("No films available");
      }
      return films;
    }

    const single = normalizeFilm(payload);
    if (single) {
      return [single];
    }

    throw new Error("Received invalid film payload");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch film list: ${message}`);
  }
}

export async function fetchFilmInfo(): Promise<FilmInfo> {
  const films = await fetchFilms(1);
  const first = films[0];
  if (!first) {
    throw new Error("No films available");
  }
  return first;
}

export async function fetchNewsPreviews(limit = 10): Promise<NewsPreview[]> {
  const safeLimit = Math.max(1, Math.min(20, Math.floor(limit)));
  const target = `${API_BASE}/news`;

  const response = await fetch(target);
  if (!response.ok) {
    const detail = await parseErrorMessage(response, `HTTP ${response.status}`);
    throw new Error(`Failed to fetch news (${response.status}): ${detail}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Received invalid news payload");
  }

  const previews = payload
    .map((item) => normalizeNewsPreview(item))
    .filter((item): item is NewsPreview => item !== null)
    .slice(0, safeLimit);

  if (!previews.length) {
    throw new Error("No news articles available");
  }

  return previews;
}

export async function fetchNewsPreview(): Promise<NewsPreview> {
  const previews = await fetchNewsPreviews(1);
  const first = previews[0];
  if (!first) {
    throw new Error("No news articles available");
  }
  return first;
}

export async function fetchNewsPreviewById(id: string): Promise<NewsPreview> {
  const targetId = id.trim();
  if (!targetId) {
    throw new Error("Missing news article id");
  }

  const previews = await fetchNewsPreviews(20);
  const match = previews.find((item) => item.id === targetId);
  if (!match) {
    throw new Error("News article not found");
  }

  return match;
}

export async function probeExtension(timeoutMs = 1500): Promise<boolean> {
  console.log("[mpp] probeExtension: probing via SDK");
  try {
    const response = await new Promise<unknown>((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("MPP extension probing requires a browser window context."));
        return;
      }

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("MPP extension was not detected on this page."));
      }, timeoutMs);

      const onResponse = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (detail?.type !== "response") {
          return;
        }

        cleanup();
        resolve(detail);
      };

      const cleanup = () => {
        window.clearTimeout(timer);
        window.removeEventListener(MPP_EXTENSION_EVENT, onResponse);
      };

      window.addEventListener(MPP_EXTENSION_EVENT, onResponse);
      window.dispatchEvent(
        new CustomEvent(MPP_EXTENSION_EVENT, {
          detail: {
            type: "request",
            paymentMethods: ["lightning"],
            intents: ["charge"],
          },
        }),
      );
    });
    console.log("[mpp] probeExtension: extension responded", response);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log("[mpp] probeExtension: failed", message);
    return false;
  }
}

export async function unlockStream(filmId: string): Promise<StreamResult> {
  console.log("[mpp] unlockStream: requesting paid stream via SDK client", { filmId });
  const client = buildClient();

  const target = `${API_BASE}/movies/${encodeURIComponent(filmId)}`;

  try {
    const response = await client.fetch(target, {
      method: "GET",
    });
    if (!response.ok) {
      const detail = await parseErrorMessage(response, response.statusText);
      throw new Error(`Stream unlock failed: ${response.status} ${detail}`);
    }

    const result = (await response.json()) as StreamResult;
    console.log("[mpp] unlockStream: success! URL:", result.url);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Missing WWW-Authenticate header")) {
      throw new Error(`${message}. Ensure ${API_BASE}/movies/:id returns the upstream payment challenge response.`);
    }
    throw new Error(`Stream unlock failed: ${explainUnlockError(message)}`);
  }
}

export async function unlockNewsArticle(preview: NewsPreview): Promise<NewsArticle> {
  console.log("[mpp] unlockNewsArticle: requesting paid article via SDK client", { id: preview.id });
  const client = buildClient();

  const target = `${API_BASE}/news/${encodeURIComponent(preview.id)}`;
  const response = await client.fetch(target, { method: "GET" });
  if (!response.ok) {
    const detail = await parseErrorMessage(response, response.statusText);
    throw new Error(`News unlock failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const fullArticle = extractFullArticle(payload);
  if (!fullArticle) {
    throw new Error("News unlock succeeded, but full article content was missing.");
  }

  return {
    ...preview,
    fullArticle,
  };
}

export async function unlockGeneratedImage({
  prompt,
}: PremiumImageRequest): Promise<Blob> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new Error("Missing generation prompt.");
  }

  const client = buildClient();

  const target = `${API_BASE}/image`;

  const response = await client.fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt: trimmedPrompt,
    }),
  });

  if (!response.ok) {
    const detail = await parseErrorMessage(response, response.statusText);
    throw new Error(`Image generation failed (${response.status}): ${detail}`);
  }

  return await response.blob();
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}h ${m}m`;
  }
  return `${m}m ${s > 0 ? `${s}s` : ""}`.trim();
}
