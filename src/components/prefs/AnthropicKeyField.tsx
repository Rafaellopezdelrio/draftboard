// AI provider + API key field. Despite the legacy name "Anthropic",
// it handles Groq, Gemini, and Anthropic in one place — each provider
// has its own key slot so the user can switch without re-pasting.
// When the proxy is configured AND provider is Groq, the proxy injects
// the shared production key, so the user doesn't need to configure one.

import { usePrefsStore } from "../../state/prefsStore";
import {
  PROVIDER_LABELS,
  PROVIDER_SIGNUP_URLS,
  type AiProvider,
} from "../../services/aiProvider";

export function AnthropicKeyField() {
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
        AI provider
      </h3>
      <div className="space-y-2">
        <select
          value={provider}
          onChange={(e) => set("aiProvider", e.target.value as AiProvider)}
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle"
        >
          {(Object.keys(PROVIDER_LABELS) as AiProvider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABELS[p]}
            </option>
          ))}
        </select>

        {proxyHandlesIt ? (
          <p className="text-xs text-good bg-good/10 border border-good/30 rounded p-2">
            ✓ AI Coach activo automáticamente vía proxy. No necesitas configurar
            nada. (Power users: pega tu propia key abajo para usar tu propia cuota.)
          </p>
        ) : (
          <>
            {provider === "groq" && (
              <p className="text-xs text-good">
                ✓ 100% gratis. Sin tarjeta. Crea cuenta y copia la key (30s).
              </p>
            )}
            {provider === "gemini" && (
              <p className="text-xs text-good">
                ✓ Cuota gratuita generosa. Necesita cuenta Google.
              </p>
            )}
            {provider === "anthropic" && (
              <p className="text-xs text-meh">
                ⚠️ Pago por uso (≈ 0.005-0.03$ por respuesta). Mejor calidad.
              </p>
            )}
          </>
        )}

        <input
          type="password"
          value={currentKey}
          onChange={(e) => setKey(e.target.value)}
          placeholder={proxyHandlesIt ? "opcional — proxy ya inyecta key compartida" : placeholder}
          className="w-full bg-bg px-3 py-2 rounded outline-none border border-border-subtle focus:border-accent text-white text-sm"
        />
        {!proxyHandlesIt && (
          <a
            href={PROVIDER_SIGNUP_URLS[provider]}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent/80 hover:text-accent block"
          >
            Obtén tu key gratis en {new URL(PROVIDER_SIGNUP_URLS[provider]).hostname} →
          </a>
        )}

        <div className="flex items-center gap-2 pt-1">
          <label className="text-xs text-white/50">Idioma del coach</label>
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
