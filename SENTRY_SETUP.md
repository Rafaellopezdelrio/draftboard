# Sentry — error tracking para Draftboard

## Por qué

Cuando un tester usa la app y crashea, sin Sentry:
- Tiene que hacer captura del error
- Mandártela por Discord/email
- Tú la lees y tratas de reproducir
- Si no es reproducible → bug perdido

Con Sentry:
- El error se envía automáticamente con stack trace, navegador, OS, versión
- Tú lo ves en dashboard en tiempo real
- Sentry agrupa errores duplicados → si 10 testers tienen el mismo bug, lo ves UNA vez con count=10
- Breadcrumbs muestran qué acciones llevaron al error (clicks, navegación, network)

## Setup (5 minutos, una vez)

### 1. Crear cuenta en Sentry (gratis)

1. Ve a https://sentry.io
2. **Sign up** con GitHub (más rápido)
3. Elige el plan **Developer** (gratis hasta 5000 errores/mes — más que suficiente para testing)

### 2. Crear proyecto

1. En el dashboard → **Create Project**
2. Platform: **React**
3. Alert frequency: "Alert me on every new issue" (recomendado para testing)
4. Project name: `draftboard`
5. Team: el default que te ofrezca

### 3. Copiar DSN

Tras crear el proyecto te muestra una pantalla con código. **Copia solo el DSN**:

```
https://abc123def456@o1234567.ingest.us.sentry.io/9876543
```

### 4. Pegar en la app

Crea un archivo `.env.local` en la raíz del repo (junto a `package.json`):

```env
VITE_SENTRY_DSN=https://abc123def456@o1234567.ingest.us.sentry.io/9876543
```

⚠️ El DSN NO es secreto (es un URL público que solo permite escritura). Pero
es mejor no commitearlo al repo, por higiene.

`.env.local` ya está en `.gitignore` (Vite lo respeta por defecto).

### 5. Build de producción

```powershell
npm run tauri build
```

El .env.local se inyecta en el build. El binario distribuible para testers
**incluye** el DSN hardcoded → cada tester reporta a tu cuenta de Sentry
automáticamente.

## Probarlo en local

1. Crea `.env.local` con tu DSN
2. `npm run tauri dev`
3. Abre devtools (right-click → Inspect)
4. En la consola: `throw new Error("test sentry")`
5. Espera ~5 segundos
6. Ve a Sentry dashboard → Issues → deberías ver el error nuevo

## Lo que captura (privacy-safe)

✅ **Captura**:
- Stack traces de errores
- Versión de la app (release tag `draftboard@0.2.0`)
- User agent / SO
- Breadcrumbs de últimos 100 events (clicks, console, network)

❌ **NO captura** (sanitizado en `beforeSend`):
- Riot API keys (RGAPI-* se reemplaza con RGAPI-***)
- Tu username de Windows (paths sanitizados)
- Tu Riot ID name
- PUUIDs (hasheados a anon-XXXX)

## Lo que NO está activado (por coste / privacy)

- **Session replay**: video del usuario interactuando con la app. Cuesta cuota.
- **Performance tracing**: cada request medido. Cuesta cuota.

Si más adelante quieres activar uno, edita `src/services/sentry.ts`:

```typescript
tracesSampleRate: 0.1,           // 10% de transacciones traceadas
replaysOnErrorSampleRate: 1.0,   // 100% de sesiones con error grabadas
```

## Cuándo te avisa

Por defecto Sentry te manda email cada nuevo error. Puedes:
- Conectar Slack/Discord (Sentry → Settings → Integrations)
- Crear alertas custom (X errores en Y minutos → email)
- Filtrar por release / environment

## Quota

Plan free Developer:
- **5,000 errores/mes** (no eventos, errores únicos agrupados)
- **10,000 performance units/mes** (no activado)
- **50 replays/mes** (no activado)

Para 10-50 testers casuales = nunca te quedas sin quota.

## Comandos útiles

```typescript
// Manualmente reportar errores que normalmente no se capturarían
import { captureException, captureMessage, addBreadcrumb } from "./services/sentry";

captureException(new Error("custom error"));
captureMessage("Something noteworthy happened", "info");
addBreadcrumb({ category: "user-action", message: "Clicked X" });
```
