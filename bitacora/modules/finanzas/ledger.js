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
    c('ahorro_metas', '1210', 'Ahorro para metas', 'activo'),
    c('rendimientos', '4210', 'Rendimientos financieros', 'ingreso'),
    c('otros_ing', '4295', 'Otros ingresos', 'ingreso'),
    c('vivienda', '5105', 'Vivienda y servicios', 'gasto'),
    c('alimentacion', '5110', 'Alimentación y mercado', 'gasto'),
    c('transporte', '5115', 'Transporte', 'gasto'),
    c('salud', '5120', 'Salud y seguridad social', 'gasto'),
    c('educacion', '5125', 'Educación (familia y formación)', 'gasto'),
    c('familia', '5130', 'Familia y hogar', 'gasto'),
    c('ocio', '5135', 'Ocio y cultura', 'gasto'),
    c('apoyo_mama', '5132', 'Apoyo a mamá', 'gasto', { grupo: 'familia' }),
    c('vacaciones', '5137', 'Viajes y vacaciones', 'gasto'),
    c('suscripciones', '5138', 'Suscripciones y membresías', 'gasto'),
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
  if (/^\d{5}(\.\d+)?$/.test(t) && +t > 30000 && +t < 80000) { // fecha serial de Excel
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(+t) * 86400000).toISOString().slice(0, 10);
  }
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/); // DD/MM/AAAA (uso colombiano)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Reglas de categorización tipo Firefly III: [{ contiene: 'EXITO', cuenta: 'alimentacion' }]
// Una regla puede tener `clave` (comercio exacto, creada al clasificar extractos) o `contiene` (texto libre).
export function categorizar(descripcion, reglas, porDefecto) {
  const d = normalizarTexto(descripcion);
  let clave = null;
  const r = reglas.find((x) => (x.clave && (clave ??= claveComercio(descripcion)) === x.clave)
    || (x.contiene && d.includes(normalizarTexto(x.contiene))));
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

// ---------- Sugerencia de rubro ----------
const normalizarTexto = (t) => String(t || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Orden: reglas explícitas > historial del mismo tercero/comercio > palabras clave comunes > null.
const PALABRAS = [
  [/\b(?:EXITO|CARULLA|D1|ARA|JUMBO|OLIMPICA|MERCADO|SUPERMERCADO|PANADERIA|RAPPI)\b/, 'alimentacion'],
  [/\b(?:EPM|ENEL|CODENSA|GAS NATURAL|VANTI|ACUEDUCTO|CLARO|MOVISTAR|TIGO|ETB|ARRIENDO|ADMINISTRACION)\b/, 'vivienda'],
  [/\b(?:TERPEL|PRIMAX|ESSO|GASOLINA|PEAJE|PARQUEADERO\w*|UBER|DIDI|CABIFY|METRO|TAXI)\b/, 'transporte'],
  [/\b(?:DROGUERIA|FARMACIA|CRUZ VERDE|COLSUBSIDIO|EPS|CLINICA|MEDIC\w*|LABORATORIO\w*|ODONTO\w*)\b/, 'salud'],
  [/\b(?:COLEGIO|UNIVERSIDAD|MATRICULA|LIBRERIA|CURSO|PANAMERICANA)\b/, 'educacion'],
  [/\b(?:NETFLIX|SPOTIFY|DISNEY|HBO|MAX|AMAZON PRIME|YOUTUBE|APPLE|GOOGLE ONE|ICLOUD|CHATGPT|CLAUDE)\b/, 'suscripciones'],
  [/\b(?:AVIANCA|LATAM|WINGO|HOTEL\w*|AIRBNB|BOOKING|DESPEGAR)\b/, 'vacaciones'],
  [/\b(?:CINE|CINEMARK|PROCINAL|RESTAURANTE\w*|BAR|TEATRO)\b/, 'ocio'],
  [/\b(?:4X1000|GMF|CUOTA DE MANEJO|INTERES\w*|COMISION\w*)\b/, 'financieros'],
  [/\b(?:DIAN|PREDIAL|IMPUESTO\w*|VEHICULAR)\b/, 'impuestos'],
];

const PALABRAS_INGRESO = [
  [/\b(?:NOMINA|SALARIO|SUELDO|PRIMA DE SERVICIOS|CESANTIAS|VACACIONES PAGADAS)\b/, 'salario'],
  [/\b(?:HONORARIOS|CUENTA DE COBRO)\b/, 'honorarios'],
  [/\b(?:RENDIMIENTO|INTERESES (A FAVOR|GANADOS|AHORRO)|INTERES CDT)\b/, 'rendimientos'],
];

export function sugerirCuenta({ descripcion = '', tercero = '', tipo = 'gasto' }, asientos = [], reglas = [], cuentas = []) {
  const texto = `${tercero} ${descripcion}`;
  const tipoDe = (id) => cuentas.find((c) => c.id === id)?.tipo;
  const buscado = tipo === 'ingreso' ? 'ingreso' : 'gasto';
  const valida = (id) => id && (!cuentas.length || tipoDe(id) === buscado);
  const porRegla = categorizar(texto, reglas, null);
  if (valida(porRegla)) return { cuenta: porRegla, motivo: 'regla' };
  const clave = normalizarTexto(tercero || descripcion);
  if (clave) {
    const conteo = {};
    for (const a of asientos) {
      if (normalizarTexto(a.tercero || a.descripcion) !== clave) continue;
      for (const p of a.partidas) if (valida(p.cuenta)) conteo[p.cuenta] = (conteo[p.cuenta] || 0) + 1;
    }
    const mejor = Object.entries(conteo).sort((x, y) => y[1] - x[1])[0];
    if (mejor) return { cuenta: mejor[0], motivo: 'historial' };
  }
  const n = normalizarTexto(texto);
  const hit = (buscado === 'gasto' ? PALABRAS : PALABRAS_INGRESO).find(([re]) => re.test(n));
  if (hit && valida(hit[1])) return { cuenta: hit[1], motivo: 'palabra clave' };
  return { cuenta: null, motivo: null };
}

// ---------- Detección de fugas ----------
const media = (xs) => xs.reduce((t, x) => t + x, 0) / (xs.length || 1);
const desv = (xs) => { const m = media(xs); return Math.sqrt(media(xs.map((x) => (x - m) ** 2))); };
const restarDias = (iso, d) => { const f = new Date(`${iso}T00:00:00Z`); f.setUTCDate(f.getUTCDate() - d); return f.toISOString().slice(0, 10); };

// Devuelve hallazgos ordenados por impacto anual estimado (centavos).
export function detectarFugas(asientos, cuentas, hoy, { umbralHormiga = 30_000_00, recurrentesConocidos = [] } = {}) {
  const tipo = Object.fromEntries(cuentas.map((c) => [c.id, c]));
  const gastos = [];
  for (const a of asientos) for (const p of a.partidas) {
    if (tipo[p.cuenta]?.tipo === 'gasto' && p.monto > 0) gastos.push({ fecha: a.fecha, monto: p.monto, cuenta: p.cuenta, clave: normalizarTexto(a.tercero || a.descripcion), texto: a.tercero || a.descripcion || '', etiquetas: a.etiquetas || [] });
  }
  const hallazgos = [];
  const conocidos = new Set(recurrentesConocidos.map(normalizarTexto));

  // 1. Cobros recurrentes (suscripciones) que no están declarados como recurrentes.
  const desde12 = restarDias(hoy, 365);
  const porClave = {};
  // Obligaciones (arriendo, colegio, servicios, salud, apoyo familiar, impuestos) no son fugas: solo se revisan
  // rubros donde suelen esconderse cobros olvidados.
  const revisables = new Set(['suscripciones', 'ocio', 'trabajo', 'otros_gas', 'financieros']);
  for (const g of gastos) if (g.clave && g.fecha >= desde12 && !g.etiquetas.includes('recurrente') && revisables.has(g.cuenta)) (porClave[g.clave] ||= []).push(g);
  for (const [clave, gs] of Object.entries(porClave)) {
    const meses = new Set(gs.map((g) => mesDe(g.fecha)));
    if (meses.size < 3 || conocidos.has(clave)) continue;
    const montos = gs.map((g) => g.monto), m = media(montos);
    if (desv(montos) / m > 0.05) continue; // las suscripciones cobran casi lo mismo cada vez
    const ultimo = gs.map((g) => g.fecha).sort().at(-1);
    if (ultimo < restarDias(hoy, 45)) continue;
    hallazgos.push({ tipo: 'recurrente', cuenta: gs[0].cuenta, titulo: `Cobro recurrente: ${gs[0].texto}`,
      detalle: `Aparece en ${meses.size} meses por ~${(m / 100).toLocaleString('es-CO')} cada vez. ¿Lo sigues usando?`, impactoAnual: Math.round(m * 12) });
  }

  // 2. Gastos hormiga (últimos 30 días).
  const desde30 = restarDias(hoy, 30);
  const recientes = gastos.filter((g) => g.fecha > desde30 && g.fecha <= hoy);
  const pequenos = recientes.filter((g) => g.monto < umbralHormiga);
  const totalPeq = pequenos.reduce((t, g) => t + g.monto, 0), totalRec = recientes.reduce((t, g) => t + g.monto, 0);
  if (pequenos.length >= 8 && totalRec && totalPeq / totalRec >= 0.05) {
    hallazgos.push({ tipo: 'hormiga', titulo: `Gastos hormiga: ${pequenos.length} compras pequeñas en 30 días`,
      detalle: `Suman ${(totalPeq / 100).toLocaleString('es-CO')} (${Math.round((totalPeq / totalRec) * 100)} % del gasto del período).`, impactoAnual: Math.round(totalPeq * 12) });
  }

  // 3. Categorías fuera de su comportamiento habitual: mes actual vs media + 2 desviaciones de los 6 meses previos.
  const mesActual = hoy.slice(0, 7), previos = mesesHasta(mesActual, 7).slice(0, 6);
  const porCuentaMes = {};
  for (const g of gastos) { const k = `${g.cuenta}|${mesDe(g.fecha)}`; porCuentaMes[k] = (porCuentaMes[k] || 0) + g.monto; }
  for (const c of cuentas.filter((x) => x.tipo === 'gasto')) {
    const hist = previos.map((m) => porCuentaMes[`${c.id}|${m}`] || 0);
    if (hist.filter((x) => x > 0).length < 3) continue;
    const actual = porCuentaMes[`${c.id}|${mesActual}`] || 0, m = media(hist), s = desv(hist);
    if (actual > m + 2 * s && actual > m * 1.25 && actual - m > 50_000_00) {
      hallazgos.push({ tipo: 'anomalia', cuenta: c.id, titulo: `${c.nombre} por encima de lo normal`,
        detalle: `Este mes van ${(actual / 100).toLocaleString('es-CO')} frente a un promedio de ${(m / 100).toLocaleString('es-CO')} (+${Math.round((actual / m - 1) * 100)} %).`, impactoAnual: Math.round((actual - m) * 12) });
    }
  }

  // 4. Costos financieros evitables (intereses, comisiones, 4x1000).
  const fin = gastos.filter((g) => g.cuenta === 'financieros' && g.fecha >= desde12).reduce((t, g) => t + g.monto, 0);
  if (fin > 0) hallazgos.push({ tipo: 'financiero', cuenta: 'financieros', titulo: 'Costos financieros en 12 meses',
    detalle: 'Intereses de tarjeta, cuotas de manejo y comisiones. Revisa si puedes pagar la tarjeta de contado o cambiar de producto.', impactoAnual: fin });

  return hallazgos.sort((a, b) => b.impactoAnual - a.impactoAnual);
}

// ---------- Metas (vacaciones, inversión, apoyo, familia) ----------
// Aportado = movimientos con etiqueta `meta:<id>` que llevan dinero a activos (ahorro) o pagan gastos de la meta.
export function estadoMeta(meta, asientos, cuentas, hoy) {
  const etiqueta = `meta:${meta.id}`;
  const tipo = Object.fromEntries(cuentas.map((c) => [c.id, c.tipo]));
  let aportado = 0, gastado = 0;
  const porMes = {};
  for (const a of asientos) {
    if (!(a.etiquetas || []).includes(etiqueta)) continue;
    for (const p of a.partidas) {
      if (p.monto <= 0) continue;
      if (tipo[p.cuenta] === 'gasto') { gastado += p.monto; porMes[mesDe(a.fecha)] = (porMes[mesDe(a.fecha)] || 0) + p.monto; }
      else if (tipo[p.cuenta] === 'activo' && a.tipo === 'transferencia') aportado += p.monto;
    }
  }
  const [ah, mh] = hoy.split('-').map(Number);
  const mesesRestantes = meta.fecha ? Math.max(0, (Number(meta.fecha.slice(0, 4)) - ah) * 12 + Number(meta.fecha.slice(5, 7)) - mh) : null;
  const base = meta.tipo === 'apoyo' || meta.tipo === 'familia' ? gastado : aportado;
  const falta = Math.max(0, (meta.objetivo || 0) - base);
  return {
    aportado, gastado, falta, porMes,
    avance: meta.objetivo ? Math.min(1, base / meta.objetivo) : 0,
    mesesRestantes,
    aporteSugerido: mesesRestantes ? Math.ceil(falta / mesesRestantes) : falta,
    partes: (meta.partes || []).map((pt) => ({ ...pt, gastado: asientos.filter((a) => (a.etiquetas || []).includes(etiqueta) && (a.etiquetas || []).includes(`parte:${pt.nombre}`))
      .reduce((t, a) => t + a.partidas.filter((p) => p.monto > 0 && tipo[p.cuenta] === 'gasto').reduce((u, p) => u + p.monto, 0), 0) })),
  };
}

// Valor futuro con aportes mensuales. tasaEA = tasa efectiva anual (0.11 = 11 %).
export function proyeccionInversion({ capital = 0, aporteMensual = 0, tasaEA = 0, anios = 1 }) {
  const im = Math.pow(1 + tasaEA, 1 / 12) - 1;
  const serie = [];
  let saldo = capital, aportes = capital;
  for (let m = 1; m <= Math.round(anios * 12); m++) {
    saldo = saldo * (1 + im) + aporteMensual;
    aportes += aporteMensual;
    if (m % 12 === 0 || m === Math.round(anios * 12)) serie.push({ mes: m, saldo: Math.round(saldo), aportes: Math.round(aportes) });
  }
  return { final: Math.round(saldo), aportes: Math.round(aportes), rendimiento: Math.round(saldo - aportes), serie };
}

// ---------- Proyección de flujo de caja a partir de los recurrentes ----------
export function proyectarFlujo(recurrentes, cuentas, saldoInicial, hoy, meses = 3) {
  const liquidas = new Set(['caja', 'banco']);
  const tipo = Object.fromEntries(cuentas.map((c) => [c.id, c.tipo]));
  const hasta = (() => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + meses); return d.toISOString().slice(0, 10); })();
  const eventos = [];
  for (const r of recurrentes) {
    const virtual = { ...r, ultima: r.ultima && r.ultima > hoy ? r.ultima : (L_ultimaAntes(r, hoy)) };
    for (const f of fechasPendientes(virtual, hasta)) {
      if (f <= hoy) continue;
      const { origen, destino, monto, descripcion } = r.plantilla;
      let efecto = 0;
      if (liquidas.has(destino)) efecto += monto;
      if (liquidas.has(origen)) efecto -= monto;
      if (efecto) eventos.push({ fecha: f, descripcion, efecto, tipo: tipo[destino] });
    }
  }
  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
  let saldo = saldoInicial, minimo = { saldo: saldoInicial, fecha: hoy };
  const linea = eventos.map((e) => { saldo += e.efecto; if (saldo < minimo.saldo) minimo = { saldo, fecha: e.fecha }; return { ...e, saldo }; });
  return { eventos: linea, saldoFinal: saldo, minimo };
}
// Última ocurrencia <= hoy (o undefined si aún no inicia), para proyectar solo lo futuro.
function L_ultimaAntes(r, hoy) {
  const pasadas = fechasPendientes({ ...r, ultima: undefined }, hoy);
  return pasadas.at(-1);
}

// ---------- Importación de extractos (zona de revisión) ----------
// Una "fila" es un movimiento de extracto aún no contabilizado:
// { id, lote, cuenta, fecha, descripcion, monto (negativo = sale de la cuenta del extracto), clave, rubro, motivo, estado, parId, asientoId }

const RUIDO = /\b(COMPRA|COMPRAS|PAGO|PAGOS|POS|EN|DE|LA|EL|REF|REFERENCIA|NRO|NO|TRANSF|TRANSFERENCIA|ABONO|CARGO|DEBITO|CREDITO|TARJETA|TRX|TRANS|CO|COL|BOGOTA|MEDELLIN|CALI|COLOMBIA|SAS|S A|LTDA|WWW|COM|APP|VISA|MASTERCARD|MC|QR|PSE)\b/g;

// Clave estable del comercio: sin números, referencias ni palabras de relleno ("COMPRA EN RAPPI*7781 BOGOTA" → "RAPPI").
export function claveComercio(descripcion) {
  const n = normalizarTexto(descripcion).replace(/\d+/g, ' ').replace(RUIDO, ' ').replace(/\b[A-Z]\b/g, ' ').replace(/\s+/g, ' ').trim();
  return n.split(' ').slice(0, 3).join(' ') || normalizarTexto(descripcion).slice(0, 20) || 'SIN DESCRIPCION';
}

const claveFila = (f) => `${f.cuenta}|${f.fecha}|${f.monto}|${normalizarTexto(f.descripcion)}`;

const diasEntre = (a, b) => Math.abs((new Date(`${a}T00:00:00Z`) - new Date(`${b}T00:00:00Z`)) / 86400000);

// Marca duplicados: (1) el mismo movimiento ya vino en otro extracto (extractos que se solapan);
// (2) posible duplicado de un movimiento registrado a mano o desde un soporte (misma cuenta y valor, ±3 días).
export function marcarDuplicados(nuevas, existentes, asientos) {
  const previas = {};
  for (const f of existentes) previas[claveFila(f)] = (previas[claveFila(f)] || 0) + 1; // incluye las descartadas: ya se revisaron
  for (const a of asientos) if (a.lote) for (const p of a.partidas) {
    const k = `${p.cuenta}|${a.fecha}|${p.monto}|${normalizarTexto(a.descripcion)}`;
    previas[k] = (previas[k] || 0) + 1;
  }
  const manuales = asientos.filter((a) => !a.lote && a.tipo !== 'apertura');
  const usados = new Set();
  return nuevas.map((f) => {
    const k = claveFila(f);
    if (previas[k] > 0) { previas[k]--; return { ...f, estado: 'duplicada' }; }
    const gemelo = manuales.find((a) => !usados.has(a.id) && diasEntre(a.fecha, f.fecha) <= 3 && a.partidas.some((p) => p.cuenta === f.cuenta && p.monto === f.monto));
    if (gemelo) { usados.add(gemelo.id); return { ...f, estado: 'posible_duplicada', asientoId: gemelo.id }; }
    return f;
  });
}

// Empareja transferencias entre cuentas propias: mismo valor con signo contrario en dos cuentas, ±3 días
// (p. ej. "PAGO TARJETA" en el extracto de ahorros y "ABONO" en el de la tarjeta).
export function emparejarTransferencias(filas) {
  const libres = filas.filter((f) => f.estado === 'pendiente' && !f.parId);
  const salida = new Map(filas.map((f) => [f.id, f]));
  for (const f of libres) {
    if (f.monto >= 0 || salida.get(f.id).parId) continue;
    const par = libres.find((g) => g.cuenta !== f.cuenta && g.monto === -f.monto && !salida.get(g.id).parId && diasEntre(g.fecha, f.fecha) <= 3);
    if (par) {
      salida.set(f.id, { ...salida.get(f.id), estado: 'transferencia', parId: par.id, rubro: par.cuenta, motivo: 'transferencia entre tus cuentas' });
      salida.set(par.id, { ...salida.get(par.id), estado: 'transferencia', parId: f.id, rubro: f.cuenta, motivo: 'transferencia entre tus cuentas' });
    }
  }
  return filas.map((f) => salida.get(f.id));
}

// Grupos por comercio para clasificar muchos movimientos de una vez. Primero los que no tienen rubro y más pesan.
export function agruparPorComercio(filas) {
  const grupos = {};
  for (const f of filas) {
    if (f.estado !== 'pendiente') continue;
    const g = (grupos[f.clave] ||= { clave: f.clave, filas: [], total: 0, entradas: 0, ejemplo: f.descripcion });
    g.filas.push(f); g.total += Math.abs(f.monto); if (f.monto > 0) g.entradas++;
  }
  return Object.values(grupos).map((g) => {
    const rubros = {};
    for (const f of g.filas) if (f.rubro) rubros[f.rubro] = (rubros[f.rubro] || 0) + 1;
    const [rubro] = Object.entries(rubros).sort((a, b) => b[1] - a[1])[0] || [null];
    return { ...g, signo: g.entradas > g.filas.length / 2 ? 1 : -1, rubro, sinRubro: g.filas.filter((f) => !f.rubro).length };
  }).sort((a, b) => (b.sinRubro > 0) - (a.sinRubro > 0) || b.total - a.total);
}

// Sugerencia automática para filas sin rubro (reglas > historial > palabras clave).
export function autoclasificar(filas, asientos, reglas, cuentas) {
  return filas.map((f) => {
    if (f.estado !== 'pendiente' || f.rubro) return f;
    const tipo = f.monto > 0 ? 'ingreso' : 'gasto';
    const s = sugerirCuenta({ descripcion: f.descripcion, tipo }, asientos, reglas, cuentas);
    if (s.cuenta) return { ...f, rubro: s.cuenta, motivo: s.motivo };
    if (tipo === 'gasto' && /PAGO.*(TARJETA|TC)|ABONO.*TARJETA/.test(normalizarTexto(f.descripcion)) && f.cuenta !== 'tc') return { ...f, rubro: 'tc', motivo: 'pago de tarjeta' };
    return f;
  });
}

// Conciliación: ¿cuadran saldo inicial + movimientos = saldo final? En tarjetas el saldo es deuda (signo contrario).
export function conciliar({ saldoInicial, saldoFinal, movimientos, esTarjeta = false }) {
  if (!Number.isFinite(saldoInicial) || !Number.isFinite(saldoFinal)) return { cuadra: null, diferencia: null };
  const suma = movimientos.reduce((t, m) => t + m, 0);
  const esperado = esTarjeta ? saldoInicial - suma : saldoInicial + suma;
  const diferencia = saldoFinal - esperado;
  return { cuadra: Math.abs(diferencia) < 100, diferencia }; // tolerancia de $1
}

// Fila clasificada → asiento. El rubro puede ser gasto, ingreso o una cuenta propia (transferencia).
export function filaAAsiento(f, cuentas) {
  const tipoRubro = cuentas.find((c) => c.id === f.rubro)?.tipo;
  const tipo = tipoRubro === 'gasto' ? 'gasto' : tipoRubro === 'ingreso' ? 'ingreso' : 'transferencia';
  return {
    fecha: f.fecha, descripcion: f.descripcion, tercero: '', tipo, lote: f.lote, etiquetas: ['importado'],
    partidas: [{ cuenta: f.cuenta, monto: f.monto }, { cuenta: f.rubro, monto: -f.monto }],
  };
}

// Filas tabulares (CSV/Excel) → filas de importación. Admite una columna de valor con signo
// o dos columnas separadas de débitos y créditos.
export function tablaAFilas(filas, { colFecha, colDescripcion, colMonto = -1, colDebito = -1, colCredito = -1, cuenta, lote, encabezado = true, invertir = false }) {
  const datos = encabezado ? filas.slice(1) : filas;
  const salida = [], errores = [];
  datos.forEach((f, i) => {
    const fecha = normalizarFecha(f[colFecha] || '');
    let monto;
    if (colMonto >= 0) monto = aCentavos(f[colMonto] || '');
    else {
      const deb = colDebito >= 0 && String(f[colDebito] || '').trim() ? Math.abs(aCentavos(f[colDebito])) : 0;
      const cre = colCredito >= 0 && String(f[colCredito] || '').trim() ? Math.abs(aCentavos(f[colCredito])) : 0;
      monto = cre - deb;
    }
    if (invertir) monto = -monto;
    const descripcion = String(f[colDescripcion] || '').trim();
    if (!fecha || !Number.isFinite(monto) || monto === 0) { errores.push(i + (encabezado ? 2 : 1)); return; }
    salida.push({ lote, cuenta, fecha, descripcion, monto, clave: claveComercio(descripcion), rubro: null, motivo: null, estado: 'pendiente' });
  });
  return { filas: salida, errores };
}
