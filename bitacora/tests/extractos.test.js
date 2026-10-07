import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as L from '../modules/finanzas/ledger.js';
import { leerXlsx } from '../core/xlsx.js';

const cuentas = L.cuentasPorDefecto();
let n = 0;
const fila = (cuenta, fecha, monto, descripcion, extra = {}) => ({ id: `f${++n}`, lote: 'L1', cuenta, fecha, monto, descripcion, clave: L.claveComercio(descripcion), rubro: null, motivo: null, estado: 'pendiente', ...extra });

test('claveComercio agrupa variantes del mismo comercio', () => {
  assert.equal(L.claveComercio('COMPRA EN RAPPI*7781 BOGOTA'), L.claveComercio('COMPRA POS RAPPI 9921'));
  assert.equal(L.claveComercio('PAGO PSE EPM 123456'), 'EPM');
  assert.notEqual(L.claveComercio('EXITO POBLADO'), L.claveComercio('CARULLA OVIEDO'));
  assert.ok(L.claveComercio('12345').length > 0);
});

test('tablaAFilas: columna con signo o débito/crédito separados, fechas de Excel', () => {
  const t1 = [['Fecha', 'Descripción', 'Valor'], ['15/01/2025', 'EXITO', '-120.000,00'], ['45678', 'NOMINA', '5.000.000'], ['', 'basura', 'x']];
  const r1 = L.tablaAFilas(t1, { colFecha: 0, colDescripcion: 1, colMonto: 2, cuenta: 'banco', lote: 'L' });
  assert.equal(r1.filas.length, 2); assert.deepEqual(r1.errores, [4]);
  assert.equal(r1.filas[0].monto, -12_000_000);
  assert.equal(r1.filas[1].fecha, '2025-01-21'); // serial 45678
  const t2 = [['Fecha', 'Concepto', 'Débito', 'Crédito'], ['2025-02-01', 'ARRIENDO', '1.900.000', ''], ['2025-02-05', 'ABONO', '', '300.000']];
  const r2 = L.tablaAFilas(t2, { colFecha: 0, colDescripcion: 1, colDebito: 2, colCredito: 3, cuenta: 'banco', lote: 'L' });
  assert.deepEqual(r2.filas.map((f) => f.monto), [-190_000_000, 30_000_000]);
});

test('marcarDuplicados: extractos solapados y movimientos ya registrados', () => {
  const existentes = [fila('banco', '2025-03-01', -50_000_00, 'EXITO')];
  const asientos = [{ id: 'a1', fecha: '2025-03-09', tipo: 'gasto', descripcion: 'Droguería', partidas: [{ cuenta: 'salud', monto: 87_000_00 }, { cuenta: 'banco', monto: -87_000_00 }] }];
  const nuevas = [
    fila('banco', '2025-03-01', -50_000_00, 'EXITO'), // ya vino en otro extracto
    fila('banco', '2025-03-01', -50_000_00, 'EXITO'), // segunda compra idéntica el mismo día: se conserva
    fila('banco', '2025-03-10', -87_000_00, 'CRUZ VERDE'), // registrada desde un soporte de WhatsApp
    fila('banco', '2025-03-20', -10_000_00, 'TIENDA'),
  ];
  const r = L.marcarDuplicados(nuevas, existentes, asientos);
  assert.deepEqual(r.map((f) => f.estado), ['duplicada', 'pendiente', 'posible_duplicada', 'pendiente']);
  assert.equal(r[2].asientoId, 'a1');
});

test('emparejarTransferencias: pago de tarjeta visto en dos extractos', () => {
  const filas = [fila('banco', '2025-04-02', -1_000_000_00, 'PAGO TARJETA CREDITO'), fila('tc', '2025-04-03', 1_000_000_00, 'ABONO GRACIAS'), fila('banco', '2025-04-05', -1_000_000_00, 'CDT')];
  const r = L.emparejarTransferencias(filas);
  assert.equal(r[0].estado, 'transferencia'); assert.equal(r[0].parId, r[1].id); assert.equal(r[0].rubro, 'tc');
  assert.equal(r[1].rubro, 'banco');
  assert.equal(r[2].estado, 'pendiente');
});

test('autoclasificar, agrupar y filaAAsiento', () => {
  const filas = L.autoclasificar([
    fila('banco', '2025-05-01', -90_000_00, 'COMPRA EXITO 123'), fila('banco', '2025-05-08', -80_000_00, 'COMPRA EXITO 456'),
    fila('banco', '2025-05-09', -20_000_00, 'TIENDA DON JOSE'), fila('banco', '2025-05-10', -500_000_00, 'PAGO TARJETA CREDITO VISA'),
  ], [], [], cuentas);
  assert.equal(filas[0].rubro, 'alimentacion'); assert.equal(filas[2].rubro, null); assert.equal(filas[3].rubro, 'tc');
  const grupos = L.agruparPorComercio(filas);
  assert.equal(grupos[0].clave, L.claveComercio('TIENDA DON JOSE')); // sin rubro primero
  const exito = grupos.find((g) => g.clave === L.claveComercio('COMPRA EXITO 1'));
  assert.equal(exito.filas.length, 2); assert.equal(exito.rubro, 'alimentacion'); assert.equal(exito.signo, -1);
  const a = L.filaAAsiento(filas[0], cuentas);
  assert.deepEqual(L.validarAsiento(a), []); assert.equal(a.tipo, 'gasto');
  assert.equal(L.filaAAsiento(filas[3], cuentas).tipo, 'transferencia');
});

test('conciliar cuentas de ahorro y tarjetas', () => {
  assert.equal(L.conciliar({ saldoInicial: 1000_00, saldoFinal: 700_00, movimientos: [-500_00, 200_00] }).cuadra, true);
  assert.equal(L.conciliar({ saldoInicial: 1000_00, saldoFinal: 800_00, movimientos: [-500_00, 200_00] }).diferencia, 100_00);
  // tarjeta: deuda 1000, compras 300 (−), pago 500 (+) → deuda 800
  assert.equal(L.conciliar({ saldoInicial: 1000_00, saldoFinal: 800_00, movimientos: [-300_00, 500_00], esTarjeta: true }).cuadra, true);
  assert.equal(L.conciliar({ saldoInicial: NaN, saldoFinal: 1, movimientos: [] }).cuadra, null);
});

test('leerXlsx lee un Excel real (generado con openpyxl)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xlsx-'));
  const ruta = join(dir, 'extracto.xlsx');
  execFileSync('python3', ['-I', '-c', `
import openpyxl, datetime, sys
wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Movimientos'
ws.append(['Fecha', 'Descripción', 'Débito', 'Crédito'])
ws.append([datetime.date(2025, 1, 15), 'COMPRA ÉXITO & CÍA <POS>', 120000.5, None])
ws.append([datetime.date(2025, 1, 30), 'NÓMINA', None, 5000000])
wb.create_sheet('Otra').append(['no', 'leer'])
wb.save(sys.argv[1])`, ruta]);
  const buf = readFileSync(ruta);
  const filas = await leerXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  assert.deepEqual(filas[0], ['Fecha', 'Descripción', 'Débito', 'Crédito']);
  assert.equal(filas[1][1], 'COMPRA ÉXITO & CÍA <POS>');
  const r = L.tablaAFilas(filas, { colFecha: 0, colDescripcion: 1, colDebito: 2, colCredito: 3, cuenta: 'banco', lote: 'L' });
  assert.deepEqual(r.filas.map((f) => [f.fecha, f.monto]), [['2025-01-15', -12_000_050], ['2025-01-30', 500_000_000]]);
});

test('categorizar con reglas por comercio y sin importar tildes', () => {
  const reglas = [{ clave: L.claveComercio('DROGUERIA LA ECONOMIA 12'), cuenta: 'salud' }, { contiene: 'éxito', cuenta: 'alimentacion' }];
  assert.equal(L.categorizar('COMPRA DROGUERIA LA ECONOMIA 9981', reglas, null), 'salud');
  assert.equal(L.categorizar('EXITO LAURELES', reglas, null), 'alimentacion');
  assert.equal(L.categorizar('OTRA COSA', reglas, 'x'), 'x');
});

test('palabras clave de ingresos', () => {
  assert.equal(L.sugerirCuenta({ descripcion: 'PAGO NOMINA UNIVERSIDAD', tipo: 'ingreso' }, [], [], cuentas).cuenta, 'salario');
  assert.equal(L.sugerirCuenta({ descripcion: 'ABONO HONORARIOS ALCALDIA', tipo: 'ingreso' }, [], [], cuentas).cuenta, 'honorarios');
  assert.equal(L.sugerirCuenta({ descripcion: 'PAGO NOMINA', tipo: 'gasto' }, [], [], cuentas).cuenta, null);
});

test('palabras clave respetan límites de palabra', () => {
  assert.equal(L.sugerirCuenta({ descripcion: 'MERCADOPAGO*TIENDAMIA' }, [], [], cuentas).cuenta, null);
  assert.equal(L.sugerirCuenta({ descripcion: 'PAGO PARA CARACOL' }, [], [], cuentas).cuenta, null);
  assert.equal(L.sugerirCuenta({ descripcion: 'TIENDAS ARA 123' }, [], [], cuentas).cuenta, 'alimentacion');
  assert.equal(L.sugerirCuenta({ descripcion: 'COMPRA EN EXITO' }, [], [], cuentas).cuenta, 'alimentacion');
});

test('raíces de palabras clave', () => {
  assert.equal(L.sugerirCuenta({ descripcion: 'INTERESES CORRIENTES' }, [], [], cuentas).cuenta, 'financieros');
  assert.equal(L.sugerirCuenta({ descripcion: 'CENTRO MEDICO SURA' }, [], [], cuentas).cuenta, 'salud');
  assert.equal(L.sugerirCuenta({ descripcion: 'HOTELES DECAMERON' }, [], [], cuentas).cuenta, 'vacaciones');
});
