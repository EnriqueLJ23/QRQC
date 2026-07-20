import * as React from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/admin-config";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Trash2 } from "lucide-react";

export function meta() {
  return [{ title: "Configuración — Administración QRQC" }];
}

export async function loader() {
  const { query } = await import("~/lib/server/db.server");
  const { obtenerConfig } = await import("~/lib/server/scorecard.server");
  const config = await obtenerConfig();
  const inhabiles = await query(
    "SELECT * FROM dias_inhabiles WHERE fecha >= (now() - interval '3 months')::date ORDER BY fecha"
  );
  return { config, inhabiles };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  const { query } = await import("~/lib/server/db.server");
  const { generarMesSiguiente } = await import("~/lib/server/scorecard.server");
  const admin = await requerirAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "config") {
    for (const clave of ["hora_recordatorio", "hora_limite", "dia_generacion"]) {
      const valor = String(form.get(clave) ?? "").trim();
      if (valor) {
        await query(
          "INSERT INTO configuracion (clave, valor) VALUES ($1,$2) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor",
          [clave, valor]
        );
      }
    }
    await query(
      "INSERT INTO configuracion (clave, valor) VALUES ('resumen_admin',$1) ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor",
      [String(form.get("resumen_admin") === "on")]
    );
    await query("INSERT INTO auditoria (usuario_id, tipo, detalle) VALUES ($1,'ADMIN','Configuración actualizada')", [admin.id]);
    return { ok: true as const, mensaje: "Configuración guardada" };
  }

  if (intent === "inhabil_crear") {
    const fecha = String(form.get("fecha"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { ok: false as const, error: "Fecha inválida" };
    await query(
      "INSERT INTO dias_inhabiles (fecha, descripcion) VALUES ($1,$2) ON CONFLICT (fecha) DO UPDATE SET descripcion = EXCLUDED.descripcion",
      [fecha, String(form.get("descripcion") ?? "")]
    );
    return { ok: true as const, mensaje: "Día inhábil agregado" };
  }

  if (intent === "inhabil_borrar") {
    await query("DELETE FROM dias_inhabiles WHERE fecha = $1", [String(form.get("fecha"))]);
    return { ok: true as const, mensaje: "Día inhábil eliminado" };
  }

  if (intent === "generar_ahora") {
    const hoy = new Date();
    const mesSig = hoy.getMonth() + 2;
    const anio = mesSig > 12 ? hoy.getFullYear() + 1 : hoy.getFullYear();
    const mes = mesSig > 12 ? 1 : mesSig;
    const creadas = await generarMesSiguiente(anio, mes);
    return {
      ok: true as const,
      mensaje: `Scorecard de ${mes}/${anio} generado: ${creadas} metas precargadas`,
    };
  }

  return { ok: false as const, error: "Acción desconocida" };
}

export default function AdminConfig({ loaderData }: Route.ComponentProps) {
  const { config, inhabiles } = loaderData;
  const fetcher = useFetcher<typeof action>();

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success((fetcher.data as any).mensaje ?? "Guardado");
      else toast.error((fetcher.data as any).error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Alertas y generación automática</CardTitle>
          <CardDescription>
            De lunes a viernes se envía un recordatorio por correo a los departamentos con
            captura pendiente, y un resumen al administrador a la hora límite. El scorecard del
            mes siguiente se genera automáticamente el día configurado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="config" />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Hora del recordatorio</Label>
                <Input name="hora_recordatorio" type="time" defaultValue={config.hora_recordatorio ?? "07:45"} />
              </div>
              <div className="space-y-1">
                <Label>Hora límite (resumen admin)</Label>
                <Input name="hora_limite" type="time" defaultValue={config.hora_limite ?? "08:00"} />
              </div>
              <div className="space-y-1">
                <Label>Día de generación del mes siguiente</Label>
                <Input name="dia_generacion" type="number" min={1} max={28} defaultValue={config.dia_generacion ?? "25"} />
              </div>
              <div className="space-y-1">
                <Label className="block">Enviar resumen al administrador</Label>
                <Switch name="resumen_admin" defaultChecked={config.resumen_admin === "true"} />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="submit">Guardar configuración</Button>
            </div>
          </fetcher.Form>
          <fetcher.Form method="post" className="mt-4 border-t pt-4">
            <input type="hidden" name="intent" value="generar_ahora" />
            <Button type="submit" variant="outline">
              Generar scorecard del mes siguiente ahora
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Copia las metas mensuales vigentes al mes siguiente para todos los KPIs activos.
              Puedes ajustarlas después en Metas.
            </p>
          </fetcher.Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Días inhábiles y festivos</CardTitle>
          <CardDescription>No se envían recordatorios en estos días.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {inhabiles.map((d: any) => (
            <div key={d.fecha} className="flex items-center gap-2 text-sm">
              <span className="font-mono">{d.fecha}</span>
              <span className="flex-1 text-muted-foreground">{d.descripcion}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  fetcher.submit({ intent: "inhabil_borrar", fecha: d.fecha }, { method: "post" })
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {inhabiles.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin días inhábiles registrados.</p>
          )}
          <fetcher.Form method="post" className="flex items-center gap-2 border-t pt-3">
            <input type="hidden" name="intent" value="inhabil_crear" />
            <Input name="fecha" type="date" className="w-40" required />
            <Input name="descripcion" placeholder="Descripción (ej. Día de la Independencia)" />
            <Button type="submit" variant="outline">Agregar</Button>
          </fetcher.Form>
        </CardContent>
      </Card>
    </div>
  );
}
