# Deployment: BooklyPro Backend MVP

## Arquitectura

Desarrollo: API local y PostgreSQL 17 en `docker-compose.yml`.
Producción: proyecto Railway **BooklyPro**, servicio **PostgreSQL** y servicio
**booklypro-api** conectado a `Viths3/BooklyPro`, rama **main**.
Las bases son independientes; no se copian datos demo a producción.

El backend permanece en `server/`. El lockfile raíz sirve al workspace local;
`server/package-lock.json` permite instalar exclusivamente el backend desde
`/server`. Al cambiar dependencias, actualizar ambos lockfiles y comprobar tanto
el workspace como la instalación aislada (CI hace ambas comprobaciones).

## Desarrollo local

Conservar `.env` raíz para Docker y `server/.env` para la API, ambos ignorados por
Git. Los archivos `.env.example` son plantillas, nunca credenciales de producción.

```bash
docker compose up -d
npm ci
npm run db:deploy
npm run dev
```

El seed se ejecuta manualmente, solo contra una base de desarrollo. Ningún script
de instalación, build, arranque o despliegue ejecuta el seed.

## Crear y conectar Railway

1. Iniciar sesión en Railway y crear un proyecto vacío llamado **BooklyPro**.
2. Añadir un servicio de base de datos PostgreSQL y nombrarlo **PostgreSQL**.
   Esperar a que esté disponible. Usar PostgreSQL 17 o una versión compatible con
   las migraciones; requieren `btree_gist` y permiso para crear la extensión.
3. Añadir el servicio desde GitHub: autorizar acceso a **Viths3/BooklyPro** y
   nombrarlo **booklypro-api**. Configurar la rama **main**, no `develop` ni features.
4. En Settings → Source, establecer **Root Directory `/server`**.
5. En Settings, configurar **Railway Config File `/server/railway.json`**. La ruta
   del archivo de configuración es relativa a la raíz del repositorio, aunque el
   Root Directory sea `/server`.
6. En Variables del API, añadir las variables de la tabla siguiente antes del
   primer despliegue. Crear `DATABASE_URL` como referencia a la variable del
   servicio PostgreSQL: `${{PostgreSQL.DATABASE_URL}}`. Usar la red privada entre
   servicios del mismo proyecto y entorno; no copiar la URL a Git ni a logs.
7. Habilitar autodeploys desde **main** y **Wait for CI**. El workflow
   `.github/workflows/backend.yml` verifica todos los módulos en cada push.
8. Desplegar después de que CI pase. Revisar por separado instalación/build,
   pre-deploy y startup en los logs de Railway.
9. En Settings → Networking → Public Networking, seleccionar **Generate Domain**.
   El target port debe coincidir con el `PORT` inyectado por Railway.

La creación real de recursos y el dominio requieren una cuenta Railway conectada
y acceso al repositorio. Este archivo describe la configuración reproducible; no
afirma por sí mismo que exista un despliegue remoto.

## Variables del servicio API

| Variable                             | Valor/configuración                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `NODE_ENV`                           | `production`                                                                        |
| `DATABASE_URL`                       | `${{PostgreSQL.DATABASE_URL}}`                                                      |
| `JWT_ACCESS_SECRET`                  | Secreto aleatorio independiente de al menos 32 caracteres                           |
| `JWT_ACCESS_EXPIRES_IN`              | `15m` (máximo 1 hora)                                                               |
| `JWT_REFRESH_SECRET`                 | Otro secreto aleatorio de al menos 32 caracteres                                    |
| `JWT_REFRESH_EXPIRES_IN`             | `7d` (máximo 30 días)                                                               |
| `CORS_ORIGINS`                       | Vacío mientras no exista frontend; luego orígenes HTTPS exactos separados por comas |
| `TRUST_PROXY_HOPS`                   | `1` detrás del ingress público de Railway; `0` en local                             |
| `AVAILABILITY_SLOT_INTERVAL_MINUTES` | `15`                                                                                |
| `PORT`                               | Automático de Railway; no definir manualmente                                       |
| `RAILPACK_NODE_NPM_INSTALL`          | `npm ci --include=dev`                                                              |

El backend valida la configuración antes de escuchar. `PORT` es obligatorio en
producción; el fallback `3000` se reserva a desarrollo/tests. La configuración JWT
existente valida secretos distintos y expiraciones `s`, `m`, `h` o `d`. Si la base
no responde al iniciar, el proceso termina con código distinto de cero.

Generar **dos** secretos en una terminal privada, ejecutando dos veces:

```bash
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Pegar los resultados directamente en Railway Variables. No compartirlos en
capturas, documentación, commits ni mensajes. No se proporcionan secretos de
producción predeterminados.

## Build, migraciones y arranque

| Campo Railway       | Configuración                                                |
| ------------------- | ------------------------------------------------------------ |
| Builder             | Railpack                                                     |
| Root Directory      | `/server`                                                    |
| Config File         | `/server/railway.json`                                       |
| Install             | `npm ci --include=dev`, mediante `RAILPACK_NODE_NPM_INSTALL` |
| Build Command       | `npm run build`                                              |
| Pre-Deploy Command  | `npm run db:deploy`                                          |
| Start Command       | `npm start`                                                  |
| Healthcheck Path    | `/api/health`                                                |
| Healthcheck Timeout | `120` segundos                                               |
| Restart Policy      | On Failure, máximo 3 reintentos                              |

`build` ejecuta `prisma generate && tsc -p tsconfig.json` y produce `dist/`.
`start` ejecuta `node dist/server.js` en `0.0.0.0:$PORT`. Se fija Node 22 en
`server/package.json`. TypeScript se necesita durante el build y Prisma CLI es
dependencia de producción para que siga disponible en pre-deploy.

`db:deploy` ejecuta **`prisma migrate deploy`**, equivalente a
`npx prisma migrate deploy`. Railway lo ejecuta en el contenedor pre-deploy con
acceso a las variables y la red privada. Si falla, no debe promoverse esa versión.
El build genera el cliente pero no abre conexión a la base; la URL debe estar
definida para cargar `prisma.config.ts`.

Se preservan las cuatro migraciones existentes, sin editar ni reconstruir el
historial. No usar `migrate dev`, `db push` ni seed en producción. Para futuras
migraciones, crear archivos nuevos en desarrollo y probarlos sobre una base
vacía y sobre una base existente. Mantener compatibilidad entre versiones durante
la transición; rollback del código no revierte automáticamente el esquema ni los
datos. Hacer backup antes de cambios destructivos.

## CORS, proxy y autenticación

`CORS_ORIGINS` acepta, por ejemplo,
`https://booklypro.vercel.app,https://booklypro.example.com`. No usar comodines,
paths, credenciales en URL ni slash final. Vacío significa que ningún origen
cross-origin recibe permiso del navegador. Sin variable, desarrollo permite
`http://localhost:5173`; producción no permite ninguno.

Se permiten Authorization y Content-Type, y preflight OPTIONS. No se habilitan
credenciales de cookies: access y refresh tokens mantienen el diseño JSON/Bearer
actual. Por ello no hay cambios en `httpOnly`, `secure` o `sameSite`. Usar HTTPS
para transportar tokens. CORS no sustituye autenticación ni bloquea clientes como
curl o Postman.

`TRUST_PROXY_HOPS=1` confía en el proxy inmediato para que el rate limiting de
autenticación use la IP cliente. No usar `trust proxy=true`. Evitar rutas directas
al proceso que salten el ingress y revisar el conteo si se añade Cloudflare u
otro proxy. El limitador existente usa memoria por proceso: no es una cuota
distribuida entre réplicas.

Helmet configura headers de seguridad; JSON conserva el límite de 100 KB. Los
errores inesperados mantienen el mensaje público genérico. Los logs registran
startup, errores inesperados y cierre, sin bodies, tokens, SQL, URLs de conexión
ni valores de variables. SIGTERM/SIGINT detienen HTTP y desconectan Prisma; hay un
timeout de 10 segundos para conexiones que no terminan.

## Verificación y release

Antes de promover `develop` a `main`:

```bash
npm run lint
npm run format:check
npm run db:validate
npm run build
npm test
npm run test:integration
```

Las pruebas de integración usan bases temporales del Docker local e incluyen auth,
businesses, services, employees, schedules, availability y appointments. No
ejecutarlas contra la base productiva.

Flujo: `feature/*` → `develop` → pruebas → merge `--no-ff` a `main` → CI → Railway.
Publicar la feature antes de integrarla. Publicar `main` solamente después de las
pruebas y crear el tag anotado `v0.1.0` (**BooklyPro backend MVP**) sobre esa versión
verificada. Volver a `develop`. No desplegar automáticamente ramas feature.

Smoke tests remotos sin crear datos:

```bash
curl -i https://DOMINIO-RAILWAY/api/health
curl -i https://DOMINIO-RAILWAY/api/auth/me
```

Esperado: health **200** con
`{"data":{"status":"ok","service":"booklypro-api","database":"connected"}}`;
`auth/me` sin token **401 UNAUTHORIZED**. Si PostgreSQL falla, health devuelve
**503 DATABASE_UNAVAILABLE**, nunca un falso `connected`. El health check de
Railway valida la disponibilidad al desplegar; no sustituye monitorización continua.
Solo probar login/registro con una cuenta de prueba controlada y un plan para
retirarla; no crear usuarios demo automáticamente en producción.

## Troubleshooting

- **npm ci sin lockfile:** confirmar Root Directory y que `server/package-lock.json`
  está versionado. Para actualizarlo: `cd server` y
  `npm install --package-lock-only --workspaces=false`; actualizar también el
  lockfile raíz con `npm install --package-lock-only` desde la raíz.
- **No encuentra TypeScript:** usar instalación con `--include=dev` durante build.
- **Prisma no disponible en pre-deploy:** instalar dependencias de `server`, donde
  Prisma CLI está en `dependencies`; no ejecutar migraciones con un binario
  descargado improvisadamente de otra versión.
- **Invalid environment:** revisar los nombres de campos indicados, sin publicar
  valores. Comprobar secretos distintos y `PORT` proporcionado por Railway.
- **Database connection failed / health 503:** revisar referencia DATABASE_URL,
  estado de PostgreSQL y que ambos servicios estén en el mismo entorno.
- **Migración fallida:** consultar los logs privados y reparar la causa; no borrar
  el historial ni usar `db push`. Revisar permisos de `CREATE EXTENSION btree_gist`.
- **502:** revisar startup, puerto público y que el proceso escuche en `0.0.0.0`.
- **CORS en navegador:** incluir el origen exacto, sin path/slash; no añadir `*`.
- **Deploy esperando CI:** revisar el workflow y todos sus checks en GitHub.

La auditoría de dependencias detecta cuatro avisos altos existentes en la cadena
del CLI Prisma (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). BooklyPro usa
PostgreSQL, no MySQL, y la configuración Prisma proviene de archivos controlados;
esto no equivale a una auditoría limpia. Se conservan las versiones compatibles
con Prisma 7: el arreglo automático propuesto degrada a Prisma 6 y rompe esta
arquitectura. Revisar actualizaciones compatibles antes de ampliar el uso en
producción; no aplicar `npm audit fix --force`.

Referencias oficiales:
[monorepos](https://docs.railway.com/deployments/monorepo),
[configuración versionada](https://docs.railway.com/config-as-code/reference),
[pre-deploy](https://docs.railway.com/deployments/pre-deploy-command),
[autodeploy y Wait for CI](https://docs.railway.com/deployments/github-autodeploys),
[Railpack Node](https://railpack.com/languages/node/),
[Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).
