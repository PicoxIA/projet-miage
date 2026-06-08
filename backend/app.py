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
import unicodedata
import uuid
from typing import Any, Optional

import ollama as ollama_lib
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
    "num_predict": 400,
    "num_ctx": 2048,
}

OLLAMA_SHORT_GENERATE_OPTIONS: dict[str, Any] = {
    "temperature": 0.1,
    "top_p": 0.8,
    "num_predict": 220,
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


def build_enrich_prompt(text: str, lang_name: str) -> str:
    return f"""Tu es un expert en rédaction de comptes rendus vétérinaires professionnels.
Transforme le texte source en rapport clair, complet et professionnel en {lang_name}.

RÈGLE 1 — AUCUNE HALLUCINATION
Ne jamais inventer : symptôme, maladie, diagnostic, traitement, dosage, examen, résultat, mesure, observation.
En cas de doute, ne rien ajouter.

RÈGLE 2 — AUCUNE PERTE D'INFORMATION
Conserver chaque donnée du source : âge, sexe, race, poids, durée, date, symptômes, température, fréquence, dosage, traitement, observation, résultat, hypothèse, remarque.

RÈGLE 3 — NE PAS RÉSUMER
Corriger, reformuler, enrichir, structurer, professionnaliser — jamais raccourcir. Le final contient au minimum autant d'informations que le source.

RÈGLE 4 — DONNÉES CLINIQUES EXACTES
Reproduire exactement températures, mesures, poids, dosages, durées, fréquences, résultats, valeurs biologiques, VHS, angles, degrés.

RÈGLE 5 — LANGUE
Répondre uniquement en {lang_name}. Ne pas traduire.

STRUCTURATION DYNAMIQUE
- Pas de structure fixe. Créer uniquement les sections pertinentes (ANAMNÈSE, EXAMEN CLINIQUE, THORAX, ABDOMEN, BASSIN, MEMBRES, IMAGERIE, TRAITEMENT, CONCLUSION, etc.).
- Ne jamais forcer une information dans une section inadaptée.

RÈGLE 6 — INTERDICTION DES SECTIONS VIDES
Ne jamais créer une section vide. Si aucune information du source concerne une section :
- ne pas afficher la section ;
- ne pas écrire "aucune information", "non renseigné", "aucune donnée disponible" ni équivalent.
Afficher uniquement les sections contenant au moins une information réelle du source.
Interdit : ANAMNÈSE : Aucune information d'anamnèse n'est fournie. / TRAITEMENT : Aucun traitement n'est mentionné. / EXAMEN IMAGÉRIQUE : Aucune information concernant l'imagerie. → supprimer totalement ces sections.

RÈGLE 7 — INTERDICTION DES RECOMMANDATIONS INVENTÉES
Ne jamais jouer le rôle du vétérinaire. Ne jamais proposer recommandations, examens complémentaires, hypothèses supplémentaires, conseils, actions futures ou suivi recommandé, sauf si explicitement présents dans le source.
Expressions interdites sauf présence dans le source : "Il est recommandé de...", "Il serait utile de...", "Un suivi est conseillé...", "Une évaluation complémentaire...", "Des examens complémentaires sont recommandés...", "Une surveillance est recommandée...", "Il conviendrait de...".
Rôle limité à : corriger, reformuler, enrichir le vocabulaire, structurer, réorganiser. Jamais d'avis médical propre au modèle.

SI DÉJÀ STRUCTURÉ
Conserver les sections existantes, améliorer la rédaction, intégrer les remarques libres, ne supprimer aucune section avec information.

SI NON STRUCTURÉ
Identifier les informations, regrouper par thème, créer une structure cohérente.

REMARQUES LIBRES / DICTÉE VOCALE
- "Dans la partie X, ajouter :" : supprimer l'instruction, intégrer le contenu dans la section X.
- Remarque libre en fin de texte : l'intégrer dans la section appropriée ; la mentionner en conclusion si cliniquement importante.

CONTRÔLE FINAL
Avant de répondre :
1. Vérifier qu'aucune section vide n'est affichée.
2. Vérifier qu'aucune recommandation ou conseil n'a été ajouté.
3. Vérifier qu'aucune information du source n'a disparu.
4. Vérifier qu'aucune information nouvelle n'a été inventée.
Ensuite seulement générer le compte rendu final.

Répondre UNIQUEMENT avec le compte rendu final, sans commentaire ni explication des règles.

Texte source :
{text}

Compte rendu :"""


_OUTPUT_MARKERS = (
    "Compte rendu :", "Compte rendu:", "Bilan :", "Bilan:",
    "Texte final :", "Texte final:", "Enriched text:", "Enriched text :",
)

_FORBIDDEN_RECOMMENDATION_PHRASES: tuple[str, ...] = (
    "il est recommandé",
    "il serait recommandé",
    "il serait utile",
    "il conviendrait",
    "une évaluation complémentaire",
    "des examens complémentaires",
    "un suivi est conseillé",
    "une surveillance est recommandée",
    "il est conseillé",
    "consulter un vétérinaire",
    "suggère la présence",
    "pourrait évoquer",
    "compatible avec",
    "suspicion de",
    "infection locale",
    "inflammation ou infection",
    "nécessitant un traitement spécifique",
)

_EMPTY_BODY_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^aucune information",
        r"^aucun traitement",
        r"^non renseigné",
        r"^aucune donnée",
        r"^il n.?y a pas",
        r"n.?est pas mentionné",
        r"n.?est pas fournie",
        r"n.?est fournie dans le texte source",
        r"^pas d.?information",
        r"^aucune information concernant",
        r"^il n.?y a pas d.?information",
        r"^aucun examen",
        r"^aucune donnée disponible",
    )
)

_SECTION_HEADER_RE = re.compile(
    r"^(?P<header>[A-ZÀ-ÜÉÈÊËÎÏÔÙÛÜÇ][A-ZÀ-ÜÉÈÊËÎÏÔÙÛÜÇ0-9 \-'/]+?)\s*:\s*(?P<rest>.*)$",
)

_SOURCE_SECTION_RE = re.compile(
    r"^(?P<header>[A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ0-9 \-'/]*?)\s*:\s*(?P<rest>.*)$",
)

_NESTED_HEADER_ONLY_RE = re.compile(
    r"^[A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ0-9 \-'/]*?\s*:\s*$",
)

_PARENTHETICAL_RE = re.compile(r"\([^)]+\)")

_SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "THORAX": ("THORAX", "EXAMEN CLINIQUE"),
    "EXAMEN CLINIQUE": ("EXAMEN CLINIQUE", "THORAX"),
}


def sanitize_enriched_output(raw: str) -> str:
    """Retire les préfixes de prompt recopiés par le modèle."""
    text = raw.strip()
    for marker in _OUTPUT_MARKERS:
        lower = text.lower()
        key = marker.lower()
        if key in lower:
            idx = lower.rfind(key)
            tail = text[idx + len(marker) :].strip()
            if tail:
                text = tail
    return text


def _fold_accents(text: str) -> str:
    folded = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in folded if unicodedata.category(c) != "Mn")


def _sentence_has_forbidden_phrase(sentence: str) -> bool:
    folded = _fold_accents(sentence)
    return any(_fold_accents(phrase) in folded for phrase in _FORBIDDEN_RECOMMENDATION_PHRASES)


def _split_sentences(line: str) -> list[str]:
    parts = re.split(r"(?<=[.!?…])\s+", line.strip())
    return [p.strip() for p in parts if p.strip()]


def remove_forbidden_recommendations(text: str) -> str:
    """Supprime les phrases contenant des recommandations ou hypothèses inventées."""
    kept_lines: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            kept_lines.append("")
            continue
        sentences = _split_sentences(stripped)
        if not sentences:
            continue
        kept = [s for s in sentences if not _sentence_has_forbidden_phrase(s)]
        if kept:
            kept_lines.append(" ".join(kept))
    return "\n".join(kept_lines)


def _normalize_for_match(text: str) -> str:
    text = text.lower().replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _is_placeholder_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    return any(pattern.search(stripped) for pattern in _EMPTY_BODY_PATTERNS)


def _is_factual_line(line: str) -> bool:
    stripped = line.strip()
    if not stripped:
        return False
    if _is_placeholder_line(stripped):
        return False
    if _NESTED_HEADER_ONLY_RE.match(stripped):
        return False
    header_match = _SECTION_HEADER_RE.match(stripped)
    if header_match and not header_match.group("rest").strip():
        return False
    return True


def _clean_factual_body_lines(body_lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    for line in body_lines:
        stripped = line.strip()
        if not stripped:
            continue
        if _NESTED_HEADER_ONLY_RE.match(stripped):
            continue
        header_match = _SECTION_HEADER_RE.match(stripped)
        if header_match and not header_match.group("rest").strip():
            continue
        if _is_factual_line(stripped):
            cleaned.append(stripped)
    return cleaned


def _is_empty_section_body(body: str) -> bool:
    lines = _clean_factual_body_lines(body.splitlines())
    return len(lines) == 0


def drop_empty_sections(text: str) -> str:
    """Retire les sections sans ligne factuelle réelle."""
    lines = text.splitlines()
    preamble: list[str] = []
    i = 0

    while i < len(lines):
        if _SECTION_HEADER_RE.match(lines[i]):
            break
        if _is_factual_line(lines[i]):
            preamble.append(lines[i])
        i += 1

    kept_blocks: list[str] = []
    if preamble:
        kept_blocks.append("\n".join(preamble).strip())

    while i < len(lines):
        match = _SECTION_HEADER_RE.match(lines[i])
        if not match:
            orphan = lines[i].strip()
            if kept_blocks and _is_factual_line(orphan):
                kept_blocks[-1] = f"{kept_blocks[-1]}\n{orphan}".strip()
            i += 1
            continue

        header = match.group("header")
        body_lines: list[str] = []
        rest = match.group("rest").strip()
        if rest:
            body_lines.append(rest)
        i += 1

        while i < len(lines) and not _SECTION_HEADER_RE.match(lines[i]):
            body_lines.append(lines[i])
            i += 1

        factual_lines = _clean_factual_body_lines(body_lines)
        if not factual_lines:
            continue

        kept_blocks.append(f"{header} :\n" + "\n".join(factual_lines))

    return "\n\n".join(kept_blocks).strip()


def remove_unsourced_parentheticals(text: str, source: str) -> str:
    """Supprime les commentaires entre parenthèses absents du texte source."""
    source_norm = _normalize_for_match(source)
    kept_lines: list[str] = []

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            kept_lines.append("")
            continue
        if _SECTION_HEADER_RE.match(stripped):
            kept_lines.append(stripped)
            continue

        def _replace_paren(match: re.Match[str]) -> str:
            inner = match.group(0)[1:-1].strip()
            inner_norm = _normalize_for_match(inner)
            if inner_norm and inner_norm in source_norm:
                return match.group(0)
            return ""

        cleaned = _PARENTHETICAL_RE.sub(_replace_paren, stripped)
        cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
        cleaned = re.sub(r"\s+([,.;])", r"\1", cleaned)
        if cleaned:
            kept_lines.append(cleaned)

    return "\n".join(kept_lines)


def _extract_source_fact_lines(source: str) -> list[str]:
    facts: list[str] = []
    for raw in source.splitlines():
        line = raw.strip()
        if not line:
            continue
        voice_match = re.search(r"(?i)ajouter\s*:\s*(.+)$", line)
        if re.search(r"(?i)dans la partie", line) and voice_match:
            facts.append(voice_match.group(1).strip())
            continue
        section_match = _SOURCE_SECTION_RE.match(line)
        if section_match and not section_match.group("rest").strip():
            continue
        facts.append(line)
    return facts


def _numeric_variants_present(number: str, output_norm: str) -> bool:
    if number in output_norm:
        return True
    alt = number.replace(",", ".") if "," in number else number.replace(".", ",")
    return alt in output_norm


def _fact_preserved_in_output(fact: str, output: str) -> bool:
    fact_norm = _normalize_for_match(fact)
    output_norm = _normalize_for_match(output)
    if fact_norm in output_norm:
        return True

    fact_numbers = re.findall(r"\d+[.,]?\d*", fact)
    if fact_numbers:
        if not all(_numeric_variants_present(number, output_norm) for number in fact_numbers):
            return False

    words = [
        w for w in re.findall(r"[a-zà-ü0-9']+", fact_norm)
        if len(w) > 2 or w in ("pas", "non")
    ]
    if not words:
        return fact_norm in output_norm
    hits = sum(1 for w in words if w in output_norm)
    if fact_numbers and hits >= max(1, int(len(words) * 0.5)):
        return True
    return hits >= max(2, int(len(words) * 0.65))


def _find_target_section(source: str) -> str | None:
    for raw in source.splitlines():
        match = _SOURCE_SECTION_RE.match(raw.strip())
        if match and not match.group("rest").strip():
            return match.group("header").strip().upper()
    return None


def _section_names_to_try(section: str) -> tuple[str, ...]:
    upper = section.upper()
    return _SECTION_ALIASES.get(upper, (upper,))


def _inject_missing_facts(text: str, missing: list[str], source: str) -> str:
    if not missing:
        return text

    primary = _find_target_section(source) or "EXAMEN CLINIQUE"
    for section_name in _section_names_to_try(primary):
        lines = text.splitlines()
        out: list[str] = []
        i = 0
        injected = False
        while i < len(lines):
            out.append(lines[i])
            match = _SECTION_HEADER_RE.match(lines[i])
            if match and match.group("header").strip().upper() == section_name:
                i += 1
                while i < len(lines) and not _SECTION_HEADER_RE.match(lines[i]):
                    out.append(lines[i])
                    i += 1
                for fact in missing:
                    current = "\n".join(out)
                    if not _fact_preserved_in_output(fact, current):
                        out.append(fact)
                injected = True
                continue
            i += 1
        if injected:
            return "\n".join(out)

    block = f"{primary} :\n" + "\n".join(missing)
    conclusion_match = re.search(r"(?im)^(CONCLUSION)\s*:", text)
    if conclusion_match:
        idx = conclusion_match.start()
        return text[:idx].rstrip() + "\n\n" + block + "\n\n" + text[idx:].lstrip()
    return text.rstrip() + "\n\n" + block


def ensure_source_facts_preserved(text: str, source: str) -> str:
    """Réinjecte les lignes factuelles du source absentes de la sortie."""
    missing = [
        fact for fact in _extract_source_fact_lines(source)
        if not _fact_preserved_in_output(fact, text)
    ]
    return _inject_missing_facts(text, missing, source)


def normalize_spacing(text: str) -> str:
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def post_process_enriched_text(text: str, source: str = "") -> str:
    text = sanitize_enriched_output(text)
    text = remove_forbidden_recommendations(text)
    if source:
        text = remove_unsourced_parentheticals(text, source)
    text = drop_empty_sections(text)
    if source:
        text = ensure_source_facts_preserved(text, source)
        text = drop_empty_sections(text)
    text = normalize_spacing(text)
    return text


def is_short_source(text: str) -> bool:
    return len(text) < SHORT_SOURCE_MAX_LEN


def run_ollama_enrich(prompt: str, *, short: bool = False, source: str = "") -> str:
    client = get_ollama_client()
    options = OLLAMA_SHORT_GENERATE_OPTIONS if short else OLLAMA_GENERATE_OPTIONS
    started = time.perf_counter()
    response = client.generate(model=OLLAMA_MODEL, prompt=prompt, options=options)
    print(
        f"Ollama enrich done in {time.perf_counter() - started:.2f}s "
        f"(num_predict={options['num_predict']})"
    )
    return post_process_enriched_text(response.response, source)


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
        prompt    = build_enrich_prompt(text, lang_name)
        short     = is_short_source(text)

        try:
            enriched = run_ollama_enrich(prompt, short=short, source=text)
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
