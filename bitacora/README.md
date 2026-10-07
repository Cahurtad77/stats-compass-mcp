# Bitácora

App personal **liviana, local-first y sin dependencias** para llevar la vida profesional, laboral,
familiar y académica en un solo lugar. Primer módulo: **Finanzas y contabilidad**.

- Sin servidor, sin cuentas, sin suscripciones: los datos viven en tu navegador (IndexedDB).
- Funciona **sin conexión** y se puede instalar en el celular o el computador (PWA).
- Formatos abiertos: respaldo JSON, CSV tidy para **R** y diario **hledger**.
- Unos 140 KB de código propio. La única librería es el SDK oficial de Anthropic (incluido en `vendor/`, se carga solo al usar la IA).

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
| **Resumen** | Ingresos, gastos, resultado y tasa de ahorro del mes; patrimonio neto; colchón en meses; gráfico de 12 meses; top de gastos; presupuesto; **caja proyectada a 3 meses**; **fugas principales** |
| **Bandeja** | Fotos y PDF de soportes recibidos **desde WhatsApp** (Compartir → Bitácora, en Android) o subidos. **Lectura con IA** (monto, fecha, comercio, NIT, rubro) y registro con el soporte adjunto |
| **Fugas** | Suscripciones olvidadas, gastos hormiga, categorías fuera de su comportamiento habitual (media + 2σ de 6 meses) y costos financieros, con su impacto anual |
| **Metas** | Vacaciones (con presupuesto por partes), inversión (simulador de interés compuesto), **apoyo a mamá**, fondo de emergencia y familia; aporte mensual sugerido |
| **Contador** | Paquete ZIP (libro diario en CSV para Excel, resumen fiscal, preguntas y soportes nombrados), lista de documentos para la declaración, movimientos importantes sin soporte, **envío por WhatsApp** |
| **Movimientos** | Registro rápido de gasto, ingreso, transferencia u **honorarios con retención en la fuente**; filtros, búsqueda, etiquetas y edición |
| **Cuentas** | Plan de cuentas con códigos tipo PUC, saldos, saldos iniciales y cuentas propias (Nequi, pensiones voluntarias…) |
| **Presupuesto** | Topes mensuales por categoría (fijos o solo para un mes) con alertas de uso |
| **Recurrentes** | Arriendo, nómina, servicios y suscripciones; propone los movimientos pendientes al llegar la fecha |
| **Impuestos** | Topes para declarar renta con la UVT oficial, ingresos por origen, retenciones a favor, gastos deducibles |
| **Importar / Exportar** | CSV de extractos bancarios con reglas de categorización; respaldo y restauración; exportes para R y hledger |

Al registrar, el **rubro se sugiere solo** a partir de tus reglas, tu historial con ese comercio o palabras clave (Éxito → mercado, Netflix → suscripciones). Cada movimiento puede llevar una **meta** y una **pregunta para el contador**.

### Recibir fotos desde WhatsApp (Android)
1. Publica la app en un hosting con HTTPS (GitHub Pages, Netlify o Cloudflare Pages).
2. Ábrela en Chrome y elige **Instalar app** (o *Agregar a pantalla de inicio*).
3. En WhatsApp, abre la foto del pago → **Compartir** → **Bitácora**. La foto llega a la **Bandeja**.

### Lectura con IA
En *Importar / Exportar → Lectura con IA* pega una clave de la API de Claude (créala en console.anthropic.com
con un límite de gasto). La clave se guarda solo en tu navegador y no viaja en los respaldos.
La foto se reduce antes de enviarse (máx. 1568 px) para bajar costo y tiempo.

El bot de WhatsApp, la sincronización con tu familia y el acceso del contador están diseñados en
[`docs/fase-b-whatsapp-sincronizacion.md`](docs/fase-b-whatsapp-sincronizacion.md).

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
├── core/            # shell, IndexedDB, utilidades de UI, generador ZIP
├── modules/finanzas/
│   ├── ledger.js    # lógica pura (contabilidad, fugas, metas, flujo), probada con node:test
│   ├── ia.js        # lectura de soportes con la API de Claude
│   ├── secciones.js # bandeja, fugas, metas, contador
│   └── finanzas.js  # interfaz del módulo
├── vendor/          # SDK oficial de Anthropic empaquetado (MIT)
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
