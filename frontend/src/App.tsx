import { useState, useEffect } from "react";
import { CustomProvider } from "rsuite";
import { ContactForm } from "./components/ContactForm";
import { SunIcon, MoonIcon } from "./components/icons";
import { LanguageProvider } from "./context/LanguageContext";
import { useLanguage } from "./context/useLanguage";
import { t } from "./config/i18n/index";
import "./App.css";

function AppInner() {
  const { languageCode } = useLanguage();
  const tr = (key: Parameters<typeof t>[1]) => t(languageCode, key);

  const [theme, setTheme] = useState<"dark" | "light">(() =>
    (localStorage.getItem("pixocia-theme") as "dark" | "light") ?? "dark"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("pixocia-theme", theme);
  }, [theme]);

  return (
    <CustomProvider theme={theme}>
      <div className="app-layout">
        <div className="orb orb-tl" />
        <div className="orb orb-br" />

        <nav className="navbar">
          <div className="navbar-logo">
            <div className="logo-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="oklch(0.10 0.018 240)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="11" rx="3"/>
                <path d="M5 10a7 7 0 0 0 14 0"/>
                <line x1="12" y1="17" x2="12" y2="21"/>
                <line x1="9" y1="21" x2="15" y2="21"/>
              </svg>
            </div>
            <span className="logo-text">PIX<em>OCIA</em></span>
          </div>

          <div className="navbar-stepper">
            <div className="step-item">
              <span className="step-circle active">1</span>
              <span className="step-name">{tr("title")}</span>
            </div>
            <div className="step-progress-bar">
              <div className="step-progress-fill" style={{ width: "0%" }} />
            </div>
            <div className="step-item">
              <span className="step-circle inactive">2</span>
              <span className="step-name">{tr("subject")}</span>
            </div>
          </div>

          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            type="button"
            aria-label="Changer le thème"
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </nav>

        <main className="main-content">
          <div className="hero">
            <h1 className="hero-title">
              {tr("heroTitle")}<br />
              <span className="hero-title-green">{tr("heroTitleAccent")}</span>
            </h1>
          </div>

          <div className="form-wrapper">
            <ContactForm />
          </div>
        </main>

        <footer className="site-footer">
          <span><strong className="footer-brand">PIXOCIA</strong> </span>
          <span>100% open source · 14 {tr("language").toLowerCase()}s</span>
        </footer>
      </div>
    </CustomProvider>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppInner />
    </LanguageProvider>
  );
}
