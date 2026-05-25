// First-launch gate showing the privacy notice, third-party data sources,
// and Riot's "not endorsed by Riot Games" disclaimer. User MUST click
// "Acepto" before the rest of the app renders. We record the acceptance
// timestamp in prefsStore — GDPR requires a consent record for EU users.
//
// Once accepted the gate never shows again unless prefs are wiped.

import { useState } from "react";
import { ScrollText, Shield, Database, Bot } from "lucide-react";
import { usePrefsStore } from "../state/prefsStore";
import { TERMS_VERSION } from "../config";

interface Props {
  /** Render the children only after acceptance. */
  children: React.ReactNode;
}

export function TermsGate({ children }: Props) {
  const acceptedAt = usePrefsStore((s) => s.prefs.termsAcceptedAt);
  const acceptedVersion = usePrefsStore((s) => s.prefs.termsAcceptedVersion);
  const setPref = usePrefsStore((s) => s.set);
  const loaded = usePrefsStore((s) => s.loaded);
  const [agreeChecked, setAgreeChecked] = useState(false);

  // Wait for prefs to hydrate from SQLite before deciding whether to
  // show the gate — otherwise the user sees the gate flash even after
  // a previous acceptance.
  if (!loaded) return null;

  // Re-prompt when the terms version bumps even if user already accepted
  // an older version (GDPR: material wording changes need fresh consent).
  const accepted =
    !!acceptedAt && acceptedVersion === TERMS_VERSION;
  const isReAcceptance = !!acceptedAt && acceptedVersion !== TERMS_VERSION;

  if (accepted) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] bg-bg flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-bg-card border border-border-strong rounded-lg w-full max-w-2xl my-8 shadow-2xl">
        <header className="p-6 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-accent" />
            <h1 className="text-xl font-semibold text-white">
              {isReAcceptance
                ? "Aviso legal actualizado"
                : "Aviso legal y privacidad"}
            </h1>
          </div>
          <p className="text-sm text-white/65 mt-2">
            {isReAcceptance
              ? "Hemos cambiado partes del aviso. Lee y vuelve a aceptar para continuar."
              : "Antes de empezar, lee qué datos usamos y de quién."}
          </p>
        </header>

        <div className="p-6 space-y-5 text-sm text-white/80 leading-relaxed">
          <Section icon={Database} title="Datos que guardamos">
            <ul className="list-disc pl-5 space-y-1 text-white/70">
              <li>
                <strong>Tu cuenta de LoL</strong>: nombre, PUUID y región. Se
                lee del cliente de LoL local (no compartimos).
              </li>
              <li>
                <strong>Historial de partidas</strong>: KDA, CS, builds, items.
                Almacenado en SQLite local en tu PC.
              </li>
              <li>
                <strong>Preferencias</strong>: roles, ajustes UI, claves API
                opcionales. Todo local.
              </li>
              <li>
                <strong>Telemetría de errores</strong> (Sentry): solo crashes
                anonimizados — sin nombres, sin chat, sin partidas.
              </li>
            </ul>
            <p className="text-white/55 text-xs mt-2">
              Puedes exportar o borrar todo en Settings → Mis datos. Cumple con
              GDPR (derechos de acceso, portabilidad y supresión).
            </p>
          </Section>

          <Section icon={Bot} title="Fuentes de datos externas">
            <p className="text-white/70">
              Draftboard consulta datos públicos de: <strong>Riot Data Dragon</strong>,
              <strong> op.gg</strong>, <strong>dpm.lol</strong>, <strong>u.gg</strong>,{" "}
              <strong>Leaguepedia</strong>, y opcionalmente proveedores de IA
              (Groq/Anthropic/Gemini) cuando tú añades tu clave.
            </p>
          </Section>

          <Section icon={ScrollText} title="Riot Games — no endorsado">
            <p className="text-white/70">
              Draftboard <strong>no está endorsado por Riot Games</strong> y no
              refleja las opiniones de Riot Games ni de nadie oficialmente
              involucrado en producir o gestionar League of Legends. League of
              Legends y Riot Games son marcas registradas de Riot Games, Inc.
            </p>
            <p className="text-white/55 text-xs mt-2">
              Solo usamos APIs oficiales (LCU + Live Client). No leemos memoria
              del juego, no hay automatización ingame, nada bannable.
            </p>
          </Section>

          <div className="bg-bg-elev border border-border-subtle rounded p-3 text-xs text-white/60">
            Licencia MIT. Código fuente y términos completos en{" "}
            <span className="text-accent">LICENSE</span> dentro del paquete.
          </div>
        </div>

        <footer className="p-6 border-t border-border-subtle space-y-3">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreeChecked}
              onChange={(e) => setAgreeChecked(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-accent"
            />
            <span className="text-sm text-white/80">
              He leído y acepto el aviso de privacidad, el uso de datos y el
              disclaimer de Riot Games.
            </span>
          </label>
          <button
            onClick={() => {
              // Write timestamp + version atomically so a partial save
              // can't leave us in a "accepted but version unknown" state.
              setPref("termsAcceptedAt", Date.now());
              setPref("termsAcceptedVersion", TERMS_VERSION);
            }}
            disabled={!agreeChecked}
            className="w-full px-4 py-2.5 bg-accent text-black font-medium rounded hover:bg-accent-deep transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isReAcceptance ? "Acepto los cambios" : "Acepto y empezar"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-white font-semibold mb-1.5">
        <Icon className="w-4 h-4 text-accent" />
        {title}
      </h3>
      {children}
    </section>
  );
}
