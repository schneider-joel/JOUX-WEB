import { createClient } from '@supabase/supabase-js'

// Cliente SOLO de servidor. Usa la service_role key (secreta, nunca
// NEXT_PUBLIC_) que se salta RLS, para que una vez que activemos RLS el
// navegador ya no pueda tocar la base con la key pública. Si todavía no está
// cargada la service key, cae a la anon como red de seguridad para no romper
// nada antes de completar la migración.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabaseServer = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
  auth: { persistSession: false },
})
