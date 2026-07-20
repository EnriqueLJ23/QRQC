# Memory

> Chronological action log. Hooks and AI append to this file automatically.
> Old sessions are consolidated by the daemon weekly.
| 11:39 | Edited vite.config.ts | 2→5 lines | ~30 |
| 11:41 | Created app/lib/server/env.server.ts | — | ~171 |
| 11:41 | Created app/lib/server/schema.sql | — | ~939 |
| 11:42 | Created app/lib/server/db.server.ts | — | ~604 |
| 11:43 | Created app/lib/server/seed.server.ts | — | ~2151 |
| 11:43 | Created app/lib/server/session.server.ts | — | ~143 |
| 11:43 | Created app/lib/server/auth.server.ts | — | ~1638 |
| 11:44 | Created app/lib/formato.ts | — | ~797 |
| 12:11 | Created app/lib/server/scorecard.server.ts | — | ~3423 |
| 12:11 | Created app/lib/server/graph.server.ts | — | ~450 |
| 12:12 | Created app/lib/server/jobs.server.ts | — | ~1521 |
| 12:12 | Created app/lib/server/analytics.server.ts | — | ~2911 |
| 12:13 | Created app/root.tsx | — | ~586 |
| 12:14 | Created app/routes.ts | — | ~270 |
| 12:14 | Created app/routes/login.tsx | — | ~695 |
| 12:14 | Created app/routes/auth-callback.tsx | — | ~236 |
| 12:14 | Created app/routes/logout.tsx | — | ~108 |
| 12:14 | Created app/routes/app-layout.tsx | — | ~1110 |
| 12:14 | Created app/routes/home.tsx | — | ~30 |
| 12:16 | Created app/routes/scorecard.tsx | — | ~3909 |
| 12:16 | Created app/routes/export-excel.ts | — | ~1176 |
| 12:17 | Created app/routes/admin-layout.tsx | — | ~397 |
| 12:17 | Created app/routes/admin-index.tsx | — | ~30 |
| 12:18 | Created app/routes/admin-kpis.tsx | — | ~3454 |
| 12:18 | Created app/routes/admin-metas.tsx | — | ~2724 |
| 12:19 | Created app/routes/admin-permisos.tsx | — | ~1848 |
| 12:19 | Created app/routes/admin-usuarios.tsx | — | ~1732 |
| 12:19 | Created app/routes/admin-catalogos.tsx | — | ~1950 |
| 12:20 | Created app/routes/admin-auditoria.tsx | — | ~1540 |
| 12:20 | Created app/routes/admin-config.tsx | — | ~2173 |
| 12:22 | Edited app/app.css | 7→7 lines | ~46 |
| 12:22 | Edited app/app.css | 6→6 lines | ~40 |
| 12:23 | Created app/routes/analitica.tsx | — | ~6861 |
| 12:26 | Edited app/root.tsx | CSS: request | ~82 |
| 12:34 | Created scripts/importar-excel.mjs | — | ~2640 |
| 12:38 | Edited package.json | 2→3 lines | ~45 |
| 12:39 | Created README.md | — | ~1005 |
| 18:00 | Implementación completa del Daily Scorecard QRQC (Entra ID + Postgres + shadcn) | app/lib/server/*, app/routes/*, scripts/importar-excel.mjs | ok: typecheck limpio, smoke tests HTTP 200, permisos validados en servidor | ~90k |
| 18:30 | Paleta de charts sustituida por la categórica validada del skill dataviz (base-nova era monocroma) | app/app.css | validador PASS en claro y oscuro | ~2k |
| 18:50 | Importados históricos del Excel: 18,270 capturas, 1,329 N/A, 646 metas mensuales, 1,729 overrides (may2025–jul2026) | scripts/importar-excel.mjs | verificación cruzada Excel 0.9857 → BD 98.57 exacta | ~5k |
| 19:05 | Bootstrap de BD hecho explícito en root loader (antes solo lo disparaba el cron) | app/root.tsx | bug-002 en buglog | ~1k |
| 12:49 | Edited app/lib/server/auth.server.ts | modified if() | ~283 |
| 19:20 | Aprovisionamiento cambiado: nuevos usuarios entran SIN departamento (solo lectura); se quitó el auto-mapeo de department de Entra (queda en auditoría como referencia) | app/lib/server/auth.server.ts | verificado: 0 celdas editables, POST rechazado, BD limpia (0 usuarios) | ~3k |
| 13:34 | Edited app/routes/app-layout.tsx | 9→11 lines | ~177 |
| 13:34 | Edited app/routes/app-layout.tsx | 8→9 lines | ~57 |
| 13:34 | Edited app/lib/server/graph.server.ts | added error handling | ~673 |
| 13:35 | Edited app/lib/server/graph.server.ts | modified if() | ~67 |
| 13:35 | Edited app/lib/server/graph.server.ts | 4→4 lines | ~36 |
| 13:36 | Created app/routes/admin-usuarios.tsx | — | ~4226 |

## Session: 2026-07-17 07:07

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|

## Session: 2026-07-20 07:44

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 07:51 | Edited app/lib/formato.ts | modified diaInfo() | ~528 |
| 07:51 | Edited app/lib/server/scorecard.server.ts | 7→7 lines | ~32 |
| 07:51 | Edited app/lib/server/scorecard.server.ts | added 1 condition(s) | ~520 |
| 07:52 | Edited app/lib/server/scorecard.server.ts | modified obtenerScorecard() | ~77 |
| 07:52 | Edited app/lib/server/scorecard.server.ts | inline fix | ~15 |
| 07:53 | Edited app/routes/export-excel.ts | inline fix | ~23 |
| 07:53 | Edited app/routes/export-excel.ts | 1→2 lines | ~39 |
| 07:53 | Edited app/routes/scorecard.tsx | modified meta() | ~480 |
| 07:54 | Edited app/lib/formato.ts | modified sumarDias() | ~116 |
| 07:54 | Edited app/routes/scorecard.tsx | 8→9 lines | ~40 |
| 07:54 | Edited app/routes/scorecard.tsx | modified Scorecard() | ~62 |
| 07:54 | Edited app/routes/scorecard.tsx | CSS: deltaSemanas, fechaISO | ~252 |
| 07:55 | Edited app/routes/scorecard.tsx | expanded (+27 lines) | ~590 |
| 07:55 | Edited app/routes/scorecard.tsx | modified map() | ~61 |
| 07:55 | Edited app/routes/scorecard.tsx | "/export/excel?area=${area" → "/export/excel?area=${area" | ~26 |
| 07:56 | Edited app/routes/scorecard.tsx | "/admin/metas?area=${areaI" → "/admin/metas?area=${areaI" | ~31 |
| 07:57 | Created ../../../../JESSEN~1/AppData/Local/Temp/claude/C--Users-Jes-sEnriqueLunaJass-Documents-DEV-QRQC/f14b7907-e9f4-4215-9349-84ac2569f7dc/scratchpad/cookie.mjs | — | ~163 |
| 08:45 | Session end: 17 writes across 5 files (formato.ts, scorecard.server.ts, export-excel.ts, scorecard.tsx, cookie.mjs) | 7 reads | ~14378 tok |
| 14:14 | Edited app/lib/server/env.server.ts | 9→11 lines | ~165 |
| 14:14 | Edited app/lib/server/jobs.server.ts | added 1 import(s) | ~67 |
| 14:14 | Edited app/lib/server/jobs.server.ts | "http://localhost:5174/sco" → "${env.BASE_URL}/scorecard" | ~34 |
| 14:14 | Edited Dockerfile | expanded (+8 lines) | ~189 |
| 14:14 | Edited .dockerignore | expanded (+7 lines) | ~26 |
| 14:15 | Created docker-compose.yml | — | ~185 |
| 14:18 | Created ../../../../JESSEN~1/AppData/Local/Temp/claude/C--Users-Jes-sEnriqueLunaJass-Documents-DEV-QRQC/f14b7907-e9f4-4215-9349-84ac2569f7dc/scratchpad/docker-test.env | — | ~109 |
| 14:16 | Created .env.example | — | ~180 |
| 14:22 | docker build + docker run smoke test (Postgres local vía host.docker.internal) | Dockerfile, docker-compose.yml | ok: build exitoso, bug-015 (schema.sql faltante en imagen) confirmado y corregido, healthcheck "healthy", GET /scorecard 200 con cookie válida | ~1k |
| 14:23 | Cleanup: contenedor/imagen de prueba y .env de prueba con secretos eliminados | — | ok | — |
| 14:25 | Investigado warning "[NODE-CRON] missed execution" reportado por el usuario | app/lib/server/jobs.server.ts | diagnóstico: false positive de node-cron v4 (heartbeat retrasado, típico de laptop en sleep con dev server corriendo), no requiere fix — bug-016 en buglog | ~1k |
| 14:30 | Session end: 24 writes across 11 files (formato.ts, scorecard.server.ts, export-excel.ts, scorecard.tsx, cookie.mjs) | 16 reads | ~18257 tok |

## Session: 2026-07-20 14:30

| Time | Action | File(s) | Outcome | ~Tokens |
|------|--------|---------|---------|--------|
| 15:30 | Edited docker-compose.yml | expanded (+10 lines) | ~183 |
| 15:31 | Session end: 1 writes across 1 files (docker-compose.yml) | 2 reads | ~548 tok |
