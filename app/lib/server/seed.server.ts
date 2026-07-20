import type pg from "pg";

type SeedKpi = {
  nombre: string;
  categoria: string;
  unidad: "PORCENTAJE" | "ENTERO" | "DECIMAL";
  direccion: "MAYOR_MEJOR" | "MENOR_MEJOR";
  agregacion: "PROMEDIO" | "SUMA" | "ULTIMO";
  tipo?: "CAPTURADO" | "CALCULADO";
  depto: string;
  metaDefault: number | null;
};

const CATEGORIAS = ["Seguridad", "Disciplina", "Calidad", "Entregas", "Costo"];

const DEPARTAMENTOS = [
  "EHS",
  "Recursos Humanos",
  "Calidad",
  "Producción",
  "Planeación",
  "Mantenimiento",
  "Logística",
];

function kpisBase(): SeedKpi[] {
  return [
    { nombre: "Accidentes", categoria: "Seguridad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "EHS", metaDefault: 0 },
    { nombre: "Incidentes", categoria: "Seguridad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "EHS", metaDefault: 0 },
    { nombre: "Ausentismo labor directa", categoria: "Disciplina", unidad: "PORCENTAJE", direccion: "MENOR_MEJOR", agregacion: "PROMEDIO", depto: "Recursos Humanos", metaDefault: 3 },
    { nombre: "Ausentismo labor indirecta", categoria: "Disciplina", unidad: "PORCENTAJE", direccion: "MENOR_MEJOR", agregacion: "PROMEDIO", depto: "Recursos Humanos", metaDefault: 3 },
    { nombre: "Yield interno", categoria: "Calidad", unidad: "PORCENTAJE", direccion: "MAYOR_MEJOR", agregacion: "PROMEDIO", depto: "Calidad", metaDefault: 98 },
    { nombre: "RFT (Real First Time)", categoria: "Calidad", unidad: "PORCENTAJE", direccion: "MAYOR_MEJOR", agregacion: "PROMEDIO", depto: "Calidad", metaDefault: 95 },
    { nombre: "Reclamos de cliente", categoria: "Calidad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "Calidad", metaDefault: 0 },
    { nombre: "8Ds de cliente", categoria: "Calidad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "Calidad", metaDefault: 0 },
    { nombre: "Reclamos a proveedor", categoria: "Calidad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "Calidad", metaDefault: 0 },
    { nombre: "Cuarentena (piezas)", categoria: "Calidad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "ULTIMO", depto: "Calidad", metaDefault: 0 },
    { nombre: "Cuarentena (edad en días)", categoria: "Calidad", unidad: "DECIMAL", direccion: "MENOR_MEJOR", agregacion: "ULTIMO", depto: "Calidad", metaDefault: 30 },
    { nombre: "Pruebas de laboratorio NG", categoria: "Calidad", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "Calidad", metaDefault: 0 },
    { nombre: "Producción (piezas)", categoria: "Entregas", unidad: "ENTERO", direccion: "MAYOR_MEJOR", agregacion: "SUMA", depto: "Producción", metaDefault: null },
    { nombre: "Cumplimiento al plan", categoria: "Entregas", unidad: "PORCENTAJE", direccion: "MAYOR_MEJOR", agregacion: "PROMEDIO", tipo: "CALCULADO", depto: "Producción", metaDefault: 100 },
    { nombre: "Atraso de producción", categoria: "Entregas", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "ULTIMO", depto: "Planeación", metaDefault: 0 },
    { nombre: "Materiales críticos", categoria: "Entregas", unidad: "ENTERO", direccion: "MENOR_MEJOR", agregacion: "SUMA", depto: "Planeación", metaDefault: 0 },
    { nombre: "Pilotajes", categoria: "Entregas", unidad: "ENTERO", direccion: "MAYOR_MEJOR", agregacion: "SUMA", depto: "Planeación", metaDefault: null },
    { nombre: "Embarques", categoria: "Entregas", unidad: "ENTERO", direccion: "MAYOR_MEJOR", agregacion: "SUMA", depto: "Logística", metaDefault: null },
  ];
}

function kpisCosto(lineas: string[]): SeedKpi[] {
  const res: SeedKpi[] = [];
  for (const linea of lineas) {
    res.push({ nombre: `OEE ${linea}`, categoria: "Costo", unidad: "PORCENTAJE", direccion: "MAYOR_MEJOR", agregacion: "PROMEDIO", depto: "Producción", metaDefault: 85 });
  }
  for (const linea of lineas) {
    res.push({ nombre: `Scrap ${linea}`, categoria: "Costo", unidad: "PORCENTAJE", direccion: "MENOR_MEJOR", agregacion: "PROMEDIO", depto: "Producción", metaDefault: 2 });
  }
  return res;
}

const AREAS: { nombre: string; lineas: string[] }[] = [
  { nombre: "Moldeo", lineas: ["ML1", "ML2", "ML3", "ML4", "C1", "C2"] },
  { nombre: "Laminado", lineas: ["L1", "L2"] },
];

const CONFIG_DEFAULT: Record<string, string> = {
  hora_recordatorio: "07:45",
  hora_limite: "08:00",
  resumen_admin: "true",
  dia_generacion: "25",
};

export async function sembrarDatos(pool: pg.Pool) {
  for (const [clave, valor] of Object.entries(CONFIG_DEFAULT)) {
    await pool.query(
      "INSERT INTO configuracion (clave, valor) VALUES ($1, $2) ON CONFLICT (clave) DO NOTHING",
      [clave, valor]
    );
  }

  const yaHayKpis = await pool.query("SELECT 1 FROM kpis LIMIT 1");
  if (yaHayKpis.rowCount && yaHayKpis.rowCount > 0) return;

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    const catIds = new Map<string, number>();
    for (let i = 0; i < CATEGORIAS.length; i++) {
      const r = await cliente.query(
        "INSERT INTO categorias (nombre, orden) VALUES ($1, $2) ON CONFLICT (nombre) DO UPDATE SET orden = EXCLUDED.orden RETURNING id",
        [CATEGORIAS[i], i]
      );
      catIds.set(CATEGORIAS[i], r.rows[0].id);
    }

    const deptoIds = new Map<string, number>();
    for (const nombre of DEPARTAMENTOS) {
      const r = await cliente.query(
        "INSERT INTO departamentos (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id",
        [nombre]
      );
      deptoIds.set(nombre, r.rows[0].id);
    }

    const ahora = new Date();
    const anio = ahora.getFullYear();
    const mes = ahora.getMonth() + 1;

    for (let a = 0; a < AREAS.length; a++) {
      const area = AREAS[a];
      const rArea = await cliente.query(
        "INSERT INTO areas (nombre, orden) VALUES ($1, $2) ON CONFLICT (nombre) DO UPDATE SET orden = EXCLUDED.orden RETURNING id",
        [area.nombre, a]
      );
      const areaId = rArea.rows[0].id;

      const kpis = [...kpisBase(), ...kpisCosto(area.lineas)];
      let produccionId: number | null = null;

      for (let i = 0; i < kpis.length; i++) {
        const k = kpis[i];
        const rKpi = await cliente.query(
          `INSERT INTO kpis (area_id, categoria_id, nombre, unidad, direccion, tipo, agregacion, orden)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [areaId, catIds.get(k.categoria), k.nombre, k.unidad, k.direccion, k.tipo ?? "CAPTURADO", k.agregacion, i]
        );
        const kpiId = rKpi.rows[0].id;

        if (k.nombre === "Producción (piezas)") produccionId = kpiId;
        if (k.tipo === "CALCULADO" && k.nombre === "Cumplimiento al plan" && produccionId) {
          await cliente.query("UPDATE kpis SET formula = $1 WHERE id = $2", [
            JSON.stringify({ tipo: "razon_vs_meta", kpi_base: produccionId }),
            kpiId,
          ]);
        }

        await cliente.query(
          "INSERT INTO kpi_departamento (kpi_id, departamento_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [kpiId, deptoIds.get(k.depto)]
        );

        if (k.metaDefault !== null) {
          await cliente.query(
            "INSERT INTO metas_mensuales (kpi_id, anio, mes, valor) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            [kpiId, anio, mes, k.metaDefault]
          );
        }
      }
    }

    await cliente.query("COMMIT");
  } catch (e) {
    await cliente.query("ROLLBACK");
    throw e;
  } finally {
    cliente.release();
  }
}
