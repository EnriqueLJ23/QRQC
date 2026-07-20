import { getMsal } from "./auth.server";
import { env } from "./env.server";

async function tokenAplicacion(): Promise<string | null> {
  const token = await getMsal().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return token?.accessToken ?? null;
}

export type UsuarioEntra = {
  oid: string;
  nombre: string;
  email: string;
  departamento: string | null;
  puesto: string | null;
};

/**
 * Busca usuarios en Entra ID por nombre o correo (requiere permiso de
 * aplicación User.Read.All con consentimiento de administrador).
 */
export async function buscarUsuariosEntra(
  texto: string
): Promise<{ ok: true; usuarios: UsuarioEntra[] } | { ok: false; error: string }> {
  const limpio = texto.trim().replace(/["\\]/g, "");
  if (limpio.length < 2) return { ok: true, usuarios: [] };

  try {
    const token = await tokenAplicacion();
    if (!token) return { ok: false, error: "No se pudo obtener token de aplicación para Graph" };

    const busqueda = encodeURIComponent(`"displayName:${limpio}" OR "mail:${limpio}"`);
    const url =
      `https://graph.microsoft.com/v1.0/users?$search=${busqueda}` +
      `&$select=id,displayName,mail,userPrincipalName,department,jobTitle&$top=10`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    if (!res.ok) {
      const cuerpo = await res.text();
      console.error(`[graph] Búsqueda de usuarios falló ${res.status}: ${cuerpo}`);
      if (res.status === 403) {
        return {
          ok: false,
          error: "Graph rechazó la búsqueda (403). Falta el permiso de aplicación User.Read.All con consentimiento de administrador.",
        };
      }
      return { ok: false, error: `Error de Microsoft Graph (${res.status})` };
    }
    const datos = await res.json();
    const usuarios: UsuarioEntra[] = (datos.value ?? []).map((u: any) => ({
      oid: u.id,
      nombre: u.displayName ?? "",
      email: (u.mail || u.userPrincipalName || "").toLowerCase(),
      departamento: u.department ?? null,
      puesto: u.jobTitle ?? null,
    }));
    return { ok: true, usuarios: usuarios.filter((u) => u.email) };
  } catch (e) {
    console.error("[graph] Error buscando usuarios:", e);
    return { ok: false, error: "No se pudo consultar Entra ID" };
  }
}

/**
 * Envía un correo desde el buzón MAIL_SENDER usando Microsoft Graph con
 * credenciales de aplicación (requiere permiso Mail.Send de aplicación
 * otorgado en el registro de Entra ID).
 */
export async function enviarCorreo(opts: {
  para: string[];
  asunto: string;
  htmlCuerpo: string;
}): Promise<boolean> {
  if (opts.para.length === 0) return false;
  try {
    const accessToken = await tokenAplicacion();
    if (!accessToken) {
      console.error("[correo] No se pudo obtener token de aplicación para Graph");
      return false;
    }
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.MAIL_SENDER)}/sendMail`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject: opts.asunto,
            body: { contentType: "HTML", content: opts.htmlCuerpo },
            toRecipients: opts.para.map((email) => ({ emailAddress: { address: email } })),
          },
          saveToSentItems: false,
        }),
      }
    );
    if (!res.ok) {
      console.error(`[correo] Graph respondió ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[correo] Error enviando correo:", e);
    return false;
  }
}
