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

-- MIGRACIÓN: fase 4, rondas de revisión (2026-10-16, solo aditiva). Las llenan los avisos de
-- arkevo-revision y Pitchview (POST /api/intake/evento). El recordatorio n+1 toca a los 3·(n+1) días.
CREATE TABLE IF NOT EXISTS revisiones (
  id            BIGSERIAL PRIMARY KEY,
  proyecto_id   INT NOT NULL REFERENCES proyectos(id),
  ronda         TEXT NOT NULL,              -- 'R1', 'R2'…
  url           TEXT NOT NULL,              -- enlace del cliente (con su clave)
  estado        TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','comentada','cerrada')),
  comentarios   INT NOT NULL DEFAULT 0,
  abierta_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  comentada_en  TIMESTAMPTZ,
  recordatorios SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (proyecto_id, ronda)
);
ALTER TABLE revisiones ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN: fase 5, autonomía gradual (2026-10-16, solo aditiva). Para medir cuántos borradores salen
-- sin tocar se guarda lo que se generó (IA o plantilla rellenada) y la categoría de la IA; `auto` marca
-- lo que salió sin aprobación. Los interruptores van en configuracion: 'auto_pausa' ('true'/'false'),
-- 'auto_respuestas_ia' ({"arkevo": ["precio"], …}) y 'resumen_diario_fecha' (AAAA-MM-DD); las plantillas,
-- en plantillas.auto. Sin filas = todo apagado.
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS asunto_original TEXT;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS cuerpo_original TEXT;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS categoria_ia TEXT;
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS auto BOOLEAN NOT NULL DEFAULT false;

-- MIGRACIÓN: agente de prueba gratis (2026-10-16, solo aditiva). Las fotos y PDF que mandan los leads
-- al responder van al bucket privado `leads` (<lead_id>/<mensaje_id>/<nombre>) y se apuntan aquí:
-- [{ nombre, ruta, tipo, bytes, en_linea? }]. Un solo `prueba.lista` por lead (el agente puede repetir el aviso).
ALTER TABLE mensajes ADD COLUMN IF NOT EXISTS adjuntos JSONB NOT NULL DEFAULT '[]'::jsonb;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('leads', 'leads', false, 26214400, ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','image/svg+xml','application/pdf'])
ON CONFLICT (id) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS eventos_prueba_lista_unica ON eventos (lead_id) WHERE tipo = 'prueba.lista';
-- Plantilla B de arkevo/proceso-cliente.md («Prueba gratis lista»). Sale por Gmail en el hilo del lead
-- (el remitente real lo pone remitentes.ts); nunca sola: auto = false.
INSERT INTO plantillas (clave, marca, idioma, remitente, asunto, cuerpo, canal, auto) VALUES
  ('prueba.lista', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', 'Tu portada en {{diseno}} · enlace privado', 'Hola, {{nombre}}:

Aquí tienes vuestra portada montada en {{diseno}}: {{url}}

Es un enlace privado que no aparece en Google. Lo dejo activo 14 días. Si quieres cambiar algo, mándame una lista y hago una ronda de ajustes.

Si os encaja, te preparo la propuesta cerrada para la web completa.

Un saludo,
Joel · Arkevo', 'gmail', false),
  ('prueba.lista', 'arkevo', 'en', 'Arkevo <hello@arkevostudio.com>', 'Your homepage in {{diseno}} · private link', 'Hi {{nombre}},

Here''s your homepage built in {{diseno}}: {{url}}

It''s a private link that doesn''t show up on Google, and it stays live for 14 days. If you''d like anything changed, send me a list and I''ll do one round of tweaks.

If it works for you, I''ll put together a fixed-price proposal for the full website.

Best,
Joel · Arkevo', 'gmail', false)
ON CONFLICT (clave, marca, idioma) DO NOTHING;

-- MIGRACIÓN: ronda de ajustes de la prueba gratis (2026-10-16). «Pedir ajustes al agente» en la ficha
-- crea `prueba.ajustes` (una por lead); el agente responde con `prueba.lista` ronda 2. El índice único
-- pasa de «un prueba.lista por lead» a «uno por lead y ronda» (los antiguos, sin ronda, cuentan como 1).
CREATE UNIQUE INDEX IF NOT EXISTS eventos_prueba_lista_ronda ON eventos (lead_id, (COALESCE(datos->>'ronda', '1'))) WHERE tipo = 'prueba.lista';
DROP INDEX IF EXISTS eventos_prueba_lista_unica;
CREATE UNIQUE INDEX IF NOT EXISTS eventos_prueba_ajustes_unica ON eventos (lead_id) WHERE tipo = 'prueba.ajustes';
-- {{cambios}} = la lista que manda el agente («- …» por línea); si no manda ninguna, la línea desaparece.
INSERT INTO plantillas (clave, marca, idioma, remitente, asunto, cuerpo, canal, auto) VALUES
  ('prueba.ajustada', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', 'Tu portada en {{diseno}} · con los ajustes', 'Hola, {{nombre}}:

Ya está la portada con los ajustes, en el mismo enlace: {{url}}

{{cambios}}

Si os encaja, te preparo la propuesta cerrada para la web completa.

Un saludo,
Joel · Arkevo', 'gmail', false),
  ('prueba.ajustada', 'arkevo', 'en', 'Arkevo <hello@arkevostudio.com>', 'Your homepage in {{diseno}} · with the tweaks', 'Hi {{nombre}},

Your homepage is updated with the tweaks, on the same link: {{url}}

{{cambios}}

If it works for you, I''ll put together a fixed-price proposal for the full website.

Best,
Joel · Arkevo', 'gmail', false)
ON CONFLICT (clave, marca, idioma) DO NOTHING;

-- MIGRACIÓN: carpeta de Google Drive por proyecto (2026-10-17). Aditiva.
-- drive_folder_id se guarda en cuanto existe la carpeta; drive_url solo cuando ya está compartida con el
-- cliente (es lo que rellena {{drive_url}}); drive_error = motivo del último fallo («Reintentar»).
ALTER TABLE proyectos
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_url text,
  ADD COLUMN IF NOT EXISTS drive_error text;
-- Archivos que el cliente ha subido y ya avisaron (el tick solo avisa de los que no están aquí).
CREATE TABLE IF NOT EXISTS drive_archivos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proyecto_id integer NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  nombre text,
  visto_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proyecto_id, file_id)
);
ALTER TABLE drive_archivos ENABLE ROW LEVEL SECURITY;
-- Bienvenida y recordatorio de material: {{#drive_url}}…{{/drive_url}} solo sale con carpeta;
-- {{^drive_url}}…{{/drive_url}}, solo sin ella. Ya no piden {{url}} a mano.
UPDATE plantillas SET cuerpo = $t$Hola, {{nombre}}:

¡Empezamos! Esto es lo que necesito:

- Logo (SVG o PNG grande) y colores, si los tenéis.
- Los textos, o notas sueltas y los redacto yo.
- Las fotos en buena calidad.
- Datos legales para el aviso legal: titular, NIF, dirección y email.
- El acceso a vuestro dominio, si ya tenéis uno.

{{#drive_url}}He preparado una carpeta para que lo subas todo: {{drive_url}}

- Fotos: las fotos, en la mejor calidad que tengas.
- Planos: planos, plantas o bocetos, si los hay.
- Logo y marca: el logo y los colores.
- Textos: textos, notas y datos legales.
- Otros: lo que no encaje en las demás.

Si no tienes cuenta de Google, responde a este correo con un enlace de WeTransfer.{{/drive_url}}{{^drive_url}}Puedes mandármelo respondiendo a este correo o con un enlace de WeTransfer.{{/drive_url}}

El plazo empieza a contar cuando esté todo. Cualquier duda, responde a este correo.

Joel
Arkevo$t$ WHERE clave = 'proyecto.bienvenida' AND marca = 'arkevo' AND idioma = 'es';
UPDATE plantillas SET cuerpo = $t$Hi {{nombre}},

Let's get started! Here's what I need:

- Logo (SVG or large PNG) and brand colours, if you have them.
- The copy, or rough notes and I'll write it.
- High-quality photos.
- Legal details for the legal notice: owner, tax ID, address and email.
- Access to your domain, if you already have one.

{{#drive_url}}I've set up a folder for you to upload everything: {{drive_url}}

- Fotos: photos, in the best quality you have.
- Planos: drawings, floor plans or sketches, if any.
- Logo y marca: logo and brand colours.
- Textos: copy, notes and legal details.
- Otros: anything that doesn't fit the others.

If you don't have a Google account, just reply to this email with a WeTransfer link.{{/drive_url}}{{^drive_url}}You can send it by replying to this email or with a WeTransfer link.{{/drive_url}}

The timeline starts once everything is in. Any questions, just reply to this email.

Joel
Arkevo$t$ WHERE clave = 'proyecto.bienvenida' AND marca = 'arkevo' AND idioma = 'en';
UPDATE plantillas SET cuerpo = $t$Hola, {{nombre}}:

¡Empezamos! Esto es lo que necesito:

- Logo (SVG o PNG grande) y colores, si los tenéis.
- Los textos, o notas sueltas y los redacto yo.
- Las fotos en buena calidad.
- Datos legales para el aviso legal: titular, NIF, dirección y email.
- El acceso a vuestro dominio, si ya tenéis uno.

{{#drive_url}}He preparado una carpeta para que lo subas todo: {{drive_url}}

- Fotos: las fotos, en la mejor calidad que tengas.
- Planos: planos, plantas o bocetos, si los hay.
- Logo y marca: el logo y los colores.
- Textos: textos, notas y datos legales.
- Otros: lo que no encaje en las demás.

Si no tienes cuenta de Google, responde a este correo con un enlace de WeTransfer.{{/drive_url}}{{^drive_url}}Puedes mandármelo respondiendo a este correo o con un enlace de WeTransfer.{{/drive_url}}

El plazo empieza a contar cuando esté todo. Cualquier duda, responde a este correo.

Joel$t$ WHERE clave = 'proyecto.bienvenida' AND marca = 'custom' AND idioma = 'es';
UPDATE plantillas SET cuerpo = $t$Hi {{nombre}},

Let's get started! Here's what I need:

- Logo (SVG or large PNG) and brand colours, if you have them.
- The copy, or rough notes and I'll write it.
- High-quality photos.
- Legal details for the legal notice: owner, tax ID, address and email.
- Access to your domain, if you already have one.

{{#drive_url}}I've set up a folder for you to upload everything: {{drive_url}}

- Fotos: photos, in the best quality you have.
- Planos: drawings, floor plans or sketches, if any.
- Logo y marca: logo and brand colours.
- Textos: copy, notes and legal details.
- Otros: anything that doesn't fit the others.

If you don't have a Google account, just reply to this email with a WeTransfer link.{{/drive_url}}{{^drive_url}}You can send it by replying to this email or with a WeTransfer link.{{/drive_url}}

The timeline starts once everything is in. Any questions, just reply to this email.

Joel Schneider$t$ WHERE clave = 'proyecto.bienvenida' AND marca = 'custom' AND idioma = 'en';
UPDATE plantillas SET cuerpo = $t$Hola, {{nombre}}:

Para cumplir el plazo me falta parte del material. En cuanto lo tenga, sigo.

{{#drive_url}}Puedes subirlo a tu carpeta: {{drive_url}}
Si no tienes cuenta de Google, responde a este correo con un enlace de WeTransfer.{{/drive_url}}{{^drive_url}}Puedes mandármelo respondiendo a este correo o con un enlace de WeTransfer.{{/drive_url}}

Si os va mejor empezar con menos y añadir el resto después, también se puede.

Joel
Arkevo$t$ WHERE clave = 'material.recordatorio' AND marca = 'arkevo' AND idioma = 'es';
UPDATE plantillas SET cuerpo = $t$Hi {{nombre}},

To stay on schedule I still need some of the material. As soon as I have it, I'll carry on.

{{#drive_url}}You can upload it to your folder: {{drive_url}}
If you don't have a Google account, just reply to this email with a WeTransfer link.{{/drive_url}}{{^drive_url}}You can send it by replying to this email or with a WeTransfer link.{{/drive_url}}

If it's easier to start with less and add the rest later, that works too.

Joel
Arkevo$t$ WHERE clave = 'material.recordatorio' AND marca = 'arkevo' AND idioma = 'en';
UPDATE plantillas SET cuerpo = $t$Hola, {{nombre}}:

Para cumplir el plazo me falta parte del material. En cuanto lo tenga, sigo.

{{#drive_url}}Puedes subirlo a tu carpeta: {{drive_url}}
Si no tienes cuenta de Google, responde a este correo con un enlace de WeTransfer.{{/drive_url}}{{^drive_url}}Puedes mandármelo respondiendo a este correo o con un enlace de WeTransfer.{{/drive_url}}

Si os va mejor empezar con menos y añadir el resto después, también se puede.

Joel$t$ WHERE clave = 'material.recordatorio' AND marca = 'custom' AND idioma = 'es';
UPDATE plantillas SET cuerpo = $t$Hi {{nombre}},

To stay on schedule I still need some of the material. As soon as I have it, I'll carry on.

{{#drive_url}}You can upload it to your folder: {{drive_url}}
If you don't have a Google account, just reply to this email with a WeTransfer link.{{/drive_url}}{{^drive_url}}You can send it by replying to this email or with a WeTransfer link.{{/drive_url}}

If it's easier to start with less and add the rest later, that works too.

Joel Schneider$t$ WHERE clave = 'material.recordatorio' AND marca = 'custom' AND idioma = 'en';

-- MIGRACIÓN: bienvenida con factura al aceptar + modo de prueba (2026-10-17).
-- Un lead marcado `prueba` (la prueba de Joel como cliente, #15) pasa `prueba` a su proyecto. Las facturas de un
-- proyecto de prueba salen con fiscal = false, número «PRUEBA-<proyecto>-<pago>» (no cuenta para F-AAAA-N,
-- así que siguiente_numero_factura() no avanza ni se toca configuracion.ultimo_numero_factura) y el concepto
-- empieza por «PRUEBA · sin validez fiscal». Conciliar ignora las facturas con fiscal = false.
ALTER TABLE leads     ADD COLUMN IF NOT EXISTS prueba boolean NOT NULL DEFAULT false;
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS prueba boolean NOT NULL DEFAULT false;
UPDATE leads SET prueba = true WHERE id = 15;

-- crear_factura_pago: igual que la versión vigente, más la rama de prueba (versión vigente desde hoy).
CREATE OR REPLACE FUNCTION crear_factura_pago(p_proyecto INT, p_pago SMALLINT)
RETURNS facturas LANGUAGE plpgsql AS $$
DECLARE pr proyectos; m marcas; v_pais TEXT; v_base NUMERIC(10,2); v_numero TEXT; f facturas;
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
  -- La prueba nunca llama a siguiente_numero_factura(): la numeración real queda intacta.
  IF pr.prueba THEN v_numero := 'PRUEBA-' || pr.id || '-' || p_pago;
  ELSE v_numero := siguiente_numero_factura(); END IF;
  INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id,
                        numero, tipo_factura, idioma, marca, pago, fiscal)
  VALUES (pr.cliente,
          concat_ws(' · ', CASE WHEN pr.prueba THEN 'PRUEBA · sin validez fiscal' END, m.nombre,
                    concat_ws(' ', 'Web', nullif(pr.plan, ''), '(' || pr.web || ')'),
                    CASE p_pago WHEN 1 THEN '50 % al empezar' ELSE '50 % al publicar' END),
          v_base, CURRENT_DATE, CURRENT_DATE + 30, 'pendiente', 'manual', pr.id,
          v_numero,
          CASE WHEN v_pais = 'ES' THEN 'dentro_ue' ELSE 'fuera_ue' END,
          CASE WHEN v_pais = 'ES' THEN 'es' ELSE 'en' END,
          m.key, p_pago, NOT pr.prueba)
  RETURNING * INTO f;
  RETURN f;
END $$;
REVOKE EXECUTE ON FUNCTION crear_factura_pago(INT, SMALLINT) FROM PUBLIC, anon, authenticated;

-- Bienvenida: párrafo de la factura del pago 1, solo si va adjunta ({{factura_numero}}); {{factura_url}}
-- solo aparece si no se pudo generar el PDF (enlace a la factura pública).
UPDATE plantillas SET cuerpo = replace(cuerpo, 'El plazo empieza a contar',
  $t${{#factura_numero}}Te adjunto la factura del primer pago (50 %), {{factura_numero}}, por {{factura_total}}. Los datos para la transferencia están en la propia factura.{{#factura_url}} Si no ves el adjunto, la tienes aquí: {{factura_url}}{{/factura_url}}{{/factura_numero}}

El plazo empieza a contar$t$)
WHERE clave = 'proyecto.bienvenida' AND idioma = 'es' AND marca IN ('arkevo', 'custom') AND cuerpo NOT LIKE '%{{#factura_numero}}%';
UPDATE plantillas SET cuerpo = replace(cuerpo, 'The timeline starts',
  $t${{#factura_numero}}I've attached the invoice for the first payment (50%), {{factura_numero}}, for {{factura_total}}. The bank details for the transfer are on the invoice.{{#factura_url}} If you can't see the attachment, it's here: {{factura_url}}{{/factura_url}}{{/factura_numero}}

The timeline starts$t$)
WHERE clave = 'proyecto.bienvenida' AND idioma = 'en' AND marca IN ('arkevo', 'custom') AND cuerpo NOT LIKE '%{{#factura_numero}}%';

-- MIGRACIÓN: datos fiscales por formulario (2026-10-17). Aditiva.
-- «Marcar ganado» con «los rellena el cliente» guarda un token en el proyecto; la bienvenida enlaza a
-- /datos/<token>; al enviarlo se crea clientes_fiscales y la factura del pago 1 sale en un segundo email.
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS token_fiscal text UNIQUE;

-- Bienvenida: párrafo del formulario, solo cuando faltan los datos ({{datos_url}}); va antes del de la factura.
UPDATE plantillas SET cuerpo = replace(cuerpo, '{{#factura_numero}}',
  $t${{#datos_url}}Para preparar la factura del primer pago (50 %), rellena tus datos de facturación aquí (son dos minutos): {{datos_url}}{{/datos_url}}{{#factura_numero}}$t$)
WHERE clave = 'proyecto.bienvenida' AND idioma = 'es' AND marca IN ('arkevo', 'custom') AND cuerpo NOT LIKE '%{{#datos_url}}%';
UPDATE plantillas SET cuerpo = replace(cuerpo, '{{#factura_numero}}',
  $t${{#datos_url}}To prepare the invoice for the first payment (50%), please fill in your billing details here (it takes two minutes): {{datos_url}}{{/datos_url}}{{#factura_numero}}$t$)
WHERE clave = 'proyecto.bienvenida' AND idioma = 'en' AND marca IN ('arkevo', 'custom') AND cuerpo NOT LIKE '%{{#datos_url}}%';

-- Segundo email: la factura del pago 1 (responde en el hilo de la bienvenida, así que el asunto es «Re: …»).
INSERT INTO plantillas (clave, marca, idioma, remitente, asunto, cuerpo, canal, auto) VALUES
  ('factura.pago', 'arkevo', 'es', 'Arkevo <hola@arkevostudio.com>', 'Factura del primer pago · {{web}}', $t$Hola, {{nombre}}:

Gracias por los datos. Te adjunto la factura del primer pago (50 %), {{factura_numero}}, por {{factura_total}}. Los datos para la transferencia están en la propia factura.{{#factura_url}} Si no ves el adjunto, la tienes aquí: {{factura_url}}{{/factura_url}}

Cualquier duda, responde a este correo.

Joel
Arkevo$t$, 'gmail', false),
  ('factura.pago', 'arkevo', 'en', 'Arkevo <hello@arkevostudio.com>', 'Invoice for the first payment · {{web}}', $t$Hi {{nombre}},

Thanks for the details. I've attached the invoice for the first payment (50%), {{factura_numero}}, for {{factura_total}}. The bank details for the transfer are on the invoice.{{#factura_url}} If you can't see the attachment, it's here: {{factura_url}}{{/factura_url}}

Any questions, just reply to this email.

Joel
Arkevo$t$, 'gmail', false),
  ('factura.pago', 'custom', 'es', 'Joel Schneider <joel@joelschneider.io>', 'Factura del primer pago · {{web}}', $t$Hola, {{nombre}}:

Gracias por los datos. Te adjunto la factura del primer pago (50 %), {{factura_numero}}, por {{factura_total}}. Los datos para la transferencia están en la propia factura.{{#factura_url}} Si no ves el adjunto, la tienes aquí: {{factura_url}}{{/factura_url}}

Cualquier duda, responde a este correo.

Joel$t$, 'gmail', false),
  ('factura.pago', 'custom', 'en', 'Joel Schneider <joel@joelschneider.io>', 'Invoice for the first payment · {{web}}', $t$Hi {{nombre}},

Thanks for the details. I've attached the invoice for the first payment (50%), {{factura_numero}}, for {{factura_total}}. The bank details for the transfer are on the invoice.{{#factura_url}} If you can't see the attachment, it's here: {{factura_url}}{{/factura_url}}

Any questions, just reply to this email.

Joel Schneider$t$, 'gmail', false)
ON CONFLICT (clave, marca, idioma) DO NOTHING;

-- PLANTILLAS: «Ya está todo» (2026-10-17, aprobado por Joel). Al final de la parte de Drive de la bienvenida y del
-- recordatorio de material. Si el cliente responde así estando en «Material», el tick crea `material.completo`,
-- da un push y /proyectos propone pasar a «En curso» (no se mueve solo).
UPDATE plantillas SET cuerpo = replace(cuerpo, 'enlace de WeTransfer.{{/drive_url}}', $t$enlace de WeTransfer.

Cuando lo tengas todo subido, respóndeme a este email con un «Ya está todo» y empiezo: el plazo cuenta desde ese momento.{{/drive_url}}$t$)
WHERE clave IN ('proyecto.bienvenida', 'material.recordatorio') AND idioma = 'es' AND marca IN ('arkevo', 'custom') AND cuerpo NOT LIKE '%Ya está todo%';
UPDATE plantillas SET cuerpo = replace(cuerpo, 'WeTransfer link.{{/drive_url}}', $t$WeTransfer link.

Once everything is uploaded, just reply to this email with "All done" and I'll start — the timeline runs from then.{{/drive_url}}$t$)
WHERE clave IN ('proyecto.bienvenida', 'material.recordatorio') AND idioma = 'en' AND marca IN ('arkevo', 'custom') AND cuerpo NOT LIKE '%All done%';

-- ── Agente de primera versión (webs Arkevo), 2026-10-17 ──────────────────────────
-- Al pasar una web de Arkevo a «En curso» se crea `web.encargo`; el agente (`arkevo/`, /primera-version)
-- avisa con web.empezada / web.lista / web.error. Una primera versión por proyecto.
CREATE UNIQUE INDEX IF NOT EXISTS eventos_web_lista_unica ON eventos (proyecto_id) WHERE tipo = 'web.lista';

-- Copia del material de la carpeta de Drive al bucket privado `material` (necesita drive.readonly).
CREATE TABLE IF NOT EXISTS drive_copias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  proyecto_id integer NOT NULL REFERENCES proyectos(id) ON DELETE CASCADE,
  file_id text NOT NULL,
  ruta text NOT NULL,                 -- 'Fotos/obra-1.jpg' dentro de la carpeta del proyecto
  nombre text NOT NULL,
  tipo text,
  bytes bigint,
  modificado timestamptz,             -- modifiedTime de Drive: si cambia, se vuelve a copiar
  de_cliente boolean NOT NULL DEFAULT true,
  storage_path text,                  -- material/<proyecto>/<file_id>-<nombre>
  error text,
  copiado_en timestamptz,
  UNIQUE (proyecto_id, file_id)
);
ALTER TABLE drive_copias ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('material', 'material', false, 52428800)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MIGRACIÓN: bloque 2 de plan-agentes.md (2026-10-18, aplicada). «Comenzar», brief de custom y The Pitch Lab en /proyectos.
-- Ningún proyecto ni evento usa hoy la fase 'en_curso' (comprobado): se sustituye por 'comenzado' sin tocar filas.

-- 1. Etapa «Comenzado» en lugar de «En curso» (Joel la marca al ver cobrado el pago 1; crea el encargo del agente).
ALTER TABLE proyectos DROP CONSTRAINT IF EXISTS proyectos_fase_check;
ALTER TABLE proyectos ADD CONSTRAINT proyectos_fase_check
  CHECK (fase IN ('confirmado','material','comenzado','revision','cambios','entregado','cerrado'));

-- 2. Brief de dirección de las webs custom de Arkevo (lo escribe Joel en /proyectos; sin él no hay encargo).
--    { referencias: [url…], tono, tipografia, colores, paginas, notas, guardado_en }
ALTER TABLE proyectos ADD COLUMN IF NOT EXISTS brief JSONB;

-- 3. Pasadas del agente: con material nuevo («Ya está todo» o archivos en Drive) el diseño se vuelve a montar.
--    Un `web.lista` por proyecto y pasada (los antiguos, sin pasada, cuentan como 1).
CREATE UNIQUE INDEX IF NOT EXISTS eventos_web_lista_pasada ON eventos (proyecto_id, (COALESCE(datos->>'pasada', '1'))) WHERE tipo = 'web.lista';
DROP INDEX IF EXISTS eventos_web_lista_unica;

-- 4. Plantillas de The Pitch Lab (bienvenida sin factura y recordatorio de material). Voz «we», firma The Pitch Lab,
--    sin nombres de persona y sin nombrar la plataforma de entrega. Remitente hello@thepitchlab.xyz.
--    {{web}} es el nombre del cliente (los treatments no tienen web).
INSERT INTO plantillas (clave, marca, idioma, remitente, asunto, cuerpo) VALUES
('proyecto.bienvenida', 'pitchlab', 'es', 'The Pitch Lab <hello@thepitchlab.xyz>', 'Empezamos tu treatment · lo que necesitamos',
'Hola, {{nombre}}:

¡Empezamos! Para preparar el treatment necesitamos:

- El brief de la agencia o la marca, y el guion o la idea del spot.
- Referencias que te gusten: películas, fotos, otros spots.
- Tu texto o tus notas como director, aunque sean sueltas: lo redactamos nosotros.
- Fechas: cuándo hay que presentarlo.

{{#drive_url}}Hemos preparado una carpeta para que lo subas todo: {{drive_url}}

- Brief: el brief y el guion.
- Referencias: imágenes, enlaces y vídeos de referencia.
- Texto: tu texto o tus notas.
- Otros: lo que no encaje en las demás.

Si no tienes cuenta de Google, responde a este correo con un enlace de WeTransfer.

Cuando lo tengas todo subido, responde a este email con un «Ya está todo» y empezamos.{{/drive_url}}{{^drive_url}}Puedes mandárnoslo respondiendo a este correo o con un enlace de WeTransfer.

Cuando lo tengas todo, responde a este email con un «Ya está todo» y empezamos.{{/drive_url}}

{{#datos_url}}El treatment se factura entero a la entrega. Para tener la factura lista, rellena tus datos de facturación aquí (son dos minutos): {{datos_url}}{{/datos_url}}{{^datos_url}}El treatment se factura entero a la entrega.{{/datos_url}}

Cualquier duda, responde a este correo.

The Pitch Lab'),
('proyecto.bienvenida', 'pitchlab', 'en', 'The Pitch Lab <hello@thepitchlab.xyz>', 'Starting your treatment · what we need',
'Hi {{nombre}},

Let''s get started! To build the treatment we need:

- The agency or brand brief, and the script or idea for the spot.
- References you like: films, photos, other spots.
- Your director''s text or notes, even rough ones: we''ll write it up.
- Dates: when it needs to be presented.

{{#drive_url}}We''ve set up a folder for you to upload everything: {{drive_url}}

- Brief: the brief and the script.
- Referencias: reference images, links and videos.
- Texto: your text or notes.
- Otros: anything that doesn''t fit the others.

If you don''t have a Google account, just reply to this email with a WeTransfer link.

Once everything is uploaded, just reply to this email with "All done" and we''ll start.{{/drive_url}}{{^drive_url}}You can send it by replying to this email or with a WeTransfer link.

Once you have everything in, just reply to this email with "All done" and we''ll start.{{/drive_url}}

{{#datos_url}}The treatment is invoiced in full on delivery. To have the invoice ready, please fill in your billing details here (it takes two minutes): {{datos_url}}{{/datos_url}}{{^datos_url}}The treatment is invoiced in full on delivery.{{/datos_url}}

Any questions, just reply to this email.

The Pitch Lab'),
('material.recordatorio', 'pitchlab', 'es', 'The Pitch Lab <hello@thepitchlab.xyz>', 'Para seguir con tu treatment',
'Hola, {{nombre}}:

Para cumplir el plazo nos falta parte del material. En cuanto lo tengamos, seguimos.

{{#drive_url}}Puedes subirlo a tu carpeta: {{drive_url}}
Si no tienes cuenta de Google, responde a este correo con un enlace de WeTransfer.{{/drive_url}}{{^drive_url}}Puedes mandárnoslo respondiendo a este correo o con un enlace de WeTransfer.{{/drive_url}}

Cuando lo tengas todo, responde con un «Ya está todo» y seguimos.

The Pitch Lab'),
('material.recordatorio', 'pitchlab', 'en', 'The Pitch Lab <hello@thepitchlab.xyz>', 'To keep your treatment moving',
'Hi {{nombre}},

To stay on schedule we still need some of the material. As soon as we have it, we''ll carry on.

{{#drive_url}}You can upload it to your folder: {{drive_url}}
If you don''t have a Google account, just reply to this email with a WeTransfer link.{{/drive_url}}{{^drive_url}}You can send it by replying to this email or with a WeTransfer link.{{/drive_url}}

Once you have everything in, reply with "All done" and we''ll carry on.

The Pitch Lab')
ON CONFLICT DO NOTHING;

-- Alta de Cartela (2026-10-19): cartas digitales para restaurantes, precio cerrado 50/50. Aplicada con el OK de Joel.

-- 1. Marca: precio cerrado 50/50, después de Arkevo.
INSERT INTO marcas (key, nombre, modo, dominio, orden)
VALUES ('cartela', 'Cartela', 'cerrado', 'cartela.es', 5);

-- 2. (Opcional) crear_factura_pago: igual que la vigente, salvo el concepto de Cartela,
--    «Carta digital <plan> (<web>)» en vez de «Web <plan> (<web>)».
CREATE OR REPLACE FUNCTION crear_factura_pago(p_proyecto INT, p_pago SMALLINT)
RETURNS facturas LANGUAGE plpgsql AS $$
DECLARE pr proyectos; m marcas; v_pais TEXT; v_base NUMERIC(10,2); v_numero TEXT; f facturas;
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
  -- La prueba nunca llama a siguiente_numero_factura(): la numeración real queda intacta.
  IF pr.prueba THEN v_numero := 'PRUEBA-' || pr.id || '-' || p_pago;
  ELSE v_numero := siguiente_numero_factura(); END IF;
  INSERT INTO facturas (cliente, descripcion, importe, fecha, fecha_vencimiento, estado, origen, proyecto_id,
                        numero, tipo_factura, idioma, marca, pago, fiscal)
  VALUES (pr.cliente,
          concat_ws(' · ', CASE WHEN pr.prueba THEN 'PRUEBA · sin validez fiscal' END, m.nombre,
                    concat_ws(' ', CASE WHEN m.key = 'cartela' THEN 'Carta digital' ELSE 'Web' END,
                              nullif(pr.plan, ''), '(' || pr.web || ')'),
                    CASE p_pago WHEN 1 THEN '50 % al empezar' ELSE '50 % al publicar' END),
          v_base, CURRENT_DATE, CURRENT_DATE + 30, 'pendiente', 'manual', pr.id,
          v_numero,
          CASE WHEN v_pais = 'ES' THEN 'dentro_ue' ELSE 'fuera_ue' END,
          CASE WHEN v_pais = 'ES' THEN 'es' ELSE 'en' END,
          m.key, p_pago, NOT pr.prueba)
  RETURNING * INTO f;
  RETURN f;
END $$;
REVOKE EXECUTE ON FUNCTION crear_factura_pago(INT, SMALLINT) FROM PUBLIC, anon, authenticated;

-- 3. Plantillas de Cartela (solo es), copiadas de las vigentes de Arkevo cambiando «web» por «carta».
--    Sin prueba.* (el agente de prueba gratis es solo de Arkevo). auto = false: nunca salen solas.
INSERT INTO plantillas (clave, marca, idioma, remitente, asunto, cuerpo) VALUES
('proyecto.bienvenida', 'cartela', 'es', 'Cartela <hola@cartela.es>', 'Empezamos con tu carta · lo que necesitamos',
$t$Hola, {{nombre}}:

¡Empezamos! Esto es lo que necesitamos para montar la carta:

- La carta actual: una foto, un PDF o el enlace, con los precios al día.
- El logo (SVG o PNG grande) y los colores, si los tenéis.
- Las fotos de los platos, si las tienes. Si no, las retocamos o te proponemos cómo hacerlas.
- Los idiomas que quieres y si tenéis menú del día.
- Los alérgenos de cada plato, si los tienes apuntados.

{{#drive_url}}Hemos preparado una carpeta para que lo subas todo: {{drive_url}}

- Carta actual: la carta que usáis ahora.
- Logo y marca: el logo y los colores.
- Fotos: las fotos de los platos y del local.
- Textos: descripciones, alérgenos, horarios y notas.
- Otros: lo que no encaje en las demás.

Si no tienes cuenta de Google, responde a este correo con las fotos o con un enlace de WeTransfer.

Cuando lo tengas todo subido, responde a este email con un «Ya está todo» y empezamos: el plazo cuenta desde ese momento.{{/drive_url}}{{^drive_url}}Puedes mandárnoslo respondiendo a este correo o con un enlace de WeTransfer.

Cuando lo tengas todo, responde a este email con un «Ya está todo» y empezamos: el plazo cuenta desde ese momento.{{/drive_url}}

{{#datos_url}}Para preparar la factura del primer pago (50 %), rellena tus datos de facturación aquí (son dos minutos): {{datos_url}}{{/datos_url}}{{#factura_numero}}Te adjuntamos la factura del primer pago (50 %), {{factura_numero}}, por {{factura_total}}. Los datos para la transferencia están en la propia factura.{{#factura_url}} Si no ves el adjunto, la tienes aquí: {{factura_url}}{{/factura_url}}{{/factura_numero}}

El plazo empieza a contar cuando esté todo. Cualquier duda, responde a este correo.

Joel
Cartela$t$),

('material.recordatorio', 'cartela', 'es', 'Cartela <hola@cartela.es>', 'Para seguir con tu carta',
$t$Hola, {{nombre}}:

Para cumplir el plazo nos falta parte del material. Lo más importante es una foto de la carta actual; con eso ya podemos empezar. En cuanto lo tengamos, seguimos.

{{#drive_url}}Puedes subirlo a tu carpeta: {{drive_url}}
Si no tienes cuenta de Google, responde a este correo con las fotos o con un enlace de WeTransfer.

Cuando lo tengas todo subido, responde a este email con un «Ya está todo» y empezamos: el plazo cuenta desde ese momento.{{/drive_url}}{{^drive_url}}Puedes mandárnoslo respondiendo a este correo o con un enlace de WeTransfer.

Cuando lo tengas todo, responde a este email con un «Ya está todo» y empezamos: el plazo cuenta desde ese momento.{{/drive_url}}

Si os va mejor empezar con la carta y añadir el logo y las fotos después, también se puede.

Joel
Cartela$t$),

('revision.lista', 'cartela', 'es', 'Cartela <hola@cartela.es>', 'Tu carta digital · ronda {{ronda}} de revisión',
$t$Hola, {{nombre}}:

Aquí está tu carta para revisar: {{url}}
Es privada y no sale en Google.

Ábrela en el móvil, como la verá un cliente en la mesa, y revisa sobre todo los precios y los alérgenos. Mándanos en un solo correo todo lo que quieras cambiar.

Joel
Cartela$t$),

('revision.recordatorio', 'cartela', 'es', 'Cartela <hola@cartela.es>', 'Tu carta digital · ¿has podido verla?',
$t$Hola, {{nombre}}:

Te recordamos que tu carta está lista para revisar: {{url}}

En cuanto nos mandes los cambios, seguimos. Si está todo bien, dínoslo y preparamos la publicación y los QR.

Joel
Cartela$t$),

('entrega.final', 'cartela', 'es', 'Cartela <hola@cartela.es>', 'Tu carta digital ya está publicada',
$t$Hola, {{nombre}}:

¡Ya está! Tu carta: {{url}}

- Te mandamos los QR listos para imprimir (mesa, barra y escaparate). Si los quieres en otro tamaño, dínoslo.
- Para cambiar un precio, un plato o el menú del día, escríbenos a hola@cartela.es o por WhatsApp: lo cambiamos en 24 h laborables. El primer año de cambios va incluido.
- La factura del segundo 50 % te llega aparte.

Una cosa más: ¿nos escribirías dos o tres frases sobre cómo ha ido? Nos ayuda mucho.

Joel
Cartela$t$),

('factura.pago', 'cartela', 'es', 'Cartela <hola@cartela.es>', 'Factura del primer pago · tu carta digital',
$t$Hola, {{nombre}}:

Gracias por los datos. Te adjuntamos la factura del primer pago (50 %), {{factura_numero}}, por {{factura_total}}. Los datos para la transferencia están en la propia factura.{{#factura_url}} Si no ves el adjunto, la tienes aquí: {{factura_url}}{{/factura_url}}

Cualquier duda, responde a este correo.

Joel
Cartela$t$)
ON CONFLICT DO NOTHING;


-- ============================================================
-- MIGRACIÓN: cambios de Cartela, fase 1 (2026-10-26, aplicada). Solo aditiva: dos tablas nuevas y un bucket privado.
-- Diseño en 01 Agencias web/cartela/joux-hub/CAMBIOS-AUTOMATICOS.md. Versiones y operaciones del agente, en fases 2 y 3.

-- Un local de Cartela con su enlace de cambios (/cambios/<token_cambios>). proyecto_id es opcional:
-- el local de prueba (Cresta) no tiene proyecto.
CREATE TABLE IF NOT EXISTS cartela_locales (
  id SERIAL PRIMARY KEY,
  proyecto_id INT REFERENCES proyectos(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'carta' CHECK (plan IN ('carta','casa','grupo')),
  url_carta TEXT,
  token_cambios TEXT NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  email_aviso TEXT,
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','pausado','baja')),
  prueba BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE cartela_locales ENABLE ROW LEVEL SECURITY;

-- Cada petición de cambio de un local. adjuntos: rutas en el bucket privado `cartela`
-- (<local>/<petición>/<nombre>). nota: lo que Joel cambió, la ve el cliente en su historial.
CREATE TABLE IF NOT EXISTS cartela_peticiones (
  id SERIAL PRIMARY KEY,
  local_id INT NOT NULL REFERENCES cartela_locales(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  adjuntos TEXT[] NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'recibida' CHECK (estado IN ('recibida','en_curso','publicada','escalada')),
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_at TIMESTAMPTZ
);
ALTER TABLE cartela_peticiones ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS cartela_peticiones_local ON cartela_peticiones (local_id, created_at DESC);

-- Fotos de las peticiones (privado; el panel las enseña con URLs firmadas). 5 MB e imágenes.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('cartela', 'cartela', false, 5242880, ARRAY['image/jpeg','image/png','image/webp','image/heic'])
ON CONFLICT (id) DO NOTHING;

-- Local de prueba (ficticio) para probar el flujo de punta a punta.
INSERT INTO cartela_locales (nombre, slug, plan, url_carta, prueba)
VALUES ('Cresta', 'cresta', 'casa', 'https://cartela.live/ejemplos/cresta/', true)
ON CONFLICT (slug) DO NOTHING;


-- ============================================================
-- MIGRACIÓN: plantillas de Cartela al servicio anual (2026-10-26, aplicada). Solo UPDATE de 3 filas de `plantillas` (marca cartela, es).
-- Sin Drive y sin pedir fotos por correo: la carta y las fotos salen de su web/Instagram; si quiere mandar fotos
-- mejores, las sube desde su enlace de cambios ({{cambios_url}}, lo crea «Marcar ganado»). Sin fecha de inicio.
-- revision.lista, revision.recordatorio y factura.pago no cambian. material.recordatorio se queda para cuando
-- no encontramos su carta online.

UPDATE plantillas SET asunto = 'Empezamos con tu carta digital', cuerpo = $t$Hola, {{nombre}}:

¡Empezamos! No tienes que preparar nada: tomamos tu carta, el logo y las fotos de tu web y de tu Instagram. Si algo no lo encontramos, te lo pedimos.

{{#cambios_url}}Este es tu enlace de cambios. Guárdalo, es solo para ti: {{cambios_url}}
Si tienes fotos mejores de los platos, súbelas desde ahí. Y cuando la carta esté publicada, es donde nos pides cualquier cambio: precios, platos, agotados, menú del día u horario. Cambios ilimitados, publicados en 24 h.

{{/cambios_url}}En 5 días laborables te enseñamos una primera versión. La revisas, hacemos una ronda de ajustes y te mandamos la carta publicada y los QR para imprimir.

{{#datos_url}}Para preparar la factura del primer pago (50 %), rellena tus datos de facturación aquí (son dos minutos): {{datos_url}}{{/datos_url}}{{#factura_numero}}Te adjuntamos la factura del primer pago (50 %), {{factura_numero}}, por {{factura_total}}. Los datos para la transferencia están en la propia factura.{{#factura_url}} Si no ves el adjunto, la tienes aquí: {{factura_url}}{{/factura_url}}{{/factura_numero}}

Cualquier duda, responde a este correo.

Joel
Cartela$t$
WHERE marca = 'cartela' AND clave = 'proyecto.bienvenida' AND idioma = 'es';

UPDATE plantillas SET cuerpo = $t$Hola, {{nombre}}:

¡Ya está! Tu carta: {{url}}

- Te mandamos los QR listos para imprimir (mesa, barra y escaparate). Si los quieres en otro tamaño, dínoslo.
{{#cambios_url}}- Para cualquier cambio (precios, platos, agotados, menú del día u horario), usa tu enlace de cambios: {{cambios_url}}. Cambios ilimitados, publicados en 24 h.{{/cambios_url}}{{^cambios_url}}- Para cualquier cambio (precios, platos, agotados, menú del día u horario), escríbenos a hola@cartela.live. Cambios ilimitados, publicados en 24 h.{{/cambios_url}}
- La factura del segundo 50 % te llega aparte. El primer año incluye el servicio; un mes antes de que se cumpla te avisamos de la renovación.

Una cosa más: ¿nos escribirías dos o tres frases sobre cómo ha ido? Nos ayuda mucho.

Joel
Cartela$t$
WHERE marca = 'cartela' AND clave = 'entrega.final' AND idioma = 'es';

UPDATE plantillas SET cuerpo = $t$Hola, {{nombre}}:

Para montar tu carta nos falta la carta actual con los precios al día: no la hemos encontrado en tu web ni en tu Instagram. Respóndenos a este correo con una foto o un PDF y seguimos.

{{#cambios_url}}Si además quieres mandarnos fotos de los platos, súbelas desde tu enlace de cambios: {{cambios_url}}

{{/cambios_url}}Joel
Cartela$t$
WHERE marca = 'cartela' AND clave = 'material.recordatorio' AND idioma = 'es';


-- ============================================================
-- MIGRACIÓN: token de Google en la base (2026-10-26, aplicada). Solo aditiva: una tabla nueva de una fila.
-- «Reconectar Google» en /ajustes guarda aquí el refresh token de joel@joelschneider.io, cifrado
-- (AES-256-GCM; la clave sale de GMAIL_CLIENT_SECRET, que solo está en Vercel y .env.local).
-- RLS sin políticas: solo la service role la lee. No está en la lista de /api/db.
CREATE TABLE IF NOT EXISTS google_token (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cuenta TEXT NOT NULL,
  token_cifrado TEXT NOT NULL,
  permisos TEXT[] NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'conectado' CHECK (estado IN ('conectado','caducado')),
  conectado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  caducado_at TIMESTAMPTZ
);
ALTER TABLE google_token ENABLE ROW LEVEL SECURITY;

-- MIGRACIÓN (2026-10-26): rediseño comercial, fase 3. «Para empezar»: lo que el cliente ya ha mandado antes
-- de ganar el lead, por clave de su marca (src/lib/leads.ts, PARA_EMPEZAR). Lo marca la IA al leer cada
-- respuesta (y guarda los datos fiscales que encuentre en fiscales.datos) y Joel a mano (por = 'joel' manda).
ALTER TABLE leads ADD COLUMN IF NOT EXISTS para_empezar jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN leads.para_empezar IS 'Rediseño comercial, fase 3: lo que el cliente ya ha mandado para empezar, por clave de su marca ({"carta": {"ok": true, "por": "ia"|"joel"}}). Lo marca la IA al leer cada respuesta y Joel a mano.';

-- DATOS (2026-10-26): rediseño comercial, fase 5. Correos cortos de Cartela (es): bienvenida (con la factura
-- dentro si hay datos fiscales, o el enlace /datos si no), primera versión, recordatorio y entrega. {{url}} y el
-- QR los pone Joux Hub (emails-proyecto.ts). Aplicado con OK de Joel con UPDATE plantillas … WHERE marca = 'cartela'
-- AND idioma = 'es' AND clave IN ('proyecto.bienvenida', 'revision.lista', 'revision.recordatorio', 'entrega.final').
