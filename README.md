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
npm run db:deploy
npm run dev
```

En Bash, usar `cp` en lugar de `Copy-Item`. Si los archivos `.env` ya existen, conservar sus valores. Las credenciales de ejemplo son exclusivamente locales. Si cambias usuario, contraseña, puerto o base de datos, actualiza también `server/.env`.

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

Respuesta:

```json
{ "status": "ok", "service": "booklypro-api" }
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
- UUID como identificadores; roles `CUSTOMER` y `BUSINESS_OWNER`. Un propietario tiene varios negocios. Los empleados son recursos del negocio, no usuarios con acceso propio.
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

Sugerencia de commits: `chore: initialize backend workspace`, `feat: add relational schema and initial migration`, `test: verify API foundation`.

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
