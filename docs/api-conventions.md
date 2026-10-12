# Convenciones de la API BooklyPro

## Exito y errores

Toda respuesta con datos usa `{ "data": objeto }` o `{ "data": [...] }`. Esto incluye autenticacion y health. POST de creacion devuelve 201; citas incluyen Location. Lecturas y actualizaciones con datos devuelven 200. Operaciones existentes con 204 (logout y desactivaciones) no llevan body.

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Los errores pasan por AppError y el middleware global:

```json
{
  "error": {
    "code": "APPOINTMENT_SLOT_UNAVAILABLE",
    "message": "The selected time slot is no longer available"
  }
}
```

Zod produce HTTP 400 con detalles de campos, sin valores de entrada:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [{ "field": "startTime", "message": "Invalid time format" }]
  }
}
```

code es estable, MAYUSCULAS_SNAKE_CASE; message es descriptivo y no debe usarse como identificador en el frontend. details es opcional. Nunca se incluyen stack, SQL, metadatos de Prisma, credenciales, hashes ni tokens en errores. Errores inesperados devuelven exclusivamente 500 / INTERNAL_SERVER_ERROR / An unexpected error occurred. Los access/refresh tokens se entregan solo en las respuestas de autenticacion previstas.

| HTTP | Codigos y uso                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400  | VALIDATION_ERROR, INVALID_JSON, BAD_REQUEST, INVALID_DATE, INVALID_APPOINTMENT_DATA, SERVICE_NOT_ASSIGNED_TO_EMPLOYEE                                                                         |
| 401  | UNAUTHORIZED: sesion ausente, invalida o expirada                                                                                                                                             |
| 403  | FORBIDDEN: usuario sin permisos                                                                                                                                                               |
| 404  | BUSINESS_NOT_FOUND, SERVICE_NOT_FOUND, EMPLOYEE_NOT_FOUND, APPOINTMENT_NOT_FOUND, ROUTE_NOT_FOUND, NOT_FOUND                                                                                  |
| 404  | BUSINESS_INACTIVE, SERVICE_INACTIVE, EMPLOYEE_INACTIVE al consultar disponibilidad o crear citas; conserva el tratamiento de entidades ocultas de availability                                |
| 409  | APPOINTMENT_SLOT_UNAVAILABLE, INVALID_APPOINTMENT_STATUS_TRANSITION, INVALID_BUSINESS_TIMEZONE, EMAIL_ALREADY_REGISTERED, CONFLICT; BUSINESS_INACTIVE en administracion de catalogos/horarios |
| 413  | PAYLOAD_TOO_LARGE                                                                                                                                                                             |
| 429  | RATE_LIMITED                                                                                                                                                                                  |
| 500  | INTERNAL_SERVER_ERROR                                                                                                                                                                         |
| 503  | DATABASE_UNAVAILABLE en health; SERVICE_UNAVAILABLE como codigo generico                                                                                                                      |

AppError admite statusCode, message, code y details opcional. Los modulos existentes conservan sus HTTP y disponen de codigos genericos segun el status cuando no requieren un codigo especifico. Los errores de exclusion PostgreSQL (23P01), serializacion y deadlock al crear citas se convierten a APPOINTMENT_SLOT_UNAVAILABLE, sin exponer codigos internos. Otros fallos no previstos permanecen como 500.

## Cambio de contrato de autenticacion y health

Desde feature/appointments, register, login, refresh, me y health envuelven su resultado en data. Los consumidores deben usar response.data. Ejemplo: login entrega `{ "data": { "user": {...}, "accessToken": "...", "refreshToken": "...", "tokenType": "Bearer", "expiresIn": 900 } }`.

Health: 200 con `data.status = "ok"`, `data.service = "booklypro-api"` y `data.database = "connected"`; un fallo de conexion devuelve el error estandar 503 / DATABASE_UNAVAILABLE. Los errores de validacion sustituyen el antiguo fields por details. README y tests usan el contrato nuevo.

## Contrato de citas

| Metodo | Ruta                                     | Permiso                                        |
| ------ | ---------------------------------------- | ---------------------------------------------- |
| POST   | /api/appointments                        | Usuario autenticado; customerId de su sesion   |
| GET    | /api/appointments/me                     | Solo citas del usuario autenticado             |
| GET    | /api/appointments/:id                    | Cliente de la cita o propietario de su negocio |
| PATCH  | /api/appointments/:id/cancel             | Solo cliente de la cita                        |
| GET    | /api/businesses/:businessId/appointments | Solo propietario                               |
| PATCH  | /api/appointments/:id/status             | Solo propietario                               |

No hay bypass ADMIN; se conserva la politica de propiedad de la API. /me precede a /:id. Las respuestas privadas usan Cache-Control: no-store. Se permite consultar y gestionar el historial con negocio/servicio/empleado inactivos, pero no crear reservas nuevas.

POST acepta exclusivamente businessId, serviceId, employeeId, date, startTime y notes opcional (hasta 500 caracteres, recortado). date es YYYY-MM-DD valido; startTime es HH:mm 00:00-23:59. customerId, status, endTime, priceAtBooking, IDs internos y relaciones no se aceptan. El backend establece PENDING, calcula el fin y conserva Service.price como Decimal en priceAtBooking.

La respuesta incluye IDs relacionados, timestamps, estado, notes y priceAtBooking; customer/employee solo contienen ID y nombres, service incluye ID, nombre, precio actual y duracion, business incluye ID, nombre y timeZone. No incluye email, telefono, ownerId ni datos de autenticacion. priceAtBooking es el precio historico; service.price puede cambiar despues.

## Paginacion y filtros

Las citas se ordenan por startTime ascendente e ID como desempate. page empieza en 1 (maximo 1000000); limit por defecto 20 y maximo 100. Una pagina fuera de rango devuelve data vacio y conserva total. Cero resultados implica totalPages = 0. Filas y conteo se leen bajo RepeatableRead.

/me acepta status, from, to, page y limit. El listado del negocio acepta ademas date, employeeId y serviceId. No se acepta customerId ni ownerId desde query. Los filtros de empleado/servicio siempre quedan acotados al negocio autorizado; un ID sin coincidencias devuelve una lista vacia.

from/to son timestamps ISO 8601 con Z u offset; filtran inicio de cita con from inclusivo y to exclusivo, y from debe ser anterior a to. date es un dia local del negocio, tambien aplicado al inicio de cita, desde medianoche inclusiva hasta la siguiente exclusiva. date no puede combinarse con from/to. Los listados si permiten historial pasado.

## Estados y cancelacion

| Origen    | Destinos permitidos al propietario |
| --------- | ---------------------------------- |
| PENDING   | CONFIRMED, CANCELLED               |
| CONFIRMED | COMPLETED, CANCELLED, NO_SHOW      |
| COMPLETED | Ninguno                            |
| CANCELLED | Ninguno                            |
| NO_SHOW   | Ninguno                            |

El cliente solo puede cancelar su PENDING/CONFIRMED mediante /cancel. Repetir cancelacion de una CANCELLED devuelve 200 sin cambiarla. Cancelar COMPLETED o NO_SHOW devuelve 409. No hay limite de anticipacion de 24 horas.

El propietario usa /status con `{ "status": "CONFIRMED" }` o uno de los destinos permitidos. Repetir CONFIRMED es idempotente; repetir estados terminales por /status devuelve 409. Se implementan exactamente las transiciones solicitadas, sin restricciones temporales adicionales para completar o marcar ausencia. No hay reactivacion, vuelta a PENDING, reprogramacion ni borrado fisico.

## Creacion atomica y disponibilidad

Dentro de una transaccion READ COMMITTED se bloquea la fila Business con FOR UPDATE. Despues del bloqueo se reutiliza AvailabilityService.evaluate con un lector del mismo tx: entidades activas, pertenencia, asignacion, fecha/hora, horarios, duracion, paso configurado y citas existentes. No hay HTTP interno. El inicio solicitado debe coincidir con un slot generado; el fin se toma de ese slot y se convierte con la zona del negocio. Se inserta PENDING con cliente de sesion y precio Decimal leido dentro de la transaccion.

El bloqueo se comparte con los escritores de servicios, empleados y horarios; serializa creaciones del mismo negocio. La exclusion GiST existente protege ademas cualquier escritura directa: empleado igual y rangos [inicio, fin) que se solapan solo para PENDING/CONFIRMED. CANCELLED/COMPLETED/NO_SHOW no bloquean. Citas adyacentes estan permitidas. Un slot que estaba libre en un GET puede dejar de estarlo antes del POST; se vuelve a comprobar dentro de la transaccion.

Cambios de estado y cancelaciones bloquean la fila Appointment antes de leer el estado actual. Dos transiciones simultaneas no pueden sobrescribir un estado terminal. Esta version prefiere el bloqueo amplio por negocio para mantener coherencia con las escrituras existentes; puede limitar rendimiento bajo mucha concurrencia del mismo negocio. No hacen falta nuevas migraciones: se reutilizan los indices por cliente/inicio, negocio/inicio, empleado/inicio, servicio/negocio y estado/inicio, y la exclusion de feature/availability.

## Fechas y precios

Business.timeZone es la zona IANA real existente; no se inventa timezone. Inputs son fecha y hora local del negocio, convertidas con Temporal a instantes persistidos como timestamptz. Salida de citas: ISO 8601 UTC, por ejemplo 2030-01-07T15:00:00.000Z. Horarios y slots siguen usando HH:mm. Se hereda la politica de omitir horas DST ambiguas/inexistentes y duraciones reales incompatibles. Fechas pasadas: 400; horas de hoy ya pasadas o slot ocupado/fuera de horario: 409.

Service.price y Appointment.priceAtBooking se serializan siempre como textos decimales de dos posiciones (8.10). No se usa Float para persistir precios. Cambiar el catalogo no modifica el precio acordado de citas existentes.
