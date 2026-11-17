# Plan del consejo (17/11/2026)

Lo que dijo el consejo completo (5 asesores + crítico) sobre Draftboard, lo que
dicen las normas de Riot y el plan B si falla alguna pieza. Se hace poco a poco:
marca cada punto cuando esté hecho **y comprobado**.

## Veredicto

> Dejar de pulir y poner la app en manos de 5-10 personas durante 3 semanas, con
> una fecha para decidir. Antes, cumplir las normas de Riot.

- **En qué coincidieron los 5:** calidad interna alta (2758 pruebas), pero un
  solo usuario. Sacar varias versiones al día con un usuario = pulir en bucle.
  La clave de producción, después de probar. El coach solo está medido en jungla.
- **Discrepancias:** el optimista quería ir ya a por la clave de producción y no
  congelar nunca; el de la raíz recordó que, si la app es solo para ti o para
  aprender, cerrarla y usarla tranquilo también es válido; el escéptico fue el
  único que vio la dependencia de terceros sin plan B.
- **Opinión más sólida (la del práctico):** plan por semanas con fecha y regla
  de decisión.

## Riesgos que señalaron

1. **Pulir para siempre** sin que nadie más la use (varias versiones al día).
2. **Límites gratis compartidos por todos los usuarios:** Riot ≈100 peticiones
   cada 2 min, IA de Groq ≈2 análisis por minuto y 1000 peticiones al día.
   Con ~10 usuarios a la vez ya se nota; con 200 se rompe.
3. **Dependencia de terceros:** op.gg (servicio intermedio que puede cambiar),
   la clave de Riot. Si caen, la tier list y las builds se caen.
4. **Coach medido solo en jungla y en Oro:** un probador de otra posición puede
   recibir malos consejos y no volver.
5. **Actualizaciones automáticas muy seguidas:** con gente real, un fallo llega
   a todos en minutos.
6. **Miedo a exponerse:** pulir como forma cómoda de no ser juzgado, comiéndose
   tiempo del juego de Steam y de PCTuner.

## Lo que vio el crítico (y nadie más)

- **Normas de Riot antes de repartir** (ver abajo).
- **Medir con datos, no solo preguntando:** contar de forma anónima si abren la
  app y qué partes usan. Los amigos contestan por cumplir.
- **No cambiar la app durante la prueba:** si no, no sabes de qué versión opinan.

## Normas de Riot (leídas el 17/11/2026 en developer.riotgames.com/docs/portal)

| Clave | Para qué | Límite |
|---|---|---|
| Desarrollo | Solo hacer pruebas tú; caduca cada 24 h | — |
| **Personal** (la nuestra, "Draftboard", no caduca) | "just the developer or a small private community" | 20/s, 100 cada 2 min, por región |
| Producción | El público en general; suele pedir un prototipo que funcione | 500 cada 10 s, 30 000 cada 10 min |

- Con la clave personal **está prohibido** el uso público, **incluidas las
  pruebas abiertas** (alfa/beta abiertas), aunque la de producción tarde.
- **Problema hoy:** el repositorio de GitHub es público y cualquiera puede
  descargar el instalador. Ya salió en la revisión de normas del 1/11.
- Texto de la solicitud de producción: `docs/RIOT_KEY_APPLICATION.md` (del
  2/11, **desfasado**: hay que poner al día qué hace la app y de dónde saca
  los datos). La solicitud la envía Rafael desde el portal.

## Plan paso a paso

### Fase 0 — Cumplir y preparar (antes de repartir)
- [x] Poner al día `docs/RIOT_KEY_APPLICATION.md` con lo que hace la app hoy
      (17/11: límites reales, IA por el servidor, descarga de mejores
      jugadores, tier list por rango, lista de fuentes externas).
- [ ] Página web sencilla (GitHub Pages) con capturas y botón de descarga:
      Riot avisa de que con una web incompleta es poco probable que aprueben.
      Capturas actuales en `docs/screenshots/` (del 12/11, 4 imágenes).
- [ ] Rafael envía la solicitud de clave de producción en el portal
      (developer.riotgames.com → Register Product → Production).
- [ ] Decidir cómo cerrar la descarga pública mientras llega la clave (p. ej.
      no difundir el enlace; estudiar si el instalador puede servirse sin
      repositorio público sin romper las actualizaciones).
- [ ] Arreglos del coach (tema principal por datos, objetivos de tu posición,
      nada de "te costó la partida" si ganas): **hechos y medidos, sin
      publicar por decisión de Rafael (17/11)**. Medido en 20 partidas de
      jungla: consejos de calle 2 → 0, "te costó la partida" en victorias
      3 → 0, cifras de los datos 91 → 98 %. Saldrán en la versión que se dé
      a los probadores.
- [ ] Probar 5 partidas la selección de campeones en directo con la lógica nueva.

### Fase 1 — Prueba cerrada (3 semanas, sin versiones nuevas salvo fallos graves)
- [ ] 5-10 amigos o conocidos, grupo cerrado (nada de Reddit ni Discord abiertos).
- [ ] Avisar de que el coach solo está medido en jungla.
- [ ] Contador anónimo y voluntario (con permiso explícito): si abren la app y
      qué partes usan. Nada de datos personales.
- [ ] Tres preguntas: ¿la abres sin que te lo recuerde?, ¿qué usas?, ¿qué te sobra?
- [ ] Medir el coach con partidas de otras posiciones (top, mid, ADC, support).

### Fase 2 — Decidir el día 21 (con datos)
- 3 o más la siguen usando por su cuenta (al menos 2-3 veces por semana) →
  seguir: clave de producción y crecer.
- Chocan con los límites y piden más → la clave de producción es lo primero.
- Nadie vuelve → congelarla sin culpa y pasar al juego de Steam.
- Si al final es solo para Rafael → es su herramienta, no un producto (también vale).

## Plan B (si falla una pieza)

| Si falla… | Qué pasa hoy | Plan B |
|---|---|---|
| **op.gg** (cambia o corta) | La tier list cae a nuestros datos propios (SoloQ Máster+ y pro) y, si no hay, a una lista básica | Sacar la tier list por rango de partidas propias vía la API oficial de Riot (necesita clave de producción por el volumen) |
| **Clave de Riot** (rechazada o retirada) | Sin historial, ojeo de rivales ni datos de rango | Modo "solo cliente": lo que se lee del cliente de LoL en tu PC (selección, runas, tu historial reciente) sigue funcionando sin la clave |
| **IA gratis de Groq** (límite o cierre) | Ya prueba otro modelo si uno está saturado (0.5.9) | Segundo proveedor gratis en el servidor (p. ej. Gemini); guardar análisis ya hechos; el usuario puede poner su propia clave (ya existe) |
| **Servidor Cloudflare gratis** (límite diario) | La app avisa y usa lo guardado | Plan de pago de 5 $/mes si hay usuarios de verdad |
| **Actualización mala** | Llega a todos en minutos | Durante la prueba, una versión por semana y solo con pruebas en verde; poder volver a la anterior |

## Ya hecho este día (contexto)

- Tier list: ningún S por debajo del 51 % en las 50 listas por rango + la general.
- Limpieza: ~1000 líneas sin uso fuera.
- Seguridad: la clave de IA del servidor ya no la puede usar cualquiera.
- Coach IA medido en 20 partidas de jungla: consejos de calle a un jungla
  28/40 → 2/40; dueño del primer dragón mal 4 → 0 (0.5.9).
