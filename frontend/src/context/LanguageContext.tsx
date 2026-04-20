import { useState } from "react";
import { LanguageContext } from "./language";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [languageCode, setLanguageCode] = useState("fr");
  return (
    <LanguageContext.Provider value={{ languageCode, setLanguageCode }}>
      {children}
    </LanguageContext.Provider>
  );
}