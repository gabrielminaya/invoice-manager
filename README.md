# Facturación recurrente

PWA de facturación pensada para el móvil: gestiona **compañías emisoras**,
**clientes**, **contratos recurrentes** y **facturas**, y expone un **endpoint
para cronjob** que emite automáticamente las facturas de cada ciclo.

El documento de la factura sigue el formato fiscal dominicano (cabecera del
emisor, cliente y RNC, tabla de conceptos, divisa y recibo), y se exporta a PDF
con la impresión del navegador.

## Stack

| Pieza | Elección |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Turbopack) |
| Base de datos | PostgreSQL + Drizzle ORM (driver `postgres.js`) |
| Estilos | Tailwind CSS v4 con tokens propios (claro/oscuro) |
| Mutaciones | Server Actions con validación en el servidor |
| PWA | `app/manifest.ts`, service worker propio, iconos generados con `next/og` |

## Puesta en marcha

```bash
pnpm install
cp .env.example .env.local     # rellena DATABASE_URL y CRON_SECRET
pnpm db:migrate                # crea el esquema
pnpm db:seed                   # datos de ejemplo (opcional)
pnpm dev
```

Al abrir la app por primera vez te llevará a `/setup` para crear tu cuenta.

### Variables de entorno

| Variable | Para qué |
| --- | --- |
| `DATABASE_URL` | Conexión a Postgres. La leen la app y drizzle-kit. |
| `CRON_SECRET` | Secreto que debe presentar el cronjob. **Sin él el endpoint responde 503.** |
| `CRON_TIMEZONE` | Zona IANA con la que se decide qué es "hoy". Por defecto `America/Santo_Domingo`. |
| `RESEND_API_KEY` | Clave de Resend. **Con solo ponerla, los correos empiezan a salir.** |
| `MAIL_PROVIDER` | Fuerza `resend` o `mock`. Vacío = detección automática. |
| `MAIL_FROM` | Remitente, en formato `Nombre <correo@dominio>`. |
| `MAIL_REPLY_TO` | Opcional, dirección de respuesta. |
| `MAIL_ENABLED` | `false` silencia todos los envíos. |
| `APP_URL` | URL pública. Respaldo para cargar el logo del PDF adjunto cuando es una ruta relativa que no está en `public/`. |

### Scripts

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` / `pnpm build` | Desarrollo y compilación |
| `pnpm db:generate` | Genera una migración desde el esquema |
| `pnpm db:migrate` | Aplica las migraciones pendientes |
| `pnpm db:studio` | Abre Drizzle Studio |
| `pnpm db:seed` | Carga los datos de ejemplo |
| `pnpm cron:run` | Ejecuta la recurrencia por CLI (`-- --as-of 2026-12-01 --dry-run`) |
| `pnpm mail:test` | Envía un correo de prueba (`-- tu@correo.com`) |
| `pnpm test` | Toda la suite (unitarias + integración) |
| `pnpm test:unit` | Solo las unitarias, sin base de datos |
| `pnpm test:watch` | Modo vigilancia |
| `pnpm build:migrator` | Empaqueta el migrador para la imagen de Docker |
| `pnpm typecheck` | `tsc --noEmit` |

## El endpoint del cronjob

```
GET  /api/cron/recurring?token=<CRON_SECRET>
POST /api/cron/recurring        (Authorization: Bearer <CRON_SECRET>)
```

Acepta **GET** porque la mayoría de los cron gestionados solo hacen GET, y
**POST** para invocarlo con parámetros. El secreto se puede enviar por
`Authorization: Bearer`, por la cabecera `x-cron-secret` o por `?token=`, y se
compara en tiempo constante.

Cada corrida:

1. Busca las recurrencias `active` con `next_run_date <= hoy`.
2. Emite una factura por cada **ciclo vencido**, con su número correlativo,
   copia congelada de los datos fiscales, líneas, totales y recibo.
3. Avanza `next_run_date` al siguiente ciclo y finaliza la recurrencia si llegó
   a su `end_date` o a su número máximo de emisiones.
4. Marca en mora (`overdue`) las facturas emitidas cuyo vencimiento ya pasó.
5. Deja constancia de todo en `cron_runs` (visible en **Ajustes**).

### Parámetros

| Parámetro | Efecto |
| --- | --- |
| `asOf=2026-12-01` | Cambia la fecha lógica de corte. Sirve para simular. |
| `dryRun=1` | Calcula qué haría, sin escribir nada. |
| `limitPerSubscription=3` | Ciclos atrasados máximos por recurrencia y corrida (def. 12). |
| `subscriptionId=<uuid>` | Procesa una sola recurrencia. |

Respuesta: `200` si todo fue bien, `207` si alguna recurrencia falló (las demás
sí se emitieron), `401` sin credenciales, `503` si falta `CRON_SECRET`.

### Programarlo

Con cron del sistema (crontab), una vez al día a las 9:00:

```cron
0 9 * * * curl -fsS -X POST https://tu-dominio/api/cron/recurring \
  -H "Authorization: Bearer $CRON_SECRET" >> /var/log/facturacion.log 2>&1
```

El `-f` hace que curl devuelva error si la respuesta no es 2xx, así cron te
avisa cuando algo falla.

Con systemd, un `.timer` con `OnCalendar=*-*-* 09:00:00` apuntando a un
`.service` que ejecute el mismo `curl`.

Si prefieres no exponer el endpoint, el mismo motor se puede ejecutar como
comando en el propio servidor, sin HTTP ni secreto:

```cron
0 9 * * * cd /ruta/al/proyecto && pnpm cron:run >> /var/log/facturacion.log 2>&1
```

**Es idempotente**: llamarlo varias veces al día no duplica facturas, así que
puedes programarlo con la frecuencia que quieras y reintentar sin miedo.

## Correo

El proveedor es **Resend**, ya implementado en `lib/mail/providers/resend.ts`.

### Ponerlo en marcha

1. Crea una clave en <https://resend.com/api-keys>.
2. Ponla en el entorno y ajusta el remitente:

   ```bash
   RESEND_API_KEY="re_..."
   MAIL_FROM="Facturación <facturacion@tudominio.do>"
   ```

3. Verifica el dominio del remitente en Resend. Sin verificar, Resend solo
   acepta enviar desde `onboarding@resend.dev` y hacia tu propio correo.
4. Compruébalo con un envío real, usando la misma plantilla que recibirá un
   cliente:

   ```bash
   pnpm mail:test -- tu@correo.com
   ```

**No hay que configurar nada más.** `MAIL_PROVIDER` puede quedar vacío: si hay
`RESEND_API_KEY` se usa Resend, y si no, el proveedor simulado. Ajustes muestra
qué proveedor está activo y qué falta, si falta algo.

### Cómo está montado

```
lib/mail/
  types.ts              MailMessage, MailResult, MailProvider
  index.ts              sendMail() — resuelve proveedor, remitente y errores
  templates.ts          invoiceIssued, invoiceOverdue, paymentReceipt (texto + HTML)
  providers/resend.ts   proveedor real
  providers/mock.ts     proveedor simulado (imprime en consola)
  providers/index.ts    registro y detección automática
lib/services/notifications.ts   qué se envía y con qué datos
```

Los envíos ya están conectados donde corresponde:

| Momento | Correo |
| --- | --- |
| El cronjob emite una factura | `invoiceIssued` al cliente |
| Se registra el pago de una factura | `paymentReceipt` al cliente |
| Factura vencida (disponible, sin programar) | `invoiceOverdue` |

Solo se envía si el cliente tiene correo registrado; si no, el envío se omite sin
error.

### Detalles del proveedor

- Habla con la API REST por `fetch`, sin el SDK `resend`: una sola llamada HTTP,
  una dependencia menos y funciona igual en Node y en el edge.
- **Reintentos** ante `429` y `5xx` (hasta 3 intentos, respetando `retry-after`).
  Un `401`, `403` o `422` es configuración y no se reintenta.
- **Idempotencia**: cada mensaje viaja con `Idempotency-Key`, que Resend respeta
  durante 24 h. Reintentar una corrida del cron no duplica correos.
- Tiempo de espera de 15 s, para que el cronjob no se quede colgado.
- Las etiquetas se sanean al juego de caracteres que acepta Resend, en vez de
  dejar que la API rechace el envío completo.

`sendMail` **nunca lanza**: si el proveedor falla, devuelve el error en el
resultado. Un correo caído no revierte una emisión ni interrumpe una corrida del
cron; los fallos se cuentan en `emailsFailed` y se registran en la bitácora.

Para añadir *otro* proveedor (SES, SMTP…), crea un archivo en
`lib/mail/providers/` que exporte un `MailProvider` y regístralo en el mapa
`PROVIDERS`. Las plantillas y los puntos de envío no cambian.

## Docker

```bash
docker build -t facturacion .

docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://usuario:clave@host:5432/invoices \
  -e CRON_SECRET=un-secreto-largo \
  facturacion
```

O con Docker Compose, que toma las variables de `.env.docker`:

```bash
docker compose up -d --build   # construir y levantar (o actualizar)
docker compose logs -f app
```

`compose.yaml` publica el puerto solo en `127.0.0.1:3000`: se espera un proxy
(nginx) delante que sirva https.

El contenedor **aplica las migraciones pendientes al arrancar** y luego sirve la
app. Con `RUN_MIGRATIONS=false` se omite ese paso, que es lo que conviene si
levantas varias réplicas: el migrador no está pensado para correr en paralelo, así
que en ese caso conviene migrar en un paso previo del despliegue.

| Variable | Necesaria |
| --- | --- |
| `DATABASE_URL` | Sí |
| `CRON_SECRET` | Sí, o el endpoint del cron responde 503 |
| `RUN_MIGRATIONS` | No, por defecto `true` |
| `CRON_TIMEZONE`, `APP_URL`, `RESEND_API_KEY`, `MAIL_*` | No |

`GET /api/health` responde 200 solo si además de estar en pie puede consultar
Postgres; el `HEALTHCHECK` de la imagen usa ese endpoint.

### Decisiones

**La compilación no necesita base de datos.** `lib/db` abre la conexión en la
primera consulta, no al importarse, así que `next build` puede recorrer las
páginas sin `DATABASE_URL` y no hay que meter credenciales en el build. Antes de
este cambio la imagen no habría podido compilarse sin una base accesible.

**Salida `standalone`.** Next empaqueta el servidor con solo las dependencias que
usa; la imagen final pesa ~206 MB sobre `node:24-alpine` y su `node_modules`
conserva únicamente next y react.

**El migrador va empaquetado en un archivo.** Como `standalone` mete las
dependencias dentro del bundle del servidor, un script suelto no podría importar
`drizzle-orm` ni `postgres`. Por eso `docker/migrate.mjs` se empaqueta con esbuild
(`pnpm build:migrator`) en un único archivo de ~255 KB. Usa el migrador
programático de drizzle-orm, no drizzle-kit, que es dependencia de desarrollo.

**El proceso no corre como root**, y `exec "$@"` en el entrypoint deja al servidor
como PID 1 para que reciba las señales de parada.

## Autenticación

La app está cerrada: sin sesión no se llega a ninguna pantalla ni a ningún dato.

### Primer arranque

Con la base migrada y **sin usuarios**, cualquier ruta lleva a `/setup`, que crea
la cuenta de administración. En cuanto existe un usuario, esa pantalla queda
cerrada y redirige a `/login`: no es un registro abierto.

```
sin usuarios:  /invoices → /login → /setup
con usuarios:  /invoices → /login?redirectTo=%2Finvoices
```

No hay usuario en el seed a propósito: la contraseña la eliges tú en `/setup`.

### Cómo está montado

| Pieza | Función |
| --- | --- |
| `lib/auth/password.ts` | Hasheo con **scrypt** (viene en Node, sin dependencias nativas) |
| `lib/auth/session.ts` | Sesiones en base de datos, cookie httpOnly |
| `lib/auth/dal.ts` | `requireUser()`, `hasAnyUser()` — la verificación real |
| `lib/auth/constants.ts` | Nombre y duración de la cookie, sin dependencias |
| `proxy.ts` | Comprobación optimista: redirige sin mirar la base |
| `lib/actions/auth.ts` | Alta inicial, inicio y cierre de sesión, cambio de contraseña |

**Dos capas, como recomienda la documentación de Next.** `proxy.ts` solo mira si
existe la cookie —se ejecuta en cada navegación, incluidas las precargas de
`<Link>`, así que no puede consultar la base— y sirve para no renderizar
pantallas protegidas. La verificación de verdad (sesión vigente, usuario activo)
vive en `requireUser()`, que se invoca desde **todas** las consultas de
`lib/queries.ts` y **todas** las server actions. Así ninguna ruta puede devolver
datos aunque olvide comprobarlo por su cuenta.

### Decisiones

**scrypt con parámetros en el hash.** Se guarda como
`scrypt$N$r$p$sal$hash`, de modo que se puede endurecer el coste más adelante sin
invalidar las contraseñas existentes: al validar se usan los parámetros del
propio registro, y `needsRehash` reescribe el hash en el siguiente inicio de
sesión correcto.

**La base guarda el hash del token, no el token.** La cookie lleva 32 bytes
aleatorios; en `sessions.id` va su SHA-256. Una copia de la base de datos no
sirve para suplantar sesiones.

**El mismo mensaje para contraseña incorrecta y correo inexistente**, y se
consume el mismo tiempo en ambos casos, para que no pueda deducirse qué correos
están dados de alta.

**`redirectTo` solo acepta rutas internas.** Un destino externo permitiría usar
la pantalla de login para phishing.

**Desactivar un usuario invalida sus sesiones al instante**, porque la consulta
de sesión comprueba `users.active` en cada petición. No se borran usuarios: así
no se pierde el rastro de quién hizo qué.

**El cronjob no usa sesión.** `/api/cron/recurring` queda fuera del proxy y sigue
autenticándose con `CRON_SECRET`; los recursos de la PWA (manifest, iconos,
service worker) también son públicos, o el navegador no podría instalar la app.

### Usuarios

En **Ajustes** están tu cuenta (con cierre de sesión y cambio de contraseña) y la
lista de usuarios con acceso, desde donde se añaden o se desactivan. Todos los
usuarios tienen el mismo permiso: no hay roles.

## Varias compañías emisoras

Una instalación puede facturar en nombre de varias compañías, cada una con sus
datos fiscales, sus valores por defecto y **su propia serie de numeración**.

- Se gestionan en **Ajustes → Compañías emisoras**.
- La compañía activa se guarda en una cookie y se cambia desde el selector de la
  cabecera del panel.
- Al crear una factura o una recurrencia hay un selector de **compañía emisora**.
  Aparece cuando existe más de una compañía; con una sola no se dibuja el
  desplegable —sería un menú de una opción— pero el identificador viaja igual en
  un campo oculto, de modo que la acción no depende de la cookie.
- Los clientes pertenecen a una compañía. Al cambiar de emisor en el formulario,
  la lista de clientes se filtra y la divisa, el ITBIS, los días de crédito y la
  forma de pago se recalculan con los valores de la nueva compañía.
- Un cliente de otra compañía se rechaza tanto al emitir una factura como al
  crear o editar una recurrencia (`lib/services/clients.ts`).
- La compañía emisora de una recurrencia **no** se puede cambiar al editarla: las
  facturas ya emitidas cuelgan de su serie.

### Numeración

El correlativo lo lleva el sistema; no es un campo que se configure. En la
compañía solo se eligen el **prefijo** y la **serie**, y el formulario muestra
qué número saldrá a continuación.

El número visible codifica el contador interno de documentos en hexadecimal de
6 dígitos: `4263 → FAC0010A7`. Además se lleva un correlativo por serie, que
es el «Número» impreso en el documento.

Si necesitas continuar la numeración de otro sistema al migrar, ajusta los
contadores directamente en la base:

```sql
update companies
   set doc_counter = 4263, series_counter = 7, number_format = 'hex'
 where name = 'Mi compañía';
```

## Formas de pago

La lista se define en `lib/payment-methods.ts` y alimenta los desplegables de la
factura, la recurrencia y los valores por defecto de la compañía. Se guarda como
**texto**, no como enumerado de Postgres, para que cada negocio pueda tener sus
propias formas de cobro sin una migración; añadir una es editar ese array.

Un valor personalizado ya guardado se muestra como primera opción del
desplegable, para que editar un registro antiguo no lo cambie en silencio.

## El logo de la compañía

Cada compañía guarda su logo en `companies.logo_url`, y se edita en **Ajustes →
la compañía → Logo**. No hay subida de archivos: el campo acepta una ruta, una
URL o un data-URI. Tres formas, de más a menos recomendable:

**1. Un archivo en `public/logos/`** (lo habitual)

```bash
cp mi-logo.svg public/logos/
```

y en el campo: `/logos/mi-logo.svg`. Queda versionado con el repositorio, lo
sirve la propia app y el service worker lo cachea, así que también aparece sin
conexión.

**2. Un data-URI** — el logo viaja dentro de la base de datos, sin depender de
ningún archivo ni servidor externo:

```bash
echo "data:image/svg+xml;base64,$(base64 -i mi-logo.svg | tr -d '\n')"
```

Útil si despliegas sin volumen persistente. Sirve para SVG o PNG pequeños; para
archivos grandes engorda cada consulta de la compañía.

**3. Una URL absoluta** a un bucket o CDN: `https://…/logo.png`. Funciona sin
configurar `images.remotePatterns` porque el logo se renderiza con `unoptimized`,
pero no estará disponible sin conexión.

Formato recomendado: **SVG**, o PNG con fondo transparente de unos 360×96 px. Se
dibuja con 48 px de alto y ancho automático, tanto en pantalla como al imprimir.

> El logo **no** forma parte de la copia fiscal congelada de la factura: es
> identidad de marca, no un dato fiscal. Se lee siempre de la compañía, así que
> al añadirlo o cambiarlo también aparece al reimprimir facturas antiguas.

## Tests

```bash
pnpm test          # 228 pruebas
pnpm test:unit     # solo lógica pura, no necesita Postgres
```

**Unitarias** (`tests/unit/`) — la lógica donde un error sale caro:

| Archivo | Qué cubre |
| --- | --- |
| `dates.test.ts` | Recorte a fin de mes, bisiestos, día de anclaje, formatos |
| `money.test.ts` | Aritmética en centavos, ITBIS, cantidades fraccionarias |
| `recurrence.test.ts` | Avance de ciclos, recuperación de atrasos, topes de fin |
| `numbering.test.ts` | Formato del correlativo, incluido `4263 → FAC0010A7` |
| `form.test.ts` | Validación de formularios y emparejado de líneas |
| `mail.test.ts` | Plantillas, escapado de HTML, claves de idempotencia |
| `resend-provider.test.ts` | Reintentos, cabeceras y errores de la API (con `fetch` simulado) |
| `payment-methods.test.ts` | Opciones del desplegable y valores personalizados |
| `password.test.ts` | Hasheo, verificación, hashes corruptos, fuerza mínima |
| `proxy.test.ts` | Redirecciones, rutas públicas, exención del cron |
| `snapshot.test.ts` | Fusión de la copia fiscal sobre el registro vivo |

**Integración** (`tests/integration/`) — contra un Postgres real:

| Archivo | Qué cubre |
| --- | --- |
| `invoicing.test.ts` | Numeración atómica bajo concurrencia, series por compañía, totales, copia fiscal, idempotencia del ciclo |
| `recurring.test.ts` | Corridas del motor, atrasos, simulación, mora, aislamiento de errores, correos |
| `cron-endpoint.test.ts` | Autenticación, códigos de estado, parámetros inválidos |
| `auth.test.ts` | Ciclo de sesión: caducidad, usuario desactivado, cierre, tokens únicos |
| `auth-actions.test.ts` | Alta inicial cerrada tras el primer usuario, inicio de sesión, `redirectTo` |
| `queries.test.ts` | **Todas** las consultas de lectura se ejecutan contra Postgres |

### Base de datos de pruebas

Se usa una base **aparte**, derivada de `DATABASE_URL` con el sufijo `_test`
(o `TEST_DATABASE_URL` si la defines). La suite trunca tablas entre pruebas, así
que derivar el nombre evita el accidente de correrla contra desarrollo. Se crea y
migra sola en el primer `pnpm test`.

Si Postgres no está disponible, las pruebas de integración **se omiten** en lugar
de fallar, para que `pnpm test` siga siendo útil en una máquina sin base de datos.
`SKIP_DB_TESTS=true` las omite a propósito.

Ninguna prueba puede enviar correo: `tests/setup.ts` fuerza el proveedor
simulado y borra `RESEND_API_KEY`.

### Por qué existe `queries.test.ts`

Una consulta con SQL inválido compila sin problema en TypeScript y solo falla al
ejecutarse, así que ese archivo ejecuta **todas** las funciones de lectura contra
la base y comprueba sus resultados. Fue lo que destapó el fallo de las
subconsultas correlacionadas descrito abajo.

### Lo que encontraron

**Subconsultas correlacionadas sin cualificar.** Drizzle solo antepone el nombre
de la tabla a las columnas cuando la consulta tiene `join`. En `listClients`, que
no lo tiene, `${clients.id}` se interpolaba como `"id"` a secas y dentro de la
subconsulta Postgres lo resolvía contra la tabla interna —que también tiene una
columna `id`—, dando una comparación siempre falsa. El listado de clientes
mostraba 0 recurrencias y 0 por cobrar para todo el mundo, **sin ningún error**.
Ahora esas subconsultas usan alias para la tabla interna y el nombre cualificado
literal para la externa.

**Detección de claves duplicadas.** Las pruebas de integración destaparon un
fallo real: Drizzle envuelve los errores del driver en `DrizzleQueryError` y deja
el `PostgresError` en `cause`, así que comprobar solo el nivel superior dejaba
pasar el error. La red de seguridad del índice único no funcionaba —los ciclos
duplicados se contaban como error en lugar de omitirse— y solo se notaba con dos
corridas solapadas, algo que una prueba manual no reproduce. `isUniqueViolation`
recorre ahora la cadena de causas.

## Decisiones de diseño

**Idempotencia por período.** Cada factura recurrente guarda una `period_key`
(la fecha programada del ciclo) con un índice único
`(subscription_id, period_key)`. Un segundo intento de facturar el mismo ciclo
choca contra el índice y se cuenta como omitido, incluso si dos corridas del
cron se solapan.

**Recuperación de atrasos.** Si el cron estuvo caído, `dueOccurrences` calcula
todos los ciclos pendientes y los emite en orden, con tope por corrida para que
un contrato con fecha de inicio muy antigua no genere cientos de facturas de
golpe.

**Numeración atómica.** `reserveInvoiceNumber` bloquea la fila de la compañía
con `SELECT … FOR UPDATE` dentro de la transacción, así que el cron y un usuario
guardando a mano no pueden tomar el mismo correlativo. Se llevan dos
contadores: el global de documentos —que se imprime en hexadecimal,
`4263 → FAC0010A7`— y el de la serie, que es el "Número: 7".

**Fechas civiles, no instantes.** Las fechas de emisión y vencimiento son
`date` y toda la aritmética se hace sobre cadenas `YYYY-MM-DD` en UTC. Un
servidor en otra zona horaria no puede desplazar un día la facturación. El "hoy"
del cron se resuelve con `CRON_TIMEZONE`.

**Dinero en centavos.** Las columnas son `numeric(14,2)` y las sumas se hacen en
enteros (`lib/money.ts`), redondeando una sola vez por línea.

**Copia congelada.** Cada factura guarda un snapshot de los datos fiscales del
emisor y del cliente. Si el cliente se muda, las facturas ya emitidas no cambian.

**Nada se borra.** Las facturas emitidas se anulan (`void`), no se eliminan, para
que la serie no tenga huecos. Solo los borradores se pueden borrar.

**Un solo motor.** `runRecurringBilling` es el único código que decide qué se
factura. Lo usan el endpoint del cron, el botón "Ejecutar" de Ajustes, el botón
"Emitir ahora" de cada recurrencia y el script de CLI, así que las reglas no
pueden divergir entre caminos.

## Estructura

```
app/
  page.tsx                    panel con indicadores y próximas emisiones
  invoices/                   listado, detalle imprimible y alta manual
  clients/                    listado, detalle, alta y edición
  subscriptions/              contratos recurrentes
  settings/                   compañías emisoras y configuración del cron
  api/cron/recurring/route.ts endpoint del cronjob
  manifest.ts, icon.tsx       PWA
lib/
  auth/                       contraseñas, sesiones y capa de acceso
  db/schema.ts                esquema Drizzle
  services/recurring.ts       motor de facturación recurrente
  services/invoices.ts        emisión de facturas y totales
  recurrence.ts               cálculo de ciclos y períodos
  numbering.ts                correlativos de factura
  money.ts, dates.ts          aritmética de importes y fechas
  mail/                       envío de correo (Resend + proveedor simulado)
  services/notifications.ts   avisos al cliente
  actions/                    server actions
proxy.ts                      comprobación optimista de sesión
docker/
  migrate.mjs                 migraciones al arrancar el contenedor
  entrypoint.sh               migra y arranca el servidor
Dockerfile
components/                   UI (kit propio, documento de factura, formularios)
tests/
  unit/                       lógica pura, sin base de datos
  integration/                contra Postgres real
  helpers/                    fixtures y utilidades de base de datos
public/sw.js                  service worker
```

## Diseño responsive

La app se diseñó primero para el móvil y crece hacia tablet y escritorio. Los
cortes son los de Tailwind: `md` en 768 px y `lg` en 1024 px.

| Pieza | Móvil | Tablet (`md`) | Escritorio (`lg`+) |
| --- | --- | --- | --- |
| Navegación | Barra inferior de pestañas | Raíl lateral de iconos | Barra lateral con etiquetas |
| Ancho de contenido | 48 rem | 48 rem | 62 rem, 72 rem en `xl` |
| Listados | Tarjeta apilada por fila | Tarjeta apilada | Tabla con cabecera y columnas |
| Panel | 2 indicadores por fila | 2 por fila | 4 en fila, listas en paralelo |
| Detalle de factura | Todo en una columna | Una columna | Documento + panel lateral |
| Ajustes y detalles | Una columna | Una columna | Dos columnas |
| Formularios | Ancho completo | Ancho completo | Acotados a 46 rem |

### Decisiones

**Las tablas empiezan en `lg`, no en `md`.** Con seis columnas, a la anchura de
una tablet los nombres de cliente quedaban recortados a tres letras. La tarjeta
apilada se lee mucho mejor en ese tamaño, así que el listado solo se convierte en
tabla cuando hay sitio de verdad.

**Cada fila tiene dos marcados**, uno para la tarjeta y otro para la tabla
(`TableRow` en `components/ui.tsx`), en lugar de recolocar el mismo con CSS. Los
datos salen del mismo objeto, y así ninguno de los dos modos queda comprometido
por el otro.

**El raíl de tablet no muestra etiquetas largas.** Entre 768 y 1024 px una barra
lateral con texto se comería el espacio que necesita el contenido, así que se
queda en iconos con una etiqueta diminuta.

**Los formularios no se estiran.** Una fila de campos de 1200 px es incómoda de
recorrer, de modo que las pantallas de alta y edición se acotan aunque haya
espacio libre.

**Las páginas de detalle usan colocación explícita por fila y columna**
(`lg:col-start-2 lg:row-start-1`) en vez de reordenar bloques. Así el orden en
móvil —resumen, acciones, documento, metadatos— no cambia al pasar a dos
columnas.

**La cabecera fija abarca toda la columna** pero su contenido se centra con la
misma clase `.page-shell` que usa cada página, para que el fondo difuminado no
se corte a media pantalla.

## Notas sobre la PWA

- Instalable en iOS y Android (`display: standalone`, iconos 192/512 más
  `maskable`, accesos rápidos a nueva factura, recurrencias y clientes).
- El service worker cachea **solo** recursos estáticos y una página `/offline`.
  Los datos de facturación no se cachean nunca: es preferible avisar de que no
  hay conexión que mostrar un saldo desactualizado.
- Se registra únicamente en producción, para no estorbar al recargar en caliente
  durante el desarrollo.
- Áreas seguras del notch, objetivos táctiles de 44 px y controles de 16 px como
  mínimo para que iOS no haga zoom al enfocar un campo.
- **Impresión / PDF**: el detalle de la factura oculta todo lo que no sea el
  documento y lo maqueta en A4, así que "Guardar como PDF" del navegador produce
  la factura definitiva sin librerías de generación de PDF.
