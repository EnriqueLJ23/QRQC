import { Link, NavLink, Outlet, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/app-layout";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Badge } from "~/components/ui/badge";
import { CircleUser, LogOut } from "lucide-react";
import { cn } from "~/lib/utils";

export async function loader({ request }: Route.LoaderArgs) {
  const { requerirUsuario } = await import("~/lib/server/auth.server");
  const usuario = await requerirUsuario(request);
  return {
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      departamento: usuario.departamento,
    },
  };
}

export function useUsuario() {
  const data = useRouteLoaderData<typeof loader>("routes/app-layout");
  return data!.usuario;
}

export default function AppLayout({ loaderData }: Route.ComponentProps) {
  const { usuario } = loaderData;
  const enlaces = [
    { to: "/scorecard", label: "Scorecard" },
    { to: "/analitica", label: "Analítica" },
    ...(usuario.rol === "ADMIN" ? [{ to: "/admin", label: "Administración" }] : []),
  ];

  return (
    <div className="min-h-svh flex flex-col">
      <header className="border-b bg-background sticky top-0 z-40">
        <div className="flex h-14 items-center gap-6 px-4 lg:px-6">
          <Link to="/scorecard" className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
              TQ1
            </span>
            <span className="hidden sm:inline">Daily Scorecard</span>
          </Link>
          <nav className="flex items-center gap-1">
            {enlaces.map((e) => (
              <NavLink
                key={e.to}
                to={e.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                  )
                }
              >
                {e.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {usuario.departamento && (
              <Badge variant="secondary" className="hidden md:inline-flex">
                {usuario.departamento}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Menú de usuario">
                    <CircleUser className="size-5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="text-sm font-medium text-foreground">{usuario.nombre || usuario.email}</div>
                    <div className="text-xs text-muted-foreground">{usuario.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {usuario.rol === "ADMIN" ? "Administrador" : "Capturista"}
                    </div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  render={
                    <a href="/logout">
                      <LogOut className="size-4" /> Cerrar sesión
                    </a>
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1 p-4 lg:p-6">
        <Outlet />
      </main>
    </div>
  );
}
