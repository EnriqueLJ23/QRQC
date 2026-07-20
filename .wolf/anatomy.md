# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-20T20:18:03.019Z
> Files: 75 tracked | Anatomy hits: 0 | Misses: 0

## ../../../../JESSEN~1/AppData/Local/Temp/claude/C--Users-Jes-sEnriqueLunaJass-Documents-DEV-QRQC/f14b7907-e9f4-4215-9349-84ac2569f7dc/scratchpad/

- `cookie.mjs` — Declares usuarioId (~163 tok)
- `docker-test.env` (~109 tok)

## ./

- `.dockerignore` — excluye .env*, .git, .wolf, .claude, .agents de la imagen (~26 tok)
- `.env.example` — Documenta todas las env vars requeridas para deploy (Postgres, Entra ID, Graph, BASE_URL, PORT) (~180 tok)
- `.gitignore` — Git ignore rules (~19 tok)
- `.mcp.json` (~39 tok)
- `CLAUDE.md` — OpenWolf (~57 tok)
- `components.json` (~147 tok)
- `docker-compose.yml` — Docker Compose services (~185 tok)
- `Dockerfile` — Docker container definition (~290 tok)
- `package-lock.json` — npm lock file (~82614 tok)
- `package.json` — Node.js package manifest (~380 tok)
- `react-router.config.ts` (~59 tok)
- `README.md` — Project documentation (~942 tok)
- `tsconfig.json` — TypeScript configuration (~168 tok)
- `vite.config.ts` — Vite build configuration (~83 tok)

## .agents/skills/react-router/

- `SKILL.md` — React Router (~1525 tok)

## .agents/skills/react-router/references/

- `data-mode.md` — Data Mode (~1200 tok)
- `declarative-mode.md` — Declarative Mode (~821 tok)
- `framework-mode.md` — Framework Mode (~1818 tok)
- `rsc.md` — React Server Components (RSC) (~862 tok)

## .claude/

- `settings.json` (~441 tok)
- `settings.local.json` (~15 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## app/

- `app.css` — Styles: 9 rules, 104 vars (~1254 tok)
- `root.tsx` — links (~630 tok)
- `routes.ts` — Declares RouteConfig (~270 tok)

## app/components/ui/

- `alert.tsx` — alertVariants (~586 tok)
- `badge.tsx` — badgeVariants (~550 tok)
- `button.tsx` — buttonVariants (~926 tok)
- `card.tsx` — Card (~752 tok)
- `chart.tsx` — Format: { THEME_NAME: CSS_SELECTOR } (~2997 tok)
- `checkbox.tsx` — Checkbox (~388 tok)
- `dialog.tsx` — Dialog — renders modal (~1165 tok)
- `dropdown-menu.tsx` — DropdownMenu (~2492 tok)
- `input.tsx` — Input (~298 tok)
- `label.tsx` — Label (~144 tok)
- `select.tsx` — Select (~1898 tok)
- `separator.tsx` — Separator (~152 tok)
- `sonner.tsx` — Toaster (~351 tok)
- `switch.tsx` — Switch (~488 tok)
- `table.tsx` — Table — renders table (~687 tok)
- `tabs.tsx` — Tabs (~996 tok)
- `textarea.tsx` — Textarea (~241 tok)
- `tooltip.tsx` — TooltipProvider (~814 tok)

## app/lib/

- `formato.ts` — Normaliza la entrada del usuario a número según la unidad del KPI. (~1271 tok)
- `utils.ts` — Exports cn (~48 tok)

## app/lib/server/

- `analytics.server.ts` — Carga KPIs (con área/categoría) por id. (~2911 tok)
- `auth.server.ts` — Procesa el código de autorización de Entra ID: obtiene el token, consulta (~1727 tok)
- `db.server.ts` — numeric → number, date → 'YYYY-MM-DD' (evita desfases de zona horaria) (~604 tok)
- `env.server.ts` — Exports env (~222 tok)
- `graph.server.ts` — Busca usuarios en Entra ID por nombre o correo (requiere permiso de (~1074 tok)
- `jobs.server.ts` — KPIs capturables sin registro hoy, agrupados por departamento. (~1530 tok)
- `schema.sql` — Database schema (~1006 tok)
- `scorecard.server.ts` — Meta vigente por KPI y fecha: override diario > meta mensual > null. (~3574 tok)
- `seed.server.ts` — Exports sembrarDatos (~2151 tok)
- `session.server.ts` — API routes: GET (1 endpoints) (~143 tok)

## app/routes/

- `admin-auditoria.tsx` — meta — renders form, table (~1540 tok)
- `admin-catalogos.tsx` — meta (~1950 tok)
- `admin-config.tsx` — meta (~2173 tok)
- `admin-index.tsx` — loader (~30 tok)
- `admin-kpis.tsx` — meta — renders table, modal (~3454 tok)
- `admin-layout.tsx` — loader (~397 tok)
- `admin-metas.tsx` — meta — renders table (~2724 tok)
- `admin-permisos.tsx` — meta — renders table (~1848 tok)
- `admin-usuarios.tsx` — meta — renders table, modal (~4226 tok)
- `analitica.tsx` — meta (~6861 tok)
- `app-layout.tsx` — loader (~1145 tok)
- `auth-callback.tsx` — loader (~236 tok)
- `export-excel.ts` — API routes: GET (3 endpoints) (~1196 tok)
- `home.tsx` — loader (~30 tok)
- `login.tsx` — meta — renders form (~695 tok)
- `logout.tsx` — loader (~108 tok)
- `scorecard.tsx` — meta — renders table (~4608 tok)

## app/welcome/

- `welcome.tsx` — Welcome (~1200 tok)

## scripts/

- `importar-excel.mjs` — Importador de históricos del Daily Scorecard (Excel → Postgres). (~2640 tok)
