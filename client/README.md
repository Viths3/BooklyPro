# BooklyPro · Frontend

Base React + Vite + TypeScript estricto. Tailwind CSS 4 usa `@tailwindcss/vite` y
`@import 'tailwindcss'`. React Router gestiona rutas; TanStack Query cachea lecturas;
React Hook Form y Zod validan formularios. No se utiliza un framework de servidor.
El frontend está desplegado en Railway; esta feature conserva su configuración.

## Inicio local

Desde `client/`:

```bash
npm install
cp .env.example .env
npm run dev
```

En PowerShell usar `Copy-Item .env.example .env` solo si el archivo no existe.
Abrir **http://localhost:5173**. El puerto es estricto: si está ocupado Vite falla
para no cambiar el origen permitido por CORS silenciosamente.

`VITE_API_URL=http://localhost:3000` es el origen del backend, sin `/api` final.
La capa HTTP añade los paths `/api/...`. Vite incorpora esta variable al build:
no contiene secretos y debe configurarse antes de compilar para otro entorno.
En desarrollo se usa localhost como fallback; en un build sin variable, las
operaciones API muestran un error claro de configuración. No hay URL productiva
hardcodeada. `client/.env` y `dist/` están ignorados.

El cliente es un paquete independiente del workspace del servidor. Su lockfile se
instala con `cd client && npm ci`. Los scripts raíz mantienen el flujo backend.
El lint raíz excluye `client`; el cliente y su CI ejecutan su propio ESLint.
Prettier sigue siendo compartido: `npm run format:check` desde la raíz.

## Estructura

```text
src/
├── api/client.ts              # Transporte, contratos y errores
├── components/common/        # Button, Input, Card, estados y ErrorBoundary
├── features/
│   ├── auth/                 # Sesión, provider, validación y formularios
│   ├── businesses/           # Catálogo, detalle, servicios, equipo y reseñas
│   ├── booking/              # Flujo de reserva
│   └── appointments/         # Dashboard, citas, cancelación y reseñas
├── layouts/                  # PublicLayout y DashboardLayout
├── lib/query.ts              # QueryClient y query keys
├── pages/                    # Landing, dashboard y 404
├── routes/ProtectedRoute.tsx # Sesión y roles opcionales
├── test/                     # Vitest + Testing Library + jsdom
├── App.tsx
├── main.tsx
└── styles.css
```

Se crearán carpetas adicionales por feature cuando tengan lógica propia, no
directorios vacíos. Los estilos comunes definen la base visual sin un sistema de
diseño excesivo. Se respetan navegación por teclado y reduced-motion.

## Rutas y datos

Públicas: `/`, `/login`, `/register`, `/businesses`, `/businesses/:businessId`.
Protegidas: `/dashboard`, `/dashboard/appointments`, `/dashboard/businesses`.
Mis citas incluye historial y detalle; Mis negocios permite administrar negocios propios.

El catálogo usa búsqueda por nombre y páginas de 9 negocios. El detalle carga
servicios, empleados y las 5 reseñas más recientes solo tras comprobar el negocio.
El promedio y total proceden del summary del servidor, no de la página visible.
Precios conservan el texto Decimal y se acompañan de la moneda del negocio.
El flujo de reservas y las reseñas de citas completadas están disponibles.

Toda lectura tiene estados de carga, error, reintento y vacío. Las query keys
incluyen ID, página y búsqueda. Stale time: 30 segundos; foco y reconexión conservan
el comportamiento de TanStack Query. Se reintenta hasta dos veces ante fallos de
red/servidor, no ante 4xx. Mutaciones sin reintento automático para evitar duplicar
operaciones. El transporte tiene timeout de 15 segundos y soporta cancelación.

## Autenticación y tokens

El backend entrega access y refresh tokens en JSON; no usa cookies. Ambos quedan
**solo en memoria**, sin localStorage, sessionStorage ni persistencia en caché.
Recargar o cerrar la pestaña requiere iniciar sesión de nuevo. Las pestañas no
comparten sesión. Es una decisión explícita para este backend: no se inventó un
endpoint de cookie HttpOnly ni almacenamiento persistente para refresh tokens.

Login llama `/api/auth/login` y verifica `/api/auth/me` con Bearer antes de habilitar
el dashboard. Register llama `/api/auth/register` y redirige a login con confirmación,
ya que el backend no emite tokens al registrarse. Se respetan nombre/apellido de
hasta 100 caracteres, email normalizado, contraseña de registro de 12 caracteres
mínimo y máximo 72 bytes UTF-8; login permite contraseñas más cortas existentes.

Para futuras consultas privadas usar `session.request`, nunca un fetch adicional.
Ante un 401 se rota el refresh mediante `/api/auth/refresh` y se reintenta una sola
vez. Peticiones concurrentes comparten la renovación. Fallos de refresh o un
segundo 401 limpian sesión y queries. Una generación de sesión evita devolver
respuestas tardías de una cuenta anterior después del logout.

Logout espera una rotación pendiente, envía el refresh vigente a `/api/auth/logout`,
limpia memoria/caché y navega a login. Si falla la red, la sesión local igualmente
se elimina y se informa que no se confirmó la revocación remota. Los tokens nunca
se registran en logs ni se añaden a URLs. `credentials: omit` mantiene el contrato
sin cookies. La autorización real permanece en el backend.

El backend local admite `http://localhost:5173` por defecto en development. Si ya
definiste `CORS_ORIGINS` explícitamente, incluir ese origen. No se modificó CORS del
backend ni se habilitaron comodines.

## Verificación

```bash
npm run build
npm run lint
npm test
```

CI instala con `npm ci` y ejecuta estos checks. Las pruebas cubren navegación,
formularios, rutas protegidas, estados de consultas, detalle, errores y sesión
con refresh concurrente, logout y respuestas tardías.

El hosting actual es Railway, con Root Directory `/client`, soporte SPA y
`VITE_API_URL` definido durante el build. Se conserva el dominio autorizado en Vite:
https://booklypro-web-production.up.railway.app. La API permanece en
https://booklypro.up.railway.app con Root Directory `/server`.

## Booking flow

Desde el detalle del negocio, **Reservar cita** abre `/businesses/:businessId/book`.
El wizard permite elegir servicio, profesional, fecha y horario, revisar el resumen
y crear una cita `PENDING`. El precio se muestra como texto Decimal con su moneda.

Se consultan los servicios activos y los empleados públicos del negocio. Para cada
empleado se consulta `/api/employees/:id/services` y se incluyen solo los asignados
al servicio. El backend requiere un empleado concreto: no existe selección automática.
Esta estrategia implica una petición adicional por empleado; no se cambió el backend.

Las fechas se validan contra el día actual de `Business.timeZone`. Se envían `date`
como YYYY-MM-DD y `startTime` como HH:mm, sin convertir la selección a UTC. La
confirmación muestra el instante devuelto por la API en la zona del negocio.

TanStack Query gestiona negocio, servicios, profesionales elegibles y disponibilidad.
La key de disponibilidad incluye negocio, servicio, empleado y fecha. La mutation
usa `session.request` y envía solo businessId, serviceId, employeeId, date, startTime
y notas opcionales (hasta 500 caracteres). No reintenta automáticamente la creación.
El botón se bloquea mientras se envía para evitar dobles clics.

Al confirmar sin sesión, login recibe un returnTo interno validado. Solo se conservan
los IDs y fecha/hora públicos; se revalidan contra la API al volver. No se persisten
notas, datos personales ni tokens. También se conserva el retorno si se pasa por
registro. Recargar conserva únicamente las selecciones que estén en la URL de retorno;
la sesión y las notas siguen siendo solo de memoria. Se requiere confirmar de nuevo
tras login: nunca se crea una cita automáticamente.

Cambiar servicio limpia profesional, fecha y horario; cambiar profesional o fecha
limpia el horario. Ante APPOINTMENT_SLOT_UNAVAILABLE se muestra un mensaje específico,
se limpia el slot, se invalida disponibilidad y se vuelve a elegir horario. Los errores
de negocio ofrecen mensajes legibles y los pasos permiten regresar para corregirlos.

Después del éxito, **Ver mis citas** dirige al dashboard del cliente. El historial,
cancelación y reseñas ya están disponibles. No hay pagos,
reprogramación. La administración del propietario se describe a continuación.

## Customer Dashboard

Las rutas protegidas `/dashboard`, `/dashboard/appointments` y
`/dashboard/appointments/:appointmentId` permiten consultar la próxima cita, listar
citas con filtro de estado y paginación, y abrir su detalle. Los enlaces directos
vuelven al destino interno tras login. Las fechas se muestran en la zona del negocio.

El resumen consulta PENDING y CONFIRMED desde el momento de abrir la página, con
limit=1 y sus totales. La lista usa el filtro status y la paginación del servidor;
las secciones Próximas e Historial agrupan solo la página visible, sin duplicados.
Una cita futura cancelada o finalizada pertenece a Historial. La lista mantiene
el orden ascendente que ofrece la API, sin descargar todas las páginas.

Solo el cliente de una cita PENDING o CONFIRMED puede cancelarla, previa confirmación.
La actualización renueva detalle, listas, resumen y disponibilidad sin recargar.
Para COMPLETED sin reseña, el formulario permite una valoración entera de 1 a 5
y comentario opcional de hasta 1000 caracteres. Una reseña existente bloquea
nuevos envíos. No se permite editar o borrar reseñas.

Cambio mínimo de backend: GET /api/appointments/:id añade hasReview, obtenido por
la relación existente en la consulta de detalle. Era necesario porque la API no
ofrecía búsqueda de reseñas por cita; no se realizan consultas por cada tarjeta.
Se preservan permisos y campos anteriores, sin cambios de schema ni migraciones.
Las respuestas de listado, creación y cancelación conservan su contrato anterior.

## Business Owner Dashboard

La entrada es `/dashboard/businesses`. Las pantallas de cada negocio son:

- `/dashboard/businesses/:businessId`: resumen, información, edición y desactivación.
- `/dashboard/businesses/:businessId/services`: crear, editar, desactivar y reactivar servicios.
- `/dashboard/businesses/:businessId/employees`: gestionar empleados y asignar/quitar servicios.
- `/dashboard/businesses/:businessId/schedules`: editor semanal de negocio y empleados.
- `/dashboard/businesses/:businessId/appointments`: reservas, filtros y cambios de estado.

Las rutas reutilizan la sesión existente. Antes de montar una pantalla de gestión,
`GET /api/businesses/me` verifica que el negocio está entre los del usuario.
CUSTOMER puede crear su primer negocio; `GET /api/auth/me` actualiza la sesión tras
la promoción del backend. Si esa consulta falla se permite reintentar la actualización
sin repetir la creación. ADMIN también necesita ser propietario. El backend sigue
siendo la autoridad para todas las operaciones. Los enlaces directos regresan al
panel correspondiente tras login; recargar continúa cerrando la sesión en memoria.

### APIs y contratos

| Área         | Endpoints utilizados                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| Negocios     | GET `/api/businesses/me`, POST `/api/businesses`, PATCH/DELETE `/api/businesses/:id`                                |
| Servicios    | GET `/api/businesses/:id/services/manage`, POST `/api/businesses/:id/services`, PATCH/DELETE `/api/services/:id`    |
| Empleados    | GET `/api/businesses/:id/employees/manage`, POST `/api/businesses/:id/employees`, PATCH/DELETE `/api/employees/:id` |
| Asignaciones | POST/DELETE `/api/employees/:id/services/:serviceId`                                                                |
| Horarios     | GET/PUT `/api/businesses/:id/schedules`, GET/PUT `/api/employees/:id/schedules`                                     |
| Reservas     | GET `/api/businesses/:id/appointments`, PATCH `/api/appointments/:id/status`                                        |

El detalle administrativo usa el registro obtenido de `/businesses/me`, porque el
GET público de negocio oculta los inactivos. Las asignaciones se leen desde el
listado administrativo de empleados: el GET público `/employees/:id/services`
omite servicios inactivos y no es apropiado para quitar asignaciones antiguas.
No se añaden APIs ni se cambian los permisos del backend. Se corrige un problema
de integración: CORS ahora permite PUT para que el navegador pueda guardar horarios.
Se mantienen los mismos orígenes autorizados y la política de credenciales.

Los formularios usan React Hook Form y Zod y envían listas explícitas de campos.
Los precios se conservan como strings decimales; solamente durationMinutes se
convierte a entero. El precio histórico de una reserva se muestra tal como lo
entrega la API, con la moneda del negocio.

La semana completa se guarda con PUT (los PATCH por día siguen disponibles en la
API). Horarios de negocio usan openingTime/closingTime; horarios de empleados usan
startTime/endTime. Ambos usan HH:mm, días MONDAY–SUNDAY y active. El frontend valida
formato y orden; el servidor comprueba cobertura y conflictos. Un 409 conserva el
borrador y muestra un mensaje útil. No hay turnos nocturnos.

Las reservas permiten fecha local del negocio, estado, empleado, servicio y
paginación. Se muestran únicamente nombres del cliente, servicio, empleado,
instantes en la zona del negocio, notas, estado y precio histórico. PENDING permite
CONFIRMED/CANCELLED; CONFIRMED permite COMPLETED/CANCELLED/NO_SHOW. Los otros estados
son terminales. Cancelar o marcar inasistencia requiere confirmación; un 409
actualiza la lista para resolver cambios concurrentes.

Las consultas privadas incluyen usuario, negocio, sección y filtros. Las mutations
invalidan las listas afectadas, asignaciones, disponibilidad y catálogos públicos
correspondientes, sin vaciar toda la caché. El resumen consulta conteos de servicios
y empleados activos y dos páginas de una reserva futura (pendiente/confirmada)
para obtener el total y la próxima cita sin descargar todo el historial.

### Límites y producción

- El backend no permite reactivar negocios; la interfaz lo indica antes de desactivar.
- Un negocio inactivo no admite crear/editar servicios, empleados ni horarios.
- Los GET públicos de horarios ocultan negocios/empleados inactivos. El editor se
  bloquea en esos casos para no confundir un 404 con una semana vacía.
- Employee representa personal del negocio, no una cuenta User.
- No hay notificaciones, pagos, métricas financieras ni filtro de rango from/to en
  esta interfaz; sí hay fecha exacta y las demás opciones indicadas.
- No hay nuevas variables, migraciones, seed ni cambios de Railway o VITE_API_URL.
  El backend debe incluir la corrección de CORS para PUT antes de publicar el panel.
  Esta rama se publica para revisión y no se integra automáticamente en develop/main.

Las pruebas en `src/test/owner-dashboard.test.tsx` cubren permisos, onboarding,
CRUD, asignaciones, horarios, transiciones, conflictos e invalidación de listas.
