import * as React from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-permisos";
import { toast } from "sonner";
import { Checkbox } from "~/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Permisos — Administración QRQC" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { query } = await import("~/lib/server/db.server");
  const url = new URL(request.url);
  const areas = await query("SELECT * FROM areas WHERE activo ORDER BY orden, nombre");
  const areaId = Number(url.searchParams.get("area")) || areas[0]?.id || 0;
  const departamentos = await query("SELECT * FROM departamentos WHERE activo ORDER BY nombre");
  const kpis = await query(
    `SELECT k.id, k.nombre, k.tipo, c.nombre AS categoria FROM kpis k
     JOIN categorias c ON c.id = k.categoria_id
     WHERE k.area_id = $1 AND k.activo ORDER BY c.orden, k.orden, k.nombre`,
    [areaId]
  );
  const asignaciones = await query(
    `SELECT kd.kpi_id, kd.departamento_id FROM kpi_departamento kd
     JOIN kpis k ON k.id = kd.kpi_id WHERE k.area_id = $1`,
    [areaId]
  );
  return { areas, areaId, departamentos, kpis, asignaciones };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  const { query } = await import("~/lib/server/db.server");
  const usuario = await requerirAdmin(request);
  const form = await request.formData();
  const kpiId = Number(form.get("kpiId"));
  const deptoId = Number(form.get("deptoId"));
  const asignar = String(form.get("asignar")) === "true";

  if (asignar) {
    await query(
      "INSERT INTO kpi_departamento (kpi_id, departamento_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [kpiId, deptoId]
    );
  } else {
    await query("DELETE FROM kpi_departamento WHERE kpi_id = $1 AND departamento_id = $2", [
      kpiId,
      deptoId,
    ]);
  }
  await query(
    "INSERT INTO auditoria (usuario_id, kpi_id, tipo, detalle) VALUES ($1,$2,'ADMIN',$3)",
    [usuario.id, kpiId, `Permiso departamento ${deptoId} ${asignar ? "asignado" : "retirado"}`]
  );
  return { ok: true as const };
}

const claseSelect =
  "border-input h-9 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export default function AdminPermisos({ loaderData }: Route.ComponentProps) {
  const { areas, areaId, departamentos, kpis, asignaciones } = loaderData;
  const [, setParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) {
      toast.success("Permiso actualizado", { duration: 1200 });
    }
  }, [fetcher.state, fetcher.data]);

  const asignado = new Set(asignaciones.map((a: any) => `${a.kpi_id}|${a.departamento_id}`));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matriz de permisos de captura (KPI ↔ Departamento)</CardTitle>
        <CardDescription>
          Marca qué departamentos pueden capturar cada indicador. Los cambios surten efecto de
          inmediato. Los KPIs calculados no se capturan, pero su asignación se usa para los
          recordatorios del KPI base.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <select
          className={cn(claseSelect, "w-40")}
          value={areaId}
          onChange={(e) => setParams({ area: e.target.value })}
        >
          {areas.map((a: any) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted/60">
                <th className="text-left px-3 py-2 border-b border-r min-w-56">KPI</th>
                {departamentos.map((d: any) => (
                  <th key={d.id} className="px-2 py-2 border-b border-r text-center min-w-24 font-medium">
                    {d.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {kpis.map((k: any, i: number) => {
                const previa = i > 0 ? (kpis[i - 1] as any).categoria : null;
                return (
                  <React.Fragment key={k.id}>
                    {k.categoria !== previa && (
                      <tr>
                        <td
                          colSpan={1 + departamentos.length}
                          className="bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wide"
                        >
                          {k.categoria}
                        </td>
                      </tr>
                    )}
                    <tr className="hover:bg-accent/40">
                      <td className="px-3 py-1.5 border-b border-r">
                        {k.nombre}
                        {k.tipo === "CALCULADO" && (
                          <span className="ml-1 text-xs text-muted-foreground">(calc.)</span>
                        )}
                      </td>
                      {departamentos.map((d: any) => {
                        const marcado = asignado.has(`${k.id}|${d.id}`);
                        return (
                          <td key={d.id} className="px-2 py-1.5 border-b border-r text-center">
                            <Checkbox
                              checked={marcado}
                              onCheckedChange={(checked) => {
                                fetcher.submit(
                                  {
                                    kpiId: String(k.id),
                                    deptoId: String(d.id),
                                    asignar: String(checked === true),
                                  },
                                  { method: "post" }
                                );
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
