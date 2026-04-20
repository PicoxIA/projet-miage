export type Language = {
  code: string;
  label: string;
  nativeLabel: string;
  modelUrl: string;
};

export const LANGUAGES: Language[] = [
  {
    code: "fr",
    label: "Français",
    nativeLabel: "Français",
    modelUrl: "/vosk-models/vosk-model-small-fr-0.22.zip",
  },
  {
    code: "en",
    label: "Anglais",
    nativeLabel: "English",
    modelUrl: "/vosk-models/vosk-model-small-en-us-0.15.zip",
  },
  {
    code: "de",
    label: "Allemand",
    nativeLabel: "Deutsch",
    modelUrl: "/vosk-models/vosk-model-small-de-0.15.zip",
  },
  {
    code: "sr",
    label: "Serbe",
    nativeLabel: "Srpski",
    modelUrl: "/vosk-models/vosk-model-small-sr-0.3.zip",
  },
  {
    code: "el",
    label: "Grec",
    nativeLabel: "Ελληνικά",
    modelUrl: "/vosk-models/vosk-model-small-el-gr-0.7.zip",
  },
  {
    code: "nl",
    label: "Néerlandais",
    nativeLabel: "Nederlands",
    modelUrl: "/vosk-models/vosk-model-small-nl-0.22.zip",
  },
  {
    code: "ru",
    label: "Russe",
    nativeLabel: "Русский",
    modelUrl: "/vosk-models/vosk-model-small-ru-0.22.zip",
  },
  {
    code: "uk",
    label: "Ukrainien",
    nativeLabel: "Українська",
    modelUrl: "/vosk-models/vosk-model-small-uk-v3-small.zip",
  },
  {
    code: "it",
    label: "Italien",
    nativeLabel: "Italiano",
    modelUrl: "/vosk-models/vosk-model-small-it-0.22.zip",
  },
  {
    code: "fi",
    label: "Finnois",
    nativeLabel: "Suomi",
    modelUrl: "/vosk-models/vosk-model-small-fi-0.22.zip",
  },
  {
    code: "pt",
    label: "Portugais",
    nativeLabel: "Português",
    modelUrl: "/vosk-models/vosk-model-small-pt-0.3.zip",
  },
  {
    code: "sk",
    label: "Slovaque",
    nativeLabel: "Slovenčina",
    modelUrl: "/vosk-models/vosk-model-small-sk-0.4.zip",
  },
  {
    code: "es",
    label: "Espagnol",
    nativeLabel: "Español",
    modelUrl: "/vosk-models/vosk-model-small-es-0.42.zip",
  },
  {
    code: "cs",
    label: "Tchèque",
    nativeLabel: "Čeština",
    modelUrl: "/vosk-models/vosk-model-small-cs-0.4-rhasspy.zip",
  },
];