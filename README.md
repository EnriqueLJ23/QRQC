# Daily Scorecard QRQC — TQ1

Aplicación web que reemplaza el Excel del Daily Scorecard: matriz mensual de KPIs
de manufactura (Moldeo / Laminado) con semaforización automática, permisos de
captura por departamento, auditoría, alertas por correo, analítica y exportación
a Excel.

**Stack:** React Router v8 (SSR full-stack) · shadcn/ui (Base UI) · Tailwind 4 ·
PostgreSQL · Entra ID (MSAL) · Microsoft Graph · Recharts · ExcelJS · node-cron.

## Requisitos

- Node.js ≥ 22.22
- PostgreSQL local (usuario/contraseña configurados en `.env` → `DATABASE_URL`)
- Registro de aplicación en Entra ID (ver abajo)

## Arranque

```bash
npm install
npm run dev          # http://localhost:5174
```

En el primer request la aplicación **crea la base `qrqc`, aplica el esquema y
siembra el catálogo** (áreas, categorías, departamentos, 52 KPIs con dirección,
unidad y agregación, matriz inicial KPI↔departamento y metas del mes). Todo es
idempotente.

**El primer usuario que inicie sesión se convierte en administrador.**

## Configuración de Entra ID

El registro de aplicación (`MICROSOFT_CLIENT_ID` en `.env`) necesita:

1. **Redirect URI** (tipo Web): `http://localhost:5174/auth/callback`
   (en producción, la URL pública equivalente).
2. **Permisos delegados:** `openid`, `profile`, `email`, `User.Read`
   (para el perfil y el atributo `department`, que pre-asigna el departamento
   del usuario al aprovisionarlo).
3. **Permiso de aplicación** `Mail.Send` con consentimiento de administrador,
   para que los recordatorios salgan del buzón `MAIL_SENDER` vía Microsoft
   Graph. Sin este permiso la app funciona; solo se omite el envío de correos
   (queda registrado en el log del servidor).

## Importar históricos del Excel

```bash
npm run importar -- "Daily scorecard template TQ-1 21-abr-2025-Formulas.xlsx"
```

Recorre todas las hojas "Daily QRQC meeting …", toma fechas de la fila 4 y el
área de la fila 2, normaliza porcentajes en fracción (0.991 → 99.1), convierte
NA/N-A/n/a al estado "no aplicable" y omite errores de fórmula. Metas constantes
del mes → meta mensual; variables → overrides diarios. Re-ejecutable (upsert).

## Jobs programados (en el proceso del servidor)

- **Recordatorio de captura** (default 07:45, L–V, respeta días inhábiles):
  correo a los usuarios del departamento con renglones pendientes del día.
- **Resumen al administrador** (default 08:00): estado de captura del día.
- **Generación del mes siguiente** (default día 25): copia metas mensuales
  vigentes al mes nuevo.

Horas, día de generación y días inhábiles se editan en
**Administración → Configuración**.

## Estructura

```
app/lib/formato.ts             # normalización/formateo compartido (cliente+servidor)
app/lib/server/                # solo servidor
  db.server.ts                 #   pool pg + bootstrap (crea BD, esquema, seed)
  schema.sql                   #   modelo normalizado (una fila por KPI/fecha)
  seed.server.ts               #   catálogo inicial
  auth.server.ts               #   MSAL, aprovisionamiento, permisos por depto
  session.server.ts            #   cookies firmadas (SESSION_SECRET)
  graph.server.ts              #   envío de correo (client credentials)
  scorecard.server.ts          #   matriz, guardado validado, metas, auditoría
  analytics.server.ts          #   series, cumplimiento, rachas, comparativos
  jobs.server.ts               #   node-cron
app/routes/                    # scorecard, analitica, export-excel, admin-*
scripts/importar-excel.mjs     # migración de históricos
```

## Producción

```bash
npm run build
npm run start
```

Definir en el servidor las mismas variables de `.env` (con `MICROSOFT_REDIRECT_URI`
apuntando a la URL pública con HTTPS) y programar el respaldo diario de la base
(`pg_dump qrqc`).
