# Pedir la Production API Key a Riot

Revisado 2026-11-02 contra https://developer.riotgames.com/policies/general
(actualizada 29/05/2025) y https://developer.riotgames.com/docs/portal.

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
  (ids con formato fijo, parámetros limpios, 120 peticiones/min por IP).
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
4. **Web**: ahora solo hay GitHub. Si la rechazan por eso, hacer una página
   sencilla (GitHub Pages) con capturas y botón de descarga y volver a pedirla.

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
  (Match-V5 + timeline), with an AI-written improvement plan.
- Tier lists and matchup win rates from public community sources.

Riot's legal boilerplate is shown on first launch and in the app footer.
```

### APIs used and how
```
All calls go through our Cloudflare Worker, which holds the key as a secret
(never shipped in the app binary). The worker only forwards the specific reads
the app makes (fixed path shapes, typed ids, sanitized query) and rate-limits
each IP to 120 requests/min. Responses are edge-cached (30 s for live data up
to 24 h for finished matches) to keep load on Riot low.

- Account-V1 by-riot-id: resolve the player's Riot ID.
- Summoner-V4: summoner profile.
- League-V4: rank of the player and teammates; Master+ ladder for benchmarks.
- Champion-Mastery-V4 (top): weight suggestions by real mastery.
- Match-V5 ids, match and timeline: post-game review and history.
- Spectator-V5 active-games by-summoner: own live game, from loading screen on.
```

### Data storage
```
Player data is stored locally on the user's PC (SQLite). The worker only keeps
a short edge cache (max 24 h) and stores nothing else. For the AI review, a
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
2. Subir el límite por IP del worker si hace falta (ahora 120/min).
3. Si la clave se filtra: regenerarla en el portal y volver a subirla.
