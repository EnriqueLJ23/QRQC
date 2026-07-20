import { NavLink, Outlet } from "react-router";
import type { Route } from "./+types/admin-layout";
import { cn } from "~/lib/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const { requerirAdmin } = await import("~/lib/server/auth.server");
  await requerirAdmin(request);
  return null;
}

const SECCIONES = [
  { to: "/admin/kpis", label: "KPIs" },
  { to: "/admin/metas", label: "Metas" },
  { to: "/admin/permisos", label: "Permisos" },
  { to: "/admin/usuarios", label: "Usuarios" },
  { to: "/admin/catalogos", label: "Catálogos" },
  { to: "/admin/auditoria", label: "Auditoría" },
  { to: "/admin/configuracion", label: "Configuración" },
];

export default function AdminLayout() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 border-b pb-2">
        <h1 className="text-xl font-semibold mr-4">Administración</h1>
        {SECCIONES.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
              )
            }
          >
            {s.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
