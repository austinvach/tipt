import { useState, useEffect, useRef } from "react";
import { fetchFilms, unlockStream, probeExtension, formatDuration, type FilmInfo, type StreamResult } from "@/lib/mpp";
import { Zap, Clock, Calendar, AlertTriangle, Loader2, X, ExternalLink, Play } from "lucide-react";
import AppHeader from "@/components/AppHeader";

const MAX_FILMS = 5;

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; films: FilmInfo[]; hasExtension: boolean | null }
  | { kind: "paying"; films: FilmInfo[]; hasExtension: boolean | null; filmId: string }
  | { kind: "playing"; stream: StreamResult; autoplayBlocked?: boolean; videoError?: string }
  | { kind: "error"; message: string };

export default function Movies() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const videoRef = useRef<HTMLVideoElement>(null);

  function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  async function loadCatalog() {
    try {
      const [films, hasExtension] = await Promise.all([
        fetchFilms(MAX_FILMS),
        probeExtension(),
      ]);
      setPhase({ kind: "ready", films, hasExtension });
    } catch (err) {
      setPhase({ kind: "error", message: errorMessage(err) });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [films, hasExtension] = await Promise.all([
          fetchFilms(MAX_FILMS),
          probeExtension(),
        ]);
        if (!cancelled) {
          setPhase({ kind: "ready", films, hasExtension });
        }
      } catch (err) {
        if (!cancelled) {
          setPhase({ kind: "error", message: errorMessage(err) });
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  async function handleWatch(filmId: string) {
    setPhase((prev) => {
      if (prev.kind !== "ready") return prev;
      return { kind: "paying", films: prev.films, hasExtension: prev.hasExtension, filmId };
    });
    try {
      const stream = await unlockStream(filmId);
      setPhase({ kind: "playing", stream });
    } catch (err) {
      const msg = errorMessage(err);
      setPhase({ kind: "error", message: msg });
      setTimeout(async () => {
        await loadCatalog();
      }, 4000);
    }
  }

  useEffect(() => {
    if (phase.kind !== "playing") return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      setPhase((prev) => prev.kind === "playing" ? { ...prev, autoplayBlocked: true } : prev);
    });
  }, [phase.kind]);

  function handleClose() {
    videoRef.current?.pause();
    setPhase({ kind: "loading" });
    loadCatalog();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AppHeader pageTitle="Video On-Demand" />

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-3 py-4 sm:px-4 sm:py-8">
        {phase.kind === "loading" && (
          <div className="flex flex-col items-center gap-4 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text-sm">Loading films...</p>
          </div>
        )}

        {phase.kind === "error" && (
          <div className="max-w-md text-center space-y-4">
            <AlertTriangle className="w-10 h-10 text-destructive mx-auto" />
            <h2 className="text-xl font-semibold text-foreground">Something went wrong</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{phase.message}</p>
            <button
              onClick={() => {
                setPhase({ kind: "loading" });
                loadCatalog();
              }}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground text-sm hover:bg-accent transition-colors"
            >
              Try again
            </button>
          </div>
        )}

        {(phase.kind === "ready" || phase.kind === "paying") && (
          <FilmGrid
            films={phase.films}
            hasExtension={phase.hasExtension}
            payingFilmId={phase.kind === "paying" ? phase.filmId : null}
            onWatch={handleWatch}
          />
        )}

        {phase.kind === "playing" && (
          <VideoPlayer
            stream={phase.stream}
            videoRef={videoRef}
            autoplayBlocked={phase.autoplayBlocked ?? false}
            videoError={phase.videoError}
            onVideoError={(msg) => setPhase((prev) => prev.kind === "playing" ? { ...prev, videoError: msg } : prev)}
            onClose={handleClose}
          />
        )}
      </main>
    </div>
  );
}

function FilmGrid({
  films,
  hasExtension,
  payingFilmId,
  onWatch,
}: {
  films: FilmInfo[];
  hasExtension: boolean | null;
  payingFilmId: string | null;
  onWatch: (filmId: string) => void;
}) {
  return (
    <div className="w-full max-w-7xl space-y-3 sm:space-y-4">
      {hasExtension === false && (
        <div className="flex items-start gap-3 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground leading-relaxed">
            <span className="text-foreground font-medium">MPP browser extension not detected.</span>{" "}
            Install a compatible Lightning wallet extension to pay.{" "}
            <a
              href="https://github.com/buildonspark/mppx"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              Learn more <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,280px))] justify-center gap-3 sm:gap-4 xl:grid-cols-[repeat(auto-fit,minmax(220px,300px))]">
        {films.map((film) => {
          const paying = payingFilmId === film.id;
          const isBusy = payingFilmId !== null;
          return (
            <article key={film.id} className="w-full min-w-[220px] rounded-2xl overflow-hidden border border-border bg-card shadow-xl">
              <div className="relative w-full min-h-[330px] aspect-[2/3] bg-muted overflow-hidden">
                {film.thumbnail ? (
                  <img
                    src={film.thumbnail}
                    alt={film.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                  </div>
                )}
                <div className="absolute inset-0 bg-linear-to-t from-card/80 via-transparent to-transparent" />
              </div>

              <div className="p-3 sm:p-4 space-y-2 sm:space-y-2.5">
                <div>
                  <h2 className="text-lg sm:text-xl lg:text-lg font-bold text-foreground tracking-tight line-clamp-1">{film.title}</h2>
                  <div className="flex items-center gap-3 sm:gap-4 mt-1 text-xs sm:text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {film.year}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(film.duration)}
                    </span>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed line-clamp-2">
                  {film.description}
                </p>

                {hasExtension === true && (
                  <>
                    <button
                      onClick={() => onWatch(film.id)}
                      disabled={isBusy}
                      className="w-full flex items-center justify-center gap-2.5 py-2.5 sm:py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-xs sm:text-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
                    >
                      {paying ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Waiting for payment...
                        </>
                      ) : (
                        <>Stream Now ({film.currency === "BTC" ? "₿" : ""}{film.price})</>
                      )}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4">
        No subscription. No account. Pick a film and pay once to watch instantly.
      </p>
    </div>
  );
}

function VideoPlayer({
  stream,
  videoRef,
  autoplayBlocked,
  videoError,
  onVideoError,
  onClose,
}: {
  stream: StreamResult;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  autoplayBlocked: boolean;
  videoError?: string;
  onVideoError: (msg: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="w-full max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">{stream.title}</h2>
          <p className="text-sm text-muted-foreground">{stream.year} &middot; {formatDuration(stream.duration)}</p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
        >
          <X className="w-4 h-4" />
          Close
        </button>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-border shadow-2xl bg-black aspect-video">
        <video
          ref={videoRef}
          src={stream.url}
          controls
          className="w-full h-full"
          onError={(e) => {
            const video = e.currentTarget;
            const code = video.error?.code ?? 0;
            const messages: Record<number, string> = {
              1: "Video loading was aborted.",
              2: "Network error while loading video.",
              3: "Video decoding failed.",
              4: "Video format not supported.",
            };
            onVideoError(messages[code] ?? "Failed to load video.");
          }}
        >
          Your browser does not support the video element.
        </video>
        {autoplayBlocked && !videoError && (
          <button
            onClick={() => videoRef.current?.play()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 hover:bg-black/50 transition-colors text-white"
            aria-label="Play video"
          >
            <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm border border-white/30">
              <Play className="w-8 h-8 fill-white text-white ml-1" />
            </div>
            <span className="text-sm font-medium">Click to play</span>
          </button>
        )}
        {videoError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 text-white">
            <AlertTriangle className="w-10 h-10 text-destructive" />
            <p className="text-sm text-center px-6">{videoError}</p>
            <a
              href={stream.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              Try opening directly <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Zap className="w-3.5 h-3.5 text-primary" />
        Payment confirmed &middot; Enjoy the film
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Having trouble?</span>{" "}
        You can also{" "}
        <a
          href={stream.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          open in a new tab <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
