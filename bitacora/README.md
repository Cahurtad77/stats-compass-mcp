# Bitácora

App personal **liviana, local-first y sin dependencias** para llevar la vida profesional, laboral,
familiar y académica en un solo lugar. Primer módulo: **Finanzas y contabilidad**.

- Sin servidor, sin cuentas, sin suscripciones: los datos viven en tu navegador (IndexedDB).
- Funciona **sin conexión** y se puede instalar en el celular o el computador (PWA).
- Formatos abiertos: respaldo JSON, CSV tidy para **R** y diario **hledger**.
- Unos 75 KB de código propio y cero librerías externas.

## Ejecutar

```bash
cd bitacora
python3 -m http.server 8080   # o: npm start
# abre http://localhost:8080
```

Necesita servirse por HTTP (los módulos ES y el modo sin conexión no funcionan con `file://`).
Para tenerla en el celular, publícala en cualquier hosting estático (GitHub Pages, Netlify, Cloudflare Pages)
y elige "Agregar a pantalla de inicio".

## Módulo Finanzas

| Sección | Qué hace |
|---|---|
| **Resumen** | Ingresos, gastos, resultado y tasa de ahorro del mes; patrimonio neto; colchón en meses; gráfico de 12 meses; top de gastos; estado del presupuesto |
| **Movimientos** | Registro rápido de gasto, ingreso, transferencia u **honorarios con retención en la fuente**; filtros, búsqueda, etiquetas y edición |
| **Cuentas** | Plan de cuentas con códigos tipo PUC, saldos, saldos iniciales y cuentas propias (Nequi, pensiones voluntarias…) |
| **Presupuesto** | Topes mensuales por categoría (fijos o solo para un mes) con alertas de uso |
| **Recurrentes** | Arriendo, nómina, servicios y suscripciones; propone los movimientos pendientes al llegar la fecha |
| **Impuestos** | Topes para declarar renta con la UVT oficial, ingresos por origen, retenciones a favor, gastos deducibles |
| **Importar / Exportar** | CSV de extractos bancarios con reglas de categorización; respaldo y restauración; exportes para R y hledger |

Por dentro es **contabilidad de partida doble**: cada movimiento genera un asiento que suma cero.
Así el balance siempre cuadra (activos = pasivos + patrimonio) y los reportes son confiables.

## Análisis en R

```r
source("r/leer_bitacora.R")
bt <- leer_bitacora("bitacora-2026-10-07.csv")
bitacora_validar(bt)        # asientos descuadrados (debe salir vacío)
bitacora_resumen(bt)        # mes, ingreso, gasto, resultado, tasa_ahorro
bitacora_gastos(bt, "2026-09")
bitacora_grafico(bt)
bitacora_pronostico(bt, h = 3)
```

## Estructura

```
bitacora/
├── index.html, styles.css, sw.js, manifest.webmanifest, icon.svg
├── core/            # shell: enrutador y registro de módulos, IndexedDB, utilidades de UI
├── modules/finanzas/
│   ├── ledger.js    # lógica contable pura (sin DOM), probada con node:test
│   └── finanzas.js  # interfaz del módulo
├── r/leer_bitacora.R
├── tests/ledger.test.js
└── docs/investigacion.md   # herramientas revisadas y hoja de ruta de módulos
```

### Agregar un módulo
Crea `modules/<id>/<id>.js` que exporte `{ id, nombre, icono, descripcion, estado: 'activo', montar(el, seccion), iniciar?, tarjeta? }`,
impórtalo en `core/app.js`, añádelo a `MODULOS` y agrega sus archivos a `sw.js`.

## Pruebas

```bash
npm test   # node --test, sin dependencias
```

> Los cálculos tributarios son orientativos y no sustituyen la asesoría de un contador.
> Actualiza la constante `UVT` en `ledger.js` cada diciembre, cuando la DIAN publique el valor del año siguiente.
