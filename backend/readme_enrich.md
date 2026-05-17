# README - Enrichissement IA vétérinaire

But: décrire l'étape 2, qui ajoute un enrichissement de texte vétérinaire via Ollama.

Ce qui a été fait
- Ajout de la dépendance `ollama` dans `requirements.txt`.
- Création du blueprint `backend/enrich.py`.
- Ajout de `POST /api/enrich`.

Comportement de l'endpoint
- Reçoit:

```json
{ "text": "...", "language": "fr" }
```

- Retourne:

```json
{ "text_enrichi": "..." }
```

Modèles Ollama possibles
- `llama3.2:3b` (défaut)
- `mistral:7b-instruct`

Installation Ollama
1. Installer Ollama sur la machine.
2. Télécharger un modèle:

```bash
ollama pull llama3.2:3b
# ou
ollama pull mistral:7b-instruct
```

3. Vérifier que le service Ollama tourne en local.

Variables d'environnement
- `OLLAMA_MODEL` (par défaut `llama3.2:3b`)

Langues supportées
- `fr`, `en`, `de`, `sr`, `el`, `nl`, `ru`, `uk`, `it`, `fi`, `pt`, `sk`, `es`, `cs`

Règles du prompt
- Réponse uniquement dans la langue reçue.
- Texte enrichi, clair, médicalement prudent.
- Pas de diagnostic inventé, pas de dosage inventé, pas de liste inutile.

Test rapide
1. Lancer Ollama.
2. Lancer le backend Flask.
3. Tester avec Postman:

```json
{
  "text": "Le chat mange moins et vomit depuis 2 jours.",
  "language": "fr"
}
```

4. Attendre une réponse du type:

```json
{ "text_enrichi": "..." }
```

Exemple curl

```bash
curl -X POST http://localhost:5000/api/enrich ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"Le chat mange moins et vomit depuis 2 jours.\",\"language\":\"fr\"}"
```

Validation attendue
- Le `POST` retourne `200`.
- La réponse contient uniquement `text_enrichi`.
- La sortie est rédigée dans la langue demandée.
