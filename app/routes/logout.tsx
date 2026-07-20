import type { Route } from "./+types/logout";

export async function loader({ request }: Route.LoaderArgs) {
  const { cerrarSesion } = await import("~/lib/server/auth.server");
  return cerrarSesion(request);
}

export async function action({ request }: Route.ActionArgs) {
  const { cerrarSesion } = await import("~/lib/server/auth.server");
  return cerrarSesion(request);
}
