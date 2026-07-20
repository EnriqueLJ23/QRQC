import * as React from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/scorecard";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Badge } from "~/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ChevronLeft, ChevronRight, Download, Lock, Sigma } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  diasDelMes,
  diasSemanaLaboral,
  lunesDeFecha,
  MESES,
  sumarDias,
  type Unidad,
  formatearValor,
} from "~/lib/formato";

export function meta() {
  return [{ title: "Scorecard — QRQC TQ1" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { requerirUsuario } = await import("~/lib/server/auth.server");
  const { listarAreas, obtenerScorecard } = await import("~/lib/server/scorecard.server");

  const usuario = await requerirUsuario(request);
  const areas = await listarAreas();
  const url = new URL(request.url);
  const hoy = new Date();
  const fechaHoy = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  const areaId = Number(url.searchParams.get("area")) || areas[0]?.id || 0;
  const vista = url.searchParams.get("vista") === "mes" ? "mes" : "semana";
  const anio = Number(url.searchParams.get("anio")) || hoy.getFullYear();
  const mes = Number(url.searchParams.get("mes")) || hoy.getMonth() + 1;
  const semana = lunesDeFecha(url.searchParams.get("semana") || fechaHoy);

  const fechas =
    vista === "semana" ? diasSemanaLaboral(semana).map((d) => d.fecha) : diasDelMes(anio, mes).map((d) => d.fecha);

  const { filas, dias } = areaId
    ? await obtenerScorecard(usuario, areaId, fechas)
    : { filas: [], dias: [] };

  return { areas, areaId, vista, anio, mes, semana, filas, dias, fechaHoy, esAdmin: usuario.rol === "ADMIN" };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirUsuario } = await import("~/lib/server/auth.server");
  const { guardarCelda } = await import("~/lib/server/scorecard.server");

  const usuario = await requerirUsuario(request);
  const form = await request.formData();
  const kpiId = Number(form.get("kpiId"));
  const fecha = String(form.get("fecha") ?? "");
  const crudo = String(form.get("valor") ?? "").trim();

  let accion: "valor" | "na" | "borrar" = "valor";
  if (crudo === "") accion = "borrar";
  else if (/^n\/?a$/i.test(crudo)) accion = "na";

  return guardarCelda({ usuario, kpiId, fecha, accion, valorCrudo: crudo });
}

type Fila = Awaited<ReturnType<typeof loader>>["filas"][number];

const ESTILO_ESTADO: Record<string, string> = {
  verde: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  rojo: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  na: "bg-muted/70 text-muted-foreground",
  pendiente: "text-muted-foreground/50",
  sin_meta: "",
};

export default function Scorecard({ loaderData }: Route.ComponentProps) {
  const { areas, areaId, vista, anio, mes, semana, filas, dias, fechaHoy, esAdmin } = loaderData;
  const [, setParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const [editando, setEditando] = React.useState<{ kpiId: number; fecha: string } | null>(null);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success("Guardado", { duration: 1200 });
      else toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const cambiarParam = (clave: string, valor: string) => {
    setParams(
      (prev) => {
        prev.set(clave, valor);
        return prev;
      },
      { preventScrollReset: true }
    );
  };

  const guardar = (kpiId: number, fecha: string, valor: string) => {
    setEditando(null);
    fetcher.submit({ kpiId: String(kpiId), fecha, valor }, { method: "post" });
  };

  const moverSemana = (deltaSemanas: number) => {
    cambiarParam("semana", sumarDias(semana, deltaSemanas * 7));
  };

  const [exportAnio, exportMes] =
    vista === "semana"
      ? semana.split("-").map(Number)
      : [anio, mes];

  const mesCorto = (fechaISO: string) => MESES[Number(fechaISO.split("-")[1]) - 1].slice(0, 3);
  const rangoSemanaLabel = (() => {
    if (dias.length === 0) return "";
    const primero = dias[0];
    const ultimo = dias[dias.length - 1];
    const mesPrimero = mesCorto(primero.fecha);
    const mesUltimo = mesCorto(ultimo.fecha);
    const anioUltimo = ultimo.fecha.split("-")[0];
    return mesPrimero === mesUltimo
      ? `${primero.dia} – ${ultimo.dia} ${mesUltimo} ${anioUltimo}`
      : `${primero.dia} ${mesPrimero} – ${ultimo.dia} ${mesUltimo} ${anioUltimo}`;
  })();

  // Agrupar filas por categoría conservando el orden
  const grupos: { categoria: string; filas: Fila[] }[] = [];
  for (const fila of filas) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.categoria === fila.kpi.categoria) ultimo.filas.push(fila);
    else grupos.push({ categoria: fila.kpi.categoria, filas: [fila] });
  }

  const anioActual = new Date().getFullYear();
  const anios = Array.from({ length: 6 }, (_, i) => anioActual - 4 + i);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold mr-2">Daily Scorecard</h1>

        <Select
          items={areas.map((a) => ({ value: String(a.id), label: a.nombre }))}
          value={String(areaId)}
          onValueChange={(v) => v && cambiarParam("area", String(v))}
        >
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {areas.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>{a.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs
          value={vista}
          onValueChange={(v) => v && cambiarParam("vista", String(v))}
        >
          <TabsList>
            <TabsTrigger value="semana">Semana</TabsTrigger>
            <TabsTrigger value="mes">Mes</TabsTrigger>
          </TabsList>
        </Tabs>

        {vista === "semana" ? (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="size-8" onClick={() => moverSemana(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => cambiarParam("semana", fechaHoy)}>
              Hoy
            </Button>
            <Button variant="outline" size="icon" className="size-8" onClick={() => moverSemana(1)}>
              <ChevronRight className="size-4" />
            </Button>
            <span className="ml-1 text-sm font-medium whitespace-nowrap">{rangoSemanaLabel}</span>
          </div>
        ) : (
          <>
            <Select
              items={MESES.map((m, i) => ({ value: String(i + 1), label: m }))}
              value={String(mes)}
              onValueChange={(v) => v && cambiarParam("mes", String(v))}
            >
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => (
                  <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              items={anios.map((a) => ({ value: String(a), label: String(a) }))}
              value={String(anio)}
              onValueChange={(v) => v && cambiarParam("anio", String(v))}
            >
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {anios.map((a) => (
                  <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-3 rounded-sm bg-emerald-200 dark:bg-emerald-900" /> Cumple
            <span className="inline-block size-3 rounded-sm bg-red-200 dark:bg-red-900" /> No cumple
            <span className="inline-block size-3 rounded-sm bg-muted border" /> N/A
          </div>
          <Button
            variant="outline"
            size="sm"
            render={
              <a href={`/export/excel?area=${areaId}&anio=${exportAnio}&mes=${exportMes}`}>
                <Download className="size-4" /> Exportar Excel
              </a>
            }
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Haz clic en una celda desbloqueada para capturar. Escribe <b>NA</b> para marcar el día
        como no aplicable, deja vacío para borrar. Enter guarda, Esc cancela.
        {!esAdmin && " Solo puedes editar los indicadores asignados a tu departamento."}
      </p>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="border-collapse text-xs w-full">
          <thead>
            <tr className="bg-muted/60">
              <th className="sticky left-0 z-20 bg-muted min-w-52 border-b border-r px-2 py-1 text-left font-semibold">
                KPI
              </th>
              <th className="sticky left-52 z-20 bg-muted min-w-14 border-b border-r px-1 py-1 font-medium">
                Fila
              </th>
              {dias.map((d) => (
                <th
                  key={d.fecha}
                  className={cn(
                    "border-b border-r px-0.5 py-1 min-w-12 text-center font-medium",
                    d.esFinDeSemana && "bg-muted",
                    d.fecha === fechaHoy && "bg-primary/10"
                  )}
                >
                  <div className="text-[10px] text-muted-foreground">{d.diaSemana}</div>
                  <div>{d.dia}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo) => (
              <React.Fragment key={grupo.categoria}>
                <tr>
                  <td
                    colSpan={2 + dias.length}
                    className="sticky-none bg-primary/90 text-primary-foreground px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
                  >
                    {grupo.categoria}
                  </td>
                </tr>
                {grupo.filas.map((fila) => (
                  <React.Fragment key={fila.kpi.id}>
                    <tr className="group">
                      <td
                        rowSpan={2}
                        className="sticky left-0 z-10 bg-background border-b border-r px-2 py-0.5 font-medium align-middle"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-44" title={fila.kpi.nombre}>
                            {fila.kpi.nombre}
                          </span>
                          {fila.kpi.tipo === "CALCULADO" && (
                            <Sigma className="size-3 shrink-0 text-muted-foreground" aria-label="Calculado" />
                          )}
                          {!fila.editable && fila.kpi.tipo === "CAPTURADO" && (
                            <Lock className="size-3 shrink-0 text-muted-foreground/60" aria-label="Solo lectura" />
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {fila.kpi.unidad === "PORCENTAJE" ? "%" : fila.kpi.unidad.toLowerCase()}
                        </div>
                      </td>
                      <td className="sticky left-52 z-10 bg-background border-b border-r px-1 py-0.5 text-center text-muted-foreground">
                        Actual
                      </td>
                      {dias.map((d) => {
                        const celda = fila.celdas[d.fecha];
                        const enEdicion =
                          editando?.kpiId === fila.kpi.id && editando?.fecha === d.fecha;
                        return (
                          <td
                            key={d.fecha}
                            className={cn(
                              "border-b border-r p-0 text-center h-7",
                              ESTILO_ESTADO[celda.estado],
                              d.fecha === fechaHoy && "ring-1 ring-inset ring-primary/40",
                              fila.editable && "cursor-pointer hover:outline hover:outline-2 hover:outline-primary/50 hover:-outline-offset-2"
                            )}
                            onClick={() => {
                              if (fila.editable && !enEdicion) {
                                setEditando({ kpiId: fila.kpi.id, fecha: d.fecha });
                              }
                            }}
                          >
                            {enEdicion ? (
                              <input
                                autoFocus
                                defaultValue={celda.esNa ? "NA" : celda.valor ?? ""}
                                className="w-full h-7 bg-background text-center text-xs outline outline-2 outline-primary -outline-offset-1"
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    guardar(fila.kpi.id, d.fecha, e.currentTarget.value);
                                  } else if (e.key === "Escape") {
                                    setEditando(null);
                                  }
                                }}
                                onBlur={(e) => guardar(fila.kpi.id, d.fecha, e.currentTarget.value)}
                              />
                            ) : celda.esNa ? (
                              "N/A"
                            ) : (
                              formatearValor(celda.valor, fila.kpi.unidad as Unidad)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    <tr>
                      <td className="sticky left-52 z-10 bg-background border-b border-r px-1 py-0.5 text-center text-muted-foreground">
                        Meta
                      </td>
                      {dias.map((d) => (
                        <td
                          key={d.fecha}
                          className={cn(
                            "border-b border-r px-0.5 text-center h-6 text-muted-foreground bg-muted/30",
                            d.fecha === fechaHoy && "ring-1 ring-inset ring-primary/40"
                          )}
                        >
                          {formatearValor(fila.metas[d.fecha], fila.kpi.unidad as Unidad)}
                        </td>
                      ))}
                    </tr>
                  </React.Fragment>
                ))}
              </React.Fragment>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={2 + dias.length} className="p-8 text-center text-muted-foreground">
                  No hay KPIs configurados para esta área.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {esAdmin && (
        <p className="text-xs text-muted-foreground">
          Las metas se editan en{" "}
          <a href={`/admin/metas?area=${areaId}&anio=${exportAnio}&mes=${exportMes}`} className="underline">
            Administración → Metas
          </a>
          . <Badge variant="secondary" className="align-middle"><Sigma className="size-3" /> calculado</Badge>{" "}
          se obtiene automáticamente de otros indicadores.
        </p>
      )}
    </div>
  );
}
