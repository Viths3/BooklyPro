# CI/CD y flujo obligatorio

Todas las tareas siguen `feature/<tarea> -> develop -> main` mediante pull requests.
No se hacen pushes directos a develop/main, ni merges con bypass de administrador.
Se conservan los commits mediante merge commit; squash y rebase merge se deshabilitan.

## Checks antes de integrar

- `backend`: lint, formato, validación Prisma, build, pruebas unitarias, PostgreSQL
  desechable, todas las suites de integración, migraciones, smoke tests y build
  independiente desde server/ como en Railway.
- `frontend`: instalación reproducible, lint, pruebas y build desde client/.
- `branch-policy`: solo acepta feature/* hacia develop y develop del mismo
  repositorio hacia main.

Los checks no filtran rutas: también se ejecutan para documentación/configuración.
Cada push de una feature ejecuta frontend/backend. Cada PR vuelve a comprobar el
resultado de combinarlo con su base. Un nuevo push cancela las ejecuciones anteriores.
Los nombres de jobs son contratos de la protección: no renombrarlos sin actualizarla.
La protección exige los tres checks de GitHub Actions, rama actualizada, conversaciones
resueltas y PR, incluso para administradores. Impide borrado y force push de las bases.
No se exige una segunda persona: el propietario trabaja solo y no puede aprobar su
propio PR. El merge sigue siendo explícito; verde no equivale a aprobación de producto.

## Trabajo habitual

1. Actualizar develop y crear feature/<tarea> antes de editar.
2. Publicar la feature y abrir PR hacia develop.
3. Corregir fallos hasta que todos los checks pasen; revisar y hacer merge commit.
4. Cuando el conjunto esté listo, abrir PR develop -> main. Verificar CI de nuevo
   y revisar la release antes de integrarla. No activar auto-merge de producción.
5. Eliminar solo features integradas y volver a develop actualizado.

Si la protección exige actualizar una feature, integrar origin/develop en ella y
publicar. Si develop está detrás del historial de main, crear una feature de
sincronización desde develop, integrar origin/main en esa feature y pasar por PR
hacia develop. No desactivar la protección para resolverlo.

## Despliegue Railway

La entrega continúa con la integración GitHub existente de Railway. Los servicios
de producción deben seguir solo main: frontend con raíz /client, API con /server
y pre-deploy `npm run db:deploy`. Ni develop ni feature/* deben desplegar producción.
No hacen falta secretos de producción en GitHub Actions; CI usa PostgreSQL local
desechable y jamás ejecuta seed/reset sobre Railway.

En cada servicio Railway, activar **Wait for CI** en la configuración del origen
GitHub para esperar también los checks del commit publicado en main. Esta opción
se administra en Railway, no se activa al subir un workflow al repositorio.
Verificarla en ambos servicios; las protecciones GitHub protegen el merge pero no
configuran Railway. Véase la [documentación oficial](https://docs.railway.com/deployments/github-autodeploys).

Después del despliegue comprobar https://booklypro.up.railway.app y
https://booklypro-back.up.railway.app/api/health. Una compilación correcta no demuestra
por sí sola que el despliegue terminó o que las variables remotas son correctas.

## Mantenimiento

Las protecciones residen en Settings -> Branches de GitHub, no en los YAML.
Los workflows y AGENTS.md documentan el flujo para tareas futuras. Solo quien
administra el repositorio puede cambiar esas reglas; no deben deshabilitarse para
evitar un check fallido. Si GitHub Actions no está disponible, esperar y conservar
la feature sin integrar.
