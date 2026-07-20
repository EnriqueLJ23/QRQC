import { useSearchParams } from "react-router";
import type { Route } from "./+types/admin-auditoria";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "~/components/ui/table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export function meta() {
  return [{ title: "Auditoría — Administración QRQC" }];
}

const POR_PAGINA = 100;

export async function loader({ request }: Route.LoaderArgs) {
  const { query } = await import("~/lib/server/db.server");
  const url = new URL(request.url);
  const pagina = Math.max(1, Number(url.searchParams.get("pagina")) || 1);
  const buscar = url.searchParams.get("buscar")?.trim() || "";

  const condicion = buscar
    ? `WHERE k.nombre ILIKE $3 OR u.email ILIKE $3 OR u.nombre ILIKE $3 OR a.detalle ILIKE $3`
    : "";
  const params: any[] = [POR_PAGINA, (pagina - 1) * POR_PAGINA];
  if (buscar) params.push(`%${buscar}%`);

  const registros = await query(
    `SELECT a.*, u.nombre AS usuario_nombre, u.email AS usuario_email, k.nombre AS kpi_nombre,
            ar.nombre AS area_nombre
     FROM auditoria a
     LEFT JOIN usuarios u ON u.id = a.usuario_id
     LEFT JOIN kpis k ON k.id = a.kpi_id
     LEFT JOIN areas ar ON ar.id = k.area_id
     ${condicion}
     ORDER BY a.creado_en DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  return { registros, pagina, buscar };
}

const ETIQUETA_TIPO: Record<string, string> = {
  CAPTURA: "Captura",
  META_MENSUAL: "Meta mensual",
  META_DIARIA: "Meta diaria",
  ADMIN: "Administración",
};

export default function AdminAuditoria({ loaderData }: Route.ComponentProps) {
  const { registros, pagina, buscar } = loaderData;
  const [params, setParams] = useSearchParams();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bitácora de auditoría</CardTitle>
        <CardDescription>
          Historial de cambios: quién capturó o modificó cada celda, cuándo y el valor anterior.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex gap-2 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            const valor = new FormData(e.currentTarget).get("buscar") as string;
            setParams({ buscar: valor });
          }}
        >
          <Input name="buscar" placeholder="Buscar por KPI, usuario o detalle…" defaultValue={buscar} />
          <Button type="submit" variant="outline">Buscar</Button>
        </form>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha/hora</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>KPI</TableHead>
              <TableHead>Día</TableHead>
              <TableHead>Valor anterior</TableHead>
              <TableHead>Valor nuevo</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {registros.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(r.creado_en).toLocaleString("es-MX")}
                </TableCell>
                <TableCell className="text-xs">{r.usuario_nombre || r.usuario_email || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ETIQUETA_TIPO[r.tipo] ?? r.tipo}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {r.kpi_nombre ? `${r.kpi_nombre}${r.area_nombre ? ` (${r.area_nombre})` : ""}` : "—"}
                </TableCell>
                <TableCell className="text-xs">{r.fecha ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.valor_anterior || "—"}</TableCell>
                <TableCell className="text-xs font-medium">{r.valor_nuevo || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.detalle || ""}</TableCell>
              </TableRow>
            ))}
            {registros.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Sin registros.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina <= 1}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set("pagina", String(pagina - 1));
              setParams(p);
            }}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={registros.length < POR_PAGINA}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set("pagina", String(pagina + 1));
              setParams(p);
            }}
          >
            Siguiente
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
