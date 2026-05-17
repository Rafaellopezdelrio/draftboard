# Self-Review Checklist

**Política**: antes de decir "hecho" sobre cualquier cambio, paso por este
checklist mentalmente. Si NO paso un punto, lo digo abiertamente en el
mensaje al usuario ("este punto pendiente").

## 1. ¿De verdad probé el caso real?

- ❌ Mal: "Asumí formato JSON sin verificar la respuesta real" → bug parser op.gg
- ✅ Bien: hacer `curl` o `Bash` al endpoint real y mirar el output crudo
  antes de declarar el código terminado

## 2. ¿Mi cambio rompe algo visible?

- Si tocas componentes React: F5 mentalmente — ¿el layout cambia?
- ¿Hay overlap con otros elementos? Dropdowns, modales, tooltips, toasts.
- ¿Hay regresiones en tipografía / espaciado / colores?
- Si tocas una página/modal específica: nombra ALL los otros elementos
  visibles que podrían verse afectados.

## 3. ¿Cubrí los edge cases?

Para cada función nueva o tocada:
- ¿Qué pasa con array vacío `[]`?
- ¿Qué pasa con null / undefined?
- ¿Qué pasa con muestra ínfima (1 game)? ¿Con muestra enorme?
- ¿Y si el campo opcional no existe?
- ¿Y con datos malformados (regex no matchea)?

## 4. ¿Hay test que cubra este caso?

- Si he arreglado un bug → existe test que falla SIN el fix
- Si he añadido feature → existe test que verifica el caso feliz Y al
  menos un caso fronterizo

## 5. ¿He mirado los OTROS lugares que tocan lo mismo?

Al cambiar una función / store / repo:
- ¿Quién más la usa? (grep)
- ¿Mi cambio rompe los llamantes?
- ¿Hay tipos compartidos que necesiten ajuste?

## 6. ¿He verificado que compila + tests verde TRAS el cambio?

- `npx tsc --noEmit` → exit 0
- `npx vitest run` → todos verde
- Coverage no baja del threshold

## 7. ¿He testeado mentalmente la cadena completa?

Si el cambio toca una UI:
- ¿Qué pasa al abrirla en frío (sin datos)?
- ¿Y con datos parciales (sync a medias)?
- ¿Y con datos completos?
- ¿Qué pasa si HMR la actualiza con el usuario en medio de un click?

## 8. ¿He sido honesto en mi resumen?

- Si dije "todo verde": ¿pasaron de verdad TODOS los puntos arriba?
- Si dije "UI bien": ¿la miré píxel a píxel o solo escaneé?
- Si dije "feature lista": ¿incluye todos los casos o solo el camino feliz?

---

## Plantilla para mensaje "hecho"

```
✅ Cambio: [descripción]
Self-review:
  □ Caso real probado ([cómo: curl, F5, screenshot])
  □ No rompe layout (revisado: [lista de elementos cercanos])
  □ Edge cases: [empty, null, malformed → comportamiento esperado]
  □ Test añadido: [path + qué cubre]
  □ Callers grep'eados y verificados: [paths]
  □ tsc + tests verde
  □ Cadena completa: [escenario inicial → final]
Pendiente honesto: [lo que SÍ falta o no comprobé]
```

Si NO he hecho todos los puntos, lo declaro al final.
