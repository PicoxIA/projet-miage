# README - MongoDB Reports (readme_mongo)

But: expliquer rapidement ce qui a été ajouté au backend et comment tester les endpoints MongoDB.

Ce qui a été fait
- Ajout de la dépendance `pymongo` dans `requirements.txt`.
- Extraction des routes de gestion des comptes rendus dans `backend/reports.py` (Blueprint `/api/reports`).
- Enregistrement du blueprint dans `backend/app.py`.

Schéma d'un compte rendu (document MongoDB)
- `text_original` (string)
- `text_enrichi` (string)
- `langue` (string)
- `type_demande` (string)
- `date` (ISO8601 / stocké en tant que datetime)

Variables d'environnement
- `MONGODB_URI` (par défaut `mongodb://localhost:27017`)
- `MONGODB_DB` (par défaut `projet_miage`)
- `MONGODB_COLLECTION` (par défaut `reports`)

Démarrage local
1. Installer les dépendances :

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

2. Lancer MongoDB local (ou définir `MONGODB_URI` vers une instance distante).

3. Lancer le serveur Flask :

```bash
python app.py
```

Endpoints (testables immédiatement)
- `GET /api/health` — vérifie que Flask et Whisper sont vivants.
- `POST /api/reports` — créer un compte rendu (JSON, voir exemple ci-dessous).
- `GET /api/reports` — lister les comptes rendus.
- `GET /api/reports/<id>` — récupérer un compte rendu par son `id`.

Exemple `POST /api/reports` (Postman / curl)

Body JSON (raw):

```json
{
  "text_original": "Le chat vomit depuis hier.",
  "text_enrichi": "Le chat présente des épisodes de vomissements depuis 24h. Surveillance et bilan recommandés.",
  "langue": "fr",
  "type_demande": "compte_rendu",
  "date": "2026-05-17T10:30:00Z"
}
```

curl (Windows PowerShell - copyable) :

```powershell
curl -X POST http://localhost:5000/api/reports -H "Content-Type: application/json" -d @payload.json
# ou inline:
curl -X POST http://localhost:5000/api/reports -H "Content-Type: application/json" -d '{"text_original":"...","text_enrichi":"...","langue":"fr","type_demande":"compte_rendu"}'
```

Critères de validation
- Le `POST` retourne `201 Created` et un objet JSON contenant `id` et les champs sauvegardés.
- `GET /api/reports` retourne le document inséré.
- `GET /api/reports/<id>` retourne le document individuel.

Notes
- Le traitement IA / NLP n'est pas intégré dans ces routes : ces endpoints servent uniquement à persister et récupérer les comptes rendus.
- Si MongoDB n'est pas joignable, les endpoints renvoient une erreur 500 contenant le message d'exception.

