export type Unidad = "PORCENTAJE" | "ENTERO" | "DECIMAL";
export type Direccion = "MAYOR_MEJOR" | "MENOR_MEJOR";

/**
 * Normaliza la entrada del usuario a número según la unidad del KPI.
 * Porcentajes: acepta "99.1", "99.1%" y "0.991" (fracción → ×100).
 * Devuelve { ok: false } si el texto no es numérico válido.
 */
export function normalizarEntrada(
  texto: string,
  unidad: Unidad
): { ok: true; valor: number } | { ok: false; error: string } {
  const limpio = texto.trim().replace(/%$/, "").replace(/,/g, "");
  if (limpio === "") return { ok: false, error: "Valor vacío" };
  const num = Number(limpio);
  if (!Number.isFinite(num)) return { ok: false, error: "Debe ser un valor numérico" };
  if (num < 0) return { ok: false, error: "No se permiten valores negativos" };

  if (unidad === "PORCENTAJE") {
    // Fracción estilo Excel (0.991) → porcentaje (99.1). Valores >= 1 ya son %.
    const valor = num < 1 ? num * 100 : num;
    if (valor > 1000) return { ok: false, error: "Porcentaje fuera de rango" };
    return { ok: true, valor: redondear(valor, 2) };
  }
  if (unidad === "ENTERO") {
    if (!Number.isInteger(num)) return { ok: false, error: "Debe ser un número entero" };
    return { ok: true, valor: num };
  }
  return { ok: true, valor: redondear(num, 2) };
}

export function redondear(v: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(v * f) / f;
}

/** Formatea un valor para mostrar en la matriz. null → "—". */
export function formatearValor(valor: number | null | undefined, unidad: Unidad): string {
  if (valor === null || valor === undefined) return "—";
  if (unidad === "PORCENTAJE") return `${redondear(valor, 1)}%`;
  if (unidad === "ENTERO") return String(Math.round(valor));
  return String(redondear(valor, 2));
}

/** Compara actual vs meta respetando la dirección del indicador. */
export function cumpleMeta(actual: number, meta: number, direccion: Direccion): boolean {
  return direccion === "MAYOR_MEJOR" ? actual >= meta : actual <= meta;
}

export const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export type DiaInfo = { fecha: string; dia: number; diaSemana: string; esFinDeSemana: boolean };

/** Calcula día/díaSemana/finDeSemana a partir de una fecha 'YYYY-MM-DD'. */
export function diaInfo(fechaISO: string): DiaInfo {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const dow = new Date(anio, mes - 1, dia).getDay();
  return {
    fecha: fechaISO,
    dia,
    diaSemana: DIAS_SEMANA[dow],
    esFinDeSemana: dow === 0 || dow === 6,
  };
}

function aFechaISO(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function diasDelMes(anio: number, mes: number): DiaInfo[] {
  const total = new Date(anio, mes, 0).getDate();
  const dias: DiaInfo[] = [];
  for (let d = 1; d <= total; d++) {
    dias.push(diaInfo(aFechaISO(anio, mes, d)));
  }
  return dias;
}

/** Fecha (YYYY-MM-DD) del lunes de la semana que contiene fechaISO. */
export function lunesDeFecha(fechaISO: string): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const fechaObj = new Date(anio, mes - 1, dia);
  const dow = fechaObj.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  fechaObj.setDate(fechaObj.getDate() + offset);
  return aFechaISO(fechaObj.getFullYear(), fechaObj.getMonth() + 1, fechaObj.getDate());
}

/** Suma (o resta) días a una fecha 'YYYY-MM-DD'. */
export function sumarDias(fechaISO: string, delta: number): string {
  const [anio, mes, dia] = fechaISO.split("-").map(Number);
  const f = new Date(anio, mes - 1, dia);
  f.setDate(f.getDate() + delta);
  return aFechaISO(f.getFullYear(), f.getMonth() + 1, f.getDate());
}

/** Los 5 días hábiles (lunes–viernes) de la semana que contiene fechaRef. */
export function diasSemanaLaboral(fechaRef: string): DiaInfo[] {
  const lunes = lunesDeFecha(fechaRef);
  const [anio, mes, dia] = lunes.split("-").map(Number);
  const base = new Date(anio, mes - 1, dia);
  const dias: DiaInfo[] = [];
  for (let i = 0; i < 5; i++) {
    const f = new Date(base);
    f.setDate(base.getDate() + i);
    dias.push(diaInfo(aFechaISO(f.getFullYear(), f.getMonth() + 1, f.getDate())));
  }
  return dias;
}
