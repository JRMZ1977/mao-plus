# MAO Plus 1.3.0 — nota de versión

**Fecha:** 2026-09-15 · **Rama:** `claude/mao-plus-math-engine-verify-c8c8fd`
**Sustituye a:** 1.2.0 (el `/Applications/MAO Plus.app` instalado es del 2026-06-03 y no contiene
nada de lo que sigue).

## 1. Qué es esta versión

Hasta el 2026-09-14 las mejoras del motor matemático vivían en **tres líneas divergentes** que
ninguna copia de la aplicación reunía:

| Línea | Qué aportaba | Dónde corría |
|---|---|---|
| `main` local (`3043246`) | forma invariante a la rotación, ponderación discriminante, ADR-019 (procedencia de detección), borrado de 70 duplicados, CI | ninguna copia arrancable |
| `fix/exportaciones` + `limpieza` (`7b79cef`) | ADR-013 F2, ADR-015 F1 y B1, ADR-016, exportación en lote | el lanzador `MAO Plus (dev)` |
| `origin/main` (`450fc41`) | ADR-017 F0–F6 (plantillas y fragmentos), O-16 (EFA), O-20 (atípicos), memoria matemática | sólo contenedores Linux |

La 1.3.0 las consolida con el respaldo del glosario (ADR-018), **verifica la matemática contra
referencias externas y conduciendo la aplicación Electron real**, y corrige lo que esa verificación
encontró.

## 2. ⚠ Valores que cambian respecto de 1.2 (no mezclar exportaciones sin leer esto)

| Salida | 1.2 | 1.3.0 | Por qué |
|---|---|---|---|
| Completitud / «Fragmento X (N % completo)» | cobertura angular (≈91 % en disco entero, medio y cuarto) | retirada; la da la plantilla **confirmada** (`plantilla_completitud`) | ADR-017 F0 — el estimador era degenerado |
| `concavidad_perimetro_percent` (antes «pérdida de perímetro») | ≤ 0 por construcción | signo corregido, ≥ 0 | ADR-017 F0 |
| Sección XII | «Estado de Conservación y Fragmentación» | «Concavidad del Contorno y Estado de Conservación» | mide concavidad, no fractura |
| `solidity_class` | «… fragmentado» | rótulos neutros de concavidad | ADR-018 |
| ICC de reproducibilidad (`validation_stats.icc`) | ICC(3,1) con el nombre ICC(2,1) | ICC(2,1) real + `icc_consistencia` + IC | O-24 |
| IC del CV de estandarización | *bootstrap* percentil (cobertura 72–88 %) | McKay modificado, Vangel 1996 (92–97 %) | O-25 |
| Atípicos de Mahalanobis (comparador) | √χ²(0,975; r) — inalcanzable con n ≤ 30 | Beta de Wilks (1963) | O-20 |
| Plantillas desde la app (`/api/shape-match`) | umbrales de soporte 0,30/0,45 | calibrados 0,40/0,50/0,60 | O-26 |
| Contorno de objetos por la ruta Python | a veces sustituido por el polígono idealizado | siempre el contorno canónico | regresión corregida |
| Perfil de lente sin intrínsecos | k₁ usado sin convención | sólo con `distorsion.k1_normalizacion`; si no, tabla FOV declarada | O-27 |
| `versionMAO` / `mao_version` | `1.2.0` escrito a mano | `1.3.0` desde una fuente única | trazabilidad |

## 3. Verificación

**Suite:** 592 passed / 0 skipped · ESM 17/17 · contratos 33/33 · clasificación 15/15 · 3 tests de
exportación. Cada test añadido en esta versión se ejecutó contra el código anterior y falla allí.

**Contra referencias externas** (no contra los tests del propio autor):

| Mejora | Referencia | Resultado |
|---|---|---|
| ADR-015 A2 ICC | Tabla 2 de Shrout & Fleiss (1979) | 0,2898 / 0,7148 = publicado |
| ADR-015 C3 IC del CV | simulación de cobertura, normal y log-normal | 92–97 % |
| ADR-015 B1 Zhang | `cv2.projectPoints` | ≤ 0,01 pp |
| O-16 síntesis EFA | Kuhl & Giardina implementado aparte | coeficientes 4·10⁻¹³; circularidad 0,8076 vs 0,8075 |
| O-20 atípicos | scipy Beta / simulación bajo H₀ | 2,2–2,45 % (nominal 2,5 %) |
| ADR-017 plantillas | fragmentos de otro generador, 4 rotaciones, 3 escalas | error ≤ 4,5 pp círculo, ≤ 6,6 pp elipse; invariante a escala |
| ADR-013 F2 contorno | imagen JPEG propia con gradiente y textura | 1 hash en 5 corridas; 0,0 % entre 6 ROI; −0,16 % de área |
| Clasificación de forma | 12 rotaciones con ruido | 12/12 en las 5 formas |

**En la aplicación Electron real** (copia aislada, conducida por CDP): arranque con los 14 módulos;
fragmento de disco al 70 % → botón «Evaluar» → **círculo 70,17 %** → confirmar → Tabla completa y
PDF batch «circulo · 70 % preservado»; anillo **60,33 %** (verdad 60); atípico detectado con umbral
de Wilks; B1 Zhang **5,2974 %** (OpenCV 5,2974); «Nuevo análisis» limpia escala y objetos.

## 4. Corregido durante la verificación

Matemática: O-20 (Wilks), O-24 (ICC), O-25 (IC del CV), O-26 (umbrales del endpoint), O-27 (k₁
sin convención), IC del arnés de calibración de ADR-017 F4.

Integración: la ruta Python pisaba el contorno canónico con el polígono idealizado; la completitud
confirmada no llegaba al PDF batch ni a los CSV; `null` del puente publicado como «sin forma ideal».
Incluye además `be33986` (llegado a `fix/exportaciones` tras cerrar la versión): los candidatos P/H
descartados ya no resucitan al reabrir el análisis (`metricas.json` guardaba la lista vieja).

Ejecución (fallos silenciosos, presentes en todas las ramas): «Nuevo análisis» abortaba a mitad
(escala y análisis previos sobrevivían); `window.toast` nunca existió (ningún aviso de los
organizers); selección por componente en modo solo-JS; Geometría Manual; vectores de desplazamiento
GPA de Procrustes; exportación Excel con piezas bifaciales; SVG del lote con P/H; «Exportar PDF»
desde el visor; fallback tipológico IA de piezas lunares; dos instancias de `utility-helpers.js`.

## 5. Pendiente — requiere decisión

1. **O-23 · Sección IX:** el error óptico publicado es desplazamiento de posición; el error de una
   longitud radial es 3× y el de área 2× mayor. Cambia valores exportados → ADR.
2. **O-1 · escala en campo lejano** (`s = p·d/f`): sesgo f/(d−f) en mm. ADR-020 reservado.
3. **ADR-015 B1 en la interfaz:** el backend acepta perfiles de lente, pero ninguna pantalla los
   importa; el frontend calcula el error óptico en JS. Además `calibracion_lente.html` exporta k₁
   del método «línea recta» en px⁻¹.
4. **Distribución:** construir el runtime Python embebido (`scripts/build-runtime.sh`) y el DMG;
   sustituir el `.app` de junio.
5. Corpus real (DRG_19-15) y segundo observador para A1/A2 y ADR-017 F4.
