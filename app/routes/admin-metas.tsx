import * as React from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-metas";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "~/components/ui/table";
import { cn } from "~/lib/utils";
import { diasDelMes, formatearValor, MESES, type Unidad } from "~/lib/formato";

export function meta() {
  return [{ title: "Metas — Administración QRQC" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { query } = await import("~/lib/server/db.server");
  const url = new URL(request.url);
  const hoy = new Date();
  const areas = await query("SELECT * FROM areas WHERE activo ORDER BY orden, nombre");
  const areaId = Number(url.searchParams.get("area")) || areas[0]?.id || 0;
  const anio = Number(url.searchParams.get("anio")) || hoy.getFullYear();
  const mes = Number(url.searchParams.get("mes")) || hoy.getMonth() + 1;

  const kpis = await query(
    `SELECT k.*, c.nombre AS categoria, m.valor AS meta_mensual
     FROM kpis k
     JOIN categorias c ON c.id = k.categoria_id
     LEFT JOIN metas_mensuales m ON m.kpi_id = k.id AND m.anio = $2 AND m.mes = $3
     WHERE k.area_id = $1 AND k.activo
     ORDER BY c.orden, k.orden, k.nombre`,
    [areaId, anio, mes]
  );

  const kpiSel = Number(url.searchParams.get("kpi")) || 0;
  const overrides = kpiSel
    ? await query(
        `SELECT fecha, valor FROM metas_diarias WHERE kpi_id = $1
         AND fecha BETWEEN make_date($2,$3,1) AND (make_date($2,$3,1) + interval '1 month' - interval '1 day')::date`,
        [kpiSel, anio, mes]
      )
    : [];

  return { areas, areaId, anio, mes, kpis, kpiSel, overrides };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  const { guardarMetaMensual, guardarMetaDiaria, generarMesSiguiente } = await import(
    "~/lib/server/scorecard.server"
  );
  const usuario = await requerirAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "mensual") {
    return guardarMetaMensual(
      usuario,
      Number(form.get("kpiId")),
      Number(form.get("anio")),
      Number(form.get("mes")),
      String(form.get("valor") ?? "")
    );
  }
  if (intent === "diaria") {
    return guardarMetaDiaria(
      usuario,
      Number(form.get("kpiId")),
      String(form.get("fecha")),
      String(form.get("valor") ?? "")
    );
  }
  if (intent === "generar") {
    const creadas = await generarMesSiguiente(Number(form.get("anio")), Number(form.get("mes")));
    return { ok: true as const, mensaje: `${creadas} metas copiadas del mes anterior` };
  }
  return { ok: false as const, error: "Acción desconocida" };
}

const claseSelect =
  "border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export default function AdminMetas({ loaderData }: Route.ComponentProps) {
  const { areas, areaId, anio, mes, kpis, kpiSel, overrides } = loaderData;
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success((fetcher.data as any).mensaje ?? "Meta guardada", { duration: 1500 });
      else toast.error((fetcher.data as any).error);
    }
  }, [fetcher.state, fetcher.data]);

  const setParam = (clave: string, valor: string) => {
    const p = new URLSearchParams(params);
    p.set(clave, valor);
    setParams(p, { preventScrollReset: true });
  };

  const dias = diasDelMes(anio, mes);
  const overrideMap = new Map(overrides.map((o: any) => [o.fecha, o.valor]));
  const kpiSeleccionado = kpis.find((k: any) => k.id === kpiSel);
  const anioActual = new Date().getFullYear();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className={cn(claseSelect, "w-36")} value={areaId} onChange={(e) => setParam("area", e.target.value)}>
          {areas.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select className={cn(claseSelect, "w-36")} value={mes} onChange={(e) => setParam("mes", e.target.value)}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <select className={cn(claseSelect, "w-24")} value={anio} onChange={(e) => setParam("anio", e.target.value)}>
          {Array.from({ length: 6 }, (_, i) => anioActual - 4 + i).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <fetcher.Form method="post" className="ml-auto">
          <input type="hidden" name="intent" value="generar" />
          <input type="hidden" name="anio" value={anio} />
          <input type="hidden" name="mes" value={mes} />
          <Button type="submit" variant="outline" disabled={fetcher.state !== "idle"}>
            Precargar metas del mes anterior
          </Button>
        </fetcher.Form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Metas mensuales — {MESES[mes - 1]} {anio}</CardTitle>
          <CardDescription>
            La meta mensual aplica a todos los días. Deja vacío para quitarla. Los cambios se
            guardan al salir del campo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoría</TableHead>
                <TableHead>KPI</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead className="w-40">Meta del mes</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {kpis.map((k: any) => (
                <TableRow key={k.id}>
                  <TableCell className="text-muted-foreground">{k.categoria}</TableCell>
                  <TableCell className="font-medium">{k.nombre}</TableCell>
                  <TableCell>{k.unidad === "PORCENTAJE" ? "%" : k.unidad.toLowerCase()}</TableCell>
                  <TableCell>
                    <Input
                      key={`${k.id}-${anio}-${mes}-${k.meta_mensual}`}
                      defaultValue={k.meta_mensual ?? ""}
                      className="h-8"
                      onBlur={(e) => {
                        const nuevo = e.currentTarget.value.trim();
                        const anterior = k.meta_mensual === null ? "" : String(k.meta_mensual);
                        if (nuevo === anterior) return;
                        fetcher.submit(
                          { intent: "mensual", kpiId: String(k.id), anio: String(anio), mes: String(mes), valor: nuevo },
                          { method: "post" }
                        );
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant={k.id === kpiSel ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setParam("kpi", String(k.id))}
                    >
                      Metas por día
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {kpiSeleccionado && (
        <Card>
          <CardHeader>
            <CardTitle>Metas por día — {kpiSeleccionado.nombre}</CardTitle>
            <CardDescription>
              Sobrescribe la meta mensual ({formatearValor(kpiSeleccionado.meta_mensual, kpiSeleccionado.unidad as Unidad)})
              en días específicos. Deja vacío para volver a la meta mensual.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2">
              {dias.map((d) => {
                const valor = overrideMap.get(d.fecha);
                return (
                  <div key={d.fecha} className={cn("space-y-1", d.esFinDeSemana && "opacity-60")}>
                    <div className="text-[10px] text-muted-foreground text-center">
                      {d.diaSemana} {d.dia}
                    </div>
                    <Input
                      key={`${kpiSel}-${d.fecha}-${valor}`}
                      defaultValue={valor ?? ""}
                      placeholder="—"
                      className={cn("h-8 text-center text-xs", valor != null && "border-primary")}
                      onBlur={(e) => {
                        const nuevo = e.currentTarget.value.trim();
                        const anterior = valor == null ? "" : String(valor);
                        if (nuevo === anterior) return;
                        fetcher.submit(
                          { intent: "diaria", kpiId: String(kpiSel), fecha: d.fecha, valor: nuevo },
                          { method: "post" }
                        );
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
