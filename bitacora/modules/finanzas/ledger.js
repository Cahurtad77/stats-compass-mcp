// Núcleo contable de Bitácora: partida doble, sin dependencias ni DOM.
// Montos en unidades menores enteras (centavos) para evitar errores de coma flotante.
// Convención: débito = positivo, crédito = negativo; cada asiento suma cero.

export const TIPOS = {
  activo: { nombre: 'Activo', naturaleza: 1 },
  pasivo: { nombre: 'Pasivo', naturaleza: -1 },
  patrimonio: { nombre: 'Patrimonio', naturaleza: -1 },
  ingreso: { nombre: 'Ingreso', naturaleza: -1 },
  gasto: { nombre: 'Gasto', naturaleza: 1 },
};

// UVT oficial (DIAN). 2026: Resolución 000238 del 15-dic-2025.
export const UVT = { 2024: 47065, 2025: 49799, 2026: 52374 };

// Plan de cuentas personal inspirado en el PUC colombiano (códigos de referencia).
export function cuentasPorDefecto() {
  const c = (id, codigo, nombre, tipo, extra = {}) => ({ id, codigo, nombre, tipo, activa: true, ...extra });
  return [
    c('caja', '1105', 'Efectivo', 'activo'),
    c('banco', '1110', 'Cuenta de ahorros', 'activo'),
    c('inversiones', '1200', 'Inversiones (CDT, fondos)', 'activo'),
    c('cxc', '1305', 'Cuentas por cobrar (clientes)', 'activo'),
    c('ret_favor', '1355', 'Retenciones en la fuente a favor', 'activo'),
    c('bienes', '1500', 'Bienes (vivienda, vehículo)', 'activo'),
    c('tc', '2105', 'Tarjeta de crédito', 'pasivo'),
    c('prestamos', '2110', 'Préstamos y créditos', 'pasivo'),
    c('impuestos_pagar', '2400', 'Impuestos por pagar', 'pasivo'),
    c('patrimonio', '3105', 'Patrimonio inicial', 'patrimonio'),
    c('salario', '4105', 'Salario docencia', 'ingreso', { grupo: 'laboral' }),
    c('honorarios', '4150', 'Honorarios consultoría', 'ingreso', { grupo: 'consultoria' }),
    c('rendimientos', '4210', 'Rendimientos financieros', 'ingreso'),
    c('otros_ing', '4295', 'Otros ingresos', 'ingreso'),
    c('vivienda', '5105', 'Vivienda y servicios', 'gasto'),
    c('alimentacion', '5110', 'Alimentación y mercado', 'gasto'),
    c('transporte', '5115', 'Transporte', 'gasto'),
    c('salud', '5120', 'Salud y seguridad social', 'gasto'),
    c('educacion', '5125', 'Educación (familia y formación)', 'gasto'),
    c('familia', '5130', 'Familia y hogar', 'gasto'),
    c('ocio', '5135', 'Ocio y cultura', 'gasto'),
    c('trabajo', '5140', 'Gastos profesionales (software, equipos)', 'gasto', { deducible: true }),
    c('financieros', '5305', 'Gastos financieros (intereses, 4x1000)', 'gasto'),
    c('impuestos', '5400', 'Impuestos', 'gasto'),
    c('otros_gas', '5995', 'Otros gastos', 'gasto'),
  ];
}

export const aCentavos = (valor) => {
  if (typeof valor === 'number') return Math.round(valor * 100);
  const limpio = String(valor).trim().replace(/[^\d,.-]/g, '');
  // Formato colombiano "1.234.567,89" o internacional "1,234,567.89"
  const ultComa = limpio.lastIndexOf(','), ultPunto = limpio.lastIndexOf('.');
  // Un único separador seguido de exactamente 3 dígitos se interpreta como miles ("50.000" = cincuenta mil).
  const soloMiles = (s) => /^-?\d{1,3}([.,]\d{3})+$/.test(s) && !(s.includes('.') && s.includes(','));
  let normal;
  if (soloMiles(limpio)) normal = limpio.replace(/[.,]/g, '');
  else if (ultComa > ultPunto) normal = limpio.replace(/\./g, '').replace(',', '.');
  else normal = limpio.replace(/,/g, '');
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export const formatoMoneda = (centavos, moneda = 'COP') =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: moneda, maximumFractionDigits: moneda === 'COP' ? 0 : 2 })
    .format((centavos || 0) / 100);

export function validarAsiento(asiento) {
  const errores = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asiento.fecha || '')) errores.push('Fecha inválida (AAAA-MM-DD).');
  const p = asiento.partidas || [];
  if (p.length < 2) errores.push('Un asiento necesita al menos dos partidas.');
  if (p.some((x) => !x.cuenta)) errores.push('Todas las partidas requieren cuenta.');
  if (p.some((x) => !Number.isInteger(x.monto) || x.monto === 0)) errores.push('Montos deben ser enteros distintos de cero.');
  const suma = p.reduce((s, x) => s + (x.monto || 0), 0);
  if (suma !== 0) errores.push(`El asiento no cuadra (diferencia ${suma / 100}).`);
  return errores;
}

// Traduce un movimiento "simple" (lo que la gente realmente registra) a partida doble.
export function movimientoAAsiento({ tipo, fecha, monto, origen, destino, descripcion = '', etiquetas = [], tercero = '' }) {
  if (!(monto > 0)) throw new Error('El monto debe ser positivo.');
  // gasto: sale de origen (activo/pasivo) hacia destino (gasto)
  // ingreso: entra a destino (activo) desde origen (ingreso)
  // transferencia: de origen a destino
  const partidas = [
    { cuenta: destino, monto },
    { cuenta: origen, monto: -monto },
  ];
  if (!['gasto', 'ingreso', 'transferencia'].includes(tipo)) throw new Error(`Tipo desconocido: ${tipo}`);
  return { fecha, descripcion, tercero, etiquetas, tipo, partidas };
}

// Honorarios con retención: el cliente paga neto, la retención queda como activo (anticipo de renta).
export function honorariosAAsiento({ fecha, bruto, tasaRetencion = 0.1, destino = 'banco', cliente = '', descripcion = '', proyecto = '' }) {
  const retencion = Math.round(bruto * tasaRetencion);
  const asiento = {
    fecha, descripcion: descripcion || `Honorarios ${cliente}`.trim(), tercero: cliente, tipo: 'honorarios',
    etiquetas: proyecto ? [`proyecto:${proyecto}`] : [],
    partidas: [
      { cuenta: destino, monto: bruto - retencion },
      { cuenta: 'honorarios', monto: -bruto },
    ],
  };
  if (retencion > 0) asiento.partidas.splice(1, 0, { cuenta: 'ret_favor', monto: retencion });
  return asiento;
}

const enRango = (fecha, desde, hasta) => (!desde || fecha >= desde) && (!hasta || fecha <= hasta);

export function saldos(asientos, { desde, hasta } = {}) {
  const s = {};
  for (const a of asientos) {
    if (!enRango(a.fecha, desde, hasta)) continue;
    for (const p of a.partidas) s[p.cuenta] = (s[p.cuenta] || 0) + p.monto;
  }
  return s;
}

// Saldo presentado con signo "natural" del tipo de cuenta (activos e ingresos positivos).
export const saldoNatural = (cuenta, bruto) => (bruto || 0) * TIPOS[cuenta.tipo].naturaleza;

export function estadoResultados(asientos, cuentas, desde, hasta) {
  const s = saldos(asientos, { desde, hasta });
  const filas = (tipo) => cuentas.filter((c) => c.tipo === tipo)
    .map((c) => ({ cuenta: c, valor: saldoNatural(c, s[c.id]) }))
    .filter((f) => f.valor !== 0)
    .sort((a, b) => b.valor - a.valor);
  const ingresos = filas('ingreso'), gastos = filas('gasto');
  const totalIngresos = ingresos.reduce((t, f) => t + f.valor, 0);
  const totalGastos = gastos.reduce((t, f) => t + f.valor, 0);
  const resultado = totalIngresos - totalGastos;
  return { ingresos, gastos, totalIngresos, totalGastos, resultado, tasaAhorro: totalIngresos ? resultado / totalIngresos : 0 };
}

export function balanceGeneral(asientos, cuentas, hasta) {
  const s = saldos(asientos, { hasta });
  const grupo = (tipo) => cuentas.filter((c) => c.tipo === tipo).map((c) => ({ cuenta: c, valor: saldoNatural(c, s[c.id]) })).filter((f) => f.valor !== 0);
  const activos = grupo('activo'), pasivos = grupo('pasivo'), patrimonio = grupo('patrimonio');
  const total = (g) => g.reduce((t, f) => t + f.valor, 0);
  // Resultado acumulado (ingresos − gastos) forma parte del patrimonio.
  const resultadoAcumulado = cuentas.filter((c) => c.tipo === 'ingreso' || c.tipo === 'gasto')
    .reduce((t, c) => t - (s[c.id] || 0), 0);
  const totalActivos = total(activos), totalPasivos = total(pasivos);
  return {
    activos, pasivos, patrimonio, resultadoAcumulado,
    totalActivos, totalPasivos, totalPatrimonio: total(patrimonio) + resultadoAcumulado,
    patrimonioNeto: totalActivos - totalPasivos,
  };
}

export const mesDe = (fecha) => fecha.slice(0, 7);

export function finDeMes(mes) {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

export function mesesHasta(mesFinal, n) {
  const [a, m] = mesFinal.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

export function serieMensual(asientos, cuentas, mesFinal, n = 12) {
  return mesesHasta(mesFinal, n).map((mes) => {
    const er = estadoResultados(asientos, cuentas, `${mes}-01`, finDeMes(mes));
    return { mes, ingresos: er.totalIngresos, gastos: er.totalGastos, resultado: er.resultado };
  });
}

// presupuestos: [{ mes: 'AAAA-MM' | '*', cuenta, monto }] — '*' aplica a todos los meses.
export function estadoPresupuesto(presupuestos, asientos, cuentas, mes) {
  const s = saldos(asientos, { desde: `${mes}-01`, hasta: finDeMes(mes) });
  const vigentes = new Map();
  for (const p of presupuestos) if (p.mes === '*') vigentes.set(p.cuenta, p);
  for (const p of presupuestos) if (p.mes === mes) vigentes.set(p.cuenta, p);
  return [...vigentes.values()].map((p) => {
    const cuenta = cuentas.find((c) => c.id === p.cuenta);
    const gastado = cuenta ? saldoNatural(cuenta, s[p.cuenta]) : 0;
    return { cuenta, presupuesto: p.monto, gastado, disponible: p.monto - gastado, uso: p.monto ? gastado / p.monto : 0 };
  }).filter((r) => r.cuenta).sort((a, b) => b.uso - a.uso);
}

// Recurrentes: { id, frecuencia: 'mensual'|'quincenal'|'semanal'|'anual', inicio, ultima, plantilla }
export function fechasPendientes(recurrente, hoy) {
  const out = [];
  const paso = (iso) => {
    const d = new Date(`${iso}T00:00:00Z`);
    const dia = new Date(`${recurrente.inicio}T00:00:00Z`).getUTCDate();
    if (recurrente.frecuencia === 'semanal') d.setUTCDate(d.getUTCDate() + 7);
    else if (recurrente.frecuencia === 'quincenal') d.setUTCDate(d.getUTCDate() + 14);
    else {
      const meses = recurrente.frecuencia === 'anual' ? 12 : 1;
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() + meses);
      const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
      d.setUTCDate(Math.min(dia, ultimo));
    }
    return d.toISOString().slice(0, 10);
  };
  let f = recurrente.ultima ? paso(recurrente.ultima) : recurrente.inicio;
  while (f <= hoy && out.length < 120) { out.push(f); f = paso(f); }
  return out;
}

// Topes para declarar renta, persona natural residente (art. 592-594-3 E.T.).
// Año gravable N se evalúa con la UVT de N; se declara en N+1.
export function obligacionDeclarar({ patrimonioBruto = 0, ingresosBrutos = 0, consumosTC = 0, compras = 0, consignaciones = 0 }, anioGravable) {
  const uvt = UVT[anioGravable];
  if (!uvt) return { uvt: null, criterios: [], obligado: null };
  const criterios = [
    { nombre: 'Patrimonio bruto a 31-dic', valor: patrimonioBruto, tope: 4500 * uvt * 100 },
    { nombre: 'Ingresos brutos del año', valor: ingresosBrutos, tope: 1400 * uvt * 100 },
    { nombre: 'Consumos con tarjeta de crédito', valor: consumosTC, tope: 1400 * uvt * 100 },
    { nombre: 'Compras y consumos totales', valor: compras, tope: 1400 * uvt * 100 },
    { nombre: 'Consignaciones e inversiones', valor: consignaciones, tope: 1400 * uvt * 100 },
  ].map((c) => ({ ...c, supera: c.valor >= c.tope, uso: c.tope ? c.valor / c.tope : 0 }));
  return { uvt, criterios, obligado: criterios.some((c) => c.supera) };
}

// Resumen fiscal del año a partir de la contabilidad.
export function resumenFiscal(asientos, cuentas, anio) {
  const desde = `${anio}-01-01`, hasta = `${anio}-12-31`;
  const er = estadoResultados(asientos, cuentas, desde, hasta);
  const bg = balanceGeneral(asientos, cuentas, hasta);
  const delAnio = asientos.filter((a) => enRango(a.fecha, desde, hasta));
  const sum = (pred) => delAnio.reduce((t, a) => t + a.partidas.filter(pred).reduce((u, p) => u + p.monto, 0), 0);
  const consumosTC = -sum((p) => p.cuenta === 'tc' && p.monto < 0);
  const retenciones = sum((p) => p.cuenta === 'ret_favor' && p.monto > 0);
  const consignaciones = sum((p) => ['banco', 'inversiones'].includes(p.cuenta) && p.monto > 0);
  const deducibles = er.gastos.filter((g) => g.cuenta.deducible).reduce((t, g) => t + g.valor, 0);
  return {
    ingresosBrutos: er.totalIngresos,
    compras: er.totalGastos,
    patrimonioBruto: bg.totalActivos,
    consumosTC, consignaciones, retenciones, deducibles,
    porGrupo: er.ingresos.reduce((m, f) => { const g = f.cuenta.grupo || 'otros'; m[g] = (m[g] || 0) + f.valor; return m; }, {}),
  };
}

// CSV robusto (comillas, separador , o ;) — los extractos bancarios colombianos suelen usar ';'.
export function parseCSV(texto) {
  const primera = texto.split(/\r?\n/, 1)[0] || '';
  const sep = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  const filas = []; let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); filas.push(fila); fila = []; campo = '';
    } else campo += ch;
  }
  if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim() !== ''));
}

export function normalizarFecha(txt) {
  const t = String(txt).trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/); // DD/MM/AAAA (uso colombiano)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Reglas de categorización tipo Firefly III: [{ contiene: 'EXITO', cuenta: 'alimentacion' }]
export function categorizar(descripcion, reglas, porDefecto) {
  const d = descripcion.toUpperCase();
  const r = reglas.find((x) => x.contiene && d.includes(x.contiene.toUpperCase()));
  return r ? r.cuenta : porDefecto;
}

// Convierte filas de extracto en asientos. Monto negativo = salida de la cuenta bancaria.
export function extractoAAsientos(filas, { colFecha, colDescripcion, colMonto, cuentaBanco, reglas = [], encabezado = true }) {
  const datos = encabezado ? filas.slice(1) : filas;
  const asientos = [], errores = [];
  datos.forEach((f, i) => {
    const fecha = normalizarFecha(f[colFecha] || '');
    const monto = aCentavos(f[colMonto] || '');
    const descripcion = (f[colDescripcion] || '').trim();
    if (!fecha || !Number.isFinite(monto) || monto === 0) { errores.push(i + (encabezado ? 2 : 1)); return; }
    const contrapartida = categorizar(descripcion, reglas, monto < 0 ? 'otros_gas' : 'otros_ing');
    asientos.push({
      fecha, descripcion, tercero: '', etiquetas: ['importado'], tipo: monto < 0 ? 'gasto' : 'ingreso',
      partidas: [{ cuenta: cuentaBanco, monto }, { cuenta: contrapartida, monto: -monto }],
    });
  });
  return { asientos, errores };
}

// Formato "tidy": una fila por partida, listo para R (readr::read_csv) o Python.
export function asientosATidyCSV(asientos, cuentas) {
  const porId = Object.fromEntries(cuentas.map((c) => [c.id, c]));
  const esc = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const filas = [['asiento_id', 'fecha', 'descripcion', 'tercero', 'tipo_movimiento', 'etiquetas', 'cuenta_id', 'cuenta_codigo', 'cuenta_nombre', 'cuenta_tipo', 'monto']];
  for (const a of asientos) for (const p of a.partidas) {
    const c = porId[p.cuenta] || {};
    filas.push([a.id ?? '', a.fecha, a.descripcion, a.tercero, a.tipo, (a.etiquetas || []).join('|'), p.cuenta, c.codigo, c.nombre, c.tipo, (p.monto / 100).toFixed(2)]);
  }
  return filas.map((f) => f.map(esc).join(',')).join('\n') + '\n';
}

// Exporta en formato texto plano compatible con hledger / ledger-cli (contabilidad en texto plano).
export function asientosAHledger(asientos, cuentas, moneda = 'COP') {
  const porId = Object.fromEntries(cuentas.map((c) => [c.id, c]));
  const raiz = { activo: 'activos', pasivo: 'pasivos', patrimonio: 'patrimonio', ingreso: 'ingresos', gasto: 'gastos' };
  const nombre = (id) => { const c = porId[id]; return c ? `${raiz[c.tipo]}:${c.nombre.replace(/[:;]/g, ' ')}` : id; };
  return [...asientos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((a) => [
    `${a.fecha} ${a.tercero ? a.tercero + ' | ' : ''}${a.descripcion || ''}`.trimEnd(),
    ...a.partidas.map((p) => `    ${nombre(p.cuenta).padEnd(44)} ${(p.monto / 100).toFixed(2)} ${moneda}`),
  ].join('\n')).join('\n\n') + '\n';
}
