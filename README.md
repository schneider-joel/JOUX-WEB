# JOUX Hub · Panel Financiero

## Setup

### 1. Supabase — Ejecutar el schema
Ve a Supabase → SQL Editor → pega el contenido de `schema.sql` → Run

### 2. Variables de entorno
Crea `.env.local` en la raíz con:
```
NEXT_PUBLIC_SUPABASE_URL=https://zgcihtipzgihvwyccery.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_publishable_key
```

### 3. Desarrollo local
```bash
npm install
npm run dev
```

### 4. Deploy en Vercel
1. Sube el proyecto a GitHub
2. Importa en vercel.com
3. Añade las variables de entorno en Vercel → Settings → Environment Variables
4. Deploy automático

## Estructura
- `src/app/page.tsx` — Dashboard, Facturas, Presupuesto y Timesheets
- `src/app/invoice/[id]` — vista de invoice imprimible (bilingüe ES/EN)
- `src/app/timesheet/[token]` — vista pública de solo lectura del Timesheet Ambushed/BoldMove
- `src/lib/supabase.ts` — Cliente Supabase y tipos
- `schema.sql` — Schema de base de datos

## Timesheet integrado
Todo vive en la app, no depende de Notion.

- **Timesheet AB** (tab): proyectos de Ambushed/BoldMove, rate por hora. Cada día tiene fecha, rate, horas trabajadas, stand by hrs y status.
- **Timesheet Propios** (tab): proyectos de tus clientes propios, rate por día (no hace falta cargar horas).
- Cada proyecto tiene un selector de Status: Activo → Completado → **Facturado**. Al marcar Facturado, se crea automáticamente una factura pendiente en la tab Facturas (dispara un trigger en Supabase, sin clicks extra).
- La tab **Timesheet AB** tiene un botón "Copiar link" con una URL pública de solo lectura (`/timesheet/<token>`) para que Ambushed/BoldMove puedan chequear su timesheet sin acceso al resto de la app. El token vive en la tabla `configuracion` (clave `timesheet_public_token`) — lo genera solo la migración de `schema.sql`.

## Flujo de facturas
1. Cargás tus días trabajados en la tab Timesheet correspondiente.
2. Cuando terminás el proyecto, cambiás su Status a **Facturado** → la factura aparece sola en la tab Facturas (importe = suma de todos los días del proyecto).
3. Click en el ícono 🧾 de cualquier factura para ver/imprimir el invoice (bilingüe, listo para guardar como PDF).
4. Cuando cobrás → marcás como cobrada → el saldo se actualiza automáticamente en la cuenta destino.

También podés seguir agregando facturas manualmente con "+ Nueva factura".
