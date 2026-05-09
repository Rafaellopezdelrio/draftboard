# Riot Sign-On (RSO) — Future Roadmap

**Status:** Not implemented. LCU-first approach covers 90% of features without it.

## What RSO Provides

OAuth flow where users click "Login with Riot" and authorize our app to access
their Riot data — same flow that the official League Client uses.

Once authorized, we'd get:
- An OAuth access token tied to that user
- Ability to call Riot API on their behalf without a manual API key
- No 24h expiry (tokens refresh)

## Why Not Now

- **Approval required**: register as Riot developer + submit production app
- **Approval is slow**: weeks to months, often rejected for non-commercial apps
- **Requires HTTPS callback**: needs a public domain for the OAuth redirect URI
- **Extra infrastructure**: token refresh, secure storage, server-side secret

## Current Workaround (Implemented)

LCU API exposes most of what we need without any auth:
- `lol-summoner` → current account
- `lol-match-history` → my matches
- `lol-champion-mastery` → my masteries
- `lol-ranked` → my rank
- `lol-perks` → my runes (read + write)

Riot API personal key (24h dev key) only required for:
- Scouting other players (their match history, masteries, rank)
- Master+ league aggregation for global meta

## Migration Path When RSO Becomes Viable

1. Apply for production app status with Riot
2. Set up minimal OAuth callback server (Cloudflare Worker, Vercel function)
3. Add "Login with Riot" button in onboarding (alongside current LCU/manual flow)
4. Store refresh token in SQLite, auto-refresh access tokens
5. Use access token for all Riot API calls — no more 24h expiry
6. Keep LCU as offline fallback when client open

## Decision: ship LCU-first now, monitor RSO availability for v2.
