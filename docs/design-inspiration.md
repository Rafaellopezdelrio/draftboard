# Design inspiration (general, not only LoL apps)

Collected 2026-11-12 while planning the new advanced view. Sources are
mostly agency/vendor blogs: treat as ideas, not proof.

## 1. Three levels of detail (Whoop)
Whoop shows a lot of data but feels simple: big glanceable scores first,
then trend views, then deep graphs. Moving between levels uses a short
animation so you know where you are.
- For Draftboard: simple view = the score + one sentence; tap a card ->
  it grows into the detail (trends, numbers) in place, instead of jumping
  to a different "full" screen. Keeps the user oriented.
- Their redesign got complaints when the home showed too much at once:
  keep the first level small.

## 2. Show the minimum to decide the next step (Linear, Notion)
Progressive disclosure: show only what is needed for the next decision;
advanced controls behind one clearly labelled button.
- For Draftboard: each screen answers one question (what to ban, what to
  pick, what to buy). Extra data lives under a "why?" / "more" per card,
  not on a separate page.

## 3. Bento grid
Cards of different sizes in one grid: the most important block is the
biggest. Collapses to one column on small windows.
- For Draftboard advanced view: one big card (pick advice), medium cards
  (build, matchup), small cards (spells, skill order, team gap). Fits the
  "intuitive advanced view" the owner asked for better than tabs.

## 4. Coaching loop and habit (Whoop, Duolingo)
- Whoop turns raw data into a daily instruction ("today do X").
- Duolingo: immediate feedback, small steady progress rewarded more than
  perfection; streak redesign that forgave missed days raised 7+ day
  streaks a lot (third-party figure, unverified). Critics: streaks alone
  push shallow use.
- For Draftboard: home shows "your one goal for the next games" (e.g.
  fewer deaths) and marks each game that met it; a gentle streak of
  "games that met the goal", no punishment for breaking it.

## Sources
- https://www.925studios.co/blog/whoop-design-breakdown
- https://the5krunner.com/2023/03/28/new-whoop-home-screen-looks-pretty-but-is-it-as-intuitive/
- https://925studios.co/blog/saas-dashboard-design-examples-2026
- https://ixdf.org/literature/topics/progressive-disclosure
- https://www.saasframe.io/blog/designing-bento-grids-that-actually-work-a-2026-practical-guide
- https://designfolio.substack.com/p/crazy-ux-redesign-duolingo
- https://jiwonvyoo.github.io/portfolio/case/duolingo/duo.html
