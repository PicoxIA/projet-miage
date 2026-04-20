import { useMemo, useState } from "react";
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
  value, onChange, disabled, placeholder,
}: { value: string; onChange: (v: string) => void; disabled?: boolean; placeholder: string }) {
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

function SuccessOverlay({ reqType, onReset, tr }: { reqType: string; onReset: () => void; tr: (k: TranslationKey) => string }) {
  const requestTypes = [
    { value: "consultation", key: "typeConsultation" as TranslationKey },
    { value: "urgence",      key: "typeUrgence" as TranslationKey },
    { value: "suivi",        key: "typeSuivi" as TranslationKey },
    { value: "information",  key: "typeInformation" as TranslationKey },
    { value: "reclamation",  key: "typeReclamation" as TranslationKey },
    { value: "autre",        key: "typeOther" as TranslationKey },
  ];
  const label = requestTypes.find((r) => r.value === reqType)?.key
    ? tr(requestTypes.find((r) => r.value === reqType)!.key)
    : reqType;

  return (
    <div className="success-overlay">
      <div className="success-card">
        <div className="success-check">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ stroke: "var(--green)" }}>
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2 className="success-title">{tr("successTitle")}</h2>
        <p className="success-sub">
          {tr("successSub").split("\n").map((line, i) => (
            <span key={i}>{line}{i === 0 && <br />}</span>
          ))}
        </p>
        <div className="success-type">{label}</div>
        <br />
        <button className="btn-new" onClick={onReset}>
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
    { value: "consultation", label: t(languageCode, "typeConsultation") },
    { value: "urgence",      label: t(languageCode, "typeUrgence") },
    { value: "suivi",        label: t(languageCode, "typeSuivi") },
    { value: "information",  label: t(languageCode, "typeInformation") },
    { value: "reclamation",  label: t(languageCode, "typeReclamation") },
    { value: "autre",        label: t(languageCode, "typeOther") },
  ], [languageCode]);

  const CATEGORIES = useMemo(() => [
    { value: "medical",       label: t(languageCode, "categoryMedical") },
    { value: "administratif", label: t(languageCode, "categoryAdministrative") },
    { value: "technique",     label: t(languageCode, "categoryTechnical") },
    { value: "facturation",   label: t(languageCode, "categoryBilling") },
    { value: "general",       label: t(languageCode, "categoryGeneral") },
  ], [languageCode]);

  const [requestType, setRequestType] = useState<string>("consultation");
  const [category, setCategory] = useState<string>("general");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [partial, setPartial] = useState("");
  const [sent, setSent] = useState(false);

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
  const msgOverLimit = message.length > MAX_MSG;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (msgOverLimit) return;
    setSent(true);
  };

  const handleReset = () => {
    setSent(false);
    setRequestType("consultation");
    setCategory("general");
    setSubject("");
    setMessage("");
    setPartial("");
  };

  return (
    <>
      {sent && <SuccessOverlay reqType={requestType} onReset={handleReset} tr={tr} />}

      <div className="contact-card">
        <div className="card-header">
          <div className="card-header-left">
            <p className="card-header-title">{tr("title")}</p>
            <p className="card-header-sub">{tr("formSubtitle")}</p>
          </div>
          <span className="open-source-badge">OPEN SOURCE</span>
        </div>

        <form className="card-body" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className={`form-field${requestType ? " field-filled" : ""}`}>
              <label className="field-label">{tr("requestType")}</label>
              <SelectPicker
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
              <label className="field-label">{tr("category")}</label>
              <SelectPicker
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

          <div className="form-field">
            <label className="field-label">{tr("language")}</label>
            <LanguageSelector
              value={languageCode}
              onChange={setLanguageCode}
              disabled={isListening}
            />
          </div>

          <div className={`form-field${subject ? " field-filled" : ""}`}>
            <label className="field-label">{tr("patientSubject")}</label>
            <SubjectInput
              value={subject}
              onChange={setSubject}
              disabled={isListening}
              placeholder={tr("subjectPlaceholder")}
            />
          </div>

          <VoiceRecorder
            status={status}
            errorMessage={errorMessage}
            onStart={start}
            onStop={stop}
            languageCode={languageCode}
            interimText={partial}
            analyserNode={analyserNode}
          />

          <div className={`form-field${message ? " field-filled" : ""}`}>
            <div className="field-label-row">
              <label className="field-label">{tr("messageDictated")}</label>
              <span className={`char-counter${msgOverLimit ? " warn" : ""}`}>
                {message.length}/{MAX_MSG}
              </span>
            </div>
            <Input
              as="textarea"
              rows={3}
              value={displayMessage}
              onChange={setMessage}
              placeholder={tr("messagePlaceholder")}
            />
          </div>

          <button
            className="btn-submit"
            type="submit"
            disabled={isListening || msgOverLimit}
            onClick={addRipple}
          >
            {tr("send")} →
          </button>
        </form>

        <div className="card-footer">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              className={`lang-pill${languageCode === lang.code ? " active" : ""}`}
              onClick={() => !isListening && setLanguageCode(lang.code)}
              type="button"
              title={lang.label}
            >
              {LANG_FLAGS[lang.code] ?? lang.code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
