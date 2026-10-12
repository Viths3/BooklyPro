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
- Actualizar `develop` con pull fast-forward, integrar con `git merge --no-ff feature/nombre` y publicar `develop`.
- Cuando una fase este estable y comprobada, actualizar `main`, integrar `develop` con `--no-ff`, publicar y volver a `develop`.
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
