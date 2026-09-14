# Verificación visual en Electron sin pantalla

> **Para qué.** Media docena de entradas de `CLAUDE.md` terminan en «pendiente de
> verificación visual en Electron», y varias fases se cerraron sin ella porque se
> daba por imposible fuera de una máquina con pantalla. No lo es. Este documento
> deja el método por escrito para que no vuelva a darse por imposible.
>
> Se estrenó cerrando ADR-017 F5, y en esa primera pasada encontró **dos defectos
> que ningún test estático veía** (§4).

---

## 1. Por qué hace falta

La lección nº 1 del repo: `node --check` y el health check **no ven layout ni
dibujo**. Tres clases de defecto sólo aparecen al ejecutar la aplicación:

- **capa muerta** — el código existe y nadie lo invoca (F3 tuvo tres casos así);
- **UI congelada** — el estado cambia y la vista no se entera (§4.1);
- **texto clavado** — un marcador de posición que nadie volvió a cablear (§4.2).

Todos son mudos: ni excepción, ni log, ni test en rojo.

## 2. Receta

Tres piezas: un **servidor X virtual**, el **puerto de depuración** de Electron y
el **hook ADR-010** que ya vive en la aplicación.

```bash
npm install                          # electron y su binario (~300 MB)

xvfb-run -a --server-args="-screen 0 1680x1050x24" \
  node_modules/.bin/electron . \
    --no-sandbox --disable-gpu --disable-dev-shm-usage \
    --remote-debugging-port=9222 > /tmp/el.log 2>&1 &

curl -s http://127.0.0.1:9222/json/version   # comprobar que responde
```

La aplicación arranca entera: ventana, backend Python, IPC, `app://`. Si el
`.venv` no existe, `main.js` cae al `python` del PATH (mensaje
`[MAO Python] Intentando con "python" del PATH...`) y el backend levanta igual.

Desde Node, con Playwright, **sin tocar el repositorio**:

```js
import { chromium } from 'playwright';
const br = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = br.contexts()[0].pages().find(p => p.url().includes('index.html'));
```

A partir de ahí se conduce con el hook de ADR-010 y se capturan elementos
concretos (`page.locator('#canvas').screenshot()`), que es lo que permite
**mirar** el resultado y no sólo consultarlo.

## 3. Los cuatro escollos, y cómo se salvan

| escollo | síntoma | solución |
|---|---|---|
| **Ruta del fixture** | `Ruta no permitida fuera del directorio de usuario` | el guard de `main.js` compara contra `os.homedir()` del **proceso** (aquí `/root`, no `/home/user`). Lo más simple es dejar el fixture en `assets/fixtures/` y cargarlo por nombre corto. |
| **EXIF obligatorio** | `Archivo JPG sin metadatos EXIF válidos` | un sintético no trae EXIF. Rellenar a mano `focalInput`, `distanciaInput`, `sensorWidthInput`, `sensorHeightInput`, `apertureInput` y pulsar `#calcularEscalaBtn`: es lo que la propia app pide por la barra de estado. |
| **Botón de detectar deshabilitado** | la detección «no hace nada» | sin escala calculada el botón nace `disabled`. Es el guard, no un fallo: calcular la escala primero. |
| **Pestaña bloqueada** | `#canvas` no visible; `aria-disabled="true"` | guards de ADR-001. `maoTabRouter.unlock('analisis')` + `go('captura'|'analisis')`. **El lienzo vive en ② Captura y la tarjeta §6 en ③ Análisis.** |

Además: `currentAnalyzedObject` no se puebla con el análisis en lote. Lo puebla
`window.mostrarAnalisisMorfologico(obj, obj.analisisCached.metricas)` — ojo, las
métricas viven en `obj.analisisCached.metricas`, no en `obj.metricas`.

## 4. Lo que encontró en su primera pasada

### 4.1 Las tarjetas §P/H y §6 se construían UNA sola vez

`partition()` reparte los `<h5>` por las secciones en la primera pasada. Desde
entonces `findRoot()` —que los exige **hermanos**— devolvía `null`, `organize()`
no llamaba a los constructores y las tarjetas quedaban congeladas con el estado
con el que nacieron.

Se veía así: pulsar **«Evaluar completitud»** cambiaba el chip de la cabecera
—que se construye *antes* de esa compuerta— y la tarjeta seguía ofreciendo
«Evaluar», sin «Confirmar». **El botón de confirmar no llegaba a existir**, de
modo que el flujo de ratificación de ADR-017 F3 era inalcanzable desde la
interfaz. Lo mismo afectaba a la tarjeta de P/H (ADR-009).

Arreglo: el root queda marcado con `.adr2-root` en la primera pasada; se
recupera por ahí cuando `findRoot` ya no lo reconoce.

### 4.2 La fila «Completitud» estaba clavada en «Sin evaluar»

Texto fijo desde F0 —cuando no había nada que mostrar— y nadie volvió a él al
cablear F3. La tarjeta §6 decía «70 %» y dos centímetros más abajo, **en la misma
pantalla**, la tabla seguía diciendo «sin evaluar». Corregido en los **dos**
productores (`visualization-export.js` y el duplicado IIFE de `analysis-core.js`:
sin tocar el segundo el defecto sobrevive por la ruta legacy).

## 5. Límites honestos

- Es **Linux con Xvfb**, no macOS: no valida `titleBarStyle: 'hiddenInset'`, los
  semáforos, ni el renderizado de fuentes de macOS.
- No sustituye a mirar la aplicación con una **fotografía real**: los fixtures
  sintéticos tienen bordes limpios y fondo uniforme.
- El backend corre con las versiones del contenedor, no con las fijadas en
  `requirements-runtime.txt`.

Lo que sí valida, y antes no se validaba: que la capa se dibuje, que los botones
existan, que el estado fluya de la acción al lienzo y que la consola quede limpia.
