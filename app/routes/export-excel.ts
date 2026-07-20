import type { Route } from "./+types/export-excel";

export async function loader({ request }: Route.LoaderArgs) {
  const { requerirUsuario } = await import("~/lib/server/auth.server");
  const { obtenerScorecard, listarAreas } = await import("~/lib/server/scorecard.server");
  const { MESES, formatearValor, diasDelMes } = await import("~/lib/formato");
  const ExcelJS = (await import("exceljs")).default;

  const usuario = await requerirUsuario(request);
  const url = new URL(request.url);
  const hoy = new Date();
  const areas = await listarAreas();
  const areaId = Number(url.searchParams.get("area")) || areas[0]?.id;
  const anio = Number(url.searchParams.get("anio")) || hoy.getFullYear();
  const mes = Number(url.searchParams.get("mes")) || hoy.getMonth() + 1;
  const area = areas.find((a) => a.id === areaId);
  if (!area) throw new Response("Área no encontrada", { status: 404 });

  const fechas = diasDelMes(anio, mes).map((d) => d.fecha);
  const { filas, dias } = await obtenerScorecard(usuario, areaId, fechas);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`${MESES[mes - 1]} ${anio}`, {
    views: [{ state: "frozen", xSplit: 2, ySplit: 3 }],
  });

  const COLORES: Record<string, string> = {
    verde: "FFC6EFCE",
    rojo: "FFFFC7CE",
    na: "FFEEEEEE",
  };

  ws.getCell(1, 1).value = `Daily Scorecard TQ1 — ${area.nombre} — ${MESES[mes - 1]} ${anio}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, 2 + dias.length);

  // Encabezados: fila 2 día de semana, fila 3 número de día
  ws.getCell(2, 1).value = "KPI";
  ws.getCell(3, 1).value = "";
  ws.getCell(2, 2).value = "Fila";
  for (let i = 0; i < dias.length; i++) {
    ws.getCell(2, 3 + i).value = dias[i].diaSemana;
    ws.getCell(3, 3 + i).value = dias[i].dia;
  }
  for (const rowN of [2, 3]) {
    ws.getRow(rowN).font = { bold: true, size: 9 };
    ws.getRow(rowN).alignment = { horizontal: "center" };
  }

  ws.getColumn(1).width = 32;
  ws.getColumn(2).width = 8;
  for (let i = 0; i < dias.length; i++) ws.getColumn(3 + i).width = 7;

  let r = 4;
  let categoriaActual = "";
  const borde = { style: "thin" as const, color: { argb: "FFBBBBBB" } };

  for (const fila of filas) {
    if (fila.kpi.categoria !== categoriaActual) {
      categoriaActual = fila.kpi.categoria;
      const celda = ws.getCell(r, 1);
      celda.value = categoriaActual.toUpperCase();
      celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
      ws.mergeCells(r, 1, r, 2 + dias.length);
      r++;
    }

    ws.getCell(r, 1).value = fila.kpi.nombre + (fila.kpi.tipo === "CALCULADO" ? " (calc.)" : "");
    ws.mergeCells(r, 1, r + 1, 1);
    ws.getCell(r, 1).alignment = { vertical: "middle" };
    ws.getCell(r, 2).value = "Actual";
    ws.getCell(r + 1, 2).value = "Meta";

    for (let i = 0; i < dias.length; i++) {
      const fecha = dias[i].fecha;
      const celda = fila.celdas[fecha];
      const c = ws.getCell(r, 3 + i);
      c.value = celda.esNa
        ? "N/A"
        : celda.valor === null
          ? "—"
          : formatearValor(celda.valor, fila.kpi.unidad);
      c.alignment = { horizontal: "center" };
      const color = COLORES[celda.estado];
      if (color) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };

      const m = ws.getCell(r + 1, 3 + i);
      m.value = formatearValor(fila.metas[fecha], fila.kpi.unidad);
      m.alignment = { horizontal: "center" };
      m.font = { color: { argb: "FF888888" }, size: 9 };
    }

    for (let rr = r; rr <= r + 1; rr++) {
      for (let cc = 1; cc <= 2 + dias.length; cc++) {
        ws.getCell(rr, cc).border = { top: borde, left: borde, bottom: borde, right: borde };
      }
    }
    r += 2;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const nombre = `scorecard_${area.nombre}_${anio}-${String(mes).padStart(2, "0")}.xlsx`;
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
