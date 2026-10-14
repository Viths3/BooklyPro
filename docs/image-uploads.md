# Imágenes de negocios

Solo Business tiene imageUrl en el modelo actual. No se añaden columnas, migraciones,
imágenes de empleados/servicios ni almacenamiento de publicId. Los contratos existentes
de creación/PATCH de negocios siguen aceptando imageUrl y null.

## Configuración

En Cloudinary, crear un product environment y obtener Cloud name, API key y API secret.
En Railway, abrir el servicio **backend** (raíz /server), Variables, y configurar:

- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET

Guardar y desplegar el backend. No pertenecen al servicio Web, ni a VITE_*, Git,
README con valores reales o logs. En local, usar server/.env ignorado por Git.
No se necesita preset unsigned ni SDK frontend/backend: la firma SHA-256 usa
node:crypto y el protocolo documentado por Cloudinary.

Si no se configura ninguna variable, el backend y todas sus funciones existentes
siguen funcionando; el endpoint responde 503 UPLOADS_UNAVAILABLE. Una configuración
parcial o inválida falla al arrancar, mostrando nombres de variables, nunca valores.

## Flujo

1. ImageUpload valida JPEG/PNG/WebP, archivo no vacío y máximo 5 MiB (5242880 bytes).
   SVG y otros formatos se rechazan. Permite selección móvil, arrastrar, previsualizar
   y cancelar. Libera object URLs y aborta solicitudes al cerrar el formulario.
2. POST /api/uploads/signature usa la autenticación Bearer existente. Body estricto:
   context=business, contentType, size y businessId opcional. Al editar, verifica el
   propietario; al crear, acepta un usuario autenticado antes de tener negocio.
3. El servidor fija public_id aleatorio bajo booklypro/businesses/<usuario>/,
   allowed_formats=jpg,png,webp, overwrite=false y transformación c_limit,w_1600,h_1600.
   Firma exclusivamente esos parámetros y timestamp. Nunca firma opciones arbitrarias.
4. El navegador envía multipart directamente al endpoint HTTPS image/upload de
   Cloudinary. No envía el token de BooklyPro ni cookies al proveedor.
5. Comprueba la respuesta (imagen, formato, tamaño, publicId esperado y URL HTTPS del
   cloud configurado) y guarda internamente la URL con f_auto,q_auto,c_limit,w_1600,h_1600.
   Guardar negocio persiste imageUrl usando la API existente. Durante la carga no se
   permite enviar el formulario. Un fallo conserva la imagen anterior.

La respuesta de firma tiene Cache-Control: no-store. Hay un límite de 20 solicitudes
por usuario por hora y proceso; no es una cuota distribuida. El publicId aleatorio y
overwrite=false evitan sobrescribir imágenes existentes al reutilizar la misma firma.

## Límites reales

Cloudinary establece una vigencia de **una hora** desde timestamp para firmas de
upload. expiresAt informa esa ventana; no se afirma un TTL de cinco minutos ni uso
único. No se almacenan firmas en localStorage y se piden al seleccionar cada archivo.
Véase [autenticación de Cloudinary](https://cloudinary.com/documentation/authentication_signatures).

El límite de 5 MiB se comprueba en el navegador, en los metadatos declarados al pedir
la firma y en la respuesta. El backend no recibe los bytes y los metadatos no prueban
el tamaño real de una petición externa que evada la UI. No se presenta como una cuota
dura del proveedor. Para endurecer uso público, aplicar límites del proveedor o pasar
los bytes por un backend que los inspeccione. allowed_formats sí forma parte de la
firma. Cloudinary excluye file y resource_type de su firma; la aplicación usa solo el
endpoint image/upload y solo acepta respuestas de imágenes.

Eliminar quita imageUrl de BooklyPro al guardar (null). No elimina archivos de
Cloudinary. Cancelar, reemplazar o abandonar un formulario puede dejar archivos
huérfanos; revisar/limpiar desde Cloudinary sin eliminar imágenes todavía referenciadas.
No existe endpoint de borrado por publicId proporcionado por el cliente.

EntityImage mantiene proporciones y muestra un placeholder para imágenes vacías,
inválidas o rotas en catálogo, detalle, panel del propietario y formulario.
Las URLs existentes siguen funcionando; no se fuerzan transformaciones Cloudinary
en URLs externas antiguas.

## Verificación

Los tests usan firmas/configuración ficticias y solicitudes Cloudinary simuladas.
CI ejecuta frontend, backend e integración PostgreSQL; no necesita credenciales reales.
Para validar la cuenta real, configurar primero un entorno Cloudinary de desarrollo
y cargar una imagen pequeña desde un negocio propio. No ejecutar seed/reset remoto.
No se puede confirmar una carga real únicamente con mocks.
