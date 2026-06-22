# PicoxIA — Dictée vocale multilingue & Enrichissement NLP

Outil open source permettant aux professionnels vétérinaires de dicter des comptes rendus dans **14 langues**, de les transcrire en temps réel, et de les enrichir via une intelligence artificielle locale (LLM).

## 🌍 Langues Supportées
Français, Anglais, Allemand, Serbe, Grec, Néerlandais, Russe, Ukrainien, Italien, Finnois, Portugais, Slovaque, Espagnol, Tchèque.

---

## 🛠 Stack Technique
* **Frontend :** React 19, TypeScript, Vite 8, RSuite 6.
* **Backend :** Python Flask.
* **Speech-to-Text :** Vosk (WebAssembly offline) / Whisper (API locale).
* **NLP (Enrichissement) :** Ollama (modèle `qwen2.5:3b` par défaut).
* **Base de données :** MongoDB + PyMongo.

---

## ⚙️ Architecture & Fonctionnalités

### 1. Transcription Vocale Hybride (Vosk / Whisper)
L'application intègre un double moteur de transcription pour une résilience maximale :
- **Mode Auto :** Tente d'utiliser **Whisper** (haute précision) via le backend Python. En cas d'échec ou d'absence de réseau, l'application bascule automatiquement et silencieusement sur **Vosk**.
- **Mode Haute Précision :** Force l'utilisation de **Whisper** via `POST /api/transcribe`.
- **Mode Offline :** Force l'utilisation de **Vosk**, qui s'exécute à 100% dans le navigateur WebAssembly (modèles mis en cache, ~40-80Mo par langue). Aucune donnée ne quitte la machine.

### 2. Enrichissement NLP (Ollama)
L'intelligence artificielle transforme une dictée brute (style oral, hésitations) en un compte rendu médical structuré et formaté dans la langue d'origine.
- **100% Local :** L'inférence est réalisée via Ollama sans aucun appel API externe, garantissant la confidentialité absolue des données médicales (RGPD).
- **Zéro Hallucination :** Le modèle extrait dynamiquement les zones du corps mentionnées et réutilise le vocabulaire exact du vétérinaire, sans générer de jargon médical non sollicité.
- **Multilinguisme natif :** L'IA comprend la langue source et génère automatiquement la structure (titres comme "PRÉSENTATION", "CONCLUSION") dans la même langue.

### 3. Base de données MongoDB
Sauvegarde des rapports pour une traçabilité totale.
- Schéma d'un compte rendu : `text_original`, `text_enrichi`, `langue`, `type_demande`, `date`.

---

## 🚀 Installation & Lancement

### Prérequis
- Node.js (v18+)
- Python 3.10+
- [Ollama](https://ollama.ai) (avec le modèle `qwen2.5:3b` téléchargé : `ollama run qwen2.5:3b`)
- MongoDB (local sur le port 27017, ou via URI distant)

### 1. Lancer Ollama
```bash
ollama serve
```

### 2. Lancer le Backend (Flask + Whisper + MongoDB)
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate  # Sous Windows
pip install -r requirements.txt
python app.py
```
*Le serveur tourne par défaut sur `http://localhost:5000`.*

### 3. Lancer le Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
*L'application est accessible sur `http://localhost:5174/`.*

---

## 📖 Documentation de l'API Backend

### Endpoints NLP & Transcription
- `GET /api/health` : Vérifie que Flask et Whisper sont opérationnels.
- `GET /api/enrich/health` : Vérifie la connexion à Ollama et liste les modèles installés.
- `POST /api/transcribe` : Reçoit un flux audio multipart et retourne le texte via Whisper.
- `POST /api/enrich` : Reçoit `{ text, language }` et retourne le texte restructuré par l'IA.

### Endpoints MongoDB (Comptes rendus)
- `POST /api/reports` : Sauvegarde un compte rendu. (Body: `{ "text_original": "...", "text_enrichi": "...", "langue": "fr" }`)
- `GET /api/reports` : Liste tous les comptes rendus enregistrés.
- `GET /api/reports/<id>` : Récupère un rapport précis via son ObjectId.

---

## 🌐 Traduction Automatique du Frontend

Le projet inclut un script utilitaire pour traduire automatiquement l'interface utilisateur dans les 14 langues via l'API MyMemory.
```bash
cd frontend
npm run translate
```
**Fonctionnement :** 
Toute nouvelle clé ajoutée au fichier source `frontend/src/config/i18n/fr.ts` sera traduite et injectée dans les 13 autres langues sans écraser les clés existantes.

---

## 👥 Contexte du Projet
Développé dans le cadre du projet tuteuré **MIAGE 2026** sous la supervision de Benjamin TONI.
