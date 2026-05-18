const DEFAULT_BASE = "http://127.0.0.1:5000";

function baseUrl() {
  return (import.meta.env.VITE_TRANSCRIPTION_API as string | undefined) ?? DEFAULT_BASE;
}

export interface EnrichResult {
  text_enrichi: string;
  text_original: string;
  langue: string;
  model: string;
}

export async function enrichText(text: string, language: string): Promise<EnrichResult> {
  const res = await fetch(`${baseUrl()}/api/enrich`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return res.json() as Promise<EnrichResult>;
}
