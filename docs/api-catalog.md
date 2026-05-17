# API Catalog for Draftboard

Inventario exhaustivo de APIs externas relevantes para Draftboard. Sirve como
referencia rápida cuando hay que añadir una nueva integración: cada entrada
indica acceso, dificultad y valor concreto, y marca con ✅ lo que ya usamos.

> Mantén este archivo actualizado cuando integres o descartes una fuente.
> El campo "Estado" debería pasar a `EN USO` cuando entre en producción.

---

## 1. Datos de campeones y meta

| API | Acceso | Dificultad | Estado | Valor para Draftboard |
|-----|--------|------------|--------|------------------------|
| **op.gg MCP** | Libre via `mcp-api.op.gg` | Baja | ✅ EN USO | Tier list, builds, runas, counters. Base actual. |
| **dpm.lol** | Libre via `/v1/tierlist` | Baja | ✅ EN USO | Tier list por rango específico (Iron → Challenger). Base actual. |
| u.gg | Scraping (Cloudflare Turnstile) | Alta | Descartado | Builds + matchups; muy completo pero protegido por bot challenge. |
| lolalytics | Scraping + endpoints internos | Media | Candidato | Stats por **matchup específico** (Aatrox vs Camille). Endpoint JSON sin auth: `axe1.lolalytics.com/mega/`. |
| mobalytics.gg | API privada | Alta | Descartado | Requiere login. |
| blitz.gg | API JSON pública | Media | Candidato | GraphQL público: `https://league-champion-aggregate.iesdev.com/graphql`. |
| **CommunityDragon** | Libre y rápido | Baja | Parcial | Datos en bruto del cliente (stats, abilities, items con tooltips). Útil para tooltips precisos. |

## 2. Pro play y esports

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| **Leaguepedia Cargo** | Libre, ratelimit suave | Media | ✅ EN USO | Partidas LCK/LEC/LCS/LPL para pro sync. |
| Oracle's Elixir | CSV descarga | Baja | Candidato | Dataset histórico completo. Útil para gráficas estadísticas. |
| Bayes API | Comercial | N/A | Descartado | Cuesta dinero. |
| lolesports.com | Endpoints internos GraphQL | Media | Candidato | Schedule, standings, próximos partidos. Para sección "Pro hoy". |
| PandaScore | Free tier limitado (100 req/h) | Baja | Candidato | Esports stats agregados, calendario, odds. |

## 3. Scouting y match history

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| **Riot Match-V5** | Con API key | Baja | ✅ EN USO | Histórico personal y enemy scout. |
| porofessor.gg | Scraping | Alta | Descartado | Live game con notas pro; protegido. |
| deeplol.gg | Scraping | Alta | Descartado | Similar a porofessor. |
| lolprofile.net | Scraping | Media | Candidato | Profile cards. |
| Tracker.gg | Free API con key | Baja | Alternativa | Stats agregados; alternativo a Riot directo. |

## 4. Datos en directo (in-game)

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| **Riot Live Client Data** | Libre `localhost:2999` | Baja | **PRIORIDAD ALTA** | Mientras juegas: HUD events, scores, gold, items. Permite overlay tipo Blitz con timers y eventos. **Máximo valor pendiente**. |
| **LCU WebSocket** | Libre localhost | Media | ✅ EN USO | Eventos del cliente fuera del juego (champ select, lobby). |

## 5. AI y LLM

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| **Anthropic Claude** | API key | Baja | ✅ EN USO | Coach inteligente, máxima calidad. |
| **Groq** | API key | Baja | ✅ EN USO | LLM rápido (~300 tok/s) para coach realtime. |
| **Google Gemini** | API key gratis generosa | Baja | ✅ EN USO | Backup gratuito. |
| OpenAI | API key | Baja | Redundante | No usamos, los tres anteriores cubren. |
| Cerebras | Free tier nuevo | Baja | Candidato | LLM aún más rápido que Groq, Llama 3.3 70B free. |
| OpenRouter | API key | Baja | Candidato | Aggregator multi-modelo (cambiar provider sin recablear). |

## 6. Voz (TTS / STT)

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| ElevenLabs | Free tier 10k chars | Baja | Candidato | TTS premium para coach hablado. |
| OpenAI Whisper | API key | Baja | Candidato | STT para hablarle al coach con voz. |
| Web Speech API | Browser nativo | Baja | Disponible | Gratis, ya en el WebView. Calidad regular. |
| AssemblyAI | Free tier | Baja | Alternativa | STT alternativo a Whisper. |

## 7. Notificaciones y comunicación

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| Discord webhooks | Libre (URL) | Baja | Candidato | Publicar tu partida/stats al Discord del usuario. |
| **Sentry** | API key | Baja | ✅ EN USO | Error tracking. |
| PostHog | Free tier | Baja | Candidato | Analytics de uso (qué features se utilizan). |

## 8. Wikis y datos extra

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| **Data Dragon** | Libre CDN | Baja | ✅ EN USO | Iconos, sprites, datos base. |
| MerakiAnalytics | Libre via GitHub raw | Baja | Candidato | Champion JSON más detallado que DDragon (scaling rates, ratios). |
| Champion.gg | Scraping legacy | Media | Descartado | Datos antiguos, poco fiable. |

## 9. Métricas de servidores LoL

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| Riot Status | Libre vía Riot API | Baja | ✅ DISPONIBLE | Estado de los servidores. |
| DownDetector | Scraping | Media | Descartado | Para reportes de lag de usuarios. |

## 10. Mercado y skins

| API | Acceso | Dificultad | Estado | Valor |
|-----|--------|------------|--------|-------|
| MerakiSkin | Libre | Baja | Candidato | Skins con prices, rarezas, release dates. |
| Leaguepedia Skins | Libre | Baja | Candidato | Tablas de skins por champion. |

---

## Roadmap priorizado

Las 5 que más impacto añadirían a Draftboard ahora mismo:

1. **Riot Live Client Data (`localhost:2999`)** — overlay durante la partida con
   timers de objetivos, builds vs enemigos en vivo, coaching contextual.
   **Muy alto impacto**.
2. **Cerebras / OpenRouter** — LLM aún más rápido o failover automático.
3. **lolalytics axe1 endpoint** — datos por matchup específico ("Aatrox vs
   Camille" en lugar de "Aatrox top general").
4. **PandaScore esports** — sección "Pro hoy" con qué se juega + qué picks
   aparecen.
5. **MerakiAnalytics** — tooltips precisos de habilidades en hover.

## Cómo añadir una nueva fuente

1. Si requiere clave secreta, súbela como secret al CF worker
   (`wrangler secret put NOMBRE`) — nunca al binario.
2. Si es scraping con bot challenge (Turnstile, etc.) descártala antes de
   invertir tiempo. Solo nos sirve algo programable.
3. Toda llamada externa va por nuestro proxy `draftboard-riot-proxy.workers.dev`
   con edge cache y rate limit.
4. Actualiza este archivo cuando integres o descartes.
