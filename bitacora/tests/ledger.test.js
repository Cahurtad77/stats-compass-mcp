import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../modules/finanzas/ledger.js';

const cuentas = L.cuentasPorDefecto();
const asientos = [
  { fecha: '2026-01-01', descripcion: 'Saldo inicial', partidas: [{ cuenta: 'banco', monto: 1_000_000_00 }, { cuenta: 'patrimonio', monto: -1_000_000_00 }] },
  L.movimientoAAsiento({ tipo: 'ingreso', fecha: '2026-01-30', monto: 5_000_000_00, origen: 'salario', destino: 'banco' }),
  L.movimientoAAsiento({ tipo: 'gasto', fecha: '2026-01-15', monto: 800_000_00, origen: 'tc', destino: 'alimentacion' }),
  L.honorariosAAsiento({ fecha: '2026-02-10', bruto: 2_000_000_00, tasaRetencion: 0.11, cliente: 'Alcaldía' }),
];

test('todos los asientos cuadran', () => {
  for (const a of asientos) assert.deepEqual(L.validarAsiento(a), []);
});

test('validarAsiento detecta descuadre', () => {
  const malo = { fecha: '2026-01-01', partidas: [{ cuenta: 'banco', monto: 100 }, { cuenta: 'ocio', monto: -99 }] };
  assert.ok(L.validarAsiento(malo).some((e) => e.includes('no cuadra')));
});

test('honorarios registran retención como activo', () => {
  const a = asientos[3];
  const s = L.saldos([a]);
  assert.equal(s.ret_favor, 220_000_00);
  assert.equal(s.banco, 1_780_000_00);
  assert.equal(s.honorarios, -2_000_000_00);
});

test('estado de resultados y tasa de ahorro', () => {
  const er = L.estadoResultados(asientos, cuentas, '2026-01-01', '2026-01-31');
  assert.equal(er.totalIngresos, 5_000_000_00);
  assert.equal(er.totalGastos, 800_000_00);
  assert.equal(er.resultado, 4_200_000_00);
  assert.ok(Math.abs(er.tasaAhorro - 0.84) < 1e-9);
});

test('balance general cumple la ecuación contable', () => {
  const bg = L.balanceGeneral(asientos, cuentas, '2026-12-31');
  assert.equal(bg.totalActivos, bg.totalPasivos + bg.totalPatrimonio);
  assert.equal(bg.totalPasivos, 800_000_00);
});

test('presupuesto mensual con comodín', () => {
  const r = L.estadoPresupuesto([{ mes: '*', cuenta: 'alimentacion', monto: 1_000_000_00 }], asientos, cuentas, '2026-01');
  assert.equal(r[0].gastado, 800_000_00);
  assert.equal(r[0].disponible, 200_000_00);
});

test('aCentavos entiende formato colombiano e internacional', () => {
  assert.equal(L.aCentavos('1.234.567,89'), 123456789);
  assert.equal(L.aCentavos('1,234,567.89'), 123456789);
  assert.equal(L.aCentavos('$ 50.000'), 5000000);
  assert.equal(L.aCentavos('-12500'), -1250000);
});

test('recurrentes mensuales respetan fin de mes', () => {
  const f = L.fechasPendientes({ frecuencia: 'mensual', inicio: '2026-01-31' }, '2026-04-30');
  assert.deepEqual(f, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  const g = L.fechasPendientes({ frecuencia: 'mensual', inicio: '2026-01-31', ultima: '2026-03-31' }, '2026-04-29');
  assert.deepEqual(g, []);
});

test('obligación de declarar con UVT 2026', () => {
  const r = L.obligacionDeclarar({ ingresosBrutos: 80_000_000_00 }, 2026);
  assert.equal(r.uvt, 52374);
  assert.equal(r.obligado, true);
  assert.equal(r.criterios[1].tope, 1400 * 52374 * 100);
  assert.equal(L.obligacionDeclarar({ ingresosBrutos: 1 }, 2026).obligado, false);
});

test('importación de extracto con ; y reglas', () => {
  const csv = 'Fecha;Descripción;Valor\n05/03/2026;COMPRA EXITO POBLADO;-150.000,00\n06/03/2026;"PAGO NOMINA; PCJIC";4.000.000,00\nbasura;;\n';
  const filas = L.parseCSV(csv);
  const { asientos: imp, errores } = L.extractoAAsientos(filas, {
    colFecha: 0, colDescripcion: 1, colMonto: 2, cuentaBanco: 'banco',
    reglas: [{ contiene: 'exito', cuenta: 'alimentacion' }, { contiene: 'nomina', cuenta: 'salario' }],
  });
  assert.equal(imp.length, 2);
  assert.deepEqual(errores, [4]);
  assert.equal(imp[0].fecha, '2026-03-05');
  assert.equal(imp[0].partidas[1].cuenta, 'alimentacion');
  assert.equal(imp[1].partidas[1].cuenta, 'salario');
  for (const a of imp) assert.deepEqual(L.validarAsiento(a), []);
});

test('exportaciones tidy y hledger', () => {
  const tidy = L.asientosATidyCSV(asientos, cuentas).trim().split('\n');
  assert.equal(tidy.length, 1 + asientos.reduce((n, a) => n + a.partidas.length, 0));
  const hl = L.asientosAHledger(asientos, cuentas);
  assert.match(hl, /^2026-01-01 Saldo inicial/);
  assert.match(hl, /activos:Retenciones en la fuente a favor\s+220000\.00 COP/);
});

test('resumen fiscal', () => {
  const r = L.resumenFiscal(asientos, cuentas, 2026);
  assert.equal(r.retenciones, 220_000_00);
  assert.equal(r.consumosTC, 800_000_00);
  assert.equal(r.porGrupo.consultoria, 2_000_000_00);
});
