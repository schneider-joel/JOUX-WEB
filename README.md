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
- `src/app/page.tsx` — Dashboard principal
- `src/lib/supabase.ts` — Cliente Supabase y tipos
- `schema.sql` — Schema de base de datos

## Flujo de facturas
1. Terminas un proyecto en Notion
2. Me pides a Claude que genere la factura
3. La añades manualmente en la app (o via API de Notion en el futuro)
4. Cuando cobras → marcas como cobrada → saldo se actualiza automáticamente
