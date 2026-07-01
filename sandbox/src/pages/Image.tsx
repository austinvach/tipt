import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, ExternalLink, Loader2, WandSparkles } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { probeExtension, unlockGeneratedImage } from "@/lib/mpp";

const POINTILLISM_TEMPLATE = `Create a painting in the style of pointillism. Paint only tiny dabs of primary colors close to each other to intensify the viewer's perception of colors.

Build the image with atmospheric texture, vivid yet harmonious color relationships, and a gallery-quality fine art finish.

Creative direction from the user: {USER_PROMPT}

Overall composition: polished fine-art portrait or scene with elegant structure, rich surface texture, and strong visual cohesion. No graphic card layout, no logo, no label plate, no decorative border, and no extra white margin around the artwork. The artwork should fill the entire image.`;

function buildPrompt(userPrompt: string): string {
  return POINTILLISM_TEMPLATE.replaceAll("{USER_PROMPT}", userPrompt.trim());
}

export default function ImageGen() {
  const [userPrompt, setUserPrompt] = useState("");
  const [generatedImageUrl, setGeneratedImageUrl] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [hasExtension, setHasExtension] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadExtensionStatus() {
      const detected = await probeExtension();
      if (!cancelled) {
        setHasExtension(detected);
      }
    }

    loadExtensionStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (generatedImageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(generatedImageUrl);
      }
    };
  }, [generatedImageUrl]);

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setGeneratedImageUrl("");
    setSubmittedPrompt("");

    const trimmedPrompt = userPrompt.trim();

    if (!trimmedPrompt) {
      setError("Please enter the creative direction for the piece.");
      return;
    }

    if (hasExtension !== true) {
      setError("MPP extension is required to pay and unlock image generation.");
      return;
    }

    setIsGenerating(true);
    try {
      const imageBlob = await unlockGeneratedImage({
        prompt: buildPrompt(trimmedPrompt),
      });
      const nextUrl = URL.createObjectURL(imageBlob);
      setGeneratedImageUrl((previousUrl) => {
        if (previousUrl.startsWith("blob:")) {
          URL.revokeObjectURL(previousUrl);
        }
        return nextUrl;
      });
      setSubmittedPrompt(trimmedPrompt);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader pageTitle="Image Gen" />

      <main className="px-6 py-10">
        {!generatedImageUrl && (
          <section className="mx-auto max-w-2xl">
            <form onSubmit={handleGenerate} className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div>
                <h1 className="text-2xl font-bold">Pointillism Image Gen</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Describe the piece you want to generate, then pay via MPP to create the artwork.
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-medium">Creative direction</span>
                <textarea
                  value={userPrompt}
                  onChange={(event) => setUserPrompt(event.target.value)}
                  placeholder="e.g. riverside at sunset"
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
              </label>

              {hasExtension === false && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-left text-xs leading-relaxed text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  <span>
                    MPP browser extension not detected. Install a compatible Lightning wallet extension to pay.
                    <a
                      href="https://github.com/buildonspark/mppx"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Learn more <ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                </div>
              )}

              <button
                type="submit"
                disabled={isGenerating || !userPrompt.trim() || hasExtension !== true}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating image...
                  </>
                ) : (
                  <>
                    Generate Artwork
                  </>
                )}
              </button>

              {error && (
                <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}
            </form>
          </section>
        )}

        {generatedImageUrl && (
          <section className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Result</h2>
            <div className="mt-4">
              <img src={generatedImageUrl} alt="Generated pointillism artwork" className="w-full rounded-xl border border-border bg-background object-cover" />
            </div>
            <div className="mt-4 rounded-lg border border-border bg-background/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your input</p>
              <p className="mt-2 text-sm leading-relaxed text-foreground/90">{submittedPrompt}</p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}