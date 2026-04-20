import { createContext } from "react";

export type LanguageCtx = {
  languageCode: string;
  setLanguageCode: (code: string) => void;
};

export const LanguageContext = createContext<LanguageCtx>({
  languageCode: "fr",
  setLanguageCode: () => {},
});