import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrefsStore } from "../state/prefsStore";
import { syncPersonalData, type SyncProgress } from "../services/personalDataSync";
import { getCurrentSummoner } from "../services/lcuService";

interface Props {
  onClose: () => void;
}

type Step = "welcome" | "level" | "syncing" | "done";

export function OnboardingView({ onClose }: Props) {
  const { t } = useTranslation();
  const set = usePrefsStore((s) => s.set);
  const [step, setStep] = useState<Step>("welcome");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [summary, setSummary] = useState<string>("");

  async function handleStart() {
    setStep("syncing");
    // Hard cap: 12s. If LCU is unreachable, don't block the user forever.
    const timeout = new Promise<{ timeout: true }>((resolve) =>
      setTimeout(() => resolve({ timeout: true }), 12_000)
    );
    const work = (async () => {
      const summoner = await getCurrentSummoner();
      const result = await syncPersonalData(setProgress);
      return { summoner, result };
    })();
    const race = await Promise.race([work, timeout]);

    if ("timeout" in race) {
      setSummary(t("onboarding.timeoutSummary"));
      setStep("done");
      return;
    }

    const { summoner, result } = race;
    if (result.source === "none") {
      setSummary(t("onboarding.noneSummary"));
    } else {
      setSummary(
        t("onboarding.syncedSummary", {
          account: summoner?.gameName ?? t("onboarding.account"),
          tag: summoner?.tagLine ?? "",
          matches: result.matches,
          masteries: result.masteries,
          source: result.source,
        })
      );
    }
    setStep("done");
  }

  function skipToManual() {
    setSummary(t("onboarding.manualSummary"));
    setStep("done");
  }

  async function handleFinish() {
    await set("onboardingDone", true);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
      <div className="animate-[scaleIn_180ms_ease-out] glass border border-border-strong rounded-lg p-6 w-[520px] space-y-4">
        {step === "welcome" && (
          <>
            <h2 className="text-2xl font-bold text-accent">
              {t("onboarding.welcomeTitle")}
            </h2>
            <p className="text-sm text-white/80">{t("onboarding.helpYou")}</p>
            <ul className="space-y-1.5 text-sm text-white/80 ml-2">
              <li>{t("onboarding.help1")}</li>
              <li>{t("onboarding.help2")}</li>
              <li>{t("onboarding.help3")}</li>
              <li>{t("onboarding.help4")}</li>
            </ul>
            <div className="bg-bg-card border border-border-subtle rounded p-3 text-xs text-white/70">
              <strong className="text-good">{t("onboarding.privateTitle")}</strong>{" "}
              {t("onboarding.privateBody1")}{" "}
              <strong>{t("onboarding.privateNotBannable")}</strong>{t("onboarding.privateBody2")}
            </div>
            <button
              onClick={handleStart}
              className="w-full py-3 bg-accent text-black font-medium rounded"
            >
              {t("onboarding.start")}
            </button>
            <button
              onClick={skipToManual}
              className="w-full py-2 text-sm text-white/60 hover:text-white"
            >
              {t("onboarding.skip")}
            </button>
            <p className="text-xs text-white/40 text-center">
              {t("onboarding.recommend")}
            </p>
          </>
        )}

        {step === "level" && (
          <>
            <h2 className="text-xl font-semibold text-accent">{t("onboarding.levelTitle")}</h2>
            <p className="text-sm text-white/70">{t("onboarding.levelSub")}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  set("beginnerMode", true);
                  setStep("syncing");
                  handleStart();
                }}
                className="w-full p-3 bg-bg-card border border-border-subtle rounded hover:border-accent text-left"
              >
                <p className="font-medium text-white">{t("onboarding.newTitle")}</p>
                <p className="text-xs text-white/60">{t("onboarding.newDesc")}</p>
              </button>
              <button
                onClick={() => {
                  set("beginnerMode", false);
                  setStep("syncing");
                  handleStart();
                }}
                className="w-full p-3 bg-bg-card border border-border-subtle rounded hover:border-accent text-left"
              >
                <p className="font-medium text-white">{t("onboarding.expTitle")}</p>
                <p className="text-xs text-white/60">{t("onboarding.expDesc")}</p>
              </button>
            </div>
          </>
        )}

        {step === "syncing" && (
          <>
            <h2 className="text-xl font-semibold text-accent">{t("onboarding.syncingTitle")}</h2>
            {progress && (
              <>
                <p className="text-sm text-white/80">
                  {t("onboarding.source")} <span className="text-accent">{progress.source}</span>
                </p>
                <p className="text-sm text-white/60">{progress.message}</p>
                {progress.total > 0 && (
                  <div className="w-full bg-bg-card rounded h-2 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all"
                      style={{
                        width: `${(progress.done / progress.total) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </>
            )}
            {!progress && (
              <p className="text-sm text-white/60">{t("onboarding.searchingClient")}</p>
            )}
            <button
              onClick={skipToManual}
              className="w-full py-2 text-sm text-white/60 hover:text-white border border-border-subtle rounded"
            >
              {t("onboarding.skipManual")}
            </button>
            <p className="text-xs text-white/40 text-center">
              {t("onboarding.slowHint")}
            </p>
          </>
        )}

        {step === "done" && (
          <>
            <h2 className="text-xl font-semibold text-good">{t("onboarding.doneTitle")}</h2>
            <p className="text-sm text-white/80">{summary}</p>
            <div className="bg-bg-card border border-border-subtle rounded p-3 text-xs text-white/70">
              <p className="font-medium text-white mb-1">{t("onboarding.nextSteps")}</p>
              <ul className="space-y-1">
                <li>{t("onboarding.next1")}</li>
                <li>{t("onboarding.next2Prefix")} <strong>Coach</strong> {t("onboarding.next2Suffix")}</li>
                <li>{t("onboarding.next3Prefix")} <strong>Prefs</strong> {t("onboarding.next3Suffix")}</li>
              </ul>
            </div>
            <button
              onClick={handleFinish}
              className="w-full py-3 bg-accent text-black font-medium rounded"
            >
              {t("onboarding.finish")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
