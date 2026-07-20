import { redirect, Form, useSearchParams } from "react-router";
import type { Route } from "./+types/login";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Alert, AlertDescription } from "~/components/ui/alert";

export function meta() {
  return [{ title: "Iniciar sesión — Daily Scorecard QRQC" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { usuarioActual } = await import("~/lib/server/auth.server");
  const usuario = await usuarioActual(request);
  if (usuario) throw redirect("/scorecard");
  return null;
}

export async function action() {
  const { urlDeLogin } = await import("~/lib/server/auth.server");
  return redirect(await urlDeLogin());
}

export default function Login() {
  const [params] = useSearchParams();
  const error = params.get("error");

  return (
    <main className="min-h-svh flex items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-bold">
            TQ1
          </div>
          <CardTitle className="text-xl">Daily Scorecard QRQC</CardTitle>
          <CardDescription>
            Registro diario de KPIs de manufactura
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Form method="post">
            <Button type="submit" className="w-full" size="lg">
              <svg className="size-4" viewBox="0 0 21 21" aria-hidden>
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Iniciar sesión con Microsoft
            </Button>
          </Form>
          <p className="text-center text-xs text-muted-foreground">
            Usa tu cuenta corporativa de Microsoft 365
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
