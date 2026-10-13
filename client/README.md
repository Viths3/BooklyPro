# BooklyPro · Frontend

Base React + Vite + TypeScript estricto. Tailwind CSS 4 usa `@tailwindcss/vite` y
`@import 'tailwindcss'`. React Router gestiona rutas; TanStack Query cachea lecturas;
React Hook Form y Zod validan formularios. No se utiliza un framework de servidor
ni se despliega el frontend en esta feature.

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
│   └── businesses/           # Catálogo, detalle, servicios, equipo y reseñas
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
Las dos últimas muestran secciones preparadas, sin administración ni reservas.

El catálogo usa búsqueda por nombre y páginas de 9 negocios. El detalle carga
servicios, empleados y las 5 reseñas más recientes solo tras comprobar el negocio.
El promedio y total proceden del summary del servidor, no de la página visible.
Precios conservan el texto Decimal y se acompañan de la moneda del negocio.
No hay creación de reservas ni reseñas desde el frontend.

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

No se configura hosting todavía. Cuando se despliegue una SPA, el hosting deberá
reenviar rutas como `/businesses/:id` a `index.html` y definir VITE_API_URL en build.
