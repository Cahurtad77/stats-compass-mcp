# Investigación: herramientas para gestionar la vida y qué tomamos de cada una

Revisión hecha en octubre de 2026. El objetivo es reunir en **una sola app liviana** lo mejor de muchas
herramientas, sin heredar su complejidad: nada de servidores, suscripciones ni cuentas. Los datos quedan
en el dispositivo y se exportan a formatos abiertos (CSV, JSON, hledger) para analizarlos en R.

## 1. Finanzas y contabilidad (módulo implementado)

| Herramienta | Qué hace bien | Qué adoptamos en Bitácora |
|---|---|---|
| **Firefly III** (autoalojado, partida doble) | Partida doble, reglas automáticas, multi-moneda, API REST | Núcleo de **partida doble**; **reglas** "si la descripción contiene X → categoría Y" al importar |
| **Actual Budget** (local-first, presupuesto por sobres) | Privacidad, funciona sin conexión, presupuesto mensual | Arquitectura **local-first** (IndexedDB + PWA sin conexión); **presupuesto mensual** por categoría con barra de uso |
| **hledger / ledger-cli / Beancount** (contabilidad en texto plano) | Datos en formato abierto y auditable por décadas | **Exportar el diario en formato hledger**: tus datos nunca quedan atrapados |
| **YNAB** | Hábito de "darle trabajo a cada peso", métricas de colchón | Indicador de **colchón** (meses de gasto cubiertos por la liquidez) y **tasa de ahorro** |
| **GnuCash** | Plan de cuentas jerárquico y reportes contables formales | **Estado de resultados** y **balance general**; plan de cuentas con códigos tipo **PUC** colombiano |
| **Ghostfolio / Maybe** | Patrimonio neto consolidado | **Patrimonio neto** en el resumen |
| Apps colombianas (Monai, Fintonic, extractos de Bancolombia/Davivienda) | Importar movimientos bancarios | **Importador de CSV** que entiende `;`, fechas DD/MM/AAAA y valores `1.234.567,89` |

**Para tu caso concreto (docente + consultor independiente en Colombia):**

- **Honorarios con retención en la fuente**: al registrar un pago de consultoría, la app separa el valor
  neto recibido de la retención (10 % u 11 %), que queda como *activo* ("retenciones a favor"), porque se
  descuenta del impuesto de renta.
- **Control de topes para declarar renta** con la UVT oficial (2026: $52.374, Res. DIAN 000238 de 2025):
  patrimonio bruto ≥ 4.500 UVT; ingresos, consumos con tarjeta de crédito, compras o consignaciones ≥ 1.400 UVT.
- **Ingresos separados por origen**: salario (rentas de trabajo) frente a honorarios (no laborales).
- **Gastos deducibles/profesionales** marcados para tenerlos a mano al declarar.
- **Exportación tidy a R** (`r/leer_bitacora.R`) con resumen mensual, gasto por categoría, gráfico y pronóstico ETS.

## 2. Hoja de ruta: los demás módulos

Cada módulo se conecta al mismo shell (`core/app.js`) y al mismo almacenamiento local. Orden sugerido según impacto:

| Módulo | Inspiración | Funciones clave | Integra con |
|---|---|---|---|
| **Consultoría** | Harvest, Toggl, Bonsai, Invoice Ninja | Clientes, propuestas, proyectos, horas, **cuenta de cobro** en PDF, seguimiento de cartera | Finanzas: cuenta de cobro → cuenta por cobrar → honorarios con retención |
| **Agenda y tareas** | Todoist, TickTick, Lunatask, Sunsama | Tareas con fechas y prioridades, revisión semanal, bloques de tiempo | Google Calendar (ya conectado en tu cuenta), recordatorios de vencimientos financieros |
| **Docencia** | Google Classroom, Notion para docentes | Cursos y grupos, planeación por sesión, notas, banco de ejercicios en R | Agenda (horarios), Investigación (evidencias para concurso de méritos) |
| **Investigación** | Zotero, Overleaf, CvLAC/GrupLAC | Productos académicos, manuscritos y su estado, metas de escritura | Docencia, Notas |
| **Familia y hogar** | OpenFamily, Cozi, FamilyWall | Calendario familiar, lista de mercado, mantenimiento, vencimientos (SOAT, predial, pólizas) | Finanzas (presupuesto del hogar), Agenda |
| **Salud y hábitos** | Loop Habit Tracker, Lunatask | Hábitos diarios/semanales, citas médicas, diario breve | Agenda |
| **Notas y documentos** | Obsidian, Logseq, Paperless-ngx | Notas Markdown enlazadas, bóveda de documentos (certificados, contratos) | Todos |

### Integraciones externas previstas
- **Google Calendar / Drive / Gmail**: tu cuenta ya tiene estos conectores; se pueden usar para respaldos
  automáticos en Drive y para llevar vencimientos al calendario.
- **Facturación electrónica DIAN**: si superas los topes para facturar, enlazar con el facturador gratuito
  de la DIAN o un proveedor tecnológico, y registrar aquí la factura como cuenta por cobrar.
- **Sincronización entre dispositivos** (opcional): exportar/importar el respaldo JSON hoy; más adelante,
  sincronización cifrada de extremo a extremo (como Actual Budget).

## Fuentes
- Actual Budget, Firefly III y otras: [OpenAlternative – Personal Finance](https://openalternative.co/categories/productivity-utilities/personal-finance-management),
  [LinuxLinks – Self-hosted personal finance tools](https://www.linuxlinks.com/best-free-open-source-self-hosted-personal-finance-tools/)
- Apps todo en uno: [Lunatask](https://snapcraft.io/lunatask), [OpenFamily](https://alternativeto.net/software/openfamily/about), [Sanad](https://www.producthunt.com/products/sanad)
- UVT 2026 y topes de renta: [Siempre al Día – UVT 2026](https://siemprealdia.co/colombia/impuestos/uvt-2026/),
  [Rankia – Topes para declarar renta](https://www.rankia.co/blog/dian/4179376-cuales-son-topes-para-declarar-renta)
