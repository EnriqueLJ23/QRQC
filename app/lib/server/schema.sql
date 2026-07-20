CREATE TABLE IF NOT EXISTS areas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS departamentos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL DEFAULT '',
  entra_oid TEXT UNIQUE,
  departamento_id INT REFERENCES departamentos(id),
  rol TEXT NOT NULL DEFAULT 'CAPTURISTA' CHECK (rol IN ('ADMIN','CAPTURISTA')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acceso TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  orden INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS kpis (
  id SERIAL PRIMARY KEY,
  area_id INT NOT NULL REFERENCES areas(id),
  categoria_id INT NOT NULL REFERENCES categorias(id),
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'ENTERO' CHECK (unidad IN ('PORCENTAJE','ENTERO','DECIMAL')),
  direccion TEXT NOT NULL DEFAULT 'MENOR_MEJOR' CHECK (direccion IN ('MAYOR_MEJOR','MENOR_MEJOR')),
  tipo TEXT NOT NULL DEFAULT 'CAPTURADO' CHECK (tipo IN ('CAPTURADO','CALCULADO')),
  agregacion TEXT NOT NULL DEFAULT 'PROMEDIO' CHECK (agregacion IN ('PROMEDIO','SUMA','ULTIMO')),
  formula JSONB,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (area_id, nombre)
);

CREATE TABLE IF NOT EXISTS kpi_departamento (
  kpi_id INT NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  departamento_id INT NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  PRIMARY KEY (kpi_id, departamento_id)
);

CREATE TABLE IF NOT EXISTS metas_mensuales (
  id SERIAL PRIMARY KEY,
  kpi_id INT NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  anio INT NOT NULL,
  mes INT NOT NULL,
  valor NUMERIC,
  UNIQUE (kpi_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS metas_diarias (
  id SERIAL PRIMARY KEY,
  kpi_id INT NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  valor NUMERIC,
  UNIQUE (kpi_id, fecha)
);

CREATE TABLE IF NOT EXISTS capturas (
  id SERIAL PRIMARY KEY,
  kpi_id INT NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  valor NUMERIC,
  es_na BOOLEAN NOT NULL DEFAULT FALSE,
  actualizado_por INT REFERENCES usuarios(id),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, fecha)
);

CREATE TABLE IF NOT EXISTS auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  kpi_id INT REFERENCES kpis(id) ON DELETE SET NULL,
  fecha DATE,
  tipo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  detalle TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capturas_fecha ON capturas (fecha);
CREATE INDEX IF NOT EXISTS idx_auditoria_kpi ON auditoria (kpi_id, fecha);
CREATE INDEX IF NOT EXISTS idx_metas_diarias_fecha ON metas_diarias (fecha);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dias_inhabiles (
  fecha DATE PRIMARY KEY,
  descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS vistas_guardadas (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  config JSONB NOT NULL,
  fijada BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
