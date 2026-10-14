# Reglas de trabajo de BooklyPro

## Git obligatorio

- Remoto: https://github.com/Viths3/BooklyPro.git. Revisar estado y remotos antes de modificarlos.
- `main` contiene versiones estables. No implementar ni hacer commits normales directamente en ella.
- `develop` es la base de desarrollo. Antes de una tarea importante, identificar la rama `feature/nombre-descriptivo` correspondiente.
- Revisar `git status`, cambiar a `develop`, ejecutar `git pull --ff-only origin develop` y crear la rama feature antes de editar.
- Si una tarea pequena pertenece a una feature en curso, continuar en esa rama. No crear una rama generica `tareas` ni mezclar funcionalidades grandes no relacionadas.
- Hacer commits pequenos y descriptivos con prefijos `feat:`, `fix:`, `refactor:`, `docs:`, `test:` o `chore:`.
- Antes de integrar, revisar `git status`, `git diff` y `git diff --cached`, y ejecutar las verificaciones pertinentes.
- Publicar la feature con `git push -u origin feature/nombre` antes de integrarla.
- Abrir un pull request de `feature/nombre` hacia `develop`. Esperar los checks obligatorios `backend`, `frontend` y `branch-policy`; integrar mediante merge commit en GitHub. No hacer push directo a `develop` ni usar bypass de administrador.
- Cuando una fase este estable y comprobada, abrir un PR de `develop` hacia `main`. Esperar los mismos checks y promover explicitamente mediante merge commit. No hacer push directo a `main`, ni activar auto-merge para releases. Volver a `develop` y actualizar con pull fast-forward.
- Si GitHub exige actualizar una rama, incorporar la base en la feature y repetir CI. Si `develop` necesita incorporar el historial de `main`, hacerlo mediante una feature de sincronizacion y PR a `develop`, nunca mediante push directo.
- La aprobacion de CI es obligatoria para cualquier tarea, incluso documentacion y configuracion. No omitir workflows por rutas. Las pruebas locales enfocadas sirven para desarrollar; GitHub ejecuta la suite completa antes de integrar.
- No usar force push ni reescribir el historial de `main`. No descartar trabajo ajeno para resolver conflictos.
- Solo eliminar ramas despues de confirmar que su trabajo esta integrado; usar `git branch -d` para borrado local.
- No versionar `.env`, credenciales, tokens, `node_modules`, compilados ni cliente Prisma generado.
- Si falla autenticacion o sincronizacion remota, informar el bloqueo y conservar el trabajo. No afirmar que se publico sin verificarlo.

## Verificaciones

Para cambios del backend: `npm run lint`, `npm run format:check`, `npm run build` y `npm test`.
Para cambios del modelo: tambien `npm run db:validate` y las pruebas PostgreSQL descritas en README.md.
Para documentacion y configuracion Git: formato, diff y verificacion del historial y referencias.

## Alcance

Desarrollar por fases. La Fase 1 es la base del backend; no iniciar autenticacion ni frontend sin una nueva tarea. Mantener TypeScript estricto y la separacion de responsabilidades existente.
