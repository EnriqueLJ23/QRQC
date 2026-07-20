import * as React from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/analitica";
import { toast } from "sonner";
import {
  Area, Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis,
} from "recharts";
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent,
  type ChartConfig,
} from "~/components/ui/chart";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "~/components/ui/table";
import { Download, Pin, PinOff, Trash2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { formatearValor, type Unidad } from "~/lib/formato";

export function meta() {
  return [{ title: "Analítica — QRQC TQ1" }];
}

function primerDiaDelMes(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-01`;
}

function fechaHoy(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

export async function loader({ request }: Route.LoaderArgs) {
  const { requerirUsuario } = await import("~/lib/server/auth.server");
  const { query } = await import("~/lib/server/db.server");
  const { serieKpi, cumplimientoPorKpi, rachasSeguridad, comparativoMensual } = await import(
    "~/lib/server/analytics.server"
  );

  const usuario = await requerirUsuario(request);
  const url = new URL(request.url);

  const areas = await query("SELECT * FROM areas WHERE activo ORDER BY orden, nombre");
  const catalogo = await query(
    `SELECT k.id, k.nombre, k.unidad, k.agregacion, a.nombre AS area, c.nombre AS categoria
     FROM kpis k JOIN areas a ON a.id = k.area_id JOIN categorias c ON c.id = k.categoria_id
     WHERE k.activo ORDER BY a.orden, c.orden, k.orden`
  );

  const kpiIds = (url.searchParams.get("kpis") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => n > 0)
    .slice(0, 5);
  const desde = url.searchParams.get("desde") || primerDiaDelMes();
  const hasta = url.searchParams.get("hasta") || fechaHoy();
  const gran = (url.searchParams.get("gran") ?? "diaria") as "diaria" | "semanal" | "mensual";

  const series: Record<number, Awaited<ReturnType<typeof serieKpi>>> = {};
  for (const id of kpiIds) {
    series[id] = await serieKpi(id, desde, hasta, gran);
  }

  const areaCumpl = Number(url.searchParams.get("areaCumpl")) || null;
  const cumplimiento = await cumplimientoPorKpi(areaCumpl, desde, hasta);
  const rachas = await rachasSeguridad();
  const comparativo = kpiIds.length > 0 ? await comparativoMensual(kpiIds[0], 13) : [];

  const vistas = await query(
    "SELECT * FROM vistas_guardadas WHERE usuario_id = $1 ORDER BY fijada DESC, nombre",
    [usuario.id]
  );

  return { areas, catalogo, kpiIds, desde, hasta, gran, series, cumplimiento, rachas, comparativo, vistas, areaCumpl };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirUsuario } = await import("~/lib/server/auth.server");
  const { query } = await import("~/lib/server/db.server");
  const usuario = await requerirUsuario(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "guardar_vista") {
    const nombre = String(form.get("nombre") ?? "").trim();
    if (!nombre) return { ok: false as const, error: "Ponle nombre a la vista" };
    await query(
      "INSERT INTO vistas_guardadas (usuario_id, nombre, config) VALUES ($1, $2, $3)",
      [usuario.id, nombre, String(form.get("config"))]
    );
    return { ok: true as const };
  }
  if (intent === "borrar_vista") {
    await query("DELETE FROM vistas_guardadas WHERE id = $1 AND usuario_id = $2", [
      Number(form.get("id")), usuario.id,
    ]);
    return { ok: true as const };
  }
  if (intent === "fijar_vista") {
    await query("UPDATE vistas_guardadas SET fijada = NOT fijada WHERE id = $1 AND usuario_id = $2", [
      Number(form.get("id")), usuario.id,
    ]);
    return { ok: true as const };
  }
  return { ok: false as const, error: "Acción desconocida" };
}

const claseSelect =
  "border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export default function Analitica({ loaderData }: Route.ComponentProps) {
  const {
    areas, catalogo, kpiIds, desde, hasta, gran, series, cumplimiento, rachas, comparativo, vistas, areaCumpl,
  } = loaderData;
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const [tipoGrafica, setTipoGrafica] = React.useState(params.get("tipo") ?? "linea");
  const [filtroArea, setFiltroArea] = React.useState("");

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success("Listo", { duration: 1200 });
      else toast.error((fetcher.data as any).error);
    }
  }, [fetcher.state, fetcher.data]);

  const setParam = (cambios: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { preventScrollReset: true });
  };

  const toggleKpi = (id: number) => {
    const actual = new Set(kpiIds);
    if (actual.has(id)) actual.delete(id);
    else {
      if (actual.size >= 5) {
        toast.error("Máximo 5 KPIs por gráfica");
        return;
      }
      actual.add(id);
    }
    setParam({ kpis: [...actual].join(",") });
  };

  // Combinar series por bucket en filas para recharts
  const buckets = new Set<string>();
  for (const id of kpiIds) for (const p of series[id] ?? []) buckets.add(p.bucket);
  const filas = [...buckets].sort().map((bucket) => {
    const fila: Record<string, any> = { bucket };
    for (const id of kpiIds) {
      const punto = (series[id] ?? []).find((p) => p.bucket === bucket);
      fila[`k${id}`] = punto?.actual ?? null;
      fila[`k${id}_meta`] = punto?.meta ?? null;
    }
    return fila;
  });

  // Config del chart: colores categóricos en orden fijo por posición de selección
  const config: ChartConfig = {};
  kpiIds.forEach((id, i) => {
    const kpi = catalogo.find((k: any) => k.id === id);
    config[`k${id}`] = {
      label: kpi ? `${kpi.nombre} (${kpi.area})` : `KPI ${id}`,
      color: `var(--chart-${i + 1})`,
    };
  });
  const mostrarMeta = kpiIds.length === 1;
  if (mostrarMeta) {
    config[`k${kpiIds[0]}_meta`] = { label: "Meta", color: "var(--muted-foreground)" };
  }

  const exportarCsv = () => {
    const encabezados = ["periodo", ...kpiIds.flatMap((id) => {
      const nombre = (catalogo.find((k: any) => k.id === id) as any)?.nombre ?? `KPI ${id}`;
      return [`${nombre} (actual)`, `${nombre} (meta)`];
    })];
    const lineas = filas.map((f) =>
      [f.bucket, ...kpiIds.flatMap((id) => [f[`k${id}`] ?? "", f[`k${id}_meta`] ?? ""])].join(",")
    );
    const blob = new Blob(["﻿" + [encabezados.join(","), ...lineas].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `analitica_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const configVista = JSON.stringify({
    kpis: kpiIds.join(","), desde, hasta, gran, tipo: tipoGrafica,
  });

  const aplicarVista = (v: any) => {
    const c = typeof v.config === "string" ? JSON.parse(v.config) : v.config;
    setTipoGrafica(c.tipo ?? "linea");
    setParam({ kpis: c.kpis ?? "", desde: c.desde ?? "", hasta: c.hasta ?? "", gran: c.gran ?? "diaria", tipo: c.tipo ?? "linea" });
  };

  const catalogoFiltrado = filtroArea
    ? catalogo.filter((k: any) => k.area === filtroArea)
    : catalogo;

  const unidadPrimera = kpiIds.length
    ? ((catalogo.find((k: any) => k.id === kpiIds[0]) as any)?.unidad as Unidad) ?? "DECIMAL"
    : "DECIMAL";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Analítica y tendencias</h1>

      <Tabs defaultValue="constructor">
        <TabsList>
          <TabsTrigger value="constructor">Constructor de gráficas</TabsTrigger>
          <TabsTrigger value="cumplimiento">Cumplimiento de meta</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
          <TabsTrigger value="comparativo">Comparativo mensual</TabsTrigger>
        </TabsList>

        <TabsContent value="constructor" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">KPIs (máx. 5)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <select className={cn(claseSelect, "w-full")} value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
                  <option value="">Todas las áreas</option>
                  {areas.map((a: any) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                </select>
                <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
                  {catalogoFiltrado.map((k: any) => (
                    <label
                      key={k.id}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1 text-sm cursor-pointer hover:bg-accent",
                        kpiIds.includes(k.id) && "bg-accent"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={kpiIds.includes(k.id)}
                        onChange={() => toggleKpi(k.id)}
                        className="accent-primary"
                      />
                      <span className="flex-1 truncate">{k.nombre}</span>
                      <span className="text-[10px] text-muted-foreground">{k.area}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4 min-w-0">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Desde</Label>
                  <Input type="date" value={desde} className="h-9 w-36"
                    onChange={(e) => setParam({ desde: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hasta</Label>
                  <Input type="date" value={hasta} className="h-9 w-36"
                    onChange={(e) => setParam({ hasta: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Granularidad</Label>
                  <select className={claseSelect} value={gran} onChange={(e) => setParam({ gran: e.target.value })}>
                    <option value="diaria">Diaria</option>
                    <option value="semanal">Semanal</option>
                    <option value="mensual">Mensual</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <select className={claseSelect} value={tipoGrafica}
                    onChange={(e) => { setTipoGrafica(e.target.value); setParam({ tipo: e.target.value }); }}>
                    <option value="linea">Línea</option>
                    <option value="barras">Barras</option>
                    <option value="area">Área</option>
                  </select>
                </div>
                <Button variant="outline" size="sm" onClick={exportarCsv} disabled={filas.length === 0}>
                  <Download className="size-4" /> CSV
                </Button>
              </div>

              <Card>
                <CardContent className="pt-4">
                  {kpiIds.length === 0 ? (
                    <p className="py-16 text-center text-muted-foreground">
                      Selecciona uno o más KPIs para graficar. Los días marcados N/A se excluyen
                      de los cálculos.
                    </p>
                  ) : (
                    <ChartContainer config={config} className="h-80 w-full">
                      <ComposedChart data={filas} margin={{ left: 8, right: 8, top: 8 }}>
                        <CartesianGrid vertical={false} strokeOpacity={0.35} />
                        <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
                        <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        {kpiIds.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                        {kpiIds.map((id) =>
                          tipoGrafica === "barras" ? (
                            <Bar key={id} dataKey={`k${id}`} fill={`var(--color-k${id})`} radius={[4, 4, 0, 0]} maxBarSize={28} />
                          ) : tipoGrafica === "area" ? (
                            <Area key={id} dataKey={`k${id}`} stroke={`var(--color-k${id})`}
                              fill={`var(--color-k${id})`} fillOpacity={0.15} strokeWidth={2}
                              type="monotone" connectNulls dot={false} />
                          ) : (
                            <Line key={id} dataKey={`k${id}`} stroke={`var(--color-k${id})`}
                              strokeWidth={2} type="monotone" connectNulls dot={false} />
                          )
                        )}
                        {mostrarMeta && (
                          <Line dataKey={`k${kpiIds[0]}_meta`} stroke="var(--muted-foreground)"
                            strokeWidth={1.5} strokeDasharray="6 4" type="monotone" connectNulls dot={false} />
                        )}
                      </ComposedChart>
                    </ChartContainer>
                  )}
                </CardContent>
              </Card>

              {filas.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Datos</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Periodo</TableHead>
                          {kpiIds.map((id) => (
                            <TableHead key={id}>
                              {(catalogo.find((k: any) => k.id === id) as any)?.nombre}
                            </TableHead>
                          ))}
                          {mostrarMeta && <TableHead>Meta</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filas.map((f) => (
                          <TableRow key={f.bucket}>
                            <TableCell className="font-mono text-xs">{f.bucket}</TableCell>
                            {kpiIds.map((id) => {
                              const u = ((catalogo.find((k: any) => k.id === id) as any)?.unidad ?? "DECIMAL") as Unidad;
                              return <TableCell key={id}>{formatearValor(f[`k${id}`], u)}</TableCell>;
                            })}
                            {mostrarMeta && (
                              <TableCell className="text-muted-foreground">
                                {formatearValor(f[`k${kpiIds[0]}_meta`], unidadPrimera)}
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Vistas guardadas</CardTitle>
                  <CardDescription>Guarda esta configuración para reutilizarla; fíjala para verla primero.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {vistas.map((v: any) => (
                    <div key={v.id} className="flex items-center gap-2 text-sm">
                      <button className="flex-1 text-left underline-offset-2 hover:underline" onClick={() => aplicarVista(v)}>
                        {v.nombre}
                      </button>
                      {v.fijada && <Badge variant="secondary">Fijada</Badge>}
                      <Button variant="ghost" size="icon" onClick={() =>
                        fetcher.submit({ intent: "fijar_vista", id: String(v.id) }, { method: "post" })}>
                        {v.fijada ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() =>
                        fetcher.submit({ intent: "borrar_vista", id: String(v.id) }, { method: "post" })}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <fetcher.Form method="post" className="flex items-center gap-2 border-t pt-3">
                    <input type="hidden" name="intent" value="guardar_vista" />
                    <input type="hidden" name="config" value={configVista} />
                    <Input name="nombre" placeholder="Nombre de la vista…" className="h-8" required />
                    <Button type="submit" size="sm" variant="outline">Guardar vista</Button>
                  </fetcher.Form>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cumplimiento" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">% de días en verde por KPI ({desde} → {hasta})</CardTitle>
              <CardDescription>
                Ranking de peor a mejor cumplimiento; enfoca la junta QRQC en los primeros.
                Se excluyen días N/A y sin captura.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <select className={cn(claseSelect, "w-44")} value={areaCumpl ?? ""}
                onChange={(e) => setParam({ areaCumpl: e.target.value })}>
                <option value="">Todas las áreas</option>
                {areas.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Días evaluados</TableHead>
                    <TableHead>Días en verde</TableHead>
                    <TableHead className="w-64">Cumplimiento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cumplimiento.filter((c: any) => c.diasConDato > 0).map((c: any) => (
                    <TableRow key={c.kpi_id}>
                      <TableCell className="font-medium">{c.nombre}</TableCell>
                      <TableCell>{c.area}</TableCell>
                      <TableCell>{c.diasConDato}</TableCell>
                      <TableCell>{c.diasVerdes}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", (c.porcentaje ?? 0) >= 80 ? "bg-emerald-600" : "bg-red-600")}
                              style={{ width: `${c.porcentaje ?? 0}%` }}
                            />
                          </div>
                          <span className="w-14 text-right text-sm tabular-nums">
                            {c.porcentaje === null ? "—" : `${c.porcentaje}%`}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguridad">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rachas.map((r: any) => (
              <Card key={`${r.area}-${r.kpi}`}>
                <CardHeader className="pb-2">
                  <CardDescription>{r.kpi} — {r.area}</CardDescription>
                  <CardTitle className="text-4xl tabular-nums">{r.rachaActual}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    días consecutivos sin eventos · récord histórico: <b>{r.rachaMaxima}</b>
                  </p>
                </CardContent>
              </Card>
            ))}
            {rachas.length === 0 && (
              <p className="text-muted-foreground col-span-full py-8 text-center">
                Sin datos de seguridad todavía.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="comparativo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Comparativo mensual (últimos 13 meses)
                {kpiIds.length > 0 && ` — ${(catalogo.find((k: any) => k.id === kpiIds[0]) as any)?.nombre}`}
              </CardTitle>
              <CardDescription>
                Agregado mensual según el método del KPI (promedio, suma o último valor).
                Selecciona el KPI en la pestaña Constructor. Incluye mismo mes del año anterior.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {comparativo.length === 0 ? (
                <p className="py-12 text-center text-muted-foreground">
                  Selecciona un KPI en el Constructor para ver su comparativo.
                </p>
              ) : (
                <ChartContainer
                  config={{
                    actual: { label: "Actual", color: "var(--chart-1)" },
                    meta: { label: "Meta", color: "var(--muted-foreground)" },
                  }}
                  className="h-72 w-full"
                >
                  <ComposedChart data={comparativo} margin={{ left: 8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} strokeOpacity={0.35} />
                    <XAxis dataKey="mes" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="actual" fill="var(--color-actual)" radius={[4, 4, 0, 0]} maxBarSize={36} />
                    <Line dataKey="meta" stroke="var(--muted-foreground)" strokeWidth={1.5}
                      strokeDasharray="6 4" type="monotone" connectNulls dot={false} />
                  </ComposedChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
