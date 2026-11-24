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
- [x] Página web sencilla (GitHub Pages) con capturas:
      **https://rafaellopezdelrio.github.io/draftboard** (17/11). Fuente en
      `site/`, publicada en la rama `gh-pages` (`git subtree split --prefix
      site`). "Beta cerrada", sin botón de descarga (clave personal). Lleva el
      `riot.txt` de verificación: no borrarlo.
- [x] Rafael envía la solicitud de clave de producción en el portal.
      17/11: **enviada desde Firefox** (Brave/Chrome/Opera fallan: error del
      portal, github.com/RiotGames/developer-relations/issues/1194). App
      **909160**, web verificada con riot.txt, estado **Pending Review**. La
      caja de descripción admite 1500 caracteres: versión corta en
      `D:\Claude\draftboard\riot-descripcion-corta.txt`. Riot puede tardar
      meses y contesta en la pestaña "Messages" de la solicitud.
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

#### Añadido por el segundo consejo (17/11/2026: ¿auditoría completa o seguir?)
Veredicto unánime: **no hacer auditoría completa** (sería pulir en bucle con
otro nombre); seguir este plan y antes de invitar a nadie:
- [x] **Instalación desde cero** (hecha 24/11, todo bien) en un usuario de Windows limpio, sin nuestras
      claves ni historial, hasta la primera partida. Arreglar solo lo que
      bloquee. Si salen 3-4 fallos que bloquean o más: revisión corta solo de
      ese recorrido (no auditoría completa).
- [x] **Qué pasa si op.gg o la IA fallan** (cortarlos y mirar la app).
      17/11, cortados a mano en la app: no se cae nada. op.gg caído → tier
      list básica, "Datos básicos" arriba y "A medias" abajo; **arreglado**
      el texto, que decía "lista de op.gg" cuando era la de reserva. IA caída
      → **arreglado** el mensaje: antes "TypeError: Failed to fetch", ahora
      "No hay conexión con la IA. Revisa tu internet o inténtalo en un rato".
- [ ] **Una partida en otra posición** que no sea jungla.
- [ ] **Cerrar la descarga pública** mientras no haya clave de producción.
- [ ] **Límites con 10 personas:** calcular si la clave personal (100 cada
      2 min por región) y la IA gratis aguantan a 10 probadores a la vez.
      **Cuentas (17/11, mirando el código):**
      - Pantalla de carga (ojeo de rivales): 5 rivales × 14 peticiones
        (perfil, maestrías, lista de partidas, liga y **10 partidas**) =
        **70 por partida** y probador, casi de golpe.
      - Después de la partida: ~4. Con la app abierta sin jugar: 2 cada 5 min
        (10 personas = ~8 cada 2 min).
      - Clave personal en EUW: **100 cada 2 min para todos juntos**. Un ojeo
        cabe (70 + 8). **Dos probadores cargando partida en los mismos
        2 minutos (148) se pasan**: al segundo le sale el ojeo a medias. Con
        5 jugando a la vez por la tarde pasa en la mayoría de rondas.
      - Ayuda: si juegan juntos (dúo/flex), las peticiones repetidas salen de
        la caché del servidor y no gastan.
      - **Arreglo propuesto:** el ojeo mira 5 partidas por rival en vez de 10
        → 45 por partida; dos a la vez caben (98). La racha sigue funcionando
        (usa 4). Y la "descarga de mejores jugadores" (opcional, gasta 95 cada
        2 min) **no debe usarla ningún probador** con la clave personal.
      - IA (Groq gratis): ~5 000 palabras-ficha por análisis; 8 000 por
        minuto y modelo, 1 000 peticiones al día. 10 probadores × 3-4
        análisis al día = ~40: sobra. Si coinciden en el mismo minuto, la
        app ya salta a otro modelo.
      - Servidor Cloudflare gratis: 100 000 peticiones al día; 10 probadores
        ≈ 4 000. Sobra.
- [ ] **De dónde salen los 5-10 probadores** (lista de nombres antes de empezar).
- [ ] **Qué es éxito el día 21, fijado ANTES de empezar** (p. ej. cuántos la
      abren 3 o más días por semana; qué uso cuenta).
- [ ] **Canal para avisar de fallos** (un grupo o un formulario) y que la app
      pueda guardar un informe de error para enviarlo.
      17/11: hecho en código, sin publicar. Botón **Sugerencia / Error** a la
      vista; llega a nuestro servidor (base de datos D1) y, si no llega, la
      app lo dice. Antes la versión publicada decía "enviado" y no llegaba
      nada (faltaba la dirección de Sentry). Servidor subido y probado en
      vivo el 17/11 (base de datos `draftboard-reports`). La app lo trae en
      la versión de los probadores. Cómo leerlos: `docs/REPORTS.md`.
- [ ] **Excepción pactada:** solo se saca versión nueva si un fallo impide usar
      la app. Nada más.
- [ ] **Contador anónimo:** consentimiento claro (RGPD) y que cumpla las
      normas de Riot, revisado antes de activarlo.
      17/11: casilla opcional **sin marcar** en la pantalla de términos
      (versión 2), número al azar que no se une a la cuenta de Riot, se borra
      al decir que no, sin IP. Cuenta qué pantallas se usan cada día. No
      toca datos de Riot (solo uso de nuestra app). Servidor listo; sale con
      la versión de los probadores.

#### Tercer consejo (18/11/2026: "estoy perdido, ¿qué hacemos?")
Los 5 de acuerdo: el plan es bueno y se rompió en 24 h (57 cambios, 5
versiones). Parar las funciones nuevas, cerrar primero la descarga pública y
apuntar las ideas nuevas (coach que aprende de todos, ayuda del amigo
programador en la tier list) para después de la prueba. Fechas fijadas:
- [ ] 18-19/11: cerrar la descarga pública, instalación limpia, una partida
      fuera de jungla, lista de **5** probadores con nombre (no 10: límite de
      la clave), éxito escrito: "3 de 5 la abren 2+ veces por semana sin que
      se lo recuerde, medido con el contador".
- **Descarga pública: se espera (decisión de Rafael, 18/11), con datos.**
  En todo el historial, 71 descargas (3-6 por versión, y eso cuenta las
  actualizaciones automáticas de su PC y del amigo y nuestras
  comprobaciones), 1 estrella, 0 copias del repositorio. Hoy solo la tiene un
  amigo. Cerrarla costaría trabajo y crear claves nuevas. **Se cierra si** una
  versión pasa de 15 descargas, si aparece alguien que no conocemos o si Riot
  pregunta. Mirar: `curl -s https://api.github.com/repos/Rafaellopezdelrio/draftboard/releases`
  (campo `download_count`). Con la clave de producción el problema desaparece.
- [x] **Instalación desde cero** (18/11, 0.6.3 instalada, datos apartados en
      `D:\Claude\draftboard-respaldo-18-11`): términos, bienvenida, cuenta
      detectada sola (Riot ID con letras raras bien), 72 partidas de la
      temporada bajadas y con su cuenta, registro sin errores. Menú Inicio
      (mirado 23/11): el instalador de Tauri crea el acceso en la primera
      instalación y las actualizaciones a propósito no lo vuelven a crear
      (`shortcuts.nsh`: sale si `/UPDATE`). En el PC de Rafael falta porque
      se borró en algún momento; un probador que instale de cero lo tendrá.
      Comprobarlo en el primer probador.
- [ ] Partida fuera de jungla con la app abierta (Rafael, más tarde).
- [x] **Última versión para probadores: 0.6.5** (publicada 23/11; la 0.6.4
      quedó solo fabricada). Lleva voces naturales, aviso del trinket, coach y
      tendencias en es/en, contador de funciones con permiso. **Congelada**:
      durante la prueba solo arreglos de fallos graves.
- [ ] 20/11 → 11/12: prueba. **11/12: decidir** con los datos.
- Norma durante la prueba: si sale una idea nueva, se apunta aquí y no se
  programa; el asistente lo recuerda antes de empezar nada.
- Apuntado 23/11 (partida con la 0.6.5 instalada): las voces naturales le
  siguen sonando robóticas; Sharvard algo menos que Dave. En España no hay
  voz Piper de calidad "alta" (Dave y Sharvard son "media"). Las de calidad
  alta son de otro acento: es_MX-claude-high (México, Apache 2.0, 63 MB) y
  es_AR-daniela-high (Argentina, CC BY-SA 4.0, 114 MB). Antes de tocar nada:
  que las escuche en https://rhasspy.github.io/piper-samples/ y decida.
- Apuntado 23/11 (Rafael, partida de Ornn top): el coach culpa al jugador de
  derrotas que vienen de otros. Ornn empató en oro y ganó en experiencia a
  Kled en el minuto 14; la partida se perdió por la jungla (Lee Sin rival
  11/4, +1 382 de oro sobre Talon en el 14) y el coach solo dijo
  "participación baja". Hacer: (1) "dónde se perdió": cada línea contra su
  rival en el 14 y al final; si la tuya fue bien, decirlo y señalar la que se
  hundió, solo con números, sin culpar; (2) separar muertes en peleas de
  equipo (varios aliados caen a la vez) de las muertes en solitario.
- **23/11: publicada la 0.6.6** (Rafael: "despliega", servidor + versión;
  rompe la congelación de la 0.6.5 por decisión suya). Lleva lo de abajo.
- Hecho 23/11 (en la 0.6.6): coach con línea real, "dónde
  se perdió", muertes en pelea aparte, peleas con menos gente ("no hace
  falta seguir cada pelea"); runas completas y objetos 4.º-6.º.
- Apuntado 23/11 (Rafael): runas incompletas en "Prepara" (`slice(0, 4)`
  de 9) y en "Contra X" (faltan los 3 fragmentos); build del enfrentamiento
  cortada en el 3.er objeto (op.gg matchup solo trae 3; rellenar 4.º-6.º con
  la build general). Coach: enseñar a no seguir todas las peleas y a rotar.
- Apuntado 23/11 (Rafael): builds de lolvvv con elección EUW/KR, posición
  detectada y rival. lolvvv **no tiene API pública**: su web usa una GraphQL
  interna (`/api/graphql`) no ofrecida a terceros; la página pública solo
  trae la posición principal y las regiones mezcladas (KR/NA/EUW/BR). Sin
  permiso, no usar la interna. Rafael (23/11): no escribirles por ahora.
- Hecho 23/11: nota suave del trinket en top/mid en el coach (sin voz,
  "info", solo si acabas una partida de 20+ min con el amarillo).
- 24/11: coach pasado por 8 partidas reales (Fiddle, Nocturne, Gnar top,
  3 mid, 2 support). Arreglado: Fiddlesticks ya no recibe el aviso de
  trinket (el suyo es fijo; es el único campeón así según Data Dragon); el
  "no cambiaste el trinket" tiene 2 min de margen (support a las 15:14); y
  "participación baja" ya no dice "acude a teamfights" (chocaba con "no hace
  falta seguir cada pelea"). Pendiente de mirar con más partidas: daño por
  oro en jungla (objetivo 1.1, Fiddle 2/0/4 ganando dio 0.49). Mirado 24/11:
  0 avisos en 20 partidas de jungla; solo salta en la de Fiddle (victoria de
  17 min). Se deja como está (un caso no es dato).
- 24/11 (Rafael): cuándo cambiar el trinket por rol, en vez de "minuto 15".
  Support: en la primera vuelta a base después de que el objeto ponga wards
  (Atlas → Brújula rúnica, 3866). Jungla: en la 1.ª o 2.ª vuelta. ADC: en la
  1.ª vuelta tras el nivel 9. Top/mid: nota suave (depende). Las vueltas a
  base salen de las compras de la partida (compras a <1 min = una vuelta).
  En directo: support al tener la Brújula, jungla desde el minuto 8, ADC al
  nivel 9.
- 24/11, consejo completo ("¿más detalle en el inicio y quitamos la otra
  vista?"): no quitar "Ver más detalles" sin datos. Hecho: (1) lista de lo
  que solo vivía ahí y hacía algo solo: era solo el ojeo de rivales (voz y
  avisos), ya pasado a la vista sencilla; lo demás es información para leer
  (tablero manual, análisis de equipos, consejos del enfrentamiento, tus
  campeones, maestrías, parche, intercambio de picks, coach de selección con
  IA). (2) Inicio: "Lo más importante de la partida" con 3 puntos del coach
  (2 a mejorar + 1 bien) SOLO en jungla (lo único medido); el resto, el
  consejo de siempre. Añadir un rol cuando se mida. (3) Mensaje de
  probadores: enlace a la 0.6.6 y 4.ª pregunta "¿abriste 'Ver más detalles'?
  ¿para qué?". Decidir esconderla en Ajustes tras 1-2 semanas de prueba.
- 24/11, consejo completo ("¿qué tal 0.6.5/0.6.6 y qué más hacer?"):
  invitar YA con la 0.6.6 tras UNA instalación desde cero (cuenta de Windows
  nueva; pasos en `D:\Claude\draftboard\prueba-instalacion-limpia.txt`).
  Invitar por tandas: 3 amigos y, a los 2-3 días, el resto (ver si aguantan
  el límite de Riot y la IA compartida). Pedir rol principal, captura de cada
  fallo y "¿qué te dijo el coach y era verdad?". La 0.6.7 (los 8 cambios del
  24/11) en fecha fija (p. ej. 1/12), tras verlos en partidas reales; sin
  tocar código hasta entonces salvo bloqueo. Riesgo que señaló: pulir para
  no enseñar la app. Rafael: "Sí, hoy" a la instalación desde cero.
  **Hecha el 24/11 en una cuenta de Windows nueva: todo bien** (Rafael).
  **24/11: la prueba ha empezado.** Rafael avisó él mismo a los amigos (rol,
  capturas, "¿qué te dijo el coach y era verdad?") y ya la están usando.
  Mirar el contador (`npm run reports`) y sus mensajes; 0.6.7 en fecha fija.
- 24/11, probadores (juegan los 5 juntos): "no sabemos a qué jugar", "el
  primer pick es aleatorio", "centrarnos primero en un estilo de juego".
  Rafael: pick a ciegas según lado azul/rojo y orden de picks. Consejos
  completos 24/11 (dos):
  - 0.6.7 = SOLO "estilo de equipo": se elige en la sala antes de buscar
    partida (sin reloj), misma sugerencia para el grupo (campeones de todos),
    solo ordena/destaca picks que encajan (no cambia pesos), un toque,
    opcional, se apunta si se usa (trackFeature) y se pregunta "¿os ayudó?".
    Congelar el 30/11.
  - Visión del probador ("herramienta de drafteo de los 5: varias opciones
    según los rivales, estilos que se actualizan, todo explicado y guardado
    para estudiar"): es la dirección, por fases y tras el 11/12 si se sigue.
    Fase 2 (la más barata, no gasta Riot): pantalla de drafts guardados
    unida al resultado de la partida. Después, campeones de los 5 y opciones
    según rivales (gastan cupo de Riot: mejor con clave de producción).
  - Fuera: prever rivales concretos o mirar su historial en la selección
    (Riot los oculta en clasificatoria y lo prohíbe; pondría en riesgo la
    clave de producción). Picks rivales visibles sí. El pick a ciegas, tras
    el 11/12.
  - Rafael (24/11): modo TEAM automático según la cola (SoloQ/dúo aparte;
    Flex, Clash y grupos de 5 para equipo, composición y sinergia). Consejo
    completo: en la 0.6.7, el estilo de equipo se OCULTA solo en SoloQ/dúo
    (la cola ya se lee) con una línea que diga por qué; en el resto se ve.
    Leer cuántos vais en la sala y el modo TEAM completo (con Clash, donde
    el rival se conoce antes), tras el 11/12. Si la detección no está
    segura, el estilo se muestra. Preguntar a los probadores en qué cola
    juegan de verdad y si hay Clash antes del 11/12.
  - Rafael (24/11): "cuando se detecte 5 personas en una cola competitiva o
    normal (Reclutamiento), la app en modo team, también para entrenar";
    juegan todas las colas y van a montar equipo de Clash. **Hecho (sin
    publicar, para la 0.6.7):** la app lee la sala del cliente
    (`/lol-lobby/v2/lobby`) cada 5 s en sala/cola/selección; con 5 en la sala
    en la Grieta (no ARAM/Arena) sale "Modo equipo" con 5 estilos (Engage,
    Poke y control de zonas, Proteger al carry, Pick, Split), el sugerido
    (★) según los 5 campeones con más maestría de cada uno (mismo resultado
    para todo el grupo) y, al elegir uno, primero los picks que encajan (y
    dentro, los que dominas) con la etiqueta "Encaja con …". SoloQ/dúo/trío:
    nada cambia. Contador: `team-mode`, `team-style`. FALTA: probarlo con
    los 5 en una sala de verdad antes del 30/11.
  - **24/11: publicada la 0.6.7** (Rafael: "despliega, así probamos el
    modo equipo todos hoy"; adelanta la fecha del 1/12 por decisión suya).
    Servidor 2026-11-24.1; manifiesto con firma idéntica al .sig; instalador
    6 870 732 bytes descarga bien.
- 24/11: el plan de 7 días no se borra nunca (se guarda en la base de datos);
  parecía perdido porque la ventana abría en "Generar nuevo". Ahora abre en
  el plan de esta semana. Las respuestas de la IA salían con "vos" (jugá):
  ahora se le pide español de España. Comprobado en tus partidas: Braum "tarde" (7 → 9), Nautilus "no
  cambiaste" (3 vueltas sin cambiar), Nocturne nada (cambió en la 1.ª).

### Fase 1 — Prueba cerrada (3 semanas, sin versiones nuevas salvo fallos graves)
- [x] 5-10 amigos o conocidos, grupo cerrado (nada de Reddit ni Discord abiertos). Empezó el 24/11 (avisados por Rafael).
- [ ] Avisar de que el coach solo está medido en jungla. 23/11: mensaje para
      el grupo listo en `D:\Claude\draftboard\mensaje-probadores.txt`
      (instalar, aviso de Windows, casilla de avisos, este aviso, botón de
      errores y las tres preguntas). Falta enviarlo.
- [x] Contador anónimo y voluntario (con permiso explícito): si abren la app,
      qué pantallas usan y qué funciones fallan (23/11; `npm run reports`).
      Nada de datos personales. **Pedir a cada probador que marque la casilla
      de avisos** al instalar: viene sin marcar y sin ella no llega nada.
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

## A futuro: IA para miles de usuarios (pedido por Rafael, 17/11)

Hoy la IA gratis de Groq es **una sola cuenta para todos**: unas 1 000
peticiones al día y ~2 análisis por minuto por modelo. Con 10 probadores
sobra; con miles se acaba antes de comer. Solo tiene sentido mirarlo si el
día 21 sale "seguir". Opciones, de más barata a más cara:

1. **Guardar lo ya hecho:** el análisis de una partida no cambia; si se pide
   otra vez, sale de lo guardado (no gasta).
2. **Tope por persona y día** (p. ej. 5 análisis), contado en nuestro servidor.
3. **Clave propia del usuario** (ya existe en Ajustes) para quien quiera más.
4. **Segundo proveedor gratis** en el servidor (p. ej. Gemini) cuando Groq
   esté lleno.
5. **Plan de pago** de Groq u otro: se paga por uso; precio por mirar el día
   que haga falta (un análisis son ~5 000 fichas). Con ingresos o sin ellos
   decide si es viable (ver normas de Riot sobre cobrar).

**Mirado el 17/11 (gravity.fast, openrouter.ai, flatkey.ai, apidog.com):**
- Groq gratis: el tope real son **200 000 fichas al día por modelo** (no las
  1 000 peticiones): ~40 análisis al día por modelo; con los 2-3 modelos de
  reserva, ~100-120.
- Cloudflare Workers AI (nuestra misma cuenta, sin darse de alta en nada):
  10 000 "neuronas" al día gratis ≈ ~100 análisis con gpt-oss-20b; después,
  ~0,1 céntimos por análisis.
- Gemini gratis: límites solo en su consola; **usa lo que se le manda para
  mejorar sus productos** (habría que avisarlo en privacidad).
- OpenRouter: 50 al día gratis; 1 000 al día pagando 10 $ una vez.
- Cerebras y Cohere: pruebas, no gratis para siempre ni para producción.
- **Conclusión:** gratis, sumando todo, ~300-400 análisis al día. Para miles
  de jugadores no existe gratis: lo barato es pagar por uso (~0,1 céntimo por
  análisis: 10 000 análisis ≈ 10 €). Orden: 1) guardar análisis hechos,
  2) segundo proveedor = Cloudflare Workers AI, 3) tope por persona,
  4) pago por uso cuando haya usuarios de verdad.
- **Decisión de Rafael (17/11): nada de pago ni cambios de IA por ahora.**
  Sin ingresos todavía; la idea es que lo que genere la app pague sus costes.
  Se retoma con el plan de cobrar.

## A futuro: cobrar (pedido por Rafael, 17/11)

También solo si el día 21 sale "seguir". Para cobrar hace falta:
- **Clave de producción** de Riot y cumplir sus normas de cobro (lo gratis
  tiene que seguir gratis, nada de pagar por ventaja injusta; ver memoria
  `draftboard-monetizacion-riot`).
- **Quitar lo que no deja cobrar:** GRID (solo uso no comercial) y revisar las
  condiciones de op.gg, u.gg, lolvvv y Leaguepedia.
- **Datos propios** en su lugar. Así lo hacen op.gg o u.gg: con una clave de
  producción descargan millones de partidas de la API oficial de Riot
  (Match-V5), las suman y sacan porcentajes de victoria, builds y tier list
  por rango. Nosotros ya lo hacemos en pequeño ("descarga de mejores
  jugadores", Máster+); a lo grande necesita la clave de producción y un
  servidor que guarde y sume (coste mensual).

## A futuro: coach de equipo para Flex y Clash (pedido por Rafael, 22/11)

Apuntado para **después de la prueba** (no se programa antes del 11/12).
Lo mismo que hace el coach para uno, pero para un grupo de 2 a 5 amigos:
- **El equipo sale solo:** el cliente de LoL sabe quién está en tu grupo
  (Flex con amigos, Clash); no hay que escribir nombres. Si sois 3, coordina
  a los 3 y trata a los otros 2 como hoy.
- **Plan de draft:** qué banear según lo que mejor juega cada uno, en qué
  orden pickear y qué guardar para el final.
- **Sinergias:** parejas que combinan bien entre los campeones de cada uno
  y qué tipo de equipo sale (iniciar peleas, pegar de lejos, dividirse).
- **Durante la selección:** recomendaciones para todos a la vez.
- **Ojo:** bajar el historial de 5 gasta mucho cupo de Riot → guardar lo ya
  bajado. Normas de Riot: solo el propio grupo; nada de destapar nombres
  ocultos de desconocidos en la selección. Al principio el plan lo ve solo
  quien tiene la app abierta (el "capitán", que lo cuenta por Discord);
  verlo todos a la vez sería un paso posterior.
- Reutiliza casi todo lo que ya calcula la app (picks, counters, sinergias).

## Ya hecho este día (contexto)

- Tier list: ningún S por debajo del 51 % en las 50 listas por rango + la general.
- Limpieza: ~1000 líneas sin uso fuera.
- Seguridad: la clave de IA del servidor ya no la puede usar cualquiera.
- Coach IA medido en 20 partidas de jungla: consejos de calle a un jungla
  28/40 → 2/40; dueño del primer dragón mal 4 → 0 (0.5.9).
