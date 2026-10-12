# BooklyPro

Plataforma SaaS de reservas para pequenos negocios, desarrollada por fases como proyecto Full Stack de portafolio.

## Estado actual

Backend con PostgreSQL, modelo relacional, migraciones, seed de desarrollo, health check y autenticacion. Registro, login, refresh, logout y consulta del usuario autenticado estan disponibles. La gestion de negocios ya permite crear, consultar, editar y desactivar. La gestion de servicios incluye catalogo publico y administracion por propietario. No hay frontend, empleados, asignaciones ni reservas todavia.

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

`npm test` usa node:test y tsx para pruebas HTTP sin base de datos. `test:integration` requiere el contenedor PostgreSQL iniciado y la configuracion de la raiz `.env`: crea una base aleatoria booklypro_test_*, aplica las migraciones y ejecuta pruebas HTTP reales de autenticacion, negocios y servicios, cada suite con una base separada. Usa secretos JWT efimeros y elimina solo esa base al terminar; no utiliza ni limpia la base de desarrollo/produccion.

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

La entrega actual incluye feature/services-management. No se implementan empleados, asignaciones ni reservas.

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

Los endpoints de servicios ya comprueban que el negocio esta activo. Las futuras operaciones de empleados y reservas tambien deberan hacerlo; BusinessService.getActive() ya centraliza la consulta que rechaza negocios inactivos. Esta entrega reutiliza el esquema existente, sin nuevas migraciones ni dependencias.

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

DELETE conserva la fila y establece active=false. Devuelve 204 aunque el servicio ya estuviera desactivado; tambien se permite en un negocio inactivo para administrar su historial. /manage permanece disponible para el propietario en ambos casos. No se implementan reservas, empleados ni asignaciones en esta feature.

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
