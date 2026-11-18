# Avisos de los usuarios (sugerencias, errores y uso)

Todo llega a **nuestro servidor** (el worker de Cloudflare) y se guarda en su
base de datos gratis (D1, `draftboard-reports`). No pasa por Sentry ni por
nadie más. El servidor **no guarda la IP**.

## Qué llega

| Tabla | Qué es | Cuándo |
|---|---|---|
| `reports`, tipo `suggestion` / `bug` | Lo que el usuario escribe en el botón **Sugerencia / Error** (arriba en la barra, en "Acerca de" y en la pantalla de fallo). Si deja marcada la casilla, va con la versión de Draftboard y de Windows. | Siempre que el usuario pulsa Enviar (es su decisión). Si no llega, la app se lo dice y el texto se queda. |
| `reports`, tipo `error` | Errores de la app: mensaje, las 5 últimas líneas del fallo y los 15 últimos pasos. Sin claves (se tapan), sin nombre de usuario de Windows. Máximo 10 por sesión y cada error una vez. | Solo si el usuario marcó la casilla opcional al instalar (o lo activa en Preferencias). |
| `installs` | Instalaciones nuevas por día y versión (solo un número). La app avisa una vez, la primera vez que alguien acepta los términos; las actualizaciones no avisan (ya estaban aceptados) y la versión DEV tampoco. Sin id ni IP. | Siempre, una sola vez por instalación (está explicado en la pantalla de términos). |
| `usage` | Una fila por instalación y día: versión y qué pantallas abrió. La instalación se identifica con un número al azar hecho en su PC, que no está unido a la cuenta de Riot y se borra si dice que no. | Igual: solo con permiso. |

El permiso viene **sin marcar** (RGPD). Quien ya tenía la app ve otra vez la
pantalla de términos (versión 2) y elige.

## Leerlos

**Lo fácil:** desde la carpeta del proyecto, un resumen con todo (personas por
día, quién la abre 3 días o más a la semana, pantallas más usadas y los
últimos 30 avisos):

```bash
npm run reports
```

Detalle de un aviso (versión, Windows, pasos antes del fallo): `npm run reports -- 12`.

También se ve en el panel de Cloudflare: Workers & Pages → D1 →
`draftboard-reports` → pestaña Console o Tables.

A mano, desde `cloudflare-worker/`:

```bash
npx wrangler d1 execute draftboard-reports --remote --command "SELECT datetime(ts/1000,'unixepoch') AS cuando, kind, version, message FROM reports ORDER BY ts DESC LIMIT 30"
```

```bash
npx wrangler d1 execute draftboard-reports --remote --command "SELECT details FROM reports WHERE id = 1"
```

Uso (para la regla del día 21: cuántos la abren 3 días o más por semana):

```bash
npx wrangler d1 execute draftboard-reports --remote --command "SELECT id, COUNT(*) AS dias FROM usage WHERE day >= date('now','-7 days') GROUP BY id ORDER BY dias DESC"
```

```bash
npx wrangler d1 execute draftboard-reports --remote --command "SELECT day, COUNT(*) AS personas FROM usage GROUP BY day ORDER BY day DESC LIMIT 21"
```

## Montarlo (una vez)

```bash
npx wrangler d1 create draftboard-reports
```

Copiar el `database_id` que devuelve en `wrangler.toml` (bloque `[[d1_databases]]`,
binding `DB`) y crear las tablas:

```bash
npx wrangler d1 migrations apply draftboard-reports --remote
```

Sin la base de datos, `/report` responde 503 y la app avisa de que no se ha
enviado (no dice "enviado" en falso).

## Límites

- 30 avisos por minuto y por IP; mensaje hasta 2000 letras, detalles hasta 8000.
- D1 gratis: 5 GB y 100 000 escrituras al día: de sobra para la prueba.
