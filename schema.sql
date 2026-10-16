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

-- MIGRACIÓN: Nº de proyecto (número de referencia para el cliente, ej. "268")
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS numero_proyecto TEXT;

-- MIGRACIÓN: número de referencia en la factura (distinto del Nº oficial para Hacienda)
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS numero_referencia TEXT;

-- MIGRACIÓN: fix cálculo de Stand By — se paga a mitad de rate, no gratis
ALTER TABLE dias_trabajados DROP COLUMN total_day;
ALTER TABLE dias_trabajados ADD COLUMN total_day DECIMAL(10,2)
  GENERATED ALWAYS AS (COALESCE(hrs, 1) * rate + COALESCE(standby_hrs, 0) * rate / 2) STORED;

CREATE OR REPLACE FUNCTION crear_factura_desde_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  monto DECIMAL(10,2);
BEGIN
  IF NEW.status = 'facturado' AND (OLD.status IS DISTINCT FROM 'facturado') THEN
    SELECT COALESCE(SUM(total_day), 0) INTO monto FROM dias_trabajados WHERE proyecto_id = NEW.id;
    IF NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = NEW.id) THEN
      INSERT INTO facturas (cliente, descripcion, importe, fecha, estado, origen, proyecto_id, numero_referencia)
      VALUES (NEW.cliente, NEW.nombre, monto, CURRENT_DATE, 'pendiente', 'timesheet', NEW.id, NEW.numero_proyecto);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- MIGRACIÓN: numeración correlativa de facturas (misma secuencia que Holded, F26XXXX)
INSERT INTO configuracion (clave, valor) VALUES ('ultimo_numero_factura', 'F260020')
ON CONFLICT (clave) DO NOTHING;

-- MIGRACIÓN: asignar el Nº de factura automáticamente al marcar Facturado
-- (comparte una sola secuencia entre Ambushed/BoldMove y clientes propios, igual que en Holded)
CREATE OR REPLACE FUNCTION siguiente_numero_factura() RETURNS TEXT AS $$
DECLARE
  actual TEXT;
  prefijo TEXT;
  digitos TEXT;
  siguiente TEXT;
BEGIN
  SELECT valor INTO actual FROM configuracion WHERE clave = 'ultimo_numero_factura';
  IF actual IS NULL THEN
    RETURN NULL;
  END IF;
  digitos := substring(actual FROM '\d+$');
  prefijo := regexp_replace(actual, '\d+$', '');
  siguiente := prefijo || lpad((digitos::INT + 1)::TEXT, length(digitos), '0');
  UPDATE configuracion SET valor = siguiente WHERE clave = 'ultimo_numero_factura';
  RETURN siguiente;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION crear_factura_desde_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  monto DECIMAL(10,2);
  fecha_emision DATE;
BEGIN
  IF NEW.status = 'facturado' AND (OLD.status IS DISTINCT FROM 'facturado') THEN
    SELECT COALESCE(SUM(total_day), 0), MAX(fecha) INTO monto, fecha_emision FROM dias_trabajados WHERE proyecto_id = NEW.id;
    IF fecha_emision IS NULL THEN fecha_emision := CURRENT_DATE; END IF;
    IF NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = NEW.id) THEN
      INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id, numero_referencia, numero)
      VALUES (NEW.cliente, NEW.nombre, monto, fecha_emision, fecha_emision + 30, 'pendiente', 'timesheet', NEW.id, NEW.numero_proyecto, siguiente_numero_factura());
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

-- MIGRACIÓN: tipo de factura (dentro/fuera de la UE) con IVA/Retención
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS tipo_factura TEXT DEFAULT 'fuera_ue';

INSERT INTO configuracion (clave, valor) VALUES
  ('emisor_iban', 'ES67 0182 5322 2702 0400 4921')
ON CONFLICT (clave) DO NOTHING;

-- MIGRACIÓN: multi-moneda en cuentas + reestructuración de cuentas reales
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'EUR';

-- MIGRACIÓN: snapshots diarios del patrimonio (para el gráfico de evolución)
-- La app guarda un punto por día automáticamente al abrir el dashboard.
CREATE TABLE IF NOT EXISTS patrimonio_snapshots (
  fecha DATE PRIMARY KEY,
  total DECIMAL(12,2) NOT NULL,
  liquidez DECIMAL(12,2) NOT NULL DEFAULT 0,
  crypto DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE patrimonio_snapshots DISABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: si un proyecto Facturado vuelve a Activo/Completado, borrar la
-- factura pendiente que se había generado (nunca se envió) para que el
-- proyecto desaparezca de "Por cobrar" y no se pueda descargar el invoice.
-- Si ya fue cobrada, no se toca. Al volver a marcarlo Facturado, se genera
-- una factura nueva con el importe/fecha actualizados y el siguiente Nº libre.
CREATE OR REPLACE FUNCTION crear_factura_desde_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  monto DECIMAL(10,2);
  fecha_emision DATE;
BEGIN
  IF NEW.status = 'facturado' AND (OLD.status IS DISTINCT FROM 'facturado') THEN
    SELECT COALESCE(SUM(total_day), 0), MAX(fecha) INTO monto, fecha_emision FROM dias_trabajados WHERE proyecto_id = NEW.id;
    IF fecha_emision IS NULL THEN fecha_emision := CURRENT_DATE; END IF;
    IF NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = NEW.id) THEN
      INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id, numero_referencia, numero)
      VALUES (NEW.cliente, NEW.nombre, monto, fecha_emision, fecha_emision + 30, 'pendiente', 'timesheet', NEW.id, NEW.numero_proyecto, siguiente_numero_factura());
    END IF;
  ELSIF OLD.status = 'facturado' AND NEW.status IS DISTINCT FROM 'facturado' THEN
    DELETE FROM facturas WHERE proyecto_id = NEW.id AND estado = 'pendiente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- MIGRACIÓN: sincronización con Holded (se empuja cada factura como
-- presupuesto para revisar/aprobar allá; holded_estimate_id guarda el id
-- del presupuesto ya creado para no duplicarlo si se sincroniza de nuevo).
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS holded_estimate_id TEXT;

-- MIGRACIÓN: fix de siguiente_numero_factura() — la versión anterior sacaba
-- el prefijo con regexp_replace(actual, '\d+$', '') y los dígitos con
-- substring(actual FROM '\d+$') por separado; en la práctica, en la base
-- vivía una versión que se comía todo el bloque "2026-" del medio (ej.
-- "F-2026-61" → "F-62" en vez de "F-2026-62"). Ahora se saca todo con un
-- solo regexp_match (prefijo no-goloso + dígitos finales), la misma lógica
-- que ya usa el editor de factura en el frontend (invoice-editor.tsx).
--
-- MIGRACIÓN (siguiente): el contador guardado en `configuracion` no se
-- entera cuando se borra una factura (de prueba, por ejemplo) — solo sube,
-- nunca baja, así que después de borrar una factura de prueba el próximo
-- número seguía saltando por delante como si esa factura siguiera existiendo.
-- Ahora se calcula en vivo: MAX(número existente con el prefijo del año
-- actual) + 1. `configuracion.ultimo_numero_factura` queda solo como
-- registro informativo, ya no es la fuente de verdad.
CREATE OR REPLACE FUNCTION siguiente_numero_factura() RETURNS TEXT AS $$
DECLARE
  prefijo TEXT;
  maximo INT;
  siguiente TEXT;
BEGIN
  prefijo := 'F-' || to_char(CURRENT_DATE, 'YYYY') || '-';
  SELECT COALESCE(MAX((regexp_match(numero, '^' || prefijo || '(\d+)$'))[1]::INT), 0)
    INTO maximo
    FROM facturas
    WHERE numero LIKE prefijo || '%';
  siguiente := prefijo || (maximo + 1)::TEXT;
  UPDATE configuracion SET valor = siguiente WHERE clave = 'ultimo_numero_factura';
  RETURN siguiente;
END;
$$ LANGUAGE plpgsql;

-- MIGRACIÓN: SWIFT/BIC del emisor, para la nota de pago de facturas fuera
-- de la UE (los bancos de fuera de SEPA suelen necesitarlo además del IBAN).
INSERT INTO configuracion (clave, valor) VALUES ('emisor_swift', 'BBVAESMM')
ON CONFLICT (clave) DO NOTHING;

-- MIGRACIÓN: activar RLS en todas las tablas (reemplaza los DISABLE de arriba).
-- El navegador ya no habla con Supabase directo con la key pública: pasa por
-- /api/db (protegido por la contraseña de la app) y el servidor usa la
-- service_role/secret key, que se salta RLS. Con RLS activo y SIN políticas,
-- la key pública queda sin acceso a ninguna fila, cerrando el agujero por el
-- que cualquiera con esa key (extraíble del bundle) podía leer/escribir todo.
ALTER TABLE cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE crypto ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_fijos ENABLE ROW LEVEL SECURITY;
ALTER TABLE presupuesto_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dias_trabajados ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes_fiscales ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: dirección del emisor según la fecha de la factura. Las facturas
-- fechadas antes de emisor_direccion_desde muestran emisor_direccion_anterior
-- (p. ej. las de regularización de 2024-2025, emitidas en Alcalde Reig).
INSERT INTO configuracion (clave, valor) VALUES
  ('emisor_direccion_anterior', E'Carrer del Alcalde Reig, 6\nValencia (46006), Valencia, España'),
  ('emisor_direccion_desde', '2026-04-01')
ON CONFLICT (clave) DO NOTHING;

-- MIGRACIÓN: facturas de compra (gastos). El archivo va al bucket privado
-- de Storage "compras" (lo sube /api/compras con la secret key); acá queda
-- la ruta. Total = base * (1 + iva_pct/100). deducible_pct = % de uso
-- profesional, para la estimación de IRPF (130) e IVA (303).
CREATE TABLE IF NOT EXISTS compras (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  proveedor TEXT NOT NULL,
  concepto TEXT,
  base DECIMAL(10,2) NOT NULL,
  iva_pct DECIMAL(5,2) NOT NULL DEFAULT 21,
  deducible_pct DECIMAL(5,2) NOT NULL DEFAULT 100,
  archivo_path TEXT,
  archivo_nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: facturas históricas y registros no fiscales.
-- archivo_path: PDF original (bucket privado "facturas") de facturas ya
-- declaradas antes de emitir desde JOUX Hub (Holded 2024-2026 T1, carpeta
-- declarada T2 2026). fiscal = false marca los registros de timesheet de
-- períodos ya declarados, que no coinciden con la factura real: se conservan
-- para los proyectos pero no cuentan para impuestos ni para la lista.
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS archivo_path TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS archivo_nombre TEXT;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS fiscal BOOLEAN NOT NULL DEFAULT TRUE;

-- MIGRACIÓN: tercer tipo de timesheet, "tays_hans" (Tays Perez / Hans
-- Emanuel, pareja; ella consigue proyectos con otros directores). Mismo
-- patrón que "ambushed_boldmove" pero con rate por día (hrs = NULL), como
-- "propio", y su propio link público de solo lectura en /th/<token>.
INSERT INTO configuracion (clave, valor)
  SELECT 'timesheet_th_public_token', gen_random_uuid()::text
  WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'timesheet_th_public_token');

-- MIGRACIÓN: timesheets por cliente. Cada cliente tiene su propio timesheet
-- (pestaña + link público /t/<token>, guardado en configuracion como
-- "timesheet_token:<cliente>"); solo Ambushed+BoldMove y Hans Emanuel+Tays
-- Perez comparten uno (ver src/lib/timesheets.ts). proyectos.tipo queda como
-- columna legacy: la agrupación es por cliente y el rate se elige por proyecto.
-- modo_rate: 'hora' (hrs × rate + stand by) | 'dia' (rate fijo por día, hrs = NULL).
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS modo_rate TEXT NOT NULL DEFAULT 'dia';
UPDATE proyectos SET modo_rate = 'hora' WHERE tipo = 'ambushed_boldmove';

-- MIGRACIÓN: país fiscal del cliente → formato de la factura. 'ES' = España
-- (IVA 21% + retención 15%, tipo_factura 'dentro_ue'); 'UE' y 'EXT' van sin
-- IVA ni retención ('fuera_ue'). La app lo sugiere por dirección/NIF
-- (src/lib/clientes.ts) y la factura de un proyecto lo toma al facturarse.
ALTER TABLE clientes_fiscales ADD COLUMN IF NOT EXISTS pais TEXT;
UPDATE clientes_fiscales SET pais = 'ES' WHERE cliente IN ('Cpworks Barcelona', 'Jaleo Creative Makers', 'Tays Perez') AND pais IS NULL;
UPDATE clientes_fiscales SET pais = 'EXT' WHERE cliente IN ('Ambushed', 'BoldMove', 'Hans Emanuel') AND pais IS NULL;

CREATE OR REPLACE FUNCTION crear_factura_desde_proyecto()
RETURNS TRIGGER AS $$
DECLARE
  monto DECIMAL(10,2);
  fecha_emision DATE;
  tipo TEXT;
BEGIN
  IF NEW.status = 'facturado' AND (OLD.status IS DISTINCT FROM 'facturado') THEN
    SELECT COALESCE(SUM(total_day), 0), MAX(fecha) INTO monto, fecha_emision FROM dias_trabajados WHERE proyecto_id = NEW.id;
    IF fecha_emision IS NULL THEN fecha_emision := CURRENT_DATE; END IF;
    SELECT CASE WHEN pais = 'ES' THEN 'dentro_ue' ELSE 'fuera_ue' END INTO tipo FROM clientes_fiscales WHERE cliente = NEW.cliente;
    IF NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = NEW.id) THEN
      INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id, numero_referencia, numero, tipo_factura)
      VALUES (NEW.cliente, NEW.nombre, monto, fecha_emision, fecha_emision + 30, 'pendiente', 'timesheet', NEW.id, NEW.numero_proyecto, siguiente_numero_factura(), COALESCE(tipo, 'fuera_ue'));
    END IF;
  ELSIF OLD.status = 'facturado' AND NEW.status IS DISTINCT FROM 'facturado' THEN
    DELETE FROM facturas WHERE proyecto_id = NEW.id AND estado = 'pendiente';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- MIGRACIÓN: apartados y rentabilidad de cuentas. padre_id = apartado dentro
-- de otra cuenta (BBVA · Ahorros / IRPF; el saldo de la cuenta padre es solo el
-- disponible). tipo define qué muestra el overview: operativa (cubre los fijos
-- del presupuesto), ahorro, irpf (cubre el próximo pago 130+303), inversion
-- (rentabilidad_anual %), variable (asignación de gastos variables), cash, otro.
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS padre_id INT REFERENCES cuentas(id) ON DELETE CASCADE;
ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS rentabilidad_anual DECIMAL(5,2);

-- MIGRACIÓN: bancos conectados por open banking (Enable Banking, solo lectura).
-- bancos_sesiones = permiso por banco (vence a los ≤180 días); bancos_cuentas =
-- cuentas que devuelve cada permiso, con la cuenta del hub que actualizan
-- (cuenta_id) y qué saldo usar (tipo_saldo: ITAV disponible, CLBD contable...);
-- movimientos = transacciones contabilizadas (importe con signo), con
-- factura_id cuando se concilian con una factura. Sync: src/lib/bancos-sync.ts.
CREATE TABLE IF NOT EXISTS bancos_sesiones (
  session_id TEXT PRIMARY KEY,
  aspsp TEXT NOT NULL,
  pais TEXT NOT NULL DEFAULT 'ES',
  valid_until TIMESTAMPTZ,
  ultimo_sync TIMESTAMPTZ,
  ultimo_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS bancos_cuentas (
  uid TEXT PRIMARY KEY,
  session_id TEXT REFERENCES bancos_sesiones(session_id) ON DELETE CASCADE,
  aspsp TEXT,
  nombre TEXT,
  iban TEXT,
  moneda TEXT,
  cuenta_id INT REFERENCES cuentas(id) ON DELETE SET NULL,
  tipo_saldo TEXT,
  saldos JSONB,
  actualizado TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS movimientos (
  id TEXT PRIMARY KEY,
  cuenta_uid TEXT REFERENCES bancos_cuentas(uid) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  importe DECIMAL(12,2) NOT NULL,
  moneda TEXT,
  contraparte TEXT,
  concepto TEXT,
  estado TEXT,
  factura_id INT REFERENCES facturas(id) ON DELETE SET NULL,
  raw JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS movimientos_fecha_idx ON movimientos (fecha DESC);
ALTER TABLE bancos_sesiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE bancos_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: clasificación y conciliación de movimientos bancarios
-- (src/lib/movimientos.ts y src/lib/conciliar.ts, corre tras cada sync).
-- clase: cobro | ingreso | interno | personal | gasto; categoria = partida del
-- presupuesto; trabajo = gasto de la actividad (debe tener factura en
-- Compras: compra_id); manual = clasificado a mano, las reglas no lo pisan;
-- sin_factura_ok = descartado del aviso de "falta la factura".
-- facturas.movimiento_id = el cobro del banco que la pagó (varias facturas
-- pueden apuntar al mismo movimiento). reglas_movimientos = reglas del
-- usuario (texto contenido → clase/categoría/trabajo), van antes que las
-- reglas por defecto.
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS clase TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS categoria TEXT;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS trabajo BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS compra_id BIGINT REFERENCES compras(id) ON DELETE SET NULL;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS sin_factura_ok BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS movimiento_id TEXT REFERENCES movimientos(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS reglas_movimientos (
  id SERIAL PRIMARY KEY,
  patron TEXT NOT NULL,
  clase TEXT,
  categoria TEXT,
  trabajo BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reglas_movimientos ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: gastos compartidos con la pareja (tipo Tricount). La pareja
-- entra por /c/<compartidos_token> (sin acceso al hub). tipo gasto|liquidacion;
-- reparto mitad|otro (le corresponde entero a quien no pagó). Los pagos de
-- Joel en compartidos_categorias y las transferencias de clase 'reembolso'
-- se añaden solos desde el banco (movimiento_id; anulado en vez de borrar).
CREATE TABLE IF NOT EXISTS gastos_compartidos (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'gasto',
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL,
  importe DECIMAL(10,2) NOT NULL CHECK (importe > 0),
  pagador TEXT NOT NULL CHECK (pagador IN ('joel', 'pareja')),
  reparto TEXT NOT NULL DEFAULT 'mitad' CHECK (reparto IN ('mitad', 'otro')),
  categoria TEXT,
  movimiento_id TEXT UNIQUE REFERENCES movimientos(id) ON DELETE SET NULL,
  anulado BOOLEAN NOT NULL DEFAULT FALSE,
  creado_por TEXT NOT NULL DEFAULT 'joel',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gastos_compartidos_fecha_idx ON gastos_compartidos (fecha DESC);
ALTER TABLE gastos_compartidos ENABLE ROW LEVEL SECURITY;
INSERT INTO configuracion (clave, valor) SELECT 'compartidos_token', gen_random_uuid()::text WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'compartidos_token');
INSERT INTO configuracion (clave, valor) SELECT 'compartidos_pareja', 'Sofía' WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'compartidos_pareja');
INSERT INTO configuracion (clave, valor) SELECT 'compartidos_desde', '2026-10-01' WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'compartidos_desde');
INSERT INTO configuracion (clave, valor) SELECT 'compartidos_categorias', 'Alquiler,Agua' WHERE NOT EXISTS (SELECT 1 FROM configuracion WHERE clave = 'compartidos_categorias');

-- 2026-10-07: el trigger de factura cobrada no suma en cuentas sincronizadas
-- con el banco (su saldo ya incluye el cobro; antes se contaba dos veces).
CREATE OR REPLACE FUNCTION public.sumar_factura_cobrada()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.estado = 'cobrada' AND OLD.estado = 'pendiente' THEN
    IF NEW.cuenta_destino_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM bancos_cuentas WHERE cuenta_id = NEW.cuenta_destino_id) THEN
      UPDATE cuentas
      SET saldo = saldo + NEW.importe
      WHERE id = NEW.cuenta_destino_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2026-10-08: suscripciones de notificaciones push (un registro por dispositivo).
create table if not exists push_suscripciones (
  id bigserial primary key,
  endpoint text unique not null,
  keys jsonb not null,
  dispositivo text,
  created_at timestamptz default now()
);
alter table push_suscripciones enable row level security;

-- 2026-10-08: historial de notificaciones de la campana del hub.
create table if not exists notificaciones (
  id bigserial primary key,
  titulo text not null,
  cuerpo text,
  url text,
  leida boolean not null default false,
  created_at timestamptz default now()
);
alter table notificaciones enable row level security;

-- MIGRACIÓN: marcas y agencias (2026-10-12, solo aditiva: tabla nueva, columnas nuevas que admiten vacío, función nueva).
-- Una agencia nueva = una fila en marcas con modo 'cerrado'. No toca crear_factura_desde_proyecto.
-- Agencia = proyecto de precio cerrado con dos pagos (50 % al empezar, 50 % al publicar); cada pago es
-- una factura propia creada con crear_factura_pago(proyecto, 1|2).
CREATE TABLE IF NOT EXISTS marcas (
  key TEXT PRIMARY KEY CHECK (key ~ '^[a-z0-9-]+$'),
  nombre TEXT NOT NULL,
  modo TEXT NOT NULL CHECK (modo IN ('cerrado', 'dia', 'hora')),
  dominio TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE marcas ENABLE ROW LEVEL SECURITY;
INSERT INTO marcas (key, nombre, modo, dominio) VALUES
  ('arkevo', 'Arkevo', 'cerrado', 'arkevostudio.com'),
  ('joel', 'Joel Schneider', 'dia', 'joelschneider.io'),
  ('ab', 'Ambushed / BoldMove', 'hora', NULL)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS marca TEXT REFERENCES marcas(key);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS web TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS plan TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS precio_cerrado NUMERIC(10,2);
-- Un proyecto de precio cerrado nunca pasa a 'facturado': al salir de ese estado, el trigger
-- crear_factura_desde_proyecto borraría sus facturas pendientes.
ALTER TABLE proyectos ADD CONSTRAINT proyectos_cerrado_sin_facturado
  CHECK (precio_cerrado IS NULL OR status IS DISTINCT FROM 'facturado');

ALTER TABLE facturas ADD COLUMN IF NOT EXISTS marca TEXT REFERENCES marcas(key);
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS pago SMALLINT CHECK (pago IN (1, 2));
CREATE UNIQUE INDEX IF NOT EXISTS facturas_pago_unico ON facturas (proyecto_id, pago) WHERE pago IS NOT NULL;

CREATE OR REPLACE FUNCTION crear_factura_pago(p_proyecto INT, p_pago SMALLINT)
RETURNS facturas LANGUAGE plpgsql AS $$
DECLARE pr proyectos; m marcas; v_pais TEXT; v_base NUMERIC(10,2); f facturas;
BEGIN
  IF p_pago NOT IN (1, 2) THEN RAISE EXCEPTION 'El pago tiene que ser 1 o 2'; END IF;
  SELECT * INTO pr FROM proyectos WHERE id = p_proyecto FOR UPDATE;
  IF pr.id IS NULL OR pr.precio_cerrado IS NULL THEN RAISE EXCEPTION 'El proyecto % no es de precio cerrado', p_proyecto; END IF;
  SELECT * INTO m FROM marcas WHERE key = pr.marca;
  IF m.modo IS DISTINCT FROM 'cerrado' THEN RAISE EXCEPTION 'La marca % no es una agencia', pr.marca; END IF;
  IF p_pago = 2 AND NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = pr.id AND pago = 1) THEN
    RAISE EXCEPTION 'Primero hay que facturar el pago 1'; END IF;
  SELECT pais INTO v_pais FROM clientes_fiscales WHERE cliente = pr.cliente;
  IF NOT FOUND OR v_pais IS NULL THEN RAISE EXCEPTION 'Faltan los datos fiscales de %', pr.cliente; END IF;
  -- Sin alta en el ROI no se factura sin IVA a la UE: se habla antes con el gestor.
  IF v_pais = 'UE' THEN RAISE EXCEPTION 'Cliente de la UE: sin alta en el ROI, consúltalo con el gestor antes de facturar'; END IF;
  -- Si el precio tiene céntimos impares, el segundo pago se lleva el resto.
  v_base := CASE WHEN p_pago = 1 THEN round(pr.precio_cerrado / 2, 2) ELSE pr.precio_cerrado - round(pr.precio_cerrado / 2, 2) END;
  INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id,
                        numero, tipo_factura, idioma, marca, pago)
  VALUES (pr.cliente,
          concat_ws(' · ', m.nombre, 'Web ' || coalesce(pr.plan, '') || coalesce(' (' || pr.web || ')', ''),
                    CASE p_pago WHEN 1 THEN '50 % al empezar' ELSE '50 % al publicar' END),
          v_base, CURRENT_DATE, CURRENT_DATE + 30, 'pendiente', 'manual', pr.id,
          siguiente_numero_factura(),
          CASE WHEN v_pais = 'ES' THEN 'dentro_ue' ELSE 'fuera_ue' END,
          CASE WHEN v_pais = 'ES' THEN 'es' ELSE 'en' END,
          m.key, p_pago)
  RETURNING * INTO f;
  RETURN f;
END $$;
REVOKE EXECUTE ON FUNCTION crear_factura_pago(INT, SMALLINT) FROM PUBLIC, anon, authenticated;

-- DATOS: marca de lo que ya existía (2026-10-12, aplicado por Joel en el SQL Editor). Framer queda sin marca.
UPDATE facturas SET marca = 'ab' WHERE marca IS NULL AND cliente IN ('Ambushed', 'BoldMove');
UPDATE facturas SET marca = 'joel' WHERE marca IS NULL AND cliente IN ('Hans Emanuel', 'Hans Emanuel Productions', 'Tays Perez', 'Cpworks Barcelona', 'Jaleo Creative Makers');
UPDATE proyectos SET marca = 'ab' WHERE marca IS NULL AND cliente IN ('Ambushed', 'BoldMove');
UPDATE proyectos SET marca = 'joel' WHERE marca IS NULL AND cliente IN ('Hans Emanuel', 'Tays Perez', 'Cpworks Barcelona');

-- MIGRACIÓN + DATOS: marcas definitivas (2026-10-12, aplicado por Joel en el SQL Editor).
-- Treatments: ab (Ambushed/BoldMove, a mi nombre) y pitchlab (The Pitch Lab: Hans, Tays y nuevos).
-- Webs de precio cerrado 50/50: custom (Custom Websites, joelschneider.io) y arkevo (y futuras agencias).
-- 'joel' desaparece. Todas las facturas se emiten como Joel Schneider Mena · joel@joelschneider.io.
ALTER TABLE marcas ADD COLUMN IF NOT EXISTS orden INT;
INSERT INTO marcas (key, nombre, modo, dominio, orden) VALUES
  ('pitchlab', 'The Pitch Lab', 'dia', 'thepitchlab.xyz', 2),
  ('custom', 'Custom Websites', 'cerrado', 'joelschneider.io', 3)
ON CONFLICT (key) DO NOTHING;
UPDATE marcas SET orden = 1 WHERE key = 'ab';
UPDATE marcas SET orden = 4 WHERE key = 'arkevo';
UPDATE facturas  SET marca = 'pitchlab' WHERE marca = 'joel' AND cliente IN ('Hans Emanuel', 'Tays Perez');
UPDATE facturas  SET marca = 'custom'   WHERE marca = 'joel';
UPDATE proyectos SET marca = 'pitchlab' WHERE marca = 'joel' AND cliente IN ('Hans Emanuel', 'Tays Perez');
UPDATE proyectos SET marca = 'custom'   WHERE marca = 'joel';
DELETE FROM marcas WHERE key = 'joel';
UPDATE configuracion SET valor = 'Joel Schneider Mena'   WHERE clave = 'emisor_nombre';
UPDATE configuracion SET valor = 'joel@joelschneider.io' WHERE clave = 'emisor_email';

-- crear_factura_pago: concepto sin espacios dobles cuando la web no tiene plan (versión vigente).
CREATE OR REPLACE FUNCTION crear_factura_pago(p_proyecto INT, p_pago SMALLINT)
RETURNS facturas LANGUAGE plpgsql AS $$
DECLARE pr proyectos; m marcas; v_pais TEXT; v_base NUMERIC(10,2); f facturas;
BEGIN
  IF p_pago NOT IN (1, 2) THEN RAISE EXCEPTION 'El pago tiene que ser 1 o 2'; END IF;
  SELECT * INTO pr FROM proyectos WHERE id = p_proyecto FOR UPDATE;
  IF pr.id IS NULL OR pr.precio_cerrado IS NULL THEN RAISE EXCEPTION 'El proyecto % no es de precio cerrado', p_proyecto; END IF;
  SELECT * INTO m FROM marcas WHERE key = pr.marca;
  IF m.modo IS DISTINCT FROM 'cerrado' THEN RAISE EXCEPTION 'La marca % no es de precio cerrado', pr.marca; END IF;
  IF p_pago = 2 AND NOT EXISTS (SELECT 1 FROM facturas WHERE proyecto_id = pr.id AND pago = 1) THEN
    RAISE EXCEPTION 'Primero hay que facturar el pago 1'; END IF;
  SELECT pais INTO v_pais FROM clientes_fiscales WHERE cliente = pr.cliente;
  IF NOT FOUND OR v_pais IS NULL THEN RAISE EXCEPTION 'Faltan los datos fiscales de %', pr.cliente; END IF;
  IF v_pais = 'UE' THEN RAISE EXCEPTION 'Cliente de la UE: sin alta en el ROI, consúltalo con el gestor antes de facturar'; END IF;
  v_base := CASE WHEN p_pago = 1 THEN round(pr.precio_cerrado / 2, 2) ELSE pr.precio_cerrado - round(pr.precio_cerrado / 2, 2) END;
  INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id,
                        numero, tipo_factura, idioma, marca, pago)
  VALUES (pr.cliente,
          concat_ws(' · ', m.nombre, concat_ws(' ', 'Web', nullif(pr.plan, ''), '(' || pr.web || ')'),
                    CASE p_pago WHEN 1 THEN '50 % al empezar' ELSE '50 % al publicar' END),
          v_base, CURRENT_DATE, CURRENT_DATE + 30, 'pendiente', 'manual', pr.id,
          siguiente_numero_factura(),
          CASE WHEN v_pais = 'ES' THEN 'dentro_ue' ELSE 'fuera_ue' END,
          CASE WHEN v_pais = 'ES' THEN 'es' ELSE 'en' END,
          m.key, p_pago)
  RETURNING * INTO f;
  RETURN f;
END $$;
REVOKE EXECUTE ON FUNCTION crear_factura_pago(INT, SMALLINT) FROM PUBLIC, anon, authenticated;

-- MIGRACIÓN: automatización, fase 1 (2026-10-15, solo aditiva): leads y eventos. Ver ../automatizacion.md.
-- El resto del esquema del documento (mensajes, revisiones, plantillas, columnas de proyectos) llega en fases siguientes.

-- 1. Leads de todas las marcas.
CREATE TABLE IF NOT EXISTS leads (
  id            BIGSERIAL PRIMARY KEY,
  marca         TEXT NOT NULL REFERENCES marcas(key),
  origen        TEXT NOT NULL,              -- p. ej. 'arkevostudio.com/es/planes/estudio'
  id_externo    TEXT,                       -- id en la fuente (clave KV, id de Formspree…) para no duplicar
  estado        TEXT NOT NULL DEFAULT 'nuevo'
                CHECK (estado IN ('nuevo','borrador','respondido','conversacion','propuesta',
                                  'ganado','perdido','spam')),
  nombre        TEXT,
  email         TEXT NOT NULL,
  empresa       TEXT,
  telefono      TEXT,
  pais          TEXT,                       -- ISO-2 si se conoce
  idioma        TEXT NOT NULL DEFAULT 'es' CHECK (idioma IN ('es','en')),
  interes       JSONB NOT NULL DEFAULT '{}',-- {plan, diseno, precio, moneda, project_type, days…}
  mensaje       TEXT,
  campos        JSONB NOT NULL DEFAULT '{}',-- el formulario completo, tal cual llegó
  adjuntos      JSONB NOT NULL DEFAULT '[]',-- [{nombre, url, bytes, caduca}]
  consentimiento BOOLEAN NOT NULL DEFAULT false,
  resumen_ia    TEXT,                       -- 1–2 frases: qué quiere y qué falta saber
  categoria_ia  TEXT,                       -- 'precio','plazos','encargo','spam','otro'…
  proyecto_id   INT REFERENCES proyectos(id),-- al pasar a 'ganado'
  gmail_hilo    TEXT,                       -- threadId de Gmail de la conversación
  ultimo_contacto TIMESTAMPTZ,
  recibido_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_externo_unico ON leads (origen, id_externo) WHERE id_externo IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_estado ON leads (estado, recibido_en DESC);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 3. Línea de tiempo: todo lo que pasa con un lead o un proyecto (también lo que avisan Pitchview y arkevo-revision).
CREATE TABLE IF NOT EXISTS eventos (
  id          BIGSERIAL PRIMARY KEY,
  lead_id     BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  proyecto_id INT REFERENCES proyectos(id),
  tipo        TEXT NOT NULL,                -- 'lead.nuevo', 'lead.estado', 'revision.ronda_abierta'…
  fuente      TEXT NOT NULL,                -- 'joux-hub', 'thepitchlab', 'arkevo', 'pitchview'…
  datos       JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eventos_proyecto ON eventos (proyecto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eventos_lead ON eventos (lead_id, created_at DESC);
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: seguimiento de proyectos (automatización fase 3, 2026-10-15, solo aditiva).
-- `fase` es solo para el seguimiento y no dispara nada; `status` y su trigger siguen igual.
-- La tarifa por día de un treatment ganado no tiene columna: va en el evento `lead.ganado`.
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS fase TEXT
  CHECK (fase IN ('confirmado','material','en_curso','revision','cambios','entregado','cerrado'));
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS lead_id BIGINT REFERENCES leads(id);
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS contacto_email TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS contacto_nombre TEXT;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS idioma TEXT CHECK (idioma IN ('es','en'));
-- Carpeta de Pitchview o slug de arkevo-revision: así los avisos de esos sistemas encuentran su proyecto.
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS ref_entrega TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS proyectos_ref_entrega ON proyectos (ref_entrega) WHERE ref_entrega IS NOT NULL;

-- MIGRACIÓN: mensajes y plantillas (automatización fase 4, 2026-10-16), tal cual el esquema de automatizacion.md.
CREATE TABLE IF NOT EXISTS mensajes (
  id BIGSERIAL PRIMARY KEY,
  lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
  proyecto_id INT REFERENCES proyectos(id),
  direccion TEXT NOT NULL CHECK (direccion IN ('entrante','saliente')),
  estado TEXT NOT NULL CHECK (estado IN ('recibido','borrador','aprobado','enviado','error','descartado')),
  plantilla TEXT,
  generado_por TEXT CHECK (generado_por IN ('ia','plantilla','joel')),
  remitente TEXT, para TEXT NOT NULL, asunto TEXT, cuerpo TEXT NOT NULL,
  canal TEXT CHECK (canal IN ('gmail','resend')),
  id_proveedor TEXT, error TEXT, programado_para TIMESTAMPTZ, enviado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (lead_id IS NOT NULL OR proyecto_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS mensajes_pendientes ON mensajes (estado, programado_para) WHERE estado IN ('borrador','aprobado');
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS plantillas (
  clave TEXT NOT NULL, marca TEXT NOT NULL REFERENCES marcas(key),
  idioma TEXT NOT NULL CHECK (idioma IN ('es','en')),
  remitente TEXT NOT NULL, asunto TEXT NOT NULL, cuerpo TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'resend' CHECK (canal IN ('gmail','resend')),
  auto BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (clave, marca, idioma)
);
ALTER TABLE plantillas ENABLE ROW LEVEL SECURITY;

-- DATOS: emails de las webs (Arkevo y Custom, ES/EN), basados en arkevo/proceso-cliente.md (D–G).
-- Variables: {{nombre}}, {{web}}, {{url}}, {{ronda}}. Una agencia nueva = sus filas aquí.
INSERT INTO plantillas (clave, marca, idioma, remitente, asunto, cuerpo, canal, auto) VALUES
  ('proyecto.bienvenida', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', 'Empezamos con {{web}} · lo que necesito', 'Hola, {{nombre}}:

¡Empezamos! Para no perder tiempo, súbelo todo a esta carpeta: {{url}}

- Logo (SVG o PNG grande) y colores, si los tenéis.
- Los textos, o notas sueltas y los redacto yo.
- Las fotos en buena calidad.
- Datos legales para el aviso legal: titular, NIF, dirección y email.
- El acceso a vuestro dominio, si ya tenéis uno.

El plazo empieza a contar cuando esté todo. Cualquier duda, responde a este correo.

Joel
Arkevo', 'resend', false),
  ('proyecto.bienvenida', 'arkevo', 'en', 'Arkevo <hola@arkevostudio.com>', 'Let''s start {{web}} · what I need', 'Hi {{nombre}},

Let''s get started! Please upload everything to this folder: {{url}}

- Logo (SVG or large PNG) and brand colours, if you have them.
- The copy, or rough notes and I''ll write it.
- High-quality photos.
- Legal details for the legal notice: owner, tax ID, address and email.
- Access to your domain, if you already have one.

The timeline starts once everything is in. Any questions, just reply to this email.

Joel
Arkevo', 'resend', false),
  ('material.recordatorio', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', 'Para seguir con {{web}}', 'Hola, {{nombre}}:

Para cumplir el plazo me falta parte del material. En cuanto lo tenga, sigo: {{url}}

Si os va mejor empezar con menos y añadir el resto después, también se puede.

Joel
Arkevo', 'resend', false),
  ('material.recordatorio', 'arkevo', 'en', 'Arkevo <hola@arkevostudio.com>', 'To keep {{web}} moving', 'Hi {{nombre}},

To stay on schedule I still need some of the material. As soon as I have it, I''ll carry on: {{url}}

If it''s easier to start with less and add the rest later, that works too.

Joel
Arkevo', 'resend', false),
  ('revision.lista', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', '{{web}} · ronda {{ronda}} de revisión', 'Hola, {{nombre}}:

Aquí está la web para revisar: {{url}}
Es privada y no sale en Google.

Mírala en el móvil y en el ordenador y mándame en un solo correo todo lo que quieras cambiar. Esta es la ronda {{ronda}} de 2.

Joel
Arkevo', 'resend', false),
  ('revision.lista', 'arkevo', 'en', 'Arkevo <hola@arkevostudio.com>', '{{web}} · review round {{ronda}}', 'Hi {{nombre}},

Your website is ready to review: {{url}}
It''s private and not indexed by Google.

Have a look on your phone and on a computer, and send me everything you''d like to change in a single email. This is round {{ronda}} of 2.

Joel
Arkevo', 'resend', false),
  ('revision.recordatorio', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', '{{web}} · ¿has podido verla?', 'Hola, {{nombre}}:

Te recuerdo que la ronda {{ronda}} está lista para revisar: {{url}}

En cuanto me mandes los cambios, sigo. Si está todo bien, dímelo y preparo la publicación.

Joel
Arkevo', 'resend', false),
  ('revision.recordatorio', 'arkevo', 'en', 'Arkevo <hola@arkevostudio.com>', '{{web}} · have you had a look?', 'Hi {{nombre}},

Just a reminder that round {{ronda}} is ready to review: {{url}}

As soon as you send me your changes, I''ll carry on. If everything looks good, let me know and I''ll get it ready to publish.

Joel
Arkevo', 'resend', false),
  ('entrega.final', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', 'Vuestra web ya está publicada · {{web}}', 'Hola, {{nombre}}:

¡Ya está! {{url}}

- Para pedir cambios, escribe a hola@arkevostudio.com con lo que necesites.
- La factura del segundo 50 % te llega aparte.

Una cosa más: ¿me escribirías dos o tres frases sobre cómo ha ido? Me ayuda mucho.

Joel
Arkevo', 'resend', false),
  ('entrega.final', 'arkevo', 'en', 'Arkevo <hola@arkevostudio.com>', 'Your website is live · {{web}}', 'Hi {{nombre}},

It''s live! {{url}}

- For any changes, write to hola@arkevostudio.com with what you need.
- The invoice for the second 50% will reach you separately.

One more thing: would you write two or three lines about how it went? It really helps.

Joel
Arkevo', 'resend', false),
  ('proyecto.bienvenida', 'custom', 'es', 'Joel Schneider <hello@joelschneider.io>', 'Empezamos con {{web}} · lo que necesito', 'Hola, {{nombre}}:

¡Empezamos! Para no perder tiempo, súbelo todo a esta carpeta: {{url}}

- Logo (SVG o PNG grande) y colores, si los tenéis.
- Los textos, o notas sueltas y los redacto yo.
- Las fotos en buena calidad.
- Datos legales para el aviso legal: titular, NIF, dirección y email.
- El acceso a vuestro dominio, si ya tenéis uno.

El plazo empieza a contar cuando esté todo. Cualquier duda, responde a este correo.

Joel', 'resend', false),
  ('proyecto.bienvenida', 'custom', 'en', 'Joel Schneider <hello@joelschneider.io>', 'Let''s start {{web}} · what I need', 'Hi {{nombre}},

Let''s get started! Please upload everything to this folder: {{url}}

- Logo (SVG or large PNG) and brand colours, if you have them.
- The copy, or rough notes and I''ll write it.
- High-quality photos.
- Legal details for the legal notice: owner, tax ID, address and email.
- Access to your domain, if you already have one.

The timeline starts once everything is in. Any questions, just reply to this email.

Joel Schneider', 'resend', false),
  ('material.recordatorio', 'custom', 'es', 'Joel Schneider <hello@joelschneider.io>', 'Para seguir con {{web}}', 'Hola, {{nombre}}:

Para cumplir el plazo me falta parte del material. En cuanto lo tenga, sigo: {{url}}

Si os va mejor empezar con menos y añadir el resto después, también se puede.

Joel', 'resend', false),
  ('material.recordatorio', 'custom', 'en', 'Joel Schneider <hello@joelschneider.io>', 'To keep {{web}} moving', 'Hi {{nombre}},

To stay on schedule I still need some of the material. As soon as I have it, I''ll carry on: {{url}}

If it''s easier to start with less and add the rest later, that works too.

Joel Schneider', 'resend', false),
  ('revision.lista', 'custom', 'es', 'Joel Schneider <hello@joelschneider.io>', '{{web}} · ronda {{ronda}} de revisión', 'Hola, {{nombre}}:

Aquí está la web para revisar: {{url}}
Es privada y no sale en Google.

Mírala en el móvil y en el ordenador y mándame en un solo correo todo lo que quieras cambiar. Esta es la ronda {{ronda}} de 2.

Joel', 'resend', false),
  ('revision.lista', 'custom', 'en', 'Joel Schneider <hello@joelschneider.io>', '{{web}} · review round {{ronda}}', 'Hi {{nombre}},

Your website is ready to review: {{url}}
It''s private and not indexed by Google.

Have a look on your phone and on a computer, and send me everything you''d like to change in a single email. This is round {{ronda}} of 2.

Joel Schneider', 'resend', false),
  ('revision.recordatorio', 'custom', 'es', 'Joel Schneider <hello@joelschneider.io>', '{{web}} · ¿has podido verla?', 'Hola, {{nombre}}:

Te recuerdo que la ronda {{ronda}} está lista para revisar: {{url}}

En cuanto me mandes los cambios, sigo. Si está todo bien, dímelo y preparo la publicación.

Joel', 'resend', false),
  ('revision.recordatorio', 'custom', 'en', 'Joel Schneider <hello@joelschneider.io>', '{{web}} · have you had a look?', 'Hi {{nombre}},

Just a reminder that round {{ronda}} is ready to review: {{url}}

As soon as you send me your changes, I''ll carry on. If everything looks good, let me know and I''ll get it ready to publish.

Joel Schneider', 'resend', false),
  ('entrega.final', 'custom', 'es', 'Joel Schneider <hello@joelschneider.io>', 'Vuestra web ya está publicada · {{web}}', 'Hola, {{nombre}}:

¡Ya está! {{url}}

- Para pedir cambios, escribe a hello@joelschneider.io con lo que necesites.
- La factura del segundo 50 % te llega aparte.

Una cosa más: ¿me escribirías dos o tres frases sobre cómo ha ido? Me ayuda mucho.

Joel', 'resend', false),
  ('entrega.final', 'custom', 'en', 'Joel Schneider <hello@joelschneider.io>', 'Your website is live · {{web}}', 'Hi {{nombre}},

It''s live! {{url}}

- For any changes, write to hello@joelschneider.io with what you need.
- The invoice for the second 50% will reach you separately.

One more thing: would you write two or three lines about how it went? It really helps.

Joel Schneider', 'resend', false)
ON CONFLICT (clave, marca, idioma) DO NOTHING;

-- MIGRACIÓN: automatización fase 2 (2026-10-16, solo aditiva). mensajes y plantillas ya existen (fase 4).
-- Cada mensaje de Gmail (o envío de Resend) se guarda una sola vez: el tick se puede repetir sin duplicar.
-- El último historyId leído de Gmail va en configuracion (clave 'gmail_history_id'); lo escribe el tick.
CREATE UNIQUE INDEX IF NOT EXISTS mensajes_proveedor_unico ON mensajes (canal, id_proveedor) WHERE id_proveedor IS NOT NULL;
