import * as React from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/admin-usuarios";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "~/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "~/components/ui/table";
import { Switch } from "~/components/ui/switch";
import { Loader2, Search, UserPlus, X } from "lucide-react";
import { cn } from "~/lib/utils";

export function meta() {
  return [{ title: "Usuarios — Administración QRQC" }];
}

export async function loader() {
  const { query } = await import("~/lib/server/db.server");
  const usuarios = await query(
    `SELECT u.*, d.nombre AS departamento FROM usuarios u
     LEFT JOIN departamentos d ON d.id = u.departamento_id
     ORDER BY u.nombre, u.email`
  );
  const departamentos = await query("SELECT * FROM departamentos WHERE activo ORDER BY nombre");
  return { usuarios, departamentos };
}

export async function action({ request }: Route.ActionArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  const { query, queryOne } = await import("~/lib/server/db.server");
  const admin = await requerirAdmin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "campo");

  if (intent === "buscar") {
    const { buscarUsuariosEntra } = await import("~/lib/server/graph.server");
    const resultado = await buscarUsuariosEntra(String(form.get("texto") ?? ""));
    if (!resultado.ok) return { ok: false as const, error: resultado.error, usuarios: [] };
    return { ok: true as const, usuarios: resultado.usuarios };
  }

  if (intent === "crear") {
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const nombre = String(form.get("nombre") ?? "").trim();
    const entraOid = String(form.get("entra_oid") ?? "").trim() || null;
    const departamentoId = form.get("departamento_id") ? Number(form.get("departamento_id")) : null;
    const rol = String(form.get("rol")) === "ADMIN" ? "ADMIN" : "CAPTURISTA";
    if (!email) return { ok: false as const, error: "Selecciona un usuario de Entra ID" };

    const existente = await queryOne("SELECT 1 FROM usuarios WHERE email = $1 OR (entra_oid IS NOT NULL AND entra_oid = $2)", [email, entraOid]);
    if (existente) return { ok: false as const, error: "Ese usuario ya está registrado" };

    await query(
      `INSERT INTO usuarios (email, nombre, entra_oid, departamento_id, rol)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, nombre, entraOid, departamentoId, rol]
    );
    await query(
      "INSERT INTO auditoria (usuario_id, tipo, detalle) VALUES ($1,'ADMIN',$2)",
      [admin.id, `Usuario ${email} agregado desde Entra ID`]
    );
    return { ok: true as const, creado: true };
  }

  // intent === "campo": edición inline de rol/departamento/activo
  const id = Number(form.get("id"));
  const campo = String(form.get("campo"));

  if (id === admin.id && (campo === "rol" || campo === "activo")) {
    return { ok: false as const, error: "No puedes cambiar tu propio rol o desactivarte" };
  }

  if (campo === "rol") {
    await query("UPDATE usuarios SET rol = $1 WHERE id = $2", [String(form.get("valor")), id]);
  } else if (campo === "departamento") {
    const valor = form.get("valor") ? Number(form.get("valor")) : null;
    await query("UPDATE usuarios SET departamento_id = $1 WHERE id = $2", [valor, id]);
  } else if (campo === "activo") {
    await query("UPDATE usuarios SET activo = NOT activo WHERE id = $1", [id]);
  } else {
    return { ok: false as const, error: "Campo desconocido" };
  }

  await query(
    "INSERT INTO auditoria (usuario_id, tipo, detalle) VALUES ($1,'ADMIN',$2)",
    [admin.id, `Usuario ${id}: cambio de ${campo}`]
  );
  return { ok: true as const };
}

const claseSelect =
  "border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

type UsuarioEntra = {
  oid: string;
  nombre: string;
  email: string;
  departamento: string | null;
  puesto: string | null;
};

function DialogoAgregar({
  abierto,
  onCerrar,
  departamentos,
}: {
  abierto: boolean;
  onCerrar: () => void;
  departamentos: any[];
}) {
  const buscador = useFetcher<typeof action>();
  const creador = useFetcher<typeof action>();
  const [texto, setTexto] = React.useState("");
  const [seleccionado, setSeleccionado] = React.useState<UsuarioEntra | null>(null);

  // Búsqueda con debounce conforme se escribe
  React.useEffect(() => {
    if (!abierto || seleccionado || texto.trim().length < 2) return;
    const t = setTimeout(() => {
      buscador.submit({ intent: "buscar", texto }, { method: "post" });
    }, 350);
    return () => clearTimeout(t);
  }, [texto, abierto, seleccionado]);

  React.useEffect(() => {
    if (creador.state === "idle" && creador.data) {
      if (creador.data.ok) {
        toast.success("Usuario agregado");
        setTexto("");
        setSeleccionado(null);
        onCerrar();
      } else {
        toast.error((creador.data as any).error);
      }
    }
  }, [creador.state, creador.data]);

  const resultados: UsuarioEntra[] =
    buscador.data?.ok && "usuarios" in buscador.data ? (buscador.data.usuarios as UsuarioEntra[]) : [];
  const errorBusqueda = buscador.data && !buscador.data.ok ? (buscador.data as any).error : null;

  return (
    <Dialog open={abierto} onOpenChange={(open) => { if (!open) { setTexto(""); setSeleccionado(null); onCerrar(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar usuario desde Entra ID</DialogTitle>
        </DialogHeader>

        {!seleccionado ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Busca por nombre o correo…"
                className="pl-8"
              />
              {buscador.state !== "idle" && (
                <Loader2 className="absolute right-2.5 top-2.5 size-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {errorBusqueda && <p className="text-sm text-destructive">{errorBusqueda}</p>}
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y empty:hidden">
              {resultados.map((u) => (
                <button
                  key={u.oid}
                  type="button"
                  onClick={() => setSeleccionado(u)}
                  className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-accent"
                >
                  <span className="text-sm font-medium">{u.nombre}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                  {(u.departamento || u.puesto) && (
                    <span className="text-[11px] text-muted-foreground">
                      {[u.puesto, u.departamento].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))}
            </div>
            {texto.trim().length >= 2 && buscador.state === "idle" && !errorBusqueda && resultados.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin coincidencias en Entra ID.</p>
            )}
          </div>
        ) : (
          <creador.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="crear" />
            <input type="hidden" name="email" value={seleccionado.email} />
            <input type="hidden" name="nombre" value={seleccionado.nombre} />
            <input type="hidden" name="entra_oid" value={seleccionado.oid} />

            <div className="flex items-start justify-between rounded-md border bg-muted/40 px-3 py-2">
              <div>
                <div className="text-sm font-medium">{seleccionado.nombre}</div>
                <div className="text-xs text-muted-foreground">{seleccionado.email}</div>
                {seleccionado.departamento && (
                  <div className="text-[11px] text-muted-foreground">
                    Departamento en Entra: {seleccionado.departamento}
                  </div>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setSeleccionado(null)}
                aria-label="Quitar selección">
                <X className="size-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Departamento</Label>
                <select name="departamento_id" className={cn(claseSelect, "w-full h-9")} defaultValue="">
                  <option value="">— Sin departamento (solo lectura) —</option>
                  {departamentos.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <select name="rol" className={cn(claseSelect, "w-full h-9")} defaultValue="CAPTURISTA">
                  <option value="CAPTURISTA">Capturista</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSeleccionado(null)}>
                Volver a buscar
              </Button>
              <Button type="submit" disabled={creador.state !== "idle"}>
                {creador.state !== "idle" && <Loader2 className="size-4 animate-spin" />}
                Agregar usuario
              </Button>
            </DialogFooter>
          </creador.Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminUsuarios({ loaderData }: Route.ComponentProps) {
  const { usuarios, departamentos } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [dialogoAbierto, setDialogoAbierto] = React.useState(false);

  React.useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (fetcher.data.ok) toast.success("Usuario actualizado", { duration: 1200 });
      else toast.error((fetcher.data as any).error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Usuarios</CardTitle>
            <CardDescription className="mt-1.5">
              Los usuarios también se crean automáticamente al iniciar sesión con Microsoft 365
              (sin departamento, solo lectura). Aquí puedes darlos de alta anticipadamente y
              asignarles departamento y rol.
            </CardDescription>
          </div>
          <Button onClick={() => setDialogoAbierto(true)}>
            <UserPlus className="size-4" /> Agregar usuario
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Departamento</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Último acceso</TableHead>
              <TableHead>Activo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u: any) => (
              <TableRow key={u.id} className={cn(!u.activo && "opacity-50")}>
                <TableCell className="font-medium">{u.nombre || "—"}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <select
                    className={claseSelect}
                    value={u.departamento_id ?? ""}
                    onChange={(e) =>
                      fetcher.submit(
                        { intent: "campo", id: String(u.id), campo: "departamento", valor: e.target.value },
                        { method: "post" }
                      )
                    }
                  >
                    <option value="">— Sin departamento —</option>
                    {departamentos.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.nombre}</option>
                    ))}
                  </select>
                </TableCell>
                <TableCell>
                  <select
                    className={claseSelect}
                    value={u.rol}
                    onChange={(e) =>
                      fetcher.submit(
                        { intent: "campo", id: String(u.id), campo: "rol", valor: e.target.value },
                        { method: "post" }
                      )
                    }
                  >
                    <option value="CAPTURISTA">Capturista</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString("es-MX") : (
                    <Badge variant="outline">Sin acceso aún</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={u.activo}
                    onCheckedChange={() =>
                      fetcher.submit({ intent: "campo", id: String(u.id), campo: "activo" }, { method: "post" })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  Aún no hay usuarios. El primero que inicie sesión será administrador.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      <DialogoAgregar
        abierto={dialogoAbierto}
        onCerrar={() => setDialogoAbierto(false)}
        departamentos={departamentos}
      />
    </Card>
  );
}
