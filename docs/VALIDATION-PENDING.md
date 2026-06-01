# ⏳ VALIDACIÓN LIVE PENDIENTE

> Recordatorio: **jugar 1 Normal Draft Pick** para validar el trabajo de esta sesión.
> Customs vs bots NO sirven (ver abajo).

## Qué falta confirmar live (código pusheado, sin validar en partida real)
- [ ] **Counter-pick** — sugerencias reordenan al picar enemigos
- [ ] **"Contra tu línea"** — callout con tu WR% vs el rival de tu carril (feature nueva, build panel)
- [ ] **Win-prob** — usa op.gg liveCounters (no clavado en 50%, se mueve con matchups). *Parcial: vi 50→55% en custom, pero por meta/archetype, no counter.*
- [ ] **Coach resist** — post-game, insight "enemigo X% mágico → prioriza MR" (checkBuildVsEnemy revivido)
- [ ] **Debounce conexión** — banner no flapea con blips

## Por qué customs NO validan (diagnosticado en log 2026-06-01)
`[lcuSync] my cell 0 has no champ in myTeam OR actions` se repite todo el champ select.
Custom vs bots = champ-select no-estándar (`actions` vacío + `championId=0` en myTeam, sin `assignedPosition`).
→ lcuSync no resuelve TU campeón ni rol → build/Contra-tu-línea/counter **OFF** (todos los gated por tu champ+rol).
Board + sugerencias + win-prob SÍ salen (usan listas de equipo).

El path counter está **probado vía worker** (`npm run verify:data` → Lee Sin 56 matchups, spread 15.6pp). No está roto — el custom no le da inputs.

## Test válido
1. Correr código nuevo: `npm run tauri dev` (NO un .exe viejo).
2. Cola **Normal Draft Pick** (champ select real: actions + assignedPosition).
3. Pedir a Claude re-armar el Monitor de `draftboard.log`.

## Gap opcional (aparte)
Soporte de custom champ-select: lcuSync podría leer el champ local aunque `actions` esté vacío. Necesita log del `championId` real para ver por qué =0. Baja prioridad (customs = edge case).
