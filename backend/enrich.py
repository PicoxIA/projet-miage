from __future__ import annotations

import os
from typing import Final

from flask import Blueprint, jsonify, request
import ollama

enrich_bp = Blueprint("enrich", __name__, url_prefix="/api")

SUPPORTED_LANGUAGES: Final[dict[str, str]] = {
    "fr": "français",
    "en": "english",
    "de": "deutsch",
    "sr": "srpski",
    "el": "ελληνικά",
    "nl": "nederlands",
    "ru": "русский",
    "uk": "українська",
    "it": "italiano",
    "fi": "suomi",
    "pt": "português",
    "sk": "slovenčina",
    "es": "español",
    "cs": "čeština",
}


def get_model_name() -> str:
    return os.getenv("OLLAMA_MODEL", "llama3.2:3b")


def build_prompt(text: str, language_code: str) -> str:
    language_name = SUPPORTED_LANGUAGES[language_code]
    return f"""Tu es un assistant vétérinaire expert.

Ta mission est d'enrichir un texte dicté par un utilisateur pour produire un compte rendu professionnel, clair, structuré et médicalement prudent.

Contraintes obligatoires:
- Réponds uniquement dans la langue suivante: {language_name}.
- Ne change pas la langue de sortie.
- N'ajoute pas de titre, de liste à puces, de préambule ni d'explication.
- Reste fidèle aux faits présents dans le texte.
- Corrige les fautes évidentes et reformule de manière plus fluide.
- Structure le contenu si nécessaire en phrases courtes et médicalement lisibles.
- N'invente jamais de diagnostic certain, de dosage, ni de traitement non mentionné.
- Si le texte est incomplet, enrichis de façon prudente sans inventer de faits.
- Le résultat doit être directement réutilisable dans un compte rendu vétérinaire.

Texte à enrichir:
{text}
"""


@enrich_bp.post("/enrich")
@enrich_bp.post("/enrich/")
@enrich_bp.post("/api/enrich")
@enrich_bp.post("/api/enrich/")
def enrich_text():
    payload = request.get_json(silent=True) or {}
    text = str(payload.get("text", "")).strip()
    language = str(payload.get("language", "")).strip().lower()

    if not text:
        return jsonify({"error": "Le champ 'text' est obligatoire."}), 400

    if language not in SUPPORTED_LANGUAGES:
        return (
            jsonify(
                {
                    "error": "Langue non supportée.",
                    "supported_languages": sorted(SUPPORTED_LANGUAGES.keys()),
                }
            ),
            400,
        )

    model_name = get_model_name()
    prompt = build_prompt(text, language)

    try:
        response = ollama.chat(
            model=model_name,
            messages=[
                {"role": "system", "content": "Tu rédiges des comptes rendus vétérinaires clairs, précis et sûrs."},
                {"role": "user", "content": prompt},
            ],
        )
        text_enrichi = response["message"]["content"].strip()
    except Exception as exc:
        return (
            jsonify(
                {
                    "error": f"Échec de l'enrichissement via Ollama: {exc!s}",
                    "model": model_name,
                }
            ),
            500,
        )

    return jsonify({"text_enrichi": text_enrichi})
