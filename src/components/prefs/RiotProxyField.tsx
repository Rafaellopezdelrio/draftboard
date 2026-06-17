// Pref field for the Cloudflare Worker proxy URL. When set, the rest of
// the app routes Riot API calls through the proxy instead of using the
// user's own dev key — solves the 24-hour rotating-key UX problem.

import { useTranslation } from "react-i18next";
import { usePrefsStore } from "../../state/prefsStore";

export function RiotProxyField() {
  const { t } = useTranslation();
  const proxyUrl = usePrefsStore((s) => s.prefs.riotProxyUrl);
  const set = usePrefsStore((s) => s.set);
  const active = proxyUrl.trim().length > 0;
  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2 flex items-center gap-2">
        <span>{t("prefs.proxy.title")}</span>
        {active && (
          <span className="text-[9px] uppercase tracking-widest text-good bg-good/15 px-1.5 py-0.5 rounded">
            ✓ {t("prefs.proxy.active")}
          </span>
        )}
      </h3>
      <div className="space-y-2">
        <input
          type="text"
          value={proxyUrl}
          onChange={(e) => set("riotProxyUrl", e.target.value.trim())}
          placeholder={t("prefs.proxy.placeholder")}
          className="w-full bg-bg text-white text-sm px-3 py-2 rounded border border-border-subtle focus:border-accent outline-none font-mono"
        />
        <p className="text-xs text-white/60 leading-relaxed">
          {active ? (
            <>
              <span className="text-good">✓</span> {t("prefs.proxy.descActive")}
            </>
          ) : (
            <>
              {t("prefs.proxy.descInactivePrefix")}
              <code className="text-accent">cloudflare-worker/README.md</code>
              {t("prefs.proxy.descInactiveSuffix")}
            </>
          )}
        </p>
      </div>
    </section>
  );
}
