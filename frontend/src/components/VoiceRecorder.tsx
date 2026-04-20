import { useEffect, useRef, useState } from "react";
import { t } from "../config/i18n/index";
import { MicIcon, StopIcon } from "./icons";

type Status = "idle" | "loading-model" | "listening" | "error";

type Props = {
  status: Status;
  errorMessage?: string;
  onStart: () => void;
  onStop: () => void;
  languageCode: string;
  interimText: string;
  analyserNode: AnalyserNode | null;
};

const N_BARS = 32;

function Waveform({ analyserNode }: { analyserNode: AnalyserNode | null }) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
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

    const data = new Uint8Array(analyserNode.frequencyBinCount);
    let rafId: number;

    function tick() {

      analyserNode.getByteFrequencyData(data);
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
  }, [analyserNode]);

  return (
    <div className="waveform">
      {Array.from({ length: N_BARS }, (_, i) => (
        <div key={i} className="wbar idle" ref={(el) => { barsRef.current[i] = el; }} />
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

export function VoiceRecorder({
  status, errorMessage, onStart, onStop, languageCode, interimText, analyserNode,
}: Props) {
  const isBusy = status === "loading-model";
  const isListening = status === "listening";
  const levelBarRef = useRef<HTMLDivElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);
  const displayElapsed = isListening ? elapsed : 0;

  /* recording timer — setState only inside interval callback, not in effect body */
  useEffect(() => {
    if (!isListening) return;
    startTimeRef.current = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [isListening]);

  /* dB level bar — separate RAF from waveform */
  useEffect(() => {
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
  }, [analyserNode]);

  const handleStart = (e: React.MouseEvent<HTMLButtonElement>) => {
    addRipple(e);
    vibrate([40, 20, 40]);
    onStart();
  };

  const handleStop = (e: React.MouseEvent<HTMLButtonElement>) => {
    addRipple(e);
    vibrate(80);
    onStop();
  };

  return (
    <>
      <div className={`voice-box${isListening ? " recording" : ""}`}>
        <div className="voice-top">
          <span className="voice-title">
            <MicIcon /> {t(languageCode, "voiceTitle")}
          </span>
          <div className="voice-status">
            <span className={`status-dot ${isListening ? "listening" : "idle"}`} />
            <span>
              {isListening
                ? `${t(languageCode, "listening")} · ${formatTime(displayElapsed)}`
                : t(languageCode, "waitingStatus")}
            </span>
          </div>
        </div>

        <Waveform analyserNode={analyserNode} />

        {/* Volume level bar */}
        <div className="db-meter-wrap">
          <div className="db-track">
            <div className="db-fill" ref={levelBarRef} />
          </div>
        </div>

        {interimText && (
          <div className="interim-text">{interimText}</div>
        )}

        <div className="voice-actions">
          {!isListening ? (
            <button className="btn-mic start" onClick={handleStart} disabled={isBusy} type="button">
              <MicIcon />
              {isBusy ? t(languageCode, "loadingModel") : t(languageCode, "startDictation")}
            </button>
          ) : (
            <button className="btn-mic stop" onClick={handleStop} type="button">
              <StopIcon />
              {t(languageCode, "stopDictation")}
            </button>
          )}
        </div>

        {status === "error" && errorMessage && (
          <p className="dictee-error">⚠ {errorMessage}</p>
        )}
      </div>

      {/* FAB — only visible on mobile via CSS */}
      <button
        className={`voice-fab${isListening ? " voice-fab--stop" : ""}`}
        onClick={isListening ? handleStop : handleStart}
        disabled={isBusy}
        type="button"
        aria-label={isListening ? "Arrêter la dictée" : "Commencer la dictée"}
      >
        {isListening ? <StopIcon /> : <MicIcon />}
      </button>
    </>
  );
}
