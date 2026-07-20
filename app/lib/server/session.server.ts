import { createCookieSessionStorage } from "react-router";
import { env } from "./env.server";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__qrqc_session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [env.SESSION_SECRET],
    secure: env.MICROSOFT_REDIRECT_URI.startsWith("https"),
    maxAge: 60 * 60 * 12,
  },
});

export function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get("Cookie"));
}
