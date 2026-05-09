# LoL Draft Advisor — Design Document

**Date:** 2026-05-09
**Status:** Approved, pending implementation plan

## Purpose

Desktop application similar to Itero.gg that provides real-time advice during the League of Legends champion select phase. Detects the draft state automatically via the LCU API, recommends picks based on counters, synergies, and team composition, and tracks the user's personal performance via the Riot API.

## Goals

- Zero-config startup: open the app and it works
- Real-time pick suggestions during champion select
- Personalized recommendations based on the user's actual performance
- Local-first: works offline after the first data fetch
- Lightweight: minimal RAM and disk footprint

## Non-Goals

- Multi-user / cloud accounts
- Mobile or web version
- Coaching VOD analysis or post-game review beyond stats

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   TAURI SHELL (Rust)                │
│                                                     │
│  ┌─────────────────┐    ┌────────────────────────┐  │
│  │  LCU Connector  │    │    System Tray / OS    │  │
│  │  (WebSocket)    │    │    Notifications       │  │
│  └────────┬────────┘    └────────────────────────┘  │
│           │ pick events                             │
│  ┌────────▼────────────────────────────────────┐    │
│  │           REACT FRONTEND (TypeScript)        │    │
│  │                                             │    │
│  │  Draft Board │ Suggestion Engine │ Comp     │    │
│  │  History     │ Stats             │ Cache    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
         ▲                        ▲
    LCU API                  Data Dragon / MurderBridge
    (localhost)              CDragon / Riot API
```

### Stack

- **Tauri 2** — desktop shell (Rust)
- **React 18 + TypeScript** — frontend
- **TailwindCSS** — styling, dark theme
- **Zustand** — global draft state
- **TanStack Query** — API fetching and cache
- **SQLite** via `tauri-plugin-sql` — local match history

## Components

### Backend (Rust / Tauri)

- **LCU Connector** — connects to the local League client via WebSocket, emits events when picks/bans/phase changes occur
- **System integration** — tray icon, window positioning, optional overlay mode

### Frontend (React)

- **DraftBoard** — visual representation of allied/enemy picks and bans, supports manual mode
- **SuggestionPanel** — top picks ranked by composite score, with reason tags
- **CompAnalysis** — detects missing archetypes (engage, peel, frontline, etc.) for both teams
- **HistoryView** — list of past drafts with W/L, links to match details
- **StatsView** — personal winrate per champion/role, suggestion follow rate, LP graph

### Suggestion Engine

Composite score per candidate champion:

| Factor | Weight |
|--------|--------|
| Counter score vs enemy picks (MurderBridge) | 40% |
| Synergy with allied picks | 30% |
| Meta tier | 20% |
| Fills missing archetype | 10% |

When personal Riot data is available, blends personal winrate (last 20 games) into the score.

## Data Sources

- **Data Dragon** — champion names, icons, roles. Cached per patch.
- **MurderBridge** — champion-vs-champion winrate by role.
- **CDragon** — high-resolution role icons.
- **Riot API** — user's match history, mastery, rank, per-champion personal stats.

All data cached locally; app works offline after first fetch.

## Data Flow

1. On startup: download/refresh champion data from Data Dragon + MurderBridge if patch changed
2. LCU WebSocket detects champion select → pushes state to React via Tauri events
3. Each pick/ban updates Zustand store
4. Suggestion Engine recomputes top 5 picks reactively
5. On match end: Riot API fetches result, persists to SQLite
6. StatsView aggregates from SQLite on demand

## UX Principles

- Zero-config startup
- Silent auto-detection (LCU); manual mode visible immediately if client closed
- Top 3 suggestions large, with icon + name + 1-line reason
- Tooltips for detail (winrates, full counter list)
- Click-to-pick in manual mode
- Semantic colors: green (good), yellow (decent), red (avoid)
- Window docks beside LoL client without overlapping critical UI

## File Structure

```
lol-draft-advisor/
├── src-tauri/
│   ├── main.rs
│   └── lcu.rs
├── src/
│   ├── components/
│   │   ├── DraftBoard.tsx
│   │   ├── SuggestionPanel.tsx
│   │   ├── CompAnalysis.tsx
│   │   ├── HistoryView.tsx
│   │   └── StatsView.tsx
│   ├── engine/
│   │   ├── suggestionEngine.ts
│   │   └── compAnalyzer.ts
│   ├── services/
│   │   ├── lcuService.ts
│   │   ├── dataDragon.ts
│   │   ├── murderBridge.ts
│   │   └── riotApi.ts
│   ├── db/
│   │   └── schema.sql
│   └── App.tsx
└── package.json
```

## Error Handling

- LCU unreachable → fall back to manual mode silently, show banner
- MurderBridge / Data Dragon unreachable → use cached data, show stale-data warning
- Riot API rate limit hit → backoff with exponential retry, show "stats updating" indicator
- Riot API key expired → prompt user to renew, app continues working without personal stats

## Testing Strategy

- Unit tests for `suggestionEngine` and `compAnalyzer` (pure functions, easy to test)
- Mock LCU events for integration tests of draft flow
- Snapshot tests for key UI components
- Manual end-to-end testing against real LoL client during a custom game

## Open Questions / Future Work

- Overlay mode on top of the LoL client (Tauri 2 supports transparent always-on-top windows)
- Pro-play data integration (e.g. Leaguepedia) for high-elo recommendations
- Voice notifications during the timer
