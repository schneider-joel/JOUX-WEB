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
- `src/middleware.ts` exige la cookie salvo en rutas públicas: `/ab|th|t|c/<token>` (links públicos), `/invoice/`, `/login`, `/api/login`, `/api/bancos/cron` (valida `CRON_SECRET`), `/api/intake/lead` (valida `INTAKE_KEY_*`), `/api/compartidos` (valida su token), iconos, `/sw.js`, `/manifest.webmanifest`.
- Secretos solo en `.env.local` / Vercel. Nunca los imprimas ni los pegues en el chat. La clave privada de Enable Banking es `<appId>.pem` en la raíz (ignorada por git). Las variables de Vercel no coinciden con las de `.env.local` (p. ej. `APP_PASSWORD`).
- **`schema.sql` es un registro de migraciones**, no el esquema actual: la definición vigente de una función o tabla es la **última** que aparece. Las migraciones se aplican con el MCP de Supabase (`apply_migration`, proyecto `zgcihtipzgihvwyccery`) y se añaden al final de `schema.sql`.

## Dominio fiscal

- **Facturas** (`facturas`): numeración `F-AAAA-N` correlativa por fecha. Los pagos de Framer/Dub usan el número de payout de Dub.
  - `fiscal = false`: registros internos del timesheet, no cuentan para impuestos.
  - `origen`: `timesheet` · `manual` · `historico` (ya declarada, con su PDF original) · `regularizacion`.
  - `tipo_factura`: `dentro_ue` = cliente de España → **IVA 21 % y retención IRPF 15 %**; `fuera_ue` = UE o fuera de la UE → sin IVA ni retención. El país sale de `clientes_fiscales.pais` (`ES` / `UE` / `EXT`).
  - Lo que cobras de verdad: `totalACobrar()` / `desglose()` en `src/lib/importes.ts` (usable en el navegador). Las gráficas de ingresos e impuestos van sobre la **base**.
- **Trimestres por fecha de emisión**, nunca por fecha de cobro. El ZIP del trimestre (`/api/trimestre/zip`) incluye ventas, compras con su PDF y `Resumen.csv`.
- Las facturas se crean desde proyectos (trigger `crear_factura_desde_proyecto` al pasar a "facturado") o, en las agencias, por pagos con `crear_factura_pago()`. No hay botón de factura manual suelta.
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
- **Timesheets**: grupos de clientes (`src/lib/timesheets.ts`) dentro de cada pestaña de Treatments, con links públicos de solo lectura. Desde el link de Ambushed/BoldMove la factura se descarga como `JOEL SCHNEIDER - CLIENTE - REF` (`?ref=1`).
- **Marcas** (tabla `marcas (key, nombre, modo, dominio, orden)`; `src/lib/marcas.ts`, `marca-tab.tsx`, `marca-card.tsx`). Una marca nueva = una fila, sin código. `?demo=marcas` muestra datos de ejemplo sin escribir nada.
  - **Treatments** (`modo` `hora`/`dia`, con timesheet): `ab` (Ambushed/BoldMove, a mi nombre) y `pitchlab` (The Pitch Lab: Hans, Tays y cualquier cliente nuevo de treatments). Sección «Treatments», una pestaña por marca; dentro, un bloque por cliente o grupo con su propio link público (Tays/Hans comparten `/th`; los nuevos, `/t/<token>`). Un cliente nuevo no crea pestaña.
  - **Webs** (`modo = 'cerrado'`, 50 % al empezar y 50 % al publicar): `custom` (Custom Websites, joelschneider.io) y `arkevo` (y futuras agencias de nicho). Sección «Webs», una pestaña por marca, una fila por cliente. Un proyecto con `precio_cerrado`, `web`, `plan` y dos pagos; «Facturar pago N» → `/api/agencias/facturar` → `crear_factura_pago(proyecto, 1|2)` (número correlativo, IVA/retención según `clientes_fiscales.pais`, `marca` y `pago`). Rechaza clientes sin datos fiscales y de la UE (ROI pendiente). Las webs antiguas sin `precio_cerrado` (Cpworks) muestran su factura única.
  - Un proyecto de precio cerrado no puede pasar a «facturado» (constraint `proyectos_cerrado_sin_facturado`): al salir de ese estado, el trigger borraría sus facturas pendientes. No tocar el trigger `crear_factura_desde_proyecto` ni los treatments.
  - «Ingresos por marca» (Overview, por `orden`) usa `facturas.marca` o, si está vacía (las que crea el trigger), la de su proyecto. «Nuevo proyecto» (timesheet) etiqueta `ab` para Ambushed/BoldMove y `pitchlab` para el resto. Framer quedó sin marca (ya no se usa).
  - **Todas las facturas** se emiten como Joel Schneider Mena · joel@joelschneider.io (`configuracion.emisor_*`, se lee al abrir la factura, también las antiguas).
- **Leads** (`leads`, `eventos`; `src/lib/leads.ts`; plan en `../automatizacion.md`): las webs mandan cada formulario a `POST /api/intake/lead` con una clave por fuente (`INTAKE_KEY_THEPITCHLAB` → `pitchlab`, `INTAKE_KEY_ARKEVO` → `arkevo`, `INTAKE_KEY_PERSONAL` → `custom`). Idempotente por `(origen, id_externo)`. Cada lead nuevo crea el evento `lead.nuevo`, una notificación y un push. Tarjeta «Leads» en Overview → `/pipeline` (columnas por estado, filtro `?marca=`) → `/leads/[id]` (cambio de estado a mano). Las páginas y rutas de servidor que leen con supabase-js llevan `fetchCache = 'force-no-store'`: si no, Next guarda las respuestas y salen datos viejos.
- **Lead ganado → proyecto** (fase 3): «Marcar ganado» en `/leads/[id]` (`ganado.tsx`) pide cliente fiscal (nuevo o existente) y datos del proyecto, enseña las filas exactas (`filasGanado()` en `src/lib/ganado.ts`, la misma que usa `POST /api/leads/[id]/ganado`) y crea cliente + proyecto con `fase = 'confirmado'`, lead `ganado` y evento `lead.ganado`. La tarifa por día de un treatment va solo en el evento. Después ofrece «Facturar pago 1» (`/api/agencias/facturar`). «Ganado» no se puede elegir en el desplegable de estado; «perdido» admite motivo (`lead.perdido`). `proyectos.fase` es solo seguimiento (no toca `status` ni el trigger): `/proyectos` (`proyectos/seguimiento.tsx`, `src/lib/seguimiento.ts`) es **solo para webs** (marcas `modo = 'cerrado'`; los treatments no llevan fase y «Marcar ganado» no se la pone) y muestra cada web activa o con fase como una línea de siete etapas: un toque en una etapa pide confirmación y la guarda con `PATCH /api/proyectos/[id]/fase` (evento `proyecto.fase`); los días en la etapa salen de ese evento y pasan a ámbar al superar `DIAS_ALERTA`. `/pipeline` solo enlaza ahí.
- **Proyectos activos** (Overview, `proyectos-activos-card.tsx`): proyectos con `status = 'activo'`, cliente, marca e importe base (precio cerrado o lo que llevan los días). Cada fila abre la pestaña de su marca con el proyecto desplegado. Las webs de precio cerrado no salen de «activo» (no pueden pasar a «facturado»): se quedarán ahí hasta que exista la columna `fase`.
- **Modo privado** (`modo-privado.tsx`): tapa los importes del texto ya pintado. No depende de los formateadores.

## Convenciones

- Nombres, comentarios y textos de la interfaz en español; comentarios cortos que expliquen el porqué.
- Formato numérico `es-ES` con `useGrouping: 'always'` (si no, "2005" sale sin punto de miles).
- Estilo: bordes semitransparentes, poco brillo, transiciones con `var(--ease-out)`. Los `:hover` van dentro de `@media (hover: hover) and (pointer: fine)`. El layout es mobile-first con barra inferior de 6 secciones (Overview, Treatments, Webs, Facturación, Bancos, Compartidos).
- Antes de dar algo por hecho: `npx tsc --noEmit -p .` y comprobarlo en el navegador (local en el puerto 3000; la contraseña de pruebas está en `.env.local`).
- Commits con mensaje en inglés, en imperativo y descriptivo.
