# BooklyPro

Plataforma SaaS de reservas para pequenos negocios, desarrollada por fases como proyecto Full Stack de portafolio.

## Estado actual

Backend con PostgreSQL, modelo relacional, migraciones, seed de desarrollo, health check y autenticacion. Registro, login, refresh, logout y consulta del usuario autenticado estan disponibles. No hay frontend ni CRUD de negocios o reservas todavia.

Stack: Node.js 22.13+, Express 5, TypeScript estricto, Prisma 7, PostgreSQL 17, Zod, bcrypt, jsonwebtoken, ESLint, Prettier y npm workspaces. Docker ejecuta solamente PostgreSQL. El frontend futuro usara React, Vite, Tailwind CSS, React Router, TanStack Query y React Hook Form.

## Requisitos e instalacion

- Node.js 22.13 o superior y npm 10+.
- Docker Desktop iniciado, con contenedores Linux y Docker Compose.
- Git y puertos 3000/5432 disponibles.

Desde PowerShell:

```powershell
git clone --branch develop https://github.com/Viths3/BooklyPro.git
cd BooklyPro
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
npm ci
```

Si los archivos `.env` ya existen, conservarlos. En Bash, usar `cp` en lugar de `Copy-Item`. Configurar dos secretos JWT diferentes en `server/.env`; generar cada valor ejecutando por separado:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Copiar cada resultado en la variable correspondiente y no compartirlo ni versionarlo. Los campos de secretos en `.env.example` estan vacios intencionalmente.

```sh
docker compose up -d --wait
npm run db:generate
npm run db:deploy
npm run dev
```

`predev` genera el cliente Prisma automaticamente. Para ejecutar desde `server/`, usar `npm install` y `npm run dev` tras configurar los entornos y aplicar las migraciones. Se recomienda `npm ci` desde la raiz para instalaciones reproducibles.

```sh
npm run build
npm start
```

## Variables de entorno

| Archivo       | Variable                 | Uso                                                              |
| ------------- | ------------------------ | ---------------------------------------------------------------- |
| `.env`        | `POSTGRES_USER`          | Usuario local, por defecto `booklypro`                           |
| `.env`        | `POSTGRES_PASSWORD`      | Clave de desarrollo local                                        |
| `.env`        | `POSTGRES_DB`            | Base local `booklypro`                                           |
| `.env`        | `POSTGRES_PORT`          | Puerto local `5432`                                              |
| `server/.env` | `DATABASE_URL`           | URL PostgreSQL; debe coincidir con las variables de Docker       |
| `server/.env` | `NODE_ENV`               | `development`, `test` o `production`                             |
| `server/.env` | `PORT`                   | Puerto HTTP, por defecto `3000`                                  |
| `server/.env` | `JWT_ACCESS_SECRET`      | Secreto aleatorio de al menos 32 caracteres                      |
| `server/.env` | `JWT_ACCESS_EXPIRES_IN`  | `15m` por defecto; maximo una hora                               |
| `server/.env` | `JWT_REFRESH_SECRET`     | Secreto aleatorio distinto del de acceso, al menos 32 caracteres |
| `server/.env` | `JWT_REFRESH_EXPIRES_IN` | `7d` por defecto; maximo 30 dias                                 |

Las duraciones aceptan enteros positivos con sufijo `s`, `m`, `h` o `d`. Zod valida la configuracion sin imprimir sus valores. La autenticacion impide arrancar el servidor con secretos ausentes, cortos o iguales. Prisma y el seed solo requieren la configuracion de base de datos.

Ejemplo local de `DATABASE_URL`: `postgresql://booklypro:booklypro_local@localhost:5432/booklypro`. Las credenciales de ejemplo son solo para desarrollo. Cambiar las variables de inicializacion no modifica las credenciales de un volumen PostgreSQL ya creado.

## Infraestructura y health check

```sh
docker version
docker compose ps
docker compose exec postgres pg_isready -U booklypro -d booklypro
```

`GET http://localhost:3000/api/health` ejecuta `SELECT 1` mediante Prisma en cada peticion:

```json
{ "status": "ok", "service": "booklypro-api", "database": "connected" }
```

Devuelve HTTP 200 si PostgreSQL responde; en caso contrario HTTP 503 con `status: "error"` y `database: "disconnected"`, sin detalles internos. El servidor puede arrancar sin conexion a PostgreSQL para informar del fallo. El adaptador limita a tres segundos cada espera de conexion y consulta. No necesita tablas para ejecutar el health check.

Para comprobar una caida local, mantener la API encendida, ejecutar `docker compose stop postgres` y consultar el endpoint; debe responder 503. Restaurar con `docker compose up -d --wait`; debe volver a responder 200. `docker compose down` detiene PostgreSQL sin borrar su volumen persistente.

## Autenticacion

| Metodo | Endpoint             | Resultado                                               |
| ------ | -------------------- | ------------------------------------------------------- |
| POST   | `/api/auth/register` | 201, usuario seguro con rol CUSTOMER; no crea sesion    |
| POST   | `/api/auth/login`    | 200, usuario, access token y refresh token              |
| POST   | `/api/auth/refresh`  | 200, nueva pareja de tokens; revoca el refresh anterior |
| POST   | `/api/auth/logout`   | 204, revoca la familia de refresh tokens de esa sesion  |
| GET    | `/api/auth/me`       | 200, usuario actual; requiere Bearer access token       |

Registro acepta `firstName`, `lastName`, `email` y `password`; rechaza campos adicionales como `role`. Normaliza el email a minusculas y elimina espacios exteriores. Contrasena: minimo 12 caracteres y maximo 72 bytes UTF-8; no se recorta ni normaliza. bcrypt usa coste 12. El limite de bytes evita truncamiento silencioso de bcrypt.

Login devuelve:

```json
{
  "user": {
    "id": "UUID",
    "firstName": "Juan",
    "lastName": "Guaman",
    "email": "juan@example.com",
    "role": "CUSTOMER"
  },
  "accessToken": "ACCESS_TOKEN",
  "refreshToken": "REFRESH_TOKEN",
  "tokenType": "Bearer",
  "expiresIn": 900
}
```

No se devuelven passwordHash, hashes de tokens ni datos de sesiones persistidas. Las respuestas de autenticacion y health usan `Cache-Control: no-store`.

### Probar el flujo en PowerShell

Con el servidor iniciado:

```powershell
$api = 'http://localhost:3000/api/auth'
$registration = @{ firstName = 'Juan'; lastName = 'Guaman'; email = 'juan@example.com'; password = 'Password123!' } | ConvertTo-Json
Invoke-RestMethod "$api/register" -Method Post -ContentType 'application/json' -Body $registration
$credentials = @{ email = 'juan@example.com'; password = 'Password123!' } | ConvertTo-Json
$session = Invoke-RestMethod "$api/login" -Method Post -ContentType 'application/json' -Body $credentials
Invoke-RestMethod "$api/me" -Headers @{ Authorization = "Bearer $($session.accessToken)" }
$refreshBody = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
$session = Invoke-RestMethod "$api/refresh" -Method Post -ContentType 'application/json' -Body $refreshBody
$logoutBody = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
Invoke-RestMethod "$api/logout" -Method Post -ContentType 'application/json' -Body $logoutBody
```

`Password123!` es solo un ejemplo local. No utilizarlo en produccion. Guardar siempre el refresh nuevo: reutilizar el anterior se considera replay e invalida la familia. El segundo registro del mismo email devuelve 409.

En Bash, curl permite el mismo flujo:

```sh
curl -X POST http://localhost:3000/api/auth/register -H 'Content-Type: application/json' -d '{"firstName":"Juan","lastName":"Guaman","email":"juan@example.com","password":"Password123!"}'
curl -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"juan@example.com","password":"Password123!"}'
curl http://localhost:3000/api/auth/me -H 'Authorization: Bearer ACCESS_TOKEN'
curl -X POST http://localhost:3000/api/auth/refresh -H 'Content-Type: application/json' -d '{"refreshToken":"REFRESH_TOKEN"}'
curl -X POST http://localhost:3000/api/auth/logout -H 'Content-Type: application/json' -d '{"refreshToken":"NEW_REFRESH_TOKEN"}'
```

### Tokens y decisiones de seguridad

- JWT HS256 con algoritmo permitido explicitamente, emisor `booklypro-api`, audiencias y tipos distintos para acceso/refresh. El JWT de acceso contiene sub, rol y claims de control; el refresh contiene sub y un jti aleatorio unico, sin datos personales.
- Acceso: 15 minutos. Refresh: 7 dias desde cada emision (expiracion deslizante). Secretos independientes; no se confunden los dos tipos de token.
- PostgreSQL guarda SHA-256 del refresh, UUID de sesion, usuario, familia, expiracion y revocacion. La busqueda usa el hash y comprueba usuario e identificador; nunca se guarda el token original.
- Rotacion atomica en una transaccion con bloqueo de la fila del usuario. Dos refresh simultaneos permiten una sola rotacion; el segundo se considera replay y revoca la familia, incluido el reemplazo. El cliente debe serializar renovaciones.
- Logout revoca toda la familia correspondiente, incluso si se presenta un token anterior valido. Repetirlo devuelve 204. Un token con firma invalida o expirado devuelve 401. Otros logins del mismo usuario mantienen familias independientes.
- **Logout no invalida inmediatamente los access tokens emitidos**: siguen siendo validos hasta su expiracion, como maximo 15 minutos con la configuracion predeterminada. No hay lista de revocacion de access tokens en esta fase.
- `authenticate()` consulta el usuario en PostgreSQL despues de verificar el JWT; `authorizeRoles()` usa ese rol actual, no un rol obsoleto del token. Usuarios eliminados no pueden acceder.
- Login usa el mismo error para email inexistente o clave incorrecta y hace una comparacion bcrypt tambien cuando no encuentra usuario. Registro devuelve 409 para duplicados por requisito de la API: ese endpoint permite inferir que un email existe.
- Limites por IP en memoria: registro/login comparten 20 intentos por 15 minutos; refresh/logout comparten 60 por minuto. Devuelven 429. Antes de desplegar multiples instancias se requiere almacenamiento compartido; configurar proxies de confianza solo conociendo la topologia real.
- Los tokens se transportan en JSON y el acceso mediante Authorization, sin cookies ni almacenamiento frontend en esta fase. Para un despliegue real se requiere HTTPS y definir la estrategia de almacenamiento del futuro cliente. No guardar tokens en logs ni URLs.
- Validacion fallida: 400; credenciales/token invalido: 401; rol insuficiente: 403; email duplicado: 409. Los errores mantienen `{ "error": { "message": "..." } }`; los de Zod pueden incluir nombres de campos, nunca valores sensibles.

Referencias: [bcrypt y limite de 72 bytes](https://github.com/kelektiv/node.bcrypt.js/), [verificacion de JWT](https://github.com/auth0/node-jsonwebtoken), [configuracion Prisma 7](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference).

## Estructura

```text
BooklyPro/
├── client/README.md              # Frontend pendiente
├── server/
│   ├── prisma/                  # Schema, migraciones y seed
│   ├── scripts/test-auth.mjs    # Base temporal de integracion
│   ├── src/
│   │   ├── config/              # Entorno, Prisma y JWT
│   │   ├── controllers/         # HTTP: health y auth
│   │   ├── routes/
│   │   ├── services/            # Flujos de autenticacion
│   │   ├── repositories/        # Persistencia y transacciones
│   │   ├── middleware/          # Errores, validacion, auth y roles
│   │   ├── schemas/             # Validacion Zod
│   │   ├── utils/               # Hashing y JWT
│   │   ├── types/               # Contexto Express tipado
│   │   ├── app.ts
│   │   └── server.ts
│   └── test/                    # HTTP e integracion
├── docker-compose.yml
├── AGENTS.md
└── package.json
```

## Modelo relacional

Tablas: User, Business, Employee, Service, EmployeeService, BusinessSchedule, EmployeeSchedule, Appointment, Review y RefreshToken.

```mermaid
erDiagram
  User ||--o{ Business : owns
  User ||--o{ Appointment : books
  User ||--o{ Review : writes
  User ||--o{ RefreshToken : has
  Business ||--o{ Employee : employs
  Business ||--o{ Service : offers
  Business ||--o{ BusinessSchedule : opens
  Business ||--o{ Appointment : receives
  Business ||--o{ Review : receives
  Employee ||--o{ EmployeeSchedule : works
  Employee ||--o{ EmployeeService : performs
  Service ||--o{ EmployeeService : assigned
  Employee ||--o{ Appointment : attends
  Service ||--o{ Appointment : booked
  Appointment ||--o| Review : receives
```

- UUID consistentes. Roles CUSTOMER, BUSINESS_OWNER y ADMIN; estados de cita PENDING, CONFIRMED, COMPLETED, CANCELLED y NO_SHOW.
- Dinero `Decimal(12,2)`, moneda por negocio y precio acordado en cada cita para conservar historial.
- Fechas absolutas `timestamptz` y zona IANA por negocio. Horarios locales en minutos desde medianoche, enum MONDAY a SUNDAY y un intervalo por dia. Negocio usa openingTime/closingTime y empleado startTime/endTime; no hay pausas multiples ni turnos nocturnos.
- Claves compuestas impiden mezclar negocios en empleados, servicios y citas. La reseña coincide con cliente y negocio de su cita y solo hay una por cita.
- CHECK: rating 1-5, precios no negativos, duracion 1-1440 minutos, horarios coherentes, fechas de tokens y formato de hash/moneda/email.
- La exclusion GiST con btree_gist impide citas solapadas del mismo empleado incluso con concurrencia. Intervalos `[inicio, fin)` permiten citas contiguas; solo CANCELLED libera el intervalo.
- Indices por propietario, catalogos activos, agendas por cliente/negocio/empleado y fecha, estado/fecha y fecha global; reseñas por negocio/fecha; tokens por usuario, familia y expiracion.
- Borrados restrictivos conservan historial; solo horarios y tokens dependientes usan cascada.
- La logica futura debe validar propiedad, rol BUSINESS_OWNER del propietario, servicio y empleado activos, relacion EmployeeService, duracion e interseccion de horarios, transiciones de estado y citas completadas para reseñar. No se ha implementado esa logica todavia.

## Migraciones y seed

```sh
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:seed
```

La migracion `20261012150000_init` crea las tablas y las restricciones SQL personalizadas. `20261012170000_complete_core_schema` añade ADMIN, Business.active, DayOfWeek, auditoria e indices. Conserva los horarios antiguos al convertir domingo=0 a SUNDAY y renombra las columnas del empleado sin borrar datos. Las reseñas anteriores toman createdAt como updatedAt inicial; la auditoria de horarios comienza en la migracion. Prisma mantiene updatedAt en sus escrituras; el SQL directo debe proporcionarlo.

Para futuras migraciones, solo en desarrollo:

```sh
npm run db:migrate -- --name descripcion_del_cambio
npm run db:generate
```

Conservar el SQL personalizado: Prisma no expresa todos los CHECK ni la exclusion. No sustituir migraciones por `db push`. El usuario de migraciones necesita permiso para btree_gist y para crear la base shadow en desarrollo. La autenticacion reutiliza el modelo existente y no necesita otra migracion.

El seed solo admite NODE_ENV=development. Es transaccional y repetible; no duplica ni sobrescribe datos existentes. Crea:

- Ana Demo, BUSINESS_OWNER, owner@booklypro.example; Luis Demo, CUSTOMER, customer@booklypro.example.
- BooklyPro Barberia Demo (USD, America/Guayaquil).
- Corte de cabello: USD 15/30 minutos; arreglo de barba: USD 8/20 minutos.
- Carlos Demo, empleado asignado a ambos servicios.
- Lunes-viernes: negocio 09:00-18:00, empleado 09:00-17:00.

No crea citas, reseñas ni sesiones. Los usuarios antiguos del seed tienen hashes scrypt de valores aleatorios descartados y no disponen de una contraseña de login. Registrar un usuario nuevo para probar autenticacion. Los UUID fijos de negocio, empleado y servicios estan reservados para estas fixtures; los conflictos hacen fallar la transaccion en vez de sobrescribir otros datos.

### Reset de desarrollo

**Este comando elimina todos los datos del esquema indicado en DATABASE_URL.** Comprobar que apunta a desarrollo, nunca a produccion. No es necesario para aplicar nuevas migraciones.

```sh
cd server
npx prisma migrate reset
npx prisma generate
npx prisma db seed
```

## Verificaciones

```sh
npm run lint
npm run format:check
npm run build
npm test
npm run test:integration
```

`npm test` usa node:test y tsx para pruebas HTTP sin base de datos. `test:integration` requiere el contenedor PostgreSQL iniciado y la configuracion de la raiz `.env`: crea una base aleatoria booklypro_test_*, aplica las migraciones y ejecuta pruebas HTTP reales de autenticacion. Usa secretos JWT efimeros y elimina solo esa base al terminar; no utiliza ni limpia la base de desarrollo/produccion.

Cubre registro, duplicados, hashing, validacion y roles, login correcto/incorrecto, me, rotacion, replay, expiracion, logout idempotente, familias independientes, concurrencia, limites de intentos y health.

Pruebas adicionales de constraints, con rollback:

```powershell
Get-Content -Raw server/test/constraints.sql | docker compose exec -T postgres psql -U booklypro -d booklypro -v ON_ERROR_STOP=1
```

La revision de dependencias mantiene cuatro avisos altos transitivos de Prisma 7.10.0, documentados desde la inicializacion (prisma, @prisma/config, deepmerge-ts y mysql2). La solucion automatica propone bajar a Prisma 6; no se ejecuto audit fix --force. Revisar actualizaciones compatibles antes de publicar el servicio.

## Flujo Git

Reglas permanentes en [AGENTS.md](AGENTS.md). main contiene versiones estables; develop es la base de trabajo; cada funcionalidad usa feature/*.

```sh
git switch develop
git pull --ff-only origin develop
git switch -c feature/nombre
# Implementar, revisar git status/diff y verificar antes de integrar.
git push -u origin feature/nombre
git switch develop
git pull --ff-only origin develop
git merge --no-ff feature/nombre
git push origin develop
```

Solo promover una fase estable desde develop a main; despues volver a develop. No usar force push, trabajar directamente en main ni borrar ramas sin integrar. Los .env, credenciales, dependencias, compilados y cliente Prisma generado estan excluidos de Git.

La base inicial se implemento antes de crear el historial; se registro despues por responsabilidades. Los merges posteriores conservan las ramas de funcionalidad. Para ver el arbol: `git log --graph --oneline --decorate --all`.

Siguiente tarea: feature/business-management. No se inicia en esta entrega.
