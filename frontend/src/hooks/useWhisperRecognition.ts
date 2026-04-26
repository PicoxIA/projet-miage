import { useCallback, useRef, useState } from "react";
import { transcribeWithWhisper } from "../services/transcriptionApi";

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  return "audio/wav";
}

type Options = {
  languageCode: string;
  onTranscribed: (text: string) => void;
};

export function useWhisperRecognition({ languageCode, onTranscribed }: Options) {
  const onTranscribedRef = useRef(onTranscribed);
  onTranscribedRef.current = onTranscribed;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : undefined
      );
      mimeRef.current = rec.mimeType || "audio/webm";
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      mediaRecRef.current = rec;
      rec.start(200);
      setIsRecording(true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Micro indisponible";
      setError(msg);
      return false;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecRef.current = null;
  }, []);

  const stopRecording = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        const rec = mediaRecRef.current;
        if (!rec || rec.state === "inactive") {
          setIsRecording(false);
          stopStream();
          resolve("");
          return;
        }
        setIsTranscribing(true);
        rec.onstop = () => {
          void (async () => {
            setIsRecording(false);
            const mime = mimeRef.current;
            const blob = new Blob(chunksRef.current, { type: mime || "audio/webm" });
            chunksRef.current = [];
            try {
              const raw = languageCode.trim();
              const lang = raw === "" ? "auto" : raw;
              const text = await transcribeWithWhisper(blob, lang);
              onTranscribedRef.current(text);
              resolve(text);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Transcription échouée";
              setError(msg);
              reject(e instanceof Error ? e : new Error(msg));
            } finally {
              setIsTranscribing(false);
              stopStream();
            }
          })();
        };
        if (rec.state === "recording" && "requestData" in rec) {
          (rec as MediaRecorder & { requestData?: () => void }).requestData?.();
        }
        rec.stop();
      }),
    [languageCode, stopStream]
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isTranscribing,
    error,
    clearError,
  };
}
