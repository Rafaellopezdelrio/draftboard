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

---

## Sesión 2026-06-06 — nuevo a validar live

Código pusheado este turno, sin probar en partida/juego real:

### En champ select (Normal Draft)
- [ ] **Win conditions role-tied** — el panel "Game plan" muestra 1 bullet específico de tu rol (ADC posición / jungla tempo / support visión / mid roam / top TP) acorde a la comp.
- [ ] **Anti-heal builds** — con enemigo healer (Soraka/Aatrox/Vlad/Mundo/Warwick...) BuildPanel sugiere Grievous Wounds del tipo correcto (Mortal Reminder/Morello/Thornmail).
- [ ] **Ban scout** — bans sugeridos incluyen el main cómodo del rival (vía mastery).

### Idioma EN (bug "sigue español")
- [ ] Cambiar a **English** en Ajustes → recargar (Ctrl+R) → verificar EN en: header/nav, board (Your team/Enemies/Reset draft), Top picks, Trade suggestion, Suggested bans, Composition, Enemy scout, **Game plan advice** (win conditions ahora bilingüe).
- [ ] Confirmar que NO crashea y no quedan placeholders crudos (`winConditions.rules.x`).

### Post-game (Trends)
- [ ] **Evolución** — con ≥10 partidas, el panel "Evolución" muestra subida/bajón por métrica (winrate/KDA/CS/muertes/visión) y el AI trends coach menciona la tendencia.

### Validación in-game (Practice Tool)
- [ ] **Overlay** (si activas `showInGameOverlay`) — topmost sobre el cliente, no roba foco, posición ok.
- [ ] **Live coach** — insights (muertes/lane/objetivos/HP) salen en partida real vía Live Client (localhost:2999).

Test válido = `npm run tauri dev` (no .exe viejo) + cola real. Pedir a Claude re-armar Monitor de `draftboard.log`.
