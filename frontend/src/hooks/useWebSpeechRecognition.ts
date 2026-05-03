import { useCallback, useEffect, useRef, useState } from "react";

export type WebSpeechStatus = "idle" | "listening" | "error" | "unsupported";

type Options = {
  languageCode: string;
  onFinalResult: (text: string) => void;
  onPartialResult?: (text: string) => void;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySpeechRecognition = any;

function getSpeechRecognitionCtor(): (new () => AnySpeechRecognition) | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isWebSpeechSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function useWebSpeechRecognition({ languageCode, onFinalResult, onPartialResult }: Options) {
  const [status, setStatus] = useState<WebSpeechStatus>(
    isWebSpeechSupported() ? "idle" : "unsupported"
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const recognitionRef = useRef<AnySpeechRecognition | null>(null);
  const onFinalRef = useRef(onFinalResult);
  const onPartialRef = useRef(onPartialResult);
  useEffect(() => {
    onFinalRef.current = onFinalResult;
    onPartialRef.current = onPartialResult;
  });

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setStatus("idle");
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setStatus("unsupported");
      setErrorMessage("Web Speech API non supportée par ce navigateur.");
      return;
    }

    setErrorMessage(undefined);

    const rec = new Ctor();
    rec.lang = languageCode || "fr-FR";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setStatus("listening");

    rec.onresult = (event: { resultIndex: number; results: SpeechRecognitionResultList }) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = (result[0] as SpeechRecognitionAlternative).transcript;
        if (result.isFinal) {
          onFinalRef.current(transcript.trim());
        } else {
          interim += transcript;
        }
      }
      if (interim) onPartialRef.current?.(interim.trim());
    };

    rec.onerror = (event: { error: string }) => {
      const msg =
        event.error === "not-allowed"
          ? "Accès au microphone refusé."
          : event.error === "network"
          ? "Erreur réseau (Web Speech API nécessite une connexion)."
          : event.error === "no-speech"
          ? "Aucune parole détectée."
          : `Erreur : ${event.error}`;
      setErrorMessage(msg);
      setStatus("error");
      recognitionRef.current = null;
    };

    rec.onend = () => {
      if (recognitionRef.current) {
        setStatus("idle");
        recognitionRef.current = null;
      }
    };

    recognitionRef.current = rec;
    rec.start();
  }, [languageCode]);

  useEffect(() => {
    return () => { recognitionRef.current?.stop(); };
  }, []);

  return { status, errorMessage, start, stop };
}
