# Picoxia — Phase 2 : Enrichissement NLP avec Ollama

## Ce qui a été réalisé

### Backend — Endpoint NLP (`backend/app.py`)

L'objectif de cette partie est de transformer un texte brut dicté par un vétérinaire (style oral, fautes, abréviations) en un rapport radiologique structuré et professionnel.

**Technologie utilisée : Ollama**

Ollama est un outil open source qui permet de faire tourner des grands modèles de langage (LLM) entièrement **en local**, sans connexion internet, sans coût d'API. Le modèle utilisé est `llama3.2:3b` (3 milliards de paramètres, ~2 Go).

**Ce qui a été ajouté :**

- `GET /api/enrich/health` — vérifie qu'Ollama est lancé et que le modèle est disponible. Retourne la liste des modèles installés.
- `POST /api/enrich` — reçoit `{ text, language }`, envoie le texte au modèle via un prompt spécialisé, retourne `{ text_enrichi, text_original, langue, model }`.

**Le prompt d'enrichissement** demande au modèle de :
- Corriger les fautes d'orthographe et de grammaire
- Enrichir le vocabulaire avec des termes vétérinaires techniques
- Structurer le texte en sections (Anamnèse, Examen, Diagnostic, Traitement)
- Préserver toutes les données médicales originales (dosages, mesures, durées)
- Répondre **dans la même langue** que le texte d'entrée (14 langues supportées)

**Configuration :**
- Le modèle est configurable via la variable d'environnement `OLLAMA_MODEL` (défaut : `llama3.2:3b`)
- L'hôte Ollama est configurable via `OLLAMA_HOST` (défaut : `http://localhost:11434`)

---

### Frontend — Intégration NLP

**Nouveau fichier : `frontend/src/services/enrichmentApi.ts`**

Service qui encapsule les appels HTTP vers le backend NLP, sur le même modèle que `transcriptionApi.ts`. Expose la fonction `enrichText(text, language)` qui appelle `POST /api/enrich` avec un timeout de 60 secondes (le modèle peut prendre plusieurs secondes à répondre).

**Modifications dans `ContactForm.tsx`**

Ajout d'une nouvelle section "Enrichissement IA" avec :
- Un bouton **"Enrichir avec l'IA"** (désactivé si le champ message est vide ou si une dictée est en cours)
- Un indicateur de chargement pendant le traitement Ollama
- Un **panneau de comparaison avant/après** qui s'affiche une fois l'enrichissement terminé :
  - Colonne gauche : texte original
  - Colonne droite : texte enrichi
  - Bouton **"Utiliser"** : remplace le message par le texte enrichi
  - Bouton **"Ignorer"** : ferme le panneau sans modifier le message
- Un message d'erreur si Ollama n'est pas lancé

**Traductions dans les 14 fichiers i18n** — toutes les nouvelles clés UI sont traduites dans chaque langue du projet.

---

## Lancement

```bash
# Terminal 1 — Lancer Ollama
ollama serve

# Terminal 2 — Lancer le backend Flask
cd backend
.venv\Scripts\activate
python app.py

# Terminal 3 — Lancer le frontend
cd frontend
npm run dev
```

---

## Autres solutions envisageables et améliorations possibles

### Changer de modèle Ollama

| Modèle | Taille | Avantages | Inconvénients |
|---|---|---|---|
| `llama3.2:3b` *(actuel)* | ~2 Go | Léger, rapide | Moins précis sur les termes médicaux |
| `mistral:7b-instruct` | ~4.5 Go | Très bon en français, excellent pour la rédaction structurée | Nécessite plus de RAM |
| `llama3.1:8b` | ~5 Go | Meilleure compréhension médicale | Plus lent |
| `phi4-mini` | ~2.5 Go | Très bon rapport qualité/taille | Moins testé en français |
| `meditron` | ~7 Go | Modèle spécialisé médical (fine-tuné sur PubMed) | Rare, moins facile à installer |

**Recommandation :** Tester `mistral:7b-instruct` si la machine a 8 Go de RAM disponibles. Mistral AI est une entreprise française, le modèle est particulièrement performant en français et pour les textes structurés.

---

### Amélioration du prompt

Le prompt actuel est générique (rapport radiologique vétérinaire). On pourrait :

- **Adapter le prompt selon la spécialité** : radiologie, chirurgie, médecine interne, dermatologie — chacune a son vocabulaire propre
- **Injecter un exemple de rapport type** dans le prompt (few-shot prompting) pour que le modèle suive un format précis et constant
- **Ajouter des instructions de format** : "utilise des titres en gras", "liste les médicaments avec posologie sous forme de tableau"
- **Utiliser le fichier `picoxia-exemple-rapport-type-fr.txt`** déjà présent dans le projet comme exemple de référence injecté dans le prompt

---

### Alternatives à Ollama

| Solution | Fonctionnement | Avantages | Inconvénients |
|---|---|---|---|
| **API OpenAI (GPT-4o)** | Cloud, payant | Qualité maximale, multilingue natif | Payant, données envoyées hors UE |
| **API Mistral AI** | Cloud, payant | Excellente qualité en français, moins cher | Données cloud |
| **Hugging Face Inference API** | Cloud, gratuit limité | Accès à des modèles médicaux spécialisés | Lent en version gratuite |
| **Ollama + modèle médical** | Local | 100% local, spécialisé | Modèles médicaux rares et lourds |
| **Google Gemma 2 via Ollama** | Local | Bon équilibre qualité/poids | Moins performant en français |

---

### Améliorations côté sauvegarde (MongoDB — Personne 1)

Une fois le backend MongoDB en place, l'enrichissement pourrait :

- **Sauvegarder automatiquement** les deux versions (originale et enrichie) dans la même entrée MongoDB
- **Historiser les enrichissements** : garder un journal de toutes les versions d'un rapport pour auditer les modifications
- **Calculer un score de qualité** : comparer la longueur, la densité de termes médicaux avant/après pour mesurer l'apport du NLP

---

### Améliorations côté UX frontend (Personne 4)

- **Surligner les différences** entre le texte original et le texte enrichi (diff coloré mot par mot)
- **Afficher le temps de traitement** Ollama pour que l'utilisateur sache combien de temps ça a pris
- **Bouton "Ré-enrichir"** : permettre de relancer l'enrichissement sur un texte déjà enrichi pour affiner
- **Mode streaming** : afficher le texte enrichi au fur et à mesure que Ollama le génère (token par token), comme ChatGPT — l'API Ollama le supporte via `stream=True`
- **Indicateur de disponibilité Ollama** dans la navbar (vert/rouge selon l'état de `GET /api/enrich/health`)

---

### Considérations pour la production

- **Ollama en local** est parfait pour un projet académique mais pas pour un déploiement multi-utilisateurs : un seul utilisateur à la fois peut utiliser le modèle
- Pour scaler, il faudrait basculer vers une API cloud (Mistral, OpenAI) ou déployer Ollama sur un serveur dédié avec GPU
- Les données vétérinaires sont potentiellement sensibles (données patients) : l'approche **100% locale avec Ollama** est un avantage majeur pour la conformité RGPD
