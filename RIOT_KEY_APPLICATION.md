# Solicitar una Personal / Production API Key a Riot

Las dev keys caducan cada 24h. Para producción necesitas una **Personal API Key**
(revisión 1-2 semanas, sin caducidad) o una **Production API Key** (apps con
tráfico alto, revisión más estricta).

Esta guía cubre la **Personal API Key** — suficiente para Draftboard hasta tener
miles de usuarios.

## Antes de empezar

Tu app debe cumplir el [Riot Developer Portal Policies](https://developer.riotgames.com/policies/general):
- Solo usar APIs oficiales (✅ Draftboard usa LCU + Riot API + Data Dragon + Leaguepedia)
- No automatizar acciones del juego (✅ Draftboard solo lee + sugiere)
- No mostrar datos de jugadores sin consentimiento (✅ datos locales)
- No vender/monetizar abusivamente (✅ Draftboard es free/open)
- No reemplazar funcionalidad oficial de Riot

## Pasos

### 1. Login en developer.riotgames.com

Usa tu cuenta Riot (la misma que el juego).

### 2. Apply for Personal API Key

Ve a → https://developer.riotgames.com/app-type → **"Personal API Key"**.

### 3. Rellena el formulario

Riot pide:

#### Product Name
```
Draftboard
```

#### Product URL
URL pública del proyecto (GitHub repo, landing page, o el sitio de descarga).
```
https://github.com/<tu-usuario>/draftboard
```

#### Product Description
```
Draftboard es una aplicación de escritorio (Tauri/Rust + React) que ayuda a
jugadores de League of Legends a tomar mejores decisiones durante el champ
select y a mejorar entre partidas mediante coaching post-game con IA.

Funcionalidades principales:
- Sugerencias de pick/ban basadas en composición, counters, sinergia,
  meta global y maestría del jugador.
- Análisis post-game con LLM (Groq/Anthropic/Gemini) que genera planes
  de mejora personalizados.
- Tier list pro (LCK/LEC/LCS/LPL) y tier list SoloQ Master+.
- Vista de partida en directo (Spectator V5) para revisar al equipo
  y enemigos antes de la partida.
- Lookup de jugadores por Riot ID.
- 100% datos locales (SQLite). Privacy-first.

La app es gratuita, open source, y respeta el ToS de Riot:
- Solo usa APIs oficiales (Match-V5, Summoner-V4, League-V4, Spectator-V5,
  Champion-Mastery-V4, LCU local).
- No automatiza acciones del juego.
- No lee memoria del proceso del cliente.
- No muestra info que dé ventaja in-game prohibida.
- Solo procesa datos del propio usuario o jugadores explícitamente buscados.
```

#### How will you use the API?
```
- Match-V5 (matches y timeline) para análisis post-game e historial.
- Summoner-V4 + Account-V1 para resolver Riot IDs.
- League-V4 para mostrar rank del usuario y agregar tier list de Master+.
- Champion-Mastery-V4 para ponderar sugerencias por maestría real.
- Spectator-V5 para vista de partida en directo.

Todas las llamadas pasan por un Cloudflare Worker proxy que cachea respuestas
en edge (reduce carga en Riot ~80% gracias a caché compartido).

Volumen estimado:
- ~50-200 requests por sesión activa de usuario.
- Caché edge sirve ~80% sin pegar a Riot.
- Hasta 1000 usuarios concurrentes con personal key (95 req / 2 min).
```

#### Where will the data be stored?
```
- Localmente en cada cliente: SQLite embebido en la app.
- Cloudflare Worker: caché temporal en memoria edge (TTL ≤ 24h, sin persistencia).
- No hay backend con base de datos. Datos del usuario nunca salen de su máquina.
```

#### Will end users be required to authenticate?
```
No. Los usuarios usan la app con su Riot ID público. Para datos privados
(historial, masteries) la app usa el LCU API local del cliente de LoL — solo
funciona para el usuario logueado en ese cliente.
```

### 4. Acepta los policies y submit

### 5. Espera

Riot responde por email en 1-2 semanas (a veces antes). A veces piden
clarificaciones — responde rápido y profesional.

## Después de obtener la key

1. Pégala en tu Cloudflare Worker como secret:
   ```bash
   wrangler secret put RIOT_API_KEY
   ```
2. La key NO caduca. Si rota o se compromete, regenera y vuelve a subir el secret.
3. Actualiza el endpoint del proxy en la app si cambia la URL.

## Si te rechazan

Riot suele rechazar por:
- App no resuelta (dominio no público, app no descargable)
- Funciones que viola ToS (auto-aim, scripts, enemy intel in-game)
- Descripción demasiado vaga
- Caso de uso ya cubierto por op.gg/blitz/mobalytics y nada nuevo aporta

Re-aplica con:
- URL de descarga real del binario
- Capturas de pantalla de la app
- Enfatiza el diferencial: AI coaching local, lesson plans, multi-region pro meta

## Production API Key (cuando crezca)

Si Draftboard supera ~1000 usuarios concurrentes o necesita rate limits altos:

→ https://developer.riotgames.com/app-type → **Production API Key**

Riot pide más detalle (modelo de negocio, métricas, equipo) y revisa más a
fondo. Puede tardar 4-8 semanas.
