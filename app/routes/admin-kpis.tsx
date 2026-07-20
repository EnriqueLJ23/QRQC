import * as React from "react";
import { useFetcher, useSearchParams } from "react-router";
import type { Route } from "./+types/admin-kpis";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "~/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "~/components/ui/table";
import { Pencil, Plus } from "lucide-react";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "KPIs — Administración QRQC" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { query } = await import("~/lib/server/db.server");
  const url = new URL(request.url);
  const areas = await query("SELECT * FROM areas ORDER BY orden, nombre");
  const categorias = await query("SELECT * FROM categorias ORDER BY orden, nombre");
  const areaId = Number(url.searchParams.get("area")) || areas[0]?.id || 0;
  const kpis = await query(
    `SELECT k.*, c.nombre AS categoria FROM kpis k
     JOIN categorias c ON c.id = k.categoria_id
     WHERE k.area_id = $1 ORDER BY c.orden, k.orden, k.nombre`,
    [areaId]
  );
  return { areas, categorias, kpis, areaId };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  const { query } = await import("~/lib/server/db.server");
  const usuario = await requerirAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  try {
    if (intent === "guardar") {
      const id = form.get("id") ? Number(form.get("id")) : null;
      const formulaTipo = String(form.get("formulaTipo") ?? "");
      const kpiBase = Number(form.get("kpiBase")) || null;
      const tipo = String(form.get("tipo"));
      const formula =
        tipo === "CALCULADO" && formulaTipo === "razon_vs_meta" && kpiBase
          ? JSON.stringify({ tipo: "razon_vs_meta", kpi_base: kpiBase })
          : null;
      const valores = [
        Number(form.get("area_id")),
        Number(form.get("categoria_id")),
        String(form.get("nombre")).trim(),
        String(form.get("unidad")),
        String(form.get("direccion")),
        tipo,
        String(form.get("agregacion")),
        Number(form.get("orden")) || 0,
        formula,
      ];
      if (!valores[2]) return { ok: false as const, error: "El nombre es obligatorio" };

      if (id) {
        await query(
          `UPDATE kpis SET area_id=$1, categoria_id=$2, nombre=$3, unidad=$4, direccion=$5,
           tipo=$6, agregacion=$7, orden=$8, formula=$9 WHERE id=$10`,
          [...valores, id]
        );
      } else {
        await query(
          `INSERT INTO kpis (area_id, categoria_id, nombre, unidad, direccion, tipo, agregacion, orden, formula)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          valores
        );
      }
      await query(
        "INSERT INTO auditoria (usuario_id, tipo, valor_nuevo, detalle) VALUES ($1,'ADMIN',$2,$3)",
        [usuario.id, String(form.get("nombre")), id ? `KPI ${id} editado` : "KPI creado"]
      );
      return { ok: true as const };
    }

    if (intent === "toggle") {
      const id = Number(form.get("id"));
      await query("UPDATE kpis SET activo = NOT activo WHERE id = $1", [id]);
      await query(
        "INSERT INTO auditoria (usuario_id, kpi_id, tipo, detalle) VALUES ($1,$2,'ADMIN','KPI activado/desactivado')",
        [usuario.id, id]
      );
      return { ok: true as const };
    }
    return { ok: false as const, error: "Acción desconocida" };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Error al guardar" };
  }
}

const claseSelect =
  "border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

export default function AdminKpis({ loaderData }: Route.ComponentProps) {
  const { areas, categorias, kpis, areaId } = loaderData;
  const [params, setParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const [dialogo, setDialogo] = React.useState<null | { kpi: any | null }>(null);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) {
        setDialogo(null);
        toast.success("Guardado");
      } else toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  const kpi = dialogo?.kpi;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className={cn(claseSelect, "w-40")}
          value={areaId}
          onChange={(e) => setParams({ area: e.target.value })}
        >
          {areas.map((a: any) => (
            <option key={a.id} value={a.id}>{a.nombre}</option>
          ))}
        </select>
        <Button onClick={() => setDialogo({ kpi: null })}>
          <Plus className="size-4" /> Nuevo KPI
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Orden</TableHead>
              <TableHead>Nombre</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Agregación</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.map((k: any) => (
              <TableRow key={k.id} className={cn(!k.activo && "opacity-50")}>
                <TableCell>{k.orden}</TableCell>
                <TableCell className="font-medium">{k.nombre}</TableCell>
                <TableCell>{k.categoria}</TableCell>
                <TableCell>{k.unidad === "PORCENTAJE" ? "%" : k.unidad.toLowerCase()}</TableCell>
                <TableCell>{k.direccion === "MAYOR_MEJOR" ? "Mayor es mejor" : "Menor es mejor"}</TableCell>
                <TableCell>
                  <Badge variant={k.tipo === "CALCULADO" ? "default" : "secondary"}>
                    {k.tipo === "CALCULADO" ? "Calculado" : "Capturado"}
                  </Badge>
                </TableCell>
                <TableCell>{k.agregacion.toLowerCase()}</TableCell>
                <TableCell>
                  <fetcher.Form method="post" className="inline">
                    <input type="hidden" name="intent" value="toggle" />
                    <input type="hidden" name="id" value={k.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {k.activo ? (
                        <Badge className="bg-emerald-600">Activo</Badge>
                      ) : (
                        <Badge variant="outline">Inactivo</Badge>
                      )}
                    </Button>
                  </fetcher.Form>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => setDialogo({ kpi: k })}>
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogo !== null} onOpenChange={(open) => !open && setDialogo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{kpi ? `Editar: ${kpi.nombre}` : "Nuevo KPI"}</DialogTitle>
          </DialogHeader>
          <fetcher.Form method="post" className="space-y-3">
            <input type="hidden" name="intent" value="guardar" />
            {kpi && <input type="hidden" name="id" value={kpi.id} />}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nombre</Label>
                <Input name="nombre" defaultValue={kpi?.nombre ?? ""} required />
              </div>
              <div className="space-y-1">
                <Label>Área</Label>
                <select name="area_id" className={claseSelect} defaultValue={kpi?.area_id ?? areaId}>
                  {areas.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Categoría</Label>
                <select name="categoria_id" className={claseSelect} defaultValue={kpi?.categoria_id ?? categorias[0]?.id}>
                  {categorias.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Unidad</Label>
                <select name="unidad" className={claseSelect} defaultValue={kpi?.unidad ?? "ENTERO"}>
                  <option value="PORCENTAJE">Porcentaje (%)</option>
                  <option value="ENTERO">Entero</option>
                  <option value="DECIMAL">Decimal</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Dirección</Label>
                <select name="direccion" className={claseSelect} defaultValue={kpi?.direccion ?? "MENOR_MEJOR"}>
                  <option value="MAYOR_MEJOR">Mayor es mejor</option>
                  <option value="MENOR_MEJOR">Menor o igual es mejor</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <select name="tipo" className={claseSelect} defaultValue={kpi?.tipo ?? "CAPTURADO"}>
                  <option value="CAPTURADO">Capturado</option>
                  <option value="CALCULADO">Calculado</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Agregación mensual</Label>
                <select name="agregacion" className={claseSelect} defaultValue={kpi?.agregacion ?? "PROMEDIO"}>
                  <option value="PROMEDIO">Promedio</option>
                  <option value="SUMA">Suma</option>
                  <option value="ULTIMO">Último valor</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Orden</Label>
                <Input name="orden" type="number" defaultValue={kpi?.orden ?? 0} />
              </div>
              <div className="space-y-1">
                <Label>Fórmula (si es calculado)</Label>
                <select name="formulaTipo" className={claseSelect} defaultValue={kpi?.formula?.tipo ?? ""}>
                  <option value="">— Ninguna —</option>
                  <option value="razon_vs_meta">Actual de otro KPI ÷ su meta</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>KPI base de la fórmula</Label>
                <select name="kpiBase" className={claseSelect} defaultValue={kpi?.formula?.kpi_base ?? ""}>
                  <option value="">— Seleccionar —</option>
                  {kpis
                    .filter((x: any) => x.tipo === "CAPTURADO")
                    .map((x: any) => (
                      <option key={x.id} value={x.id}>{x.nombre}</option>
                    ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogo(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={fetcher.state !== "idle"}>Guardar</Button>
            </DialogFooter>
          </fetcher.Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
