# Draftboard

Pro-level draft advisor and AI coach for League of Legends.

A free, privacy-first desktop application that helps players from Iron to
Challenger climb solo queue. Provides champion-select suggestions, post-game
AI coaching, tier lists, live-game inspection, and 7-day improvement plans.

All player data stays local (SQLite). All Riot API calls are routed through
a Cloudflare Worker proxy with edge caching — no per-user API key required.

## Features

- **Champion Select Advisor** — Live LCU integration. Suggestions based on
  counters, team comp synergy, current meta, your mastery, and personal
  winrate. Each pick shows why it's recommended.
- **AI Coach (post-game)** — Pro-level analysis calibrated to your elo.
  Iron-Bronze: fundamentals. Master+/Challenger: wave manipulation, objective
  trades, side selection. Powered by Groq (free), Anthropic, or Gemini.
- **Tier List** — Aggregated from Master+ ranked solo queue (Riot Match-V5)
  and pro play (Leaguepedia). Op.gg-style composite tier using Wilson lower
  bound + pick/ban presence.
- **Builds & Runes** — Most-purchased final items, rune pages, and skill
  orders per (champion, role, patch).
- **Live Game** — Spectator-V5 integration: see rank, mastery, recent form
  of teammates and enemies before the game starts.
- **Summoner Lookup** — Search any Riot ID, see masteries and recent
  matches.
- **Trends & Lesson Plans** — Track your last 20-50 matches and let the AI
  generate a personalised 7-day practice plan based on detected weaknesses.
- **Voice Coach** (optional) — Web Speech TTS announces bans, threats,
  power spikes during champion select.

## Architecture

| Layer | Stack |
|---|---|
| Desktop shell | Tauri 2 (Rust + WebView) |
| Frontend | React 19 + TypeScript + Vite 7 + Tailwind 4 |
| State | Zustand |
| Local DB | SQLite (`tauri-plugin-sql`) with versioned migrations |
| LCU bridge | Rust (`tokio-tungstenite`, WebSocket to local client) |
| AI providers | Groq · Anthropic · Google Gemini (multi-provider) |
| Riot API proxy | Cloudflare Worker (edge cache, secret-injected auth) |

## Privacy

- All match data stays in `%APPDATA%\com.draftboard.app\lol-draft-advisor.db`.
- The proxy is stateless — no backend database, no analytics, no telemetry.
- We only fetch data for the local user or Riot IDs they explicitly search.
- No process memory reads. No client modification. No automated in-game
  actions. Fully compliant with Riot's developer policies.

## Install

Download the latest `Draftboard_<version>_x64-setup.exe` from the
[Releases](https://github.com/Rafaellopezdelrio/draftboard/releases) page.

Windows SmartScreen may warn the binary is unsigned. Click "More info" →
"Run anyway". Code signing is on the roadmap.

## Development

```bash
git clone https://github.com/Rafaellopezdelrio/draftboard.git
cd draftboard
npm install
npm run tauri dev
```

Tests:

```bash
npm test               # 100+ unit/integration tests
npm run test:watch
npm run typecheck
```

Build production installer:

```bash
npm run tauri build
# Output: src-tauri/target/release/bundle/nsis/Draftboard_*_x64-setup.exe
```

## License

MIT
