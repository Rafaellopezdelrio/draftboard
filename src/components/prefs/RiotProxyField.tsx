// Pref field for the Cloudflare Worker proxy URL. When set, the rest of
// the app routes Riot API calls through the proxy instead of using the
// user's own dev key — solves the 24-hour rotating-key UX problem.

import { usePrefsStore } from "../../state/prefsStore";

export function RiotProxyField() {
  const proxyUrl = usePrefsStore((s) => s.prefs.riotProxyUrl);
  const set = usePrefsStore((s) => s.set);
  const active = proxyUrl.trim().length > 0;
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2 flex items-center gap-2">
        <span>Riot API — modo premium (proxy)</span>
        {active && (
          <span className="text-[9px] uppercase tracking-widest text-good bg-good/15 px-1.5 py-0.5 rounded">
            ✓ activo
          </span>
        )}
      </h3>
      <div className="space-y-2">
        <input
          type="text"
          value={proxyUrl}
          onChange={(e) => set("riotProxyUrl", e.target.value.trim())}
          placeholder="https://draftboard-riot-proxy.tu-cuenta.workers.dev"
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle focus:border-accent outline-none font-mono"
        />
        <p className="text-xs text-white/60 leading-relaxed">
          {active ? (
            <>
              <span className="text-good">✓</span> Usando proxy. No necesitas tu propia
              API key Riot. Más rápido (caché en edge) y la key nunca caduca.
            </>
          ) : (
            <>
              Pega aquí la URL de tu Cloudflare Worker para evitar tener que
              renovar la dev key cada 24h. Ver{" "}
              <code className="text-accent">cloudflare-worker/README.md</code> en el
              repo para deployar (gratis, ~5 min).
            </>
          )}
        </p>
      </div>
    </section>
  );
}
