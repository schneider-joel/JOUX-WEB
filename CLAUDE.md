# JOUX Hub

Panel financiero personal de Joel, autónomo en España: facturación, timesheets de clientes, compras, impuestos trimestrales, bancos, presupuesto y gastos compartidos con su pareja. Todo en español (interfaz, código, comentarios y commits de producto).

- **Producción:** https://joux-web.vercel.app (Vercel). Repo `schneider-joel/JOUX-WEB`.
- **Cada push a `main` despliega a producción.** Pregunta siempre antes de hacer `git push` o de pasar algo a `main`.

## Stack y comandos

- Next.js 14 (App Router) + TypeScript, Supabase (Postgres + Storage), Vercel.
- Sin Tailwind: estilos en `src/app/globals.css` (tokens en `:root`) y estilos inline.
- `npm run dev` (puerto 3000) · `npx tsc --noEmit -p .` para comprobar tipos (no hay tests).
- **No ejecutes `next build` con el dev server abierto**: rompe `.next` (404 en los chunks). Si pasa, borra `.next` y reinicia.

## Datos y seguridad

- **El entorno local usa la base de datos de producción.** Cualquier escritura en local es real.
- RLS activo en todas las tablas. El navegador nunca habla con Supabase directamente:
  - Cliente: `src/lib/supabase.ts` es un shim con la misma API que supabase-js que llama a `/api/db`, protegido por la cookie `joux_auth` (= `APP_PASSWORD`).
  - Servidor: `supabaseServer` (`src/lib/supabase-server.ts`) con la service role key.
- `src/middleware.ts` exige la cookie salvo en rutas públicas: `/ab|th|t|c/<token>` (links públicos), `/invoice/`, `/login`, `/api/login`, `/api/bancos/cron` (valida `CRON_SECRET`), `/api/compartidos` (valida su token), iconos, `/sw.js`, `/manifest.webmanifest`.
- Secretos solo en `.env.local` / Vercel. Nunca los imprimas ni los pegues en el chat. La clave privada de Enable Banking es `<appId>.pem` en la raíz (ignorada por git). Las variables de Vercel no coinciden con las de `.env.local` (p. ej. `APP_PASSWORD`).
- **`schema.sql` es un registro de migraciones**, no el esquema actual: la definición vigente de una función o tabla es la **última** que aparece. Las migraciones se aplican con el MCP de Supabase (`apply_migration`, proyecto `zgcihtipzgihvwyccery`) y se añaden al final de `schema.sql`.

## Dominio fiscal

- **Facturas** (`facturas`): numeración `F-AAAA-N` correlativa por fecha. Los pagos de Framer/Dub usan el número de payout de Dub.
  - `fiscal = false`: registros internos del timesheet, no cuentan para impuestos.
  - `origen`: `timesheet` · `manual` · `historico` (ya declarada, con su PDF original) · `regularizacion`.
  - `tipo_factura`: `dentro_ue` = cliente de España → **IVA 21 % y retención IRPF 15 %**; `fuera_ue` = UE o fuera de la UE → sin IVA ni retención. El país sale de `clientes_fiscales.pais` (`ES` / `UE` / `EXT`).
  - Lo que cobras de verdad: `totalACobrar()` / `desglose()` en `src/lib/importes.ts` (usable en el navegador). Las gráficas de ingresos e impuestos van sobre la **base**.
- **Trimestres por fecha de emisión**, nunca por fecha de cobro. El ZIP del trimestre (`/api/trimestre/zip`) incluye ventas, compras con su PDF y `Resumen.csv`.
- Las facturas se crean desde proyectos (trigger `crear_factura_desde_proyecto` al pasar a "facturado"). No hay botón de factura manual.
- `impuestos-tab.tsx`: estimación de modelo 130 (acumulado) y 303. Los importes reales del gestor se guardan en `configuracion` (`impuesto_real_<año>_<q>`) y sustituyen a la estimación. La cuota de autónomo está en `cuota_autonomo_mensual`.
- **Compras** (`compras`): base, `iva_pct`, `deducible_pct`, PDF en el bucket privado `compras` (`AAAA/<timestamp>-<nombre>.pdf`). Proveedores de EE. UU. van con IVA 0. Una factura del proveedor = una compra.

## Bancos (Enable Banking)

- Open banking de solo lectura: BBVA, Revolut y Wise. `src/lib/enablebanking.ts` + `src/lib/bancos-sync.ts`.
- Sincroniza al abrir el hub si han pasado más de 3 h, y con el cron diario de las 06:00 UTC (`vercel.json`). Los bancos permiten unas 4 lecturas al día por consentimiento (BBVA devuelve 429). Los consentimientos caducan el 2027-03-30.
- El saldo del BBVA usa el disponible (ITAV). El apartado de Ahorros se deriva: contable − disponible − resto de apartados. El de IRPF se mantiene a mano.
- Los movimientos pendientes (`estado = 'PDNG'`) se descartan cuando aparece su gemelo confirmado. Los marcados a mano se conservan.
- Clasificación (`src/lib/movimientos.ts`): las reglas del usuario (`reglas_movimientos`) van antes que las de por defecto. Se compara primero con el comercio y luego con todo el texto. `clase`: cobro · ingreso · interno · personal · reembolso · gasto.
- `conciliarTodo()` (`src/lib/conciliar.ts`) clasifica, enlaza compras, enlaza cobros con facturas (combinación exacta de importes) y sincroniza Compartidos. Cada cobro nuevo enlazado se guarda en `notificaciones` y se envía por push (`src/lib/push.ts`, Web Push con claves VAPID).
- El trigger `sumar_factura_cobrada` no toca las cuentas sincronizadas con el banco.

## Otras piezas

- **Compartidos** (`gastos_compartidos`, `src/lib/compartidos*.ts`): cuenta con Sofía (link privado `/c/<token>`, PWA "Casona"). Se añaden solos el alquiler, el agua y Mercadona pagado con Revolut, a medias. El presupuesto cuenta solo la parte de Joel.
- **Timesheets**: un grupo por clientes (`src/lib/timesheets.ts`), con links públicos de solo lectura. Desde el link de Ambushed/BoldMove la factura se descarga como `JOEL SCHNEIDER - CLIENTE - REF` (`?ref=1`).
- **Marcas** (Arkevo): `marca-card.tsx`, `marca-tab.tsx`, `src/lib/marcas.ts`. La pestaña solo se ve con `?demo=marcas` hasta que exista la columna `marca`.
- **Modo privado** (`modo-privado.tsx`): tapa los importes del texto ya pintado. No depende de los formateadores.

## Convenciones

- Nombres, comentarios y textos de la interfaz en español; comentarios cortos que expliquen el porqué.
- Formato numérico `es-ES` con `useGrouping: 'always'` (si no, "2005" sale sin punto de miles).
- Estilo: bordes semitransparentes, poco brillo, transiciones con `var(--ease-out)`. Los `:hover` van dentro de `@media (hover: hover) and (pointer: fine)`. El layout es mobile-first con barra inferior de 5 secciones (Overview, Timesheets, Facturación, Bancos, Compartidos).
- Antes de dar algo por hecho: `npx tsc --noEmit -p .` y comprobarlo en el navegador (local en el puerto 3000; la contraseña de pruebas está en `.env.local`).
- Commits con mensaje en inglés, en imperativo y descriptivo.
