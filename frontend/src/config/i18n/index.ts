// AUTO-GENERATED — edit fr.ts then run: npm run translate
import { fr } from "./fr";
import { en } from "./en";
import { de } from "./de";
import { sr } from "./sr";
import { el } from "./el";
import { nl } from "./nl";
import { ru } from "./ru";
import { uk } from "./uk";
import { it } from "./it";
import { fi } from "./fi";
import { pt } from "./pt";
import { sk } from "./sk";
import { es } from "./es";
import { cs } from "./cs";

export type TranslationKey = keyof typeof fr;
export type Translations   = typeof fr;

export const I18N: Record<string, Translations> = {
  fr,
  en,
  de,
  sr,
  el,
  nl,
  ru,
  uk,
  it,
  fi,
  pt,
  sk,
  es,
  cs,
};

export function t(langCode: string, key: TranslationKey): string {
  return I18N[langCode]?.[key] ?? I18N.en?.[key] ?? I18N.fr[key];
}
