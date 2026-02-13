# Análisis y propuesta de simplificación del pipeline SVG

## Resumen de cómo funciona hoy

El pipeline actual en `txt2svg.js` hace, en orden:

1. Carga de fuente con `opentype.js`.
2. Construcción de modelos de texto (`makerjs.models.Text`) por línea.
3. Medición y ajuste por ancho/alto.
4. `merge-path` opcional: combina pares consecutivos de submodelos si sus bounding boxes se solapan (`makerjs.model.combine`).
5. Exportación directa a SVG.

## Cuellos de botella detectados

- El wrapping por ancho usa búsqueda lineal (incrementando/decrementando caracteres), lo que puede generar muchas mediciones de texto.
- El `merge-path` actual compara de forma local (i e i+1), lo que puede dejar solapes sin resolver y repetir operaciones caras.
- Las operaciones booleanas sobre modelos con demasiados nodos/contornos elevan mucho el coste de Maker.js.

## Simplificación propuesta del proceso de generación

### 1) Sustituir el ajuste lineal por búsqueda binaria

En lugar de mover `newLength` de 1 en 1, hacer una búsqueda binaria del máximo prefijo que entra en `maxWidth`.

**Por qué:** reduce drásticamente el número de llamadas a `makerjs.models.Text` + `measure.modelExtents` en textos largos.

### 2) Agrupar por líneas y cachear mediciones

Cachear por clave `(fontHash, fontSize, texto)` la salida de `getModelInfo`.

**Por qué:** en nombres repetidos o reintentos de wrap se evita recomputar geometría igual.

### 3) Ejecutar merge por componentes conectados, no por vecinos

Crear una lista de submodelos, detectar candidatos por solape de bbox y construir componentes conectados (union-find o DFS). Ejecutar booleanas dentro de cada componente.

**Por qué:** reduce operaciones innecesarias y evita orden local subóptimo (i/i+1).

### 4) Dos modos de calidad

- `quality=fast`: omite merge-path y deja rutas separadas.
- `quality=balanced`: merge sólo en componentes con área pequeña.
- `quality=best`: merge completo.

**Por qué:** permite controlar tiempo de cómputo según caso de uso.

## Propuesta de preprocesado para aliviar booleanas de Maker.js

Objetivo: entregar a Maker.js geometría más limpia y con menos segmentos.

### A) Preprocesado geométrico antes de `combine`

1. **Filtro por área mínima:** descartar contornos muy pequeños (ruido), por ejemplo área < `epsilonArea`.
2. **Simplificación de polilíneas/curvas:** aplicar tolerancia (Douglas-Peucker en caminos discretizados, o simplificación de nodos casi colineales).
3. **Snapping de coordenadas:** redondeo a rejilla (ej. 0.01 pt) para reducir micro-separaciones.
4. **Normalización de winding y cierre de paths:** asegurar orientación y cierre coherente.

**Por qué:** Maker.js sufre con geometría degenerada (segmentos microscópicos, vértices duplicados, casi tangencias).

### B) Preprocesado topológico

1. **Spatial index (R-tree / grid):** sólo comparar candidatos cercanos.
2. **Fuse de segmentos colineales adyacentes:** reducir cantidad de entidades antes del boolean.
3. **Recorte por bbox expandida (padding):** eliminar entidades totalmente fuera del área de trabajo.

**Por qué:** baja la complejidad de O(n²) comparativa y simplifica el input booleano.

### C) Pipeline recomendado (práctico)

1. Generar modelos de texto por línea.
2. Aplanar a lista de paths.
3. `cleanPaths(paths, {snap, minArea, simplifyTolerance})`.
4. Indexar en grid.
5. Resolver componentes conectados por solape real.
6. Boolean por componente (de menor a mayor área).
7. Exportar SVG.

## Valores iniciales sugeridos (tuning)

- `snap = 0.01 pt`
- `minArea = 0.05 pt²`
- `simplifyTolerance = 0.03 pt`
- `maxComponentSize = 150 entidades` (si supera, dividir por bloques)

## Métricas a medir

- Tiempo total `getSVG`.
- Tiempo de sección booleana.
- Número de entidades antes/después de preprocesado.
- Tamaño final de SVG.
- Error geométrico máximo respecto al original (Hausdorff aproximado o desviación por muestreo).

## Plan de adopción incremental

1. Medición base con logs de tiempos.
2. Activar `snap + minArea` (bajo riesgo).
3. Activar simplificación con tolerancia conservadora.
4. Migrar merge local a merge por componentes.
5. Exponer flags CLI para ajuste fino.
