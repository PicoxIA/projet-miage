# Installation :
# python -m venv .venv
# .venv\Scripts\activate
# pip install -r requirements.txt
#
# Lancement :
# python app.py
#
# Prérequis pour le NLP :
# 1. Installer Ollama : https://ollama.com/download
# 2. Télécharger le modèle : ollama pull qwen2.5:7b  (modèle par défaut)
# 3. Lancer Ollama : ollama serve

import os
import re
import tempfile
import time
import uuid
from datetime import date
from typing import Any, Optional

import ollama as ollama_lib
from babel import UnknownLocaleError
from babel.dates import format_date
from flask import Flask, jsonify, request
from flask_cors import CORS
from faster_whisper import WhisperModel
from reports import reports_bp

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OLLAMA_HOST  = os.getenv("OLLAMA_HOST",  "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

OLLAMA_GENERATE_OPTIONS: dict[str, Any] = {
    "temperature": 0.1,
    "top_p": 0.8,
    "num_predict": 300,
    "num_ctx": 2048,
}

OLLAMA_SHORT_GENERATE_OPTIONS: dict[str, Any] = {
    "temperature": 0.1,
    "top_p": 0.8,
    "num_predict": 140,
    "num_ctx": 1024,
}

SHORT_SOURCE_MAX_LEN = 80

LANGUAGE_NAMES: dict[str, str] = {
    "fr": "français",
    "en": "English",
    "de": "Deutsch",
    "sr": "srpski",
    "el": "ελληνικά",
    "nl": "Nederlands",
    "ru": "русский",
    "uk": "українська",
    "it": "italiano",
    "fi": "suomi",
    "pt": "português",
    "sk": "slovenčina",
    "es": "español",
    "cs": "čeština",
}

# ---------------------------------------------------------------------------
# Whisper
# ---------------------------------------------------------------------------

_whisper: Optional[WhisperModel] = None


def get_whisper_model() -> WhisperModel:
    global _whisper
    if _whisper is None:
        _whisper = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper


# ---------------------------------------------------------------------------
# Ollama helpers
# ---------------------------------------------------------------------------

def get_ollama_client() -> ollama_lib.Client:
    return ollama_lib.Client(host=OLLAMA_HOST)


def localized_date_today(lang_code: str) -> str:
    """Date du jour formatée dans la langue cible (ex. fr → "Le 8 juin 2026")."""
    try:
        formatted = format_date(date.today(), format="long", locale=lang_code)
    except (UnknownLocaleError, ValueError):
        formatted, lang_code = format_date(date.today(), format="long", locale="fr"), "fr"
    return f"Le {formatted}" if lang_code == "fr" else formatted


def build_enrich_prompt(text: str, lang_name: str, lang_code: str) -> str:
    today_str = localized_date_today(lang_code)
    return f"""Tu es un assistant vétérinaire. Produis TOUJOURS un bilan structuré en {lang_name}, sans inventer d'information médicale.

Format obligatoire :

{today_str}

Compte rendu vétérinaire

THORAX :
...   (uniquement si le source en parle)

ABDOMEN :
...   (uniquement si le source en parle)

BASSIN :
...   (uniquement si le source en parle)

CONCLUSION :
...

Règles :
- Commence TOUJOURS le bilan par la ligne "{today_str}" exactement.
- Réponds UNIQUEMENT avec le bilan final, sans expliquer les règles.
- N'inclus une section (THORAX, ABDOMEN, BASSIN) que si le source apporte une information la concernant. Omets entièrement toute section sans information : ne pas écrire son titre, ni "Aucune information renseignée".
- N'invente jamais : radiographie, échographie, scanner, diagnostic, traitement, chiffre, fracture, hématome, hyperinflation, âge, propriétaire, examen non mentionné, ni aucun symptôme absent du source (ex. ne pas ajouter "gêne respiratoire" si seule une toux est mentionnée).
- Toux, respiration, gêne respiratoire → THORAX ; hanche, boiterie, patte arrière → BASSIN ; vomissement, abdomen, estomac, intestin, digestion → ABDOMEN.
- Sections déjà présentes : conserver les informations et améliorer la formulation.
- "Dans la partie X, ajouter :" : supprimer l'instruction, intégrer le contenu dans la section X.
- Conclusion : résumer uniquement les sections renseignées ; une seule section renseignée → conclusion limitée à cette section.
- Conserver exactement dates, VHS, angles et degrés du source.

Exemple 1 — source : "Le chien tousse."
{today_str}

Compte rendu vétérinaire

THORAX : Le chien présente une toux.

CONCLUSION : Les informations fournies rapportent une toux, sans autre élément renseigné.

Exemple 2 — source : "Le chien boite de la patte arrière."
{today_str}

Compte rendu vétérinaire

BASSIN : Le chien présente une boiterie de la patte arrière.

CONCLUSION : Les informations fournies rapportent une boiterie de la patte arrière, sans autre élément renseigné.

Exemple 3 — source : "Le chien vomit et tousse."
{today_str}

Compte rendu vétérinaire

THORAX : Le chien présente une toux.

ABDOMEN : Le chien présente des vomissements.

CONCLUSION : Les informations fournies rapportent une toux et des vomissements, sans autre élément renseigné.

Texte source :
{text}

Bilan :"""


def sanitize_enriched_output(raw: str) -> str:
    text = raw.strip()
    for marker in ("Bilan :", "Bilan:", "Texte final :", "Texte final:", "Enriched text:", "Enriched text :"):
        lower = text.lower()
        key = marker.lower()
        if key in lower:
            idx = lower.rfind(key)
            tail = text[idx + len(marker) :].strip()
            if tail:
                text = tail
    return text


_EMPTY_SECTION_RE = re.compile(r"(?im)^[ \t]*[A-ZÀ-Ü]+[ \t]*:[ \t]*aucune information.*$")


def drop_empty_sections(text: str) -> str:
    """Filet déterministe : retire les sections vides ('... : Aucune information
    renseignée') que le modèle garde parfois malgré la consigne d'omission."""
    text = _EMPTY_SECTION_RE.sub("", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def is_short_source(text: str) -> bool:
    return len(text) < SHORT_SOURCE_MAX_LEN


def run_ollama_enrich(prompt: str, *, short: bool = False) -> str:
    client = get_ollama_client()
    options = OLLAMA_SHORT_GENERATE_OPTIONS if short else OLLAMA_GENERATE_OPTIONS
    started = time.perf_counter()
    response = client.generate(model=OLLAMA_MODEL, prompt=prompt, options=options)
    print(
        f"Ollama enrich done in {time.perf_counter() - started:.2f}s "
        f"(num_predict={options['num_predict']})"
    )
    return drop_empty_sections(sanitize_enriched_output(response.response))


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)
    app.register_blueprint(reports_bp)

    # --- Whisper health ---
    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "engine": "whisper"})

    # --- Whisper transcription ---
    @app.post("/api/transcribe")
    def transcribe():
        f = request.files.get("audio")
        if f is None or f.filename in ("", None):
            return jsonify({"error": "Aucun fichier reçu. Utilisez le champ multipart 'audio'."}), 400

        try:
            model = get_whisper_model()
            suffix = os.path.splitext(f.filename or "")[1] or ".webm"
            fd, path = tempfile.mkstemp(suffix=suffix, prefix=f"picoxia_{uuid.uuid4().hex}_")
            os.close(fd)
            f.save(path)

            lang = (request.form.get("language") or "").strip()
            language_kw: Any = None if lang.lower() in ("", "auto") else lang

            try:
                segments, _ = model.transcribe(path, beam_size=5, language=language_kw)
                text = " ".join(seg.text.strip() for seg in segments if seg.text).strip()
            finally:
                try:
                    os.unlink(path)
                except OSError:
                    pass
        except Exception as e:
            return jsonify({"error": f"Échec de la transcription Whisper: {e!s}"}), 500

        return jsonify({"text": text, "engine": "whisper"})

    # --- Ollama NLP health ---
    @app.get("/api/enrich/health")
    def enrich_health():
        try:
            client = get_ollama_client()
            models_resp = client.list()
            model_names = [m.model for m in (models_resp.models or [])]
            model_available = OLLAMA_MODEL in model_names or any(
                OLLAMA_MODEL in n for n in model_names
            )
            return jsonify({
                "status": "ok",
                "ollama_host": OLLAMA_HOST,
                "model": OLLAMA_MODEL,
                "model_available": model_available,
                "available_models": model_names,
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "error": f"Ollama inaccessible : {e!s}",
                "hint": "Lancez Ollama avec : ollama serve",
            }), 503

    # --- NLP enrichment ---
    @app.post("/api/enrich")
    def enrich():
        data = request.get_json(silent=True) or {}
        text      = (data.get("text")     or "").strip()
        lang_code = (data.get("language") or "fr").strip()

        if not text:
            return jsonify({"error": "Le champ 'text' est requis."}), 400

        lang_name = LANGUAGE_NAMES.get(lang_code, lang_code)
        prompt    = build_enrich_prompt(text, lang_name, lang_code)
        short     = is_short_source(text)

        try:
            enriched = run_ollama_enrich(prompt, short=short)
        except Exception as e:
            return jsonify({
                "error": f"Erreur Ollama : {e!s}",
                "hint": f"Vérifiez qu'Ollama tourne (ollama serve) et que le modèle '{OLLAMA_MODEL}' est téléchargé (ollama pull {OLLAMA_MODEL}).",
            }), 503

        return jsonify({
            "text_enrichi":  enriched,
            "text_original": text,
            "langue":        lang_code,
            "model":         OLLAMA_MODEL,
        })

    return app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

app = create_app()
get_whisper_model()  # préchargement Whisper au démarrage

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
