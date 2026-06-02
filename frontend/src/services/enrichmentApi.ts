const DEFAULT_BASE = "http://127.0.0.1:5000";
const ENRICH_TIMEOUT_MS = 90_000;

function baseUrl() {
  return (import.meta.env.VITE_TRANSCRIPTION_API as string | undefined) ?? DEFAULT_BASE;
}

export type EnrichErrorKind = "backend" | "network" | "timeout";

export class EnrichError extends Error {
  readonly kind: EnrichErrorKind;

  constructor(kind: EnrichErrorKind, message: string) {
    super(message);
    this.name = "EnrichError";
    this.kind = kind;
  }
}

export interface EnrichResult {
  text_enrichi: string;
  text_original: string;
  langue: string;
  model: string;
}

export async function enrichText(text: string, language: string): Promise<EnrichResult> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/api/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new EnrichError("timeout", "Enrichment request timed out");
    }
    if (err instanceof TypeError) {
      throw new EnrichError("network", "Cannot reach enrichment server");
    }
    throw err;
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new EnrichError("backend", msg);
  }

  return res.json() as Promise<EnrichResult>;
}
