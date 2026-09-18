# JOUX Hub · Panel Financiero

## Setup

### 1. Supabase — Ejecutar el schema
Ve a Supabase → SQL Editor → pega el contenido de `schema.sql` → Run

### 2. Variables de entorno
Crea `.env.local` en la raíz con:
```
NEXT_PUBLIC_SUPABASE_URL=https://zgcihtipzgihvwyccery.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_publishable_key
NOTION_API_KEY=tu_notion_integration_token
NOTION_PROYECTOS_DATA_SOURCE_ID=a7008f96-4e1d-452f-8842-a32fdf301174
```

### 2.1 Integración con Notion (sync de facturas)
1. Andá a [notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration** → dale un nombre (ej. "JOUX Hub") → copiá el **Internal Integration Secret**, es tu `NOTION_API_KEY`.
2. Abrí tu base **Proyectos** en Notion (dentro de ⚡ JOUX HUB) → `···` (arriba a la derecha) → **Connections** → conectá la integración que creaste. Esto le da permiso de lectura a esa base.
3. `NOTION_PROYECTOS_DATA_SOURCE_ID` ya viene precargado apuntando a tu base de Proyectos actual — no hace falta tocarlo salvo que cambies de base.
4. No olvides agregar las mismas variables (`NOTION_API_KEY`, `NOTION_PROYECTOS_DATA_SOURCE_ID`) en Vercel → Settings → Environment Variables para que funcione en producción.

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
- `src/app/page.tsx` — Dashboard principal
- `src/lib/supabase.ts` — Cliente Supabase y tipos
- `schema.sql` — Schema de base de datos

## Flujo de facturas
1. Terminás un proyecto en Notion → marcás su Status como **Facturado** en la base Proyectos.
2. En la app, tab Facturas → botón **⟳ Sync Notion** → te muestra los proyectos marcados como Facturado que todavía no importaste (usa el "Total €" del proyecto).
3. Elegís fecha e idioma (ES/EN) por cada una y confirmás → se crean como facturas pendientes.
4. Click en el ícono 🧾 de cualquier factura para ver/imprimir el invoice (bilingüe, listo para guardar como PDF).
5. Cuando cobrás → marcás como cobrada → el saldo se actualiza automáticamente en la cuenta destino.

También podés seguir agregando facturas manualmente con "+ Nueva factura".
