# Social Networks Manager

Una sola app web para **publicar en tus grupos de Facebook** y **analizar los comentarios** de Facebook, Instagram y TikTok. Une *Facebook Publisher* y *Social Comments Analyzer* con una sola interfaz, una sola IA y una sola extensión de Chrome.

**Abrir la app:** https://arlizheredia.github.io/social-networks-manager/

## Qué incluye

- **Publicar**: URL de origen sin parámetros de rastreo, editor con negrita/cursiva Unicode, emojis, variables (`{grupo}`, `{fecha}`, `{enlace}`), plantillas, imágenes, vídeo y audio (con conversión a vídeo), vista previa, publicación asistida o automática y **límites de seguridad** (pausa mínima, máximo diario, 24 h por grupo, bloqueo ante avisos de Facebook).
- **Grupos**: alta, edición, etiquetas, importación/exportación, reporte y marcador para capturarlos desde Facebook.
- **Comentarios**: seguimiento diario de publicaciones con la extensión, análisis (sentimiento, actividad, autores, palabras), búsqueda por significado o clasificación con IA, y asistente de respuestas con equipo y catálogo.
- **Informes**: informe de comentarios con enfoque por IA (Word, PDF, HTML y mensaje para WhatsApp) e informe diario de difusión en grupos.
- **Historial** unificado, **Centro de Ayuda**, tema claro/oscuro, copia de seguridad única.
- **Una sola IA de la app**, gratuita y local (Transformers.js en un Web Worker), con una única instalación desde Internet o desde el paquete `.zip`. Reutiliza la IA ya instalada por Social Comments Analyzer en el mismo navegador.
- **Datos existentes**: en el mismo dominio (`arlizheredia.github.io`) la app lee automáticamente los datos de Facebook Publisher (`fbp.*`) y de Social Comments Analyzer (`fbca:*` e IndexedDB `sca-db`).

Todo se ejecuta en el navegador: no hay servidor y nunca se piden contraseñas.

## Desarrollo

Requiere [bun](https://bun.sh).

```bash
bun install
bun dev              # http://localhost:5173
bun run test         # pruebas unitarias (Vitest)
bun run build        # compila en dist/ con la base /social-networks-manager/
bun run preview      # sirve dist/ en http://localhost:4173/social-networks-manager/
```

Tecnologías: React 18, TypeScript, Vite 6, Tailwind CSS 4, React Router (rutas con `#`), Zustand e idb-keyval.

## Publicar en GitHub Pages

1. En GitHub: **Settings › Pages › Build and deployment › Source: GitHub Actions**.
2. Sube los cambios a `main`. El flujo `.github/workflows/deploy.yml` instala con bun, ejecuta las pruebas, compila y despliega `dist/`.

`public/` se copia tal cual: incluye la extensión empaquetada y `.nojekyll`.

## Extensión de Chrome

Código en `extension/`. Un solo service worker (`background.js`) carga la publicación automática (`publisher.js`, de Facebook Publisher) y la extracción de comentarios (`extractor-sw.js`, de Social Comments Analyzer), cada uno en su propio ámbito. La página habla con ambas partes mediante `bridge-publisher.js` y `bridge-extractor.js`.

```bash
bun run build:extension   # genera files.json, public/extension/ y public/social-networks-manager-extension.zip
```

Sube `version` en `extension/manifest.json` antes de publicar una versión nueva: la extensión instalada se actualiza sola desde `…/social-networks-manager/extension/` verificando el SHA-256 de cada archivo.

Instalación: descomprime el .zip, abre `chrome://extensions`, activa el *Modo de desarrollador*, pulsa **Cargar descomprimida** y elige la carpeta. Si tenías las extensiones anteriores, desactívalas.

> Las condiciones de Facebook no permiten publicar de forma automatizada y las de Facebook, Instagram y TikTok limitan la recogida automatizada de datos: úsalo con moderación.
