# Picoxia — Frontend

Formulaire de contact vétérinaire multilingue avec dictée vocale hors ligne (Vosk WebAssembly), 14 langues supportées.

---

## Stack

- React 19 / TypeScript 6 / Vite 8
- RSuite 6 (composants UI)
- vosk-browser 0.0.8 (reconnaissance vocale WebAssembly)

---

## Installation

```bash
npm install
npm run dev
```

Les modèles Vosk sont téléchargés automatiquement depuis AlphaCephei au premier lancement de chaque langue (40–80 Mo par modèle, mis en cache par le navigateur).

Pour un déploiement hors ligne, placer les fichiers `.zip` dans `public/vosk-models/` avec les noms définis dans `src/config/languages.ts`.

---

## Scripts

| Commande            | Description                                              |
|---------------------|----------------------------------------------------------|
| `npm run dev`       | Serveur de développement                                 |
| `npm run build`     | Build de production                                      |
| `npm run lint`      | Analyse statique ESLint                                  |
| `npm run translate` | Traduit les clés manquantes de `fr.ts` vers les 13 autres langues via MyMemory |

---

## Structure

```
src/
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
└── hooks/
    └── useVoskRecognition.ts
```

---

## Script de traduction automatique (`scripts/translate.mjs`)

Le script traduit les cles manquantes de `fr.ts` vers les 13 autres langues via l'API MyMemory (gratuite, sans cle). Il s'execute automatiquement a chaque `npm run dev` et `npm run build`.

Fonctionnement :
- Un hash MD5 de `fr.ts` est cache dans `scripts/.translate-cache`. Si le fichier n'a pas change, le script est ignore.
- Seules les cles **absentes** dans chaque fichier cible sont traduites. Les cles existantes ne sont jamais ecrasees.
- Les traductions sont executees en parallele avec un pool de 10 requetes simultanees.
- Les balises HTML retournees par l'API (`<g id="1">...</g>`) sont supprimees automatiquement.
- En cas d'echec de traduction d'une cle, la valeur francaise est utilisee en fallback.

Ajouter une cle : editer `fr.ts`, puis `npm run translate`. `TranslationKey = keyof typeof fr` garantit la validite de toutes les cles a la compilation.

---

## Reconnaissance vocale (Vosk WebAssembly)

La reconnaissance vocale s'execute entierement dans le navigateur via `vosk-browser`, qui compile Vosk en WebAssembly. Aucun audio n'est envoye a un serveur externe.

Pipeline audio :
1. `getUserMedia` capture le flux microphone (mono, echoCancellation, noiseSuppression).
2. Un `AudioContext` est cree et le flux est connecte a deux branches en parallele :
   - `ScriptProcessorNode` : transmet les buffers audio a `KaldiRecognizer` pour la reconnaissance.
   - `AnalyserNode` : alimente la visualisation waveform et le niveau dB en temps reel.
3. `KaldiRecognizer` emet deux evenements : `result` (transcription finale) et `partialresult` (transcription intermediaire affichee pendant la dictee).
4. A l'arret, tous les noeuds audio sont deconnectes, le flux microphone est libere et l'`AudioContext` est ferme.
