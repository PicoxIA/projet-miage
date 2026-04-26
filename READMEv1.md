# Picoxia

Formulaire de contact vétérinaire multilingue avec **transcription hybride** (Whisper côté serveur + Vosk dans le navigateur) et 14 langues.

---

## Nouvelles fonctionnalités

### Transcription hybride

| Moteur | Rôle | Quand l’utiliser |
|--------|------|--------------------|
| **Whisper** (backend Python) | Haute précision, audio envoyé au serveur local | Connexion OK et backend lancé |
| **Vosk** (navigateur, WebAssembly) | Mode **offline** ou secours | Pas de serveur, ou repli automatique |

### Modes disponibles (dans l’interface)

- **Auto** : essaie **Whisper** si le backend est joignable (navigateur en ligne) ; en cas d’indisponibilité, **bascule vers Vosk** avec un message explicite.
- **Haute précision** : **Whisper uniquement** (pas de repli Vosk) ; une erreur s’affiche si le backend ne répond pas.
- **Offline** : **Vosk uniquement** (dictée 100 % locale, indépendante du serveur de transcription).

---

## Stack

**Frontend**

- React 19 / TypeScript 6 / Vite 8
- RSuite 6 (composants UI)
- vosk-browser 0.0.8 (reconnaissance vocale WebAssembly)
- Appel optionnel du backend : `transcriptionApi` (Whisper) — URL par défaut `http://127.0.0.1:5000`, surcharge possible avec `VITE_TRANSCRIPTION_API`

**Backend (transcription optionnelle)**

- Python / Flask, endpoint `POST /api/transcribe` (Whisper / faster-whisper selon l’implémentation du projet)
- `GET /api/health` pour vérifier que le service est prêt

---

## Lancement du projet

Le frontend vit dans le dossier **`frontend/`** ; l’API de transcription, dans **`backend/`**.

### Backend (Whisper)

À lancer quand tu veux la **haute précision** et les appels `POST /api/transcribe` / `GET /api/health` sur ta machine (port habituel : **5000**).

**Windows (PowerShell ou cmd), avec un environnement virtuel `.venv` :**

```bash
cd backend
.venv\Scripts\activate
python app.py
```

*(Adapte l’activation du venv si ton dossier s’appelle autrement, ou installe les dépendances Python listées par le dépôt avant `python app.py`.)*

### Frontend

**Installation et mode développement :**

```bash
cd frontend
npm install
npm run dev
```

Ouvre l’URL affichée par Vite (souvent `http://localhost:5173`).

---

## Installation (référence rapide)

```bash
cd frontend
npm install
```

Les modèles Vosk sont téléchargés automatiquement depuis AlphaCephei au premier lancement de chaque langue (40–80 Mo par modèle, mis en cache par le navigateur).

Pour un déploiement hors ligne, placer les fichiers `.zip` dans `frontend/public/vosk-models/` avec les noms définis dans `src/config/languages.ts`.

---

## Scripts

*À exécuter depuis le dossier **`frontend/`*

| Commande            | Description                                              |
|---------------------|----------------------------------------------------------|
| `npm run dev`       | Serveur de développement                                 |
| `npm run build`     | Build de production                                      |
| `npm run lint`      | Analyse statique ESLint                                  |
| `npm run translate` | Traduit les clés manquantes de `fr.ts` vers les 13 autres langues via MyMemory |

---

## Structure (frontend)

```
frontend/src/
├── components/
│   ├── icons.tsx            # Icones SVG centralisees
│   ├── ContactForm.tsx      # Formulaire principal
│   ├── LanguageSelector.tsx
│   └── VoiceRecorder.tsx
├── config/
│   ├── languages.ts         # Liste des 14 langues et URLs des modeles
│   └── i18n/
│       ├── fr.ts            # Source de verite — editer ce fichier uniquement
│       └── index.ts         # Auto-genere par npm run translate
├── context/
│   ├── language.ts          # Definition du contexte
│   ├── LanguageContext.tsx  # Provider
│   └── useLanguage.ts       # Hook
├── hooks/
│   ├── useVoskRecognition.ts
│   └── useWhisperRecognition.ts
└── services/
    └── transcriptionApi.ts
```

---

## Script de traduction automatique (`frontend/scripts/translate.mjs`)

Le script traduit les cles manquantes de `fr.ts` vers les 13 autres langues via l'API MyMemory (gratuite, sans cle). Il s'execute automatiquement a chaque `npm run dev` et `npm run build`.

Fonctionnement :
- Un hash MD5 de `fr.ts` est cache dans `frontend/scripts/.translate-cache`. Si le fichier n'a pas change, le script est ignore.
- Seules les cles **absentes** dans chaque fichier cible sont traduites. Les cles existantes ne sont jamais ecrasees.
- Les traductions sont executees en parallele avec un pool de 10 requetes simultanees.
- Les balises HTML retournees par l'API (`<g id="1">...</g>`) sont supprimees automatiquement.
- En cas d'echec de traduction d'une cle, la valeur francaise est utilisee en fallback.

Ajouter une cle : editer `fr.ts`, puis `npm run translate`. `TranslationKey = keyof typeof fr` garantit la validite de toutes les cles a la compilation.

---

## Reconnaissance vocale (Vosk WebAssembly) et Whisper

- **Vosk** : la reconnaissance s’exécute entièrement dans le navigateur via `vosk-browser` (WebAssembly). Aucun envoi d’audio vers un service externe pour Vosk.
- **Whisper** : l’enregistrement de la dictée peut être envoyé en **POST** multipart vers le backend local (`/api/transcribe`) ; le moteur affiché dans l’UI indique **Whisper** ou **Vosk** selon le chemin choisi (voir *Transcription hybride* et les modes *Auto* / *Haute précision* / *Offline*).

Pipeline Vosk (inchangé) :
1. `getUserMedia` capture le flux microphone (mono, echoCancellation, noiseSuppression).
2. Un `AudioContext` est cree et le flux est connecte a deux branches en parallele :
   - `ScriptProcessorNode` : transmet les buffers audio a `KaldiRecognizer` pour la reconnaissance.
   - `AnalyserNode` : alimente la visualisation waveform et le niveau dB en temps reel.
3. `KaldiRecognizer` emet deux evenements : `result` (transcription finale) et `partialresult` (transcription intermediaire affichee pendant la dictee).
4. A l'arret, tous les noeuds audio sont deconnectes, le flux microphone est libere et l'`AudioContext` est ferme.
