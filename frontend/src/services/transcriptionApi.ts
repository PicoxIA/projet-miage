const DEFAULT_BASE = "http://127.0.0.1:5000";

function baseUrl() {
  return (import.meta.env.VITE_TRANSCRIPTION_API as string | undefined) ?? DEFAULT_BASE;
}

const HEALTH_CACHE_TTL_MS = 5000;
let healthCache: { t: number; ok: boolean } | null = null;

/** True si le backend répond, avec cache court pour limiter les requêtes. */
export async function checkWhisperHealth(): Promise<boolean> {
  const now = Date.now();
  if (healthCache && now - healthCache.t < HEALTH_CACHE_TTL_MS) {
    return healthCache.ok;
  }
  try {
    const res = await fetch(`${baseUrl()}/api/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      let okBody = false;
      try {
        const j = (await res.json()) as { status?: string };
        okBody = j.status === "ok";
      } catch {
        okBody = false;
      }
      healthCache = { t: now, ok: okBody };
    } else {
      healthCache = { t: now, ok: false };
    }
    return healthCache.ok;
  } catch {
    healthCache = { t: now, ok: false };
    return false;
  }
}

/**
 * Envoie l’audio vers le serveur Flask Whisper.
 * @param language Code langue (ex. fr, en) — chaîne vide = auto côté serveur
 */
export async function transcribeWithWhisper(
  audioBlob: Blob,
  language: string
): Promise<string> {
  const form = new FormData();
  const name =
    (audioBlob as Blob & { name?: string }).name ??
    (audioBlob.type?.includes("webm") ? "audio.webm" : "audio.wav");
  form.append("audio", audioBlob, name);
  form.append("language", language);

  const res = await fetch(`${baseUrl()}/api/transcribe`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }

  const data = (await res.json()) as { text?: string; engine?: string };
  return (data.text ?? "").trim();
}
