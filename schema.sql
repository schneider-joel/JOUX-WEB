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

-- Row Level Security (RLS) - desactivado para uso personal
ALTER TABLE cuentas DISABLE ROW LEVEL SECURITY;
ALTER TABLE crypto DISABLE ROW LEVEL SECURITY;
ALTER TABLE facturas DISABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_fijos DISABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_variables DISABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion DISABLE ROW LEVEL SECURITY;
