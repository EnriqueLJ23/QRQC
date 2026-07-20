import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("auth/callback", "routes/auth-callback.tsx"),
  route("logout", "routes/logout.tsx"),
  layout("routes/app-layout.tsx", [
    index("routes/home.tsx"),
    route("scorecard", "routes/scorecard.tsx"),
    route("analitica", "routes/analitica.tsx"),
    route("export/excel", "routes/export-excel.ts"),
    route("admin", "routes/admin-layout.tsx", [
      index("routes/admin-index.tsx"),
      route("kpis", "routes/admin-kpis.tsx"),
      route("metas", "routes/admin-metas.tsx"),
      route("usuarios", "routes/admin-usuarios.tsx"),
      route("permisos", "routes/admin-permisos.tsx"),
      route("catalogos", "routes/admin-catalogos.tsx"),
      route("auditoria", "routes/admin-auditoria.tsx"),
      route("configuracion", "routes/admin-config.tsx"),
    ]),
  ]),
] satisfies RouteConfig;
