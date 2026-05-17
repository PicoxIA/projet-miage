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
from enrich import enrich_bp
from reports import reports_bp

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
    app.register_blueprint(enrich_bp)
    app.register_blueprint(reports_bp)

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

    @app.post("/api/reports")
    def create_report():
        payload = request.get_json(silent=True) or {}
        required_fields = ["text_original", "text_enrichi", "langue", "type_demande"]
        missing_fields = [field for field in required_fields if not str(payload.get(field, "")).strip()]

        if missing_fields:
            return (
                jsonify(
                    {
                        "error": "Champs manquants ou invalides.",
                        "missing_fields": missing_fields,
                    }
                ),
                400,
            )

        report = {
            "text_original": str(payload["text_original"]).strip(),
            "text_enrichi": str(payload["text_enrichi"]).strip(),
            "langue": str(payload["langue"]).strip(),
            "type_demande": str(payload["type_demande"]).strip(),
            "date": datetime.now(timezone.utc),
        }

        date_value = payload.get("date")
        if date_value:
            try:
                report["date"] = datetime.fromisoformat(str(date_value).replace("Z", "+00:00"))
            except ValueError:
                return jsonify({"error": "Le champ 'date' doit être au format ISO 8601."}), 400

        try:
            collection = get_reports_collection()
            inserted_id = collection.insert_one(report).inserted_id
        except Exception as exc:
            return jsonify({"error": f"Impossible de sauvegarder le compte rendu: {exc!s}"}), 500

        saved_report = {**report, "_id": inserted_id}
        return jsonify(serialize_report(saved_report)), 201

    @app.get("/api/reports")
    def list_reports():
        try:
            collection = get_reports_collection()
            reports = list(collection.find().sort("date", -1))
        except Exception as exc:
            return jsonify({"error": f"Impossible de récupérer les comptes rendus: {exc!s}"}), 500

        return jsonify([serialize_report(report) for report in reports])

    @app.get("/api/reports/<report_id>")
    def get_report(report_id: str):
        if not ObjectId.is_valid(report_id):
            return jsonify({"error": "Identifiant MongoDB invalide."}), 400

        try:
            collection = get_reports_collection()
            report = collection.find_one({"_id": ObjectId(report_id)})
        except Exception as exc:
            return jsonify({"error": f"Impossible de récupérer le compte rendu: {exc!s}"}), 500

        if report is None:
            return jsonify({"error": "Compte rendu introuvable."}), 404

        return jsonify(serialize_report(report))

    return app


app = create_app()
get_model()  # un seul chargement en mémoire par processus

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
