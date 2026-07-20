import { query, queryOne } from "./db.server";
import type { Usuario } from "./auth.server";
import { kpisEditables } from "./auth.server";
import {
  cumpleMeta,
  diaInfo,
  normalizarEntrada,
  type Direccion,
  type Unidad,
} from "~/lib/formato";

export type Kpi = {
  id: number;
  area_id: number;
  categoria_id: number;
  categoria: string;
  categoria_orden: number;
  nombre: string;
  unidad: Unidad;
  direccion: Direccion;
  tipo: "CAPTURADO" | "CALCULADO";
  agregacion: "PROMEDIO" | "SUMA" | "ULTIMO";
  formula: { tipo: string; kpi_base?: number; num?: number; den?: number } | null;
  orden: number;
  activo: boolean;
};

export type EstadoCelda = "verde" | "rojo" | "na" | "pendiente" | "sin_meta";

export type Celda = {
  valor: number | null;
  esNa: boolean;
  estado: EstadoCelda;
};

export type FilaScorecard = {
  kpi: Kpi;
  editable: boolean;
  celdas: Record<string, Celda>; // fecha → celda
  metas: Record<string, number | null>; // fecha → meta vigente
};

export async function listarAreas() {
  return query<{ id: number; nombre: string; orden: number; activo: boolean }>(
    "SELECT * FROM areas WHERE activo ORDER BY orden, nombre"
  );
}

export async function kpisDeArea(areaId: number, incluirInactivos = false): Promise<Kpi[]> {
  return query<Kpi>(
    `SELECT k.*, c.nombre AS categoria, c.orden AS categoria_orden
     FROM kpis k JOIN categorias c ON c.id = k.categoria_id
     WHERE k.area_id = $1 ${incluirInactivos ? "" : "AND k.activo"}
     ORDER BY c.orden, k.orden, k.nombre`,
    [areaId]
  );
}

/** Meta vigente por KPI y fecha: override diario > meta mensual > null. */
async function metasVigentes(
  kpiIds: number[],
  fechas: string[]
): Promise<Map<number, Record<string, number | null>>> {
  const resultado = new Map<number, Record<string, number | null>>();
  if (kpiIds.length === 0) return resultado;

  // Cada fecha usa la meta mensual de SU PROPIO anio/mes (una semana puede cruzar dos meses)
  const mesesDistintos = new Map<string, { anio: number; mes: number }>();
  for (const fecha of fechas) {
    const [anio, mes] = fecha.split("-").map(Number);
    mesesDistintos.set(`${anio}-${mes}`, { anio, mes });
  }

  const porKpiMensual = new Map<string, number | null>(); // `${kpiId}|${anio}-${mes}` -> valor
  for (const { anio, mes } of mesesDistintos.values()) {
    const mensuales = await query<{ kpi_id: number; valor: number | null }>(
      "SELECT kpi_id, valor FROM metas_mensuales WHERE anio = $1 AND mes = $2 AND kpi_id = ANY($3)",
      [anio, mes, kpiIds]
    );
    for (const m of mensuales) porKpiMensual.set(`${m.kpi_id}|${anio}-${mes}`, m.valor);
  }

  const diarias = await query<{ kpi_id: number; fecha: string; valor: number | null }>(
    "SELECT kpi_id, fecha, valor FROM metas_diarias WHERE fecha = ANY($1) AND kpi_id = ANY($2)",
    [fechas, kpiIds]
  );
  const porKpiDia = new Map<string, number | null>();
  for (const d of diarias) porKpiDia.set(`${d.kpi_id}|${d.fecha}`, d.valor);

  for (const kpiId of kpiIds) {
    const fila: Record<string, number | null> = {};
    for (const fecha of fechas) {
      const diaria = porKpiDia.get(`${kpiId}|${fecha}`);
      if (diaria !== undefined) {
        fila[fecha] = diaria;
      } else {
        const [anio, mes] = fecha.split("-").map(Number);
        fila[fecha] = porKpiMensual.get(`${kpiId}|${anio}-${mes}`) ?? null;
      }
    }
    resultado.set(kpiId, fila);
  }
  return resultado;
}

export async function obtenerScorecard(
  usuario: Usuario,
  areaId: number,
  fechas: string[]
) {
  const kpis = await kpisDeArea(areaId);
  const dias = fechas.map(diaInfo);
  const kpiIds = kpis.map((k) => k.id);
  const editables = await kpisEditables(usuario);

  const capturas = kpiIds.length
    ? await query<{ kpi_id: number; fecha: string; valor: number | null; es_na: boolean }>(
        "SELECT kpi_id, fecha, valor, es_na FROM capturas WHERE fecha = ANY($1) AND kpi_id = ANY($2)",
        [fechas, kpiIds]
      )
    : [];
  const capturaMap = new Map<string, { valor: number | null; es_na: boolean }>();
  for (const c of capturas) capturaMap.set(`${c.kpi_id}|${c.fecha}`, c);

  const metas = await metasVigentes(kpiIds, fechas);

  // Valor efectivo de un KPI capturado en una fecha (para fórmulas)
  const valorDe = (kpiId: number, fecha: string): { valor: number | null; esNa: boolean } => {
    const c = capturaMap.get(`${kpiId}|${fecha}`);
    return { valor: c?.valor ?? null, esNa: c?.es_na ?? false };
  };

  const filas: FilaScorecard[] = kpis.map((kpi) => {
    const metasKpi = metas.get(kpi.id) ?? {};
    const celdas: Record<string, Celda> = {};

    for (const fecha of fechas) {
      let valor: number | null = null;
      let esNa = false;

      if (kpi.tipo === "CALCULADO" && kpi.formula) {
        // Cálculo en servidor; división entre cero o datos faltantes → null (nunca error)
        if (kpi.formula.tipo === "razon_vs_meta" && kpi.formula.kpi_base) {
          const base = valorDe(kpi.formula.kpi_base, fecha);
          const metaBase = metas.get(kpi.formula.kpi_base)?.[fecha] ?? null;
          esNa = base.esNa;
          if (!esNa && base.valor !== null && metaBase !== null && metaBase !== 0) {
            valor = Math.round((base.valor / metaBase) * 1000) / 10;
          }
        } else if (kpi.formula.tipo === "razon" && kpi.formula.num && kpi.formula.den) {
          const num = valorDe(kpi.formula.num, fecha);
          const den = valorDe(kpi.formula.den, fecha);
          esNa = num.esNa || den.esNa;
          if (!esNa && num.valor !== null && den.valor !== null && den.valor !== 0) {
            valor = Math.round((num.valor / den.valor) * 1000) / 10;
          }
        }
      } else {
        const c = valorDe(kpi.id, fecha);
        valor = c.valor;
        esNa = c.esNa;
      }

      const meta = metasKpi[fecha] ?? null;
      let estado: EstadoCelda;
      if (esNa) estado = "na";
      else if (valor === null) estado = "pendiente";
      else if (meta === null) estado = "sin_meta";
      else estado = cumpleMeta(valor, meta, kpi.direccion) ? "verde" : "rojo";

      celdas[fecha] = { valor, esNa, estado };
    }

    return {
      kpi,
      editable: kpi.tipo === "CAPTURADO" && editables.has(kpi.id),
      celdas,
      metas: metasKpi,
    };
  });

  return { filas, dias };
}

/**
 * Guarda una celda (valor, N/A o borrado) validando el permiso en el servidor.
 * `valorCrudo`: texto capturado; se ignora si accion es "na" o "borrar".
 */
export async function guardarCelda(opts: {
  usuario: Usuario;
  kpiId: number;
  fecha: string;
  accion: "valor" | "na" | "borrar";
  valorCrudo?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { usuario, kpiId, fecha, accion } = opts;

  const kpi = await queryOne<Kpi>("SELECT * FROM kpis WHERE id = $1 AND activo", [kpiId]);
  if (!kpi) return { ok: false, error: "KPI no encontrado" };
  if (kpi.tipo === "CALCULADO") {
    return { ok: false, error: "Este indicador es calculado; no se captura manualmente" };
  }

  const editables = await kpisEditables(usuario);
  if (!editables.has(kpiId)) {
    return { ok: false, error: "No tienes permiso para capturar este indicador" };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida" };

  let valor: number | null = null;
  let esNa = false;
  if (accion === "valor") {
    const r = normalizarEntrada(opts.valorCrudo ?? "", kpi.unidad);
    if (!r.ok) return { ok: false, error: r.error };
    valor = r.valor;
  } else if (accion === "na") {
    esNa = true;
  }

  const anterior = await queryOne<{ valor: number | null; es_na: boolean }>(
    "SELECT valor, es_na FROM capturas WHERE kpi_id = $1 AND fecha = $2",
    [kpiId, fecha]
  );

  if (accion === "borrar") {
    await query("DELETE FROM capturas WHERE kpi_id = $1 AND fecha = $2", [kpiId, fecha]);
  } else {
    await query(
      `INSERT INTO capturas (kpi_id, fecha, valor, es_na, actualizado_por, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (kpi_id, fecha) DO UPDATE
       SET valor = EXCLUDED.valor, es_na = EXCLUDED.es_na,
           actualizado_por = EXCLUDED.actualizado_por, actualizado_en = now()`,
      [kpiId, fecha, valor, esNa, usuario.id]
    );
  }

  const texto = (v: number | null, na: boolean) => (na ? "N/A" : v === null ? "" : String(v));
  await query(
    `INSERT INTO auditoria (usuario_id, kpi_id, fecha, tipo, valor_anterior, valor_nuevo)
     VALUES ($1, $2, $3, 'CAPTURA', $4, $5)`,
    [
      usuario.id,
      kpiId,
      fecha,
      anterior ? texto(anterior.valor, anterior.es_na) : "",
      accion === "borrar" ? "" : texto(valor, esNa),
    ]
  );

  return { ok: true };
}

/** Guarda la meta mensual de un KPI (solo admin, validado por el llamador). */
export async function guardarMetaMensual(
  usuario: Usuario,
  kpiId: number,
  anio: number,
  mes: number,
  valorCrudo: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const kpi = await queryOne<Kpi>("SELECT * FROM kpis WHERE id = $1", [kpiId]);
  if (!kpi) return { ok: false, error: "KPI no encontrado" };

  const anterior = await queryOne<{ valor: number | null }>(
    "SELECT valor FROM metas_mensuales WHERE kpi_id = $1 AND anio = $2 AND mes = $3",
    [kpiId, anio, mes]
  );

  let valor: number | null = null;
  if (valorCrudo.trim() !== "") {
    const r = normalizarEntrada(valorCrudo, kpi.unidad);
    if (!r.ok) return { ok: false, error: r.error };
    valor = r.valor;
  }

  if (valor === null) {
    await query("DELETE FROM metas_mensuales WHERE kpi_id = $1 AND anio = $2 AND mes = $3", [kpiId, anio, mes]);
  } else {
    await query(
      `INSERT INTO metas_mensuales (kpi_id, anio, mes, valor) VALUES ($1, $2, $3, $4)
       ON CONFLICT (kpi_id, anio, mes) DO UPDATE SET valor = EXCLUDED.valor`,
      [kpiId, anio, mes, valor]
    );
  }

  await query(
    `INSERT INTO auditoria (usuario_id, kpi_id, tipo, valor_anterior, valor_nuevo, detalle)
     VALUES ($1, $2, 'META_MENSUAL', $3, $4, $5)`,
    [usuario.id, kpiId, anterior?.valor?.toString() ?? "", valor?.toString() ?? "", `${mes}/${anio}`]
  );
  return { ok: true };
}

/** Guarda o borra el override diario de meta (solo admin). */
export async function guardarMetaDiaria(
  usuario: Usuario,
  kpiId: number,
  fecha: string,
  valorCrudo: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const kpi = await queryOne<Kpi>("SELECT * FROM kpis WHERE id = $1", [kpiId]);
  if (!kpi) return { ok: false, error: "KPI no encontrado" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false, error: "Fecha inválida" };

  const anterior = await queryOne<{ valor: number | null }>(
    "SELECT valor FROM metas_diarias WHERE kpi_id = $1 AND fecha = $2",
    [kpiId, fecha]
  );

  if (valorCrudo.trim() === "") {
    await query("DELETE FROM metas_diarias WHERE kpi_id = $1 AND fecha = $2", [kpiId, fecha]);
  } else {
    const r = normalizarEntrada(valorCrudo, kpi.unidad);
    if (!r.ok) return { ok: false, error: r.error };
    await query(
      `INSERT INTO metas_diarias (kpi_id, fecha, valor) VALUES ($1, $2, $3)
       ON CONFLICT (kpi_id, fecha) DO UPDATE SET valor = EXCLUDED.valor`,
      [kpiId, fecha, r.valor]
    );
  }

  await query(
    `INSERT INTO auditoria (usuario_id, kpi_id, fecha, tipo, valor_anterior, valor_nuevo)
     VALUES ($1, $2, $3, 'META_DIARIA', $4, $5)`,
    [usuario.id, kpiId, fecha, anterior?.valor?.toString() ?? "", valorCrudo.trim()]
  );
  return { ok: true };
}

/**
 * Genera el scorecard del mes indicado copiando las metas mensuales del mes
 * anterior para los KPIs activos que aún no tienen meta. Devuelve cuántas creó.
 */
export async function generarMesSiguiente(anio: number, mes: number): Promise<number> {
  const prevMes = mes === 1 ? 12 : mes - 1;
  const prevAnio = mes === 1 ? anio - 1 : anio;
  const res = await query<{ kpi_id: number }>(
    `INSERT INTO metas_mensuales (kpi_id, anio, mes, valor)
     SELECT m.kpi_id, $1, $2, m.valor
     FROM metas_mensuales m JOIN kpis k ON k.id = m.kpi_id AND k.activo
     WHERE m.anio = $3 AND m.mes = $4
     ON CONFLICT (kpi_id, anio, mes) DO NOTHING
     RETURNING kpi_id`,
    [anio, mes, prevAnio, prevMes]
  );
  return res.length;
}

export async function obtenerConfig(): Promise<Record<string, string>> {
  const filas = await query<{ clave: string; valor: string }>("SELECT * FROM configuracion");
  return Object.fromEntries(filas.map((f) => [f.clave, f.valor]));
}
