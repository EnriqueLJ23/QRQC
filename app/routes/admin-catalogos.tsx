import * as React from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/admin-catalogos";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Switch } from "~/components/ui/switch";
import { Plus } from "lucide-react";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Catálogos — Administración QRQC" }];
}

export async function loader() {
  const { query } = await import("~/lib/server/db.server");
  const areas = await query("SELECT * FROM areas ORDER BY orden, nombre");
  const categorias = await query("SELECT * FROM categorias ORDER BY orden, nombre");
  const departamentos = await query("SELECT * FROM departamentos ORDER BY nombre");
  return { areas, categorias, departamentos };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  const { query } = await import("~/lib/server/db.server");
  const admin = await requerirAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  const tabla = String(form.get("tabla"));
  if (!["areas", "categorias", "departamentos"].includes(tabla)) {
    return { ok: false as const, error: "Catálogo desconocido" };
  }

  try {
    if (intent === "crear") {
      const nombre = String(form.get("nombre") ?? "").trim();
      if (!nombre) return { ok: false as const, error: "El nombre es obligatorio" };
      if (tabla === "departamentos") {
        await query("INSERT INTO departamentos (nombre) VALUES ($1)", [nombre]);
      } else {
        await query(`INSERT INTO ${tabla} (nombre, orden) VALUES ($1, $2)`, [
          nombre,
          Number(form.get("orden")) || 0,
        ]);
      }
    } else if (intent === "renombrar") {
      const nombre = String(form.get("nombre") ?? "").trim();
      if (!nombre) return { ok: false as const, error: "El nombre es obligatorio" };
      await query(`UPDATE ${tabla} SET nombre = $1 WHERE id = $2`, [nombre, Number(form.get("id"))]);
    } else if (intent === "orden" && tabla !== "departamentos") {
      await query(`UPDATE ${tabla} SET orden = $1 WHERE id = $2`, [
        Number(form.get("orden")) || 0,
        Number(form.get("id")),
      ]);
    } else if (intent === "toggle" && tabla !== "categorias") {
      await query(`UPDATE ${tabla} SET activo = NOT activo WHERE id = $1`, [Number(form.get("id"))]);
    }
    await query("INSERT INTO auditoria (usuario_id, tipo, detalle) VALUES ($1,'ADMIN',$2)", [
      admin.id,
      `Catálogo ${tabla}: ${intent}`,
    ]);
    return { ok: true as const };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Error al guardar" };
  }
}

function SeccionCatalogo({
  titulo,
  descripcion,
  tabla,
  filas,
  conOrden,
  conActivo,
}: {
  titulo: string;
  descripcion: string;
  tabla: string;
  filas: any[];
  conOrden: boolean;
  conActivo: boolean;
}) {
  const fetcher = useFetcher<typeof action>();

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success("Guardado", { duration: 1200 });
      else toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descripcion}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {filas.map((f) => (
          <div key={f.id} className={cn("flex items-center gap-2", conActivo && !f.activo && "opacity-50")}>
            {conOrden && (
              <Input
                type="number"
                defaultValue={f.orden}
                className="h-8 w-16"
                onBlur={(e) => {
                  if (Number(e.currentTarget.value) !== f.orden) {
                    fetcher.submit(
                      { intent: "orden", tabla, id: String(f.id), orden: e.currentTarget.value },
                      { method: "post" }
                    );
                  }
                }}
              />
            )}
            <Input
              defaultValue={f.nombre}
              className="h-8 flex-1"
              onBlur={(e) => {
                const nombre = e.currentTarget.value.trim();
                if (nombre && nombre !== f.nombre) {
                  fetcher.submit(
                    { intent: "renombrar", tabla, id: String(f.id), nombre },
                    { method: "post" }
                  );
                }
              }}
            />
            {conActivo && (
              <Switch
                checked={f.activo}
                onCheckedChange={() =>
                  fetcher.submit({ intent: "toggle", tabla, id: String(f.id) }, { method: "post" })
                }
              />
            )}
          </div>
        ))}
        <fetcher.Form
          method="post"
          className="flex items-center gap-2 pt-2 border-t"
          onSubmit={(e) => {
            // limpiar el input después de enviar
            const formEl = e.currentTarget;
            setTimeout(() => formEl.reset(), 0);
          }}
        >
          <input type="hidden" name="intent" value="crear" />
          <input type="hidden" name="tabla" value={tabla} />
          {conOrden && <Input name="orden" type="number" placeholder="Orden" className="h-8 w-16" />}
          <Input name="nombre" placeholder="Nuevo nombre…" className="h-8 flex-1" required />
          <Button type="submit" size="sm" variant="outline">
            <Plus className="size-4" /> Agregar
          </Button>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

export default function AdminCatalogos({ loaderData }: Route.ComponentProps) {
  const { areas, categorias, departamentos } = loaderData;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <SeccionCatalogo
        titulo="Áreas"
        descripcion="Secciones del scorecard (Moldeo, Laminado…). Puedes agregar más en el futuro."
        tabla="areas"
        filas={areas}
        conOrden
        conActivo
      />
      <SeccionCatalogo
        titulo="Categorías"
        descripcion="Agrupación de renglones (Seguridad, Disciplina, Calidad, Entregas, Costo)."
        tabla="categorias"
        filas={categorias}
        conOrden
        conActivo={false}
      />
      <SeccionCatalogo
        titulo="Departamentos"
        descripcion="Determinan qué usuarios pueden capturar qué KPIs (ver Permisos)."
        tabla="departamentos"
        filas={departamentos}
        conOrden={false}
        conActivo
      />
    </div>
  );
}
