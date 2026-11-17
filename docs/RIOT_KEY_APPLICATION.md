# Pedir la Production API Key a Riot

Revisado 2026-11-02 contra https://developer.riotgames.com/policies/general
(actualizada 29/05/2025) y https://developer.riotgames.com/docs/portal.
**Puesto al día 2026-11-17** (portal releído ese día; ver `docs/PLAN_CONSEJO.md`):
la app está en una clave personal y se puede descargar de GitHub, que es
público → pedirla cuanto antes.

## Qué clave hace falta

- **Development key**: caduca cada 24 h. Riot: no se puede mantener una app
  pública con ella.
- **Personal key**: solo para el desarrollador o "a small private community".
  Riot: no se puede usar "for public consumption", y eso incluye betas
  abiertas. **No vale para Draftboard**, que se descarga de GitHub.
- **Production key**: la que toca. Riot pide un prototipo que funcione, enseñar
  cómo se usa la app y un enlace a una web, prototipo o capturas. Avisa de que
  si la web no está completa es poco probable que la aprueben.

El formulario está en https://developer.riotgames.com/app-type (hay que entrar
con la cuenta de Riot): **Register Product → Production**.

## Lo que ya cumplimos

- Aviso legal de Riot visible: pantalla de términos al abrir (TermsGate) y pie
  de página ("Not endorsed by Riot Games…").
- La clave no va dentro del programa: la guarda el worker de Cloudflare como
  secreto y la app nunca la ve.
- El worker ya no es un relé abierto: solo reenvía las lecturas que hace la app
  (ids con formato fijo, parámetros limpios, 300 peticiones/min por IP; la app
  se limita sola a 95 cada 2 min por región).
- La IA compartida (Groq) también pasa por el worker y solo acepta lo que usa
  la app (una conversación, tamaño y respuesta limitados, 15/min por IP).
- Ya no se usa dpm.lol (sus normas prohíben el acceso automático).
- Gratis, código abierto (MIT), sin anuncios ni pagos.
- No se identifica a rivales ocultos en la selección de campeones: el
  explorador de rivales espera a la pantalla de carga, donde los nombres ya son
  visibles, y los busca con Spectator-V5.
- No hay calculadora de MMR/ELO, ni cronómetros de habilidades rivales.

## Puntos que Riot puede preguntar (responder con calma y sin esconder nada)

1. **Escritura en el cliente (LCU)**: al fijar campeón la app crea su página de
   runas, pone hechizos de invocador y un set de objetos. Viene activado y se
   puede apagar (o "modo seguro"). Lo mismo que hacen Blitz, Porofessor o
   Mobalytics.
2. **Coach en partida y overlay**: usa la Live Client Data API (la oficial del
   juego en `localhost:2999`) y da consejos de voz. Solo usa datos que el
   jugador ya ve en su pantalla.
3. **IA**: el resumen de la partida (datos del propio jugador) se manda a Groq
   para que redacte el consejo. Nada se vende ni se pasa a terceros para otro
   uso. Las políticas leídas no dicen nada de IA.
4. **Web**: ahora solo hay GitHub. Riot avisa de que con una web incompleta es
   poco probable que la aprueben: mejor hacer **antes** una página sencilla
   (GitHub Pages) con capturas y botón de descarga.
5. **Datos de otras webs** (Riot prefiere fuentes oficiales; cada web tiene sus
   condiciones): tier list y builds de op.gg (su servicio público MCP), partidas
   pro de u.gg, builds pro de lolvvv, datos de esports de GRID (solo uso no
   comercial) y Leaguepedia. Decirlo claro en el formulario; si Riot pone pegas
   a alguna, quitarla (plan B en `docs/PLAN_CONSEJO.md`).

## Respuestas para el formulario (en inglés, Riot revisa en inglés)

### Product name
```
Draftboard
```

### Product URL
```
https://github.com/Rafaellopezdelrio/draftboard
```
(Downloads: https://github.com/Rafaellopezdelrio/draftboard/releases)

### Product description
```
Draftboard is a free, open-source (MIT) Windows desktop app for League of
Legends players, built with Tauri (Rust) + React. It helps players draft
better and learn from their own games. No ads, no paid tier.

Features:
- Champion select advisor: reads the player's own champ-select session from
  the League Client API and suggests picks/bans from their champion pool,
  champion mastery, matchups and team composition (engage, frontline, damage
  split).
- Teammate scout: rank, mastery and recent form of the player's own
  teammates (who are visible in champ select).
- Enemy scout: starts at the loading screen, when enemy players are already
  visible to everyone, using Spectator-V5. It never identifies players hidden
  by anonymized champ select.
- Optional client actions (can be turned off): after the player locks a
  champion, Draftboard creates a rune page, sets summoner spells and adds an
  item set through the League Client API, like other community tools.
- In-game coach: an optional overlay and voice tips built only on the official
  Live Client Data API (information already on the player's screen). No enemy
  cooldown or ultimate tracking, no memory reading, no automation of gameplay.
- Post-game review: laning and game summary from the player's own matches
  (Match-V5 + timeline), with an AI-written improvement plan. The AI only
  explains numbers computed from the player's own match; it is told never to
  invent facts.
- Personal trends: the player's own stats over time compared with their rank.
- Tier lists by rank and matchup win rates, from public community sources
  (listed below), with our own grading on top (an S must win at least 51 %).
- Optional "best players" download: aggregates recent Master+ ranked games
  (League-V4 + Match-V5) into champion, build and rune stats stored locally.
  It runs only when the user starts it and stays within the app's own cap of
  95 requests per 2 minutes per region.

Riot's legal boilerplate is shown on first launch and in the app footer.
```

### APIs used and how
```
All calls go through our Cloudflare Worker, which holds the key as a secret
(never shipped in the app binary). The worker only forwards the specific reads
the app makes (fixed path shapes, typed ids, sanitized query) and rate-limits
each IP to 300 requests/min; the app itself stays under 95 requests per
2 minutes per region. Responses are edge-cached (30 s for live data up to
24 h for finished matches) to keep load on Riot low.

- Account-V1 by-riot-id: resolve the player's Riot ID.
- Summoner-V4: summoner profile.
- League-V4: rank of the player and teammates; Master+ ladder for the
  optional "best players" stats.
- Champion-Mastery-V4 (top): weight suggestions by real mastery.
- Match-V5 ids, match and timeline: post-game review, history and the optional
  Master+ aggregation.
- Spectator-V5 active-games by-summoner: own live game, from loading screen on.

Local, on the player's PC: League Client API (champ select, optional rune /
spell / item-set import) and the Live Client Data API (in-game overlay).
Static data: Data Dragon and CommunityDragon.
```

### Third-party data (not Riot)
```
- op.gg public MCP API: lane tier lists (overall and per rank) and builds.
- u.gg: recent pro matches for a champion/role (pro builds).
- lolvvv.com: pro builds.
- GRID: esports data, non-commercial use only.
- Leaguepedia (lol.fandom.com API): pro-play picks/bans and patch notes.
- Groq: writes the AI advice from a summary of the user's own match; called
  through our worker, which only allows the app's chat request.
If any of these is a problem for Riot, we will remove it.
```

### Data storage
```
Player data is stored locally on the user's PC (SQLite). The worker keeps a
short edge cache (max 24 h). Users can opt in (unticked by default) to
anonymous error reports and a daily usage counter (random install id, no Riot
ID, no IP stored); suggestions they type are stored too. For the AI review, a
summary of the user's own match is sent to Groq to write the advice; it is not
sold or shared for any other purpose.
```

### Monetization
```
None. Free and open source.
```

### User flow (Riot pide ver cómo se usa)
```
1. Install from GitHub Releases and accept the terms screen (includes Riot's
   boilerplate).
2. Open the League Client: Draftboard links to the logged-in account through
   the local League Client API.
3. Queue up. In champ select the advisor shows suggestions and the teammate
   scout; on lock-in the optional rune/spell/item-set import runs.
4. Loading screen / in game: enemy scout and optional overlay coach.
5. After the game: post-game review and improvement plan.
```
Adjuntar capturas de `docs/screenshots/`.

## Después de obtenerla

1. Subirla al worker como secreto (nunca al repo):
   ```bash
   npx wrangler secret put RIOT_API_KEY
   ```
2. Subir el límite por IP del worker si hace falta (ahora 300/min) y el tope
   propio de la app (95 cada 2 min por región).
3. Si la clave se filtra: regenerarla en el portal y volver a subirla.
