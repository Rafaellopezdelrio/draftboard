# iTero (competitor notes)

Looked at on 2026-11-12: the public site (itero.gg) and the desktop app
"The iTero Coach" v3.11.8 (Electron, also on Overwolf), installed on the
owner's PC, free plan. Read-only look: no login, no settings changed.

## Business model
- Free with ads (a big ad panel takes the right third of the window).
- iTero Plus: 7.99 $/month (7-day trial). Paid: no ads, model tuning, AI macro
  coach review of every game, continuous draft analysis, "quick game
  analysis", data on any account.
- Claims 1M+ downloads, 4.4 rating, "fully Riot compliant".

## App sections
- **Perfil**
  - Match history: region + Riot ID search, queue filter (solo, flex,
    clash), role filter, champion filter.
  - Top: games, win rate, last 10 as a coloured bar (win/loss), top 3
    champions of the last 10 with W/L and %.
  - LP graph for solo queue with tier lines.
  - Each game row: result, queue, length, date, both lane champions, items,
    KDA, CS/min, GPM, **draft score (gauge, e.g. 2.4)** and AI Macro Score
    (locked on free).
  - Tabs: account stats (simple / detailed, percentiles vs your elo) and
    champion stats.
- **Entrenador de macro** (macro coach)
  - Score per game-time window: 0-7, 7-14, 14-21, 21-28, 28+ min (gauge each,
    worst one flagged).
  - "Strengths" / "Main areas to improve" tabs; each area (e.g. "team epic
    monster difference", "lane XP difference", "kill participation") has a
    plain explanation, a table of related stats (your average, elo average,
    percentile like "Lowest 11th") and a 50-game moving average chart.
  - Review every 10 games ("next review available: 10 games").
- **Tier List**: General / **Personal** (weights the patch tier by your own
  experience with each champion), pick-rate slider, role filter.
- **Herramientas**
  - Draft tool: simulate a draft (blue/red, random draft, import draft),
    "get recommendations", "model personalisation".
  - **Champion pool builder**: core picks, situational picks, pocket pick, each
    with a "good against" grid of champions.
  - Test (quiz).
- **Ajustes**: general, language, screens, draft, champion pool, **champion
  ban pool + auto-hover ban** (via the LCU, they warn it may break),
  overlays (hold Tab: item gold value per player, damage tracker, monster
  upgrades, summoner spell timer; map timers for jungle camps, epic monsters,
  inhibitors), privacy, Riot accounts.

## Champion select (from their site images)
- Overall score + lane phase score for the hovered pick; mastery, champion
  WR, synergy average, counter average, AD ratio, early strength advantage.
- Recommendations grid with a score per champion.
- Team stats: early / mid / late strength advantage, AD ratio, total damage,
  tankiness (my team vs enemy team).
- Synergy per ally and counter per enemy (score under each portrait).
- Matchup vs lane opponent **level by level**: playstyle (Bully / Neutral /
  Poke / Safe), trading score, kill threat.
- Three builds to choose from.

## Ideas for Draftboard (not built yet)
1. Draft score per game in the history + LP graph + last-10 bar.
2. Coach score per game-time window, each stat vs your league with a plain
   sentence (not "Lowest 11th").
3. Champion pool builder (core / situational / pocket) feeding pick advice.
4. Personal tier list (patch strength x your experience).
5. Ban pool + optional auto-hover ban (same LCU path as our rune apply).
6. Level-by-level lane plan, early/mid/late team strength bars, synergy /
   counter per champion (mockups 5 and 6 in D:\Claude\draftboard-disenos).

## Not copying
- Jungle camp / enemy summoner spell timers: Riot's official Live Client
  data doesn't expose them; iTero gets them through Overwolf. Out of policy
  for us.
- Ads and paywalls: Draftboard stays free with no ads (a clear edge).

## Where Draftboard is already ahead
- Explains the why in plain words; iTero shows bare numbers ("2.4",
  "Lowest 11th").
- One buy list built for the lane opponent and the whole enemy team.
- Voice coach in game.
