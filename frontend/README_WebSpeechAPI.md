# Web Speech API — Documentation

## Qu'est-ce que la Web Speech API ?

La Web Speech API est une interface native des navigateurs modernes qui permet de faire de la reconnaissance vocale **directement depuis le navigateur**, sans installer de bibliothèque externe. Elle est standardisée par le W3C et implémentée nativement dans Chrome et Edge.

Sous le capot, Chrome envoie l'audio capturé aux **serveurs Google** pour le traiter, puis renvoie le texte transcrit. C'est pourquoi une connexion internet est obligatoire.

---

## Comparaison des trois moteurs

| Critère | Whisper | Vosk | Web Speech API |
|---|---|---|---|
| **Localisation** | Serveur Flask local | Navigateur (WebAssembly) | Serveurs Google (cloud) |
| **Connexion requise** | Réseau local (port 5000) | Non | Oui (internet) |
| **Précision** | Très haute | Moyenne | Haute |
| **Langues supportées** | 99 langues | Modèle à télécharger par langue | ~50 langues |
| **Latence** | Après l'enregistrement | Temps réel | Temps réel |
| **Résultats intermédiaires** | Non | Oui | Oui |
| **Dépendance externe** | Backend Python requis | Modèle ~50 Mo à télécharger | Aucune installation |
| **Confidentialité** | Audio reste en local | Audio reste en local | Audio envoyé à Google |
| **Support navigateur** | Tous | Tous | Chrome / Edge uniquement |

### En résumé

- **Whisper** : meilleure précision, mais nécessite de lancer le backend Python.
- **Vosk** : 100 % local et hors-ligne, mais le modèle doit être téléchargé au premier lancement (~50 Mo par langue).
- **Web Speech API** : la plus simple à utiliser (aucune installation), résultats en temps réel, mais dépend de Google et ne fonctionne que sur Chrome/Edge.

---

## Comment ça marche techniquement

### Flux de données

```
Microphone
    │
    ▼
SpeechRecognition (API navigateur)
    │
    ├─── résultats intermédiaires (isFinal = false) ──► texte grisé en temps réel
    │
    └─── résultat final        (isFinal = true)  ──► texte ajouté au message
```

### Propriétés clés configurées

```ts
rec.lang = "fr-FR";        // langue de reconnaissance
rec.continuous = true;     // ne s'arrête pas après une pause
rec.interimResults = true; // retourne les mots au fur et à mesure
rec.maxAlternatives = 1;   // on prend la meilleure hypothèse uniquement
```

- `continuous = true` : la reconnaissance continue même si tu marques une pause, jusqu'à ce que tu cliques sur "Arrêter".
- `interimResults = true` : chaque syllabe reconnue est renvoyée immédiatement, ce qui donne l'effet "le texte apparaît en direct".

---

## Implémentation dans le code

### 1. Le hook `useWebSpeechRecognition.ts`

C'est le cœur de l'intégration. Il expose trois choses : `start`, `stop`, et `status`.

```ts
// Détection du support navigateur
function getSpeechRecognitionCtor() {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}
```

La vérification `webkitSpeechRecognition` est nécessaire car Chrome utilise encore le préfixe `webkit`.

```ts
rec.onresult = (event) => {
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    if (result.isFinal) {
      onFinalResult(result[0].transcript.trim()); // ajouté au message
    } else {
      interim += result[0].transcript;            // affiché en gris
    }
  }
};
```

### 2. Ajout du mode dans `VoiceRecorder.tsx`

Un quatrième bouton `webspeech` a été ajouté dans le tableau `MODE_DATA` :

```ts
const MODE_DATA = [
  { value: "auto",       key: "modeAuto" },
  { value: "whisper",    key: "modeWhisper" },
  { value: "offline",    key: "modeOffline" },
  { value: "webspeech",  key: "modeWebSpeech" }, // nouveau
];
```

### 3. Branchement dans `ContactForm.tsx`

Dans `handleVoiceStart`, un nouveau cas gère le mode Web Speech :

```ts
if (transcriptionMode === "webspeech") {
  setActiveDictationPath("webspeech");
  webSpeech.start();
  return;
}
```

Dans `handleVoiceStop` :

```ts
if (activeDictationPath === "webspeech") {
  webSpeech.stop();
  setActiveDictationPath(null);
  return;
}
```

Le verrou de dictée (`isDictationLock`) a aussi été étendu pour bloquer le formulaire pendant une session Web Speech :

```ts
const isDictationLock =
  (activeDictationPath === "whisper" && ...) ||
  (activeDictationPath === "vosk"    && ...) ||
  (activeDictationPath === "webspeech" && webSpeech.status === "listening"); // nouveau
```

---

## Limitations connues

- **Firefox** : ne supporte pas la Web Speech API — un message d'erreur s'affiche.
- **Safari** : support partiel et instable.
- **Confidentialité** : l'audio est transmis aux serveurs de Google, donc à éviter pour des données médicales sensibles en production.
- **Langue** : le code langue passé doit être au format BCP-47 (ex: `fr-FR`, `en-US`). Le projet passe le code court (`fr`, `en`) ce qui fonctionne car Chrome le tolère.
