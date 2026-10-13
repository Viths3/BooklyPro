# BooklyPro

Plataforma SaaS de reservas para pequenos negocios, desarrollada por fases como proyecto Full Stack.

## Estado actual

Backend con PostgreSQL, modelo relacional, migraciones, seed de desarrollo, health check y autenticacion. Registro, login, refresh, logout y consulta del usuario autenticado estan disponibles. La gestion de negocios ya permite crear, consultar, editar y desactivar. La gestion de servicios incluye catalogo publico y administracion por propietario. La gestion de empleados permite administrar personal y asignarle servicios. Los horarios semanales de negocios y empleados ya se pueden configurar. La consulta publica de disponibilidad calcula slots por servicio, empleado y fecha. Las reservas permiten crear citas, consultar historial, cancelar y gestionar estados. Las reseñas incluyen una valoracion por cita completada y resumen publico. El frontend permite registro, login, logout, dashboard protegido y consulta de negocios, servicios, empleados y reseñas; todavia no permite reservar.

Stack: Node.js 22.13+, Express 5, TypeScript estricto, Prisma 7, PostgreSQL 17, Zod, bcrypt, jsonwebtoken, ESLint, Prettier y npm workspaces. Docker ejecuta solamente PostgreSQL. El frontend usa React, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form y Vitest con Testing Library.

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
{
  "data": {
    "status": "ok",
    "service": "booklypro-api",
    "database": "connected"
  }
}
```

Devuelve HTTP 200 si PostgreSQL responde; en caso contrario HTTP 503 con `error.code: "DATABASE_UNAVAILABLE"` y `error.message`, sin detalles internos. El servidor puede arrancar sin conexion a PostgreSQL para informar del fallo. El adaptador limita a tres segundos cada espera de conexion y consulta. No necesita tablas para ejecutar el health check.

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
  "data": {
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
$session = (Invoke-RestMethod "$api/login" -Method Post -ContentType 'application/json' -Body $credentials).data
Invoke-RestMethod "$api/me" -Headers @{ Authorization = "Bearer $($session.accessToken)" }
$refreshBody = @{ refreshToken = $session.refreshToken } | ConvertTo-Json
$session = (Invoke-RestMethod "$api/refresh" -Method Post -ContentType 'application/json' -Body $refreshBody).data
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
- Validacion fallida: 400; credenciales/token invalido: 401; rol insuficiente: 403; email duplicado: 409. Los errores mantienen `{ "error": { "code": "...", "message": "..." } }`; Zod incluye details con campo y mensaje. Consultar [convenciones de API](docs/api-conventions.md).

Referencias: [bcrypt y limite de 72 bytes](https://github.com/kelektiv/node.bcrypt.js/), [verificacion de JWT](https://github.com/auth0/node-jsonwebtoken), [configuracion Prisma 7](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference).

## Estructura

```text
BooklyPro/
├── client/README.md              # Frontend pendiente
├── server/
│   ├── prisma/                  # Schema, migraciones y seed
│   ├── scripts/test-integration.mjs    # Base temporal de integracion
│   ├── src/
│   │   ├── config/              # Entorno, Prisma y JWT
│   │   ├── controllers/         # HTTP: health, auth y negocios
│   │   ├── routes/
│   │   ├── services/            # Autenticacion y negocios
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
- La exclusion GiST con btree_gist impide citas solapadas del mismo empleado incluso con concurrencia. Intervalos `[inicio, fin)` permiten citas contiguas; solo PENDING y CONFIRMED bloquean el intervalo; CANCELLED, COMPLETED y NO_SHOW no lo bloquean.
- Indices por propietario, catalogos activos, agendas por cliente/negocio/empleado y fecha, estado/fecha y fecha global; reseñas por negocio/fecha; tokens por usuario, familia y expiracion.
- Borrados restrictivos conservan historial; solo horarios y tokens dependientes usan cascada.
- La API ya valida propiedad, estados activos e integridad de EmployeeService. Las futuras reservas deberan validar tambien la asignacion, duracion e interseccion de horarios, transiciones de estado y citas completadas para publicar valoraciones.

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

`npm test` usa node:test y tsx para pruebas HTTP sin base de datos. `test:integration` requiere el contenedor PostgreSQL iniciado y la configuracion de la raiz `.env`: crea una base aleatoria booklypro_test_*, aplica las migraciones y ejecuta pruebas HTTP reales de autenticacion, negocios, servicios, empleados y horarios, cada suite con una base separada. Usa secretos JWT efimeros y elimina solo esa base al terminar; no utiliza ni limpia la base de desarrollo/produccion.

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

La entrega actual incluye feature/frontend-setup. El flujo de reservas del frontend queda para una tarea posterior.

## Gestion de negocios

| Metodo | Endpoint              | Acceso y respuesta                                           |
| ------ | --------------------- | ------------------------------------------------------------ |
| GET    | `/api/businesses`     | Publico; 200 con data y pagination                           |
| GET    | `/api/businesses/:id` | Publico; 200 con data; 404 si falta o esta inactivo          |
| GET    | `/api/businesses/me`  | Autenticado; 200 con todos sus negocios, incluidos inactivos |
| POST   | `/api/businesses`     | Autenticado; 201 con data y cabecera Location                |
| PATCH  | `/api/businesses/:id` | Solo propietario; 200 con data                               |
| DELETE | `/api/businesses/:id` | Solo propietario; 204, desactivacion idempotente             |

`/me` se declara antes de `/:id` y siempre obtiene el propietario del contexto autenticado; no utiliza filtros ownerId del cliente. Las respuestas seleccionan solo campos del negocio, nunca relaciones del propietario, emails de usuarios, contrasenas ni tokens. Se envian con Cache-Control: no-store para evitar cachear negocios desactivados o respuestas privadas.

### Creacion, permisos y transacciones

Crear un negocio y promover al usuario CUSTOMER a BUSINESS_OWNER forman una unica transaccion. Si falla la creacion, el rol no cambia. La actualizacion condicional del rol permite creaciones concurrentes y mantiene intacto el rol ADMIN. El mismo access token sirve para las nuevas operaciones: el middleware consulta el rol actual en PostgreSQL.

Un usuario puede tener varios negocios. El cliente no puede asignar ownerId, active ni role. La comprobacion de propiedad esta centralizada en BusinessService; la escritura vuelve a filtrar por propietario. Sin autenticacion se responde 401; otro propietario recibe 403; un ID inexistente recibe 404. ADMIN no tiene una excepcion administrativa: solo modifica negocios propios en esta fase.

DELETE establece active=false, conserva el historial y responde 204 tambien si ya estaba desactivado. El negocio deja de aparecer en listado y detalle publicos, incluso cuando quien consulta el detalle es el propietario. El propietario sigue viendolo en /me y puede editar sus datos descriptivos; PATCH no permite reactivarlo. Su rol permanece BUSINESS_OWNER tras desactivar todos los negocios.

Los endpoints de servicios ya comprueban que el negocio esta activo. Los endpoints de empleados tambien lo comprueban y las futuras reservas deberan hacerlo; BusinessService.getActive() ya centraliza la consulta que rechaza negocios inactivos. Esta entrega reutiliza el esquema existente, sin nuevas migraciones ni dependencias.

### Validacion, busqueda y paginacion

- POST requiere name (1-150 caracteres tras eliminar espacios exteriores).
- description (maximo 5000), phone (3-30, caracteres telefonicos), address (maximo 500) e imageUrl (HTTP(S), maximo 2048, sin credenciales) son opcionales y aceptan null para borrarlos.
- PATCH permite solo esos cinco campos, exige al menos uno y conserva los omitidos. No admite id, ownerId, active, role, createdAt ni relaciones internas.
- Los IDs se validan como UUID. Los cuerpos y las queries publicas rechazan campos desconocidos; los errores de validacion devuelven 400.
- page: entero entre 1 y 10000, predeterminado 1. limit: entero entre 1 y 100, predeterminado 10.
- search: hasta 150 caracteres, busqueda parcial por nombre sin distinguir mayusculas. Los caracteres %, _ y barra inversa se tratan literalmente; las consultas usan parametros Prisma.
- sortBy: name o createdAt (predeterminado createdAt). order: asc o desc (predeterminado desc). ID desempata para una ordenacion estable.
- El total y la pagina se consultan en una transaccion RepeatableRead para obtener una vista consistente. Las paginas fuera del rango devuelven data vacia con el total real; un resultado sin coincidencias tiene totalPages=0.

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 10, "total": 0, "totalPages": 0 }
}
```

### Probar los seis endpoints en PowerShell

Usar el access token obtenido con el login del ejemplo de autenticacion:

```powershell
$businessApi = 'http://localhost:3000/api/businesses'
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
$body = @{ name = 'Bookly Barber Shop'; description = 'Barberia profesional'; phone = '+593999999999'; address = 'Cuenca, Ecuador'; imageUrl = 'https://example.com/barber.jpg' } | ConvertTo-Json
$created = Invoke-RestMethod $businessApi -Method Post -Headers $headers -ContentType 'application/json' -Body $body
$businessId = $created.data.id
Invoke-RestMethod "${businessApi}?page=1&limit=10&search=barber&sortBy=name&order=asc"
Invoke-RestMethod "$businessApi/$businessId"
Invoke-RestMethod "$businessApi/me" -Headers $headers
$patch = @{ name = 'Bookly Barber Shop Centro'; description = $null } | ConvertTo-Json
Invoke-RestMethod "$businessApi/$businessId" -Method Patch -Headers $headers -ContentType 'application/json' -Body $patch
Invoke-RestMethod "$businessApi/$businessId" -Method Delete -Headers $headers
Invoke-RestMethod "$businessApi/me" -Headers $headers
```

Tras DELETE, la consulta publica por ID devuelve 404; /me conserva el negocio con active=false. No usar un access token expirado: iniciar otra sesion o renovar con el refresh vigente.

Las pruebas de integracion cubren los doce escenarios solicitados, inyeccion de campos protegidos, datos invalidos, busqueda literal, permisos de ADMIN, rollback del rol ante fallo y creacion concurrente. Ejecutarlas con `npm run test:integration`; la suite anterior de autenticacion tambien se ejecuta para detectar regresiones.

## Servicios del negocio

| Metodo | Endpoint                                      | Acceso y respuesta                                                      |
| ------ | --------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/businesses/:businessId/services`        | Publico; 200 con servicios activos de un negocio activo                 |
| GET    | `/api/services/:id`                           | Publico; 200 si servicio y negocio estan activos, 404 en caso contrario |
| GET    | `/api/businesses/:businessId/services/manage` | Solo propietario; incluye servicios desactivados y negocios inactivos   |
| POST   | `/api/businesses/:businessId/services`        | Solo propietario de negocio activo; 201 y cabecera Location             |
| PATCH  | `/api/services/:id`                           | Solo propietario de negocio activo; actualizacion parcial, 200          |
| DELETE | `/api/services/:id`                           | Solo propietario; desactivacion idempotente, 204                        |

Los listados devuelven `{ "data": [] }` y se ordenan por nombre ascendente e ID como desempate. Un negocio activo sin servicios devuelve una lista vacia; un negocio inexistente o inactivo devuelve 404 en la ruta publica. El detalle, POST y PATCH devuelven `{ "data": { ... } }`. Ninguna respuesta contiene relaciones, ownerId, empleados ni datos del usuario propietario.

### Precios, duracion y validacion

POST exige name, price y durationMinutes. description es opcional y admite null. El nombre se recorta y debe tener entre 1 y 150 caracteres; description admite hasta 5000. active queda true y businessId procede exclusivamente de la URL.

El precio acepta un numero JSON como `8` o un texto decimal como `"8.00"`. Para conservar exactamente el valor original, se recomienda enviar texto decimal. Se normaliza a texto sin operaciones aritmeticas de coma flotante y se persiste con `new Prisma.Decimal(...)` en Decimal(12,2). El rango permitido es de 0 a 9999999999.99, con hasta dos decimales. No se redondean entradas invalidas: valores negativos, decimales adicionales, exponentes en texto, null o booleanos devuelven 400.

Todas las respuestas serializan el precio como texto con exactamente dos decimales:

```json
{
  "data": {
    "id": "UUID",
    "name": "Corte de cabello",
    "description": "Corte clasico",
    "price": "8.00",
    "durationMinutes": 30,
    "active": true
  }
}
```

La duracion es un numero entero de 1 a 1440 minutos, consistente con el CHECK existente. Se rechazan 0, negativos, fracciones y textos como `"30"`. IDs deben ser UUID validos. No se necesitan cambios en el esquema ni migraciones nuevas.

PATCH permite name, description, price, durationMinutes y active; exige al menos un campo y conserva los omitidos. No acepta id, businessId, ownerId, createdAt, updatedAt ni relaciones. POST tampoco admite active. `active: true` reactiva un servicio si el negocio sigue activo.

### Autorizacion y desactivacion

La comprobacion de propiedad se comparte con la gestion de negocios. Sin autenticacion: 401; usuario ajeno (incluido ADMIN): 403; entidad inexistente: 404. El propietario no se obtiene del body.

Crear o editar en un negocio inactivo devuelve 409, incluida la reactivacion de servicios. Estas escrituras bloquean la fila del negocio dentro de una transaccion para que una desactivacion concurrente no permita saltarse la comprobacion de active. Las consultas publicas verifican tanto el estado del servicio como el de su negocio.

DELETE conserva la fila y establece active=false. Devuelve 204 aunque el servicio ya estuviera desactivado; tambien se permite en un negocio inactivo para administrar su historial. /manage permanece disponible para el propietario en ambos casos. Las asignaciones a empleados se documentan en la seccion siguiente.

### Ejemplo en PowerShell

Usar un negocio activo propio y un access token vigente obtenido mediante login:

```powershell
$api = 'http://localhost:3000/api'
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
$businessId = 'UUID_DEL_NEGOCIO'
$body = @{ name = 'Corte de cabello'; description = 'Corte clasico'; price = '8.00'; durationMinutes = 30 } | ConvertTo-Json
$createdService = Invoke-RestMethod "$api/businesses/$businessId/services" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
$serviceId = $createdService.data.id
Invoke-RestMethod "$api/businesses/$businessId/services"
Invoke-RestMethod "$api/services/$serviceId"
Invoke-RestMethod "$api/businesses/$businessId/services/manage" -Headers $headers
$patch = @{ price = '9.50'; durationMinutes = 45 } | ConvertTo-Json
Invoke-RestMethod "$api/services/$serviceId" -Method Patch -Headers $headers -ContentType 'application/json' -Body $patch
Invoke-RestMethod "$api/services/$serviceId" -Method Delete -Headers $headers
Invoke-RestMethod "$api/services/$serviceId" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"active":true}'
```

`npm run test:integration` ejecuta tambien la suite de servicios, en su propia base temporal. Comprueba catalogos vacios, permisos, campos protegidos, decimales exactos y sus limites, duraciones invalidas, edicion parcial, soft delete, reactivacion y ocultacion/bloqueo cuando el negocio esta inactivo.

## Gestion de empleados y asignaciones

| Metodo | Ruta                                           | Acceso y respuesta                                                  |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------- |
| GET    | `/api/businesses/:businessId/employees`        | Publico; empleados activos de negocio activo, 200                   |
| GET    | `/api/businesses/:businessId/employees/manage` | Propietario; todos los empleados y servicios asignados, 200         |
| GET    | `/api/employees/:id`                           | Publico; empleado y negocio activos, incluye servicios activos, 200 |
| POST   | `/api/businesses/:businessId/employees`        | Propietario de negocio activo; 201 y Location                       |
| PATCH  | `/api/employees/:id`                           | Propietario de negocio activo; parcial, 200                         |
| DELETE | `/api/employees/:id`                           | Propietario; desactivacion idempotente, 204                         |
| GET    | `/api/employees/:id/services`                  | Publico; empleado, negocio y servicios activos, 200                 |
| POST   | `/api/employees/:id/services/:serviceId`       | Propietario; asigna un servicio, 204                                |
| DELETE | `/api/employees/:id/services/:serviceId`       | Propietario; quita solo la relacion, idempotente, 204               |

Los listados usan `{ "data": [] }`; detalle, creacion y edicion usan `{ "data": {...} }`. El listado publico de empleados solo incluye id, firstName y lastName; el detalle agrega services. Nunca exponen email, phone, businessId ni auditoria del empleado. Los listados se ordenan por apellido, nombre e ID; servicios por nombre e ID. Los precios se mantienen como texto decimal de dos posiciones, por ejemplo `"8.10"`.

POST exige firstName y lastName (recortados, 1-100 caracteres). email es opcional, se recorta, normaliza a minusculas y valida (maximo 254); phone admite 3-30 caracteres numericos, espacios y signos + ( ) . -. Ambos contactos aceptan null para borrarlos. active inicia en true. PATCH admite esos campos y active booleano, y exige al menos uno. Zod rechaza campos internos, relaciones, IDs en el body y UUID invalidos. Un Employee no necesita cuenta User ni tiene login.

Se reutiliza assertBusinessOwner: sin sesion 401, usuario ajeno 403 incluso si es ADMIN, entidad inexistente 404. Un negocio o empleado inactivo devuelve 404 en las rutas publicas correspondientes. Crear, editar/reactivar o asignar en un negocio inactivo devuelve 409. El propietario puede seguir consultando /manage, desactivando empleados y quitando asignaciones con el negocio inactivo.

EmployeeService usa la clave unica existente employeeId + serviceId y las claves foraneas compuestas con businessId. La capa de servicio exige el mismo negocio (400 si no coincide), empleado/servicio activos (409), existencia de ambos (404) y propiedad del negocio. Asignar una relacion existente devuelve 409, tambien con peticiones concurrentes. Las escrituras bloquean la fila Business dentro de la transaccion, igual que la gestion de servicios, para serializar las comprobaciones con las desactivaciones. No se cambiaron modelos ni migraciones.

Desactivar empleados o servicios conserva sus filas y asignaciones. Reactivar un empleado vuelve a mostrar sus servicios activos; servicios inactivos permanecen solo en /manage. Quitar una asignacion elimina exclusivamente EmployeeService. La API de reservas futura debera volver a comprobar estos estados y la asignacion al reservar.

### Ejemplo manual de empleados (PowerShell)

Con `$session` del login, un negocio propio activo y `$serviceId` de un servicio activo creado en el ejemplo anterior:

```powershell
$api = 'http://localhost:3000/api'
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
$body = @{ firstName = 'Carlos'; lastName = 'Mora'; email = 'carlos@example.com'; phone = '+593999999999' } | ConvertTo-Json
$employee = Invoke-RestMethod "$api/businesses/$businessId/employees" -Method Post -Headers $headers -ContentType 'application/json' -Body $body
$employeeId = $employee.data.id
Invoke-RestMethod "$api/employees/$employeeId/services/$serviceId" -Method Post -Headers $headers
Invoke-RestMethod "$api/businesses/$businessId/employees"
Invoke-RestMethod "$api/businesses/$businessId/employees/manage" -Headers $headers
Invoke-RestMethod "$api/employees/$employeeId"
Invoke-RestMethod "$api/employees/$employeeId/services"
Invoke-RestMethod "$api/employees/$employeeId" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"lastName":"Mora Lopez"}'
Invoke-RestMethod "$api/employees/$employeeId" -Method Delete -Headers $headers
Invoke-RestMethod "$api/employees/$employeeId" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"active":true}'
Invoke-RestMethod "$api/employees/$employeeId/services/$serviceId" -Method Delete -Headers $headers
```

La suite `server/test/integration/employee.test.ts` prueba permisos, privacidad, validaciones, estados, reactivacion, asignaciones concurrentes, integridad entre negocios y borrado exclusivo de relaciones. `npm run test:integration` la ejecuta con PostgreSQL real en una base temporal aislada y aplica las migraciones existentes; tambien ejecuta las regresiones de autenticacion, negocios y servicios. Verificar con `npm run lint`, `npm run format:check`, `npm run build`, `npm test` y `npm run test:integration`.

## Horarios de negocios y empleados

| Metodo | Ruta                                               | Acceso                                               |
| ------ | -------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/api/businesses/:businessId/schedules`            | Publico, negocio activo                              |
| PUT    | `/api/businesses/:businessId/schedules`            | Propietario, reemplaza semana completa               |
| PATCH  | `/api/businesses/:businessId/schedules/:dayOfWeek` | Propietario, modifica un dia configurado             |
| GET    | `/api/employees/:employeeId/schedules`             | Publico, empleado y negocio activos                  |
| PUT    | `/api/employees/:employeeId/schedules`             | Propietario del negocio, reemplaza semana completa   |
| PATCH  | `/api/employees/:employeeId/schedules/:dayOfWeek`  | Propietario del negocio, modifica un dia configurado |

Todas las respuestas exitosas son 200 con `{ "data": [...] }`, incluida la semana resultante de PUT/PATCH. El orden es MONDAY a SUNDAY. Se devuelven exclusivamente dayOfWeek, las dos horas y active; se incluyen los dias cerrados configurados. Una entidad activa sin configuracion devuelve una lista vacia. Negocio inexistente/inactivo o empleado inexistente/inactivo en consultas publicas: 404.

PUT recibe `{ "schedules": [...] }` con 0-7 dias unicos. **Reemplaza la semana:** los dias omitidos se eliminan y se consideran sin horario/no laborables; una lista vacia elimina la configuracion si no hay conflictos. PATCH es parcial, exige al menos un campo y valida el intervalo completo combinado con los valores almacenados; no crea dias inexistentes (404, configurar antes mediante PUT). Campos desconocidos, IDs internos y dayOfWeek dentro del body de PATCH se rechazan.

Las horas de entrada usan HH:mm exacto, de 00:00 a 23:59. No se aceptan `9:00`, `24:00`, `25:00`, `12:75`, segundos ni minutos numericos. Se almacenan como enteros de minutos desde medianoche, sin conversion UTC ni uso de Date. Horarios activos exigen openingTime < closingTime o startTime < endTime. No hay turnos nocturnos ni varios intervalos por dia. En dias inactivos no se exige orden; se puede conservar el intervalo anterior o enviar 00:00-00:00.

La migracion **20261012200000_inactive_schedule_intervals** ajusta unicamente los CHECK de ambas tablas para permitir intervalos iguales en dias inactivos, manteniendo limites numericos y el orden obligatorio en dias activos. No cambia schema.prisma ni migraciones anteriores: estos CHECK se expresan en SQL. Conserva el limite historico de fin de dia 1440 en la base para no invalidar filas anteriores; si existieran, las respuestas muestran ese extremo como 24:00, aunque las nuevas entradas de la API llegan hasta 23:59. Aplicar con `npm run db:deploy` antes de usar las nuevas rutas.

Se reutiliza **Business.timeZone**, ya existente con valor IANA por defecto America/Guayaquil. Las horas representan la hora local del negocio. No se agrega otro campo ni una migracion de timezone; la disponibilidad descrita mas abajo utiliza ese mismo campo para convertir fechas e instantes.

### Propiedad, conflictos y transacciones

Se comparte assertBusinessOwner: 401 sin autenticacion y 403 para usuarios ajenos, tambien ADMIN. Solo el propietario puede modificar horarios. Los cambios requieren negocio activo (409 si no lo esta). Se permite al propietario corregir horarios de empleados inactivos antes de reactivarlos, aunque sus GET publicos devuelvan 404.

Cada dia laboral del empleado debe tener un dia activo del negocio con apertura <= inicio < fin <= cierre. Un dia ausente del negocio equivale a cerrado. Los conflictos entre horarios devuelven **409**. Reducir, cerrar o eliminar un dia del negocio que deje empleados fuera de rango devuelve `Business schedule conflicts with existing employee schedules`; no se ajustan empleados silenciosamente. Tambien se revisan horarios activos conservados de empleados desactivados: primero corregir sus horarios y despues cambiar el negocio. Un intervalo individual invalido devuelve 400.

PUT y PATCH comprueban y escriben dentro de una transaccion Prisma que bloquea la fila Business con FOR UPDATE. El mismo bloqueo coordina cambios de negocio, de empleados y de horarios concurrentes. PUT elimina y recrea los registros semanales atomicamente; no mantiene los IDs internos del horario, que no se exponen en esta API. PATCH mantiene el registro del dia. Las claves unicas existentes businessId + dayOfWeek y employeeId + dayOfWeek siguen evitando duplicados. Si una escritura falla, toda la transaccion se revierte.

### Ejemplo manual de horarios (PowerShell)

Usar el token de login, un negocio activo propio y un empleado de ese negocio de los ejemplos anteriores:

```powershell
$api = 'http://localhost:3000/api'
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
$businessWeek = @{ schedules = @(
  @{ dayOfWeek = 'MONDAY'; openingTime = '09:00'; closingTime = '18:00'; active = $true }
  @{ dayOfWeek = 'TUESDAY'; openingTime = '09:00'; closingTime = '18:00'; active = $true }
  @{ dayOfWeek = 'WEDNESDAY'; openingTime = '00:00'; closingTime = '00:00'; active = $false }
) } | ConvertTo-Json -Depth 4
Invoke-RestMethod "$api/businesses/$businessId/schedules" -Method Put -Headers $headers -ContentType 'application/json' -Body $businessWeek
$employeeWeek = @{ schedules = @(
  @{ dayOfWeek = 'MONDAY'; startTime = '10:00'; endTime = '17:00'; active = $true }
  @{ dayOfWeek = 'TUESDAY'; startTime = '09:00'; endTime = '15:00'; active = $true }
  @{ dayOfWeek = 'WEDNESDAY'; startTime = '00:00'; endTime = '00:00'; active = $false }
) } | ConvertTo-Json -Depth 4
Invoke-RestMethod "$api/employees/$employeeId/schedules" -Method Put -Headers $headers -ContentType 'application/json' -Body $employeeWeek
Invoke-RestMethod "$api/businesses/$businessId/schedules"
Invoke-RestMethod "$api/employees/$employeeId/schedules"
Invoke-RestMethod "$api/employees/$employeeId/schedules/MONDAY" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"startTime":"11:00"}'
Invoke-RestMethod "$api/businesses/$businessId/schedules/MONDAY" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"openingTime":"10:00"}'
# Devuelve 409: Carlos aun trabaja hasta las 17:00.
Invoke-RestMethod "$api/businesses/$businessId/schedules/MONDAY" -Method Patch -Headers $headers -ContentType 'application/json' -Body '{"closingTime":"16:00"}'
```

`server/test/integration/schedule.test.ts` prueba ambos tipos de horario, privacidad, ownership, validacion estricta, dias cerrados, limites del negocio, PATCH parcial, reemplazo y vaciado semanal, conflictos, concurrencia y rollback ante un fallo de base de datos despues del borrado. Se ejecuta con `npm run test:integration` junto con las regresiones existentes y aplica las migraciones sobre bases temporales aisladas. Disponibilidad y reservas tienen sus propias suites.

## Consulta de disponibilidad

`GET /api/availability` es publico y exige cuatro query params unicos: `businessId`, `serviceId` y `employeeId` como UUID, y `date` como fecha real `YYYY-MM-DD`. Rechaza parametros desconocidos, repetidos, arrays, fechas inexistentes y fechas anteriores al dia actual **del negocio**.

```powershell
$api = 'http://localhost:3000/api'
# Usar IDs propios de los ejemplos anteriores, con servicio asignado y horarios configurados.
$date = '2030-01-07' # Lunes; sustituir por una fecha local vigente.
Invoke-RestMethod "$api/availability?businessId=$businessId&serviceId=$serviceId&employeeId=$employeeId&date=$date"
```

Ejemplo de respuesta para un empleado que trabaja 09:00-10:00 y un servicio de 30 minutos:

```json
{
  "data": {
    "date": "2030-01-07",
    "businessId": "UUID_DEL_NEGOCIO",
    "serviceId": "UUID_DEL_SERVICIO",
    "employeeId": "UUID_DEL_EMPLEADO",
    "durationMinutes": 30,
    "slots": [
      { "startTime": "09:00", "endTime": "09:30" },
      { "startTime": "09:15", "endTime": "09:45" },
      { "startTime": "09:30", "endTime": "10:00" }
    ]
  }
}
```

### Generacion y consultas

Se verifican negocio, servicio y empleado activos, pertenencia al mismo negocio y asignacion EmployeeService. El dia se obtiene del calendario local, de MONDAY a SUNDAY. BusinessSchedule usa openingTime/closingTime y EmployeeSchedule usa startTime/endTime; se comprueba openingTime <= startTime y endTime <= closingTime. Un horario activo de empleado fuera del negocio devuelve 409, sin recortarlo silenciosamente.

Desde el inicio laboral del empleado se generan candidatos cada **15 minutos**, con duracion Service.durationMinutes, hasta que el servicio deje de caber completo. El paso se configura mediante `AVAILABILITY_SLOT_INTERVAL_MINUTES` (entero 1-1440, por defecto 15) en server/.env y requiere reiniciar la API. La secuencia se ancla al inicio del empleado: 09:07 produce 09:07, 09:22, etc. A 15 minutos son como maximo 96 candidatos por dia, manejables para este modelo. Slots alternativos pueden solaparse entre si; representan opciones, no reservas simultaneas.

Se leen negocio/horario, servicio, empleado/horario/asignacion y citas mediante operaciones Prisma dentro de una transaccion de lectura RepeatableRead. No hay consultas por slot. Las citas se filtran por empleado y por interseccion con el dia local convertido a UTC; se incluyen las que empezaron antes de medianoche. Se seleccionan solo startTime/endTime, sin exponer cliente, notas ni IDs de citas. El filtrado final ocurre en memoria. La respuesta lleva Cache-Control: no-store.

### Citas que bloquean

Solo **PENDING** y **CONFIRMED** bloquean, aunque correspondan a otro servicio del mismo empleado. CANCELLED, COMPLETED y NO_SHOW no bloquean disponibilidad futura. Una cita de otro empleado no afecta el resultado.

Se usa la regla de intervalos semiabiertos: `newStart < existingEnd && newEnd > existingStart`. Una cita 10:00-10:30 bloquea 09:45-10:15, 10:00-10:30 y 10:15-10:45, pero permite empezar a las 10:30. Las comparaciones se realizan entre instantes UTC, conservando segundos y milisegundos.

La migracion **20261012210000_appointment_blocking_statuses** ajusta el predicado de la exclusion GiST existente para que solo incluya PENDING/CONFIRMED, alineando PostgreSQL con la API. Mantiene la proteccion contra solapamientos concurrentes de citas bloqueantes y no elimina ni modifica citas. No se alteraron migraciones anteriores ni modelos Prisma. Aplicar con `npm run db:deploy`.

### Fechas y zona horaria

Se reutiliza Business.timeZone (por defecto America/Guayaquil). Las fechas y horas de salida son locales al negocio; las citas permanecen timestamptz. Se incorporo `@js-temporal/polyfill` para manejar calendario e IANA sin offsets fijos ni depender de la zona del servidor. La [documentacion de Temporal.ZonedDateTime](https://tc39.es/proposal-temporal/docs/zoneddatetime.html) describe las conversiones y opciones de desambiguacion utilizadas.

Para hoy se descartan candidatos cuyo inicio sea anterior al instante actual, incluyendo segundos; un inicio exactamente igual a ahora se permite. Los limites del dia pueden abarcar 23 o 25 horas durante cambios de horario. Como HH:mm no permite distinguir horas locales repetidas, esta version omite candidatos con extremos ambiguos o inexistentes y aquellos cuya duracion real no coincide con los minutos del servicio. No se desplazan silenciosamente las horas. El limite historico de horario 1440 se serializa como 24:00 y corresponde a medianoche del dia siguiente.

| Situacion                                                                         | Resultado           |
| --------------------------------------------------------------------------------- | ------------------- |
| Parametros invalidos o fecha local pasada                                         | 400                 |
| Servicio/empleado de otro negocio o servicio sin asignar                          | 400                 |
| Negocio, servicio o empleado inexistente/inactivo                                 | 404                 |
| Horarios inconsistentes o timezone persistido invalido                            | 409                 |
| Dia cerrado, sin horario, servicio que no cabe o todos los slots ocupados/pasados | 200 con slots vacio |

La consulta es una fotografia de disponibilidad: **no reserva el horario**. POST /api/appointments vuelve a validar y crea la reserva atomicamente, apoyandose en la exclusion PostgreSQL.

### Pruebas de disponibilidad

`npm test` incluye las pruebas unitarias de slots, limites, instantes, zonas con offsets fraccionarios y cambios DST. `npm run test:integration` incluye disponibilidad con reloj inyectado y PostgreSQL real, mas autenticacion, negocios, servicios, empleados y horarios; cada suite usa una base temporal y aplica las cuatro migraciones. Se prueban los estados de citas, solapamientos parciales, contiguedad, medianoche, entidades inactivas, pertenencia, asignaciones, validacion, hoy/fechas pasadas y consistencia de la exclusion SQL.

## Reservas y gestion de citas

El contrato completo, formatos globales, filtros y politica de estados estan en [docs/api-conventions.md](docs/api-conventions.md). **Cambio de contrato:** autenticacion y health ahora envuelven sus respuestas en data; errores incluyen code/message y validacion usa details. Los ejemplos de login anteriores ya extraen .data.

| Metodo | Endpoint                                   | Acceso                                |
| ------ | ------------------------------------------ | ------------------------------------- |
| POST   | `/api/appointments`                        | Autenticado; crea PENDING, 201        |
| GET    | `/api/appointments/me`                     | Citas propias, paginado               |
| GET    | `/api/appointments/:id`                    | Cliente o propietario                 |
| PATCH  | `/api/appointments/:id/cancel`             | Cliente; cancelacion idempotente      |
| GET    | `/api/businesses/:businessId/appointments` | Propietario; paginado                 |
| PATCH  | `/api/appointments/:id/status`             | Propietario; transiciones controladas |

POST toma customerId de la sesion y acepta businessId, serviceId, employeeId, date, startTime y notes opcional (maximo 500). Revalida disponibilidad en la misma transaccion de insercion; calcula endTime y conserva priceAtBooking. Las fechas se interpretan en Business.timeZone y se responden en UTC ISO 8601. Los precios son strings con dos decimales. No hay bypass ADMIN.

PENDING permite CONFIRMED/CANCELLED; CONFIRMED permite COMPLETED/CANCELLED/NO_SHOW. Los demas son finales. El cliente solo cancela PENDING/CONFIRMED; repetir CANCELLED por /cancel devuelve 200. El propietario usa /status; confirmar una CONFIRMED es idempotente. No hay anticipacion minima para cancelar ni borrado de citas.

El bloqueo transaccional de Business coordina creacion con cambios de horarios, empleados y servicios. La exclusion GiST existente impide solapamientos de PENDING/CONFIRMED incluso con concurrencia o escrituras directas. Los cambios de estado bloquean Appointment. Los conflictos devuelven 409 con codigo estable. No se necesita migracion nueva ni otra dependencia en esta feature.

/me acepta status, from, to, page y limit. El listado del negocio tambien date, employeeId y serviceId. from/to son ISO 8601 con Z/offset y rango [from,to); date usa el dia local del negocio y no se combina con from/to. Se filtra el inicio de cita. Orden ascendente por inicio e ID; limit por defecto 20, maximo 100. El historial sigue accesible con entidades desactivadas.

### Ejemplo manual (PowerShell)

Con negocio, empleado y servicio activos y asignados, y horarios configurados; usar una fecha local vigente. Customer y ownerSession son los datos .data de los respectivos logins:

```powershell
$api = 'http://localhost:3000/api'
$customerHeaders = @{ Authorization = "Bearer $($customer.accessToken)" }
$ownerHeaders = @{ Authorization = "Bearer $($ownerSession.accessToken)" }
$date = '2030-01-07'
$availability = Invoke-RestMethod "$api/availability?businessId=$businessId&serviceId=$serviceId&employeeId=$employeeId&date=$date"
if ($availability.data.slots.Count -eq 0) { throw 'No hay horarios disponibles' }
$body = @{ businessId = $businessId; serviceId = $serviceId; employeeId = $employeeId; date = $date; startTime = $availability.data.slots[0].startTime; notes = 'Primera visita' } | ConvertTo-Json
$appointment = (Invoke-RestMethod "$api/appointments" -Method Post -Headers $customerHeaders -ContentType 'application/json' -Body $body).data
$appointmentId = $appointment.id
Invoke-RestMethod "$api/appointments/me?page=1&limit=10" -Headers $customerHeaders
Invoke-RestMethod "$api/appointments/$appointmentId" -Headers $customerHeaders
Invoke-RestMethod "$api/businesses/$businessId/appointments?date=$date" -Headers $ownerHeaders
Invoke-RestMethod "$api/appointments/$appointmentId/status" -Method Patch -Headers $ownerHeaders -ContentType 'application/json' -Body '{"status":"CONFIRMED"}'
Invoke-RestMethod "$api/appointments/$appointmentId/cancel" -Method Patch -Headers $customerHeaders
```

La suite appointment.test.ts cubre autorizacion, estados finales, precios historicos, filtros, errores estandarizados, cancelaciones repetidas, reservas concurrentes iguales/parcialmente solapadas/adyacentes, transiciones concurrentes y proteccion SQL. Se ejecuta con `npm run test:integration`, junto con todas las regresiones. Las cuatro migraciones existentes permanecen intactas.

## Reseñas

| Método | Ruta                                      | Acceso                          |
| ------ | ----------------------------------------- | ------------------------------- |
| POST   | `/api/appointments/:appointmentId/review` | Cliente autenticado de esa cita |
| GET    | `/api/businesses/:businessId/reviews`     | Público                         |
| GET    | `/api/reviews/:id`                        | Público                         |

Solo una cita `COMPLETED` puede recibir una reseña, y solo una por cita. Una cita
ajena devuelve `403 FORBIDDEN`, sin bypass para propietario ni ADMIN. Los estados
`PENDING`, `CONFIRMED`, `CANCELLED` y `NO_SHOW` devuelven
`409 APPOINTMENT_NOT_REVIEWABLE`. El estado COMPLETED es terminal en la API.
Las citas completadas pueden reseñarse aunque el negocio se desactive; sus reseñas
siguen siendo públicas como historial. No se requiere que el negocio esté activo.

Ejemplo de body (sin IDs ni campos internos):

```json
{ "rating": 5, "comment": "Excelente atención" }
```

`rating` es un número entero obligatorio entre 1 y 5, sin coerción desde texto.
`comment` es un string opcional, con trim y máximo 1000 caracteres después del
trim; omitido o vacío se guarda como `null`. El body no acepta `null` explícito ni
otros tipos para comment. El servidor toma customerId de la sesión y businessId de
la cita, y devuelve `201 { data: { id, rating, comment, createdAt } }` con Location.

El listado acepta `page` (1 por defecto, máximo 1000000) y `limit` (20 por defecto,
máximo 100), ambos enteros positivos. Ordena por `createdAt DESC, id DESC` para
desempatar de forma estable. Una página fuera de rango devuelve data vacío sin
perder el total ni el summary. El promedio se calcula con aggregate de Prisma sobre
**todas** las reseñas del negocio, redondeado a un decimal; no se guarda en Business.
JSON puede representar `5.0` como `5`. Sin reseñas, averageRating es `null`.

```json
{
  "data": [
    {
      "id": "UUID",
      "rating": 5,
      "comment": "Excelente atención",
      "createdAt": "2026-10-12T20:00:00.000Z",
      "customer": { "firstName": "Juan" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "summary": { "averageRating": 5, "totalReviews": 1 }
}
```

El detalle individual añade únicamente `business: { id, name }` a los campos
públicos del listado. No se exponen customerId, appointmentId, apellidos, email,
teléfono, credenciales ni relaciones privadas. Un negocio inexistente devuelve
`404 BUSINESS_NOT_FOUND`; una reseña inexistente, `404 REVIEW_NOT_FOUND`.

La aplicación comprueba duplicados antes de insertar; la restricción UNIQUE
existente sobre Review.appointmentId impide también duplicados concurrentes.
Ambos casos devuelven `409 REVIEW_ALREADY_EXISTS` sin códigos Prisma/SQL internos.
La FK compuesta existente exige que cita, cliente y negocio coincidan. No se
modificaron el schema ni las cuatro migraciones. Listado, existencia del negocio
y aggregate se leen en una transacción RepeatableRead para compartir snapshot.

Las pruebas de `server/test/integration/review.test.ts` se ejecutan automáticamente
con `npm run test:integration` y en CI, sobre una base temporal PostgreSQL local.
Esta feature no añade edición, borrado ni moderación de reseñas.

## Deployment

La [guía de despliegue en Railway](docs/deployment.md) documenta PostgreSQL remoto,
Root Directory `/server`, variables, CORS, migraciones en pre-deploy y health checks.
El servicio despliega desde `main` después de CI; Docker continúa siendo la base
local. La configuración está en `server/railway.json` y el pipeline en
`.github/workflows/backend.yml`. No se ejecutan seeds en producción.

## Frontend setup

Desde la raíz del repositorio, instalar y configurar el paquete independiente:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

En PowerShell usar `Copy-Item .env.example .env`; conservar el archivo si ya existe.
Abrir **http://localhost:5173**. `client/.env` define
`VITE_API_URL=http://localhost:3000` (origen, sin `/api`). La variable es pública y
se incorpora al build; nunca poner secretos en variables VITE_.

Flujo local, en terminales separadas:

```bash
# Terminal 1, raíz
docker compose up -d

# Terminal 2, raíz
cd server
npm run dev

# Terminal 3, raíz
cd client
npm run dev
```

El backend necesita las variables y migraciones descritas arriba. Mantener
`http://localhost:5173` en `CORS_ORIGINS` si se configura explícitamente.
Las rutas incluyen landing, login, registro, catálogo, detalle y dashboard
protegido. Los tokens se mantienen únicamente en memoria: recargar requiere
iniciar sesión de nuevo. No hay reservas ni creación de reseñas en la interfaz.

Verificar desde `client/` con `npm run build`, `npm run lint` y `npm test`.
La [documentación del cliente](client/README.md) explica estructura, sesiones,
refresh concurrente, contratos API y limitaciones. El backend conserva sus scripts
en la raíz y el cliente tiene CI separado en `.github/workflows/frontend.yml`.
