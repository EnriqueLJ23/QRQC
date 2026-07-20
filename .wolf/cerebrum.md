# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-07-16

## User Preferences

- [2026-07-16] El usuario quiere implementación directa, sin documentos de especificación ("do not write specs just implement").
- [2026-07-16] Usar **shadcn** para todo el diseño y también para las gráficas (shadcn chart = wrapper de Recharts). Pedido explícito a mitad de la implementación.
- [2026-07-16] Interfaz en español (requisito del proyecto TQ1).
- [2026-07-16] Aprovisionamiento deseado: 1er acceso al sistema = ADMIN; los demás usuarios nuevos entran SIN departamento y en solo lectura (nada de auto-asignar el department de Entra; el admin asigna manualmente en Usuarios).

## Key Learnings

- **Project:** qrqc — Daily Scorecard QRQC de TQ1 (reemplazo del Excel de junta diaria).
- **Stack real:** React Router v8 framework mode (SSR, loaders/actions como backend), shadcn estilo `base-nova` sobre **Base UI** (no Radix: composición vía prop `render`, no `asChild`; `Select` acepta `items` en Root), Tailwind 4, Postgres (`postgres:1234@localhost:5432/qrqc`), MSAL Node para Entra ID, Graph client-credentials para correo, node-cron, ExcelJS, Recharts.
- El dev server DEBE correr en el puerto **5174** (vite.config) porque el redirect URI de Entra es `http://localhost:5174/auth/callback`.
- Los módulos solo-servidor viven en `app/lib/server/*.server.ts` y se importan con `await import(...)` dentro de loaders/actions para no contaminar el bundle cliente.
- Bootstrap de BD: `getPool()` en `db.server.ts` crea la base si falta, aplica `schema.sql` (IF NOT EXISTS) y siembra (idempotente). Se dispara en el loader de root.
- Convención de datos: porcentajes se almacenan 0–100 (99.1); la entrada `<1` se interpreta como fracción Excel y se multiplica ×100 (`normalizarEntrada` en `app/lib/formato.ts`). Fechas como strings `YYYY-MM-DD` (parser pg 1082 anulado para evitar desfases de zona horaria).
- Excel origen: hojas "Daily QRQC meeting <MES> <AÑO>", col C=categoría, D=nombre KPI, E=Actual/Meta, fila 2=área (bloques MOLDEO/LAMINADO a lo ancho), fila 4=fechas. Renglones OEE combinan líneas de ambas áreas ("OEE % L1/ML1/C1") → el mapeo depende del área (ver MAPEO en scripts/importar-excel.mjs).
- Node local es 22.20.0 y react-router pide >22.22.0: solo emite warning "Oops", todo funciona. Si algo raro pasa con typegen, revisar esto primero.
- Los POST de acciones en React Router v8 ya NO usan `?_data=`; probar acciones vía curl = POST directo a la ruta (regresa HTML con el loader re-ejecutado).
- Cookie de sesión firmada reproducible para pruebas: `node /tmp/cookie.mjs <usuarioId>` (usa createCookieSessionStorage con el SESSION_SECRET del .env).
- Deploy: Dockerfile multi-stage (dev-deps / prod-deps / build / final), imagen final `node:24-alpine`, corre como usuario no-root `qrqc`, escucha en `PORT=3000`/`HOST=0.0.0.0` (default de `@react-router/serve` si no se setea `PORT`). `docker-compose.yml` en la raíz asume **Postgres externo** (no bundlea el servicio DB) y **Nginx Proxy Manager en otra VM** como reverse proxy — por eso publica el puerto al host (`APP_PORT:-3000`) en vez de labels de Traefik. Trae `extra_hosts: host.docker.internal:host-gateway` por si el Postgres vive en el mismo host Docker (ahí "localhost" en DATABASE_URL NO funciona dentro del contenedor).
- `.env.example` documenta todas las vars de `env.server.ts` incluyendo `BASE_URL` (nueva, con default `http://localhost:5174`) usada en el link de los correos de recordatorio — antes estaba hardcodeado a localhost:5174 (bug-013 auto + fix real en jobs.server.ts).
- Verificado con `docker build` + `docker run` real (Docker Desktop en Windows) contra el Postgres local vía `host.docker.internal`: build ok, healthcheck "healthy", `/scorecard` responde 200 con cookie de sesión válida.

## Do-Not-Repeat

- [2026-07-16] No dejar el bootstrap de BD solo en acceso perezoso: las rutas públicas no tocan BD y nada la inicializa. Forzar `await getPool()` en el loader de root (bug-002).
- [2026-07-16] No usar los `--chart-N` default del tema base-nova para series de datos: son grises (chroma 0), fallan identidad categórica. Ya sustituidos en app.css por la paleta validada del skill dataviz (claro y oscuro).
- [2026-07-16] No usar sintaxis Radix (`asChild`) con los componentes shadcn de este proyecto: son Base UI, usan prop `render`.
- [2026-07-16] `DropdownMenuLabel` (Base UI GroupLabel) SIEMPRE dentro de `DropdownMenuGroup`, si no truena el render con "MenuGroupContext is missing" (bug-004).
- [2026-07-16] NUNCA borrar usuarios de la BD con DELETE masivo: puede haber logins reales de Entra entre pruebas (el FK de capturas.actualizado_por salvó los datos del usuario real). Borrar solo por id específico de los usuarios de prueba.
- [2026-07-20] El Dockerfile NO copiaba `app/` al stage final, pero `db.server.ts` lee `app/lib/server/schema.sql` del disco en runtime (fs.readFileSync, no pasa por el bundle). Cualquier archivo leído así en runtime debe copiarse explícitamente al stage final del Dockerfile — el build de Vite no lo detecta ni lo arrastra solo (bug-015).
- [2026-07-20] Warnings de `[NODE-CRON] [WARN] missed execution` NO son un bug de la app — es node-cron v4 avisando que su heartbeat se retrasó (proceso suspendido / event loop bloqueado). No reintenta, no duplica. No "arreglar" esto sin evidencia de que realmente se perdió una tarea real (bug-016).

## Decision Log

- [2026-07-16] Backend = loaders/actions de React Router (sin API separada por ahora): la validación de permisos vive en `guardarCelda()`/`requerirAdmin()` en servidor. Si se necesita BI/Power BI, exponer rutas resource adicionales.
- [2026-07-16] Modelo normalizado: `capturas` (una fila por KPI/fecha, UNIQUE), `metas_mensuales` + `metas_diarias` (override por día > mensual), `kpi_departamento` como matriz de permisos editable. KPIs calculados via columna `formula` JSONB (`razon_vs_meta` = actual base ÷ meta base), calculados siempre en servidor, división por cero → null → "—".
- [2026-07-16] Auth solo Entra ID (pedido del usuario); primer usuario en iniciar sesión = ADMIN; aprovisionamiento automático con mapeo del atributo `department` de Graph a la tabla departamentos.
- [2026-07-16] Correos por Graph con client credentials desde MAIL_SENDER (requiere permiso de aplicación Mail.Send con admin consent); si falla, se loguea y no rompe.
- [2026-07-16] Jobs con node-cron dentro del proceso web (tick por minuto que compara HH:MM con la config en BD) en lugar de un servicio aparte: suficiente para on-premise single-instance.
- [2026-07-20] Deploy: Postgres externo (no bundleado en el compose) + Nginx Proxy Manager en otra VM haciendo reverse proxy → el contenedor de la app publica un puerto al host en vez de usar labels de Traefik/red compartida.
- [2026-07-20] Portainer NO crea /data/compose/<id>/.env solo porque docker-compose.yml tiene `env_file: - .env`. Hay que llenar la sección "Environment variables" del editor del stack (modo Advanced, pegar el contenido tipo .env.example) para que Portainer lo materialice antes de correr compose (bug-017).
