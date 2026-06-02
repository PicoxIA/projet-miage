const DEFAULT_BASE = "http://127.0.0.1:5000";

function baseUrl() {
  return (import.meta.env.VITE_TRANSCRIPTION_API as string | undefined) ?? DEFAULT_BASE;
}

export interface SaveReportPayload {
  text_original: string;
  text_enrichi: string;
  langue: string;
  type_demande: string;
}

export interface SavedReport {
  id: string;
  text_original: string;
  text_enrichi: string;
  langue: string;
  type_demande: string;
  date: string | null;
}

export async function saveReport(payload: SaveReportPayload): Promise<SavedReport> {
  const res = await fetch(`${baseUrl()}/api/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  return res.json() as Promise<SavedReport>;
}
