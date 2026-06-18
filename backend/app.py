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


# Sections qui doivent toujours apparaître dans le compte rendu
MANDATORY_SECTIONS = ("THORAX", "ABDOMEN", "BASSIN")


def build_enrich_prompt(text: str, lang_name: str) -> str:
    return f"""Tu es un expert en rédaction clinique vétérinaire. Ton rôle est d'analyser n'importe quel texte ou transcription vocale brute, d'extraire les informations pertinentes, de corriger la syntaxe et d'enrichir le vocabulaire technique tout en respectant une structure stricte.

1. ADAPTABILITÉ ET ANALYSE
Tu dois être capable de traiter n'importe quelle entrée textuelle, quel que soit son degré de précision, son désordre ou sa langue. Le compte rendu final doit être rédigé en {lang_name}.
Analyse le texte pour identifier les informations liées au patient et les observations anatomiques.

2. STRUCTURE OBLIGATOIRE (Ordre strict)
PRÉSENTATION : (Conditionnel) Si la dictée contient des infos (race, âge, type, nom, sexe, poids), génère cette section. Sinon, ne l'écris pas du tout.

THORAX : (Obligatoire) Remplis avec les infos trouvées ou écris 'Non renseigné.'
ABDOMEN : (Obligatoire) Remplis avec les infos trouvées ou écris 'Non renseigné.'
BASSIN : (Obligatoire) Remplis avec les infos trouvées ou écris 'Non renseigné.'

AUTRES ZONES : Si l'utilisateur mentionne une autre zone anatomique (ex: Membres, Rachis, Crâne, Peau, Dentition, etc.), crée une catégorie en MAJUSCULES après 'BASSIN' et insère les infos.

CONCLUSION : (Obligatoire) Synthétise le diagnostic et la conduite à tenir. Si aucune info n'est disponible, résume simplement l'état général.

3. RÈGLES DE STYLE ET FORMATAGE
Utilise un langage médical professionnel (ex: transformer 'gros cœur' en 'cardiomégalie', 'mal au ventre' en 'douleur abdominale').
Garde les valeurs numériques exactes (ex: 10,2 V, 39,5 °C). Si tu détectes des erreurs de frappe ou des tics de langage, nettoie-les.
Sois concis, professionnel et direct.

Ne perds aucune information : chaque fait clinique de la dictée doit apparaître dans le compte rendu.
Ne propose aucun suivi, examen complémentaire ou conseil non mentionné dans la dictée.

Répondre UNIQUEMENT avec le compte rendu final, sans commentaire ni explication.

Dictée :
{text}

Compte rendu :"""


_OUTPUT_MARKERS = (
    "Compte rendu :", "Compte rendu:", "Bilan :", "Bilan:",
    "Texte final :", "Texte final:", "Enriched text:", "Enriched text :",
)

_EMPTY_BODY_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"^aucune information",
        r"^aucun traitement",
        # "non renseigné" est conservé pour les sections obligatoires — ne pas filtrer ici
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

# Marqueur valide pour les sections obligatoires sans contenu
_NON_RENSEIGNE_RE = re.compile(r"^non renseign[ée]\.?$", re.IGNORECASE)

_SECTION_HEADER_RE = re.compile(
    r"^(?P<header>[A-ZÀ-ÜÉÈÊËÎÏÔÙÛÜÇ][A-ZÀ-ÜÉÈÊËÎÏÔÙÛÜÇ0-9 \-'/]+?)\s*:\s*(?P<rest>.*)$",
)

_SOURCE_SECTION_RE = re.compile(
    r"^(?P<header>[A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ0-9 \-'/]*?)\s*:\s*(?P<rest>.*)$",
)

_NESTED_HEADER_ONLY_RE = re.compile(
    r"^[A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ][A-Za-zÀ-ÜÉÈÊËÎÏÔÙÛÜÇ0-9 \-'/]*?\s*:\s*$",
)

# Pattern: ligne d'identité avec valeur "Non renseigné"
_IDENTITY_NON_RENSEIGNE_RE = re.compile(
    r"^\[?\s*(Nom|Espèce|Race|\u00c2ge|Age|Sexe|Poids)\s*:\s*Non renseign[eé]\.?\s*\]?$",
    re.IGNORECASE,
)
# Pattern: ligne d'identité entre crochets valide [Espece : Chat] -> Espece : Chat
_IDENTITY_BRACKET_RE = re.compile(r"^\[\s*(.+?)\s*\]$")
# Pattern: instruction vocale recopiee
_VOICE_INSTRUCTION_RE = re.compile(r"dans la partie .+?,?\s*ajouter\s*:", re.IGNORECASE)
# Pattern: lignes parasites du prompt
_PROMPT_ARTIFACT_RE = re.compile(
    r"^\s*(\[A\]|\[B\]|\[C\]|\u2501+|\u258c"
    r"|STRUCTURE |REGLES |CONTROLE FINAL|REPONDRE UNIQUEMENT|Texte source\s*:"
    r"|Dictée\s*:|SECTIONS OBLIGATOIRES|ZONES SUPPLEMENTAIRES"
    r"|PRESENTATION DE L.ANIMAL|EXAMEN CLINIQUE ET IMAGERIE)",
    re.IGNORECASE,
)

_PARENTHETICAL_RE = re.compile(r"\([^)]+\)")

_SECTION_ALIASES: dict[str, tuple[str, ...]] = {
    "THORAX": ("THORAX", "EXAMEN CLINIQUE"),
    "EXAMEN CLINIQUE": ("EXAMEN CLINIQUE", "THORAX"),
}


def sanitize_enriched_output(raw: str) -> str:
    """Retire les préfixes de prompt recopies, les crochets d'identité et les artefacts."""
    text = raw.strip()
    for marker in _OUTPUT_MARKERS:
        lower = text.lower()
        key = marker.lower()
        if key in lower:
            idx = lower.rfind(key)
            tail = text[idx + len(marker):].strip()
            if tail:
                text = tail

    cleaned: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        # Supprimer les champs d'identité avec "Non renseigné"
        if _IDENTITY_NON_RENSEIGNE_RE.match(stripped):
            continue
        # Supprimer les instructions vocales recopiees
        if _VOICE_INSTRUCTION_RE.search(stripped):
            continue
        # Supprimer les lignes parasites du prompt
        if _PROMPT_ARTIFACT_RE.match(stripped):
            continue
        # Retirer les crochets autour des lignes d'identité
        bracket_match = _IDENTITY_BRACKET_RE.match(stripped)
        if bracket_match:
            cleaned.append(bracket_match.group(1))
        else:
            cleaned.append(line)

    return "\n".join(cleaned).strip()


def _fold_accents(text: str) -> str:
    folded = unicodedata.normalize("NFD", text.lower())
    return "".join(c for c in folded if unicodedata.category(c) != "Mn")


def _normalize_for_match(text: str) -> str:
    text = text.lower().replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _is_placeholder_line(line: str, allow_non_renseigne: bool = False) -> bool:
    stripped = line.strip()
    if not stripped:
        return True
    # "Non renseigné." est un contenu valide pour les sections obligatoires
    if allow_non_renseigne and _NON_RENSEIGNE_RE.match(stripped):
        return False
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


def _clean_factual_body_lines(body_lines: list[str], allow_non_renseigne: bool = False) -> list[str]:
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
        # Accepter "Non renseigné." pour les sections obligatoires
        if allow_non_renseigne and _NON_RENSEIGNE_RE.match(stripped):
            cleaned.append(stripped)
            continue
        if _is_factual_line(stripped):
            cleaned.append(stripped)
    return cleaned


def _is_empty_section_body(body: str) -> bool:
    lines = _clean_factual_body_lines(body.splitlines())
    return len(lines) == 0


def drop_empty_sections(text: str) -> str:
    """Retire les sections sans ligne factuelle réelle (conserve THORAX/ABDOMEN/BASSIN même vides)."""
    lines = text.splitlines()
    preamble: list[str] = []
    i = 0

    while i < len(lines):
        if _SECTION_HEADER_RE.match(lines[i]):
            break
        if _is_factual_line(lines[i]) or _SOURCE_SECTION_RE.match(lines[i]):
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
        is_mandatory = header.strip().upper() in MANDATORY_SECTIONS
        body_lines: list[str] = []
        rest = match.group("rest").strip()
        if rest:
            body_lines.append(rest)
        i += 1

        while i < len(lines) and not _SECTION_HEADER_RE.match(lines[i]):
            body_lines.append(lines[i])
            i += 1

        factual_lines = _clean_factual_body_lines(body_lines, allow_non_renseigne=is_mandatory)
        if not factual_lines:
            if is_mandatory:
                kept_blocks.append(f"{header} :\nNon renseigné.")
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


# Filtres agressifs désactivés : on fait confiance au LLM pour générer et formuler le contenu.


def normalize_spacing(text: str) -> str:
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def ensure_mandatory_sections(text: str) -> str:
    """Garantit que THORAX, ABDOMEN, BASSIN sont présents dans l'ordre.
    PRÉSENTATION en tête (si présente), CONCLUSION toujours en fin."""
    lines = text.splitlines()
    i = 0

    # Conserver le préambule (texte libre avant la première section)
    preamble_lines: list[str] = []
    while i < len(lines) and not _SECTION_HEADER_RE.match(lines[i]):
        preamble_lines.append(lines[i])
        i += 1

    # Extraire toutes les sections
    present: dict[str, str] = {}  # header_upper -> bloc complet
    other_blocks: list[str] = []
    while i < len(lines):
        match = _SECTION_HEADER_RE.match(lines[i])
        if not match:
            i += 1
            continue
        header_upper = match.group("header").strip().upper()
        block_lines = [lines[i]]
        i += 1
        while i < len(lines) and not _SECTION_HEADER_RE.match(lines[i]):
            block_lines.append(lines[i])
            i += 1
        block = "\n".join(block_lines).strip()
        # Unifier PRÉSENTATION / PRÉSENTATION DU PATIENT
        if header_upper.startswith("PRÉSENTATION") or header_upper.startswith("PRESENTATION"):
            present["PRÉSENTATION"] = block
        elif header_upper in MANDATORY_SECTIONS:
            present[header_upper] = block
        elif header_upper == "CONCLUSION":
            present["CONCLUSION"] = block
        else:
            other_blocks.append(block)

    ordered: list[str] = []

    # Préambule (texte hors section)
    preamble = "\n".join(preamble_lines).strip()
    if preamble:
        ordered.append(preamble)

    # PRÉSENTATION en premier (conditionnelle)
    if "PRÉSENTATION" in present:
        ordered.append(present["PRÉSENTATION"])

    # THORAX / ABDOMEN / BASSIN obligatoires
    for section in MANDATORY_SECTIONS:
        if section in present:
            ordered.append(present[section])
        else:
            ordered.append(f"{section} :\nNon renseigné.")

    # Sections supplémentaires
    ordered.extend(other_blocks)

    # CONCLUSION toujours en dernier
    if "CONCLUSION" in present:
        ordered.append(present["CONCLUSION"])
    else:
        ordered.append("CONCLUSION :\nNon renseigné.")

    return "\n\n".join(ordered).strip()


def post_process_enriched_text(text: str, source: str = "") -> str:
    text = sanitize_enriched_output(text)
    if source:
        text = remove_unsourced_parentheticals(text, source)
    text = drop_empty_sections(text)
    # Garantir la présence et l'ordre des sections obligatoires
    text = ensure_mandatory_sections(text)
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
