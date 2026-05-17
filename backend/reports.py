from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Optional

from flask import Blueprint, jsonify, request
from bson import ObjectId
from pymongo import MongoClient

reports_bp = Blueprint("reports", __name__, url_prefix="/api")

_mongo_client: Optional[MongoClient] = None
_reports_collection = None


def get_reports_collection():
    global _mongo_client, _reports_collection
    if _reports_collection is None:
        mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        mongo_db = os.getenv("MONGODB_DB", "projet_miage")
        mongo_collection = os.getenv("MONGODB_COLLECTION", "reports")
        _mongo_client = MongoClient(mongo_uri)
        _reports_collection = _mongo_client[mongo_db][mongo_collection]
    return _reports_collection


def serialize_report(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(report["_id"]),
        "text_original": report.get("text_original", ""),
        "text_enrichi": report.get("text_enrichi", ""),
        "langue": report.get("langue", ""),
        "type_demande": report.get("type_demande", ""),
        "date": report.get("date").isoformat() if report.get("date") else None,
    }


@reports_bp.post("/reports")
def create_report():
    payload = request.get_json(silent=True) or {}
    required_fields = ["text_original", "text_enrichi", "langue", "type_demande"]
    missing_fields = [field for field in required_fields if not str(payload.get(field, "")).strip()]

    if missing_fields:
        return (
            jsonify({"error": "Champs manquants ou invalides.", "missing_fields": missing_fields}),
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


@reports_bp.get("/reports")
def list_reports():
    try:
        collection = get_reports_collection()
        reports = list(collection.find().sort("date", -1))
    except Exception as exc:
        return jsonify({"error": f"Impossible de récupérer les comptes rendus: {exc!s}"}), 500

    return jsonify([serialize_report(report) for report in reports])


@reports_bp.get("/reports/<report_id>")
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
