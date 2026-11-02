# Auditoría de seguridad de Joux Hub (2026-11-02)

Auditoría **solo de lectura**: no se ha cambiado código ni configuración, y la base de producción solo se ha consultado con `SELECT` y consultas al catálogo. Revisados: el código de `src/`, el historial de git, los advisors de seguridad de Supabase (proyecto `zgcihtipzgihvwyccery`), `npm audit` y las cabeceras de https://joux-web.vercel.app.

Resumen: **la base está bien cerrada** (RLS en todas las tablas, la service key nunca llega al navegador, buckets privados, webhooks e intake con firma o clave comparadas en tiempo constante). El problema grave es otro: **las facturas son públicas y tienen IDs correlativos**. Después vienen la versión de Next.js y que no hay límite de intentos en el login.

---

## Crítico

### C1. `/invoice/<id>` es público y el id es un número correlativo
- **Dónde:** `src/middleware.ts:16` (`/^\/invoice\//` en `PUBLIC_PATHS`), `src/app/invoice/[id]/page.tsx:29-40`. `facturas.id` es `SERIAL` (`schema.sql:26`): hoy van del 14 al 204, 157 facturas.
- **Comprobado en producción:** `GET https://joux-web.vercel.app/invoice/204` sin cookie devuelve 200 con la factura completa (sale «IBAN» en el HTML). No se ha guardado ni impreso el contenido.
- **Qué expone:** cualquiera que recorra los ids del 1 al 300 se descarga todas las facturas: nombre, NIF y dirección de cada cliente, importes, días trabajados y tu NIF, dirección e IBAN. Son datos personales sujetos al RGPD.
- **Corrección propuesta:** dejar `/invoice/` fuera de `PUBLIC_PATHS` y pedir la cookie, salvo si se llega con una llave que no se pueda adivinar. Dos opciones:
  1. Añadir a `facturas` una columna `token_publico` (`randomBytes(18)`, como `token_fiscal`), servir la vista pública en `/invoice/<token>` y dejar `/invoice/<id>` solo para la sesión. Los enlaces de los timesheets (`/ab`, `/th`, `/t`), del PDF (`src/lib/pdf.ts`) y de los emails pasarían a usar el token.
  2. Si el cambio tiene que ser mínimo: aceptar `/invoice/<id>?t=<token del timesheet>` y comprobar que la factura es de un cliente de ese grupo (`grupoDeToken()` en `src/app/t/cargar.tsx`).
  Después, revisar en los logs de Vercel si alguien ha recorrido `/invoice/*`.
- **Estado (2026-11-02): corregido en código, pendiente de desplegar.** Se ha optado por una variante de la opción 1 que no necesita migración: el enlace público pasa a ser `/invoice/<id>?k=<firma>`, con un HMAC del id derivado de la service key (`src/lib/factura-enlace.ts`). Sin la cookie del hub y sin una firma válida, la página responde igual que si la factura no existiera, título incluido. Firman sus enlaces el timesheet público (`src/app/t/cargar.tsx`), el PDF (`src/lib/pdf.ts`), el ZIP trimestral y el enlace de respaldo de la bienvenida. Ningún email enviado contenía enlaces `/invoice/`, así que no se rompe ninguno. Si se rota la service key, cambian todas las firmas (los timesheets se regeneran solos).

## Alto

### A1. Next.js 14.2.5 con avisos de seguridad conocidos
- **Dónde:** `package.json` (`"next": "14.2.5"`). `npm audit` lo marca **crítico**: está afectada por GHSA-7gfc-8cq8-jh5f (autorización en el middleware saltable según la ruta), CVE-2025-29927 (saltarse el middleware con la cabecera `x-middleware-subrequest`; corregido en 14.2.25), envenenamiento de caché, DoS en el optimizador de imágenes y en server actions, y GHSA-3h52-269p-cp9r (el dev server no comprueba el origen).
- **Riesgo real:** toda la autenticación del panel depende de `src/middleware.ts`. Vercel dice que sus despliegues no son vulnerables a CVE-2025-29927, pero **el servidor local sí**, y según tus notas se abre desde otro ordenador por la IP de la red local, contra la base de producción. Solo `/api/db`, `/invoice` y `/api/compartidos` vuelven a comprobar la cookie; las otras ~45 rutas privadas confían únicamente en el middleware.
- **Corrección propuesta:** subir a `next@14.2.35` y `eslint-config-next@14.2.35` (mismo major, sin cambios incompatibles: lo dice `npm audit`), `npx tsc --noEmit -p .`, probar en local y desplegar. Como segunda barrera, una función `exigirSesion()` en `src/lib/` llamada al principio de cada route handler privado.

### A2. El login no tiene límite de intentos y la cookie es la propia contraseña
- **Dónde:** `src/app/api/login/route.ts:9-20`, `src/middleware.ts:26`.
- **Riesgo:** una sola contraseña protege todo el panel, y `/api/login` permite probar contraseñas sin límite. Además, la cookie `joux_auth` **guarda la contraseña en claro** durante 90 días: si se filtra la cookie, se filtra la contraseña, y la única forma de cerrar sesiones es cambiarla. La comparación usa `===`, no tiempo constante.
- **Corrección propuesta:**
  - Limitar los intentos: una regla de rate limit en el Firewall de Vercel para `POST /api/login` (por ejemplo, 5 por minuto por IP), o un contador en una tabla con bloqueo de 15 min tras 5 fallos.
  - Guardar en la cookie un valor firmado (`HMAC(APP_PASSWORD, "joux_auth:v1")` o un id de sesión aleatorio guardado en la base) en lugar de la contraseña, y compararlo con `timingSafeEqual` (como ya se hace en `src/app/api/cron/tick/route.ts:34`). Así, rotar la clave de firma cierra todas las sesiones.
  - Confirmar que el `APP_PASSWORD` de Vercel es largo y aleatorio (≥ 20 caracteres).

## Medio

### M1. Con la cookie se puede escribir en cualquier columna de 16 tablas, también en `configuracion`
- **Dónde:** `src/app/api/db/route.ts:9-58`. El proxy acepta `insert/update/upsert/delete` con cualquier `payload` sobre las tablas permitidas.
- **Riesgo:** quien consiga la cookie (A1, A2) puede cambiar `configuracion.emisor_iban`, y a partir de ahí las facturas nuevas y las antiguas (se lee al abrir) saldrían con su IBAN. También puede borrar facturas o movimientos.
- **Corrección propuesta:** quitar `configuracion` del proxy y moverla a una ruta propia que solo deje tocar claves concretas; impedir que `emisor_*` cambie sin confirmación (o avisar por push cuando cambie). Valorar quitar `delete` del proxy para `facturas`.

### M2. Sin cabeceras de seguridad
- **Dónde:** `next.config.js` no define `headers()`. En producción solo sale `strict-transport-security` (la pone Vercel), además de `access-control-allow-origin: *`.
- **Riesgo:** sin `X-Frame-Options`/`frame-ancestors`, el panel se puede meter en un iframe (clickjacking sobre botones como «Emitir y enviar»). Sin CSP, cualquier XSS futuro tiene vía libre.
- **Corrección propuesta:** en `next.config.js`, `headers()` con `X-Frame-Options: DENY` (o CSP `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` y `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Después, una CSP en modo report-only antes de aplicarla (el script del tema en `src/app/layout.tsx:33` necesita un hash o un nonce).
- **CORS:** `access-control-allow-origin: *` lo pone Vercel por defecto. Como la sesión va en cookie y `*` no permite credenciales, hoy no deja leer datos privados. Aun así, mejor no mandarlo en `/api/*`.

### M3. Servidor de desarrollo abierto en la red local contra la base de producción
- **Dónde:** práctica de trabajo (tus notas: «dar la IP de red local, no localhost») + `next dev` 14.2.5 (GHSA-3h52-269p-cp9r).
- **Riesgo:** cualquiera en la misma wifi llega a un servidor con la service key de producción, sin el blindaje de Vercel ante el fallo del middleware (A1).
- **Corrección propuesta:** subir Next (A1) y arrancar `next dev -H 127.0.0.1` salvo cuando haga falta verlo desde otro equipo, y nunca en redes públicas.

## Bajo

### B1. Redirección abierta después del login
`src/app/login/page.tsx:24`: `router.push(params.get('from') || '/')`. Un enlace `/login?from=https://otro-sitio` te mandaría fuera tras entrar. **Corrección:** aceptar solo valores que empiecen por `/` y no por `//`.

### B2. Comparaciones de secretos que no van en tiempo constante
`src/app/api/bancos/cron/route.ts:10` (`CRON_SECRET`), `src/lib/compartidos-server.ts:21` (token de la pareja), `src/app/t/cargar.tsx:14` (token de `/ab` y `/th`). Atacarlas por tiempo de respuesta en remoto es poco realista, pero cambiarlas es trivial: `timingSafeEqual` sobre sha256, como en `src/lib/intake.ts:8-19`.

### B3. Mensajes de error internos en las respuestas
25 route handlers devuelven `e.message` o `error.message` (por ejemplo `src/app/api/db/route.ts:33`, `src/app/api/compras/route.ts:33`). Casi todos son privados y Vercel no enseña stack traces en producción, así que filtran poco. **Corrección:** en las rutas públicas, responder con un código genérico y dejar el detalle en `console.error`. `api/datos/[token]` ya lo hace bien.

### B4. Buckets sin restricción de tipo
`compras`, `facturas` y `material` no tienen `allowed_mime_types`; `leads` admite `image/svg+xml` y `application/postscript`. Todos son privados y se sirven con URLs firmadas desde el dominio de Supabase, así que el riesgo es bajo. **Corrección:** limitar `compras` y `facturas` a `application/pdf` e imágenes y comprobar el tipo y el tamaño también en `src/app/api/compras/route.ts:27` (hoy confía en `archivo.type`). Si un SVG se va a abrir en el navegador, mejor servirlo como descarga.

### B5. Funciones con `search_path` mutable y permisos de más para `anon`
Advisor `function_search_path_mutable`: `crear_factura_pago`, `crear_factura_desde_proyecto`, `siguiente_numero_factura`, `sumar_factura_cobrada`. Ninguna es `SECURITY DEFINER`, así que el riesgo es mínimo. Además, `anon` conserva `GRANT SELECT` en las 29 tablas (RLS lo bloquea igual). **Corrección:** una migración con `ALTER FUNCTION … SET search_path = public, pg_temp` y `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated` (la app solo usa `service_role`).

### B6. Dependencias de desarrollo y transitivas
`npm audit`: 25 avisos (1 crítico = Next, A1; 14 altos; 10 moderados). Fuera de Next, casi todos son de herramientas de desarrollo (eslint, glob, minimatch), de `puppeteer-core`/`chromium-bidi` (solo genera el ZIP trimestral) y de `@vercel/functions` → `zod`/`@vercel/oidc`. **Corrección:** `npm audit fix` sin `--force` tras subir Next, y volver a revisar.

---

## Puntos revisados sin problemas

| # | Punto | Estado |
|---|---|---|
| 1 | **RLS** | Activo en las 29 tablas de `public`, sin ninguna política: `anon` y `authenticated` no leen nada. No hay `using (true)`. El advisor solo avisa «RLS sin políticas» (nivel INFO, es lo que se busca aquí). |
| 2 | **Secretos** | `SUPABASE_SERVICE_ROLE_KEY` solo en `src/lib/supabase-server.ts`; ningún componente `'use client'` lee secretos. El único `NEXT_PUBLIC_*` que llega al navegador es la clave pública VAPID (`src/app/notificaciones-boton.tsx:10`), que es pública por diseño. `.env.local` y `*.pem` están en `.gitignore`; `git log --all -- '.env*' '*.pem'` está vacío y el historial no contiene patrones de claves (Supabase, Anthropic, Resend, Google). El token de Google se guarda cifrado con AES-256-GCM y no se puede leer por `/api/db`. |
| 3 | **Autenticación** | El middleware cubre todo salvo `_next/static`, `_next/image` y `favicon.ico`. Las rutas públicas validan su propia llave: intake y agentes con `fuenteDeClave()` (sha256 + `timingSafeEqual`), el tick con `CRON_TICK_SECRET` en tiempo constante, el cron de bancos con `CRON_SECRET`, y `/datos`, `/cambios`, `/c`, `/t` con tokens aleatorios (18 bytes, 64 hex, `randomUUID`). La excepción es `/invoice` (C1). |
| 4 | **IDs y propiedad** | App de un solo usuario: las rutas privadas no necesitan comprobar dueño. Las públicas con token solo devuelven el recurso de ese token (`peticionPublica()` oculta las rutas de los adjuntos). El único IDOR es `/invoice/<id>` (C1). |
| 5 | **Webhooks** | Resend: firma svix verificada a mano (`src/lib/resend.ts:30-42`) con HMAC, tolerancia de 5 min y `timingSafeEqual`. OAuth de Google con `state` firmado y comprobación de cuenta; Enable Banking con `state` en cookie. |
| 6 | **Validación y SQL** | No hay zod, pero las rutas públicas validan a mano tipos, longitudes, tamaño del cuerpo, URLs `https:`, PNG por cabecera y número de adjuntos. No hay SQL concatenado: todo va por supabase-js, y los tres `.or()` con plantilla solo meten valores del servidor (fechas y constantes). Ninguna función de la base usa `EXECUTE` dinámico ni es `SECURITY DEFINER`; `anon` no puede ejecutar `crear_factura_pago()`. |
| 7 | **Rate limiting** | Fuera del login (A2), las entradas públicas están acotadas: intake y agentes piden clave; `/cambios` admite 10 al día y fotos de hasta 5 MB; `/datos` necesita un token de 18 bytes y se cierra al facturar. |
| 8 | **XSS** | No hay `dangerouslySetInnerHTML` con datos (solo el script fijo del tema). El HTML de los emails escapa el texto (`src/lib/resend.ts:3`). En `localStorage` solo se guardan el tema y el modo privado, ningún token. |
| 9 | **Subidas** | Todos los buckets son privados, con límite de tamaño, y `cartela` y `leads` además con tipos permitidos. Los nombres de archivo se limpian antes de subirlos (`src/app/api/compras/route.ts:29`). Detalles en B4. |
| 10 | **Contraseñas de usuarios / email sin verificar / admin sin login** | No aplican: no hay cuentas de usuario, solo la contraseña de la app (A2). |

## Orden sugerido
1. **C1** hoy mismo (y revisar los logs de `/invoice/*`).
2. **A1** (subir Next a 14.2.35) y **A2** (límite de intentos y cookie firmada).
3. **M1–M3**.
4. Los bajos, cuando haya hueco.
