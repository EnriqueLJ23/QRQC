import { redirect } from "react-router";
import type { Route } from "./+types/auth-callback";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorEntra = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (!code) {
    return redirect(`/login?error=${encodeURIComponent(errorEntra ?? "No se recibió el código de autorización")}`);
  }

  const { procesarCallback, crearSesion } = await import("~/lib/server/auth.server");
  try {
    const usuario = await procesarCallback(code);
    return crearSesion(request, usuario.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al iniciar sesión";
    return redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
}
