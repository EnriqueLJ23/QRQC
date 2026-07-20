import cron from "node-cron";
import { query, queryOne } from "./db.server";
import { env } from "./env.server";
import { enviarCorreo } from "./graph.server";
import { generarMesSiguiente, obtenerConfig } from "./scorecard.server";

declare global {
  var __qrqcJobsIniciados: boolean | undefined;
}

function hoyLocal(): { fecha: string; hhmm: string; dow: number } {
  const ahora = new Date();
  const fecha = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(
    ahora.getDate()
  ).padStart(2, "0")}`;
  const hhmm = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
  return { fecha, hhmm, dow: ahora.getDay() };
}

async function esDiaHabil(fecha: string, dow: number): Promise<boolean> {
  if (dow === 0 || dow === 6) return false;
  const inhabil = await queryOne("SELECT 1 FROM dias_inhabiles WHERE fecha = $1", [fecha]);
  return inhabil === null;
}

/** KPIs capturables sin registro hoy, agrupados por departamento. */
async function faltantesDelDia(fecha: string) {
  return query<{
    departamento_id: number;
    departamento: string;
    kpi: string;
    area: string;
  }>(
    `SELECT d.id AS departamento_id, d.nombre AS departamento, k.nombre AS kpi, a.nombre AS area
     FROM kpis k
     JOIN areas a ON a.id = k.area_id AND a.activo
     JOIN kpi_departamento kd ON kd.kpi_id = k.id
     JOIN departamentos d ON d.id = kd.departamento_id AND d.activo
     LEFT JOIN capturas c ON c.kpi_id = k.id AND c.fecha = $1
     WHERE k.activo AND k.tipo = 'CAPTURADO' AND c.id IS NULL
     ORDER BY d.nombre, a.nombre, k.nombre`,
    [fecha]
  );
}

async function enviarRecordatorios(fecha: string) {
  const faltantes = await faltantesDelDia(fecha);
  const porDepto = new Map<number, { departamento: string; kpis: string[] }>();
  for (const f of faltantes) {
    if (!porDepto.has(f.departamento_id)) {
      porDepto.set(f.departamento_id, { departamento: f.departamento, kpis: [] });
    }
    porDepto.get(f.departamento_id)!.kpis.push(`${f.kpi} (${f.area})`);
  }

  for (const [deptoId, info] of porDepto) {
    const usuarios = await query<{ email: string }>(
      "SELECT email FROM usuarios WHERE departamento_id = $1 AND activo",
      [deptoId]
    );
    if (usuarios.length === 0) continue;
    const lista = info.kpis.map((k) => `<li>${k}</li>`).join("");
    await enviarCorreo({
      para: usuarios.map((u) => u.email),
      asunto: `QRQC: captura pendiente del Daily Scorecard (${fecha})`,
      htmlCuerpo: `<p>Buenos días,</p>
<p>Los siguientes indicadores del departamento <b>${info.departamento}</b> aún no se han capturado hoy:</p>
<ul>${lista}</ul>
<p>Por favor captúralos antes de la hora límite en el <a href="${env.BASE_URL}/scorecard">Daily Scorecard</a>.</p>`,
    });
  }
  console.log(`[jobs] Recordatorios enviados a ${porDepto.size} departamento(s)`);
}

async function enviarResumenAdmin(fecha: string) {
  const faltantes = await faltantesDelDia(fecha);
  const admins = await query<{ email: string }>(
    "SELECT email FROM usuarios WHERE rol = 'ADMIN' AND activo"
  );
  if (admins.length === 0) return;

  let cuerpo: string;
  if (faltantes.length === 0) {
    cuerpo = "<p>✅ Todos los departamentos completaron la captura del día.</p>";
  } else {
    const porDepto = new Map<string, string[]>();
    for (const f of faltantes) {
      if (!porDepto.has(f.departamento)) porDepto.set(f.departamento, []);
      porDepto.get(f.departamento)!.push(`${f.kpi} (${f.area})`);
    }
    cuerpo = [...porDepto.entries()]
      .map(([depto, kpis]) => `<p><b>${depto}</b> — pendientes:</p><ul>${kpis.map((k) => `<li>${k}</li>`).join("")}</ul>`)
      .join("");
  }

  await enviarCorreo({
    para: admins.map((a) => a.email),
    asunto: `QRQC: estado de captura del ${fecha}`,
    htmlCuerpo: `<p>Resumen de captura del Daily Scorecard al corte:</p>${cuerpo}`,
  });
  console.log("[jobs] Resumen de administrador enviado");
}

async function tick() {
  try {
    const { fecha, hhmm, dow } = hoyLocal();
    const config = await obtenerConfig();

    if (hhmm === (config.hora_recordatorio ?? "07:45") && (await esDiaHabil(fecha, dow))) {
      await enviarRecordatorios(fecha);
    }
    if (
      hhmm === (config.hora_limite ?? "08:00") &&
      config.resumen_admin === "true" &&
      (await esDiaHabil(fecha, dow))
    ) {
      await enviarResumenAdmin(fecha);
    }

    // Generación automática del mes siguiente en el día configurado (00:05)
    if (hhmm === "00:05") {
      const diaGeneracion = parseInt(config.dia_generacion ?? "25", 10);
      const hoy = new Date();
      if (hoy.getDate() === diaGeneracion) {
        const mesSig = hoy.getMonth() + 2;
        const anio = mesSig > 12 ? hoy.getFullYear() + 1 : hoy.getFullYear();
        const mes = mesSig > 12 ? 1 : mesSig;
        const creadas = await generarMesSiguiente(anio, mes);
        if (creadas > 0) console.log(`[jobs] Scorecard ${mes}/${anio} generado (${creadas} metas precargadas)`);
      }
    }
  } catch (e) {
    console.error("[jobs] Error en tarea programada:", e);
  }
}

export function iniciarJobs() {
  if (globalThis.__qrqcJobsIniciados) return;
  globalThis.__qrqcJobsIniciados = true;
  cron.schedule("* * * * *", tick);
  console.log("[jobs] Tareas programadas iniciadas (recordatorios y generación mensual)");
}
