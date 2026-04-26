# Installation :
# python -m venv .venv
# .venv\Scripts\activate
# pip install -r requirements.txt
#
# Lancement :
# python app.py

import os
import tempfile
import uuid
from typing import Any, Optional

from flask import Flask, jsonify, request
from flask_cors import CORS
from faster_whisper import WhisperModel

# Modèle chargé une seule fois au démarrage
_whisper: Optional[WhisperModel] = None


def get_model() -> WhisperModel:
    global _whisper
    if _whisper is None:
        _whisper = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "engine": "whisper"})

    @app.post("/api/transcribe")
    def transcribe():
        f = request.files.get("audio")
        if f is None or f.filename in ("", None):
            return (
                jsonify(
                    {
                        "error": "Aucun fichier reçu. Utilisez le champ multipart 'audio'."
                    }
                ),
                400,
            )

        try:
            model = get_model()
            suffix = os.path.splitext(f.filename or "")[1] or ".webm"
            fd, path = tempfile.mkstemp(
                suffix=suffix, prefix=f"picoxia_{uuid.uuid4().hex}_"
            )
            os.close(fd)
            f.save(path)
            # Langue (optionnel) : chaîne vide ou "auto" => détection par Whisper
            lang = (request.form.get("language") or "").strip()
            if lang.lower() in ("", "auto"):
                language_kw: Any = None
            else:
                language_kw = lang

            try:
                segments, _ = model.transcribe(
                    path, beam_size=5, language=language_kw
                )
                text = " ".join(
                    seg.text.strip() for seg in segments if seg.text
                ).strip()
            finally:
                try:
                    os.unlink(path)
                except OSError:
                    pass
        except Exception as e:
            return (
                jsonify(
                    {
                        "error": f"Échec de la transcription Whisper: {e!s}",
                    }
                ),
                500,
            )

        return jsonify({"text": text, "engine": "whisper"})

    return app


app = create_app()
get_model()  # un seul chargement en mémoire par processus

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
