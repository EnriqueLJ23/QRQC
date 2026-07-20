import { query } from "./db.server";
import { cumpleMeta } from "~/lib/formato";
import type { Kpi } from "./scorecard.server";

export type Granularidad = "diaria" | "semanal" | "mensual";

type ValorDia = { valor: number | null; esNa: boolean; meta: number | null };

/** Carga KPIs (con área/categoría) por id. */
export async function kpisPorId(ids: number[]): Promise<Map<number, Kpi & { area: string }>> {
  if (ids.length === 0) return new Map();
  const filas = await query<Kpi & { area: string }>(
    `SELECT k.*, c.nombre AS categoria, c.orden AS categoria_orden, a.nombre AS area
     FROM kpis k JOIN categorias c ON c.id = k.categoria_id JOIN areas a ON a.id = k.area_id
     WHERE k.id = ANY($1)`,
    [ids]
  );
  return new Map(filas.map((f) => [f.id, f]));
}

/**
 * Valores diarios efectivos (capturas + fórmulas de KPIs calculados) y meta
 * vigente por día, para un rango de fechas. Excluye nada: el que agrega decide.
 */
export async function valoresDiarios(
  kpiIds: number[],
  desde: string,
  hasta: string
): Promise<Map<number, Map<string, ValorDia>>> {
  const resultado = new Map<number, Map<string, ValorDia>>();
  if (kpiIds.length === 0) return resultado;

  const kpis = await kpisPorId(kpiIds);
  const baseIds = new Set<number>(kpiIds);
  for (const k of kpis.values()) {
    if (k.formula?.kpi_base) baseIds.add(k.formula.kpi_base);
    if (k.formula?.num) baseIds.add(k.formula.num);
    if (k.formula?.den) baseIds.add(k.formula.den);
  }
  const todosIds = [...baseIds];

  const capturas = await query<{ kpi_id: number; fecha: string; valor: number | null; es_na: boolean }>(
    "SELECT kpi_id, fecha, valor, es_na FROM capturas WHERE kpi_id = ANY($1) AND fecha BETWEEN $2 AND $3",
    [todosIds, desde, hasta]
  );
  const capMap = new Map<string, { valor: number | null; esNa: boolean }>();
  for (const c of capturas) capMap.set(`${c.kpi_id}|${c.fecha}`, { valor: c.valor, esNa: c.es_na });

  const mensuales = await query<{ kpi_id: number; anio: number; mes: number; valor: number | null }>(
    `SELECT kpi_id, anio, mes, valor FROM metas_mensuales WHERE kpi_id = ANY($1)
     AND make_date(anio, mes, 1) BETWEEN date_trunc('month', $2::date) AND $3::date`,
    [todosIds, desde, hasta]
  );
  const metaMensual = new Map<string, number | null>();
  for (const m of mensuales) metaMensual.set(`${m.kpi_id}|${m.anio}-${String(m.mes).padStart(2, "0")}`, m.valor);

  const diarias = await query<{ kpi_id: number; fecha: string; valor: number | null }>(
    "SELECT kpi_id, fecha, valor FROM metas_diarias WHERE kpi_id = ANY($1) AND fecha BETWEEN $2 AND $3",
    [todosIds, desde, hasta]
  );
  const metaDiaria = new Map<string, number | null>();
  for (const d of diarias) metaDiaria.set(`${d.kpi_id}|${d.fecha}`, d.valor);

  const metaDe = (kpiId: number, fecha: string): number | null => {
    const d = metaDiaria.get(`${kpiId}|${fecha}`);
    if (d !== undefined) return d;
    return metaMensual.get(`${kpiId}|${fecha.slice(0, 7)}`) ?? null;
  };

  const fechas: string[] = [];
  const cursor = new Date(`${desde}T00:00:00`);
  const fin = new Date(`${hasta}T00:00:00`);
  while (cursor <= fin) {
    fechas.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`
    );
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const kpiId of kpiIds) {
    const kpi = kpis.get(kpiId);
    const mapa = new Map<string, ValorDia>();
    for (const fecha of fechas) {
      let valor: number | null = null;
      let esNa = false;
      if (kpi?.tipo === "CALCULADO" && kpi.formula) {
        if (kpi.formula.tipo === "razon_vs_meta" && kpi.formula.kpi_base) {
          const base = capMap.get(`${kpi.formula.kpi_base}|${fecha}`);
          const metaBase = metaDe(kpi.formula.kpi_base, fecha);
          esNa = base?.esNa ?? false;
          if (!esNa && base?.valor != null && metaBase != null && metaBase !== 0) {
            valor = Math.round((base.valor / metaBase) * 1000) / 10;
          }
        } else if (kpi.formula.tipo === "razon" && kpi.formula.num && kpi.formula.den) {
          const num = capMap.get(`${kpi.formula.num}|${fecha}`);
          const den = capMap.get(`${kpi.formula.den}|${fecha}`);
          esNa = (num?.esNa ?? false) || (den?.esNa ?? false);
          if (!esNa && num?.valor != null && den?.valor != null && den.valor !== 0) {
            valor = Math.round((num.valor / den.valor) * 1000) / 10;
          }
        }
      } else {
        const c = capMap.get(`${kpiId}|${fecha}`);
        valor = c?.valor ?? null;
        esNa = c?.esNa ?? false;
      }
      mapa.set(fecha, { valor, esNa, meta: metaDe(kpiId, fecha) });
    }
    resultado.set(kpiId, mapa);
  }
  return resultado;
}

function claveBucket(fecha: string, gran: Granularidad): string {
  if (gran === "diaria") return fecha;
  if (gran === "mensual") return fecha.slice(0, 7);
  // semanal: lunes de la semana ISO
  const d = new Date(`${fecha}T00:00:00`);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function agregar(valores: number[], metodo: string): number | null {
  if (valores.length === 0) return null;
  if (metodo === "SUMA") return valores.reduce((a, b) => a + b, 0);
  if (metodo === "ULTIMO") return valores[valores.length - 1];
  return Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100;
}

export type PuntoSerie = { bucket: string; actual: number | null; meta: number | null };

/**
 * Serie agregada por bucket para un KPI (excluye N/A y días sin dato).
 * La meta se agrega con promedio (o suma si el KPI es de suma).
 */
export async function serieKpi(
  kpiId: number,
  desde: string,
  hasta: string,
  gran: Granularidad
): Promise<PuntoSerie[]> {
  const kpis = await kpisPorId([kpiId]);
  const kpi = kpis.get(kpiId);
  if (!kpi) return [];
  const dias = (await valoresDiarios([kpiId], desde, hasta)).get(kpiId)!;

  const buckets = new Map<string, { valores: number[]; metas: number[] }>();
  for (const [fecha, v] of dias) {
    const clave = claveBucket(fecha, gran);
    if (!buckets.has(clave)) buckets.set(clave, { valores: [], metas: [] });
    const b = buckets.get(clave)!;
    if (!v.esNa && v.valor !== null) {
      b.valores.push(v.valor);
      if (v.meta !== null) b.metas.push(v.meta);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, b]) => ({
      bucket,
      actual: agregar(b.valores, kpi.agregacion),
      meta: agregar(b.metas, kpi.agregacion === "SUMA" ? "SUMA" : "PROMEDIO"),
    }));
}

export type Cumplimiento = {
  kpi_id: number;
  nombre: string;
  area: string;
  diasConDato: number;
  diasVerdes: number;
  porcentaje: number | null;
};

/** % de días en verde por KPI en un rango (ranking de peor a mejor). */
export async function cumplimientoPorKpi(
  areaId: number | null,
  desde: string,
  hasta: string
): Promise<Cumplimiento[]> {
  const filtro = areaId ? "AND k.area_id = $1" : "";
  const params = areaId ? [areaId] : [];
  const kpisArea = await query<Kpi & { area: string }>(
    `SELECT k.*, c.nombre AS categoria, c.orden AS categoria_orden, a.nombre AS area
     FROM kpis k JOIN categorias c ON c.id = k.categoria_id JOIN areas a ON a.id = k.area_id
     WHERE k.activo ${filtro} ORDER BY a.orden, c.orden, k.orden`,
    params
  );
  const ids = kpisArea.map((k) => k.id);
  const valores = await valoresDiarios(ids, desde, hasta);

  const resultado: Cumplimiento[] = [];
  for (const kpi of kpisArea) {
    const dias = valores.get(kpi.id)!;
    let conDato = 0;
    let verdes = 0;
    for (const v of dias.values()) {
      if (v.esNa || v.valor === null || v.meta === null) continue;
      conDato++;
      if (cumpleMeta(v.valor, v.meta, kpi.direccion)) verdes++;
    }
    resultado.push({
      kpi_id: kpi.id,
      nombre: kpi.nombre,
      area: kpi.area,
      diasConDato: conDato,
      diasVerdes: verdes,
      porcentaje: conDato > 0 ? Math.round((verdes / conDato) * 1000) / 10 : null,
    });
  }
  return resultado.sort((a, b) => (a.porcentaje ?? 101) - (b.porcentaje ?? 101));
}

export type Racha = { area: string; kpi: string; rachaActual: number; rachaMaxima: number };

/** Días consecutivos sin eventos (valor 0) para KPIs de seguridad. */
export async function rachasSeguridad(): Promise<Racha[]> {
  const kpis = await query<{ id: number; nombre: string; area: string }>(
    `SELECT k.id, k.nombre, a.nombre AS area
     FROM kpis k JOIN areas a ON a.id = k.area_id
     JOIN categorias c ON c.id = k.categoria_id
     WHERE k.activo AND c.nombre = 'Seguridad' ORDER BY a.orden, k.orden`
  );

  const resultado: Racha[] = [];
  for (const kpi of kpis) {
    const filas = await query<{ fecha: string; valor: number | null; es_na: boolean }>(
      "SELECT fecha, valor, es_na FROM capturas WHERE kpi_id = $1 ORDER BY fecha",
      [kpi.id]
    );
    let actual = 0;
    let maxima = 0;
    for (const f of filas) {
      if (f.es_na || f.valor === null) continue;
      if (f.valor > 0) actual = 0;
      else actual++;
      if (actual > maxima) maxima = actual;
    }
    resultado.push({ area: kpi.area, kpi: kpi.nombre, rachaActual: actual, rachaMaxima: maxima });
  }
  return resultado;
}

export type ComparativoMes = { mes: string; actual: number | null; meta: number | null };

/** Agregado mensual de un KPI para los últimos `meses` meses. */
export async function comparativoMensual(kpiId: number, meses: number): Promise<ComparativoMes[]> {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1);
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  const desde = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;
  const hasta = `${finMes.getFullYear()}-${String(finMes.getMonth() + 1).padStart(2, "0")}-${String(finMes.getDate()).padStart(2, "0")}`;
  const serie = await serieKpi(kpiId, desde, hasta, "mensual");
  return serie.map((p) => ({ mes: p.bucket, actual: p.actual, meta: p.meta }));
}
