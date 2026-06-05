import { useEffect, useRef, useState } from "react";
import { t, type TranslationKey } from "../config/i18n/index";
import { MicIcon, StopIcon } from "./icons";

type VoskStatus = "idle" | "loading-model" | "listening" | "error";

export type TranscriptionMode = "auto" | "whisper" | "offline" | "webspeech";

export type VoiceRecorderProps = {
  languageCode: string;
  /** Vosk (inchangé) */
  status: VoskStatus;
  errorMessage?: string;
  onStart: () => void | Promise<void>;
  onStop: () => void | Promise<void>;
  interimText: string;
  analyserNode: AnalyserNode | null;
  /** Mode UI */
  modeSelect: TranscriptionMode;
  modeHint: string;
  onModeChange: (m: TranscriptionMode) => void;
  modeDisabled: boolean;
  /** Whisper */
  activeEngine: "none" | "whisper" | "vosk" | "webspeech";
  whisperRecording: boolean;
  whisperTranscribing: boolean;
  whisperError: string | null;
  lastEngine: "whisper" | "vosk" | "webspeech" | null;
  pulseWaveform: boolean;
  /** Web Speech */
  webSpeechListening: boolean;
  webSpeechError: string | null;
  webSpeechUnsupported: boolean;
  /** Messages info (fallback, etc.) */
  notice: string | null;
  highPrecisionBlockError: string | null;
};

const N_BARS = 32;

function Waveform({
  analyserNode,
  pulse,
}: { analyserNode: AnalyserNode | null; pulse: boolean }) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (pulse) {
      const bars = barsRef.current;
      let rafId: number;
      function tick() {
        const t = Date.now() / 220;
        bars.forEach((bar, i) => {
          if (!bar) return;
          const env = 1 - (Math.abs(i - N_BARS / 2) / (N_BARS / 2)) * 0.5;
          const h = 8 + (Math.sin(t + i * 0.25) * 0.5 + 0.5) * 30 * env;
          bar.style.height = `${h}px`;
          bar.style.opacity = String(0.5 + h / 55);
          bar.className = "wbar wbar--pulse";
        });
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
      return () => cancelAnimationFrame(rafId);
    }

    const bars = barsRef.current;
    if (!analyserNode) {
      bars.forEach((bar) => {
        if (!bar) return;
        bar.style.height = "4px";
        bar.style.opacity = "0.5";
        bar.className = "wbar idle";
      });
      return;
    }

    const node = analyserNode;
    const data = new Uint8Array(node.frequencyBinCount);
    let rafId: number;

    function tick() {
      node.getByteFrequencyData(data);
      const voiceSlice = Array.from(data.slice(1, 21));
      const avg = voiceSlice.reduce((s, v) => s + v, 0) / voiceSlice.length;
      const level = Math.min(1, avg / 70);

      bars.forEach((bar, i) => {
        if (!bar) return;
        const env = 1 - (Math.abs(i - N_BARS / 2) / (N_BARS / 2)) * 0.5;
        const h = 4 + Math.random() * 40 * env * (0.5 + level * 0.5);
        bar.style.height = h + "px";
        bar.style.opacity = String(0.6 + (h / 48) * 0.4);
        bar.className = "wbar";
      });

      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [analyserNode, pulse]);

  return (
    <div className="waveform">
      {Array.from({ length: N_BARS }, (_, i) => (
        <div key={i} className="wbar idle wbar--gradient" ref={(el) => { barsRef.current[i] = el; }} />
      ))}
    </div>
  );
}

function formatTime(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function vibrate(pattern: number | number[]) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

function addRipple(e: React.MouseEvent<HTMLButtonElement>) {
  const btn = e.currentTarget;
  const r = document.createElement("span");
  r.className = "ripple-burst";
  const rect = btn.getBoundingClientRect();
  r.style.left = e.clientX - rect.left + "px";
  r.style.top = e.clientY - rect.top + "px";
  btn.appendChild(r);
  r.addEventListener("animationend", () => r.remove());
}

const MODE_DATA: { value: TranscriptionMode; key: TranslationKey }[] = [
  { value: "auto", key: "modeAuto" },
  { value: "whisper", key: "modeWhisper" },
  { value: "offline", key: "modeOffline" },
  { value: "webspeech", key: "modeWebSpeech" },
];

export function VoiceRecorder({
  status,
  errorMessage,
  onStart,
  onStop,
  languageCode,
  interimText,
  analyserNode,
  modeSelect,
  modeHint,
  onModeChange,
  modeDisabled,
  activeEngine,
  whisperRecording,
  whisperTranscribing,
  whisperError,
  lastEngine,
  pulseWaveform,
  webSpeechListening,
  webSpeechError,
  webSpeechUnsupported,
  notice,
  highPrecisionBlockError,
}: VoiceRecorderProps) {
  const isWhisperPath = activeEngine === "whisper" || whisperRecording || whisperTranscribing;
  const isWebSpeechPath = activeEngine === "webspeech" || webSpeechListening;

  const isBusyVosk = status === "loading-model";
  const isListeningVosk = status === "listening";
  const isTranscribingWhisper = isWhisperPath && whisperTranscribing && !whisperRecording;
  const isBusy = isBusyVosk || isTranscribingWhisper;
  const isListening = isWhisperPath
    ? whisperRecording && !whisperTranscribing
    : isWebSpeechPath
    ? webSpeechListening
    : isListeningVosk;

  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const displayElapsed = isListening ? elapsed : 0;

  useEffect(() => {
    if (!isListening) return;
    startTimeRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isListening]);

  useEffect(() => {
    if (isWhisperPath) {
      if (levelBarRef.current) levelBarRef.current.style.width = whisperRecording ? "60%" : "0%";
      return;
    }
    if (!analyserNode) {
      if (levelBarRef.current) levelBarRef.current.style.width = "0%";
      return;
    }
    const node = analyserNode;
    const data = new Uint8Array(node.frequencyBinCount);
    let rafId: number;
    function tick() {
      node.getByteFrequencyData(data);
      const voiceSlice = Array.from(data.slice(1, 21));
      const avg = voiceSlice.reduce((s, v) => s + v, 0) / voiceSlice.length;
      if (levelBarRef.current) {
        levelBarRef.current.style.width = Math.min(100, (avg / 70) * 100) + "%";
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [analyserNode, isWhisperPath, whisperRecording]);

  const handleStart = (e: React.MouseEvent<HTMLButtonElement>) => {
    addRipple(e);
    vibrate([40, 20, 40]);
    void Promise.resolve(onStart());
  };

  const handleStop = (e: React.MouseEvent<HTMLButtonElement>) => {
    addRipple(e);
    vibrate(80);
    void Promise.resolve(onStop());
  };

  const statusLine = (() => {
    if (isTranscribingWhisper) {
      return <span className="voice-status-text">{t(languageCode, "whisperTranscribing")}</span>;
    }
    if (isBusyVosk) {
      return <span className="voice-status-text voice-status-text--inline">{t(languageCode, "loadingModel")}</span>;
    }
    if (isListening) {
      const label = isWebSpeechPath
        ? t(languageCode, "webSpeechListening")
        : t(languageCode, "listening");
      return (
        <span className="voice-status-line">
          <span className="voice-status-label">{label}</span>
          <span className="voice-timer" aria-label="Recording time">
            {formatTime(displayElapsed)}
          </span>
        </span>
      );
    }
    return <span className="voice-status-text">{t(languageCode, "waitingStatus")}</span>;
  })();

  const showInterim = !isWhisperPath && Boolean(interimText);

  const engineLabel = (e: typeof lastEngine) => {
    if (e === "whisper") return t(languageCode, "engineWhisper");
    if (e === "webspeech") return t(languageCode, "engineWebSpeech");
    return t(languageCode, "engineVosk");
  };
  const engineBadge = lastEngine
    ? `${t(languageCode, "lastEngine")}: ${engineLabel(lastEngine)}`
    : null;

  return (
    <>
      <div className="voice-transcription-ui">
        <p className="voice-mode-hint" role="note">{modeHint}</p>
        {engineBadge && <p className="voice-engine-badge">{engineBadge}</p>}
        {notice && <p className="voice-notice" role="status">{notice}</p>}
        {highPrecisionBlockError && (
          <p className="voice-notice voice-notice--error" role="alert">{highPrecisionBlockError}</p>
        )}

        <div className="form-field mode-field">
          <label className="field-label" htmlFor="transcription-mode">{t(languageCode, "transcriptionMode")}</label>
          <div id="transcription-mode" className="transcription-mode-row">
            {MODE_DATA.map((m) => (
              <button
                key={m.value}
                type="button"
                className={`transcription-mode-btn${modeSelect === m.value ? " active" : ""}`}
                onClick={() => onModeChange(m.value)}
                disabled={modeDisabled}
                title={t(languageCode, m.key)}
              >
                {t(languageCode, m.key)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`voice-box voice-box--glass${isListening ? " recording" : ""}${isBusy ? " loading" : ""}`}
        aria-busy={isBusy}
      >
        <div className="voice-top">
          <span className="voice-title">
            <MicIcon /> {t(languageCode, "voiceTitle")}
          </span>
          <div className="voice-status">
            <span
              className={`status-dot ${
                isBusy && !isListening
                  ? "loading"
                  : isListening
                    ? "listening"
                    : "idle"
              }`}
            />
            {statusLine}
          </div>
        </div>

        <Waveform
          analyserNode={isWhisperPath ? null : analyserNode}
          pulse={pulseWaveform && whisperRecording}
        />

        <div className="db-meter-wrap">
          <div className="db-track">
            <div className="db-fill" ref={levelBarRef} />
          </div>
        </div>

        {showInterim && (
          <div className="interim-text">{interimText}</div>
        )}

        <div className="voice-actions">
          {!isListening ? (
            <button
              className="btn-mic start"
              onClick={handleStart}
              disabled={isBusy}
              type="button"
            >
              <MicIcon />
              {isBusy
                ? (isTranscribingWhisper
                    ? t(languageCode, "whisperTranscribing")
                    : t(languageCode, "loadingModel"))
                : t(languageCode, "startDictation")}
            </button>
          ) : (
            <button className="btn-mic stop" onClick={handleStop} type="button">
              <StopIcon />
              {t(languageCode, "stopDictation")}
            </button>
          )}
        </div>

        {status === "error" && errorMessage && !isWhisperPath && !isWebSpeechPath && (
          <p className="dictee-error">⚠ {errorMessage}</p>
        )}
        {isWhisperPath && whisperError && (
          <p className="dictee-error">⚠ {whisperError}</p>
        )}
        {webSpeechUnsupported && modeSelect === "webspeech" && (
          <p className="dictee-error">⚠ {t(languageCode, "webSpeechUnsupported")}</p>
        )}
        {isWebSpeechPath && webSpeechError && (
          <p className="dictee-error">⚠ {webSpeechError}</p>
        )}
      </div>

      <button
        className={`voice-fab${isListening ? " voice-fab--stop" : ""}${isBusy ? " voice-fab--loading" : ""}`}
        onClick={isListening ? handleStop : handleStart}
        disabled={isBusy}
        type="button"
        aria-label={
          isBusy
            ? t(languageCode, "loadingModel")
            : isListening
              ? t(languageCode, "stopDictation")
              : t(languageCode, "startDictation")
        }
      >
        {isListening ? <StopIcon /> : <MicIcon />}
      </button>
    </>
  );
}
