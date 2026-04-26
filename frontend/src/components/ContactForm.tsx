import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Input, SelectPicker } from "rsuite";
import { LANGUAGES } from "../config/languages";
import { t, type TranslationKey } from "../config/i18n/index";
import { useLanguage } from "../context/useLanguage";
import { LanguageSelector } from "./LanguageSelector";
import { VoiceRecorder } from "./VoiceRecorder";
import { useVoskRecognition } from "../hooks/useVoskRecognition";

const LANG_FLAGS: Record<string, string> = {
  fr: "🇫🇷", en: "🇺🇸", de: "🇩🇪", sr: "🇷🇸", el: "🇬🇷",
  nl: "🇳🇱", ru: "🇷🇺", uk: "🇺🇦", it: "🇮🇹", fi: "🇫🇮",
  pt: "🇵🇹", sk: "🇸🇰", es: "🇪🇸", cs: "🇨🇿",
};

const MAX_MSG = 500;

/** Envoie simulé (aucun réseau réel) — rejette si le sujet contient __SIMULER_ERREUR__ en dev. */
function mockSendSimulated(shouldFail: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => (shouldFail ? reject(new Error("simulated")) : resolve()), 650);
  });
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

const PET_SUGGESTIONS = [
  "Labrador, 5 ans", "Golden Retriever, 3 ans", "Berger Allemand, 7 ans",
  "Bulldog Français, 2 ans", "Chat Persan, 6 ans", "Maine Coon, 3 ans",
  "Boiterie membre antérieur gauche", "Vomissements répétés",
  "Trouble respiratoire aigu", "Suivi vaccinal annuel",
];

function SubjectInput({
  value, onChange, disabled, placeholder, id,
}: { value: string; onChange: (v: string) => void; disabled?: boolean; placeholder: string; id?: string }) {
  const [open, setOpen] = useState(false);

  const filtered = value.length >= 2
    ? PET_SUGGESTIONS.filter((s) => s.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
    : [];

  const handleChange = (val: string) => {
    onChange(val);
    setOpen(val.length >= 2 && PET_SUGGESTIONS.some((s) => s.toLowerCase().includes(val.toLowerCase())));
  };

  return (
    <div className="autocomplete-wrap">
      <Input
        id={id}
        value={value}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {open && filtered.length > 0 && (
        <div className="autocomplete-dropdown">
          {filtered.map((s) => (
            <div key={s} className="autocomplete-option" onMouseDown={() => { onChange(s); setOpen(false); }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatSentAt(iso: string, langCode: string) {
  try {
    return new Date(iso).toLocaleString([langCode, "fr-FR"], { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function SuccessOverlay({
  reqType,
  submittedAt,
  onReset,
  tr,
  languageCode,
}: {
  reqType: string;
  submittedAt: string;
  onReset: () => void;
  tr: (k: TranslationKey) => string;
  languageCode: string;
}) {
  const requestTypes: { value: string; key: TranslationKey }[] = [
    { value: "software_bug", key: "typeSoftwareBug" },
    { value: "hardware_bug", key: "typeHardwareBug" },
    { value: "assistance", key: "typeAssistance" },
    { value: "other", key: "typeOther" },
  ];
  const found = requestTypes.find((r) => r.value === reqType);
  const label = found ? tr(found.key) : reqType;

  return (
    <div className="success-overlay">
      <div className="success-card" role="dialog" aria-labelledby="success-title">
        <div className="success-check">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--green)" }} aria-hidden>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="success-title" id="success-title">{tr("successTitle")}</h2>
        <p className="success-sub">
          {tr("successSub").split("\n").map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </p>
        <p className="success-timestamp" title={submittedAt}>
          <span className="success-timestamp-label">{tr("submittedAt")}</span>
          {" "}
          <time dateTime={submittedAt}>{formatSentAt(submittedAt, languageCode)}</time>
        </p>
        <div className="success-type">{label}</div>
        <br />
        <button className="btn-new" onClick={onReset} type="button">
          + {tr("newMessage")}
        </button>
      </div>
    </div>
  );
}

export function ContactForm() {
  const { languageCode, setLanguageCode } = useLanguage();
  const tr = (key: TranslationKey) => t(languageCode, key);

  const REQUEST_TYPES = useMemo(() => [
    { value: "software_bug", label: t(languageCode, "typeSoftwareBug") },
    { value: "hardware_bug", label: t(languageCode, "typeHardwareBug") },
    { value: "assistance", label: t(languageCode, "typeAssistance") },
    { value: "other", label: t(languageCode, "typeOther") },
  ], [languageCode]);

  const CATEGORIES = useMemo(() => [
    { value: "medical",       label: t(languageCode, "categoryMedical") },
    { value: "administratif", label: t(languageCode, "categoryAdministrative") },
    { value: "technique",     label: t(languageCode, "categoryTechnical") },
    { value: "facturation",   label: t(languageCode, "categoryBilling") },
    { value: "general",       label: t(languageCode, "categoryGeneral") },
  ], [languageCode]);

  const [requestType, setRequestType] = useState("assistance");
  const [category, setCategory] = useState("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [partial, setPartial] = useState("");
  const [sent, setSent] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ subject?: boolean; message?: boolean }>({});

  const modelUrl = useMemo(
    () => LANGUAGES.find((l) => l.code === languageCode)!.modelUrl,
    [languageCode]
  );

  const { status, errorMessage, start, stop, analyserNode } = useVoskRecognition({
    modelUrl,
    onFinalResult: (text) => {
      setMessage((prev) => (prev ? `${prev} ${text}` : text));
      setPartial("");
    },
    onPartialResult: (text) => setPartial(text),
  });

  const displayMessage = partial ? `${message}${message ? " " : ""}${partial}` : message;
  const isListening = status === "listening";
  const effectiveLength = displayMessage.length;
  const msgOverLimit = effectiveLength > MAX_MSG;
  const isFormValid =
    Boolean(subject.trim()) && Boolean(displayMessage.trim()) && !msgOverLimit;
  const isSubmitDisabled = !isFormValid || isListening || isSubmitting;

  const messageFieldRef = useRef<HTMLDivElement>(null);
  // Auto-hauteur du textarea (uniquement présentation, sans logique métier)
  useLayoutEffect(() => {
    const root = messageFieldRef.current;
    if (!root) return;
    const ta = root.querySelector("textarea");
    if (!ta) return;
    ta.style.overflow = "hidden";
    const minH = 100;
    const maxH = 320;
    ta.style.height = `${minH}px`;
    const next = Math.min(maxH, Math.max(minH, ta.scrollHeight));
    ta.style.height = `${next}px`;
  }, [displayMessage, isSubmitting]);

  const handleMessageChange = (v: string) => {
    setPartial("");
    setMessage(v);
    setFieldErrors((e) => ({ ...e, message: false }));
  };

  const handleSubjectChange = (v: string) => {
    setSubject(v);
    setFieldErrors((e) => ({ ...e, subject: false }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setSubmitError(null);

    const emptySubject = !subject.trim();
    const emptyMessage = !displayMessage.trim();
    setFieldErrors({ subject: emptySubject, message: emptyMessage });
    if (emptySubject || emptyMessage) return;
    if (msgOverLimit) return;

    const simulateFailure =
      import.meta.env.DEV && subject.includes("__SIMULER_ERREUR__");

    setIsSubmitting(true);
    try {
      const textToSend = displayMessage.trim();
      await mockSendSimulated(simulateFailure);
      // Figement du texte affiché (y compris la dernière portion non finalisée par Vosk)
      setPartial("");
      setMessage(textToSend);
      setSubmittedAt(new Date().toISOString());
      setSent(true);
    } catch {
      setSubmitError(tr("errorSubmit"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSent(false);
    setSubmittedAt(null);
    setRequestType("assistance");
    setCategory("general");
    setSubject("");
    setMessage("");
    setPartial("");
    setSubmitError(null);
    setFieldErrors({});
  };

  return (
    <>
      {sent && submittedAt && (
        <SuccessOverlay
          reqType={requestType}
          submittedAt={submittedAt}
          onReset={handleReset}
          tr={tr}
          languageCode={languageCode}
        />
      )}

      <div className="contact-card">
        <div className="card-header">
          <div className="card-header-left">
            <p className="card-header-title">{tr("title")}</p>
            <p className="card-header-sub">{tr("formSubtitle")}</p>
          </div>
          <span className="open-source-badge">OPEN SOURCE</span>
        </div>

        <form className="card-body card-body--form" onSubmit={handleSubmit} noValidate>
          <div className="form-section" data-section="type-category">
            <h3 className="form-section-title">{tr("formSectionTypeCategory")}</h3>
            <div className="form-row form-row--tight">
              <div className={`form-field${requestType ? " field-filled" : ""}`}>
                <label className="field-label" htmlFor="request-type-picker">{tr("requestType")}</label>
                <SelectPicker
                  id="request-type-picker"
                  className="picker-field"
                  data={REQUEST_TYPES}
                  value={requestType}
                  onChange={(v) => v && setRequestType(v)}
                  searchable={false}
                  cleanable={false}
                  placement="bottomStart"
                  block
                  disabled={isListening}
                />
              </div>
              <div className={`form-field${category ? " field-filled" : ""}`}>
                <label className="field-label" htmlFor="category-picker">{tr("category")}</label>
                <SelectPicker
                  id="category-picker"
                  className="picker-field"
                  data={CATEGORIES}
                  value={category}
                  onChange={(v) => v && setCategory(v)}
                  searchable={false}
                  cleanable={false}
                  placement="bottomStart"
                  block
                  disabled={isListening}
                />
              </div>
            </div>
          </div>

          <div className="form-section" data-section="language">
            <h3 className="form-section-title">{tr("formSectionLanguage")}</h3>
            <div className="form-field">
              <div id="lang-picker-wrap" className="lang-selector-wrap">
                <LanguageSelector
                  value={languageCode}
                  onChange={setLanguageCode}
                  disabled={isListening}
                />
              </div>
            </div>
          </div>

          <div className="form-section" data-section="subject">
            <h3 className="form-section-title">{tr("formSectionSubject")}</h3>
            <div className={`form-field${subject && !fieldErrors.subject ? " field-filled" : ""}${fieldErrors.subject ? " field-invalid" : ""}`}>
              <label className="field-label" htmlFor="contact-subject">{tr("patientSubject")}</label>
              <SubjectInput
                id="contact-subject"
                value={subject}
                onChange={handleSubjectChange}
                disabled={isListening}
                placeholder={tr("subjectPlaceholder")}
              />
              {fieldErrors.subject && (
                <p className="field-error" role="alert">{tr("errorSubjectRequired")}</p>
              )}
            </div>
          </div>

          <div className="form-section" data-section="voice">
            <h3 className="form-section-title">{tr("formSectionVoice")}</h3>
            <VoiceRecorder
              status={status}
              errorMessage={errorMessage}
              onStart={start}
              onStop={stop}
              languageCode={languageCode}
              interimText={partial}
              analyserNode={analyserNode}
            />
          </div>

          <div className="form-section" data-section="message">
            <h3 className="form-section-title">{tr("formSectionMessage")}</h3>
            <div
              ref={messageFieldRef}
              className={`form-field message-field${(message || partial) && !fieldErrors.message ? " field-filled" : ""}${fieldErrors.message ? " field-invalid" : ""}`}
            >
              <div className="field-label-row">
                <label className="field-label" htmlFor="message-textarea">{tr("messageDictated")}</label>
                <span className={`char-counter${msgOverLimit ? " warn" : ""}`} aria-live="polite">
                  {effectiveLength}/{MAX_MSG}
                </span>
              </div>
              <Input
                id="message-textarea"
                as="textarea"
                rows={4}
                className="input-message"
                value={displayMessage}
                onChange={handleMessageChange}
                placeholder={tr("messagePlaceholder")}
                disabled={isSubmitting}
              />
              {fieldErrors.message && (
                <p className="field-error" role="alert">{tr("errorMessageRequired")}</p>
              )}
            </div>
          </div>

          {submitError && (
            <div className="submit-error-banner" role="alert">
              <span className="submit-error-icon" aria-hidden>!</span>
              <span className="submit-error-text">{submitError}</span>
              <button
                className="submit-error-dismiss"
                type="button"
                onClick={() => setSubmitError(null)}
                aria-label={tr("dismiss")}
              >
                ×
              </button>
            </div>
          )}

          <div className="form-actions">
            <p className={`form-aux-hint${isFormValid ? " is-hidden" : ""}`} role="status">
              {tr("formIncompleteHint")}
            </p>
            <button
              className={`btn-submit${isFormValid && !isListening && !isSubmitting ? " btn-submit--ready" : ""}`}
              type="submit"
              disabled={isSubmitDisabled}
              onClick={addRipple}
              title={!isFormValid && !isSubmitting ? tr("formIncompleteHint") : undefined}
            >
              {isSubmitting ? tr("sending") : `${tr("send")} →`}
            </button>
          </div>
        </form>

        <div className="card-footer" role="group" aria-label={tr("language")}>
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`lang-pill${languageCode === lang.code ? " active" : ""}`}
              onClick={() => !isListening && setLanguageCode(lang.code)}
              type="button"
              title={`${lang.label} — ${lang.nativeLabel}`}
            >
              {LANG_FLAGS[lang.code] ?? lang.code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
