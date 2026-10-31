# giracanchera-backend

API REST de GiraCanchera: autenticación, estadios, clubes, visitas (reseñas con fotos), perfiles, moderación y auditoría.
Node + Express + PostgreSQL (Prisma) + Cloudinary.

## Requisitos

- Node 22.18 o superior (el cliente de Prisma se ejecuta como TypeScript sin compilar)
- Docker (PostgreSQL local para desarrollo y tests)
- Credenciales de Cloudinary (fotos de visitas, estadios y avatares)

## Setup

```bash
npm install                 # también genera el cliente de Prisma
cp .env.example .env        # completar CLOUDINARY_*, JWT_SECRET
npm run db:up               # PostgreSQL en Docker (puerto 5433): base de desarrollo y base de tests
npm run db:migrate          # crea las tablas
npm run dev
```

El servidor levanta en `http://localhost:5000` (o el `PORT` que configures). Probar con `GET /api/health`.

## Base de datos

- El esquema está en `prisma/schema.prisma` y las migraciones en `prisma/migrations/`.
- `DATABASE_URL` es la conexión que usa la app. En producción (Neon) va la cadena **con pooling** (`-pooler`).
- `DATABASE_URL_UNPOOLED` (opcional) es la conexión **directa**, la que usan las migraciones de Prisma. En Neon es obligatoria
  para migrar: con pooling Prisma Migrate falla. En local no hace falta (se usa `DATABASE_URL`).
- Usar `sslmode=verify-full` en las cadenas de Neon.
- Los registros de auditoría de más de 180 días se borran solos (al iniciar el servidor y una vez por día).

## Variables de entorno

Ver `.env.example`. Ninguna tiene default salvo `PORT` y `FRONTEND_URL`.

## Scripts

- `npm run dev` — servidor con nodemon
- `npm start` — servidor en modo producción
- `npm test` — tests (las pruebas de punta a punta usan `TEST_DATABASE_URL` y vacían esa base en cada corrida)
- `npm run db:up` / `npm run db:down` — levantar / bajar PostgreSQL en Docker
- `npm run db:migrate` — crear una migración nueva a partir de cambios en el esquema (desarrollo)
- `npm run db:deploy` — aplicar las migraciones pendientes (producción: con `DATABASE_URL_UNPOOLED`)
- `npm run db:studio` — ver la base en el navegador
- `npm run seed` — carga clubes y estadios de muestra (borra los que haya, y con ellos sus reseñas; no corre en producción)
- `npm run seed:users` — usuarios de prueba (no corre en producción)

## Producción (Render + Neon)

- Render en la región **Ohio**, junto a la base de Neon (`aws-us-east-2`).
- Build: `npm install && npm run db:deploy` · Start: `npm start`.
- Variables: `DATABASE_URL` (Neon con pooling), `DATABASE_URL_UNPOOLED` (Neon directa), `JWT_SECRET`, `CLOUDINARY_*`,
  `FRONTEND_URL`, `NODE_ENV=production`, `TRUST_PROXY=2`.

## Respaldos de producción

`npm run backup:db` guarda un respaldo completo de la base de producción en `backups/giracanchera-AAAA-MM-DD-HHMM.dump`
(con `pg_dump` dentro de Docker; la conexión la saca la herramienta de Neon, con la sesión iniciada: `npx neon@latest login`).
Hacerlo una vez por semana y guardar una copia fuera de la PC (tiene datos personales; `backups/` no va al repo).

Para restaurar, **nunca directo sobre production**: crear una rama nueva en Neon (o una base local) y cargar ahí el respaldo,
revisar que esté bien y recién después decidir:

```bash
docker run --rm -i postgres:18-alpine pg_restore --no-owner --no-privileges -d "<cadena directa de la rama nueva>" < backups/giracanchera-....dump
```

## Migración desde MongoDB (octubre 2026)

La carpeta `migration/` tiene lo que se usó para pasar de MongoDB a PostgreSQL: el respaldo de Mongo (`backup-mongo.js`), la copia
de los datos (`migrate-data.js`, repetible: el UUID de cada registro sale de su id de Mongo) y la comparación de las respuestas de
la API antes y después (`snapshot-api.js`, `compare-snapshots.js`). Los respaldos y las grabaciones no se suben al repo.
La columna `mongo_id` de las tablas guarda el id original; se puede borrar cuando ya no haga falta volver a Mongo.

## Rutas principales

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/stadiums`, `GET /api/stadiums/:id`
- `GET/POST/PUT/DELETE /api/visits` (requiere sesión)
- `GET/POST /api/clubs`
- `GET/PUT /api/users/profile`, `GET /api/users/:id`, `POST /api/users/want-to-visit/:stadiumId`, `POST /api/users/follow/:userId`

## Repo hermano

El frontend vive en un repo separado: [giracanchera-frontend](https://github.com/wevillegas/giracanchera-frontend).
