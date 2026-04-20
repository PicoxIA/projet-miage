import { useCallback, useEffect, useRef, useState } from "react";
import { createModel, type Model, type KaldiRecognizer } from "vosk-browser";
import type { ServerMessageResult, ServerMessagePartialResult, RecognizerMessage } from "vosk-browser/dist/interfaces";

export type RecognitionStatus = "idle" | "loading-model" | "listening" | "error";

type Options = {
  modelUrl: string;
  onFinalResult: (text: string) => void;
  onPartialResult?: (text: string) => void;
};

export function useVoskRecognition({ modelUrl, onFinalResult, onPartialResult }: Options) {
  const [status, setStatus] = useState<RecognitionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  const onFinalResultRef = useRef(onFinalResult);
  const onPartialResultRef = useRef(onPartialResult);
  useEffect(() => {
    onFinalResultRef.current = onFinalResult;
    onPartialResultRef.current = onPartialResult;
  });

  const modelRef = useRef<Model | null>(null);
  const recognizerRef = useRef<KaldiRecognizer | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const currentModelUrlRef = useRef<string | null>(null);

  const loadModel = useCallback(async () => {
    if (modelRef.current && currentModelUrlRef.current === modelUrl) return modelRef.current;
    setStatus("loading-model");
    modelRef.current?.terminate();
    const model = await createModel(modelUrl);
    modelRef.current = model;
    currentModelUrlRef.current = modelUrl;
    return model;
  }, [modelUrl]);

  const stop = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    recognizerRef.current = null;
    setAnalyserNode(null);
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    try {
      setErrorMessage(undefined);
      const model = await loadModel();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      mediaStreamRef.current = mediaStream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;

      const recognizer = new model.KaldiRecognizer(audioContext.sampleRate);
      recognizer.setWords(true);
      recognizer.on("result", (message: RecognizerMessage) => {
        const text = (message as ServerMessageResult).result.text?.trim();
        if (text) onFinalResultRef.current(text);
      });
      recognizer.on("partialresult", (message: RecognizerMessage) => {
        const text = (message as ServerMessagePartialResult).result.partial?.trim();
        if (text) onPartialResultRef.current?.(text);
      });
      recognizerRef.current = recognizer;

      const source = audioContext.createMediaStreamSource(mediaStream);

      // Vosk branch
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        try { recognizer.acceptWaveform(e.inputBuffer); } catch (err) { console.error(err); }
      };
      source.connect(processor);
      processor.connect(audioContext.destination);
      processorRef.current = processor;

      // Visualizer branch (parallel, no output)
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      setAnalyserNode(analyser);

      setStatus("listening");
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : "Erreur de reconnaissance vocale");
      setStatus("error");
      stop();
    }
  }, [loadModel, stop]);

  useEffect(() => {
    return () => { stop(); modelRef.current?.terminate(); };
  }, [stop]);

  return { status, errorMessage, start, stop, analyserNode };
}
