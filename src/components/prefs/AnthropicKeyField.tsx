// AI provider + API key field. Despite the legacy name "Anthropic",
// it handles Groq, Gemini, and Anthropic in one place — each provider
// has its own key slot so the user can switch without re-pasting.
// When the proxy is configured AND provider is Groq, the proxy injects
// the shared production key, so the user doesn't need to configure one.

import { useTranslation } from "react-i18next";
import { usePrefsStore } from "../../state/prefsStore";
import {
  PROVIDER_LABELS,
  PROVIDER_SIGNUP_URLS,
  type AiProvider,
} from "../../services/aiProvider";

export function AnthropicKeyField() {
  const { t } = useTranslation();
  const provider = usePrefsStore((s) => s.prefs.aiProvider);
  const groqKey = usePrefsStore((s) => s.prefs.groqApiKey);
  const geminiKey = usePrefsStore((s) => s.prefs.geminiApiKey);
  const anthropicKey = usePrefsStore((s) => s.prefs.anthropicApiKey);
  const lang = usePrefsStore((s) => s.prefs.aiCoachLanguage);
  const proxyUrl = usePrefsStore((s) => s.prefs.riotProxyUrl);
  const set = usePrefsStore((s) => s.set);
  // When proxy active AND provider is Groq, the user does NOT need their own key
  // — the proxy injects the shared production key.
  const proxyHandlesIt = provider === "groq" && proxyUrl.trim().length > 0;

  const currentKey =
    provider === "groq" ? groqKey : provider === "gemini" ? geminiKey : anthropicKey;
  const setKey = (v: string) => {
    if (provider === "groq") set("groqApiKey", v);
    else if (provider === "gemini") set("geminiApiKey", v);
    else set("anthropicApiKey", v);
  };
  const placeholder =
    provider === "groq"
      ? "gsk_..."
      : provider === "gemini"
        ? "AIza..."
        : "sk-ant-...";

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        {t("prefs.ai.title")}
      </h3>
      <div className="space-y-2">
        <select
          value={provider}
          onChange={(e) => set("aiProvider", e.target.value as AiProvider)}
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle"
        >
          {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
            <option key={p} value={p}>
              {t(PROVIDER_LABELS[p])}
            </option>
          ))}
        </select>

        {proxyHandlesIt ? (
          <p className="text-xs text-good bg-good/10 border border-good/30 rounded p-2">
            {t("prefs.ai.proxyNote")}
          </p>
        ) : (
          <>
            {provider === "groq" && (
              <p className="text-xs text-good">{t("prefs.ai.groqFree")}</p>
            )}
            {provider === "gemini" && (
              <p className="text-xs text-good">{t("prefs.ai.geminiFree")}</p>
            )}
            {provider === "anthropic" && (
              <p className="text-xs text-meh">{t("prefs.ai.anthropicPaid")}</p>
            )}
          </>
        )}

        <input
          type="password"
          value={currentKey}
          onChange={(e) => setKey(e.target.value)}
          placeholder={proxyHandlesIt ? t("prefs.ai.keyPlaceholderProxy") : placeholder}
          className="w-full bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white text-sm"
        />
        {!proxyHandlesIt && (
          <a
            href={PROVIDER_SIGNUP_URLS[provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent/80 hover:text-accent block"
          >
            {t("prefs.ai.getKey", { host: new URL(PROVIDER_SIGNUP_URLS[provider]).hostname })}
          </a>
        )}

        <div className="flex items-center gap-2 pt-1">
          <label className="text-xs text-white/50">{t("prefs.aiCoachLang")}</label>
          <select
            value={lang}
            onChange={(e) =>
              set("aiCoachLanguage", e.target.value as "es" | "en")
            }
            className="bg-bg text-white text-xs px-2 py-1 rounded border border-border-subtle"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </section>
  );
}
