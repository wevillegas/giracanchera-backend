# GiraCanchera · Backend

API REST de **GiraCanchera**, una bitácora de estadios de fútbol: los hinchas recorren un mapa del mundo, registran las canchas
que visitaron, escriben reseñas con fotos y siguen a otros hinchas.

🌐 **App:** https://giracanchera.vercel.app · 🎨 **Frontend:** [giracanchera-frontend](https://github.com/wevillegas/giracanchera-frontend)

---

## Qué hace

- **Cuentas y sesiones:** registro, inicio de sesión con cookie httpOnly (JWT), cierre de sesión que invalida el token, cambio y
  reinicio de contraseña, borrado de cuenta con todos sus datos.
- **Estadios y clubes:** ficha completa (ubicación, capacidad, apodo, inauguración, superficie, medidas, historia, datos curiosos,
  fotos), club dueño o estadio provincial, sugerencias de datos importadas de Wikidata para revisar.
- **Reseñas:** puntuación de 1 a 10, texto, fecha, partido (local, visitante, resultado), gastos del día y hasta 4 fotos.
- **Comunidad:** seguir usuarios, me gusta, reseñas guardadas, estadios por visitar, perfiles públicos y búsqueda.
- **Moderación:** denuncias de reseñas, ocultar reseñas con motivo (el dueño ve el aviso), silenciar usuarios por días, borrar,
  sugerencias de corrección de datos que un admin aprueba o descarta.
- **Estadísticas:** públicas (rankings, hinchas por club, gasto típico) y analíticas internas para administradores.
- **Auditoría:** cada acción de administración queda registrada (con el antes y después de cada campo), con filtros y exportación
  a CSV. Los registros se borran solos a los 180 días.
- **Roles:** usuario, admin y superadmin, con reglas sobre quién puede modificar a quién.

## Tecnologías

| Área | Tecnologías |
|---|---|
| Servidor | Node.js 22+, Express 5 |
| Base de datos | PostgreSQL (Neon en producción, Docker en local), Prisma 7 (ORM y migraciones) |
| Seguridad | JWT en cookie httpOnly, bcrypt, Helmet, rate limiting, control de origen contra CSRF |
| Archivos | Cloudinary (fotos de reseñas, estadios, escudos y avatares), Multer |
| Datos externos | Wikidata y Wikipedia (sugerencias para las fichas de estadios) |
| Monitoreo | Sentry (errores del servidor, sin datos personales) |
| Tests | node:test (unitarios y de punta a punta contra PostgreSQL) |
| Despliegue | Render (servidor) + Neon (base de datos) |

## Estructura

```
prisma/
  schema.prisma          esquema de la base (13 tablas) y migraciones en prisma/migrations/
src/
  server.js              arranque, conexión a la base y limpieza diaria de la auditoría
  app.js                 Express: seguridad, CORS, límites, rutas y manejo de errores
  config/                Prisma, Cloudinary, Sentry, conexión con reintentos
  routes/                rutas por recurso (auth, stadiums, visits, clubs, users, stats, audit)
  controllers/           lógica de cada ruta
  db/serialize.js        arma las respuestas JSON (forma estable para el frontend)
  middlewares/           sesión y roles, subida de imágenes, errores
  utils/                 validaciones, auditoría, Wikidata, scripts de datos de muestra
scripts/backup-db.js     respaldo de la base de producción
migration/               herramientas de la migración desde MongoDB (octubre 2026)
```

## Base de datos

Esquema relacional en PostgreSQL con claves foráneas y borrado en cascada:

- `users`, `follows` (quién sigue a quién), `wishlist` (por visitar)
- `clubs`, `stadiums`, `stadium_photos`
- `visits` (reseñas), `visit_images`, `visit_likes`, `saved_visits`
- `reports` (denuncias), `stadium_suggestions`, `audit_logs`

Los ids son UUID. La integridad la garantiza la base: no se puede reseñar un estadio que no existe, y al borrar un usuario o un
estadio se borra en cascada todo lo que depende de él.

## Puesta en marcha (local)

Requisitos: Node 22.18 o superior, Docker y una cuenta de Cloudinary.

```bash
npm install                 # instala y genera el cliente de Prisma
cp .env.example .env        # completar CLOUDINARY_* y JWT_SECRET
npm run db:up               # PostgreSQL en Docker (puerto 5433): base de desarrollo y base de tests
npm run db:migrate          # crea las tablas
npm run seed                # (opcional) clubes y estadios de muestra
npm run dev
```

El servidor levanta en `http://localhost:5000`. Probar con `GET /api/health`.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `DATABASE_URL` | Conexión a PostgreSQL que usa la app (en Neon, la cadena **con pooling**) |
| `DATABASE_URL_UNPOOLED` | Conexión directa para las migraciones de Prisma (obligatoria en Neon; en local no hace falta) |
| `TEST_DATABASE_URL` | Base para las pruebas de punta a punta (se vacía en cada corrida) |
| `JWT_SECRET` | Firma de las sesiones (64 bytes aleatorios en producción) |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Subida de imágenes |
| `FRONTEND_URL` | Origen permitido para CORS y para los pedidos que modifican datos |
| `TRUST_PROXY` | Cantidad de proxies delante (2 en producción: Vercel + Render) |
| `SENTRY_DSN` | Avisos de errores (vacío = desactivado) |

En Neon usar `sslmode=verify-full` en las cadenas de conexión.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor con recarga automática |
| `npm start` | Servidor en producción |
| `npm test` | Tests unitarios y de punta a punta |
| `npm run db:up` / `npm run db:down` | Levantar / bajar PostgreSQL en Docker |
| `npm run db:migrate` | Crear una migración a partir de cambios en el esquema |
| `npm run db:deploy` | Aplicar migraciones pendientes (producción) |
| `npm run db:studio` | Ver la base en el navegador |
| `npm run backup:db` | Respaldo de la base de producción |
| `npm run seed` / `npm run seed:users` | Datos de muestra (no corren en producción) |
| `npm run import:wikidata` | Buscar sugerencias de datos en Wikidata |

## API

Todas las rutas empiezan con `/api`. 🔒 = requiere sesión · 🛡️ = solo administradores.

**Autenticación** — `POST /auth/register`, `POST /auth/login`, 🔒 `GET /auth/me`, 🔒 `POST /auth/logout`

**Estadios**
- `GET /stadiums`, `GET /stadiums/:id`
- 🛡️ `POST /stadiums`, `PUT /stadiums/:id`, `DELETE /stadiums/:id`, `POST /stadiums/image`
- 🛡️ `GET /stadiums/drafts`, `POST|GET /stadiums/import-wikidata` (sugerencias de Wikidata)
- 🔒 `POST /stadiums/:id/suggestions` · 🛡️ `GET /stadiums/suggestions`, `PATCH /stadiums/suggestions/:id`

**Reseñas (visitas)**
- `GET /visits/stadium/:stadiumId`, `GET /visits/user/:userId`
- 🔒 `POST /visits`, `PUT /visits/:id`, `DELETE /visits/:id` (con fotos, multipart)
- 🔒 `POST /visits/:id/like`, `POST /visits/:id/save`, `POST /visits/:id/report`, `GET /visits/saved`, `GET /visits/liked`
- 🛡️ `GET /visits/admin/all`, `PATCH /visits/admin/:id/hidden`, `DELETE /visits/admin/:id`, `GET /visits/reports`, `PATCH /visits/reports/:id`

**Usuarios**
- `GET /users/:id` (perfil público)
- 🔒 `GET|PUT /users/profile`, `GET /users/search`, `GET /users/me/stats`, `PUT /users/me/password`, `DELETE /users/me`
- 🔒 `POST /users/follow/:userId`, `POST /users/want-to-visit/:stadiumId`
- 🛡️ `GET /users/admin/all`, `GET /users/admin/:id/activity`, `PUT /users/admin/:id`, `DELETE /users/admin/:id`,
  `POST /users/admin/:id/reset-password`

**Clubes** — `GET /clubs`, `GET /clubs/list` · 🛡️ `POST /clubs`, `PUT /clubs/:id`, `DELETE /clubs/:id`

**Estadísticas** — `GET /stats/public` · 🛡️ `GET /stats/admin`

**Auditoría** — 🛡️ `GET /audit`, `GET /audit/actors`, `GET /audit/export` (CSV)

## Seguridad

- Sesión en cookie **httpOnly** (`SameSite=Lax`, `Secure` en producción): el JavaScript de la página no puede leerla.
- Cerrar sesión, cambiar la contraseña o cambiar de rol invalida los tokens anteriores.
- Los pedidos que modifican datos solo se aceptan desde el frontend (control de `Origin`), además de CORS.
- Límites de pedidos por IP, más estrictos en login y registro; comparación de contraseñas en tiempo constante.
- Validación de todos los datos de entrada; búsquedas con comodines escapados; solo imágenes de Cloudinary.
- Cabeceras de seguridad con Helmet. Los errores 500 no exponen detalles internos.

## Tests

```bash
npm test
```

49 tests: validaciones, sesión y roles, auditoría, y pruebas de punta a punta que recorren el flujo completo (registro, reseñas,
me gusta, denuncias, moderación, sugerencias, silencio, reinicio y cambio de contraseña, borrado en cascada) contra una base
PostgreSQL de prueba en Docker.

## Producción

- **Render** (región Ohio, junto a la base): build `npm install && npm run db:deploy`, start `npm start`.
- **Neon**: PostgreSQL con ramas; la rama `production` es la base real.
- Respaldo semanal recomendado con `npm run backup:db`. Para restaurar, siempre en una rama nueva de Neon, nunca directo sobre
  production:

```bash
docker run --rm -i postgres:18-alpine pg_restore --no-owner --no-privileges -d "<cadena directa de la rama nueva>" < backups/giracanchera-....dump
```

## Historia: de MongoDB a PostgreSQL

El proyecto nació con MongoDB y Mongoose. En octubre de 2026 la base pasó a PostgreSQL, porque los datos son muy relacionales
(usuarios, estadios, reseñas, seguidores) y la integridad referencial evita datos inconsistentes. Para verificar que nada
cambiara, se grabaron las respuestas de toda la API antes de migrar y se compararon con las de después: 398 de 400 idénticas
(las otras 2 eran empates que Mongo ordenaba al azar). La migración se ensayó en una rama de Neon antes de aplicarla en
producción. Las herramientas usadas están en `migration/`.

---

Desarrollado por **Wenceslao José Villegas** · Ingeniería Informática, UNSTA ·
[LinkedIn](https://www.linkedin.com/in/wenceslaojosevillegas/) · [GitHub](https://github.com/wevillegas)
