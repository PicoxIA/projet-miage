# Picoxia - Outil de dictée multilingue et enrichissement de texte

## 📝 Présentation du projet
Développement d'un outil permettant aux utilisateurs de dicter des messages ou d'enrichir des comptes rendus préremplis dans **14 langues** via une interface web open source.

### 🌍 Langues supportées
Français, Anglais, Allemand, Serbe, Grec, Néerlandais, Russe, Ukrainien, Italien, Finnois, Portugais, Slovaque, Espagnol, Tchèque.

---

## 🛠 Stack Technique
* **Frontend :** React + TypeScript, Semantic UI / RS Suite.
* **Backend :** Python Flask + MongoDB.
* **Speech-to-Text :** Pistes explorées : Vosk, Whisper ou react-speech-recognition.
* **NLP :** Hugging Face Transformers (modèles multilingues).

---

## 🚀 Étapes du Développement

### Étape 1 : Formulaire de contact multilingue avec dictée vocale
**Objectif :** Créer une interface de contact avec transcription en temps réel.
* **Interface :** Sélecteur de langue (14 langues), input sujet et textarea message.
* **Indicateurs :** Boutons de contrôle et indicateur visuel "Écoute en cours...".
* **Backend :** Classification automatique du type de demande (bug logiciel, matériel...).

### Étape 2 : Enrichissement multilingue de textarea
**Objectif :** Enrichir un compte rendu vétérinaire via dictée vocale et analyse IA pour structurer le texte.
* **Fonctionnalité :** Ajout de texte sur un contenu préexistant.
* **Traitement NLP :** Correction grammaticale et enrichissement du vocabulaire technique via le backend.
* **Modèles suggérés :** `bert-base-multilingual-cased` ou `xlm-roberta-base`.

---

## 📅 Planning (8 à 12 semaines)
| Semaine | Étape 1 : Dictée | Étape 2 : NLP |
| :--- | :--- | :--- |
| **1-2** | Recherche & Interface | Spécifications NLP |
| **3-5** | Intégration & Tests | Développement Backend |
| **6-8** | Corrections & Livraison | Documentation & Présentation |

---

## 👥 Encadrement
* **Superviseur :** Benjamin TONI.
* **Contexte :** Projet Tuteuré MIAGE 2026.
