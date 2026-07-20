import "dotenv/config";

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
  return valor;
}

export const env = {
  SESSION_SECRET: requerida("SESSION_SECRET"),
  MICROSOFT_CLIENT_ID: requerida("MICROSOFT_CLIENT_ID"),
  MICROSOFT_CLIENT_SECRET: requerida("MICROSOFT_CLIENT_SECRET"),
  MICROSOFT_TENANT_ID: requerida("MICROSOFT_TENANT_ID"),
  MICROSOFT_REDIRECT_URI: requerida("MICROSOFT_REDIRECT_URI"),
  MAIL_SENDER: requerida("MAIL_SENDER"),
  DATABASE_URL: requerida("DATABASE_URL"),
  // URL pública de la app (sin slash final), usada en los enlaces de los correos de recordatorio.
  BASE_URL: (process.env.BASE_URL || "http://localhost:5174").replace(/\/$/, ""),
};
