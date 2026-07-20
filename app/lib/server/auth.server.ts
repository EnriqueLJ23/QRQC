import { ConfidentialClientApplication } from "@azure/msal-node";
import { redirect } from "react-router";
import { env } from "./env.server";
import { query, queryOne } from "./db.server";
import { getSession, sessionStorage } from "./session.server";

declare global {
  var __qrqcMsal: ConfidentialClientApplication | undefined;
}

export function getMsal(): ConfidentialClientApplication {
  if (!globalThis.__qrqcMsal) {
    globalThis.__qrqcMsal = new ConfidentialClientApplication({
      auth: {
        clientId: env.MICROSOFT_CLIENT_ID,
        clientSecret: env.MICROSOFT_CLIENT_SECRET,
        authority: `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}`,
      },
    });
  }
  return globalThis.__qrqcMsal;
}

const SCOPES = ["openid", "profile", "email", "User.Read"];

export async function urlDeLogin(): Promise<string> {
  return getMsal().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: env.MICROSOFT_REDIRECT_URI,
    prompt: "select_account",
  });
}

export type Usuario = {
  id: number;
  email: string;
  nombre: string;
  entra_oid: string | null;
  departamento_id: number | null;
  departamento: string | null;
  rol: "ADMIN" | "CAPTURISTA";
  activo: boolean;
};

/**
 * Procesa el código de autorización de Entra ID: obtiene el token, consulta
 * el perfil en Microsoft Graph y aprovisiona (o actualiza) el usuario local.
 * El primer usuario que inicia sesión se convierte en administrador.
 */
export async function procesarCallback(code: string): Promise<Usuario> {
  const resultado = await getMsal().acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: env.MICROSOFT_REDIRECT_URI,
  });

  const claims = resultado.account?.idTokenClaims as Record<string, any>;
  const oid: string = claims?.oid ?? resultado.uniqueId;
  let email: string = (claims?.preferred_username ?? "").toLowerCase();
  let nombre: string = claims?.name ?? "";
  let departamentoGraph: string | null = null;

  try {
    const res = await fetch(
      "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department",
      { headers: { Authorization: `Bearer ${resultado.accessToken}` } }
    );
    if (res.ok) {
      const perfil = await res.json();
      nombre = perfil.displayName || nombre;
      email = (perfil.mail || perfil.userPrincipalName || email).toLowerCase();
      departamentoGraph = perfil.department || null;
    }
  } catch {
    // Graph no disponible: seguimos con los claims del id_token
  }

  if (!email) throw new Error("Entra ID no devolvió un correo para la cuenta");

  let usuario = await queryOne<Usuario>(
    "SELECT * FROM usuarios WHERE entra_oid = $1 OR email = $2",
    [oid, email]
  );

  if (!usuario) {
    // Primer usuario del sistema → ADMIN. Los demás entran SIN departamento:
    // solo lectura del scorecard hasta que el administrador les asigne uno
    // (el atributo department de Entra se registra en auditoría como referencia).
    const esPrimero = (await queryOne("SELECT 1 FROM usuarios LIMIT 1")) === null;
    usuario = await queryOne<Usuario>(
      `INSERT INTO usuarios (email, nombre, entra_oid, departamento_id, rol, ultimo_acceso)
       VALUES ($1, $2, $3, NULL, $4, now()) RETURNING *`,
      [email, nombre, oid, esPrimero ? "ADMIN" : "CAPTURISTA"]
    );
    await query(
      "INSERT INTO auditoria (usuario_id, tipo, detalle) VALUES ($1, 'ADMIN', $2)",
      [
        usuario!.id,
        esPrimero
          ? "Primer acceso: usuario aprovisionado como ADMINISTRADOR"
          : `Primer acceso: usuario aprovisionado sin departamento (solo lectura). Departamento en Entra ID: ${departamentoGraph ?? "no informado"}`,
      ]
    );
  } else {
    usuario = await queryOne<Usuario>(
      `UPDATE usuarios SET entra_oid = $1, nombre = COALESCE(NULLIF($2, ''), nombre),
       ultimo_acceso = now() WHERE id = $3 RETURNING *`,
      [oid, nombre, usuario.id]
    );
  }

  if (!usuario!.activo) throw new Error("El usuario está desactivado. Contacta al administrador.");
  return usuario!;
}

export async function crearSesion(request: Request, usuarioId: number) {
  const session = await getSession(request);
  session.set("usuarioId", usuarioId);
  return redirect("/scorecard", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export async function cerrarSesion(request: Request) {
  const session = await getSession(request);
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}

export async function usuarioActual(request: Request): Promise<Usuario | null> {
  const session = await getSession(request);
  const id = session.get("usuarioId");
  if (!id) return null;
  const usuario = await queryOne<Usuario>(
    `SELECT u.*, d.nombre AS departamento
     FROM usuarios u LEFT JOIN departamentos d ON d.id = u.departamento_id
     WHERE u.id = $1 AND u.activo`,
    [id]
  );
  return usuario;
}

export async function requerirUsuario(request: Request): Promise<Usuario> {
  const usuario = await usuarioActual(request);
  if (!usuario) throw redirect("/login");
  return usuario;
}

export async function requerirAdmin(request: Request): Promise<Usuario> {
  const usuario = await requerirUsuario(request);
  if (usuario.rol !== "ADMIN") {
    throw new Response("Se requiere rol de administrador", { status: 403 });
  }
  return usuario;
}

/** KPIs que el usuario puede capturar (todos si es admin). */
export async function kpisEditables(usuario: Usuario): Promise<Set<number>> {
  if (usuario.rol === "ADMIN") {
    const filas = await query<{ id: number }>("SELECT id FROM kpis WHERE activo");
    return new Set(filas.map((f) => f.id));
  }
  if (!usuario.departamento_id) return new Set();
  const filas = await query<{ kpi_id: number }>(
    `SELECT kd.kpi_id FROM kpi_departamento kd
     JOIN kpis k ON k.id = kd.kpi_id AND k.activo AND k.tipo = 'CAPTURADO'
     WHERE kd.departamento_id = $1`,
    [usuario.departamento_id]
  );
  return new Set(filas.map((f) => f.kpi_id));
}
