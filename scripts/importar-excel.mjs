/**
 * Importador de históricos del Daily Scorecard (Excel → Postgres).
 *
 * Uso:  node scripts/importar-excel.mjs "Daily scorecard template TQ-1 21-abr-2025-Formulas.xlsx"
 *
 * Recorre todas las hojas "Daily QRQC meeting …". Las fechas se toman de la
 * fila 4 (no del nombre de la hoja) y el área de la fila 2. Los valores NA/N/A
 * se importan como día no aplicable; los errores de fórmula (#DIV/0!, #VALUE!)
 * y celdas vacías se omiten. Los porcentajes en fracción (0.991) se normalizan
 * a 99.1. Las metas constantes del mes se guardan como meta mensual; si varían
 * por día se guardan como overrides diarios.
 *
 * El importador es idempotente: puede re-ejecutarse sin duplicar (upsert).
 */
import "dotenv/config";
import ExcelJS from "exceljs";
import pg from "pg";

const ARCHIVO = process.argv[2];
if (!ARCHIVO) {
  console.error("Uso: node scripts/importar-excel.mjs <archivo.xlsx>");
  process.exit(1);
}

// Mapeo nombre en Excel → nombre en el catálogo. Para renglones cuyo nombre en
// Excel combina líneas de varias áreas (OEE % L1/ML1/C1), el mapeo depende del área.
const MAPEO = [
  { excel: /accidentes/i, moldeo: "Accidentes", laminado: "Accidentes" },
  { excel: /incidentes/i, moldeo: "Incidentes", laminado: "Incidentes" },
  { excel: /ausentismo.*directa/i, moldeo: "Ausentismo labor directa", laminado: "Ausentismo labor directa" },
  { excel: /ausentismo.*ind/i, moldeo: "Ausentismo labor indirecta", laminado: "Ausentismo labor indirecta" },
  { excel: /yield/i, moldeo: "Yield interno", laminado: "Yield interno" },
  { excel: /rft/i, moldeo: "RFT (Real First Time)", laminado: "RFT (Real First Time)" },
  { excel: /reclamos cliente/i, moldeo: "Reclamos de cliente", laminado: "Reclamos de cliente" },
  { excel: /8ds/i, moldeo: "8Ds de cliente", laminado: "8Ds de cliente" },
  { excel: /reclamos prov/i, moldeo: "Reclamos a proveedor", laminado: "Reclamos a proveedor" },
  { excel: /cuarentena.*piezas/i, moldeo: "Cuarentena (piezas)", laminado: "Cuarentena (piezas)" },
  { excel: /cuarentena.*edad/i, moldeo: "Cuarentena (edad en días)", laminado: "Cuarentena (edad en días)" },
  { excel: /laboratorio/i, moldeo: "Pruebas de laboratorio NG", laminado: "Pruebas de laboratorio NG" },
  { excel: /producci?on \(piezas/i, moldeo: "Producción (piezas)", laminado: "Producción (piezas)" },
  // Cumplimiento al plan es CALCULADO en el sistema: solo se importa su meta
  { excel: /cumplimiento al plan/i, moldeo: "Cumplimiento al plan", laminado: "Cumplimiento al plan", soloMeta: true },
  { excel: /atraso producci/i, moldeo: "Atraso de producción", laminado: "Atraso de producción" },
  { excel: /materiales cr/i, moldeo: "Materiales críticos", laminado: "Materiales críticos" },
  { excel: /pilotajes/i, moldeo: "Pilotajes", laminado: "Pilotajes" },
  { excel: /embarques/i, moldeo: "Embarques", laminado: "Embarques" },
  { excel: /oee.*l1\/ml1\/c1/i, moldeo: "OEE ML1", laminado: "OEE L1" },
  { excel: /oee.*l2\/ml2\/c2/i, moldeo: "OEE ML2", laminado: "OEE L2" },
  { excel: /oee.*ml3/i, moldeo: "OEE ML3", laminado: null },
  { excel: /oee.*ml4/i, moldeo: "OEE ML4", laminado: null },
  { excel: /scrap l1/i, moldeo: "Scrap ML1", laminado: "Scrap L1" },
  { excel: /scrap l2/i, moldeo: "Scrap ML2", laminado: "Scrap L2" },
];

function limpiarTexto(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.result !== undefined) return String(v.result ?? "");
    return "";
  }
  return String(v);
}

/** Extrae el valor crudo de una celda: número, "NA", o null (omitir). */
function valorCelda(celda) {
  let v = celda.value;
  if (v && typeof v === "object") {
    if (v.error) return null; // #DIV/0!, #VALUE!, #REF!…
    if (v.result !== undefined) v = v.result;
    else if (v.richText) v = v.richText.map((t) => t.text).join("");
    else if (v instanceof Date) return null;
    else return null;
  }
  if (v == null || v === "") return null;
  if (typeof v === "number") return { tipo: "numero", valor: v };
  const texto = String(v).trim();
  if (/^n\/?a$/i.test(texto)) return { tipo: "na" };
  const num = Number(texto.replace(/%$/, "").replace(/,/g, ""));
  if (Number.isFinite(num)) return { tipo: "numero", valor: num };
  return null;
}

function fechaDeCelda(v) {
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  }
  if (v && typeof v === "object" && v.result instanceof Date) return fechaDeCelda(v.result);
  if (typeof v === "string") {
    const m = v.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return null;
}

function normalizar(valor, unidad) {
  if (unidad === "PORCENTAJE") {
    const v = valor < 1 ? valor * 100 : valor;
    return Math.round(v * 100) / 100;
  }
  if (unidad === "ENTERO") return Math.round(valor);
  return Math.round(valor * 100) / 100;
}

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

const { rows: kpisDb } = await cliente.query(
  `SELECT k.id, k.nombre, k.unidad, k.tipo, a.nombre AS area
   FROM kpis k JOIN areas a ON a.id = k.area_id`
);
const kpiPorAreaNombre = new Map(kpisDb.map((k) => [`${k.area}|${k.nombre}`, k]));

const wb = new ExcelJS.Workbook();
console.log(`Leyendo ${ARCHIVO}…`);
await wb.xlsx.readFile(ARCHIVO);

let capturas = 0, nas = 0, metasMensuales = 0, metasDiarias = 0, sinMapa = new Set();

for (const ws of wb.worksheets) {
  if (!/daily qrqc meeting/i.test(ws.name)) continue;

  // Mapa columna → { area, fecha } usando filas 2 (área) y 4 (fecha)
  const columnas = [];
  let areaActual = null;
  for (let c = 6; c <= ws.columnCount; c++) {
    const areaTexto = limpiarTexto(ws.getRow(2).getCell(c).value).toUpperCase();
    if (areaTexto.includes("MOLDEO")) areaActual = "Moldeo";
    else if (areaTexto.includes("LAMINADO")) areaActual = "Laminado";
    const fecha = fechaDeCelda(ws.getRow(4).getCell(c).value);
    if (areaActual && fecha) columnas.push({ col: c, area: areaActual, fecha });
  }
  if (columnas.length === 0) {
    console.log(`  [${ws.name}] sin columnas de fecha reconocibles, omitida`);
    continue;
  }

  // metasPorKpi: kpiId → Map<fecha, valor> para decidir mensual vs diaria
  const metasPorKpi = new Map();

  for (let r = 5; r <= ws.rowCount; r++) {
    const nombreExcel = limpiarTexto(ws.getRow(r).getCell(4).value).replace(/\s+/g, " ").trim();
    const tipoFila = limpiarTexto(ws.getRow(r).getCell(5).value).trim().toLowerCase();
    if (!nombreExcel || (tipoFila !== "actual" && tipoFila !== "meta")) continue;

    const mapa = MAPEO.find((m) => m.excel.test(nombreExcel));
    if (!mapa) { sinMapa.add(nombreExcel); continue; }

    for (const { col, area, fecha } of columnas) {
      const nombreCatalogo = area === "Moldeo" ? mapa.moldeo : mapa.laminado;
      if (!nombreCatalogo) continue;
      const kpi = kpiPorAreaNombre.get(`${area}|${nombreCatalogo}`);
      if (!kpi) { sinMapa.add(`${area}|${nombreCatalogo}`); continue; }

      const v = valorCelda(ws.getRow(r).getCell(col));
      if (!v) continue;

      if (tipoFila === "actual") {
        if (kpi.tipo === "CALCULADO" || mapa.soloMeta) continue;
        if (v.tipo === "na") {
          await cliente.query(
            `INSERT INTO capturas (kpi_id, fecha, valor, es_na) VALUES ($1,$2,NULL,TRUE)
             ON CONFLICT (kpi_id, fecha) DO UPDATE SET valor = NULL, es_na = TRUE`,
            [kpi.id, fecha]
          );
          nas++;
        } else {
          await cliente.query(
            `INSERT INTO capturas (kpi_id, fecha, valor, es_na) VALUES ($1,$2,$3,FALSE)
             ON CONFLICT (kpi_id, fecha) DO UPDATE SET valor = EXCLUDED.valor, es_na = FALSE`,
            [kpi.id, fecha, normalizar(v.valor, kpi.unidad)]
          );
          capturas++;
        }
      } else if (v.tipo === "numero") {
        if (!metasPorKpi.has(kpi.id)) metasPorKpi.set(kpi.id, new Map());
        metasPorKpi.get(kpi.id).set(fecha, normalizar(v.valor, kpi.unidad));
      }
    }
  }

  // Metas: constante en el mes → mensual; variable → overrides diarios
  for (const [kpiId, porFecha] of metasPorKpi) {
    const porMes = new Map();
    for (const [fecha, valor] of porFecha) {
      const mesClave = fecha.slice(0, 7);
      if (!porMes.has(mesClave)) porMes.set(mesClave, []);
      porMes.get(mesClave).push({ fecha, valor });
    }
    for (const [mesClave, entradas] of porMes) {
      const [anio, mes] = mesClave.split("-").map(Number);
      const valores = new Set(entradas.map((e) => e.valor));
      if (valores.size === 1) {
        await cliente.query(
          `INSERT INTO metas_mensuales (kpi_id, anio, mes, valor) VALUES ($1,$2,$3,$4)
           ON CONFLICT (kpi_id, anio, mes) DO UPDATE SET valor = EXCLUDED.valor`,
          [kpiId, anio, mes, entradas[0].valor]
        );
        metasMensuales++;
      } else {
        for (const e of entradas) {
          await cliente.query(
            `INSERT INTO metas_diarias (kpi_id, fecha, valor) VALUES ($1,$2,$3)
             ON CONFLICT (kpi_id, fecha) DO UPDATE SET valor = EXCLUDED.valor`,
            [kpiId, e.fecha, e.valor]
          );
          metasDiarias++;
        }
      }
    }
  }

  console.log(`  [${ws.name}] procesada (${columnas.length} columnas de día)`);
}

await cliente.query(
  "INSERT INTO auditoria (tipo, detalle) VALUES ('ADMIN', $1)",
  [`Importación de históricos desde Excel: ${capturas} capturas, ${nas} N/A, ${metasMensuales} metas mensuales, ${metasDiarias} metas diarias`]
);

console.log(`\nListo: ${capturas} capturas, ${nas} N/A, ${metasMensuales} metas mensuales, ${metasDiarias} overrides diarios.`);
if (sinMapa.size) {
  console.log("Renglones sin mapeo (ajusta MAPEO si aplican):");
  for (const s of sinMapa) console.log("  -", s);
}
await cliente.end();
