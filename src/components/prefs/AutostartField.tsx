// "Start with Windows" toggle. Not a regular pref because the source of
// truth is the Windows registry, not our SQLite prefsStore — we read it
// on mount and re-read after every flip so the UI reflects the actual
// OS state even if another process (uninstaller, registry cleaner)
// changed it.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  disableAutostart,
  enableAutostart,
  isAutostartEnabled,
} from "../../services/autostart";

export function AutostartField() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isAutostartEnabled().then(setEnabled);
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) await disableAutostart();
      else await enableAutostart();
      const next = await isAutostartEnabled();
      setEnabled(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="text-xs uppercase tracking-wide text-white/50 mb-2">
        {t("prefs.autostart.title")}
      </h3>
      <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-white/5 transition">
        <input
          type="checkbox"
          checked={!!enabled}
          disabled={busy || enabled === null}
          onChange={toggle}
          className="w-4 h-4 accent-accent"
        />
        <div className="flex-1">
          <p className="text-sm text-white">
            {t("prefs.autostart.toggle")}
            {busy && <span className="ml-2 text-xs text-white/40">{t("prefs.autostart.applying")}</span>}
          </p>
          <p className="text-xs text-white/50 mt-0.5">
            {t("prefs.autostart.desc")}
          </p>
        </div>
      </label>
    </section>
  );
}
