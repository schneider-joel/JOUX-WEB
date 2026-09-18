-- JOUX HUB · Supabase Schema
-- Run this in Supabase SQL Editor

-- Cuentas bancarias
CREATE TABLE cuentas (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  saldo DECIMAL(10,2) DEFAULT 0,
  color TEXT DEFAULT '#60a5fa',
  tipo TEXT DEFAULT 'operativa', -- operativa, ahorro, irpf, ss, cash, otro
  orden INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Crypto
CREATE TABLE crypto (
  id SERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  nombre TEXT NOT NULL,
  cantidad DECIMAL(18,8) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Facturas
CREATE TABLE facturas (
  id SERIAL PRIMARY KEY,
  numero TEXT,
  cliente TEXT NOT NULL,
  descripcion TEXT,
  importe DECIMAL(10,2) NOT NULL,
  fecha DATE NOT NULL,
  fecha_cobro DATE,
  estado TEXT DEFAULT 'pendiente', -- pendiente, cobrada
  cuenta_destino_id INT REFERENCES cuentas(id),
  origen TEXT DEFAULT 'manual', -- manual, notion
  notion_proyecto TEXT,
  idioma TEXT DEFAULT 'es', -- es, en (idioma del invoice generado)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Presupuesto fijos
CREATE TABLE presupuesto_fijos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  limite DECIMAL(10,2) DEFAULT 0,
  gastado DECIMAL(10,2) DEFAULT 0,
  mes TEXT NOT NULL -- formato: '2026-09'
);

-- Presupuesto variables
CREATE TABLE presupuesto_variables (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  limite DECIMAL(10,2) DEFAULT 0,
  gastado DECIMAL(10,2) DEFAULT 0,
  mes TEXT NOT NULL
);

-- Configuracion
CREATE TABLE configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

-- Trigger: cuando factura se marca cobrada, suma al saldo de la cuenta
CREATE OR REPLACE FUNCTION sumar_factura_cobrada()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'cobrada' AND OLD.estado = 'pendiente' THEN
    IF NEW.cuenta_destino_id IS NOT NULL THEN
      UPDATE cuentas
      SET saldo = saldo + NEW.importe
      WHERE id = NEW.cuenta_destino_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_factura_cobrada
  AFTER UPDATE ON facturas
  FOR EACH ROW
  EXECUTE FUNCTION sumar_factura_cobrada();

-- Datos iniciales
INSERT INTO cuentas (nombre, saldo, color, tipo, orden) VALUES
  ('BBVA Gastos', 646, '#60a5fa', 'operativa', 1),
  ('BBVA Ahorros', 5880, '#4ade80', 'ahorro', 2),
  ('BBVA IRPF', 1400, '#fbbf24', 'irpf', 3),
  ('BBVA SS', 300, '#f87171', 'ss', 4),
  ('Wise', 9143, '#a78bfa', 'ahorro', 5),
  ('Cash', 645, '#888888', 'cash', 6),
  ('Argentina', 200, '#555555', 'otro', 7);

INSERT INTO crypto (symbol, nombre, cantidad) VALUES
  ('ETH', 'Ethereum', 3.5);

INSERT INTO configuracion (clave, valor) VALUES
  ('mes_actual', '2026-09'),
  ('presupuesto_total', '1800'),
  ('eth_price', '2100');

INSERT INTO presupuesto_fijos (nombre, limite, gastado, mes) VALUES
  ('Alquiler', 650, 650, '2026-09'),
  ('Agua', 76, 76.87, '2026-09'),
  ('Luz', 100, 0, '2026-09'),
  ('Cuota autónomo', 300, 0, '2026-09'),
  ('Gestor', 50, 0, '2026-09'),
  ('Gym', 50, 32.90, '2026-09'),
  ('Suscripciones', 75, 58.94, '2026-09');

INSERT INTO presupuesto_variables (nombre, limite, gastado, mes) VALUES
  ('Supermercado', 200, 107.92, '2026-09'),
  ('Ocio / Bares / Salidas', 120, 99.69, '2026-09'),
  ('Transporte', 30, 40.79, '2026-09'),
  ('Ropa', 50, 69.60, '2026-09'),
  ('Farmacia / Personal', 40, 0, '2026-09'),
  ('Imprevistos / Amazon', 50, 33.95, '2026-09');

INSERT INTO facturas (cliente, descripcion, importe, fecha, estado) VALUES
  ('Ambushed', '', 836, '2026-09-15', 'pendiente'),
  ('Ambushed', '', 330, '2026-09-15', 'pendiente'),
  ('Ambushed', '', 198, '2026-09-20', 'pendiente'),
  ('Ambushed', '', 550, '2026-09-20', 'pendiente'),
  ('Ambushed', '', 671, '2026-09-25', 'pendiente'),
  ('Ambushed', '', 1100, '2026-09-30', 'pendiente'),
  ('Ambushed', '', 407, '2026-10-05', 'pendiente'),
  ('Ambushed', '', 231, '2026-10-05', 'pendiente'),
  ('Hans Emanuel', '', 400, '2026-09-30', 'pendiente'),
  ('Hans Emanuel', '', 400, '2026-10-10', 'pendiente'),
  ('BoldMove', '', 473, '2026-09-30', 'pendiente');

-- MIGRACIÓN: si tu base ya existía antes de la integración con Notion,
-- ejecutá esto en el SQL Editor de Supabase (no rompe nada, es seguro re-ejecutar):
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS idioma TEXT DEFAULT 'es';

INSERT INTO configuracion (clave, valor) VALUES
  ('emisor_nombre', 'Joel Schneider'),
  ('emisor_email', '')
ON CONFLICT (clave) DO NOTHING;

-- MIGRACIÓN: Timesheet integrado (reemplaza la sync con Notion)
-- Ejecutá todo este bloque en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS proyectos (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'ambushed_boldmove' | 'propio'
  cliente TEXT NOT NULL,
  status TEXT DEFAULT 'activo', -- activo, completado, facturado
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dias_trabajados (
  id SERIAL PRIMARY KEY,
  proyecto_id INT REFERENCES proyectos(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  rate DECIMAL(10,2) NOT NULL DEFAULT 0,
  hrs DECIMAL(5,2), -- horas trabajadas; NULL = día completo (rate x día, clientes propios)
  standby_hrs DECIMAL(5,2) DEFAULT 0,
  status TEXT DEFAULT 'pendiente', -- pendiente, en_progreso, hecho
  total_day DECIMAL(10,2) GENERATED ALWAYS AS (COALESCE(hrs, 1) * rate) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS proyecto_id INT REFERENCES proyectos(id);

-- Trigger: cuando un proyecto pasa a status='facturado', crea la factura sola
CREATE OR REPLACE FUNCTION crear_factura_desde_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  monto DECIMAL(10,2);
BEGIN
  IF NEW.status = 'facturado' AND (OLD.status IS DISTINCT FROM 'facturado') THEN
    SELECT COALESCE(SUM(total_day), 0) INTO monto FROM dias_trabajados WHERE proyecto_id = NEW.id;
    IF NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = NEW.id) THEN
      INSERT INTO facturas (cliente, descripcion, importe, fecha, estado, origen, proyecto_id)
      VALUES (NEW.cliente, NEW.nombre, monto, CURRENT_DATE, 'pendiente', 'timesheet', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_proyecto_facturado ON proyectos;
CREATE TRIGGER trigger_proyecto_facturado
  AFTER UPDATE ON proyectos
  FOR EACH ROW
  EXECUTE FUNCTION crear_factura_desde_proyecto();

-- Token secreto para el link público de Timesheet (Ambushed/BoldMove). Guardalo,
-- lo vas a necesitar para armar la URL: /timesheet/<este-valor>
INSERT INTO configuracion (clave, valor)
  SELECT 'timesheet_public_token', gen_random_uuid()::text
  WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'timesheet_public_token');

ALTER TABLE proyectos DISABLE ROW LEVEL SECURITY;
ALTER TABLE dias_trabajados DISABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: Generador de facturas fiscales
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS concepto_detalle TEXT;

INSERT INTO configuracion (clave, valor) VALUES
  ('emisor_nif', '15464978P'),
  ('emisor_direccion', E'Carrer del Alcalde Reig, 6\nValencia (46006), Valencia, España'),
  ('emisor_telefono', '651561230')
ON CONFLICT (clave) DO NOTHING;

CREATE TABLE IF NOT EXISTS clientes_fiscales (
  cliente TEXT PRIMARY KEY,
  identificador TEXT,
  direccion TEXT
);

INSERT INTO clientes_fiscales (cliente, identificador, direccion) VALUES
  ('Ambushed', '12810068 · VAT 12810068 · 07752660689', E'The Long Lodge 265-269 Kingston Road\nWimbledon')
ON CONFLICT (cliente) DO NOTHING;

ALTER TABLE clientes_fiscales DISABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: Nº de proyecto (se usa también como Nº de factura)
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS numero_proyecto TEXT;

CREATE OR REPLACE FUNCTION crear_factura_desde_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  monto DECIMAL(10,2);
BEGIN
  IF NEW.status = 'facturado' AND (OLD.status IS DISTINCT FROM 'facturado') THEN
    SELECT COALESCE(SUM(total_day), 0) INTO monto FROM dias_trabajados WHERE proyecto_id = NEW.id;
    IF NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = NEW.id) THEN
      INSERT INTO facturas (cliente, descripcion, importe, fecha, estado, origen, proyecto_id, numero)
      VALUES (NEW.cliente, NEW.nombre, monto, CURRENT_DATE, 'pendiente', 'timesheet', NEW.id, NEW.numero_proyecto);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) - desactivado para uso personal
ALTER TABLE cuentas DISABLE ROW LEVEL SECURITY;
ALTER TABLE crypto DISABLE ROW LEVEL SECURITY;
ALTER TABLE facturas DISABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_fijos DISABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_variables DISABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion DISABLE ROW LEVEL SECURITY;
