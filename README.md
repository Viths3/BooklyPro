# BooklyPro

Plataforma SaaS de reservas para pequeños negocios: barberías, consultorios, talleres y salones. Proyecto de portafolio desarrollado por fases.

## Estado: Fase 1

Base del backend, modelo relacional completo, primera migración PostgreSQL y `GET /api/health`. No hay autenticación, CRUD de negocios, motor de reservas ni frontend todavía.

## Stack

Implementado: Node.js 22.13+, Express 5, TypeScript estricto, Prisma 7 con adaptador PostgreSQL, PostgreSQL 17, Zod, ESLint, Prettier, npm workspaces y Docker Compose.

Futuro: React, Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form y Zod; JWT y refresh tokens para autenticación. No se usa MongoDB.

## Requisitos

- Node.js 22.13 o superior (recomendado: Node 22 LTS) y npm 10+.
- Docker Desktop en ejecución, con contenedores Linux y Docker Compose.
- Git.
- Puertos 3000 (API) y 5432 (PostgreSQL) disponibles.

## Instalación y ejecución

Desde la raíz, en PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item server/.env.example server/.env
npm ci
docker compose up -d --wait
npm run db:generate
npm run dev
```

En Bash, usar `cp` en lugar de `Copy-Item`. Si los archivos `.env` ya existen, conservar sus valores. Las credenciales de ejemplo son exclusivamente locales. Si cambias usuario, contraseña, puerto o base de datos, actualiza también `server/.env`.

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Respuesta:

```json
{ "status": "ok", "service": "booklypro-api", "database": "connected" }
```

Es un endpoint de liveness: comprueba que el proceso HTTP responde, no consulta PostgreSQL en cada petición. El servidor sí exige conexión a PostgreSQL durante el arranque.

Para compilar y ejecutar el JavaScript generado:

```sh
npm run build
npm start
```

Para detener PostgreSQL sin perder datos: `docker compose down`. Los datos permanecen en un volumen; cambiar las variables de inicialización no cambia las credenciales de un volumen ya creado.

## Variables de entorno

| Archivo       | Variable            | Uso / ejemplo                                                     |
| ------------- | ------------------- | ----------------------------------------------------------------- |
| `.env`        | `POSTGRES_USER`     | Usuario local: `booklypro`                                        |
| `.env`        | `POSTGRES_PASSWORD` | Contraseña local; debe coincidir con DATABASE_URL                 |
| `.env`        | `POSTGRES_DB`       | Base local: `booklypro`                                           |
| `.env`        | `POSTGRES_PORT`     | Puerto expuesto: `5432`                                           |
| `server/.env` | `DATABASE_URL`      | `postgresql://booklypro:booklypro_local@localhost:5432/booklypro` |
| `server/.env` | `NODE_ENV`          | `development`, `test` o `production`                              |
| `server/.env` | `PORT`              | Puerto HTTP: `3000`                                               |

Zod valida la configuración al arrancar y no imprime credenciales si falla. Prisma CLI carga `server/.env` mediante `prisma.config.ts`. Los scripts del workspace se ejecutan desde `server/`.

## Estructura

```text
BooklyPro/
├── client/README.md               # Reservado para una fase posterior
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── src/
│   │   ├── config/                # Entorno y conexión Prisma
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── services/              # Lógica de negocio futura
│   │   ├── repositories/          # Acceso a datos futuro
│   │   ├── middleware/
│   │   ├── schemas/               # DTOs Zod futuros
│   │   ├── utils/
│   │   ├── types/
│   │   ├── app.ts                 # Aplicación HTTP comprobable sin BD
│   │   └── index.ts               # Arranque y cierre ordenado
│   ├── test/
│   ├── prisma.config.ts
│   ├── tsconfig.json
│   └── .env.example
├── docker-compose.yml
├── eslint.config.mjs
├── .prettierrc.json
├── .env.example
├── .gitignore
├── package-lock.json
└── package.json
```

## Modelo y decisiones

- Diez entidades: User, Business, Employee, Service, EmployeeService, BusinessSchedule, EmployeeSchedule, Appointment, Review y RefreshToken.
- UUID como identificadores; roles `CUSTOMER`, `BUSINESS_OWNER` y `ADMIN`. Un propietario tiene varios negocios. Los empleados son recursos del negocio, no usuarios con acceso propio.
- Claves compuestas garantizan que empleados, servicios y citas pertenezcan al mismo negocio; cada reseña coincide con el cliente y negocio de su cita y solo existe una por cita.
- Dinero con `Decimal(12,2)`, moneda ISO de tres letras por negocio y precio acordado en la cita. Cambiar el precio del servicio no modifica el historial.
- Fechas absolutas con `timestamptz`; zona IANA por negocio, inicialmente `America/Guayaquil`. La futura capa de reservas convertirá horario local a instantes UTC.
- Horarios semanales: domingo = 0 y sábado = 6; `openingTime` y `closingTime` son minutos desde medianoche (09:00 = 540, 18:00 = 1080). Un intervalo por día, sin turnos nocturnos ni pausas múltiples en esta versión. Sin horario activo, no se debe ofrecer disponibilidad. La disponibilidad será la intersección del horario del negocio y del empleado.
- SQL añade comprobaciones de rangos, importes y fechas. Una exclusión GiST con `btree_gist` impide solapamientos para el mismo empleado, incluso bajo concurrencia. Intervalos `[inicio, fin)` permiten citas contiguas. Solo `CANCELLED` libera el intervalo; el historial de citas completadas y ausencias también conserva su exclusividad.
- Borrados restrictivos protegen el historial; empleados y servicios se desactivarán. Solo horarios y tokens dependientes usan cascada.
- Se almacena `passwordHash`, nunca la contraseña; `tokenHash` está preparado para SHA-256 de un token aleatorio y `familyId` para rotación y revocación. El hashing seguro de contraseñas y el protocolo de tokens se implementarán en Fase 2.
- Índices para propietario, catálogos por negocio, agendas por cliente/negocio y limpieza de tokens. Email de usuario normalizado a minúsculas y sin espacios exteriores mediante constraint.
- Las carpetas de capas futuras quedan vacías intencionalmente: el endpoint health no necesita un repositorio ni un servicio artificial.

### Reglas que implementará la capa de negocio

La Fase 1 no expone rutas para crear citas ni reseñas. En futuras transacciones, el servicio de reservas deberá validar roles/propiedad, relación EmployeeService, empleado y servicio activos, intersección de horarios y calcular `endTime` desde la duración vigente. Cambiar duración/horarios no debe reescribir citas históricas. El servicio de reseñas verificará que la cita esté completada y pertenezca al usuario autenticado. Los cambios de estado tendrán transiciones explícitas. Estas reglas entre registros no se sustituyen por simples CHECK de PostgreSQL.

## Migraciones

```sh
npm run db:validate
npm run db:deploy
```

`db:deploy` aplica las migraciones versionadas. Para cambios posteriores del esquema, solo en desarrollo:

```sh
npm run db:migrate -- --name descripcion_del_cambio
npm run db:generate
```

La primera migración contiene SQL manual (CHECK y exclusión) que Prisma no representa completamente. Conservarlo en el historial; no reemplazar migraciones con `db push`. El usuario de migraciones necesita permiso para instalar `btree_gist` (el usuario local de Docker lo tiene). Para nuevas migraciones de desarrollo, Prisma necesita permiso para crear su base de datos shadow.

## Verificaciones

```sh
npm run lint
npm run format:check
npm run db:validate
npm run build
npm test
```

Las pruebas HTTP verifican health, 404, JSON inválido, límites de payload y que los errores 500 no filtren detalles. No requieren PostgreSQL.

## Git y siguiente fase

`.env`, dependencias, compilados y cliente Prisma generado están excluidos de Git. Mantener `package-lock.json`, ejemplos de entorno y migraciones versionados. Nunca subir credenciales reales.

Ejemplos de commits: `chore: initialize backend workspace`, `feat: add relational schema and initial migration`, `test: verify API foundation`.

Fase 2 recomendada: registro/login, hashing de contraseñas, JWT de acceso de corta duración, rotación de refresh tokens con revocación, validación Zod, middleware de autenticación y autorización por rol/propietario, con pruebas de seguridad. Después: negocios, servicios, empleados y horarios; luego disponibilidad y reservas transaccionales; finalmente frontend.

Referencia de configuración: [Prisma ORM 7](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference).

### Pruebas de PostgreSQL

Con el contenedor iniciado y la migración aplicada, en PowerShell:

```powershell
Get-Content -Raw server/test/constraints.sql | docker compose exec -T postgres psql -U booklypro -d booklypro -v ON_ERROR_STOP=1
```

Ajustar usuario/base si cambiaste el entorno. Las fixtures se ejecutan dentro de una transacción que termina en `ROLLBACK`. Verifican intervalos contiguos, solapamientos, cancelación, relaciones entre negocios y CHECK de importes, horarios y rating.

### Avisos de dependencias

La revisión inicial con `npm audit` detectó cuatro entradas de severidad alta en el árbol de Prisma 7.10.0 (`prisma`, `@prisma/config`, `deepmerge-ts` y `mysql2`); también aparecen con `--omit=dev` por las relaciones de dependencias de Prisma. MySQL no se utiliza en esta aplicación. La corrección automática propuesta implica bajar a Prisma 6, incompatible con esta configuración; no se aplicó `audit fix --force`. Revisar actualizaciones compatibles antes de un despliegue público. Esta base es de desarrollo y no implementa aún los controles de autenticación de la Fase 2.

## Flujo de ramas

Repositorio: https://github.com/Viths3/BooklyPro.git. Las instrucciones permanentes estan en [AGENTS.md](AGENTS.md).

- `main`: versiones estables integradas desde `develop`.
- `develop`: rama de integracion y base de nuevas funcionalidades.
- `feature/*`: una funcionalidad o tarea importante por rama.

```sh
git switch develop
git pull --ff-only origin develop
git switch -c feature/nombre-de-la-funcionalidad
# Implementar, comprobar y hacer commits descriptivos.
git status
git diff
git diff --cached
git push -u origin feature/nombre-de-la-funcionalidad
git switch develop
git pull --ff-only origin develop
git merge --no-ff feature/nombre-de-la-funcionalidad
git push origin develop
```

Al completar una fase estable y comprobada:

```sh
git switch main
git pull --ff-only origin main
git merge --no-ff develop
git push origin main
git switch develop
```

No desarrollar directamente en `main`, no usar force push y no borrar ramas con trabajo sin integrar. Si hay conflictos, resolverlos conservando los cambios pertinentes y repetir las verificaciones antes de publicar. Una feature integrada puede eliminarse con `git branch -d feature/nombre` y, despues de comprobar su integracion remota, `git push origin --delete feature/nombre`.

La Fase 1 se implemento antes de existir historial Git. Su registro inicial se separo por responsabilidad en `feature/project-setup`, `feature/database-setup`, `feature/prisma-schema` y `feature/health-endpoint`; no representa desarrollo historico previo. `feature/git-workflow` agrega estas reglas y finales de linea consistentes entre Windows y Linux. El commit raiz vacio es solo el punto de partida de `main`. La promocion de esta fase a `main` queda pendiente de revisar los avisos de dependencias documentados arriba.

Para inspeccionar la evolucion:

```sh
git log --graph --oneline --decorate --all
```

### Verificar la infraestructura local

Antes de iniciar, abrir Docker Desktop. Solo PostgreSQL se ejecuta en Docker:

```sh
docker version
docker compose up -d --wait
docker compose ps
docker compose exec postgres pg_isready -U booklypro -d booklypro
npm run db:validate
```

El contenedor debe aparecer como saludable. Los datos permanecen en un volumen administrado por Docker, fuera del repositorio. La API corre en Node.js local.

Tras configurar ambos archivos de entorno, tambi?n puedes iniciar desde el backend:

```sh
cd server
npm install
npm run dev
```

El script `predev` genera autom?ticamente el cliente Prisma. Para instalaciones reproducibles se recomienda `npm ci` desde la ra?z, usando el lockfile del monorepo. Para generar el cliente manualmente: `npm run db:generate` desde la ra?z o desde `server/`.

Para comprobar una ca?da en tu entorno local, mant?n la API encendida, ejecuta `docker compose stop postgres` y consulta `/api/health`: debe responder 503. Despu?s ejecuta `docker compose up -d --wait` y repite la consulta: debe volver a responder 200. La parada afecta a las conexiones locales al contenedor; no borra el volumen.

## Esquema relacional completo

La migraci?n incremental `20261012170000_complete_core_schema` completa el esquema existente sin reescribir la primera migraci?n. A?ade `Role.ADMIN`, `Business.active`, `DayOfWeek`, auditor?a de horarios/rese?as e ?ndices de agenda. Convierte domingo=0 a `SUNDAY` y los dem?s d?as de forma expl?cita; renombra las horas del empleado sin perder datos. Para registros anteriores, las fechas de auditor?a de horarios comienzan en la migraci?n; las rese?as toman su `createdAt` como `updatedAt` inicial. Despu?s Prisma mantiene `updatedAt` (las escrituras SQL directas deben proporcionarlo).

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

### ?ndices y restricciones

- Email ?nico (normalizado en min?sculas); UUID consistentes en claves primarias y for?neas.
- ?ndices de negocio por propietario y por `active, name` para listado ordenado. Este ?ltimo no es b?squeda de texto completo.
- Empleados y servicios por `businessId, active`.
- Citas por cliente/fecha, negocio/fecha, empleado/fecha y estado/fecha. Un ?ndice de fecha permite consultas cronol?gicas globales sin exigir una entidad o estado concreto; no se a?ade otro ?ndice simple de estado porque ya lo cubre el compuesto.
- Rese?as por negocio/fecha y cliente; una ?nica rese?a por cita. La clave compuesta adicional permite a Prisma expresar que coincida tambi?n su cliente y negocio.
- Tokens por usuario, familia y expiraci?n; solo se almacena el hash, nunca el token original.
- Claves compuestas impiden mezclar servicios, empleados y citas de negocios diferentes. La redundancia controlada de `businessId` permite que PostgreSQL garantice esa integridad.
- Un horario por negocio/d?a y empleado/d?a. El enum restringe los d?as y los CHECK validan minutos de 0 a 1440 con inicio menor que fin.
- CHECK existentes: rating 1?5, precio no negativo, duraci?n de 1 a 1440 minutos, fin de cita posterior al inicio, formato y vigencia de tokens y moneda de tres letras.
- Se conserva la exclusi?n GiST con `btree_gist` de la primera migraci?n: protege contra solapamientos concurrentes sin implementar a?n el motor de disponibilidad.
- Borrados restringidos para conservar historial. Cascada ?nicamente en horarios dependientes y tokens, que no tienen sentido sin su entidad propietaria.

El rol del propietario, la pertenencia del cliente autenticado, que una rese?a corresponda a una cita completada y la disponibilidad dentro de horarios se validar?n en la futura capa de negocio. No se a?aden triggers para implementar esa l?gica en esta fase.

### Migraciones y seed

Desde la ra?z y con los dos archivos `.env` configurados:

```sh
docker compose up -d --wait
npm run db:validate
npm run db:generate
npm run db:deploy
npm run db:seed
```

El seed solo permite `NODE_ENV=development`. Usa una transacci?n y upserts: repetirlo conserva los datos existentes y no duplica filas. Crea:

- Propietaria Ana Demo (`owner@booklypro.example`) y cliente Luis Demo (`customer@booklypro.example`).
- BooklyPro Barber?a Demo, moneda USD y zona America/Guayaquil.
- Corte de cabello: USD 15, 30 minutos; arreglo de barba: USD 8, 20 minutos.
- Empleado Carlos Demo, asignado a ambos servicios.
- Horario de negocio lunes?viernes 09:00?18:00 y de empleado 09:00?17:00.

No crea citas, rese?as ni refresh tokens. No hay contrase?a p?blica de prueba: el seed genera credenciales aleatorias, guarda un hash scrypt con salt y descarta el valor original. No implementa login. Los UUID fijos de las fixtures de negocio, empleado y servicios est?n reservados para este seed; si los datos existentes entran en conflicto, la transacci?n falla en vez de sobrescribirlos.

### Reset exclusivo de desarrollo

**El siguiente comando elimina todos los datos locales del esquema configurado en DATABASE_URL.** Comprueba que apunta a la base de desarrollo antes de ejecutarlo; no usar en producci?n. No es necesario para aplicar esta migraci?n incremental.

```sh
cd server
npx prisma migrate reset
npx prisma generate
npx prisma db seed
```

El reset vuelve a aplicar el historial de migraciones; el seed se ejecuta expl?citamente. No se ha reseteado la base existente durante esta tarea.
