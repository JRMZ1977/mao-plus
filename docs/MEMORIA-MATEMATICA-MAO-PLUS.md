# Memoria matemática del análisis morfométrico — MAO Plus

**Documento de revisión externa · Glosario de métricas y desarrollos matemáticos**

| Campo | Valor |
|---|---|
| Software | MAO Plus (Morfometría Arqueológica Objetiva) — aplicación Electron + backend FastAPI/Python |
| Versión documentada | rama `main` al 2026-09-13: ADR-017 F0-F3 (`4c2e261`) más las correcciones de O-16 y O-20 que acompañan a este documento. **Actualizada para MAO Plus 1.3.0 (2026-09-15)**: O-20 completada (distribución de Wilks), observaciones O-23 a O-27 añadidas en §13 · **Actualizada para MAO Plus 1.3.1 (2026-09-18, ADR-021)**: exportación EFA en el convenio de Kuhl & Giardina, corrección de la «isometría» de O-16 (§6.2) y observación **O-28** (§6.3, §13.2) |
| Fecha del documento | 2026-09-13 |
| Autoría del análisis matemático | J. F. Ruiz Rodríguez (LAAR) · asistencia de documentación: Claude Code |
| Estado de verificación | Suite de pruebas del motor: **398 pasadas / 2 omitidas** (ejecución del 2026-09-13, ver §12) |
| Alcance | Núcleo de cálculo 2D (canónico), puente 2D↔3D, estadística de colección. No cubre la capa de interfaz. |

---

## Cómo leer este documento

Este documento tiene tres funciones simultáneas y está escrito para que un revisor externo pueda
ejercer las tres:

1. **Glosario** — qué mide cada métrica, en qué unidades, en qué rango, y bajo qué convención
   (§5 es el catálogo completo; el Anexo A es la tabla-resumen de una página).
2. **Desarrollo matemático** — de dónde sale cada fórmula, qué supuestos incorpora y qué
   propiedades de invariancia posee o no posee (§2–§11).
3. **Auditoría de trazabilidad** — cada fórmula lleva su localización exacta en el código fuente
   (`archivo:línea`), de modo que la afirmación documental sea verificable contra la
   implementación, no solo contra la intención. El Anexo B concentra ese mapa.

Las **fuentes bibliográficas** se citan con el formato `[Autor año]` y se resuelven en §14, con DOI
o identificador estable cuando existe. Se distingue deliberadamente entre:

- **Método canónico de la literatura** — la fórmula es la publicada; la implementación la reproduce.
- **Convención MAO** — decisión propia del proyecto, justificada arqueológicamente, que **cambia el
  valor numérico** respecto de la práctica estándar. Se marcan con el distintivo **⚙ Convención MAO**
  porque son el punto donde un revisor debe detenerse: no son errores, pero sí decisiones que hay
  que conocer para comparar con otras herramientas.
- **Heurística calibrada** — regla empírica con umbrales ajustados a la práctica, sin pretensión de
  ser un estimador estadístico. Se marcan con **⚠ Heurística** y nunca se presentan como
  probabilidades.

§13 reúne, en una única tabla, las **limitaciones conocidas y las observaciones metodológicas**
detectadas al redactar esta memoria, con su severidad y su remedio propuesto. Un revisor con poco
tiempo puede leer §1, §13 y el Anexo A y tener el mapa completo del rigor y de sus bordes.

---

## Índice

- [§1. El problema de inferencia y la cadena de cálculo](#1-el-problema-de-inferencia-y-la-cadena-de-calculo)
- [§2. Calibración métrica y presupuesto de incertidumbre óptica](#2-calibracion-metrica-y-presupuesto-de-incertidumbre-optica)
- [§3. Separación figura-fondo (segmentación)](#3-separacion-figura-fondo-segmentacion)
- [§4. Del borde al contorno: extracción y refinamiento](#4-del-borde-al-contorno-extraccion-y-refinamiento)
- [§5. Glosario matemático de métricas 2D](#5-glosario-matematico-de-metricas-2d)
- [§6. Descriptores elípticos de Fourier (EFA)](#6-descriptores-elipticos-de-fourier-efa)
- [§7. Homología 2D↔3D: el repertorio canónico](#7-homologia-2d3d-el-repertorio-canonico)
- [§8. Perforaciones y horadaciones (P/H)](#8-perforaciones-y-horadaciones-ph)
- [§9. Análisis bifacial: simetría, CI y CMS](#9-analisis-bifacial-simetria-ci-y-cms)
- [§10. Estadística de colección](#10-estadistica-de-coleccion)
- [§11. Clasificación morfológica](#11-clasificacion-morfologica)
- [§12. Verificación: qué está probado y cómo](#12-verificacion-que-esta-probado-y-como)
- [§13. Limitaciones conocidas y observaciones metodológicas](#13-limitaciones-conocidas-y-observaciones-metodologicas)
- [§14. Bibliografía](#14-bibliografia)
- [Anexo A — Tabla maestra de métricas](#anexo-a--tabla-maestra-de-metricas)
- [Anexo B — Mapa de trazabilidad fórmula ↔ código](#anexo-b--mapa-de-trazabilidad-formula--codigo)

---

<a id="1-el-problema-de-inferencia-y-la-cadena-de-calculo"></a>

## §1. El problema de inferencia y la cadena de cálculo

### 1.1 Qué se está estimando realmente

MAO Plus no «mide» un artefacto: **estima magnitudes del artefacto a partir de una proyección
fotográfica de él**. Esa distinción gobierna toda la matemática del sistema. La cadena de inferencia
es:

$$
\text{Artefacto } (\mathbb{R}^3)
\;\xrightarrow[\text{cámara}]{\pi}\;
\text{Imagen } (\mathbb{R}^2)
\;\xrightarrow[\text{muestreo}]{\text{ráster}}\;
\text{Píxeles } (\mathbb{Z}^2)
\;\xrightarrow[\text{segmentación}]{\sigma}\;
\text{Máscara}
\;\xrightarrow[\text{trazado}]{\partial}\;
\text{Contorno } \mathcal{C}
\;\xrightarrow[\text{métricas}]{\mu}\;
\text{Vector morfométrico}
$$

Cada flecha introduce un tipo distinto de error, y cada uno se trata en una sección distinta:

| Flecha | Error introducido | Tratamiento | Sección |
|---|---|---|---|
| $\pi$ proyección | distorsión de lente, perspectiva, relieve fuera de plano | presupuesto de incertidumbre óptica, propagado a las métricas dimensionales | §2 |
| ráster | cuantización espacial, ruido fotónico | refinamiento sub-píxel; invariantes robustos | §4 |
| $\sigma$ segmentación | asignación errónea figura/fondo | cascada de métodos + índice de confianza por objeto | §3 |
| $\partial$ trazado | dentado del borde discreto, sobre/infra-simplificación | *gradient snap* con salvaguardas + Douglas–Peucker adaptativo | §4 |
| $\mu$ métricas | ninguno propio; sí sensibilidad al muestreo | invariancia declarada y verificada por métrica | §5, §12 |

**Consecuencia de diseño (invariante rector del proyecto).** Como el error de $\pi$ es un factor
multiplicativo sobre la escala, y el error de $\partial$ es sensible al muestreo, MAO adopta como
**núcleo comparable** solo las métricas **adimensionales e invariantes** ante traslación, rotación y
escala. Las magnitudes dimensionales (mm, mm²) se reportan siempre, pero **acompañadas de su
intervalo de incertidumbre** y nunca se usan como base de comparación entre piezas sin normalizar
(ADR-006; §7.1).

### 1.2 El pipeline de cálculo, módulo a módulo

```
                  ┌───────────────────────────────────────────────┐
  EXIF + entrada  │ §2  ESCALA  scale.calculate()                 │
  del operador ──►│     s [mm/px] + presupuesto de error óptico    │
                  └──────────────────┬────────────────────────────┘
                                     │  s, ±ε
  imagen ────────►┌──────────────────▼────────────────────────────┐
                  │ §3  FIGURA-FONDO  detection.detect()          │
                  │     Z-scan · CLAHE · Otsu · GrabCut · watershed│
                  │     → máscara binaria + confianza por objeto   │
                  └──────────────────┬────────────────────────────┘
                                     │  máscara, bbox
                  ┌──────────────────▼────────────────────────────┐
                  │ §4  CONTORNO  contour.extract()               │
                  │     border-following · coherencia · sub-píxel  │
                  │     · gradient snap · Douglas-Peucker          │
                  │     → C = {p_0..p_{N-1}}  (+ candidatos P/H §8)│
                  └──────────────────┬────────────────────────────┘
                                     │  C
        ┌────────────────────────────┼────────────────────────────┐
        ▼                            ▼                            ▼
┌───────────────┐          ┌──────────────────┐        ┌────────────────────┐
│ §5 MÉTRICAS   │          │ §6 EFA           │        │ §8 P/H             │
│ metrics.py    │          │ efa.py           │        │ ph.py              │
│ ~55 indicad.  │          │ 20 armónicos     │        │ área neta          │
└───────┬───────┘          └────────┬─────────┘        └─────────┬──────────┘
        └───────────────┬───────────┴──────────────────────────-─┘
                        ▼
          ┌──────────────────────────────┐      ┌───────────────────────┐
          │ §7 REGISTRO CANÓNICO 2D↔3D   │◄────►│ obj3d_v2.py (malla 3D)│
          │ morphometric_registry.py     │      └───────────────────────┘
          └──────────────┬───────────────┘
                         ▼
    ┌────────────────────────────────────────────────────┐
    │ §9 bifacial   §10 estadística   §11 clasificación   │
    │ comparator.py · comparator.pca() · classifier.py    │
    └────────────────────────────────────────────────────┘
```

**Nota de arquitectura relevante para la revisión.** Desde ADR-012 («detección monolítica») existe
**un único núcleo de segmentación canónico**: `detection.detect()` en Python/OpenCV. Los cuatro
modos de uso de la aplicación (automático, detección asistida, manual por área, manual por
componente) son *priors* distintos sobre el mismo núcleo, no algoritmos rivales. El motor
JavaScript equivalente existe solo como *fallback* si el backend Python no está disponible, y
reproduce las mismas fórmulas. Esto importa para la revisión porque **garantiza que un mismo
objeto produce el mismo número por cualquiera de las cuatro vías**, salvo por lo que el operador
aporte: el encuadre en los modos manuales o, en la detección asistida, una umbralización distinta
de `auto` (con `auto` usa el núcleo tal cual).

*Nota terminológica.* La detección asistida se llamaba «IA» en versiones anteriores; la sigla se
retiró (ADR-022) porque se leía como «inteligencia artificial». Ningún modo de detección usa un
modelo entrenado: todo el procesamiento de imagen de esta memoria es OpenCV clásico.

### 1.3 Notación

| Símbolo | Significado |
|---|---|
| $\mathcal{C} = (p_0,\dots,p_{N-1})$ | contorno cerrado, $p_i=(x_i,y_i)\in\mathbb{R}^2$, con $p_N \equiv p_0$ |
| $\mathcal{H}$ | envolvente convexa (*convex hull*) de $\mathcal{C}$ |
| $A_r, P_r$ | área y perímetro del **contorno real** (medidos, con las mellas y fracturas) |
| $A_h, P_h$ | área y perímetro de la **envolvente convexa** (forma canónica estimada) |
| $s$ | factor de escala en **mm/píxel** (en el código: `scale_px_mm`, nombre heredado) |
| $c=(c_x,c_y)$ | centroide de área (Shoelace); $c^{\mathcal{H}}$ el de la envolvente |
| $\lambda_1\ge\lambda_2$ | autovalores del tensor de inercia de área normalizado |
| $\mu_{pq}$ | momento central de área normalizado de orden $p{+}q$ |
| $\Delta E$ | distancia de color euclídea en RGB (§3.1) |
| $\mathbb{1}[\cdot]$ | función indicadora |

Convenio de unidades: los sufijos `_px` indican píxeles; sin sufijo, milímetros cuando hay escala
válida ($s>0$) y píxeles en caso contrario. El código documenta esa bifurcación explícitamente en
`metrics.py:574-595`.

---
<a id="2-calibracion-metrica-y-presupuesto-de-incertidumbre-optica"></a>

## §2. Calibración métrica y presupuesto de incertidumbre óptica

> **Módulo:** `python/modules/scale.py` · espejo JS en `js/analysis-core.js` (`calcularEscala`,
> `estimarErrorOptico`, `aplicarIncertidumbreOptica`).
> **Rasgo distintivo del sistema:** MAO no reporta una medida, reporta **una medida y su
> incertidumbre posicional**, calculada objeto a objeto según dónde caiga en el fotograma.

### 2.1 Escala: de píxeles a milímetros

Sea una cámara con distancia focal $f$ (mm), sensor de ancho $W_s$ (mm) muestreado en $N_x$
píxeles, y un objeto situado a distancia $d$ (mm) del objetivo. El **paso de píxel** en el plano del
sensor es

$$p \;=\; \frac{W_s}{N_x}\quad\text{[mm/px]}.$$

Bajo el modelo de lente delgada, la magnificación transversal de un objeto a distancia $d$ del
plano principal es $m = f/(d-f)$, de donde la escala **exacta** en el plano del objeto sería
$s_{\text{exacta}} = p/m = p\,(d-f)/f$. MAO implementa la **aproximación de campo lejano**
($d \gg f \Rightarrow m \approx f/d$):

$$\boxed{\;s \;=\; \frac{W_s}{N_x}\cdot\frac{d}{f}\;}\qquad\text{[mm/px]},\qquad
\text{px/mm} = 1/s
$$

`scale.py:278`. Es la fórmula clásica de la *distancia de muestreo del terreno* (GSD) en
fotogrametría de corto alcance [Luhmann et al. 2019, §3.3; Hartley & Zisserman 2004, cap. 6]. El
campo de visión se deriva por $\text{FOV}_w = N_x\cdot s$ (`scale.py:282`).

El sensor se identifica por EXIF (marca/modelo) contra una base interna de ~200 cámaras; si falta
$W_h$ se asume píxel cuadrado, $W_h = W_s\,N_y/N_x$ (`scale.py:340`).

> **⚠ Observación metodológica O-1 (ver §13).** La omisión del término $-f$ introduce un **sesgo
> sistemático multiplicativo** conocido y acotable:
> $$\beta \;=\; \frac{s}{s_{\text{exacta}}}-1 \;=\; \frac{f}{d-f}.$$
> Con $f=100$ mm: $\beta=25\,\%$ a $d=500$ mm, $11{,}1\,\%$ a $1$ m, $5{,}3\,\%$ a $2$ m,
> $2{,}0\,\%$ a $5$ m. En el límite macro 1:1 ($d=2f$) el sesgo es del $100\,\%$. Dos hechos lo
> contienen: (i) **no afecta a ninguna métrica adimensional** (§2.4), que es el núcleo comparable;
> (ii) la **verificación por longitud conocida** (§2.5) lo absorbe *exactamente*, porque calibra
> $s$ contra un patrón físico. La recomendación operativa es, por tanto, tratar la fórmula
> fotogramétrica como *estimación inicial* y la calibración por patrón como *medida*.

### 2.2 Modelo de lente y distorsión radial

El campo de visión diagonal se obtiene de la geometría del estenopeico:

$$\text{FOV}_{\text{diag}} \;=\; 2\arctan\!\left(\frac{\sqrt{W_s^2+W_h^2}}{2f}\right)
\qquad(\texttt{scale.py:343-345})$$

La distorsión radial se modela con el primer término de la serie de **Brown–Conrady**
[Brown 1966; Brown 1971], que describe el desplazamiento radial de un punto imagen:

$$r_d \;=\; r_u\left(1 + k_1 r_u^2 + k_2 r_u^4 + k_3 r_u^6 + \cdots\right)$$

de donde, a primer orden, el **error relativo de una longitud** medida a radio normalizado $\rho$ es

$$\varepsilon_{\text{dist}}(\rho) \;=\; |k_1|\,\rho^{2}\times 100\;[\%],
\qquad \rho=\frac{\lVert (c_x,c_y)-(N_x/2,N_y/2)\rVert}{N_x/2}
\qquad(\texttt{scale.py:363-370})$$

es decir, se evalúa **en el centroide del objeto**, no globalmente: dos objetos del mismo fotograma
reciben incertidumbres distintas según su posición. Este es el aporte metrológico propio de MAO.

> **⚠ Observación O-23 (nueva, 1.3.0) — $|k_1|\rho^2$ es el desplazamiento de la POSICIÓN, no el error
> de una LONGITUD en cualquier dirección.** Con $r_d = r(1+k_1r^2)$ el factor de escala local es
> $r_d/r = 1+k_1r^2$ en dirección **tangencial**, pero $dr_d/dr = 1+3k_1r^2$ en dirección **radial**,
> y el jacobiano de área vale $\approx 1+4k_1r^2$. El presupuesto publica $|k_1|\rho^2$ como error
> lineal y $2|k_1|\rho^2$ como error de área: subestima **3×** una longitud radial y **2×** el área.
> *Medido en la aplicación* (1.3.0, perfil de Zhang, verdad con `cv2.projectPoints`, $f_x=4000$,
> $k_1=-0{,}10$, punto a $(5600, 3700)$ de un fotograma $6000\times4000$): desplazamiento relativo
> $5{,}30\,\%$ —que MAO reproduce exactamente— frente a $14{,}4\,\%$ de error en una longitud
> radial corta en ese punto. **No se ha corregido**: cambia los valores de la Sección IX ya
> exportados y exige decidir si el campo quiere expresar incertidumbre posicional o dimensional;
> corresponde a un ADR con nota de versión (mismo criterio que O-1).

Sin calibración de lente, $k_1$ se toma de una **tabla empírica por FOV** (⚠ Heurística,
`scale.py:347-361`):

| FOV diagonal | $k_1$ | Clase de óptica |
|---|---|---|
| $<20°$ | $-0{,}0003$ | teleobjetivo largo |
| $20$–$30°$ | $-0{,}0010$ | teleobjetivo |
| $30$–$45°$ | $-0{,}0035$ | normal-tele |
| $45$–$60°$ | $-0{,}0120$ | normal-gran angular |
| $60$–$75°$ | $-0{,}0400$ | gran angular |
| $75$–$90°$ | $-0{,}1000$ | gran angular severo |
| $>90°$ | $-0{,}2200$ | ultra-gran angular |

El signo negativo codifica distorsión de barril. El propio código declara la incertidumbre del
modelo: *«k1 estimado para FOV X° (sin calibración de lente; incertidumbre del modelo ±30 %)»*
(`scale.py:417-420`).

> **⚠ Observación metodológica O-2 (ADR-015 B1).** Hay una **incompatibilidad de convención** entre
> este $k_1$ tabulado y el $k_1$ que devuelve una calibración de Zhang en OpenCV: el segundo opera
> sobre coordenadas normalizadas por la focal, $r_n = r_{px}/f_x$, mientras MAO normaliza por la
> semianchura, $\rho = r_{px}/(N_x/2)$. Ambos difieren en el factor $(N_x/2f_x)^2$ —del orden de
> $4\times$ en ópticas normales—, de modo que **los coeficientes no son intercambiables**. El plan
> aprobado (ADR-015 B1) consume el perfil calibrado con el modelo Brown-Conrady completo en su
> propia convención, dejando la tabla FOV solo como respaldo, y sustituye el $\pm30\,\%$ por la
> incertidumbre real de la calibración ($\pm1$–$5\,\%$ con tablero de Zhang [Zhang 2000],
> $\pm7{,}5\,\%$ con el método *plumb-line*).

### 2.3 Término de perspectiva

Con óptica rectilínea, un elemento de campo angular $d\varphi$ situado a ángulo $\theta$ del eje
óptico ocupa en el sensor $dr = f\sec^2\!\theta\, d\varphi$. La dilatación radial relativa respecto
del centro del fotograma es por tanto $\sec^2\theta - 1$, y MAO la reporta como

$$\varepsilon_{\text{persp}} \;=\; \left(\frac{1}{\cos^{2}\theta}-1\right)\times 100\;[\%],
\qquad
\theta = \arctan\!\frac{r_{\text{sensor}}}{f},\quad
r_{\text{sensor}} = \sqrt{\left(\Delta x\tfrac{W_s}{N_x}\right)^2+\left(\Delta y\tfrac{W_h}{N_y}\right)^2}
$$

(`scale.py:372-379`). Nótese la interpretación correcta del término: para el montaje nominal
—objeto plano, sensor **paralelo** al plano del objeto— la proyección estenopeica es una homotecia
pura y el error de escala a través del campo es *cero*; el término $\sec^2\theta-1$ no describe ese
caso ideal, sino que actúa como **penalización posicional** que acota los errores que sí aparecen
cuando la coplanaridad falla (inclinación residual del plano, relieve del objeto). Es, por
construcción, **conservador**: sobreestima ligeramente la incertidumbre en el caso ideal, que es la
dirección segura para un informe metrológico.

> **⚠ Observación metodológica O-3 (ADR-015 B2, brecha declarada).** El presupuesto **no incluye**
> todavía el término de **relieve/paralaje**, que en un artefacto tridimensional fotografiado en 2D
> es la tercera fuente real. Su forma es elemental: un detalle situado a altura $h$ sobre el plano
> de referencia se proyecta con magnificación $f/(d-h)$ en lugar de $f/d$, de modo que
> $$\varepsilon_{\text{relieve}} \;=\; \frac{h}{d-h}\;\approx\;\frac{h}{d}.$$
> Para una cuenta de $h=10$ mm de espesor a $d=500$ mm, esto son $\approx 2\,\%$ **por sí solo** —
> del mismo orden que los otros dos términos juntos. Es la mejora de mayor rendimiento por esfuerzo
> del plan.

### 2.4 Combinación y propagación a las métricas

Los dos términos se combinan en cuadratura (suma cuadrática de residuos, RSS), el procedimiento
estándar para contribuciones no correlacionadas [JCGM 100:2008, §5.1]:

$$\varepsilon_{\text{lineal}} = \sqrt{\varepsilon_{\text{dist}}^{2}+\varepsilon_{\text{persp}}^{2}},
\qquad
\varepsilon_{\text{área}} = \sqrt{(2\varepsilon_{\text{dist}})^{2}+(2\varepsilon_{\text{persp}})^{2}}
= 2\,\varepsilon_{\text{lineal}}
$$

(`scale.py:381-387`). **El factor 2 —y no $\sqrt{2}$— es la elección correcta** y merece
justificarse, porque es un punto donde muchas implementaciones se equivocan: el error de escala es
un **error de modo común**, perfectamente correlacionado entre las dos dimensiones. Para
$A = L_1 L_2$ con $L_i \propto s$:

$$\frac{u_A}{A}=\sqrt{\left(\frac{u_{L_1}}{L_1}\right)^2+\left(\frac{u_{L_2}}{L_2}\right)^2
+2\,\frac{u_{L_1}}{L_1}\frac{u_{L_2}}{L_2}\,r_{12}}
\;\xrightarrow[\;r_{12}=1\;]{}\;2\frac{u_s}{s}$$

es decir, la fórmula de propagación con covarianza [JCGM 100:2008, §5.2]. Si se hubiese asumido
independencia ($r_{12}=0$) se habría reportado $\sqrt{2}\,\varepsilon$, subestimando la
incertidumbre del área en un 29 %.

La propagación a cada métrica es directa (`scale.py:426-478`): para toda métrica dimensional $X$ se
emiten tres campos derivados,

$$u_X = |X|\cdot\varepsilon_\bullet,\qquad
X_{\min}=X-u_X,\qquad X_{\max}=X+u_X,$$

con $\varepsilon_\bullet = \varepsilon_{\text{lineal}}$ para longitudes
(`perimeter`, `width`, `height`, `eje_mayor/menor`, `radio_*`, `feret_*`) y
$\varepsilon_\bullet = \varepsilon_{\text{área}}$ para áreas (`area`, `area_fragmentada`).

**Las métricas adimensionales no reciben incertidumbre de escala, y esto es un teorema, no una
omisión.** Si $X$ es homogénea de grado 0 en $s$, el factor se cancela idénticamente; p. ej. para la
circularidad:

$$\text{circ} = \frac{4\pi A}{P^{2}} = \frac{4\pi\,(s^2 A_{px})}{(s\,P_{px})^{2}}
= \frac{4\pi A_{px}}{P_{px}^{2}}\quad\text{(independiente de } s).$$

El código lo declara explícitamente en el campo `_metricas_no_afectadas`
(`scale.py:477`): circularidad, compacidad, rectangularidad, elongación, factor de forma, solidez,
relación de aspecto, excentricidad, convexidad y simetría. Esta es exactamente la razón por la que
el núcleo canónico (§7.1) está formado solo por adimensionales: **son inmunes tanto al sesgo O-1
como al presupuesto óptico**.

> **Brecha declarada (ADR-015 B3).** Lo que aún **no** se propaga es la incertidumbre de la
> *calibración de escala en sí* (la de $s$, no la posicional). Cerrarla consiste en añadir $u_s/s$
> como tercer sumando del RSS; la infraestructura de propagación ya existe y la admite sin cambios
> estructurales.

### 2.5 Calibración empírica por longitud conocida (vía metrológicamente preferente)

La aplicación incorpora un modo de **verificación de escala** (`js/analysis-core.js:42080-42270`):
el operador marca dos puntos sobre un patrón presente en la propia imagen (regla, escala
fotográfica) e introduce la longitud real $L_{\text{real}}$; el sistema calcula

$$s_{\text{manual}}=\frac{L_{\text{real}}}{\lVert p_2-p_1\rVert_{px}},\qquad
\kappa=\frac{s_{\text{manual}}}{s_{\text{auto}}},\qquad
\varepsilon_{\text{orig}}=\frac{|s_{\text{manual}}-s_{\text{auto}}|}{s_{\text{manual}}}\times 100
$$

y, tras confirmación explícita, aplica $\kappa$ como factor de corrección persistente. La
**procedencia queda registrada** en la exportación: `scale_corrected`, `correction_factor`,
`original_scale`, `corrected_scale`, `original_error_percent`, `verification_zone_percent` y fecha
(`js/analysis-core.js:23767-23776`). Además se registra en qué zona del radio de imagen se tomó la
verificación, lo que permite juzgar si el patrón estaba en la misma región de distorsión que el
objeto.

Metrológicamente esto es una **comparación directa contra un patrón**, y es por tanto la vía
trazable en el sentido del VIM [JCGM 200:2012, §2.41]. Recomendación para el protocolo de campo:
usarla siempre que haya escala en la toma, y situar el patrón a la misma distancia radial del centro
que la pieza.

### 2.6 Categorización de la confianza óptica

El resultado se resume en cinco categorías (`scale.py:389-399`), pensadas para el informe:

| $\varepsilon_{\text{lineal}}$ | Categoría |
|---|---|
| $<0{,}5\,\%$ | Muy alta |
| $<1{,}5\,\%$ | Alta |
| $<3\,\%$ | Moderada |
| $<6\,\%$ | Baja |
| $\ge 6\,\%$ | Muy baja |

Los cortes son convencionales (⚠ Heurística) pero están alineados con la práctica habitual en
morfometría de artefactos, donde se considera aceptable un error de medición inferior al $1$–$2\,\%$
del valor medido [Lyman & VanPool 2009 discuten el umbral en términos de variación inter-analista].

---
<a id="3-separacion-figura-fondo-segmentacion"></a>

## §3. Separación figura-fondo (segmentación)

> **Módulo:** `python/modules/detection.py` (1122 líneas) — núcleo canónico único (ADR-012).
> **Invariante rector (ADR-013):** *la detección devuelve siempre al menos un contorno cerrado
> válido del objeto dominante de la región; la separación de instancias puede añadir fronteras,
> nunca reducir el resultado por debajo de un contorno recuperable.*

Toda la morfometría posterior cuelga de una máscara binaria $M:\Omega\to\{0,1\}$ sobre el dominio
de píxeles $\Omega\subset\mathbb{Z}^2$. La segmentación no es, por tanto, un preproceso: **es la
medición primaria**, y su error se propaga a todas las métricas de forma no lineal. De ahí que MAO
implemente una cascada de métodos con criterios explícitos de conmutación y un índice de confianza
por objeto.

### 3.1 Métrica de color

Todas las decisiones cromáticas usan la distancia euclídea en RGB:

$$\Delta E(c_1,c_2)=\sqrt{(r_1-r_2)^2+(g_1-g_2)^2+(b_1-b_2)^2}\qquad(\texttt{detection.py:118})$$

> **⚠ Observación O-4.** RGB **no es perceptualmente uniforme**: un mismo $\Delta E$ representa
> diferencias visuales muy distintas según la región del espacio de color. El estándar del campo es
> CIELAB con la fórmula CIEDE2000 [Sharma, Wu & Dalal 2005], o al menos $\Delta E_{76}$ en L\*a\*b\*.
> El impacto práctico aquí es **acotado y en parte compensado**: (i) los umbrales no son fijos sino
> adaptativos al contraste real de cada imagen (§3.3); (ii) la etapa de bajo contraste opera sobre
> el canal $L^*$ de LAB (§3.5). Migrar las distancias a LAB sería una mejora aditiva de bajo riesgo
> y mejoraría sobre todo los fondos cromáticos saturados.

### 3.2 Estimación del fondo

Se muestrean cuatro bandas de borde de anchura $b=\min(10, H/4, W/4)$ y se toma la **mediana** por
canal (`detection.py:51-83`):

$$c_{\text{fondo}} = \operatorname{med}\{\,I(p) : p\in \partial_b\Omega\,\},\qquad
\text{brillo}_{\min}=\min(r,g,b)$$

La elección de la mediana sobre la media es deliberada y correcta: el borde del fotograma es
precisamente donde aparecen viñeteo, sombras del marco y esquinas de la escala fotográfica, es
decir, valores atípicos. La mediana tiene punto de ruptura del 50 %, la media del 0 %
[Huber & Ronchetti 2009, cap. 1]. Se derivan dos indicadores booleanos:
$\text{fondo blanco} \iff \text{brillo}_{\min}\ge 230$;
$\text{fondo cromático} \iff \max(|r-g|,|g-b|,|r-b|)>30$.

### 3.3 Z-scan: clasificador competitivo de color

Cuando el fondo no es blanco, se ejecuta un análisis de color en seis fases
(`detection.py:86-275`) cuyo resultado son dos colores de referencia $c_{\text{obj}}$,
$c_{\text{fondo}}$ y un umbral sugerido. Es, formalmente, un **clasificador de mínima distancia
(vecino más cercano al centroide de clase)** sobre RGB, es decir, una partición de Voronoi con dos
sitios [Duda, Hart & Stork 2001, §2.6]:

$$\text{clase}(p)=\arg\min_{k\in\{\text{obj},\text{fondo}\}}\lVert I(p)-c_k\rVert_2$$

Los elementos no triviales del procedimiento son:

**(a) Umbrales adaptativos al contraste de la escena.** En lugar de constantes fijas se usa la
desviación típica global $\sigma_I$ de la imagen:

$$\tau_{\text{perf}} = \operatorname{clip}(1{,}5\,\sigma_I,\;5,\;22),\qquad
\tau_{\text{celda}} = \operatorname{clip}(2{,}0\,\sigma_I,\;12,\;30)$$

(`detection.py:149-157`). Motivo documentado: con umbral fijo, una toma de bajo contraste clasifica
como «fondo» celdas del propio objeto y encoge el radio detectado.

**(b) Detección de topología anular.** Si $\Delta E(c_{\text{centro}},c_{\text{borde}})<\tau_{\text{perf}}$
el centro geométrico no pertenece al objeto sino a un hueco (pieza anular, cuenta perforada). El
color de objeto se busca entonces en el anillo que **maximiza el producto de contrastes**:

$$\hat r=\arg\max_{r}\;\Delta E(\bar c_r, c_{\text{centro}})\cdot\Delta E(\bar c_r, c_{\text{borde}})$$

(`detection.py:208-224`), criterio que premia el anillo simultáneamente distinto del hueco y del
fondo — exactamente la definición del material del objeto en una pieza toroidal.

**(c) Umbral por análisis del halo.** El halo lumínico (celdas de fondo adyacentes al objeto) se
obtiene por dilatación morfológica de la máscara de celdas-objeto; el umbral sugerido se fija en el
**percentil 25** de los $\Delta E$ del halo, atenuado y acotado:

$$\tau_{\text{sug}}=\max\!\left(12,\;\min\!\big(0{,}60\,\Delta E_{\text{obj,fondo}},\;
0{,}85\,q_{25}(\Delta E_{\text{halo}})\big)\right)$$

(`detection.py:246-261`). Usar un cuantil bajo del halo en vez del mínimo lo hace robusto a un único
píxel de transición.

**(d) Margen de confianza en la binarización.** Un píxel se asigna a objeto solo si está
*claramente* más cerca del color-objeto (`detection.py:311-331`):

$$M(p)=\mathbb{1}\!\left[\;\lVert I(p)-c_{\text{fondo}}\rVert-\lVert I(p)-c_{\text{obj}}\rVert
\;\ge\; \max(2,\;0{,}08\,\Delta E_{\text{obj,fondo}})\;\right]$$

La banda de indecisión se adjudica al fondo, política conservadora que evita inflar el objeto con la
penumbra de contacto (que es donde se acumula el error de área).

### 3.4 Umbral de Otsu (respaldo)

Cuando no hay Z-scan utilizable se binariza el canal de diferencia
$D(p)=\overline{|I(p)-c_{\text{fondo}}|}$ con el umbral de **Otsu** [Otsu 1979]
(`detection.py:333-336`), que maximiza la varianza entre clases:

$$t^{*}=\arg\max_{t}\;\sigma_B^{2}(t),\qquad
\sigma_B^{2}(t)=\omega_0(t)\,\omega_1(t)\,\big[\mu_0(t)-\mu_1(t)\big]^{2}$$

con $\omega_i$ las masas de probabilidad y $\mu_i$ las medias de cada clase. Equivale a minimizar la
varianza intra-clase, y es óptimo en el sentido de discriminante de Fisher para histogramas
bimodales.

### 3.5 CLAHE (realce local de contraste)

Para $\Delta E_{\text{obj,fondo}}<25$ se aplica **ecualización adaptativa de histograma con límite
de contraste** sobre el canal $L^*$ de LAB, con `clipLimit` 4,0 y rejilla $4\times4$
(`detection.py:278-290`):

$$L^{*}_{\text{eq}} = \text{CLAHE}_{c=4,\,4\times4}(L^{*}),\qquad
(a^{*},b^{*})\ \text{intactos}$$

Operar solo sobre $L^*$ preserva la cromaticidad —requisito para que las referencias de color del
Z-scan sigan siendo válidas— y el límite de recorte evita la amplificación de ruido característica
de la ecualización adaptativa clásica [Pizer et al. 1987; Zuiderveld 1994]. Es reversible y no
altera coordenadas, por lo que no afecta a ninguna métrica geométrica.

### 3.6 GrabCut (segmentación por corte de grafo)

Cuando el umbral de color es poco fiable (fondo heterogéneo, contraste cromático bajo, o cobertura
anómala $>92\,\%$ / $<4\,\%$), se recurre a **GrabCut** [Rother, Kolmogorov & Blake 2004]
(`detection.py:345-394`, `contour.py:426-450`). GrabCut minimiza iterativamente la energía de Gibbs

$$E(\underline{\alpha},k,\underline{\theta},z)\;=\;
\underbrace{\sum_{n} -\log p\!\left(z_n\mid \alpha_n,k_n,\theta\right)-\log \pi(\alpha_n,k_n)}_{U:\ \text{término de datos (GMM de 5 componentes por clase)}}
\;+\;
\underbrace{\gamma\!\!\sum_{(m,n)\in \mathcal{N}}\!\![\alpha_n\ne\alpha_m]\,
e^{-\beta\lVert z_m-z_n\rVert^{2}}}_{V:\ \text{término de suavidad de Potts}}$$

donde $\alpha_n\in\{0,1\}$ es la etiqueta figura/fondo, $k_n$ la componente gaussiana asignada y
$\beta$ se estima del contraste medio de la imagen. Cada iteración resuelve el mínimo global de
$E$ para $\underline{\alpha}$ mediante **corte mínimo / flujo máximo** en el grafo de vecindad
[Boykov & Jolly 2001; Boykov & Kolmogorov 2004] y reestima las mezclas gaussianas. MAO lo inicializa
con la máscara previa (`GC_INIT_WITH_MASK`, 5 iteraciones), no con un rectángulo, lo que conserva la
información ya obtenida por color y reduce el número de iteraciones necesarias.

**Salvaguarda de aceptación:** el resultado de GrabCut solo se adopta si su cobertura cae en
$(0{,}005,\;0{,}95)$; en caso contrario se conserva la máscara de color (`detection.py:836-841`).
Esto materializa el invariante de ADR-013: un método más sofisticado nunca puede dejar el pipeline
sin objeto.

> **Nota de reproducibilidad (ADR-013 F2).** GrabCut incorpora inicialización estocástica de las
> mezclas gaussianas (k-means interno), por lo que **no es estrictamente determinista** entre
> ejecuciones. Está por ello explícitamente **excluido** del gate de replicabilidad del contorno que
> plantea la fase 2 de ADR-013. Para publicación, la vía determinista es la de umbral
> (blancos absolutos / Z-scan / Otsu).

### 3.7 Morfología matemática

Se aplica cierre seguido de apertura con elemento estructurante elíptico $B$ de $3\times3$, con
1 iteración (fondo acromático) o 2 (cromático) (`detection.py:804-808`, `contour.py:420-424`):

$$M \;\leftarrow\; (M\bullet B)\circ B,\qquad
M\bullet B=(M\oplus B)\ominus B,\qquad M\circ B=(M\ominus B)\oplus B$$

El cierre rellena huecos y grietas menores que $B$; la apertura elimina motas aisladas. Ambas son
idempotentes y crecientes, y el orden elegido (cierre → apertura) preserva mejor el área del objeto
que el inverso [Serra 1982; Soille 2003, cap. 4].

**Punto crítico documentado (ADR-009):** el cierre **destruye los huecos internos**, que son
justamente los candidatos a perforación/horadación. Por eso se toma una instantánea
`mask_raw_holes` **antes** del cierre (`contour.py:415`), y la detección de P/H (§8) opera sobre
ella. Es un ejemplo de cómo una operación estándar de limpieza puede eliminar la señal de interés
si el pipeline no la preserva explícitamente.

### 3.8 Separación de instancias: transformada de distancia + watershed

Etapa **secundaria y no destructiva** (`detection.py:422-513`). Sobre la máscara de siembra
$M_s$ (huecos rellenos y componentes menores que `min_area` descartados) se calcula la
**transformada de distancia euclídea** [Rosenfeld & Pfaltz 1966; Felzenszwalb & Huttenlocher 2012]:

$$D(p)=\min_{q\,:\,M_s(q)=0}\lVert p-q\rVert_2$$

Las semillas de primer plano se definen por componente conexa $\mathcal{K}$ con umbral **relativo
local**:

$$\text{sure\_fg} \;=\; \bigcup_{\mathcal{K}}\Big\{\,p\in\mathcal{K}\;:\;D(p)\ge 0{,}5\max_{q\in\mathcal{K}}D(q)\Big\}$$

El umbral relativo (y no absoluto) es lo que permite separar objetos de tamaños dispares: en dos
discos en contacto cada centro supera su propio máximo local, mientras el «cuello» entre ambos, con
$D$ baja, queda fuera y se convierte en la frontera. La zona desconocida es
$\text{unknown} = (M_s \oplus B^{3})\setminus \text{sure\_fg}$, y sobre ella se ejecuta el
**watershed por inundación desde marcadores** [Beucher & Lantuéjoul 1979; Vincent & Soille 1991;
Meyer 1994], que traza las líneas divisorias donde se encuentran las cuencas.

**El hallazgo empírico que motivó ADR-013** merece constar en esta memoria porque ilustra un modo de
fallo genérico de este algoritmo: sobre un artefacto anular de piedra real
(`DRG16_NC1263_875_a_242.JPG`), la máscara cruda de Otsu contenía **24 componentes y 73 huecos
internos** debidos a la textura de la piedra. Cada máximo espurio de $D$ genera un marcador, de modo
que el watershed **fragmentó un objeto único en 8 arcos**. El umbral de Otsu no era el culpable
—Otsu plano devolvía 1 objeto—; lo era alimentar al watershed con una máscara sucia. La corrección
implementada limpia la máscara de siembra (relleno de huecos + descarte de motas) **sin**
`MORPH_CLOSE` (que fusionaría el cuello entre objetos realmente pegados), y el reparto final se
intersecta con la máscara **original** para preservar los huecos P/H:

$$\text{objeto}_j = \{\,p : \text{markers}(p)=j+1\,\}\cap\{\,p: M(p)=1\,\}$$

Si el resultado no supera un objeto, la función devuelve `None` y el llamador conserva el etiquetado
por componentes conexas: **la división solo ocurre con evidencia**.

### 3.9 Confianza de detección por objeto

⚠ **Heurística calibrada** (`detection.py:516-550`). Se combinan dos evidencias locales:

$$\text{contraste}=\operatorname{clip}\!\left(\frac{\Delta E\big(\overline{I}_{\text{obj}},\ \overline{I}_{\text{anillo}}\big)}{60},0,1\right),
\qquad
\text{extent}=\operatorname{clip}\!\left(\frac{A}{A_{\text{bbox}}},0,1\right)$$

$$\boxed{\ \text{score} \;=\; 0{,}65\,\cdot\,\text{contraste}\;+\;0{,}35\,\cdot\,\text{extent}\ }
\qquad
\text{nivel}=\begin{cases}
\text{alta} & \text{score}\ge 0{,}66\\
\text{media} & 0{,}40\le \text{score}<0{,}66\\
\text{baja} & \text{score}< 0{,}40
\end{cases}$$

donde el anillo de fondo es $(\,M\oplus B^{5\times5}_{(2)}\,)\setminus M$, es decir, la corona
inmediata que rodea al objeto. La normalización por $\Delta E=60$ y los pesos $0{,}65/0{,}35$ son
empíricos.

**Cómo debe leerse este número** (importante para el revisor): *no* es una probabilidad de que la
detección sea correcta, ni un valor calibrado contra verdad-terreno. Es un **índice ordinal de
evidencia** cuyo propósito es el triaje: ordenar los objetos de una tanda para que el operador
revise primero los dudosos. El sistema lo usa exactamente así — chips de color, columna ordenable,
filtro «solo baja confianza» y columnas `Confianza_nivel`/`Confianza_score` en el CSV (ADR-007/008).
Su validación formal (curva de calibración contra anotación manual) es trabajo pendiente y está
identificada como tal.

La misma forma funcional se aplica a los huecos candidatos a P/H (`detection.py:555-585`),
sustituyendo el anillo de fondo por el anillo de *objeto* que rodea al hueco.

### 3.10 Filtros de plausibilidad y el modo ROI

Sobre la lista de componentes se aplican tres reglas (`detection.py:900+`), todas ⚠ heurísticas
heredadas del motor JS original:

1. **Área mínima** `min_area` (por defecto 1000 px²).
2. **Dominancia**: se descartan componentes con área $<20\,\%$ del mayor — filtra la regla de
   escala, sombras sueltas y motas.
3. **Relevancia arqueológica**: reordenación que penaliza componentes pegados a esquina o borde
   (típicamente carta de color o escala).

El **modo ROI** (`roi_mode=True`, ADR-012/M1) desactiva las tres heurísticas de imagen completa
—recorte de franja de borde, dominancia y reordenación— porque contradicen el encuadre manual: en
un recorte trazado por el operador el objeto normalmente *toca* el borde, no hay referencias que
descartar y una lasca pequeña encuadrada a propósito no debe eliminarse por no ser dominante. Esto
formaliza el argumento central de ADR-013: **el ROI humano es un *prior* espacial, no un método
rival**; en la imagen real citada, encuadrar el artefacto llevó la detección de 8 fragmentos
espurios a 1 contorno limpio.

---
<a id="4-del-borde-al-contorno-extraccion-y-refinamiento"></a>

## §4. Del borde al contorno: extracción y refinamiento

> **Módulo:** `python/modules/contour.py` (633 líneas), endpoint `/api/contour`.
> El contorno $\mathcal{C}$ es **el objeto matemático central del sistema**: área, perímetro,
> circularidad, EFA, Procrustes y las métricas 3D por secciones cuelgan todas de él.

### 4.1 Trazado del borde

Se extraen los contornos externos de la máscara con el algoritmo de **seguimiento de bordes de
Suzuki y Abe** [Suzuki & Abe 1985], que es el que implementa `cv2.findContours`, en modo
`RETR_EXTERNAL` (solo la frontera exterior) y `CHAIN_APPROX_NONE` (**sin** compresión de cadena:
se conservan todos los píxeles del borde) — `contour.py:462`. Se retiene el contorno de mayor área.

La elección de `CHAIN_APPROX_NONE` es deliberada: la compresión estándar (`CHAIN_APPROX_SIMPLE`)
colapsa los tramos rectos a sus extremos, lo que alteraría el perímetro, la rugosidad y el muestreo
del EFA. El precio es un contorno de $O(P)$ puntos, que es exactamente lo que el resto del pipeline
necesita.

### 4.2 Depuración por coherencia cromático-geométrica

Filtro de confianza punto a punto (`contour.py:235-330`) que elimina píxeles de borde poco fiables
(similares al fondo, aislados, o flotando dentro de una zona homogénea). Para cada punto del
contorno se calcula un score compuesto sobre una vecindad $5\times5$:

$$S(p) \;=\; 0{,}35\,S_{\text{color}}(p)\;+\;0{,}50\,S_{\text{geom}}(p)\;+\;0{,}15\,S_{\text{unif}}(p)$$

$$
S_{\text{color}}=
\begin{cases}
\min\!\left(1,\ \dfrac{\lVert I(p)-\overline{I}_{\text{ext}}\rVert}{40}\right)
& \text{si } p \text{ tiene vecinos exteriores (borde real)}\\[2.2ex]
\max\!\left(0,\ 1-\dfrac{\lVert I(p)-\overline{I}_{\text{int}}\rVert}{150}\right)
& \text{si solo tiene vecinos interiores (punto flotante)}\\[2.2ex]
0 & \text{si está aislado}
\end{cases}
$$

$$S_{\text{geom}}=\frac{\#\{\text{8-vecinos que también son píxeles de borde}\}}{8},
\qquad
S_{\text{unif}}=1-\frac{\sqrt{\operatorname{Var}(I_{\text{int}})}}{50}$$

Se descartan los puntos con $S<0{,}20$; **si el filtro elimina más del 40 % del contorno se
devuelve el contorno original sin filtrar** (`contour.py:250`), salvaguarda que evita que un caso
patológico destruya la medición. La implementación es vectorial: los promedios y varianzas de
vecindad se obtienen por convolución con núcleo uniforme $5\times5$ restando la contribución del
centro (`contour.py:262-273`), lo que reduce el coste de $O(25N)$ accesos a dos pasadas de
`filter2D`.

Los pesos $0{,}35/0{,}50/0{,}15$ y los divisores $40/150/50$ son ⚠ heurísticos, heredados del motor
JS original y conservados por paridad numérica.

### 4.3 Refinamiento sub-píxel

`cv2.cornerSubPix` (`contour.py:494-502`) resuelve la condición de ortogonalidad: para el punto
buscado $q$, todo vector desde $q$ a un píxel vecino $p_i$ debe ser ortogonal a su gradiente
(si $p_i$ está en un borde recto que pasa por $q$, $\nabla I(p_i)\perp(p_i-q)$; si está en zona
uniforme, $\nabla I(p_i)\approx 0$). Minimizando

$$\sum_i \left[\nabla I(p_i)^{\!\top}(p_i-q)\right]^2
\;\Longrightarrow\;
\Big(\underbrace{\textstyle\sum_i \nabla I_i \nabla I_i^{\!\top}}_{G}\Big)\,q
=\sum_i \nabla I_i \nabla I_i^{\!\top} p_i
\;\Longrightarrow\;
q = G^{-1}\!\sum_i \nabla I_i \nabla I_i^{\!\top} p_i
$$

que se itera (ventana $3\times3$, criterio $\varepsilon=0{,}01$ o 30 iteraciones). La formulación es
la del operador de Förstner [Förstner & Gülch 1987] y la documenta OpenCV en los mismos términos
[Bradski 2000]. Aporta precisión típica del orden de $0{,}1$ px en bordes con gradiente definido.

### 4.4 *Gradient snap*: ajuste al máximo de gradiente

Cada punto se desplaza a lo largo de la **normal al contorno** hasta el máximo del módulo del
gradiente (`contour.py:72-232`). Sea $g=\lVert\nabla I\rVert$ el mapa de gradiente Sobel:

$$g(p)=\sqrt{(S_x * I)^2 + (S_y * I)^2},\qquad
S_x=\begin{pmatrix}-1&0&1\\-2&0&2\\-1&0&1\end{pmatrix},\quad S_y=S_x^{\!\top}$$

[Sobel & Feldman 1968, difundido por Duda & Hart 1973, pp. 271-272]. Para el punto $p_i$ con
tangente por diferencia central $t_i=(p_{i+1}-p_{i-1})/\lVert\cdot\rVert$ y normal exterior
$n_i = (t_{i,y},\,-t_{i,x})$, se muestrea el perfil

$$\Gamma_i(u)=g\big(p_i+u\,n_i\big),\qquad u\in[-2{,}0,\;+3{,}0]\ \text{px, paso } 0{,}5$$

con interpolación bilineal, y se desplaza $p_i \leftarrow p_i + u^{*} n_i$ donde $u^*$ maximiza
$\Gamma_i$ **sujeto a tres salvaguardas** introducidas por ADR-013 tras comprobar que, en piedra muy
texturizada, el máximo de gradiente dentro del rango era la textura interna y no la silueta
(la rugosidad medida subía un 25 % de forma espuria):

1. **Rango corto y asimétrico** ($-2{,}0$ hacia el interior, $+3{,}0$ hacia el fondo): la textura
   vive hacia adentro, así que se limita cuánto puede entrar el ajuste.
2. **Validación figura-fondo**: un pico solo se acepta si a $+2{,}0$ px adicionales *hacia el fondo*
   la máscara vale 0. Un pico con objeto a ambos lados es textura interna, no silueta.
3. **Puerta de prominencia**: $\Gamma_i(u^*)\ \ge\ 1{,}4\cdot\operatorname{med}_u \Gamma_i(u)$ — un
   perfil plano o ruidoso no dispara desplazamiento.

Además, el umbral mínimo de gradiente es adaptativo, $g_{\min}=\max(2,\,q_{10}\{g>1\})$
(`contour.py:132-137`), y en imágenes de bajo contraste (rango $P_{90}-P_{10}<30$) se aplica CLAHE
antes del Sobel. Finalmente se comprueba que el punto desplazado siga dentro de la máscara.

Conceptualmente, el *gradient snap* es un **paso único y restringido de contorno activo**: la
misma energía de atracción al borde $-\lVert\nabla I\rVert^2$ que gobierna las *snakes*
[Kass, Witkin & Terzopoulos 1988], pero resuelta punto a punto con soporte acotado en vez de por
minimización global — decisión de robustez, ya que evita la sensibilidad de las *snakes* a la
inicialización y a los mínimos locales.

**Suavizado posterior.** Dos iteraciones del núcleo binomial

$$p_i \leftarrow \tfrac14 p_{i-1}+\tfrac12 p_i+\tfrac14 p_{i+1}$$

que es un filtro paso bajo de respuesta $H(\omega)=\cos^{2}(\omega/2)$ por iteración, es decir, un
paso explícito de la ecuación del calor sobre la curva (flujo de acortamiento discreto). Su efecto
de contracción es cuantificable y despreciable para contornos densos: sobre un círculo de $N$ puntos
el radio se multiplica por $\tfrac12(1+\cos\tfrac{2\pi}{N})\approx 1-\pi^2/N^2$, esto es,
$4\times10^{-5}$ de contracción relativa para $N=500$ puntos y dos iteraciones. En cambio atenúa
fuertemente las componentes de alta frecuencia (dentado de un píxel), que es el objetivo.

### 4.5 Simplificación Douglas–Peucker

Para la representación visual se aplica el algoritmo de **Douglas y Peucker**
[Douglas & Peucker 1973] con tolerancia adaptativa (`contour.py:516-527`):

$$\varepsilon = \min\big(\text{tol},\ \max(0{,}5,\ 0{,}001\,P)\big)\ \text{px}$$

**⚙ Convención MAO / punto crítico para el revisor:** las métricas se calculan sobre el contorno
**completo** (`points`), *no* sobre el simplificado (`points_visual`), que solo alimenta el lienzo
(`contour.py:614-615`). Esto es esencial porque el perímetro de una curva discreta depende de la
escala de medida —la *paradoja de la costa* [Mandelbrot 1967]— y una simplificación distinta
produciría perímetros distintos y, con ellos, circularidades distintas. Fijar la representación
métrica al contorno completo hace el número **reproducible**, aunque lo ate a la resolución del
ráster: dos fotografías de la misma pieza a resoluciones muy distintas darán perímetros ligeramente
distintos (efecto acotado por el suavizado del §4.4 y cuantificado en la dimensión fractal, §5.9).

### 4.6 Validación topológica

El polígono resultante se valida con Shapely (`contour.py:552-560`): si no es *simple* (tiene
auto-intersecciones) se intenta la reparación canónica `buffer(0)`, que reconstruye la geometría
por unión de sus anillos según el modelo OGC *Simple Features*. El resultado se reporta en el campo
`is_valid`. Existe además una salvaguarda aguas abajo: si el centroide de Shoelace cae **fuera** de
la envolvente convexa —síntoma inequívoco de auto-intersección—, `metrics.py:545-549` conmuta al
centroide aritmético, evitando que radios y métricas radiales se corrompan.

### 4.7 Calidad geométrica ≠ confianza de detección

El endpoint devuelve dos indicadores distintos que conviene no confundir (`contour.py:569-593`):

| Indicador | Definición | Qué mide |
|---|---|---|
| `quality.score` | $\min(1,\ A_r/A_{\text{bbox}})$, con cortes 0,8 / 0,6 / 0,4 | **llenado** del rectángulo envolvente: geometría del contorno obtenido |
| `detection_confidence` | §3.9 (contraste de borde + extent) | **evidencia** de que ese contorno corresponde a un objeto real |

Un contorno puede tener calidad geométrica alta y confianza baja (una sombra bien definida) o al
revés (una pieza estrellada bien detectada). El sistema los reporta por separado en todos los
canales de salida.

### 4.8 Nota sobre determinismo

El pipeline es determinista salvo por dos elementos: (i) GrabCut (§3.6), y (ii) la dependencia de
`_build_binary_mask` respecto del recorte, ya que el color de fondo se estima desde los bordes de la
región suministrada. ADR-013 F2 documenta que esto último produce variaciones de hasta $\pm20\,\%$
en el contorno según el ROI elegido y define el criterio de aceptación de la corrección
(invariancia $\le 2\,\%$ frente a cambio de ROI y de modo). **Es la brecha de reproducibilidad
abierta más relevante del sistema** y se declara como tal en §13.

---
<a id="5-glosario-matematico-de-metricas-2d"></a>

## §5. Glosario matemático de métricas 2D

> **Módulo:** `python/modules/metrics.py` (1130 líneas), endpoint `/api/metrics`.
> ~55 indicadores agrupados en 30 familias. El motor JS `js/modules/morphometric-metrics.js`
> reproduce las mismas fórmulas como respaldo.
> **Convenio de lectura de las tablas:** la columna **Inv. T/R/E** indica invariancia ante
> Traslación / Rotación / Escala; «✓✓✓» significa invariante ante las tres.

### 5.1 ⚙ Convención MAO fundamental: la forma canónica es la envolvente convexa

Esta es **la decisión que un revisor externo debe conocer antes que ninguna otra**, porque cambia el
significado de los dos números más citados de cualquier informe morfométrico.

En MAO Plus, las claves primarias `area` y `perimeter` **no** son el área y el perímetro del contorno
medido, sino los de su **envolvente convexa** (`metrics.py:559-595`):

$$\texttt{area} \equiv A_h,\qquad \texttt{perimeter}\equiv P_h,
\qquad\text{mientras que}\qquad
\texttt{area\_real}=\texttt{area\_fragmentada}\equiv A_r,\quad
\texttt{perimeter\_real}\equiv P_r$$

**Justificación arqueológica.** El objeto de estudio no es el fragmento tal como llegó, sino —cuando
la pregunta es tipológica o de estandarización de producción— la **forma completa estimada**. En una
cuenta con una mella o un ornamento con una fractura de borde, $A_h$ estima la forma original y
$A_r$ mide la conservación; la diferencia entre ambas **es** el dato de conservación, y se reporta
como tal (solidez, pérdida por fragmentación, completitud). La alternativa —reportar solo $A_r$—
mezcla forma y estado de conservación en un único número.

**Consecuencia para la comparabilidad (crítica).** La práctica estándar del campo —`regionprops` de
scikit-image, ImageJ, ISO 9276-6 [ISO 2008]— reporta el área y el perímetro **del contorno**. Por
tanto:

- `area` de MAO **no** es comparable directamente con el `area` de esas herramientas: la
  correspondencia es `area_real` ↔ `regionprops.area`.
- `circularity` de MAO se calcula sobre la envolvente, por lo que **siempre** es mayor o igual que la
  circularidad estándar; su homóloga literal es `circularity_fragmentada`.
- Para objetos convexos (cuentas completas, discos, la mayoría de los casos limpios) ambas
  coinciden, y por eso los tests de valores analíticos (§12) pasan con tolerancia del 3 %.

Recomendación documental: en cualquier publicación derivada, declarar explícitamente la convención y
—si se compara con datos de otras herramientas— usar el par `area_real`/`perimeter_real`.

### 5.2 Geometría base: área, perímetro y centroide

**Área por la fórmula del agrimensor** (Shoelace, corolario del teorema de Green)
[Braden 1986] — `metrics.py:61-67`:

$$A=\frac{1}{2}\left|\sum_{i=0}^{N-1}\big(x_i y_{i+1}-x_{i+1}y_i\big)\right|
=\frac12\left|\oint_{\mathcal{C}} (x\,dy-y\,dx)\right|$$

Es **exacta** para cualquier polígono simple (no aproximada), de coste $O(N)$ y numéricamente
estable si se centran las coordenadas. El área con signo $A_{\pm}=\frac12\sum(\cdots)$ codifica
además la orientación del recorrido, que el código usa para el centroide.

**Perímetro** — `metrics.py:70-73`: $P=\sum_{i} \lVert p_{i+1}-p_i\rVert_2$.

**Centroide de área** (no de vértices) — `metrics.py:76-92`:

$$c_x=\frac{1}{6A_{\pm}}\sum_i (x_i+x_{i+1})(x_i y_{i+1}-x_{i+1}y_i),\qquad
c_y=\frac{1}{6A_{\pm}}\sum_i (y_i+y_{i+1})(x_i y_{i+1}-x_{i+1}y_i)$$

con salvaguarda a la media aritmética si $|A_{\pm}|<10^{-10}$ o si el centroide cae fuera de la
envolvente (§4.6). La distinción área-vs-vértices importa: el centroide de vértices está sesgado
hacia las zonas de muestreo denso, y el contorno de MAO tiene densidad de muestreo desigual tras el
refinamiento.

MAO mantiene **dos referencias posicionales** (`metrics.py:529-551`) y las usa consistentemente:

| Referencia | Cálculo | Usos |
|---|---|---|
| $c$ (CR) | centroide de área del contorno real | posición reportada, simetría bilateral |
| $c^{\mathcal H}$ (CH) | centroide de área de la envolvente | ejes de inercia, orientación, radios extremos |

El motivo de usar $c^{\mathcal H}$ para los ejes es que representa la forma completa estimada y
siempre cae dentro del polígono convexo, por lo que no requiere la validación `pointPolygonTest`
que sí necesita $c$.

### 5.3 Envolvente convexa

Se calcula con `scipy.spatial.ConvexHull` (`metrics.py:95-110`), que implementa **Quickhull**
[Barber, Dobkin & Huhdanpää 1996]; en las rutas OpenCV se usa `cv2.convexHull`, que implementa el
algoritmo de **Sklansky** para polígonos simples [Sklansky 1982]. Ambos producen el mismo conjunto
de vértices extremos. En 2D, `ConvexHull.volume` es el área encerrada.

$$\mathcal{H}=\operatorname{conv}(\mathcal{C})
=\Big\{\textstyle\sum_i \lambda_i p_i \;:\; \lambda_i\ge0,\ \sum_i\lambda_i=1\Big\}$$

Propiedad usada implícitamente en todo el sistema: $A_r\le A_h$ y $P_h\le P_r$, con igualdad si y
solo si $\mathcal{C}$ es convexo. De ahí que solidez $\le 1$ y convexidad $\le 1$.

### 5.4 Caja envolvente y relación de aspecto

| Clave | Fórmula | Rango | Inv. T/R/E | Código |
|---|---|---|---|---|
| `tight_bounding_width_px` / `height` | $w=\max x-\min x$, $h=\max y-\min y$ **sobre $\mathcal{H}$** | $>0$ px | ✓✗✗ | `metrics.py:554-557` |
| `aspect_ratio_tight` (= `aspect_ratio_original`) | $w/h$ | $(0,\infty)$ | ✓**✗**✓ | `metrics.py:598-600` |
| `bounding_width` / `bounding_height` | alias en mm de los anteriores | — | — | `metrics.py:1020-1021` |

> **⚠ Observación O-5 (inconsistencia contrato ↔ implementación).** El registro canónico (ADR-006)
> declara la métrica `aspect_ratio` como de **nivel H** (invariante ante rotación) y con fórmula
> «eje_mayor / eje_menor», pero apunta su `fuente_2d` a la clave `aspect_ratio_tight`, que es el
> cociente del **rectángulo alineado a los ejes de la imagen** y por tanto **no es invariante a la
> rotación**. La propia suite lo reconoce: `test_estandar_matematico.py` excluye explícitamente
> `aspect_ratio_tight` de la prueba de invariancia rotacional. El test del registro
> (`test_morphometric_registry.py`) verifica la coherencia de las *banderas declaradas*, no el
> comportamiento numérico, de modo que la discrepancia no se detecta automáticamente.
> **Remedio propuesto:** redirigir `fuente_2d` a un cociente invariante —`eje_mayor/eje_menor` (ya
> calculado) o `1/feret_ratio`— o reclasificar la métrica fuera del nivel H. Es un cambio de una
> línea en el registro más el test numérico de invariancia correspondiente.

Para una relación de aspecto invariante, el sistema ya dispone de dos alternativas correctas:
$\text{eje\_mayor}/\text{eje\_menor}$ (§5.8) y $1/\texttt{feret\_ratio}$ (§5.9).

### 5.5 Familia de circularidad — y su redundancia algebraica

La circularidad de **Cox** [Cox 1927], también llamada *forma factor* o *isoperimetric quotient*,
mide cuánto se aproxima la forma al círculo y deriva directamente de la desigualdad isoperimétrica
$4\pi A\le P^2$:

$$\boxed{\ \texttt{circularity}=\frac{4\pi A_h}{P_h^{2}}\in(0,1]\ }\qquad(\texttt{metrics.py:603})$$

con valor 1 exclusivamente para el círculo y $\pi/4\approx0{,}7854$ para el cuadrado (ambos
verificados como *known-answer tests*, §12).

**Aquí aparece la observación más relevante para quien vaya a usar el vector métrico en análisis
multivariante.** Las cuatro claves siguientes **no son cuatro descriptores**, sino **uno solo**
reescrito:

| Clave | Fórmula implementada | Relación con $c\equiv\texttt{circularity}$ |
|---|---|---|
| `circularity` | $4\pi A_h/P_h^2$ | $c$ |
| `compactness` | $A_h/(\pi r^2)$ con $r=P_h/2\pi$ | $=\dfrac{A_h}{\pi P_h^2/4\pi^2}=\dfrac{4\pi A_h}{P_h^2}= c$ — **idéntica** |
| `shape_factor` | $P_h^2/(4\pi A_h)$ | $=1/c$ |
| `indice_lobularidad` | $P_h\big/\big(2\pi\sqrt{A_h/\pi}\big)$ | $=\sqrt{P_h^2/(4\pi A_h)}=c^{-1/2}$ |

y análogamente en la rama del contorno real, donde
$\texttt{contour\_complexity\_index}=P_r/(2\pi\sqrt{A_r/\pi})=c_{\text{frag}}^{-1/2}$ y
$\texttt{compactness\_fragmentada}=\texttt{circularity\_fragmentada}=c_{\text{frag}}$.

> **⚠ Observación O-6.** La familia tiene **dos grados de libertad reales** ($c$ y $c_{\text{frag}}$),
> no seis. No es un error de cálculo —cada fórmula es correcta y cada nombre tiene tradición en un
> subcampo distinto (`compactness` en análisis de partículas, `shape factor` en ingeniería,
> `lobularidad` en morfología descriptiva)— pero tiene dos consecuencias prácticas: (i) en el informe
> se presentan como indicadores independientes cuando son transformaciones monótonas entre sí;
> (ii) **en un PCA, incluir las cuatro introduce colinealidad perfecta**, lo que infla artificialmente
> la varianza explicada por la primera componente y distorsiona las cargas. Esto es exactamente la
> brecha C2 de ADR-015 («selección de métricas independientes», control de VIF). **Remedio:** marcar
> las derivadas en el registro con un campo `derivada_de` y excluirlas por defecto del *pool*
> multivariante; en el informe descriptivo pueden conservarse por legibilidad.

Interpretación por cortes (⚠ heurística, `metrics.py:972-1000`): circular $\ge0{,}85$,
subcircular $\ge0{,}70$, subelíptica $\ge0{,}55$, alargada $\ge0{,}40$, muy alargada por debajo.

### 5.6 Solidez, convexidad y estado de conservación

| Clave | Fórmula | Rango | Inv. T/R/E | Código |
|---|---|---|---|---|
| `solidity` | $A_r/A_h$ | $(0,1]$ | ✓✓✓ | `metrics.py:622` |
| `convexity` (= `convexity_real`) | $\min(P_h/P_r,\,1)$ | $(0,1]$ | ✓✓✓ | `metrics.py:962-963` |
| `concavidad_area_percent` | $100\,(A_h-A_r)/A_h$ | $[0,100)$ | ✓✓✓ | `metrics.py:573` |
| `concavidad_perimetro_percent` | $100\,(P_r-P_h)/P_h$ | $[0,\infty)$ | ✓✓✓ | `metrics.py:578` |
| `indice_convexidad_percent` | $0{,}4\cdot 100\,\text{conv}+0{,}6\cdot100\,\text{sol}$ | $[0,100]$ | ✓✓✓ | `metrics.py:1050` |

**Solidez** y **convexidad** son los dos descriptores de concavidad canónicos del análisis de
partículas [Blott & Pye 2008, tabla 2; ISO 9276-6]. Su combinación discrimina el *tipo* de
concavidad: una mella profunda y estrecha baja mucho la convexidad (perímetro) y poco la solidez
(área); una fractura amplia hace lo contrario.

Nótese la relación exacta $\texttt{concavidad\_area\_percent}=100\,(1-\texttt{solidity})$: otra
reescritura, no un dato nuevo. La clave anterior `perdida_area_fragmentacion_percent` se conserva
como **alias de lectura deprecado** con el mismo valor.

> **✔ Observación O-7 (signo) — resuelta aguas arriba mientras se redactaba esta memoria.** La
> versión anterior reportaba `perdida_perimetro_fragmentacion_percent` $=100\,(P_h-P_r)/P_h$, que
> como $P_h\le P_r$ siempre (§5.3) es **cero o negativa** por construcción: un contorno con mellas
> tiene *más* perímetro que su envolvente, no menos. ADR-017 F0 (commit `3a43f92`, 2026-09-12)
> corrigió el signo y renombró el campo a `concavidad_perimetro_percent` $=100\,(P_r-P_h)/P_h$ —
> exactamente el remedio que esta revisión iba a proponer, encontrado de forma independiente. La
> clave antigua **no** se aliasó, precisamente porque su valor carecía de significado.

**Del rótulo «completitud» al índice de convexidad (ADR-017 F0).** Hasta `3a43f92` este bloque
emitía `completitud_estimada`, `completitud_metodo_convexidad` y `completitud_es_fragmento`. La
*medición* era fiel —la media ponderada $0{,}4$ convexidad $+\ 0{,}6$ solidez, ambas canónicas— pero
el *rótulo* inferÍa integridad a partir de la convexidad, y **la convexidad no observa fractura**:
una pieza lunada, denticulada o anular íntegra es cóncava por manufactura. El efecto era el que
cabía esperar: toda pieza redonda entera se reportaba como fragmento (el *extent* de un círculo es
$\pi/4=78{,}5\,\%$, por debajo del corte de 85). El campo se conserva con el nombre que describe lo
que realmente calcula, `indice_convexidad_percent`. Sigue siendo ⚠ heurístico —los pesos
$0{,}4/0{,}6$ son criterio experto— y debe leerse como índice de triaje.

El diagnóstico de completitud lo aporta ahora la vía que sí puede sostenerlo: **ajuste contra
plantilla ideal** (ADR-017 **F1**, `python/modules/shape_template.py`, endpoint
`POST /api/shape-match`). Se ajusta un modelo paramétrico —círculo por Kåsa (1976), elipse por
Halíř & Flusser (1998)— **sólo al margen original** del contorno, aislado del borde de fractura por
contigüidad del arco de inliers bajo RANSAC; la completitud es entonces la fracción de la longitud
de arco de esa plantilla que el margen preservado cubre, medida **alrededor del centro ajustado**:

$$\texttt{plantilla\_completitud}=100\;\Bigl(1-\frac{\sum_k \ell(\text{hueco}_k)}{L_{\text{plantilla}}}\Bigr)$$

La referencia importa más que la fórmula. Medir esa cobertura alrededor del **centroide del
fragmento** —lo que hacía el estimador retirado— es degenerado: todo contorno cerrado lo rodea 360°
por construcción. Alrededor del centro *ajustado* no: en un medio disco ese centro cae sobre la
cuerda de fractura, **fuera** del fragmento, y la cobertura vale 180°.

Envolvente operativa medida (`python/tests/test_shape_template.py`): error ≤ 1 punto porcentual
entre el 25 % y el 100 % preservado; por debajo del umbral de soporte **rechaza** la plantilla en
vez de estimar, y rechaza también la plantilla equivocada. El resultado se publica como
`es_fragmento_candidato` —sugerencia a confirmar, no veredicto— porque en lítica la fractura se
diagnostica por atributos de la cara ventral, no por la silueta (§ invariante ADR-009/ADR-017 §7).

**Calibración de ese umbral, y tres advertencias para quien cite el número** (ADR-017 F4,
`docs/VALIDACION-PLANTILLAS.md`; banco de 87 formas de completitud exacta × 3 niveles de ruido de
contorno + 15 controles negativos):

1. **El suelo no es un valor fijo: depende del ruido de contorno.** Con contorno limpio la medición
   sigue siendo correcta hasta ~20 % preservado; con segmentación pobre (≈2,5 px de ruido) el suelo
   sube al 40-50 %. La frase «rechaza por debajo del 15 %» sólo es cierta con los umbrales
   recalibrados en F4 (soporte mínimo 0,40 círculo · 0,50 elipse) y sólo como resultado de ese
   banco: con los umbrales anteriores se aceptaba el **22 %** de las formas por debajo del 15 %.
2. **La elipse fragmentaria se sobreestima, y tanto más cuanto menos arco queda** (30 % real →
   40-43 % medido). Es mecánico: con poco arco el mejor ajuste es una elipse *más pequeña* que la
   original, de modo que la fracción cubierta **de esa elipse** resulta mayor. Por debajo del 50 %
   preservado, la completitud de una elipse debe leerse como **cota superior**.
3. **La plantilla ANILLO** (corona circular, ADR-017 F6) cubre la cuenta perforada rota por el
   orificio, que el círculo no puede explicar: se queda con el margen exterior y manda el borde de
   la perforación al residuo de fractura. Son dos circunferencias **concéntricas** cuya razón
   $r/R$ se **estima del contorno** —no se fija—, y por eso no puede ir por el ICP del repertorio:
   una semejanza (Umeyama 1991) mueve escala, rotación y traslación, pero $r/R$ es un parámetro de
   *forma*. La completitud es entonces la cobertura de la longitud de arco de **las dos**
   circunferencias, ponderada por su propio perímetro:
   $$\texttt{completitud}_{\text{anillo}}=\frac{c_{\text{ext}}\,R+c_{\text{int}}\,r}{R+r}$$
   Medido sobre sectores de corona: 75 → 75,5 · 60 → 60,5 · 50 → 50,6 · 40 → 40,8 · 30 → 30,8 %.
4. **Lo verificado es autoconsistencia, no acuerdo con un observador.** El banco compara contra
   formas generadas con completitud impuesta. La concordancia con el juicio de un arqueólogo sobre
   piezas reales —ICC de acuerdo absoluto, Bland-Altman, κ del tipo de plantilla— está
   instrumentada (`tools/adr017_calibracion_draga.py`) pero **aún no ejecutada**: hasta entonces,
   `plantilla_completitud` es una medida reproducible de validez de uso no establecida.

Esta corrección es un buen ejemplo del criterio que recorre todo el sistema y que conviene que el
revisor conozca: **se conserva la medición y se retira el rótulo que diagnostica de más**
(precedente ADR-016 #6). Donde no hay dato se dice «sin evaluar», nunca un 100 % fabricado.

### 5.7 Rectangularidad

$$\texttt{rectangularity}=\frac{A_r}{A_{\text{bbox}}},\qquad
\texttt{rectangularity\_hull}=\frac{A_h}{A_{\text{bbox}}}
\qquad(\texttt{metrics.py:617-619})$$

con $A_{\text{bbox}}$ el rectángulo **alineado a los ejes** de la envolvente. Las claves
`rectangularity_fragmentada` y `bounding_box_efficiency` contienen **el mismo número** que
`rectangularity` (`metrics.py:619, 633`).

> **⚠ Observación O-8.** La rectangularidad canónica de la literatura usa el **rectángulo de área
> mínima** (rotado), lo que la hace invariante a la rotación y le da la interpretación de «cuánto
> se parece la forma a *un* rectángulo» [Rosin 2003, §4]. Con el rectángulo alineado a los ejes, la
> métrica mide «cuánto llena la forma su caja de imagen» y **depende de la orientación de la toma**:
> un mismo rombo girado 45° cambia de valor. OpenCV ya expone `minAreaRect`, de modo que el remedio
> es de baja dificultad. Mientras tanto, la métrica debe interpretarse como *extent* (llenado de
> caja), que es como la define ISO 9276-6, y no como rectangularidad en el sentido de Rosin.

### 5.8 Ejes principales: tensor de inercia de área

El bloque más denso matemáticamente (`metrics.py:122-172`). Se calculan los **momentos centrales de
área normalizados** de segundo orden del polígono, por integración exacta vía teorema de Green
[Steger 1996]:

$$\mu_{20}=\frac{1}{A}\iint_{\Omega} x^2\,dA
=\frac{1}{12A}\sum_i (x_i^2+x_i x_{i+1}+x_{i+1}^2)\,\chi_i,\qquad
\chi_i \equiv x_i y_{i+1}-x_{i+1} y_i$$

$$\mu_{02}=\frac{1}{12A}\sum_i (y_i^2+y_i y_{i+1}+y_{i+1}^2)\,\chi_i,\qquad
\mu_{11}=\frac{1}{24A}\sum_i \big(2x_iy_i+2x_{i+1}y_{i+1}+x_iy_{i+1}+x_{i+1}y_i\big)\chi_i$$

(las coordenadas se centran previamente en $c^{\mathcal{H}}$). Obsérvese que son **integrales
exactas sobre el área del polígono**, no sumas sobre los vértices: es la implementación correcta y
coincide con la definición de momentos de Hu [Hu 1962] restringida a segundo orden.

El **tensor de inercia** $\mathbf{M}=\begin{pmatrix}\mu_{20}&\mu_{11}\\ \mu_{11}&\mu_{02}\end{pmatrix}$
es simétrico definido positivo; sus autovalores y su eje principal son

$$\lambda_{1,2}=\frac{\operatorname{tr}\mathbf{M}\pm\sqrt{(\operatorname{tr}\mathbf{M})^2-4\det\mathbf{M}}}{2},
\qquad
\theta=\operatorname{atan2}\!\big(\lambda_1-\mu_{20},\ \mu_{11}\big)$$

(forma equivalente a la clásica $\theta=\tfrac12\operatorname{atan2}(2\mu_{11},\mu_{20}-\mu_{02})$,
pero numéricamente más estable cerca de la degeneración). El discriminante se satura a $\ge0$ para
blindar el caso isótropo.

**Ejes mayor y menor.** ⚙ **Convención MAO:** no son los semiejes de la elipse equivalente
($2\sqrt{\lambda_i}$), sino la **extensión de la proyección del contorno** sobre cada dirección
principal (`metrics.py:162-167`):

$$\text{eje}_{\text{mayor}}=\max_i \pi_1(p_i)-\min_i \pi_1(p_i),\qquad
\pi_1(p)=\langle p-c,\ u_1\rangle$$

Es decir, la *anchura del calibre* en las direcciones principales — más cercano a lo que un
arqueólogo mide con un pie de rey que el eje de la elipse de inercia. Para una elipse ambas
definiciones coinciden en su cociente, y de ahí que la validación cruzada contra
`skimage.regionprops` (§12) concuerde dentro de 0,03.

| Clave | Fórmula | Rango | Inv. T/R/E | Nota |
|---|---|---|---|---|
| `excentricidad` | $\sqrt{1-(\text{eje}_{\text{menor}}/\text{eje}_{\text{mayor}})^{2}}$ | $[0,1]$ | ✓✓✓ | por extensiones |
| `excentricidad_eliptica` | $\sqrt{1-\lambda_2/\lambda_1}$ | $[0,1]$ | ✓✓✓ | por autovalores |
| `elongation` | $\left|1-\text{eje}_{\text{menor}}/\text{eje}_{\text{mayor}}\right|$ | $[0,1)$ | ✓✓✓ | elipse $a{:}b=2{:}1\Rightarrow 0{,}5$ |
| `elongacion_inercia` | $\sqrt{\lambda_1/\lambda_2}$ | $[1,\infty)$ | ✓✓✓ | $=\texttt{isotropia}^{-1/2}$ |
| `isotropia_inercial` | $\lambda_2/\lambda_1$ | $(0,1]$ | ✓✓✓ | — |
| `eje_principal_anisotropia` | $(\lambda_1-\lambda_2)/(\lambda_1+\lambda_2)$ | $[0,1]$ | ✓✓✓ | índice de Fisher |
| `angulo_eje_principal` | $\theta \bmod 180°$ | $[0,180)$ | ✓✗✓ | orientación en la toma |
| `radio_giro_mayor` | $\sqrt{\lambda_1}$ | $>0$ | ✓✓✗ | px o mm (dimensional) |

De nuevo hay dependencias exactas: `excentricidad_eliptica` $=\sqrt{1-\texttt{isotropia}}$ y
`elongacion_inercia` $=\texttt{isotropia}^{-1/2}$; y `elongation` es función monótona de
`excentricidad`. Solo dos de las siete filas son informativamente independientes de las otras.

El **ángulo del eje principal** no es invariante a la rotación por definición (mide la orientación
de la pieza en la fotografía) y por eso **no pertenece al núcleo canónico**; se reporta para
documentar la toma y para la comparación bifacial (§9), donde la diferencia de ángulos entre caras
sí es significativa.

### 5.9 Diámetros de Feret

Barrido de calibre (*rotating calipers*) en 90 direcciones equiespaciadas sobre $[0,\pi)$,
$\Delta=2°$ (`metrics.py:288-310`; idéntico en `ph.py:100-120`), evaluado **sobre la envolvente**:

$$F(\alpha)=\max_i\langle p_i,u_\alpha\rangle-\min_i\langle p_i,u_\alpha\rangle,\quad
u_\alpha=(\cos\alpha,\sin\alpha)$$
$$\texttt{feret\_max}=\max_\alpha F(\alpha),\qquad
\texttt{feret\_min}=\min_\alpha F(\alpha),\qquad
\texttt{feret\_ratio}=\frac{\texttt{feret\_min}}{\texttt{feret\_max}}\in(0,1]$$

$F(\alpha)$ es la **anchura de soporte** del cuerpo convexo; su máximo es el diámetro (la mayor
distancia entre dos puntos) y su mínimo la anchura mínima [Feret 1930, difundido por Walton 1948;
algoritmo exacto en Toussaint 1983].

**Error de discretización acotado.** El máximo verdadero se alcanza en alguna dirección $\alpha^*$ a
lo sumo a $\Delta/2=1°$ de una dirección muestreada; como la proyección de la cuerda maximizante
sobre la dirección muestreada vale $F\cos(\le 1°)$, el sesgo relativo por defecto está acotado por

$$1-\cos(1°)=1{,}52\times10^{-4}\;=\;0{,}015\,\%$$

es decir, dos órdenes de magnitud por debajo del error óptico (§2) y del error de segmentación. Para
`feret_min` la cota es del mismo orden pero por exceso. La discretización a 2° es, por tanto,
**numéricamente inocua**, y conviene dejarlo escrito porque es una pregunta frecuente en revisión.

`feret_ratio` es el descriptor de elongación preferible del sistema: adimensional, invariante a las
tres transformaciones y sin la ambigüedad de convención de `aspect_ratio_tight` (O-5).

---
### 5.10 Radios extremos, regularidad radial y estrellamiento

Referidos siempre al centroide de la envolvente $c^{\mathcal H}$ (`metrics.py:314-353`):

$$R_{\max}=\max_{v\in\mathcal{H}}\lVert v-c^{\mathcal H}\rVert,\qquad
R_{\min}=\min_{e\in \text{aristas}(\mathcal H)} \operatorname{dist}\!\big(c^{\mathcal H},e\big)$$

$R_{\min}$ es la distancia perpendicular mínima del centroide a las **aristas** del polígono
convexo (proyección con recorte a $[0,1]$ del parámetro de la arista), no a sus vértices: es el
radio de la mayor circunferencia inscrita centrada en el centroide. Las estadísticas radiales, en
cambio, se calculan sobre **todos los puntos del contorno real**:

$$\bar R=\frac1N\sum_i \lVert p_i-c^{\mathcal H}\rVert,\qquad
\sigma_R=\sqrt{\tfrac1N\textstyle\sum_i(\lVert p_i-c^{\mathcal H}\rVert-\bar R)^2}$$

| Clave | Fórmula | Rango | Inv. T/R/E | Nota |
|---|---|---|---|---|
| `ratio_radios` | $R_{\min}/R_{\max}$ | $[0,1]$ | ✓✓✓ | — |
| `regularidad_radial` | $100\,R_{\min}/R_{\max}$ | $[0,100]$ | ✓✓✓ | mismo número $\times100$ |
| `coeficiente_variacion_radial` | $100\,\sigma_R/\bar R$ | $[0,\infty)$ | ✓✓✓ | CV de la función radial |
| `indice_estrellamiento` | $(R_{\max}-R_{\min})/\bar R$ | $[0,\infty)$ | ✓✓✓ | ver nota de coherencia |
| `radio_maximo`, `radio_minimo`, `radio_medio`, `desviacion_radial` | — | $>0$ | ✓✓✗ | dimensionales (mm/px) |

> **Nota de coherencia.** `indice_estrellamiento` combina extremos calculados sobre la **envolvente**
> ($R_{\max},R_{\min}$) con una media calculada sobre el **contorno real** ($\bar R$). Es defendible
> —el numerador describe la forma completa y el denominador la escala efectiva— pero conviene
> declararlo, porque para un contorno muy mellado ambos conjuntos difieren y el índice no admite la
> lectura ingenua «rango relativo de la función radial». La versión homogénea sería
> $(\max_i R_i-\min_i R_i)/\bar R$ sobre el mismo conjunto de puntos.

En la literatura de análisis de partículas, la función radial $R(\phi)$ y su CV son el descriptor
clásico de irregularidad de contorno [Blott & Pye 2008], y su desarrollo de Fourier es el
antecedente directo del EFA (§6).

### 5.11 Curvatura local (Menger) y energía de curvatura

Para cada terna de puntos consecutivos $(p_{i-1},p_i,p_{i+1})$ se calcula la **curvatura de Menger**
—el inverso del radio de la circunferencia que pasa por los tres puntos— (`metrics.py:223-264`):

$$\kappa_i=\frac{4\,\mathcal{A}(p_{i-1},p_i,p_{i+1})}{\lVert p_i-p_{i-1}\rVert\;\lVert p_{i+1}-p_i\rVert\;\lVert p_{i-1}-p_{i+1}\rVert}
=\frac{1}{R_{\text{circun}}}$$

donde $\mathcal A$ es el área del triángulo. La identidad con el circunradio, $R=abc/4\mathcal A$, es
elemental; la curvatura de Menger es el objeto estándar en teoría geométrica de la medida para
definir curvatura sin diferenciabilidad [Léger 1999].

| Clave | Fórmula | Unidad | Inv. T/R/E |
|---|---|---|---|
| `curvatura_media` | $\bar\kappa$ | px$^{-1}$ | ✓✓**✗** |
| `curvatura_maxima` | $\max_i\kappa_i$ | px$^{-1}$ | ✓✓✗ |
| `curvatura_desviacion` | $\sigma_\kappa$ | px$^{-1}$ | ✓✓✗ |
| `curvatura_puntos_inflexion` | $\#\{\kappa_i>\bar\kappa+2\sigma_\kappa\}$ | conteo | ✓✓✗ |
| `curvatura_puntos_esquina` | $\#\{\kappa_i>\bar\kappa+3\sigma_\kappa\}$ | conteo | ✓✓✗ |
| `energia_curvatura` | $\frac1M\sum_i \kappa_i^2$ | px$^{-2}$ | ✓✓✗ |

**Tres precisiones necesarias para el revisor:**

1. **La curvatura tiene dimensiones de $1/$longitud**, luego **no es invariante a escala** y el
   registro canónico la clasifica correctamente como métrica de nivel 2D
   (`morphometric_registry.py:316-324`), aunque su campo `unidad` la anote como «adimensional»,
   detalle que conviene corregir por higiene documental (O-9).
2. **Depende del muestreo.** Con puntos consecutivos separados $\sim1$ px, $\kappa_i$ mide la
   curvatura del *dentado del ráster* más que la de la silueta. La cantidad geométricamente estable
   sería $\kappa$ estimada a paso de arco fijo $\delta$ (p. ej. $\delta = P/200$), o el ajuste local
   de circunferencia por mínimos cuadrados. El suavizado del §4.4 mitiga el efecto pero no lo
   elimina.
3. **`puntos_inflexion` no cuenta inflexiones.** Una inflexión es un cambio de **signo** de la
   curvatura, y $\kappa_i$ aquí es **no signada** (usa $|\mathcal A|$). Lo que se cuenta son
   *atípicos de curvatura alta* a $2\sigma$. El remedio es directo: usar el producto vectorial
   $\operatorname{sgn}\big((p_i-p_{i-1})\times(p_{i+1}-p_i)\big)$ para signar $\kappa_i$ y contar
   los cambios de signo. Mientras tanto, el campo debe leerse como «puntos de curvatura anómala».

La **energía de curvatura** es el análogo discreto de la energía elástica de flexión
$E=\int_{\mathcal C}\kappa^2\,ds$ (elástica de Euler), pero implementada como **media aritmética
sobre ternas** y no como integral respecto del arco; ambas coinciden solo si el muestreo es
equiespaciado. Con muestreo denso y aproximadamente uniforme (que es el caso tras
`CHAIN_APPROX_NONE`) la diferencia es pequeña.

### 5.12 Rugosidad del contorno

$$\texttt{rugosidad\_contorno}=\frac{\sigma_L}{\bar L},\qquad
L_i=\lVert p_{i+1}-p_i\rVert
\qquad(\texttt{metrics.py:268-284})$$

es decir, el **coeficiente de variación de las longitudes de segmento** del contorno.

> **⚠ Observación O-10 (métrica mal condicionada, ya identificada por el proyecto).** Esta cantidad
> mide la **regularidad del muestreo del contorno**, no la rugosidad física del borde de la pieza.
> Sobre un contorno de ráster puro las longitudes solo pueden valer 1 o $\sqrt2$, de modo que el CV
> queda determinado por la proporción de pasos diagonales, que a su vez depende de la orientación
> del objeto respecto de la rejilla. Tras el refinamiento sub-píxel y el *gradient snap* la
> distribución se enriquece, pero la dependencia del muestreo persiste.
> El proyecto ya detectó la consecuencia en un informe real: una cuenta circular perfectamente
> conservada quedaba descrita como «fracturada/erosionada» (ADR-016 hallazgo #6), lo que
> **contradecía la tesis del estudio**. Ese rótulo tenía dos fuentes, y ambas se han tratado por
> separado: los estimadores de completitud, retirados en ADR-017 F0 (§5.6), y el vocabulario de esta
> métrica, neutralizado en `metrics.py:281` («Muy rugoso (contorno de alta variabilidad)» en lugar
> de «fractura/erosión»). La **redefinición** de la rugosidad se declaró *math-critical* y sigue
> **diferida**.
> **Remedio propuesto:** definir la rugosidad como desviación radial normalizada respecto del
> contorno suavizado, $\rho = \operatorname{std}_i\!\big(\lVert p_i - \tilde p_i\rVert\big)/\bar R$
> con $\tilde{\mathcal C}$ la reconstrucción EFA de bajo orden (§6) — adimensional, invariante y con
> significado físico directo («amplitud de la irregularidad respecto de la forma»).

### 5.13 Dimensión fractal (box-counting)

Estimación de la **dimensión de Minkowski–Bouligand** del contorno (`metrics.py:434-489`):

$$D=\lim_{\varepsilon\to0}\frac{\log N(\varepsilon)}{\log(1/\varepsilon)}
\;\approx\;\text{pendiente MC de }\ \big(\log(G/\varepsilon_k),\,\log N_k\big)$$

Implementación: el contorno se normaliza a una rejilla $G=256$, se rasteriza por interpolación
lineal, y se cuentan las cajas ocupadas a escalas $\varepsilon_k=2^k$, $k=1\ldots7$ (mediante
desplazamiento de bits, $O(N)$ por escala). La pendiente se obtiene por mínimos cuadrados y se
satura a $[1,2]$. Un contorno suave da $D\approx1$; uno muy irregular, $D\gtrsim1{,}5$
[Mandelbrot 1967; definición formal en Falconer 2003, cap. 2-3].

**Advertencias de interpretación:**

- La normalización reescala $x$ e $y$ **de forma independiente** por sus propios rangos, es decir,
  aplica una transformación afín **anisótropa**. La dimensión de box-counting es invariante ante
  semejanzas pero no necesariamente ante escalados anisótropos, de modo que dos piezas de la misma
  forma pero distinta relación de aspecto pueden dar $D$ ligeramente distintas. Normalizar por el
  lado mayor (preservando la relación de aspecto) eliminaría el efecto (O-11).
- Con solo 7 escalas y $G=256$, la ventana de escalado útil es de poco más de dos décadas
  logarítmicas; el valor debe leerse como **índice comparativo de complejidad** dentro de un corpus
  procesado igual, no como una dimensión fractal en sentido estricto. Esta es la posición estándar
  al aplicar box-counting a objetos naturales [Falconer 2003, §3.3].

### 5.14 Simetría bilateral

Procedimiento (`metrics.py:176-219`): (1) rotar el contorno un ángulo $\vartheta=90°-\theta$
alrededor de $c$ para llevar el eje principal a la vertical; (2) partir en semiplanos
$\mathcal{L}=\{x<c_x\}$ y $\mathcal{R}=\{x\ge c_x\}$; (3) reflejar el derecho sobre el eje,
$\mathcal{R}'=\{(2c_x-x,\,y)\}$; (4) promediar la distancia de cada punto izquierdo a su vecino más
próximo del conjunto reflejado; (5) normalizar por el radio medio:

$$d_{\text{asim}}=\frac{1}{|\mathcal{L}|}\sum_{p\in\mathcal{L}}\ \min_{q\in\mathcal{R}'}\lVert p-q\rVert,
\qquad
\boxed{\ \texttt{simetria\_bilateral}=\operatorname{clip}\!\left(1-\frac{d_{\text{asim}}}{\bar R},\,0,\,1\right)}$$

La cantidad $d_{\text{asim}}$ es la **distancia de Hausdorff modificada dirigida** (media de mínimos
en lugar de máximo de mínimos), propuesta por Dubuisson & Jain (1994) precisamente por su robustez
frente a valores atípicos: un único píxel espurio altera la Hausdorff clásica en toda su magnitud,
y la modificada en $1/|\mathcal L|$. La normalización por $\bar R$ la hace adimensional e
invariante a escala; la alineación previa al eje principal, invariante a rotación.

Cortes interpretativos (⚠ heurística, `metrics.py:212-216`): altamente simétrico $\ge0{,}95$,
buena $\ge0{,}85$, moderada $\ge0{,}70$, levemente asimétrico $\ge0{,}50$, asimétrico por debajo.

> **Limitación conceptual y mejora planificada (ADR-015 D1).** Este índice mide *desajuste de
> contorno bajo reflexión*, que es una medida legítima y suficiente para triaje, pero **no es la
> descomposición formal simétrico/asimétrico** de la morfometría geométrica. El marco canónico es el
> de Klingenberg: superponer por Procrustes la configuración original y su reflejo reetiquetado, y
> descomponer la variación en **componente simétrico** (media de ambas) y **componente asimétrico**
> (diferencia), con contraste de significación mediante ANOVA de Procrustes que separa la asimetría
> direccional, la fluctuante y el error de medición [Klingenberg & McIntyre 1998;
> Klingenberg 2015]. Esa descomposición es la que permitiría afirmar, con estadística, que un
> conjunto de cuentas presenta *control técnico* de la simetría. Está aprobada como mejora D1 y su
> criterio de aceptación es: objeto perfectamente simétrico ⇒ componente asimétrico $\approx0$.
> Dos elementos necesarios ya existen en el código: la superposición de Procrustes 2D
> (`obj3d_v2.py:2739`, §7.4) y el EFA normalizado con convenio de quiralidad (§6.3).

### 5.15 Vértices y ángulos internos

Se obtiene una versión poligonalizada del contorno por Douglas–Peucker con
$\varepsilon=\max(0{,}5,\ 0{,}001P)$ (`metrics.py:357-362`) y, sobre ella, la distribución de
ángulos entre aristas adyacentes (`metrics.py:365-392`):

$$\alpha_i=\arccos\left(\frac{\langle p_{i-1}-p_i,\ p_{i+1}-p_i\rangle}
{\lVert p_{i-1}-p_i\rVert\ \lVert p_{i+1}-p_i\rVert}\right)\in[0°,180°]$$

de donde `angulo_medio_vertices`, `desviacion_angulos`, el `angulo_predominante` (moda en
histograma de 18 clases de 10°) y los recuentos: rectos ($80°\!-\!100°$), agudos ($<80°$), obtusos
($>100°$). Estos recuentos alimentan la clasificación poligonal (§11).

> **Nota.** $\alpha_i$ es el ángulo **no orientado** entre aristas; para un vértice reflejo (cóncavo)
> el ángulo interior real es $360°-\alpha_i$. En un contorno convexo —el caso de la clasificación,
> que trabaja sobre la envolvente simplificada— ambos coinciden, pero si se aplicara al contorno
> real las estadísticas de ángulos mezclarían vértices convexos y cóncavos. El signo del producto
> vectorial resolvería la distinción (O-12).

### 5.16 Defectos de convexidad

Se calculan con `cv2.convexityDefects` (`mao_ia_analyzer.py:152-230`), que para cada arco del
contorno situado entre dos vértices consecutivos de la envolvente devuelve el punto más alejado y
su **profundidad** $\delta$ (distancia del punto a la cuerda de la envolvente, almacenada
$\times256$ en enteros). Se aceptan los defectos con $\delta\ge5$ px.

| Clave | Definición | Unidad |
|---|---|---|
| `num_defectos` | $\#\{\delta_j\ge5\ \text{px}\}$ | conteo |
| `profundidad_max_px`, `profundidad_media_px` | $\max_j\delta_j$, $\overline{\delta_j}$ | px |
| `arco_concavo_total_px` | $\sum_j \operatorname{long}(\text{arco}_j)$ | px |
| `fraccion_arco_concavo` | $\left(\sum_j \operatorname{long}(\text{arco}_j)\right)/P_r$ | $[0,1]$, adimensional |

La **fracción de arco cóncavo** es la única adimensional de la familia y la más informativa: mide
qué proporción del perímetro está «hundida» respecto de la envolvente, complementando a la
convexidad (que mide la magnitud del hundimiento, no su extensión). Es un descriptor especialmente
pertinente para retoque bifacial y para distinguir mella puntual de rebaje extenso.
Las profundidades quedan en píxeles y **no** se convierten a mm en esta versión (O-13, trivial).

El umbral de $5$ px es absoluto y por tanto dependiente de la resolución: la misma pieza fotografiada
al doble de resolución produce más defectos aceptados. Expresarlo como fracción del perímetro
($\delta \ge 0{,}002\,P$, por ejemplo) lo haría invariante.

### 5.17 Textura de superficie

**(a) Estadísticos básicos** sobre los píxeles interiores a la máscara poligonal
(`metrics.py:396-423`):

$$\texttt{varianza\_interna}=\operatorname{Var}(I),\qquad
\texttt{entropia\_superficie}=-\!\!\sum_{k=0}^{255}\! p_k\log_2 p_k,\qquad
\texttt{gradiente\_medio}=\overline{\lVert\nabla I\rVert}$$

La entropía es la de **Shannon** [Shannon 1948] sobre el histograma de 256 niveles normalizado, en
bits, con máximo $8$ para una distribución uniforme; el gradiente medio usa el operador de Sobel
$3\times3$. Ambas son medidas de heterogeneidad tonal de la superficie, útiles como *proxy* de
acabado (pulido vs. tallado).

**(b) Matriz de co-ocurrencia de niveles de gris (GLCM)** — endpoint separado `/api/texture`
(`metrics.py:1068-1130`), calculada con scikit-image [van der Walt et al. 2014] para distancias
$d\in\{1,2,4\}$ y ángulos $\vartheta\in\{0°,45°,90°,135°\}$, simétrica y normalizada. Los
descriptores son los clásicos de **Haralick** [Haralick, Shanmugam & Dinstein 1973]:

$$\text{contraste}=\sum_{i,j}(i-j)^2P_{ij},\quad
\text{disimilaridad}=\sum_{i,j}|i-j|P_{ij},\quad
\text{homogeneidad}=\sum_{i,j}\frac{P_{ij}}{1+(i-j)^2}$$
$$\text{ASM}=\sum_{i,j}P_{ij}^2,\quad \text{energía}=\sqrt{\text{ASM}},\quad
\text{correlación}=\sum_{i,j}\frac{(i-\mu_i)(j-\mu_j)P_{ij}}{\sigma_i\sigma_j},\quad
H=-\sum_{i,j}P_{ij}\log_2 P_{ij}$$

> **⚠ Observaciones O-14 y O-15 (GLCM).**
> **(i) Escala de la entropía.** Los cinco primeros descriptores se promedian sobre las $3\times4=12$
> matrices $(d,\vartheta)$ con `.mean()`, pero la entropía se calcula como **suma sobre todo el
> tensor** (`metrics.py:1105`), de modo que devuelve $\sum_{d,\vartheta}H_{d\vartheta}\approx 12\bar H$
> y su rango efectivo es $[0,96]$ en vez de $[0,8]$. La regla interpretativa «entropía $>5$ ⇒
> superficie compleja» corresponde entonces a $\bar H>0{,}42$ bits, umbral que casi cualquier
> textura real supera. **Remedio:** dividir por el número de pares $(d,\vartheta)$.
> **(ii) Máscara.** Los píxeles exteriores a la máscara se ponen a 0 y **entran en la co-ocurrencia**
> como nivel de gris 0 (`metrics.py:1097`), lo que introduce pares espurios objeto/fondo que inflan
> el contraste y deprimen la homogeneidad, tanto más cuanto menor sea el objeto dentro de su caja.
> **Remedio:** enmascarar los pares en el cálculo (recorrer solo pares con ambos extremos dentro) o
> recortar al rectángulo interior máximo.
> Ninguna de las dos afecta a las métricas geométricas; ambas son locales al endpoint de textura.

---
<a id="6-descriptores-elipticos-de-fourier-efa"></a>

## §6. Descriptores elípticos de Fourier (EFA)

> **Módulo:** `python/modules/efa.py` (540 líneas en 1.3.1), endpoint `/api/efa`.
> Es el **descriptor de forma completo** del sistema: mientras las métricas de §5 resumen la forma
> en escalares, el EFA la representa íntegramente en una base ortogonal, permitiendo reconstruirla,
> compararla y proyectarla en un morfoespacio.

### 6.1 Formulación

Un contorno cerrado se parametriza por **longitud de arco acumulada** $t\in[0,T]$ y se desarrolla en
serie de Fourier cada coordenada [Kuhl & Giardina 1982, ecs. 6-12]:

$$x(t)=A_0+\sum_{k=1}^{K}\Big[a_k\cos\tfrac{2\pi k t}{T}+b_k\sin\tfrac{2\pi k t}{T}\Big],
\qquad
y(t)=C_0+\sum_{k=1}^{K}\Big[c_k\cos\tfrac{2\pi k t}{T}+d_k\sin\tfrac{2\pi k t}{T}\Big]$$

Cada armónico $k$ traza una **elipse** en el plano —de ahí el nombre— y la forma es la superposición
de $K$ elipses recorridas a velocidades angulares múltiplos. Para un contorno poligonal, con
$\Delta x_p,\Delta y_p$ los incrementos y $\Delta t_p=\lVert(\Delta x_p,\Delta y_p)\rVert$, las
integrales admiten forma cerrada. Integrando por partes (el término de frontera se anula por ser la
curva cerrada) y usando que $x'(t)$ es constante a trozos:

$$a_k=\frac{2}{T}\int_0^T\! x(t)\cos\tfrac{2\pi kt}{T}dt
=\frac{T}{2k^2\pi^2}\sum_p \frac{\Delta x_p}{\Delta t_p}\Big[\cos\tfrac{2\pi k t_p}{T}-\cos\tfrac{2\pi k t_{p-1}}{T}\Big]$$

$$b_k=\frac{T}{2k^2\pi^2}\sum_p \frac{\Delta x_p}{\Delta t_p}\Big[\sin\tfrac{2\pi k t_p}{T}-\sin\tfrac{2\pi k t_{p-1}}{T}\Big]$$

y análogamente $c_k,d_k$ con $\Delta y_p$. El término DC (`efa.py:301-325`) es la media ponderada por
arco, $A_0=\frac1T\oint x\,ds$, $C_0=\frac1T\oint y\,ds$ — el **centroide del perímetro**, no el del
área (distinción correcta: es el coeficiente de orden cero de la serie de $x(t)$).

Parámetros por defecto: $K=20$ armónicos (estándar en morfometría arqueológica, $\gtrsim99\,\%$ de
varianza), mínimo 8 puntos, y saturación a Nyquist $K\le N/2$ (`efa.py:78, 425-426`).

### 6.2 Convención de los coeficientes implementada — hallazgo verificado

> **✔ Observación O-16 — el hallazgo más relevante de esta revisión, ya corregido.**
>
> **Estado:** la síntesis quedó corregida el 2026-09-13 (remedio 1 de los tres de abajo) con su
> gate de fidelidad, `tests/test_efa.py::TestReconstruccion`. Se conserva aquí el análisis
> completo porque explica *por qué* el descriptor era correcto mientras la curva no lo era, y
> porque el remedio 2 —adoptar el convenio canónico en los coeficientes— sigue abierto.
>
> La implementación (`efa.py:77-91`) intercambia los papeles del seno y el coseno respecto de las
> ecuaciones de Kuhl y Giardina: calcula
> $$a_k^{\text{MAO}}=\tfrac{T}{2k^2\pi^2}\!\sum_p \tfrac{\Delta x_p}{\Delta t_p}(\sin_p-\sin_{p-1})=b_k^{\text{KG}},
> \qquad
> b_k^{\text{MAO}}=-\tfrac{T}{2k^2\pi^2}\!\sum_p \tfrac{\Delta x_p}{\Delta t_p}(\cos_p-\cos_{p-1})=-a_k^{\text{KG}}$$
> y lo mismo en $y$. Es decir, cada armónico está **desfasado 90°** respecto del convenio canónico.
>
> **Verificación empírica** (ejecutada el 2026-09-13 contra el módulo real): sobre el círculo unidad
> recorrido desde $\alpha=0$, la implementación devuelve $(a_1,b_1,c_1,d_1)=(0,-1,1,0)$ donde el
> convenio canónico da $(1,0,0,1)$.
>
> **Consecuencias, cuantificadas una a una:**
>
> | Uso | ¿Afectado? | Evidencia |
> |---|---|---|
> | Coeficientes **normalizados** e invariancias | **No** para traslación, escala y rotación ($\sim5\times10^{-15}$). **Punto de inicio: sólo módulo 180°** | ⚠ *Corrección 2026-09-18 (ADR-021):* la prueba de invariancia al punto de inicio usaba una elipse, sin armónicos pares; en formas con ellos los normalizados cambian de signo según el inicio (**O-28**, §6.3) — en los dos convenios |
> | Espectro de potencia y varianza explicada | **No** | idénticos entre convenios (son sumas de cuadrados por armónico) |
> | Distancia $d_{\text{EFD}}$ entre objetos | ⚠ **Sí, en general** | *Corrección 2026-09-18:* el residuo no es fijo (véase abajo); hasta $0{,}31$ de diferencia entre convenios. La medición original ($1{,}7\times10^{-16}$ sobre 15 pares) cayó en formas con la misma rama de $\theta_1$ |
> | Procrustes sobre contornos reconstruidos (`js/procrustes.js:1559`) | **No** | idéntico a 4+ decimales; Spearman $=1{,}00$ |
> | **Contorno reconstruido** (`contour_reconstructed`, `mean_reconstructed`) | **Sí** | circularidad de la curva sintetizada $0{,}947$ frente a $0{,}850$ del contorno real; con el convenio corregido, $0{,}850$ |
> | Intercambio de tablas de coeficientes con Momocs / pyefd | **Sí** — ✔ resuelto en la exportación (ADR-021) | los CSV exportan `*_kg` (= pyefd/Momocs a $\sim10^{-13}$); en 1.3.0 un CSV cargado en pyefd daba circularidad $0{,}856$ frente a $0{,}706$ real |
>
> **Por qué las invariancias se salvan.** La normalización (§6.3) fija el primer armónico a la forma
> canónica $(1,0,0,d_1)$ mediante una rotación de fase $\theta_1$ y una rotación espacial $\psi_1$;
> ambas absorben el desfase en $k=1$. Para $k\ge2$ queda un desfase residual de $(1-k)\pi/2$
> **cuando** $\theta_1^{\text{MAO}}=\theta_1^{\text{KG}}-\pi/2$; cuando es $+\pi/2$ —la otra rama del
> $\arctan$, que depende de la forma y del punto de inicio— los armónicos **pares** cambian además de
> signo. ⚠ *Corrección 2026-09-18 (ADR-021):* la versión anterior de este párrafo afirmaba un residuo
> «fijo y determinista» y un morfoespacio **isométrico** al canónico. Es cierto armónico a armónico en
> norma (espectro y varianza idénticos) pero **no** como transformación única del vector: dos formas
> con ramas distintas se relacionan con K&G por matrices distintas, y las distancias difieren (hasta
> $0{,}31$ medido). La raíz es la ambigüedad de 180° de $\theta_1$ (**O-28**, §6.3).
>
> **Por qué la reconstrucción sí falla.** La síntesis `efa.py:171-188` aplica la fórmula canónica
> $x(t)=\sum[a\cos+b\sin]$ a coeficientes que no están en ese convenio, con lo que dibuja una curva
> distinta —sistemáticamente **más redondeada**— que el contorno medido. Comprobado con una medida
> invariante a semejanza (la circularidad) sobre cuatro formas: la reconstrucción actual sobreestima
> la circularidad entre $+0{,}10$ y $+0{,}16$; con la síntesis corregida el error cae a $\le0{,}008$
> (residuo esperable por truncar en 20 armónicos).
>
> **Por qué no lo detectó la suite.** `tests/test_efa.py` cubre exhaustivamente el **descriptor**
> —invariancia a rotación, traslación, escala, punto de inicio y reflexión; forma canónica del primer
> armónico; monotonía de la varianza; saturación a Nyquist— pero **no contrasta la reconstrucción
> contra la forma de entrada**. Una única prueba de fidelidad lo habría revelado.
>
> **Remedios (en orden de menor a mayor alcance):**
> 1. ✔ **Aplicado** — *mínimo, sin migración de datos*: corregir solo la síntesis:
>    $x(t)=\sum_k\big[-b_k\cos+a_k\sin\big]$, $y(t)=\sum_k\big[-d_k\cos+c_k\sin\big]$. Dos líneas en
>    `_reconstruct_contour` (`efa.py:192`); arregla la visualización y el «contorno típico» 3D sin
>    tocar ningún coeficiente almacenado ni ningún resultado analítico previo. Verificado: la
>    circularidad de la curva sintetizada pasa de un error del **21,6 %** a **0,15 %** sobre la
>    forma de tres lóbulos, y las similitudes de Procrustes de `js/procrustes.js` no se mueven
>    (Δ ≤ 3·10⁻¹⁶ sobre seis pares), como predice la invariancia demostrada arriba.
>    **El arreglo llegó justo a tiempo para algo más que la visualización:** ADR-017 F2 publicó
>    `efa.reconstruct()` —que delega en esta misma función— como **generador del repertorio de
>    plantillas** contra las que se empareja un fragmento (`shape_template.py:804`). Con la
>    síntesis anterior, las formas ideales del banco se habrían generado más redondeadas que la
>    forma que codifican sus coeficientes.
> 2. ◐ *Canónico* — ✔ **en la exportación** desde MAO Plus 1.3.1 (ADR-021): `/api/efa` publica
>    `coefficients_kg`/`coefficients_raw_kg` con `coefficient_convention`, y los tres CSV exportan esas
>    columnas; el descriptor interno sigue en el convenio MAO. Lo que sigue ⏸ abierto es adoptarlo
>    en `_efd_raw`:
>    Ninguna conclusión analítica cambia (el espacio es isométrico), pero **las tablas de
>    coeficientes ya almacenadas quedan en otro sistema de coordenadas y no deben mezclarse con las
>    nuevas**: exige recalcular el banco EFA completo. A cambio, los coeficientes pasan a ser
>    directamente comparables con Momocs [Bonhomme et al. 2014] y pyefd, lo que importa si el
>    artículo publica la matriz de coeficientes o si se reanaliza en R.
> 3. ✔ **Aplicado** — el test de fidelidad que faltaba: reconstruir con $K=20$ y exigir que la
>    circularidad (2 %) y el ratio de Feret (5 %) de la curva sintetizada coincidan con los del
>    contorno de entrada, magnitudes invariantes a semejanza y por tanto comparables contra una
>    reconstrucción normalizada. Sobre el código anterior el test falla con un 21,6 % de error.

### 6.3 Normalización canónica: las cuatro invariancias

`efa.py:160-235`. Es la parte que convierte una descripción dependiente de la toma en un
**descriptor de forma**, y está implementada correctamente:

**(1) Rotación de fase $\theta_1$ — invariancia al punto de inicio.** El punto donde comienza el
recorrido es arbitrario; un desplazamiento del origen rota el armónico $k$ un ángulo $k\theta_1$.
Se elige $\theta_1$ que alinea la parametrización con el semieje mayor de la elipse del primer
armónico:

$$\theta_1=\frac12\arctan\!\left(\frac{2(a_1b_1+c_1d_1)}{a_1^2-b_1^2+c_1^2-d_1^2}\right),
\qquad
\begin{pmatrix}a_k'&b_k'\\ c_k'&d_k'\end{pmatrix}
=\begin{pmatrix}a_k&b_k\\ c_k&d_k\end{pmatrix}
\begin{pmatrix}\cos k\theta_1&-\sin k\theta_1\\ \sin k\theta_1&\cos k\theta_1\end{pmatrix}$$

Equivale a la matriz $V$ de la descomposición en valores singulares de
$M_1=\begin{pmatrix}a_1&b_1\\c_1&d_1\end{pmatrix}$.

> **⚠ Observación O-28 — ambigüedad de 180° (2026-09-18).** $\theta_1$ sólo está definido módulo
> $\pi$: $\theta_1$ y $\theta_1+\pi$ alinean el inicio con los **dos** extremos del semieje mayor, y
> el $\arctan$ escoge uno según dónde empiece el contorno. Cambiar de extremo multiplica el armónico
> $k$ por $(-1)^{k+1}$ tras el paso (2): los armónicos **pares** cambian de signo. La misma forma
> trilobulada con otro punto de inicio sale a $d_{\text{EFD}}=0{,}589$ (similitud $0{,}629$, «formas
> moderadamente distintas»). Es propia de la normalización de Kuhl & Giardina —pyefd y Momocs la
> comparten— y la prueba de invariancia al punto de inicio no podía verla porque usa una elipse, que
> sólo tiene armónicos impares. No afecta al espectro ni a la varianza explicada. El TPS de
> semilandmarks de ADR-021 la resuelve eligiendo el extremo por la **asimetría** del contorno; aplicar
> lo mismo al descriptor exige recalcular los bancos (§13.2).

**(2) Rotación espacial $\psi_1$ — invariancia a la orientación de la pieza.** Tras (1), el semieje
mayor del primer armónico apunta en la dirección $\psi_1=\operatorname{atan2}(c_1',a_1')$ **en el
plano**; se rota toda la forma por $-\psi_1$ (matriz $U$ de la SVD), llevando el semieje mayor al eje
$x$:

$$M_k''=R(-\psi_1)\,M_k',\qquad R(-\psi)=\begin{pmatrix}\cos\psi&\sin\psi\\ -\sin\psi&\cos\psi\end{pmatrix}$$

> **Este paso es una corrección histórica del proyecto que merece constar.** Hasta el commit
> `91e6307`, la normalización aplicaba solo (1). **Sin (2) el EFA no es invariante a la rotación de
> la pieza**, defecto que invalidaría cualquier comparación entre fotografías tomadas con distinta
> orientación — es decir, todas. El proyecto lo detectó, lo corrigió y lo blindó con pruebas
> (`test_efa.py::test_invariance_rotation`, verificada de nuevo aquí a $5\times10^{-16}$). Es
> exactamente el tipo de error silencioso que ADR-006 codificó después como «invariante rector».

**(3) Escala.** Normalización por el semieje mayor del primer armónico,
$E_1=\sqrt{a_1''^2+c_1''^2}$, dividiendo todos los coeficientes. Deja el primer armónico en
$(1,0,0,d_1)$ con $d_1$ = relación de semiejes de la elipse fundamental.

**(4) Reflexión (quiralidad).** Se fuerza $d_1\ge0$ negando las componentes $y$ ($c_k,d_k$) de todos
los armónicos. Una reflexión sobre el eje mayor —o invertir el sentido de recorrido— cambia el signo
de $d_1$; forzarlo colapsa ambos casos en una forma canónica única, necesaria para comparar
anverso con reverso (§9) y para agrupar piezas simétricas. El código documenta que este criterio
**sustituyó** al antiguo $c_1\ge0$, que tras el paso (2) quedaba siempre en $c_1\approx0$ y no
discriminaba nada — otra corrección real, con test asociado (`test_reflection_canonicalized`).

Los tres parámetros de normalización se devuelven ($\theta_1$, $\psi_1$, $E_1$) para trazabilidad:
sabiendo dónde estaba la pieza, se puede deshacer la canonización.

### 6.4 Espectro, truncamiento y comparación

$$\text{PS}_k=\sqrt{a_k^2+b_k^2+c_k^2+d_k^2},
\qquad
\text{VE}_{\le K'}=100\cdot\frac{\sum_{k\le K'}(a_k^2+b_k^2+c_k^2+d_k^2)}{\sum_{k\le K}(\cdots)}$$

El espectro de potencia es invariante a rotación por construcción (norma de cada bloque armónico) y
se usa para decidir el **truncamiento**: los campos `harmonics_for_95pct` y `harmonics_for_99pct`
indican cuántos armónicos capturan el 95 % y el 99 % de la potencia acumulada (`efa.py:456-462`).
Es el criterio recomendado en la literatura para fijar $K$ [Crampton 1995, §3; Caple, Byrd &
Stephan 2017, §4], y ADR-015 D3 plantea formalizarlo como parámetro reportado del análisis en vez de
como dato informativo. Para un círculo, `harmonics_for_99pct = 1` (verificado en la suite).

**Distancias entre formas** (`efa.py:493-540`):

$$d_{\text{EFD}}(\mathbf{A},\mathbf{B})=\sqrt{\sum_{k}\sum_{\xi\in\{a,b,c,d\}}(\xi_k^A-\xi_k^B)^2},
\qquad
d_{\text{PS}}=\sqrt{\sum_k(\text{PS}_k^A-\text{PS}_k^B)^2},
\qquad
S=\frac{1}{1+d_{\text{EFD}}}$$

$d_{\text{EFD}}$ es la distancia euclídea en el espacio de coeficientes normalizados, que es la
métrica estándar del morfoespacio de contornos [Rohlf & Archie 1984; Bonhomme et al. 2014]. La
«similitud» $S=1/(1+d)$ es una reescritura monótona a $(0,1]$ para presentación —no es una métrica
ni una probabilidad— con cortes interpretativos en $0{,}90/0{,}75/0{,}50$ (⚠ heurística).

$d_{\text{PS}}$ descarta la fase y conserva solo la amplitud por armónico: es menos discriminante
pero insensible a errores residuales de alineación, útil como comprobación de robustez.

### 6.5 Uso del EFA en la clasificación

`classifier.py:157-245` deriva de la firma espectral tres rasgos de apoyo a la clasificación
tipológica:

$$\text{hf\_ratio}=\frac{\sum_{k\ge5}\text{PS}_k}{\sum_k \text{PS}_k},
\qquad
\text{primary\_ratio}=\frac{\text{PS}_1+\text{PS}_2}{\sum_k \text{PS}_k}$$

con la regla (⚠ heurística): `hf_ratio` $\le0{,}18$ y $h_{95}\le4$ ⇒ contorno **suave/curvilíneo**;
`hf_ratio` $\ge0{,}34$ o $h_{95}\ge8$ ⇒ **angular/complejo**; en medio, mixto. El razonamiento es
sólido —la energía en armónicos altos es literalmente la irregularidad de alta frecuencia del
contorno— y la fusión con la clasificación geométrica es deliberadamente conservadora: ajusta la
*confianza* en $\pm0{,}08$ como máximo y **nunca cambia la clase** (§11.3).

---
<a id="7-homologia-2d3d-el-repertorio-canonico"></a>

## §7. Homología 2D↔3D: el repertorio canónico

> **Módulo:** `python/modules/morphometric_registry.py` (368 líneas) — contrato declarativo;
> `python/modules/obj3d_v2.py` (3848 líneas) — motor 3D sobre mallas.
> **ADR-006.** El registro **no calcula nada**: declara qué mide cada clave, con qué fórmula, en qué
> unidad, y —lo esencial— **qué es comparable con qué**.

### 7.1 El invariante rector

> Una métrica pertenece al **núcleo canónico** (nivel H) si y solo si es **invariante** ante
> traslación, rotación y escala **y adimensional**.

La regla no es cosmética: es la condición necesaria para que dos números procedentes de piezas
distintas, de fotografías distintas o —el caso interesante— de **dimensiones distintas** (una
sección de malla 3D frente a un contorno 2D) puedan restarse. El registro la codifica como banderas
booleanas verificadas por test (`tests/test_morphometric_registry.py`), lo que convierte una
convención implícita en un contrato ejecutable.

**Corolario operativo, explícito en el ADR:** `area`, `perimeter`, `feret_max`, `volume`,
`mean_thickness_z` **no** son canónicas — dependen del tamaño y de la escala. Se reportan como
magnitudes brutas de su modalidad, con su incertidumbre (§2.4), pero no se comparan entre piezas sin
normalizar.

Los cuatro niveles del repertorio:

| Nivel | Definición | Nº de claves | Ejemplos |
|---|---|---|---|
| **H** | homólogas directas: misma fórmula adimensional en 2D y en secciones/proyecciones 3D | 10 | `circularity`, `solidity`, `convexity_perim`, `elongation`, `aspect_ratio`, `contour_complexity_index`, `feret_ratio`, `efa_coefficients`, `excentricidad`, `simetria_bilateral` |
| **P** | proxy: métrica 3D-nativa con homólogo 2D **aproximado** | 4 | `circularity_proxy`, `thickness_ratio`, `convexity_proxy`, `aspect_ratio_resting` |
| **3D** | exclusivas de malla | 8 | `volume`, `convex_hull_volume`, `sphericity_wadell`, `compactness_3d`, `anisotropy`, `bifacial_homology_index`, `transverse_*_cv` |
| **2D** | exclusivas de ráster | 9 | `glcm_*`, `fractal_dimension`, `convexity_defects`, `rugosidad_contorno`, `curvatura_local`, `varianza_interna`, `entropia_superficie` |

Cada `MetricSpec` declara `id`, `nombre`, `formula`, `nivel`, `modalidad`, `invariante`,
`adimensional`, `homologo`, `unidad`, `fuente_2d`, `fuente_3d` y —para el nivel P— la
`coherence_scale` que consume el comparador. Las funciones `nucleo_canonico()` y
`pares_homologos_coherencia()` son la interfaz que sustituyó a los nombres de clave escritos a mano
en el comparador (fase 3 de ADR-006), eliminando la clase de error «dos módulos llaman distinto a lo
mismo» que ADR-016 documentó en la capa de informe.

**Salvedades del contrato** (ver también O-5 y O-9 en §13): el test del registro valida la
*coherencia de las banderas declaradas* y la existencia de las claves, no el **comportamiento
numérico**. Un test de invariancia numérica por cada métrica declarada H —rotar el contorno y exigir
$\Delta<1\,\%$— cerraría el círculo; la maquinaria ya existe en
`python/tests/test_estandar_matematico.py` (§12) y solo habría que recorrerla desde el registro en
lugar de desde una lista escrita a mano.

### 7.2 Métricas 3D nativas

Sobre malla triangular (`trimesh`), con volumen definido solo si la malla es *watertight*
(`obj3d_v2.py:682-760`):

$$\text{solidez}_{3D}=\frac{V}{V_{\text{hull}}},\qquad
\text{convexidad}_{3D}=\frac{A_{\text{hull}}}{A},\qquad
d_{\text{eq}}=\left(\frac{6V}{\pi}\right)^{1/3}$$

$$\boxed{\ \Psi_{\text{Wadell}}=\frac{\pi^{1/3}(6V)^{2/3}}{A}\ }\qquad
\text{compacidad}_{3D}=\frac{36\pi V^2}{A^3}$$

La **esfericidad de Wadell** [Wadell 1932, 1935] es el cociente entre el área de la esfera de igual
volumen y el área real; vale 1 solo para la esfera y es la generalización directa de la
circularidad de Cox. Nótese la identidad exacta

$$\text{compacidad}_{3D}=\Psi_{\text{Wadell}}^{\,3}$$

—de nuevo dos claves, un grado de libertad (§5.5, O-6)—. Las construcciones son homólogas
conceptualmente a sus pares 2D: solidez $A_r/A_h \leftrightarrow V/V_{\text{hull}}$;
convexidad $P_h/P_r \leftrightarrow A_{\text{hull}}/A$.

**Descriptores por autovalores de la nube de puntos** (`obj3d_v2.py:631-654`). Diagonalizando la
matriz de covarianza de los vértices, con $\lambda_1\ge\lambda_2\ge\lambda_3$:

$$L=\frac{\lambda_1-\lambda_2}{\lambda_1}\ \text{(linealidad)},\quad
P=\frac{\lambda_2-\lambda_3}{\lambda_1}\ \text{(planaridad)},\quad
S=\frac{\lambda_3}{\lambda_1}\ \text{(esfericidad)}$$

que es la tríada estándar de descriptores dimensionales de nubes de puntos
[West et al. 2004; Demantké et al. 2011]. De ahí se derivan los proxies del nivel P:

$$\texttt{circularity\_proxy}=S,\qquad
\texttt{convexity\_proxy}=1-P,\qquad
\texttt{anisotropy}=L+P=1-S,\qquad
\texttt{thickness\_ratio}=\frac{\text{ext}_z}{\max(\text{ext}_x,\text{ext}_y)}$$

con la identidad $\texttt{anisotropy}=1-\texttt{circularity\_proxy}$ (otra dependencia exacta).

**Feret 3D** (`obj3d_v2.py:657-679`): el diámetro se calcula como máxima distancia entre pares
**por bloques y de forma exacta**, no por submuestreo. El comentario del código explica la razón,
que es matemáticamente correcta y vale la pena reproducir: el diámetro de un conjunto se alcanza
siempre entre dos vértices de la envolvente convexa, de modo que un submuestreo aleatorio puede
descartar justo esos dos y subestimarlo groseramente. El coste se controla por bloques
($O(\text{chunk}\cdot n)$ en memoria) en vez de materializar el tensor $O(n^2)$.

**Estabilidad longitudinal**: `transverse_area_cv` y `transverse_thickness_cv` son coeficientes de
variación del área y el espesor a lo largo de cortes seriados — cuantifican si la pieza mantiene
sección constante (indicio de regularización técnica) o se estrecha.

### 7.3 Superposición de Procrustes 2D

`obj3d_v2.py:2739-2782`. Para comparar dos contornos homologados (anverso/reverso, o dos secciones
consecutivas):

1. **Centrar**: $A_0=A-\bar A$, $B_0=B-\bar B$ (elimina traslación).
2. **Escalar** a norma de Frobenius unitaria: $A_0\leftarrow A_0/\lVert A_0\rVert_F$ (elimina tamaño).
3. **Rotar óptimamente** (problema ortogonal de Procrustes): con $H=A_0^{\!\top}B_0=U\Sigma V^{\!\top}$,
   la rotación que minimiza la distancia es $R=UV^{\!\top}$, corregida a $\det R=+1$ para **excluir
   reflexiones** (negando la última columna de $U$ si hiciera falta).
4. **Disparidad**: $M^2=\lVert A_0R-B_0\rVert_F^2=2-2\sum_i\sigma_i$, y
   $\text{similitud}=e^{-6M^2}$.

Es el procedimiento canónico de análisis de forma [Gower 1975; Rohlf & Slice 1990;
Dryden & Mardia 2016, cap. 5]. Dos decisiones de implementación están documentadas y son correctas:

- **No dividir por el número de puntos.** El código lo justifica explícitamente: al promediar, el
  rango de $M^2$ se aplasta a $\sim10^{-3}$ y la similitud satura en $[0{,}95,1]$ —un círculo y un
  cuadrado daban $0{,}999$—. Con la suma, $M^2\in[0,2]$ y la exponencial reparte el rango de forma
  útil. La constante $6$ del exponente es un factor de escala de presentación (⚠ heurística).
- **Exclusión de reflexiones**: en morfología bifacial la quiralidad es información, no ruido.

> **Limitación de homología (declarada).** Procrustes exige **correspondencia punto a punto**. Aquí
> la correspondencia es por índice tras remuestreo uniforme en longitud de arco, es decir,
> *pseudo-landmarks*, no puntos homólogos anatómicos. Dos contornos con la misma forma pero distinto
> punto de inicio dan disparidad alta pese a ser idénticos. En el uso interno del sistema (secciones
> consecutivas de la misma malla, caras de la misma pieza) el origen está fijado por la orientación
> canónica y la correspondencia es razonable, pero **no es una superposición de Procrustes
> generalizada sobre landmarks homólogos** en el sentido de la morfometría geométrica clásica
> [Bookstein 1991]. Ese paradigma está identificado como extensión opcional (ADR-015 E1) y sería el
> camino para dialogar directamente con `geomorph` o AGMT3-D [Adams & Otárola-Castillo 2013;
> Herzlinger & Grosman 2018]. Para contornos sin landmarks, el descriptor de elección sigue siendo
> el EFA (§6), que es lo que MAO usa como vía principal.

### 7.4 Puntuación de coherencia cross-dimensional

`obj3d_v2.py:2409-2530`. Cuando existe malla 3D y lectura 2D del mismo objeto, se evalúa su
consistencia mutua con cinco componentes y una función de similitud exponencial:

$$\operatorname{sim}(a,b;\ \varsigma)=\operatorname{clip}_{[0,1]}\!\left(e^{-|a-b|/\varsigma}\right)$$

donde la **escala de tolerancia $\varsigma$ se lee del registro canónico** (campo `coherence_scale`),
no de literales dispersos en el código — que es justamente lo que la fase 3 de ADR-006 vino a
corregir:

| Componente | Definición | $\varsigma$ | Peso |
|---|---|---|---|
| Homología bifacial | `bifacial_homology_index` (índice propio MAO) | — | 0,30 |
| Estabilidad longitudinal | $1-\min\!\big(1,\ \tfrac12(\text{CV}_{\text{área}}+\text{CV}_{\text{espesor}})\big)$ | — | 0,20 |
| Consistencia de forma | $\operatorname{sim}$(circularidad 2D frontal, `circularity_proxy`) | 0,15 | 0,20 |
| Consistencia de espesor | $\operatorname{sim}$(espesor medio / dimensión mayor, `thickness_ratio`) | 0,10 | 0,15 |
| Consistencia de proporción | $\operatorname{sim}$(AR frontal 2D, AR en reposo) | 0,35 | 0,15 |

$$\text{coherencia}=\operatorname{clip}_{[0,1]}\Big(0{,}30\,h_{\text{bif}}+0{,}20\,e_{\text{long}}
+0{,}20\,s_{\text{forma}}+0{,}15\,s_{\text{esp}}+0{,}15\,s_{\text{prop}}\Big)$$

Los componentes ausentes se imputan a $0{,}5$ (neutro), lo que evita penalizar por falta de dato
pero **diluye la señal**: una coherencia de 0,5 puede significar «consistencia media» o «no hay
datos». Convendría reportar junto al valor el número de componentes efectivamente calculados
(O-17, trivial y de alto valor informativo).

Los pesos y las escalas son ⚠ heurísticos, calibrados por criterio experto. El índice debe leerse
como **control de calidad interno** —¿la malla y la fotografía describen el mismo objeto?— y no como
una medida física.

---
<a id="8-perforaciones-y-horadaciones-ph"></a>

## §8. Perforaciones y horadaciones (P/H)

> **Módulos:** `python/modules/ph.py` (501 líneas) — métricas y área neta;
> `detection.detect_holes()` — detección sin semillas. **ADR-009.**
> **Invariante del subsistema:** *el área neta solo descuenta P/H **confirmadas** por el operador;
> la detección automática propone, el humano dispone.*

En ornamentos y cuentas, la perforación no es un defecto sino **el rasgo tecnológico principal**.
ADR-009 la elevó de tarea manual secundaria a tarea primaria del análisis, con una restricción
epistemológica explícita que conviene destacar porque es poco habitual y metodológicamente correcta:

> **La profundidad no es observable en 2D.** Una imagen cenital no distingue una **perforación**
> (pasante) de una **horadación** (ciega). Por tanto el detector automático emite candidatos con
> `tipo="candidato"` y **no asigna el tipo**; el operador confirma y tipifica. El sistema no infiere
> lo que la física de la imagen no contiene.

### 8.1 Detección de huecos sin semillas

`detection.py:588-706`. Sobre la máscara **con los huecos preservados** —la instantánea previa al
cierre morfológico (§3.7)— se combinan dos señales independientes:

**Señal 1 — topológica.** Silueta rellena menos máscara:

$$\mathcal{S}=\operatorname{fill}\big(\partial_{\text{ext}} M\big),\qquad
\mathcal{H}_1=\mathcal{S}\wedge\neg M$$

Detecta huecos del color del fondo y **funciona sin imagen** (lo que permite probar el algoritmo con
máscaras sintéticas).

**Señal 2 — radiométrica.** Interior cuya intensidad se aparta del **cuerpo** del objeto:

$$\mathcal{H}_2=\operatorname{erode}(\mathcal{S},B,2)\ \wedge\
\Big\{\,\big|\,g-\operatorname{med}(g|_{\text{cuerpo}})\,\big|>\max\big(25,\ 1{,}5\,\sigma_{\text{cuerpo}}\big)\Big\}$$

La erosión de la silueta excluye la transición objeto/fondo del borde, que si no dispararía la
señal en todo el perímetro. Esta segunda señal es la que capta **huecos pasantes grises** y recesos
en sombra que el umbral de blancos no ve: se añadió tras una prueba con una pieza anular real cuyo
hueco no era del color del fondo. Los candidatos son
$\mathcal{H}=\operatorname{open}(\mathcal{H}_1\vee\mathcal{H}_2, B)$.

**Filtros de plausibilidad** (todos relativos al objeto, luego invariantes a escala):

$$\max(16,\ 0{,}001\,A_{\text{obj}})\ \le\ A_{\text{hueco}}\ \le\ 0{,}35\,A_{\text{obj}},
\qquad \text{y descartar los que tocan el límite del ROI}$$

más un máximo de 24 candidatos ordenados por área. Cada candidato recibe su confianza por la misma
fórmula que los objetos (§3.9), con el anillo tomado sobre el material del objeto. Si GrabCut
reemplazó la máscara, la detección de huecos **se omite** por no ser fiable — decisión conservadora
correcta.

Cada candidato se emite en **coordenadas absolutas** con `points` (contorno simplificado por
Douglas–Peucker con $\varepsilon=\max(1,\ 0{,}01P)$), `area_px`, `bbox`, `centroid`,
`perimeter_px`, `circularity` y su confianza.

### 8.2 Métricas de cada P/H

`ph.py:182-333`. Se calcula el mismo repertorio que para el objeto —área y perímetro de Shoelace,
centroide, caja, envolvente, radios extremos, ejes principales por tensor de inercia, Feret por
barrido de 2°, circularidad, solidez, convexidad, elongación, rectangularidad y clasificación de
forma— reutilizando las mismas funciones matemáticas, lo que garantiza coherencia entre escalas de
análisis.

> **⚙ Diferencia de convención respecto del objeto.** Para P/H, `area`, `perimetro` y `circularidad`
> se calculan sobre el **contorno real** (`ph.py:204-206, 258`), no sobre la envolvente convexa como
> en `metrics.py` (§5.1). Es coherente con la naturaleza del rasgo —el hueco es lo que es, no hay
> «forma original a estimar»— pero significa que `circularidad` de una P/H y `circularity` de un
> objeto **no son la misma función** de los datos. Conviene declararlo en el informe.

La clasificación de forma del hueco (`ph.py:165-175`, ⚠ heurística) usa circularidad, regularidad
radial y relación de aspecto: Circular si $\text{circ}>0{,}85$ y $\text{reg}>80$; Subcircular si
$\text{AR}<1{,}3$ y $\text{reg}>70$; Alargada si $\text{AR}>3$; Elíptica si $\text{AR}>1{,}5$ y
$\text{circ}<0{,}7$; Irregular en otro caso. Para el estudio de estandarización de perforaciones,
la variable continua relevante no es esta etiqueta sino la terna
(`circularidad`, `feret_ratio`, `coeficiente_variacion_radial`), que es adimensional y admite
tratamiento estadístico (§10).

### 8.3 Área neta y relación de contención

`ph.py:336-430`. El área efectiva descontada al objeto requiere resolver un problema de
**contención**: una perforación pequeña abierta *dentro* de una horadación mayor no debe restarse
dos veces. Se resuelve por **lanzamiento de rayo** (regla par-impar, corolario del teorema de la
curva de Jordan) [Shimrat 1962; discusión de casos degenerados en Hormann & Agathos 2001]:

$$\text{dentro}(q,\mathcal{P})=\bigoplus_{i}\ \mathbb{1}\Big[(y_i>q_y)\ne(y_j>q_y)\Big]\wedge
\Big[q_x<\tfrac{(x_j-x_i)(q_y-y_i)}{y_j-y_i}+x_i\Big],\qquad j=i-1$$

(donde $\bigoplus$ es la paridad de la cuenta de cruces). Se declara contenida la perforación $p$ en
la horadación $h$ si $A_p<A_h$ **y** el centroide de $p$ cae dentro de $h$. Entonces:

$$A_{\text{P/H neta}}=\underbrace{\sum_{p\notin\text{contenidas}}A_p}_{\text{perforaciones efectivas}}
+\sum_h A_h,
\qquad
A_{\text{objeto neta}} = A_{\text{objeto}}-A_{\text{P/H neta}}$$

El sistema reporta además el área bruta y la lista de relaciones contenedor–contenido, de modo que
la operación es auditable. El criterio de contención por centroide es una simplificación
razonable (⚠) frente al test exacto de inclusión de polígonos: falla solo en configuraciones
patológicas (hueco en forma de C cuyo centroide cae fuera de sí mismo), que en el dominio
—perforaciones aproximadamente convexas— no se presentan.

### 8.4 Flujo de confirmación

Los candidatos se propagan al objeto como `phCandidatos` (nunca a `perforaciones`/`horadaciones`),
se dibujan en el modal como sugerencias en trazo discontinuo ámbar etiquetadas `?N`, y el operador
las **confirma como perforación, confirma como horadación o descarta**. Solo tras confirmar entran
en el cálculo del área neta. La telemetría registra `ph_candidatos_detectados` frente a
`ph_confirmados`, lo que —conviene señalarlo— **proporciona ya la materia prima para validar el
detector**: la tasa de confirmación por objeto es una estimación directa de la precisión del
detector sobre datos reales, y bastaría acumularla para publicar una curva de rendimiento sin
necesidad de un experimento adicional.

---

<a id="9-analisis-bifacial-simetria-ci-y-cms"></a>

## §9. Análisis bifacial: simetría, CI y CMS

> **Módulo:** `python/modules/comparator.py:340-700` · espejo JS en
> `js/modules/bifacial-analysis.js`.

Cuando una pieza se fotografía por sus dos caras, el sistema evalúa su correspondencia. La pregunta
arqueológica es doble: *(a)* ¿son realmente las dos caras del mismo objeto? *(b)* ¿qué grado de
control técnico revela su simetría?

### 9.1 Dos funciones de similitud por pares

El módulo usa **dos** normalizaciones distintas para comparar un par de valores, y conviene
distinguirlas porque no son intercambiables:

$$s_{\max}(a,b)=1-\frac{|a-b|}{\max(a,b)}
\qquad\text{(\texttt{\_simetria\_par}, \texttt{comparator.py:465})}$$

$$s_{\text{med}}(a,b)=\max\!\left(0,\ 1-\frac{|a-b|}{(a+b)/2}\right)
\qquad\text{(\texttt{\_sim\_par\_ci\_cms}, \texttt{comparator.py:389})}$$

$s_{\text{med}}$ es la **diferencia porcentual relativa a la media**, simétrica y estándar en
metrología comparativa; $s_{\max}$ es más indulgente (para $a=1,b=2$: $s_{\max}=0{,}5$ frente a
$s_{\text{med}}=0{,}33$). La primera se usa en el índice global; la segunda, en CI/CMS.

### 9.2 Índice global de simetría bifacial

$$\text{ISB}=0{,}25\,s_{\text{área}}+0{,}20\,s_{\text{circ}}+0{,}20\,s_{\text{conv}}
+0{,}15\big(1-\min(\tilde\delta,1)\big)+0{,}10\,s_{\text{orient}}+0{,}10\,s_{\text{P/H}}$$

(`comparator.py:538-545`), con:

- $\tilde\delta=\lVert c_A-c_B\rVert/\sqrt{\bar A/\pi}$, **desplazamiento del centroide normalizado**
  por el radio del círculo de área equivalente — normalización correcta que lo hace adimensional
  (Excelente $<0{,}1$; Buena $<0{,}3$; Pobre en otro caso).
- $s_{\text{orient}}=\max(0,\ 1-\Delta\vartheta/90°)$ con
  $\Delta\vartheta=\lvert\vartheta_B-(-\vartheta_A)\rvert$ reducido a $[0°,90°]$: compara el ángulo
  del eje principal de B contra el **reflejo especular** del de A, que es la relación esperada entre
  anverso y reverso al voltear la pieza. Matemáticamente correcto: voltear sobre el eje vertical
  cambia el signo del ángulo.
- $s_{\text{P/H}}$: fracción de perforaciones de A que encuentran pareja en B tras **reflexión
  especular** respecto del centroide, $q\mapsto(2c_x-q_x,\ q_y)$, con tolerancia $0{,}15\,R_{\text{eq}}$
  (`comparator.py:510-524`). Es un emparejamiento voraz, no óptimo: para conteos altos de P/H, el
  emparejamiento húngaro (coste mínimo global) sería preferible; con 1–4 perforaciones, que es el
  caso típico, la diferencia es nula.

Los seis pesos son ⚠ heurísticos y suman 1.

### 9.3 CI y CMS: coherencia identitaria y de superficie

Dos índices con propósitos deliberadamente distintos (`comparator.py:547-591`):

**CI — Coherencia Identitaria** (¿son la misma pieza?). Media ponderada de $s_{\text{med}}$ sobre
métricas **dimensionales**: área (peso 3,0), perímetro (2,0), eje mayor (2,0), eje menor (1,5),
Feret máx (1,5) y Feret mín (1,0). Mínimo 2 pares disponibles; los pares ausentes se excluyen del
promedio en lugar de imputarse —correcto, evita sesgar por dato faltante—.

**CMS — Coherencia Morfológica de Superficie** (¿se parecen sus superficies?). Combinación de tres
subíndices, cada uno media ponderada de $s_{\text{med}}$:

$$\text{CMS}=0{,}50\,I_{\text{forma}}+0{,}30\,I_{\text{radial}}+0{,}20\,I_{\text{contorno}}$$

- $I_{\text{forma}}$: circularidad, solidez, elongación, rectangularidad, simetría bilateral,
  convexidad, excentricidad (7 métricas, peso 1 cada una).
- $I_{\text{radial}}$: radio medio, ratio de radios, CV radial, regularidad radial, estrellamiento.
- $I_{\text{contorno}}$: rugosidad, ICI, curvatura media, varianza tonal, entropía, gradiente medio.

**La lectura conjunta es el aporte interpretativo** (`comparator.py:594-629`) y está bien
construida, porque separa dos preguntas que suelen confundirse:

| CI | CMS | Categoría | Lectura arqueológica |
|---|---|---|---|
| $\ge0{,}85$ | $\ge0{,}85$ | Correspondencia máxima | caras prácticamente idénticas |
| $\ge0{,}78$ | $\ge0{,}62$ | Correspondencia normal | mismo objeto, variación de manufactura esperable |
| $\ge0{,}78$ | $<0{,}62$ | **Diferenciación natural** | mismas dimensiones, superficies divergentes — anverso trabajado / reverso no |
| $<0{,}60$ | $<0{,}60$ | No relacionados | probablemente no son la misma pieza |

El tercer cuadrante es el informativo: **dimensiones iguales con morfología de superficie distinta**
es la firma de una pieza con tratamiento diferencial de caras, y el sistema la nombra explícitamente
en lugar de promediarla hasta hacerla desaparecer. Los umbrales son ⚠ heurísticos y deberían
calibrarse contra un corpus con caras conocidas —es un experimento barato y de alto valor: bastan
$n$ piezas fotografiadas dos veces por la misma cara (control positivo) y $n$ pares de caras
distintas (control negativo) para estimar sensibilidad y especificidad de los cortes.

> **Relación con la mejora D1 (ADR-015).** Todo este bloque compara **por diferencia de métricas
> escalares**. La alternativa formal —descomposición simétrico/asimétrico de Klingenberg sobre
> configuraciones superpuestas por Procrustes, con ANOVA que separe asimetría direccional, fluctuante
> y error de medición [Klingenberg & McIntyre 1998; Klingenberg 2015]— daría, además de un índice,
> una **prueba de significación** y una descomposición de la varianza. Para el estudio de
> estandarización de ornamentos, donde la simetría es el indicador de control técnico, esa es la
> diferencia entre describir y demostrar.

---
<a id="10-estadistica-de-coleccion"></a>

## §10. Estadística de colección

> **Módulo:** `python/modules/comparator.py` (709 líneas), endpoints `/api/pca` y `/api/statistics`,
> sobre `scikit-learn` [Pedregosa et al. 2011] y `scipy` [Virtanen et al. 2020].

### 10.1 Construcción de la matriz de datos

Selección automática de variables (`comparator.py:63-88`): claves numéricas finitas presentes en
$\ge50\,\%$ de los objetos, excluyendo las privadas (`_`) y las derivadas de incertidumbre
(`*_incertidumbre_abs`, `*_rango_min/max`) — exclusión acertada, pues son función determinista de la
métrica y de $\varepsilon$, y su inclusión duplicaría información. El usuario puede además fijar el
subconjunto explícitamente.

**Imputación** por la mediana de columna (`comparator.py:91-101`) y eliminación de columnas de
varianza nula (que harían singular la matriz de covarianza).

> **Nota metodológica.** La imputación por mediana es *single imputation*: rellena el hueco pero
> **no propaga la incertidumbre de haberlo rellenado**, y atenúa la varianza y las correlaciones
> [Little & Rubin 2019, cap. 4]. Con pocos faltantes es inocua; conviene reportar el porcentaje de
> celdas imputadas junto al resultado, dato que hoy no se emite (O-18).

### 10.2 Estandarización y PCA

$$z_{ij}=\frac{x_{ij}-\bar x_j}{\sigma_j}
\qquad\Longrightarrow\qquad
\mathbf{Z}=\mathbf{U}\mathbf{\Sigma}\mathbf{V}^{\!\top},\quad
\text{scores}=\mathbf{Z}\mathbf{V},\quad
\text{VE}_k=\frac{\sigma_k^2}{\sum_j\sigma_j^2}$$

La estandarización es **obligatoria** aquí y no una opción de estilo: el *pool* mezcla mm, mm²,
grados y adimensionales, de modo que un PCA sobre la matriz de covarianza estaría dominado por la
variable de mayor unidad. Estandarizar equivale a hacer PCA sobre la matriz de **correlación**
[Jolliffe 2002, §2.3]. La implementación usa SVD (numéricamente estable) en lugar de la
diagonalización de Jacobi del motor JS original, y ambas convergen al mismo subespacio
[Pearson 1901; Hotelling 1933].

> **⚠ Observación O-19 — multicolinealidad del *pool*.** Como se documentó en §5.5, §5.6, §5.8 y
> §7.2, el repertorio contiene numerosas **dependencias algebraicas exactas**:
> `compactness`$\equiv$`circularity`, `shape_factor`$=1/c$, `indice_lobularidad`$=c^{-1/2}$,
> `perdida_area_fragmentacion`$=100(1-\text{solidez})$,
> `bounding_box_efficiency`$\equiv$`rectangularity`,
> `regularidad_radial`$=100\cdot$`ratio_radios`, `anisotropy`$=1-$`circularity_proxy`,
> `compactness_3d`$=\Psi^3$… Incluir varias de ellas en el mismo PCA **duplica la contribución del
> mismo eje de variación**: infla la varianza explicada por PC1, distorsiona las cargas y hace
> irreproducible la interpretación de las componentes. Es la brecha C2 de ADR-015. **Remedio en dos
> pasos**: (1) declarar en el registro un campo `derivada_de` y excluir por defecto las derivadas del
> *pool*; (2) aplicar un filtro de **factor de inflación de la varianza**,
> $\mathrm{VIF}_j=1/(1-R_j^2)$, descartando $\mathrm{VIF}>10$ (o la agrupación de variables por
> *clustering* de la matriz de correlación). El coste de implementación es bajo y el efecto sobre la
> credibilidad del morfoespacio, alto.

### 10.3 Agrupamiento y validación

**K-means** [MacQueen 1967; Lloyd 1982] sobre los *scores*, con inicialización *k-means++*
[Arthur & Vassilvitskii 2007], `n_init=10` y `random_state=42` — **reproducible**, detalle
importante para un artículo. El número de grupos se elige, si no se fija, maximizando la
**silueta** [Rousseeuw 1987] sobre $k\in[2,\ \min(9,n-1)]$:

$$s(i)=\frac{b(i)-a(i)}{\max\{a(i),b(i)\}}\in[-1,1],\qquad
S=\frac1n\sum_i s(i)$$

con $a(i)$ la disimilitud media intra-grupo y $b(i)$ la mínima media inter-grupo. Es un criterio
razonable, aunque conviene recordar dos cosas al interpretarlo: K-means impone grupos convexos y
aproximadamente isótropos, y la silueta **siempre** devuelve un óptimo aunque no haya estructura de
grupos en los datos. Para afirmar que un conjunto de piezas se agrupa en $k$ morfotipos hace falta
un contraste adicional (estadístico *gap*, o comparación con una nula por permutación).

### 10.4 Distancia de Mahalanobis y detección de atípicos

$$d_i=\sqrt{(\mathbf{z}_i-\bar{\mathbf{z}})^{\!\top}\,\hat{\mathbf{\Sigma}}^{+}\,(\mathbf{z}_i-\bar{\mathbf{z}})}$$

[Mahalanobis 1936], con pseudo-inversa de Moore–Penrose para tolerar covarianzas singulares
(`comparator.py:222-239`). Bajo normalidad multivariante, $d_i^2\sim\chi^2_p$ con $p$ el número de
variables, lo que da el corte natural $d>\sqrt{\chi^2_{0{,}975,\,p}}$ — **pero sólo para un punto
externo a la muestra con la que se estimaron media y covarianza**. Para cada objeto de la propia
colección la ley exacta es la de Wilks (1963), $n\,d_i^2/(n-1)^2\sim\mathrm{Beta}\big(p/2,\,(n-p-1)/2\big)$,
acotada por $d_i\le(n-1)/\sqrt n$; el $\chi^2$ es su límite cuando $n\gg p$ (ver la segunda corrección de O-20).

> **✔ Observación O-20 — el umbral de atípicos estaba fijado para $p=2$ y se aplicaba en dimensión
> $p$; corregido el 2026-09-13.**
> El código usa `_OUTLIER_THRESHOLD = 2.716`, documentado como «percentil 97,5 %»
> (`comparator.py:38`). En efecto $\sqrt{\chi^2_{0{,}975,\,2}}=2{,}716$ — es el corte correcto **en
> dos dimensiones**, coherente con el nombre de la función JS que se portó
> (`mahalanobisDistances2D`). Pero la implementación Python calcula la distancia sobre la matriz
> estandarizada **completa** ($p$ variables, no sobre los dos *scores* de PCA), donde el corte debe
> ser $\sqrt{\chi^2_{0{,}975,\,p}}$ — por ejemplo $4{,}53$ para $p=10$ y $6{,}85$ para $p=30$.
>
> **Demostración empírica** (ejecutada el 2026-09-13 sobre el módulo real, con datos gaussianos
> **sin ningún atípico**):
>
> | $n$ objetos | $p$ variables | rango de $d$ | % marcados atípicos | corte correcto |
> |---|---|---|---|---|
> | 12 | 30 | 3,18–3,18 | **100 %** | 4,68 |
> | 20 | 30 | 4,25–4,25 | **100 %** | 5,73 |
> | 40 | 30 | 4,47–5,88 | **100 %** | 6,85 |
> | 60 | 10 | 1,70–4,52 | **70 %** | 4,53 |
> | 200 | 10 | 1,39–5,32 | **67 %** | 4,53 |
> | 12 | 5 | 0,61–2,86 | 17 % | 3,58 |
>
> Obsérvese además el segundo problema, visible en las tres primeras filas: cuando $n\lesssim p$ la
> covarianza muestral es singular y, con pseudo-inversa, **todas las distancias colapsan al mismo
> valor** — el estadístico deja de discriminar por completo.
>
> **Corrección aplicada** (`comparator.py:48, 249`): el umbral dejó de ser una constante y se deriva
> en tiempo de ejecución como $\sqrt{\chi^2_{0{,}975,\,r}}$ con $r=\operatorname{rank}(\hat{\mathbf\Sigma})$,
> los grados de libertad efectivos de la covarianza realmente empleada. El caso degenerado se
> declara en vez de rellenarse: cuando $r\ge n-1$ la respuesta trae
> `outlier_status = "no_evaluable_pocos_objetos"`, lista vacía y umbral `null` — la misma doctrina
> de ADR-017 F0 («donde no hay dato se dice sin evaluar, nunca un resultado fabricado»). La
> respuesta expone además `mahalanobis_df` y `outlier_threshold`, de modo que el criterio queda
> auditable en el informe. Sobre los 60×10 gaussianos de la tabla, la fracción marcada cae del
> **70 % al 2 %** (nominal 2,5 %). El espejo JS `mahalanobisDistancesZ`
> (`js/comparator.js:4745`) tenía el mismo defecto con estimador diagonal y se corrigió en
> paralelo, con el cuantil por la aproximación de Wilson-Hilferty. Gate:
> `tests/test_comparator.py::TestUmbralAtipicos` (4 pruebas).
>
> **✔ Segunda corrección de O-20 (MAO Plus 1.3.0, 2026-09-15) — el cuantil $\chi^2$ es asintótico.**
> Verificación independiente sobre el módulo corregido: la distancia de cada objeto a la media y
> covarianza **de su propia colección** está acotada por $(n-1)/\sqrt n$, y con tamaños de colección
> arqueológicos ese máximo queda **por debajo** de $\sqrt{\chi^2_{0{,}975,\,r}}$: con $n=20$, $r=10$,
> $d_{\max}=4{,}25<4{,}53$, de modo que **ninguna pieza podía salir atípica, por extrema que fuese**.
> Fracción marcada bajo $H_0$ (400 réplicas gaussianas; nominal $2{,}5\,\%$):
>
> | $n$ | $r$ | $\chi^2$ (13-09) | Wilks (1.3.0) |
> |---|---|---|---|
> | 12 | 5 | 0,00 % | 2,25 % |
> | 20 | 10 | 0,00 % | 2,20 % |
> | 30 | 20 | 0,00 % | 2,38 % |
> | 40 | 10 | 0,44 % | 2,43 % |
> | 200 | 10 | 2,05 % | 2,45 % |
>
> El umbral pasa a $d_{\text{crit}}=\sqrt{(n-1)^2/n\cdot \mathrm{Beta}^{-1}_{0{,}975}\big(r/2,(n-r-1)/2\big)}$
> (`comparator._outlier_threshold(df, n)`). El espejo JS abandona el estimador diagonal —con
> métricas correlacionadas $d^2$ no sigue ninguna ley conocida— y usa la pseudo-inversa espectral de la
> covarianza completa, con la Beta incompleta implementada sin dependencias (diferencia con scipy
> $4\cdot10^{-14}$; con el backend $4\cdot10^{-13}$, también con colinealidad exacta). En la aplicación,
> 20 objetos × 10 métricas con uno desplazado: umbral 3,84 < máximo 4,25, y el desplazado sale.
>
> **Pendiente relacionado, no abordado:** con $n<3p$ la covarianza muestral sigue siendo pobre
> aunque el umbral ya sea correcto; el refuerzo natural es un estimador robusto —MCD
> [Rousseeuw & Van Driessen 1999]— o regularizado (Ledoit-Wolf).

### 10.5 Estadística descriptiva y correlación

Por variable (`comparator.py:271-292`): media, mediana, desviación típica **muestral** (`ddof=1`,
correcta), mínimo, máximo, cuartiles, asimetría, curtosis (exceso, convenio de Fisher), coeficiente
de variación $\mathrm{CV}=|\sigma/\bar x|$ y $n$ efectivo. Matriz de correlación de **Pearson** con
$p$-valores bilaterales (`comparator.py:294-312`).

Dos cautelas de interpretación:

1. **Multiplicidad.** Con $p$ variables se contrastan $p(p-1)/2$ correlaciones; con $p=20$ son 190
   pruebas y, a $\alpha=0{,}05$, cabe esperar $\sim10$ «significativas» por azar. Los $p$-valores se
   reportan **sin corrección**. Debería aplicarse control de la tasa de falsos descubrimientos
   [Benjamini & Hochberg 1995] o, como mínimo, advertirlo en el informe (O-21).
2. **Correlación sobre datos imputados.** La matriz se calcula tras la imputación por mediana, lo
   que sesga $r$ hacia cero en presencia de faltantes.

### 10.6 El coeficiente de variación como medida de estandarización

Para el estudio de **estandarización de la producción** —el caso de uso arqueológico que motiva
buena parte del sistema— el CV ya calculado es la variable central, y existe un marco de referencia
publicado que conviene incorporar explícitamente al informe:

> Eerkens y Bettinger (2001) establecieron dos constantes de referencia para interpretar el CV de un
> conjunto de artefactos: **CV $\approx1{,}7\,\%$** es el límite inferior alcanzable por producción
> manual humana, derivado de la **fracción de Weber** para la estimación visual de longitudes
> (el mínimo perceptible sin instrumentos); y **CV $\approx57{,}7\,\%$** es el valor esperado si las
> dimensiones fueran aleatorias (distribución uniforme). Entre ambos se sitúa cualquier conjunto
> real, y su posición relativa —no el valor absoluto— es lo que informa sobre el grado de
> estandarización.

Esto convierte el CV de una descripción en un **contraste con hipótesis nulas explícitas**, que es
lo que la mejora C3 de ADR-015 plantea completar con **intervalos de confianza *bootstrap***
[Efron & Tibshirani 1993, cap. 12-14]: remuestrear con reemplazo $B\ge2000$ veces el conjunto,
recalcular el CV y tomar el percentil $[2{,}5;97{,}5]$. Con eso, la afirmación «el morfotipo A está
más estandarizado que el B» pasa de impresión a comparación con incertidumbre cuantificada. La
infraestructura (CV por métrica y por grupo) ya existe; falta el remuestreo.

---

<a id="11-clasificacion-morfologica"></a>

## §11. Clasificación morfológica

> **Módulos:** `metrics.py:805-946` (forma geométrica, 22 reglas) y `classifier.py` (tipología
> lítica + fusión EFA). **ADR-011** define la taxonomía canónica de categorías.

### 11.1 Naturaleza del clasificador

Es un **sistema experto de reglas ordenadas**, no un modelo entrenado. Conviene decirlo sin rodeos
porque determina cómo debe evaluarse: no tiene conjunto de entrenamiento, no tiene matriz de
confusión, y su «confianza» no es una probabilidad posterior. A cambio ofrece dos propiedades que un
clasificador entrenado no da: es **completamente auditable** (cada decisión se sigue leyendo una
condición explícita) y es **estable** (no depende de una semilla ni de un corpus de entrenamiento
que habría que publicar). Para un dominio con poca muestra etiquetada, es una elección defendible.

### 11.2 La cascada geométrica

Sobre la envolvente simplificada con $\varepsilon=\max(4,\ 0{,}03P)$ —una simplificación **gruesa**,
deliberadamente, para contar lados «arqueológicos» y no vértices de ráster— se evalúan en orden 22
reglas sobre el vector
$(c,\ c_{\text{frag}},\ \text{sol},\ \text{exc},\ \text{AR},\ n_v,\ \text{elong},\ \text{lob},\ \text{est},\ \text{concav.},\ n_{\text{rectos}},\ n_{\text{agudos}},\ n_{\text{obtusos}},\ \text{rect})$.
El orden **es parte del algoritmo**; los comentarios del código documentan por qué cada regla va
donde va. Los tres casos más instructivos:

| # | Clase | Condición | Razón del orden |
|---|---|---|---|
| 1 | **Lunar** | $\text{sol}<0{,}65$ ∧ concavidad $>8\%$ ∧ $c_{\text{frag}}<0{,}35$ ∧ $c>0{,}55$ | va **antes** que Anular porque comparte solidez baja; se distingue en que el arco abierto traza borde exterior **e** interior, lo que hunde $c_{\text{frag}}$ |
| 2 | **Anular/Perforado** | $\text{sol}<0{,}55$ ∧ concavidad $>25\%$ | topología con hueco interior |
| 6 | **Laminar** | $\text{AR}>3$ | va antes que las reglas de vértices porque una elipse muy alargada se reduce a $n_v=4$ con $\varepsilon=3\%$ |

La taxonomía resultante tiene 22 clases agrupadas en 5 categorías (ADR-011): **Curvilíneo**
(Circular, Subcircular, Elipsoidal, Laminar, Lanceolada, Amigdaloide, Lunar, Lobulado),
**Poligonal** (Triangular, Rectangular, Cuadrangular, Trapezoidal, Romboidal, Pentagonal, Hexagonal,
Poligonal), **Radial** (Estrellado), **Topológico** (Anular/Perforado) e **Irregular**.

**La «confianza» de la clasificación** es un valor específico de cada regla —$c$ para Circular,
$(\text{sol}+c)/2$ para Amigdaloide, $\min(\text{AR}/6,1)$ para Laminar…— es decir, **una medida de
cuán holgadamente se cumple la condición**, no una probabilidad. Debe leerse como grado de tipicidad.

> **Recomendación de bajo coste y alto valor (O-22).** Una cascada ordenada es discontinua en las
> fronteras: una pieza con $c=0{,}901$ es «Circular» y con $c=0{,}899$ es «Subcircular», sin que la
> salida refleje que estaba en el límite. Emitir, junto a la clase, **la segunda clase candidata y el
> margen** a su frontera convertiría un veredicto categórico en una lectura honesta de la evidencia,
> sin cambiar el algoritmo. Es especialmente relevante en un informe destinado a revisión externa.

### 11.3 Tipología lítica y fusión con EFA

`classifier.py:108-245`. Una segunda capa mapea la forma geométrica a categorías tipológicas
(Punta de proyectil, Lámina lítica, Raspador, Núcleo, Lasca, Indeterminado) y ajusta la confianza con
la firma espectral EFA (§6.5). La puntuación base combina la confianza de forma con una
«estabilidad geométrica»:

$$\text{estab}=0{,}45\,\text{sol}+0{,}35\,c+0{,}20\,(1-\text{rug}),
\qquad
\text{score}=0{,}70\,f_{\text{conf}}+0{,}30\,\text{estab}$$

y la fusión EFA suma o resta a lo sumo $0{,}08\cdot\text{conf}_{\text{EFA}}$, **sin cambiar nunca la
clase** — conservadurismo correcto.

> **Advertencia disciplinar que el documento debe hacer explícita.** La tipología lítica **no se
> define por el contorno**. Una lasca se identifica por atributos tecnológicos —talón, bulbo,
> ondas de percusión, negativos dorsales, córtex— que una silueta 2D no contiene
> [Inizan et al. 1999; Andrefsky 2005, cap. 4; Bordes 1961]. El mapeo de
> `classifier.py:122-139` es, por tanto, una **sugerencia de triaje**, no una determinación
> tipológica, y así debería etiquetarse en la interfaz y en las exportaciones. La contribución
> genuina y defendible de MAO en este terreno no es clasificar tipos, sino **cuantificar la forma**
> —EFA, métricas invariantes, morfoespacio— que es precisamente el enfoque que la morfometría
> geométrica ha consolidado en arqueología lítica [Cardillo 2010; Iovita 2011;
> Charlin & González-José 2012; Archer & Braun 2010; Lycett et al. 2006].

---
<a id="12-verificacion-que-esta-probado-y-como"></a>

## §12. Verificación: qué está probado y cómo

### 12.1 Estado de la suite

Ejecución realizada al preparar este documento (2026-09-13):

```
$ python -m pytest tests/ python/tests/ -q
398 passed, 2 skipped in 14.07s
```

Los 2 omitidos son los de paridad bifacial contra la instalación externa `MAO_A`, que se saltan si
esa copia no está presente (`pytest.skip(allow_module_level=True)`). **Nota de entorno:** la
ejecución se hizo con OpenCV 5.0.0 y NumPy 2.x, versiones más recientes que las fijadas en
`requirements-runtime.txt` (OpenCV 4.13.0.92, NumPy 2.0.2); que la suite pase igualmente es un
indicio favorable de robustez frente a la versión de las dependencias, pero **la ejecución de
referencia para un dictamen debe hacerse con las versiones fijadas**.

**Actualización (ADR-017 F4, mismo día).** Esa ejecución es anterior a F4, que añadió **22 tests**
(3 en `test_shape_template.py` y 19 en `test_adr017_calibracion.py`); la tabla de abajo ya los
incluye. Sobre `main` con F4 dentro, la suite da **401 passed / 4 skipped** en el contenedor donde
se preparó. Los totales **no son comparables entre entornos** —cuántos módulos se omiten depende de
las dependencias opcionales presentes—, así que lo que debe leerse es el **delta** (+22), no el
absoluto.

Distribución por módulo:

| Archivo | N.º | Qué verifica |
|---|---|---|
| `tests/test_detection.py` | 36 | segmentación, modo ROI, watershed, confianza |
| `python/tests/test_robustez_motor.py` | 24 | ausencia de fallos y de NaN/Inf ante entradas degeneradas |
| `python/tests/test_bajo_contraste.py` | 24 | cascada CLAHE / Z-scan / GrabCut en contraste bajo |
| `python/tests/test_phase4.py` | 22 | integración de endpoints |
| `tests/test_ph.py` | 21 | métricas de P/H y área neta |
| `tests/test_metrics.py` | 20 | repertorio 2D |
| `tests/test_contour.py` | 20 | extracción y refinamiento de contorno |
| `tests/test_morphometric_registry.py` | 19 | integridad del contrato ADR-006 |
| `tests/test_efa.py` | 21 | descriptor elíptico, invariancias y **fidelidad de la reconstrucción** |
| `tests/test_comparator.py` | 20 | PCA, estadística, bifacial y **umbral de atípicos** |
| `tests/test_obj3d_*.py` | 45 | motor 3D, ráster canónico, homologación |
| `python/tests/test_estandar_matematico.py` | 11 | **exactitud analítica e invariancia** |
| `tests/test_scale.py` | 8 | escala y error óptico |
| `python/tests/test_ph_candidates.py` | 8 | detección de huecos sin semillas |
| `python/tests/test_shape_template.py` | 33 | ajuste contra plantilla ideal (F1) y **umbrales calibrados (F4)** |
| `python/tests/test_adr017_f3_cableado.py` | 14 | cableado del emparejamiento al flujo (F3) |
| `python/tests/test_adr017_calibracion.py` | 19 | **concordancia método ↔ observador** (ICC, Bland-Altman, κ) |
| resto | 55 | persistencia, exportador, confianza de la detección asistida, salud del servidor, coherencia de entrega |

### 12.2 Pruebas de respuesta conocida (*known-answer*)

`python/tests/test_estandar_matematico.py` es la pieza de validación más relevante para un revisor:
compara la salida del motor —a través del *endpoint* real, no de la función interna— contra valores
**analíticos de libro**, con tolerancia del 3 % que absorbe la discretización del polígono:

| Forma | Propiedad verificada | Valor exacto |
|---|---|---|
| Círculo ($n=360$) | circularidad, ratio de Feret, solidez | $1$ |
| Círculo | excentricidad | $0$ (tol. 0,15) |
| Círculo | perímetro | $2\pi r$ |
| Círculo | regularidad radial, compacidad, convexidad, simetría | $\approx100$, $1$, $1$, $>0{,}98$ |
| Cuadrado | circularidad | $\pi/4=0{,}7854$ |
| Elipse $a{=}150,b{=}75$ | área | $\pi ab$ |
| Elipse | Feret máx / mín / ratio | $2a$ / $2b$ / $b/a$ |
| Elipse | elongación | $0{,}5$ |
| Rectángulo $200\times100$ | área, solidez, simetría | $wh$, $1$, $>0{,}98$ |
| Escalado $s=0{,}1$ | $A(\text{mm}^2)=A(\text{px}^2)s^2$, $P(\text{mm})=P(\text{px})s$ | homogeneidad dimensional |

**Validación cruzada contra la implementación de referencia del campo**
(`test_cross_validacion_vs_skimage_regionprops`): sobre la misma elipse rasterizada, la
excentricidad y la solidez calculadas por MAO **desde el contorno** deben concordar dentro de $0{,}03$
con las de `skimage.measure.regionprops` calculadas **desde el ráster**. Es la prueba más valiosa del
conjunto, porque contrasta dos caminos independientes (vectorial vs. matricial) contra una
implementación externa auditada [van der Walt et al. 2014].

### 12.3 Pruebas de invariancia

Parte B del mismo archivo: se toma una elipse base y se le aplican traslación, rotación (varios
ángulos) y escalado, exigiendo que **no cambien** nueve adimensionales: `circularity`, `solidity`,
`convexity`, `excentricidad`, `feret_ratio`, `elongation`, `compactness`, `regularidad_radial`,
`simetria_bilateral`. Es la verificación numérica del invariante rector de ADR-006 — con la
excepción explícita de `aspect_ratio_tight`, que se excluye de la rotación (véase O-5).

`tests/test_efa.py` hace lo propio para el descriptor de Fourier, con seis pruebas de invariancia
(rotación, traslación, escala, punto de inicio, parámetro de escala, reflexión) más la forma
canónica del primer armónico, la monotonía de la varianza acumulada y la saturación a Nyquist.
Reverificado durante la redacción de este documento: los errores máximos son del orden de
$5\times10^{-15}$, es decir, precisión de máquina.

### 12.4 Robustez y determinismo

`python/tests/test_robustez_motor.py` (24 pruebas) verifica que ningún módulo lanza excepciones no
controladas ni propaga `NaN`/`Inf` ante entradas degeneradas —contornos con menos de 3 puntos,
puntos colineales, coordenadas repetidas, parámetros de escala nulos o negativos— y que
`/api/metrics` es **determinista** (dos llamadas idénticas devuelven bit a bit lo mismo).

`python/tests/test_coherencia_entrega.py` (ADR-016) es un test de contrato de otra clase: comprueba
que 13 métricas canónicas llegan **con el mismo nombre y la misma unidad** al panel, la tabla, el CSV
y el PDF. Nació de una auditoría sobre un informe real que encontró 11 discrepancias entre el
backend y el renderizador (unidades px mostradas como mm, excentricidad leída de una clave
inexistente, regularidad radial multiplicada dos veces por 100). Es un buen ejemplo de una clase de
error que ninguna prueba matemática detecta: **el número correcto mal transportado**.

### 12.5 Qué NO está verificado (declaración explícita)

| Propiedad | Estado | Referencia |
|---|---|---|
| **Exactitud** frente a patrones de dimensión conocida (*trueness*): sesgo por métrica, límites de acuerdo de Bland-Altman | **no realizada** | ADR-015 A1 |
| **Reproducibilidad** intra e inter-observador (ICC, descomposición de varianza método/objeto) | **no realizada** | ADR-015 A2 |
| **Calibración** del índice de confianza de detección contra anotación manual | no realizada | §3.9 |
| **Fidelidad de la reconstrucción** EFA frente al contorno de entrada | ✔ cubierta desde 2026-09-13 (`TestReconstruccion`) — su ausencia fue lo que permitió O-16 | §6.2 |
| **Invariancia numérica** de cada métrica declarada de nivel H, recorriendo el registro | parcial (lista escrita a mano, no derivada del registro) | §7.1 |
| **Replicabilidad del contorno** ante cambio de ROI y de modo de captura | **abierta**, variación documentada de hasta $\pm20\,\%$ | ADR-013 F2 |
| Verificación visual en Electron de varios flujos de interfaz | pendiente (limitación de `<input type=file>`; hay un *hook* E2E) | ADR-010 |

Las dos primeras son las que separan a MAO de las herramientas ya certificadas del campo, y el
propio proyecto las identifica como su brecha principal («brecha de certificación», ADR-015 Eje 2).
Su diseño experimental está especificado: regresión medido-vs-real y límites de acuerdo
[Bland & Altman 1986] para exactitud; coeficiente de correlación intraclase
[Shrout & Fleiss 1979; Koo & Li 2016] para reproducibilidad. **Nada en la matemática del motor
impide ejecutarlas hoy**; requieren corpus de patrones medidos y réplicas por observador.

---

<a id="13-limitaciones-conocidas-y-observaciones-metodologicas"></a>

## §13. Limitaciones conocidas y observaciones metodológicas

Esta sección reúne, ordenadas por severidad, las observaciones formuladas a lo largo del documento.
Se distinguen las **detectadas al redactar esta memoria** (marcadas «nueva») de las que el proyecto
**ya tenía identificadas** en sus ADR. Todas son verificables contra el código citado; las que
llevan demostración numérica se reprodujeron con el módulo real el 2026-09-13.

### 13.1 Severidad alta — afectan a números publicables

| Id | Asunto | Efecto | Remedio | Seguimiento |
|---|---|---|---|---|
| **O-1** | Escala fotogramétrica en aproximación de campo lejano: $s=p\,d/f$ en vez de $p\,(d-f)/f$ | sesgo **sistemático multiplicativo** $f/(d-f)$ en toda magnitud en mm: 25 % a $d=500$ mm con $f=100$ mm. **No afecta a adimensionales.** | usar siempre la calibración por longitud conocida (§2.5), que lo absorbe; y añadir el término exacto | **nueva** |
| **O-20** | Umbral de atípicos de Mahalanobis fijado a $\sqrt{\chi^2_{0{,}975,2}}=2{,}716$ pero aplicado en dimensión $p$ | 67–100 % de objetos marcados como atípicos sobre datos **sin** atípicos; con $n\lesssim p$ todas las distancias colapsan; **con el $\chi^2$ de 13-09, 0 % marcados para $n\le30$ (umbral inalcanzable)** | ✔ **corregido** en dos pasos: gl por $r=\operatorname{rank}$ (13-09) y distribución exacta de Wilks (1.3.0), Python y espejo JS. Queda el estimador robusto para $n<3p$ | nueva · resuelta |
| **O-23** | Presupuesto óptico: $|k_1|\rho^2$ es desplazamiento de posición, no error de longitud radial ($3|k_1|\rho^2$) ni de área ($4|k_1|\rho^2$) | subestima la incertidumbre de la Sección IX: 5,3 % publicado frente a 14,4 % en una longitud radial (medido en la app contra OpenCV) | decidir el significado del campo (posicional vs dimensional) y, si es dimensional, jacobiano del modelo; nota de versión | **nueva (1.3.0)** · pendiente de ADR |
| **O-24** | `validation_stats.icc` calculaba ICC(3,1) (consistencia) con el nombre ICC(2,1) | Shrout & Fleiss Tabla 2: 0,71 publicado donde el acuerdo absoluto es 0,29; un 2º observador +5 % salía «excelente» (0,97) en vez de «moderado» (0,71). El IC del arnés F4 era el de consistencia (cobertura 14 %) | ✔ **corregido** (1.3.0): ICC(2,1) real + IC de McGraw & Wong caso 2A; arnés delega en la fuente única | **nueva (1.3.0)** · resuelta |
| **O-26** | `/api/shape-match` fijaba $\min$ arco 0,30/0,45 como valor por defecto y lo pasaba siempre | la app nunca usó los umbrales calibrados en ADR-017 F4 (0,40/0,50/0,60), sólo los tests del módulo | ✔ **corregido** (1.3.0): el endpoint no pisa los valores del módulo | **nueva (1.3.0)** · resuelta |
| — | Ausencia de validación de exactitud y de reproducibilidad | sin sesgo por métrica ni ICC publicados | Bland-Altman + ICC implementados y verificados (ADR-015 A1/A2, 1.3.0); **falta el corpus de patrones y el segundo observador** | ADR-015 **A1/A2** |
| **O-19** | Multicolinealidad exacta en el *pool* métrico (§5.5, §5.6, §5.8, §7.2) | PCA con varianza inflada en PC1 y cargas no interpretables | marcar derivadas en el registro; filtro VIF $<10$ | ADR-015 **C2** |
| **O-16** | Convenio de los coeficientes EFD desfasado 90° respecto de Kuhl-Giardina | **contorno reconstruido erróneo** (más redondeado) y coeficientes no intercambiables con Momocs/pyefd. ⚠ *No* es un espacio isométrico al canónico en general (corrección 2026-09-18, §6.2) | ✔ **corregido** (2026-09-13): síntesis arreglada + gate de fidelidad · ✔ **exportación en K&G** (1.3.1, ADR-021). Queda abierto adoptar el convenio en el descriptor interno (exige recalcular el banco EFA) | nueva · resuelta |
| **O-10** | `rugosidad_contorno` mide variabilidad del muestreo, no rugosidad física | clasificaba como «fracturada/erosionada» una cuenta intacta | redefinir como desviación radial respecto de la reconstrucción EFA de bajo orden | ADR-016 #6 (diferido) |
| — | Replicabilidad del contorno ante cambio de ROI/modo | variación de hasta $\pm20\,\%$; el color de fondo se estima desde el recorte | estimar el fondo siempre desde la imagen completa; gate de invariancia $\le2\,\%$ | ADR-013 **F2** |

### 13.2 Severidad media — afectan a la interpretación o a la comparabilidad

| Id | Asunto | Efecto | Remedio | Seguimiento |
|---|---|---|---|---|
| **O-2** | $k_1$ tabulado por FOV con convención de normalización distinta a la de OpenCV | incertidumbre del modelo $\pm30\,\%$; los coeficientes calibrados no son sustituibles sin conversión | consumir perfil de Zhang con el modelo Brown-Conrady en su convención | ADR-015 **B1** |
| **O-3** | Falta el término de relieve/paralaje en el presupuesto óptico | subestima la incertidumbre; $\approx2\,\%$ para $h=10$ mm a $d=500$ mm | añadir $\varepsilon_{\text{relieve}}=h/(d-h)$ al RSS | ADR-015 **B2** |
| **O-5** | `aspect_ratio` declarada nivel H pero apuntando a `aspect_ratio_tight` (dependiente de rotación) | contrato del registro incumplido; la suite lo excluye del test de rotación | redirigir a `eje_mayor/eje_menor` o a $1/\texttt{feret\_ratio}$ | **nueva** |
| **O-8** | Rectangularidad con caja alineada a los ejes, no con rectángulo de área mínima | depende de la orientación de la toma; no es la rectangularidad de Rosin | usar `minAreaRect`, o renombrar a *extent* | **nueva** |
| **O-14** | Entropía GLCM sumada sobre las 12 matrices $(d,\vartheta)$ mientras el resto se promedia | rango $[0,96]$ en vez de $[0,8]$; la regla «entropía $>5$» se dispara casi siempre | dividir por el número de pares | **nueva** |
| **O-15** | Píxeles fuera de máscara entran en la GLCM como nivel 0 | contraste inflado, homogeneidad deprimida, tanto más cuanto menor el objeto | enmascarar pares o recortar al rectángulo interior | **nueva** |
| **O-28** | Ambigüedad de 180° de la normalización EFA ($\theta_1$ módulo $\pi$, §6.3): el extremo del eje mayor depende del punto de inicio del contorno | los armónicos pares normalizados cambian de signo: la misma pieza con otro inicio da $d_{\text{EFD}}=0{,}589$; afecta a `efa.compare` (APS/Procrustes), a los coeficientes medios de secciones 3D y a cualquier PCA sobre normalizados; **no** al espectro ni a la varianza | elegir el extremo por un criterio intrínseco —la asimetría, como ya hace el TPS de ADR-021— y recalcular los bancos; o comparar con alineación del inicio | **nueva (1.3.1)** · pendiente de ADR |
| **O-7** | «Pérdida de perímetro por fragmentación» era $\le0$ por construcción | signo contraintuitivo en el informe | ✔ **resuelto** en `3a43f92`: signo corregido y renombrado `concavidad_perimetro_percent` | ADR-017 **F0** |
| **O-11** | Normalización anisótropa (por rangos independientes) antes del box-counting | $D$ depende ligeramente de la relación de aspecto | normalizar por el lado mayor | **nueva** |
| **O-17** | Coherencia 2D↔3D imputa $0{,}5$ a los componentes ausentes | no distingue «media» de «sin datos» | reportar el número de componentes efectivos | **nueva** |
| **O-18** | Imputación por mediana sin reportar la fracción imputada | atenúa varianza y correlaciones sin dejar rastro | emitir `% celdas imputadas` | **nueva** |
| **O-21** | $p$-valores de correlación sin corrección por multiplicidad | ~10 falsos positivos esperados con 20 variables | control FDR [Benjamini & Hochberg 1995] | **nueva** |
| **O-22** | La cascada de clasificación no expone la segunda clase ni el margen | veredicto categórico en fronteras arbitrariamente próximas | emitir clase alternativa y margen | **nueva** |
| — | Simetría bilateral por desajuste de contorno, no descomposición formal | sin prueba de significación de la asimetría | descomposición de Klingenberg + ANOVA de Procrustes | ADR-015 **D1** |
| — | Morfoespacio multivariante externalizado a R/Momocs | flujo partido; sin elipses de confianza in-app | módulo `morphospace.py` con PCA/CVA | ADR-015 **C1** |
| **O-25** | CV de estandarización con IC *bootstrap* de percentiles | cobertura real 72–88 % para un 95 % nominal con $n=8$–$30$: IC demasiado estrechos, contrastes entre morfotipos optimistas | ✔ **corregido** (1.3.0): IC de McKay modificado [Vangel 1996], cobertura 92–97 % también con datos log-normales | ADR-015 **C3** · resuelta |
| **O-27** | Perfil «línea recta» de `calibracion_lente.html` v1.0: $k_1=-4\delta/r^2$ con $\delta,r$ en **píxeles** (px$^{-1}$) | leído como adimensional: 0,011 % de distorsión donde la real es 5,3 % — peor que sin perfil | ✔ en MAO (1.3.0): sin `k1_normalizacion` declarada el $k_1$ no se usa y se declara; ✗ la fórmula de la herramienta sigue sin corregir | **nueva (1.3.0)** |

### 13.3 Severidad baja — higiene documental y precisión terminológica

| Id | Asunto | Remedio |
|---|---|---|
| **O-4** | Distancias de color en RGB euclídeo, no perceptualmente uniforme | migrar a CIELAB / CIEDE2000; impacto acotado por los umbrales adaptativos |
| **O-6** | Cuatro nombres para una circularidad (y sus análogos) | declarar `derivada_de` en el registro; mantener los alias solo en la capa de presentación |
| **O-9** | `curvatura_local` declarada «adimensional» siendo px$^{-1}$ | corregir el campo `unidad` del registro |
| **O-12** | Ángulos de vértice no orientados (un vértice reflejo se cuenta como su suplementario) | signar con el producto vectorial |
| **O-13** | Profundidades de defectos de convexidad en px, sin conversión a mm | multiplicar por $s$ como el resto de longitudes |
| — | `puntos_inflexion` cuenta atípicos de curvatura, no inflexiones | usar curvatura con signo o renombrar |
| — | Umbral absoluto de 5 px para aceptar defectos de convexidad | expresarlo como fracción del perímetro |

### 13.4 Lectura de conjunto

Ninguna de las observaciones invalida el motor. Su distribución es informativa: **las de severidad
alta se concentran en las capas de calibración física y de estadística inferencial, no en el núcleo
geométrico**, que es la parte verificada contra valores analíticos y contra una implementación
externa de referencia. Dicho de otro modo, MAO Plus mide bien la forma —lo que hace bien y con
pruebas— y sus puntos débiles están en (a) convertir esa forma a milímetros absolutos con
trazabilidad completa y (b) el aparato inferencial que se aplica después. Ambas son áreas donde el
proyecto ya tiene un plan aprobado y por fases (ADR-015).

**Estado al cierre de esta revisión.** De las tres observaciones nuevas de severidad alta, **dos ya
están corregidas con su gate de prueba**: el grado de libertad del umbral de Mahalanobis (O-20) y la
síntesis del EFA (O-16), ambas el 2026-09-13. La tercera —el término $-f$ de la escala (O-1)— no es
un parche de dos líneas: cambia valores ya exportados a CSV/PDF y exige fijar antes qué significa
operativamente «distancia» en el protocolo de campo, de modo que corresponde a un ADR con su nota de
versión, como se hizo con ADR-017 F0. Su comprobación previa es barata y no toca código: si los
proyectos guardados registran factores de corrección de escala, deben agruparse en torno a $1-f/d$.

**Estado en MAO Plus 1.3.0 (2026-09-15).** Una verificación independiente de las mejoras de
ADR-015 y ADR-017 contra referencias externas (tabla publicada de Shrout & Fleiss, OpenCV, scipy,
simulación de cobertura, fragmentos generados con otro generador) cerró **O-20** con la distribución
de Wilks y corrigió **O-24, O-25 y O-26**. Quedan pendientes de decisión, por cambiar valores ya
exportados, **O-1** (término $-f$ de la escala, ADR-020 reservado) y **O-23** (significado dimensional
del presupuesto óptico).

**Estado en MAO Plus 1.3.1 (2026-09-18, ADR-021).** Contrastar la exportación contra una implementación
de Kuhl & Giardina escrita aparte llevó a exportar los coeficientes en ese convenio, a corregir la
afirmación de isometría de O-16 (§6.2) y a registrar **O-28**, la ambigüedad de 180° de la
normalización, que queda pendiente de ADR porque su corrección cambia el descriptor interno.

---
<a id="14-bibliografia"></a>

## §14. Bibliografía

Se citan solo obras verificables. Se incluye **DOI cuando ha podido comprobarse**; cuando no se
indica DOI, las coordenadas bibliográficas completas (revista, volumen, número, páginas y año)
bastan para localizar la obra en cualquier catálogo — se ha preferido omitir un identificador
antes que arriesgar uno transcrito de memoria. Las referencias marcadas **[impl.]** están además
citadas dentro del propio código fuente del proyecto.

### Morfometría de contornos y análisis de forma

- **Kuhl, F. P. & Giardina, C. R.** (1982). Elliptic Fourier features of a closed contour.
  *Computer Graphics and Image Processing* 18(3): 236–258. doi:10.1016/0146-664X(82)90034-X **[impl.]**
- **Rohlf, F. J. & Archie, J. W.** (1984). A comparison of Fourier methods for the description of
  wing shape in mosquitoes (Diptera: Culicidae). *Systematic Zoology* 33(3): 302–317.
- **Crampton, J. S.** (1995). Elliptic Fourier shape analysis of fossil bivalves: some practical
  considerations. *Lethaia* 28(2): 179–186. doi:10.1111/j.1502-3931.1995.tb01611.x
- **Caple, J., Byrd, J. & Stephan, C. N.** (2017). Elliptical Fourier analysis: fundamentals,
  applications, and value for forensic anthropology. *International Journal of Legal Medicine*
  131(6): 1675–1690. doi:10.1007/s00414-017-1555-0
- **Bonhomme, V., Picq, S., Gaucherel, C. & Claude, J.** (2014). Momocs: Outline Analysis Using R.
  *Journal of Statistical Software* 56(13): 1–24. doi:10.18637/jss.v056.i13
- **Claude, J.** (2008). *Morphometrics with R*. Springer. doi:10.1007/978-0-387-77789-4
- **Bookstein, F. L.** (1991). *Morphometric Tools for Landmark Data: Geometry and Biology*.
  Cambridge University Press.
- **Dryden, I. L. & Mardia, K. V.** (2016). *Statistical Shape Analysis, with Applications in R*,
  2.ª ed. Wiley. doi:10.1002/9781119072492
- **Gower, J. C.** (1975). Generalized Procrustes analysis. *Psychometrika* 40(1): 33–51.
  doi:10.1007/BF02291478
- **Rohlf, F. J. & Slice, D.** (1990). Extensions of the Procrustes method for the optimal
  superimposition of landmarks. *Systematic Zoology* 39(1): 40–59.
- **Adams, D. C. & Otárola-Castillo, E.** (2013). geomorph: an R package for the collection and
  analysis of geometric morphometric shape data. *Methods in Ecology and Evolution* 4(4): 393–399.
  doi:10.1111/2041-210X.12035
- **Klingenberg, C. P. & McIntyre, G. S.** (1998). Geometric morphometrics of developmental
  instability: analyzing patterns of fluctuating asymmetry with Procrustes methods. *Evolution*
  52(5): 1363–1375.
- **Klingenberg, C. P.** (2015). Analyzing fluctuating asymmetry with geometric morphometrics:
  concepts, methods, and applications. *Symmetry* 7(2): 843–934. doi:10.3390/sym7020843

### Descriptores geométricos de forma y de partículas

- **Cox, E. P.** (1927). A method of assigning numerical and percentage values to the degree of
  roundness of sand grains. *Journal of Paleontology* 1(3): 179–183.
- **Wadell, H.** (1932). Volume, shape, and roundness of rock particles. *The Journal of Geology*
  40(5): 443–451. doi:10.1086/623964
- **Wadell, H.** (1935). Volume, shape, and roundness of quartz particles. *The Journal of Geology*
  43(3): 250–280. doi:10.1086/624298 **[impl.]**
- **Blott, S. J. & Pye, K.** (2008). Particle shape: a review and new methods of characterization
  and classification. *Sedimentology* 55(1): 31–63. doi:10.1111/j.1365-3091.2007.00892.x
- **ISO** (2008). *ISO 9276-6:2008 — Representation of results of particle size analysis, Part 6:
  Descriptive and quantitative representation of particle shape and morphology*.
- **Rosin, P. L.** (2003). Measuring shape: ellipticity, rectangularity, and triangularity.
  *Machine Vision and Applications* 14(3): 172–184. doi:10.1007/s00138-002-0118-6
- **Žunić, J. & Rosin, P. L.** (2004). A new convexity measure for polygons. *IEEE Transactions on
  Pattern Analysis and Machine Intelligence* 26(7): 923–934. doi:10.1109/TPAMI.2004.19
- **Hu, M.-K.** (1962). Visual pattern recognition by moment invariants. *IRE Transactions on
  Information Theory* 8(2): 179–187. doi:10.1109/TIT.1962.1057692
- **Steger, C.** (1996). *On the Calculation of Moments of Polygons*. Technical Report FGBV-96-04,
  Forschungsgruppe Bildverstehen, Technische Universität München.
- **Braden, B.** (1986). The surveyor's area formula. *The College Mathematics Journal* 17(4):
  326–337.
- **Walton, W. H.** (1948). Feret's statistical diameter as a measure of particle size. *Nature*
  162: 329–330.
- **Toussaint, G. T.** (1983). Solving geometric problems with the rotating calipers.
  *Proceedings of IEEE MELECON'83*, Atenas.
- **Léger, J.-C.** (1999). Menger curvature and rectifiability. *Annals of Mathematics* 149(3):
  831–869.
- **Mandelbrot, B. B.** (1967). How long is the coast of Britain? Statistical self-similarity and
  fractional dimension. *Science* 156(3775): 636–638. doi:10.1126/science.156.3775.636
- **Falconer, K.** (2003). *Fractal Geometry: Mathematical Foundations and Applications*, 2.ª ed.
  Wiley. doi:10.1002/0470013850
- **Costa, L. da F. & Cesar Jr., R. M.** (2009). *Shape Classification and Analysis: Theory and
  Practice*, 2.ª ed. CRC Press.
- **Russ, J. C.** (2011). *The Image Processing Handbook*, 6.ª ed. CRC Press.

### Visión por computador y procesamiento de imagen

- **Otsu, N.** (1979). A threshold selection method from gray-level histograms. *IEEE Transactions
  on Systems, Man, and Cybernetics* 9(1): 62–66. doi:10.1109/TSMC.1979.4310076 **[impl.]**
- **Suzuki, S. & Abe, K.** (1985). Topological structural analysis of digitized binary images by
  border following. *Computer Vision, Graphics, and Image Processing* 30(1): 32–46.
  doi:10.1016/0734-189X(85)90016-7 **[impl.]**
- **Douglas, D. H. & Peucker, T. K.** (1973). Algorithms for the reduction of the number of points
  required to represent a digitized line or its caricature. *The Canadian Cartographer* 10(2):
  112–122. doi:10.3138/FM57-6770-U75U-7727 **[impl.]**
- **Sklansky, J.** (1982). Finding the convex hull of a simple polygon. *Pattern Recognition Letters*
  1(2): 79–83. doi:10.1016/0167-8655(82)90016-2
- **Barber, C. B., Dobkin, D. P. & Huhdanpää, H.** (1996). The Quickhull algorithm for convex hulls.
  *ACM Transactions on Mathematical Software* 22(4): 469–483. doi:10.1145/235815.235821
- **Rother, C., Kolmogorov, V. & Blake, A.** (2004). "GrabCut": interactive foreground extraction
  using iterated graph cuts. *ACM Transactions on Graphics* 23(3): 309–314.
  doi:10.1145/1015706.1015720 **[impl.]**
- **Boykov, Y. & Jolly, M.-P.** (2001). Interactive graph cuts for optimal boundary & region
  segmentation of objects in N-D images. *Proceedings ICCV 2001*, vol. 1: 105–112.
- **Boykov, Y. & Kolmogorov, V.** (2004). An experimental comparison of min-cut/max-flow algorithms
  for energy minimization in vision. *IEEE TPAMI* 26(9): 1124–1137. doi:10.1109/TPAMI.2004.60
- **Zuiderveld, K.** (1994). Contrast limited adaptive histogram equalization. En: *Graphics Gems IV*,
  474–485. Academic Press. doi:10.1016/B978-0-12-336156-1.50061-6 **[impl.]**
- **Pizer, S. M. et al.** (1987). Adaptive histogram equalization and its variations. *Computer
  Vision, Graphics, and Image Processing* 39(3): 355–368. doi:10.1016/S0734-189X(87)80186-X
- **Beucher, S. & Lantuéjoul, C.** (1979). Use of watersheds in contour detection. *International
  Workshop on Image Processing: Real-time Edge and Motion Detection/Estimation*, Rennes.
- **Vincent, L. & Soille, P.** (1991). Watersheds in digital spaces: an efficient algorithm based on
  immersion simulations. *IEEE TPAMI* 13(6): 583–598. doi:10.1109/34.87344
- **Meyer, F.** (1994). Topographic distance and watershed lines. *Signal Processing* 38(1): 113–125.
  doi:10.1016/0165-1684(94)90060-4 **[impl.]**
- **Serra, J.** (1982). *Image Analysis and Mathematical Morphology*. Academic Press.
- **Soille, P.** (2003). *Morphological Image Analysis: Principles and Applications*, 2.ª ed.
  Springer. doi:10.1007/978-3-662-05088-0
- **Rosenfeld, A. & Pfaltz, J. L.** (1966). Sequential operations in digital picture processing.
  *Journal of the ACM* 13(4): 471–494. doi:10.1145/321356.321357
- **Felzenszwalb, P. F. & Huttenlocher, D. P.** (2012). Distance transforms of sampled functions.
  *Theory of Computing* 8: 415–428. doi:10.4086/toc.2012.v008a019
- **Haralick, R. M., Shanmugam, K. & Dinstein, I.** (1973). Textural features for image
  classification. *IEEE Transactions on Systems, Man, and Cybernetics* 3(6): 610–621.
  doi:10.1109/TSMC.1973.4309314 **[impl.]**
- **Kass, M., Witkin, A. & Terzopoulos, D.** (1988). Snakes: active contour models. *International
  Journal of Computer Vision* 1(4): 321–331. doi:10.1007/BF00133570
- **Förstner, W. & Gülch, E.** (1987). A fast operator for detection and precise location of distinct
  points, corners and centres of circular features. *Proc. ISPRS Intercommission Workshop*,
  Interlaken: 281–305.
- **Duda, R. O. & Hart, P. E.** (1973). *Pattern Classification and Scene Analysis*. Wiley
  (operador de Sobel, pp. 271–272).
- **Huttenlocher, D. P., Klanderman, G. A. & Rucklidge, W. J.** (1993). Comparing images using the
  Hausdorff distance. *IEEE TPAMI* 15(9): 850–863. doi:10.1109/34.232073
- **Dubuisson, M.-P. & Jain, A. K.** (1994). A modified Hausdorff distance for object matching.
  *Proceedings ICPR 1994*, vol. 1: 566–568.
- **Shimrat, M.** (1962). Algorithm 112: Position of point relative to polygon. *Communications of
  the ACM* 5(8): 434.
- **Hormann, K. & Agathos, A.** (2001). The point in polygon problem for arbitrary polygons.
  *Computational Geometry* 20(3): 131–144.
- **West, K. F. et al.** (2004). Context-driven automated target detection in 3-D data.
  *Proceedings of SPIE* 5426: 133–143.
- **Demantké, J., Mallet, C., David, N. & Vallet, B.** (2011). Dimensionality based scale selection
  in 3D LiDAR point clouds. *ISPRS Archives* XXXVIII-5/W12: 97–102.
- **Kirillov, A. et al.** (2023). Segment Anything. *Proceedings of the IEEE/CVF International Conference on Computer Vision (ICCV 2023)*.
  arXiv:2304.02643
- **Sharma, G., Wu, W. & Dalal, E. N.** (2005). The CIEDE2000 color-difference formula:
  implementation notes, supplementary test data, and mathematical observations. *Color Research &
  Application* 30(1): 21–30. doi:10.1002/col.20070
- **Shannon, C. E.** (1948). A mathematical theory of communication. *Bell System Technical Journal*
  27(3): 379–423 y 27(4): 623–656. doi:10.1002/j.1538-7305.1948.tb01338.x

### Óptica, fotogrametría y metrología

- **Brown, D. C.** (1966). Decentering distortion of lenses. *Photogrammetric Engineering* 32(3):
  444–462.
- **Brown, D. C.** (1971). Close-range camera calibration. *Photogrammetric Engineering* 37(8):
  855–866.
- **Zhang, Z.** (2000). A flexible new technique for camera calibration. *IEEE TPAMI* 22(11):
  1330–1334. doi:10.1109/34.888718
- **Hartley, R. & Zisserman, A.** (2004). *Multiple View Geometry in Computer Vision*, 2.ª ed.
  Cambridge University Press. doi:10.1017/CBO9780511811685
- **Luhmann, T., Robson, S., Kyle, S. & Boehm, J.** (2019). *Close-Range Photogrammetry and 3D
  Imaging*, 3.ª ed. De Gruyter. doi:10.1515/9783110607253
- **JCGM** (2008). *JCGM 100:2008 — Evaluation of measurement data: Guide to the expression of
  uncertainty in measurement (GUM)*. BIPM.
- **JCGM** (2012). *JCGM 200:2012 — International vocabulary of metrology (VIM)*, 3.ª ed. BIPM.
- **Bland, J. M. & Altman, D. G.** (1986). Statistical methods for assessing agreement between two
  methods of clinical measurement. *The Lancet* 327(8476): 307–310.
  doi:10.1016/S0140-6736(86)90837-8

### Estadística

- **Pearson, K.** (1901). On lines and planes of closest fit to systems of points in space.
  *Philosophical Magazine* 2(11): 559–572. doi:10.1080/14786440109462720
- **Hotelling, H.** (1933). Analysis of a complex of statistical variables into principal components.
  *Journal of Educational Psychology* 24(6): 417–441 y 24(7): 498–520. doi:10.1037/h0071325
- **Jolliffe, I. T.** (2002). *Principal Component Analysis*, 2.ª ed. Springer.
  doi:10.1007/b98835
- **MacQueen, J.** (1967). Some methods for classification and analysis of multivariate observations.
  *Proceedings of the Fifth Berkeley Symposium on Mathematical Statistics and Probability* 1:
  281–297.
- **Lloyd, S. P.** (1982). Least squares quantization in PCM. *IEEE Transactions on Information
  Theory* 28(2): 129–137. doi:10.1109/TIT.1982.1056489
- **Arthur, D. & Vassilvitskii, S.** (2007). k-means++: the advantages of careful seeding.
  *Proceedings SODA 2007*: 1027–1035.
- **Rousseeuw, P. J.** (1987). Silhouettes: a graphical aid to the interpretation and validation of
  cluster analysis. *Journal of Computational and Applied Mathematics* 20: 53–65.
  doi:10.1016/0377-0427(87)90125-7
- **Mahalanobis, P. C.** (1936). On the generalised distance in statistics. *Proceedings of the
  National Institute of Sciences of India* 2(1): 49–55.
- **Rousseeuw, P. J. & Van Driessen, K.** (1999). A fast algorithm for the minimum covariance
  determinant estimator. *Technometrics* 41(3): 212–223. doi:10.1080/00401706.1999.10485670
- **Benjamini, Y. & Hochberg, Y.** (1995). Controlling the false discovery rate: a practical and
  powerful approach to multiple testing. *Journal of the Royal Statistical Society B* 57(1):
  289–300. doi:10.1111/j.2517-6161.1995.tb02031.x
- **Efron, B. & Tibshirani, R. J.** (1993). *An Introduction to the Bootstrap*. Chapman & Hall.
  doi:10.1007/978-1-4899-4541-9
- **Shrout, P. E. & Fleiss, J. L.** (1979). Intraclass correlations: uses in assessing rater
  reliability. *Psychological Bulletin* 86(2): 420–428. doi:10.1037/0033-2909.86.2.420
- **Koo, T. K. & Li, M. Y.** (2016). A guideline of selecting and reporting intraclass correlation
  coefficients for reliability research. *Journal of Chiropractic Medicine* 15(2): 155–163.
  doi:10.1016/j.jcm.2016.02.012
- **Huber, P. J. & Ronchetti, E. M.** (2009). *Robust Statistics*, 2.ª ed. Wiley.
  doi:10.1002/9780470434697
- **Little, R. J. A. & Rubin, D. B.** (2019). *Statistical Analysis with Missing Data*, 3.ª ed.
  Wiley. doi:10.1002/9781119482260
- **Duda, R. O., Hart, P. E. & Stork, D. G.** (2001). *Pattern Classification*, 2.ª ed. Wiley.
- **Sokal, R. R. & Rohlf, F. J.** (1995). *Biometry*, 3.ª ed. W. H. Freeman.

### Arqueología: tipología, morfometría y estandarización

- **Bordes, F.** (1961). *Typologie du Paléolithique ancien et moyen*. Delmas, Burdeos.
- **Inizan, M.-L., Reduron-Ballinger, M., Roche, H. & Tixier, J.** (1999). *Technology and
  Terminology of Knapped Stone*. CREP, Nanterre.
- **Andrefsky, W.** (2005). *Lithics: Macroscopic Approaches to Analysis*, 2.ª ed. Cambridge
  University Press. doi:10.1017/CBO9780511810244
- **Eerkens, J. W. & Bettinger, R. L.** (2001). Techniques for assessing standardization in artifact
  assemblages: can we scale material variability? *American Antiquity* 66(3): 493–504.
- **Lyman, R. L. & VanPool, T. L.** (2009). Metric data in archaeology: a study of intra-analyst and
  inter-analyst variation. *American Antiquity* 74(3): 485–504.
- **Cardillo, M.** (2010). Some applications of geometric morphometrics to archaeology. En:
  Elewa, A. M. T. (ed.), *Morphometrics for Nonmorphometricians*, Lecture Notes in Earth Sciences
  124: 325–341. Springer. doi:10.1007/978-3-540-95853-6_15
- **Charlin, J. & González-José, R.** (2012). Size and shape variation in Late Holocene projectile
  points of southern Patagonia: a geometric morphometric study. *American Antiquity* 77(2):
  221–242.
- **Iovita, R.** (2011). Shape variation in Aterian tanged tools and the origins of projectile
  technology: a morphometric perspective on stone tool function. *PLoS ONE* 6(12): e29029.
  doi:10.1371/journal.pone.0029029
- **Archer, W. & Braun, D. R.** (2010). Variability in bifacial technology at Elandsfontein, Western
  Cape, South Africa: a geometric morphometric approach. *Journal of Archaeological Science* 37(1):
  201–209. doi:10.1016/j.jas.2009.09.033
- **Lycett, S. J., von Cramon-Taubadel, N. & Foley, R. A.** (2006). A crossbeam co-ordinate caliper
  for the morphometric analysis of lithic nuclei. *Journal of Archaeological Science* 33(6):
  847–861. doi:10.1016/j.jas.2005.10.014

### Herramientas comparables del campo

- **Gellis, J. J., Rangel Smith, C. & Foley, R. A.** (2022). PyLithics: A Python package for stone
  tool analysis. *Journal of Open Source Software* 7(69): 3738. doi:10.21105/joss.03738
- **Herzlinger, G. & Grosman, L.** (2018). AGMT3-D: A software for 3-D landmarks-based geometric
  morphometric shape analysis of archaeological artifacts. *PLoS ONE* 13(11): e0207890.
  doi:10.1371/journal.pone.0207890
- **Grosman, L. et al.** (2022). Artifact3-D: New software for accurate, objective and efficient 3D
  analysis and documentation of archaeological artifacts. *PLoS ONE* 17(6): e0268401.
  doi:10.1371/journal.pone.0268401

### Bibliotecas de cálculo empleadas

- **Bradski, G.** (2000). The OpenCV Library. *Dr. Dobb's Journal of Software Tools*.
- **Harris, C. R. et al.** (2020). Array programming with NumPy. *Nature* 585: 357–362.
  doi:10.1038/s41586-020-2649-2
- **Virtanen, P. et al.** (2020). SciPy 1.0: fundamental algorithms for scientific computing in
  Python. *Nature Methods* 17: 261–272. doi:10.1038/s41592-019-0686-2
- **van der Walt, S. et al.** (2014). scikit-image: image processing in Python. *PeerJ* 2: e453.
  doi:10.7717/peerj.453
- **Pedregosa, F. et al.** (2011). Scikit-learn: machine learning in Python. *Journal of Machine
  Learning Research* 12: 2825–2830.

---

<a id="anexo-a--tabla-maestra-de-metricas"></a>

## Anexo A — Tabla maestra de métricas

Resumen de una página. **Inv.** = invariancia ante Traslación / Rotación / Escala. **Niv.** = nivel
en el registro canónico (H = núcleo comparable, P = proxy, 2D/3D = exclusiva de modalidad,
— = no registrada). $A_h,P_h$ = envolvente convexa; $A_r,P_r$ = contorno real.

### Geometría y tamaño (dimensionales — llevan incertidumbre óptica)

| Clave | Fórmula | Unidad | Inv. | Niv. | § |
|---|---|---|---|---|---|
| `area` | $A_h\,s^2$ | mm² | ✓✓✗ | — | 5.1 |
| `area_real` = `area_fragmentada` | $A_r\,s^2$ | mm² | ✓✓✗ | — | 5.1 |
| `perimeter` | $P_h\,s$ | mm | ✓✓✗ | — | 5.1 |
| `perimeter_real` | $P_r\,s$ | mm | ✓✓✗ | — | 5.1 |
| `width` / `height` | lados de la caja de $\mathcal H$ | mm | ✓✗✗ | — | 5.4 |
| `eje_mayor` / `eje_menor` | extensión sobre ejes principales | mm | ✓✓✗ | — | 5.8 |
| `feret_max` / `feret_min` | máx./mín. anchura de calibre | mm | ✓✓✗ | — | 5.9 |
| `radio_maximo/minimo/medio` | distancias a $c^{\mathcal H}$ | mm | ✓✓✗ | — | 5.10 |
| `radio_giro_mayor` | $\sqrt{\lambda_1}$ | mm | ✓✓✗ | — | 5.8 |
| `centroide`, `centroide_hull_*` | Shoelace | px | ✗✗✗ | — | 5.2 |
| `angulo_eje_principal` | $\theta \bmod 180°$ | grados | ✓✗✓ | — | 5.8 |

### Forma (adimensionales — núcleo comparable)

| Clave | Fórmula | Rango | Inv. | Niv. | § |
|---|---|---|---|---|---|
| `circularity` | $4\pi A_h/P_h^2$ | (0,1] | ✓✓✓ | **H** | 5.5 |
| `circularity_fragmentada` | $4\pi A_r/P_r^2$ | (0,1] | ✓✓✓ | — | 5.5 |
| `compactness` | $\equiv$ `circularity` | (0,1] | ✓✓✓ | — | 5.5 |
| `shape_factor` | $1/c$ | [1,∞) | ✓✓✓ | — | 5.5 |
| `indice_lobularidad` | $c^{-1/2}$ | [1,∞) | ✓✓✓ | — | 5.5 |
| `contour_complexity_index` | $c_{\text{frag}}^{-1/2}$ | [1,∞) | ✓✓✓ | **H** | 5.5 |
| `solidity` | $A_r/A_h$ | (0,1] | ✓✓✓ | **H** | 5.6 |
| `convexity` | $\min(P_h/P_r,1)$ | (0,1] | ✓✓✓ | **H** | 5.6 |
| `concavidad_area_percent` | $100(1-\text{sol})$ | [0,100) | ✓✓✓ | — | 5.6 |
| `concavidad_perimetro_percent` | $100(1/\text{conv}-1)$ | [0,∞) | ✓✓✓ | — | 5.6 |
| `indice_convexidad_percent` | $40\,\text{conv}+60\,\text{sol}$ | [0,100] | ✓✓✓ | — | 5.6 |
| `rectangularity` | $A_r/A_{\text{bbox}}$ | (0,1] | ✓**✗**✓ | — | 5.7 |
| `aspect_ratio_tight` | $w/h$ de la caja | (0,∞) | ✓**✗**✓ | **H**⚠ | 5.4 |
| `elongation` | $1-\text{eje}_{\min}/\text{eje}_{\max}$ | [0,1) | ✓✓✓ | **H** | 5.8 |
| `excentricidad` | $\sqrt{1-(\text{eje}_{\min}/\text{eje}_{\max})^2}$ | [0,1] | ✓✓✓ | **H** | 5.8 |
| `excentricidad_eliptica` | $\sqrt{1-\lambda_2/\lambda_1}$ | [0,1] | ✓✓✓ | — | 5.8 |
| `isotropia_inercial` | $\lambda_2/\lambda_1$ | (0,1] | ✓✓✓ | — | 5.8 |
| `elongacion_inercia` | $\sqrt{\lambda_1/\lambda_2}$ | [1,∞) | ✓✓✓ | — | 5.8 |
| `eje_principal_anisotropia` | $(\lambda_1-\lambda_2)/(\lambda_1+\lambda_2)$ | [0,1] | ✓✓✓ | — | 5.8 |
| `feret_ratio` | $F_{\min}/F_{\max}$ | (0,1] | ✓✓✓ | **H** | 5.9 |
| `ratio_radios` | $R_{\min}/R_{\max}$ | [0,1] | ✓✓✓ | — | 5.10 |
| `regularidad_radial` | $100\,R_{\min}/R_{\max}$ | [0,100] | ✓✓✓ | — | 5.10 |
| `coeficiente_variacion_radial` | $100\,\sigma_R/\bar R$ | [0,∞) | ✓✓✓ | — | 5.10 |
| `indice_estrellamiento` | $(R_{\max}-R_{\min})/\bar R$ | [0,∞) | ✓✓✓ | — | 5.10 |
| `simetria_bilateral` | $1-d_{\text{asim}}/\bar R$ | [0,1] | ✓✓✓ | **H** | 5.14 |
| `fraccion_arco_concavo` | $\sum\text{arco}_j/P_r$ | [0,1] | ✓✓✓ | — | 5.16 |
| `efa.coefficients` | EFD normalizado, $4K$ valores | ℝ | ✓✓✓ | **H** | 6 |

### Textura y borde (dependientes del muestreo)

| Clave | Fórmula | Unidad | Inv. | Niv. | § |
|---|---|---|---|---|---|
| `curvatura_media/maxima/desviacion` | Menger $4\mathcal A/(abc)$ | px⁻¹ | ✓✓✗ | 2D | 5.11 |
| `energia_curvatura` | $\overline{\kappa^2}$ | px⁻² | ✓✓✗ | — | 5.11 |
| `rugosidad_contorno` | $\sigma_L/\bar L$ | adim. | ✓✓~ | 2D | 5.12 |
| `fractal_dimension` | box-counting | adim. | ✓✓~ | 2D | 5.13 |
| `varianza_interna` | $\operatorname{Var}(I)$ | niveles² | ✓✓✓ | 2D | 5.17 |
| `entropia_superficie` | $-\sum p\log_2 p$ | bits | ✓✓✓ | 2D | 5.17 |
| `gradiente_medio` | $\overline{\lVert\nabla I\rVert}$ | niveles/px | ✓✓✗ | — | 5.17 |
| `glcm.*` | Haralick (6) | adim. | ✓✗✗ | 2D | 5.17 |
| `convexity_defects.*` | profundidad respecto de $\mathcal H$ | px | ✓✓✗ | 2D | 5.16 |

### Índices compuestos

| Clave | Definición | Rango | § |
|---|---|---|---|
| `detection_confidence` | $0{,}65\,\text{contraste}+0{,}35\,\text{extent}$ | [0,1] ⚠ | 3.9 |
| `quality.score` | $A_r/A_{\text{bbox}}$ | [0,1] | 4.7 |
| `forma_confianza` | específico de cada regla | [0,1] ⚠ | 11.2 |
| `indiceSimetriaGeneral` | 6 componentes ponderados | [0,1] ⚠ | 9.2 |
| `CI` / `CMS` | coherencia identitaria / de superficie | [0,1] ⚠ | 9.3 |
| coherencia 2D↔3D | 5 componentes ponderados | [0,1] ⚠ | 7.4 |
| `error_lineal_percent` / `error_area_percent` | RSS de distorsión y perspectiva | % | 2.4 |

⚠ = índice heurístico de triaje, no probabilidad ni estimador calibrado.

---

<a id="anexo-b--mapa-de-trazabilidad-formula--codigo"></a>

## Anexo B — Mapa de trazabilidad fórmula ↔ código

Referencias verificadas contra `main` al 2026-09-13 (base `3a43f92` + correcciones O-16 y O-20).

| Concepto | Ubicación |
|---|---|
| Escala px→mm | `python/modules/scale.py:278` |
| Error óptico posicional (FOV, $k_1$, perspectiva, RSS) | `python/modules/scale.py:323-421` |
| Propagación de incertidumbre a métricas | `python/modules/scale.py:426-478` |
| Verificación/corrección de escala por patrón | `js/analysis-core.js:42080-42270` |
| Color de fondo (mediana de bordes) | `python/modules/detection.py:51-83` |
| Z-scan competitivo (6 fases) | `python/modules/detection.py:86-275` |
| CLAHE sobre $L^*$ | `python/modules/detection.py:278-290` |
| Máscara binaria (3 estrategias) | `python/modules/detection.py:293-342` |
| GrabCut | `python/modules/detection.py:345-394` |
| Watershed + transformada de distancia | `python/modules/detection.py:422-513` |
| Confianza por objeto / por hueco | `python/modules/detection.py:516-585` |
| Detección de huecos sin semillas (P/H) | `python/modules/detection.py:588-706` |
| Pipeline de detección completo | `python/modules/detection.py:711-960` |
| Refinamiento por gradiente (*snap*) | `python/modules/contour.py:72-232` |
| Depuración por coherencia | `python/modules/contour.py:235-330` |
| Extracción de contorno (8 pasos) | `python/modules/contour.py:380-633` |
| Shoelace: área, perímetro, centroide | `python/modules/metrics.py:61-92` |
| Envolvente convexa | `python/modules/metrics.py:95-110` |
| Tensor de inercia y ejes principales | `python/modules/metrics.py:122-172` |
| Simetría bilateral | `python/modules/metrics.py:176-219` |
| Curvatura de Menger | `python/modules/metrics.py:223-264` |
| Rugosidad | `python/modules/metrics.py:268-284` |
| Feret | `python/modules/metrics.py:288-310` |
| Radios extremos | `python/modules/metrics.py:314-353` |
| Ángulos de vértices | `python/modules/metrics.py:365-392` |
| Textura básica | `python/modules/metrics.py:396-423` |
| Dimensión fractal | `python/modules/metrics.py:434-489` |
| Ensamblado del repertorio (~55 claves) | `python/modules/metrics.py:496-1082` |
| Cascada de clasificación de forma (22 reglas) | `python/modules/metrics.py:821-965` |
| GLCM / textura | `python/modules/metrics.py:1087-1149` |
| Coeficientes EFD | `python/modules/efa.py:89-144` |
| Conversión MAO → Kuhl & Giardina (crudos) | `python/modules/efa.py:147-157` |
| Normalización EFA (θ₁, ψ₁, escala, quiralidad) | `python/modules/efa.py:160-235` |
| Reconstrucción EFA (convenio de fase; `convenio` MAO o K&G) | `python/modules/efa.py:238-277` |
| Espectro y varianza explicada | `python/modules/efa.py:280-298` |
| Componentes DC ($A_0$, $C_0$) | `python/modules/efa.py:301-325` |
| Coeficientes en el convenio K&G publicados por `/api/efa` | `python/modules/efa.py:441-449, 474-484` |
| Distancias EFD | `python/modules/efa.py:493-540` |
| Semilandmarks del TPS (inicio θ₁ + asimetría, sentido) | `js/mao-interop-gmm.js` · `semilandmarksContorno` |
| Registro canónico (contrato ADR-006) | `python/modules/morphometric_registry.py` |
| Métricas 3D (Wadell, compacidad, hull) | `python/modules/obj3d_v2.py:682-760` |
| Descriptores por autovalores 3D | `python/modules/obj3d_v2.py:620-654` |
| Procrustes 2D | `python/modules/obj3d_v2.py:2739-2782` |
| Coherencia cross-dimensional | `python/modules/obj3d_v2.py:2409-2530` |
| Métricas de P/H | `python/modules/ph.py:182-333` |
| Área efectiva y contención | `python/modules/ph.py:336-430` |
| PCA + K-means + silueta | `python/modules/comparator.py:118-246` |
| Mahalanobis + umbral de Wilks por gl y $n$ (1.3.0) | `python/modules/comparator.py` · `_outlier_threshold(df, n)`, `_mahalanobis_distances` |
| Estadística descriptiva y correlación | `python/modules/comparator.py:275-352` |
| Comparación bifacial, CI/CMS | `python/modules/comparator.py:371-731` |
| Tipología y fusión EFA | `python/modules/classifier.py:108-245` |
| Defectos de convexidad | `python/modules/mao_ia_analyzer.py:152-230` |

### Documentos internos de referencia

`docs/ESTADO-ADRS.md` (estado real de cada decisión) · `docs/ADR-006` (repertorio canónico) ·
`docs/ADR-009` (P/H primaria) · `docs/ADR-012` (detección monolítica) · `docs/ADR-013` (figura-fondo
primaria) · `docs/ADR-015` (plan de mejoras matemáticas) · `docs/ADR-016` (saneamiento del informe) ·
`docs/ADR-017` (plantillas ideales y completitud) · `docs/NOTA-VERSION-ADR017-F0.md` ·
`ARCHITECTURE.md` · `docs/ESPEC_METODO_HIBRIDO_OBJ3D_MAO.md`.

---

*Documento generado el 2026-09-13 sobre `main` (base `3a43f92` + correcciones O-16 y O-20). Las demostraciones numéricas de las
observaciones O-1, O-16 y O-20 son reproducibles ejecutando los fragmentos descritos contra los
módulos citados; la suite de referencia se ejecuta con
`python -m pytest tests/ python/tests/ -q`.*
