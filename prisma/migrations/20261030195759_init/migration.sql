-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('user', 'admin', 'superadmin');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('club', 'province');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('create', 'update', 'delete', 'resolve');

-- CreateEnum
CREATE TYPE "AuditEntity" AS ENUM ('stadium', 'club', 'user', 'visit', 'report', 'suggestion');

-- CreateTable
CREATE TABLE "clubs" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "logo_url" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadiums" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "owner_type" "OwnerType" NOT NULL DEFAULT 'club',
    "main_club_id" UUID,
    "image_url" TEXT NOT NULL DEFAULT '',
    "nickname" TEXT NOT NULL DEFAULT '',
    "opened_year" INTEGER,
    "surface" TEXT NOT NULL DEFAULT '',
    "pitch_length" DOUBLE PRECISION,
    "pitch_width" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT '',
    "history" TEXT NOT NULL DEFAULT '',
    "fun_facts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "other_uses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wikidata_draft" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stadiums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadium_photos" (
    "id" UUID NOT NULL,
    "stadium_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "credit" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "stadium_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "nombre" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fecha_nacimiento" TIMESTAMPTZ(3),
    "club_hincha_id" UUID,
    "rol" "Rol" NOT NULL DEFAULT 'user',
    "avatar_url" TEXT NOT NULL DEFAULT '',
    "bio" VARCHAR(300) NOT NULL DEFAULT '',
    "muted_until" TIMESTAMPTZ(3),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followed_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followed_id")
);

-- CreateTable
CREATE TABLE "wishlist" (
    "user_id" UUID NOT NULL,
    "stadium_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_pkey" PRIMARY KEY ("user_id","stadium_id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "user_id" UUID NOT NULL,
    "stadium_id" UUID NOT NULL,
    "visit_date" TIMESTAMPTZ(3) NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL,
    "review_text" VARCHAR(1000) NOT NULL DEFAULT '',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "hidden_reason" VARCHAR(300) NOT NULL DEFAULT '',
    "home_team" TEXT NOT NULL DEFAULT '',
    "away_team" TEXT NOT NULL DEFAULT '',
    "score" TEXT NOT NULL DEFAULT '',
    "expense_ticket" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expense_transport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expense_food" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expense_parking" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_images" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "visit_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_likes" (
    "visit_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_likes_pkey" PRIMARY KEY ("visit_id","user_id")
);

-- CreateTable
CREATE TABLE "saved_visits" (
    "user_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_visits_pkey" PRIMARY KEY ("user_id","visit_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "visit_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" VARCHAR(300) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stadium_suggestions" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "stadium_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "value" VARCHAR(5000) NOT NULL,
    "note" VARCHAR(300) NOT NULL DEFAULT '',
    "status" "SuggestionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "stadium_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "mongo_id" TEXT,
    "actor_id" UUID,
    "actor_username" TEXT NOT NULL DEFAULT '',
    "action" "AuditAction" NOT NULL,
    "entity" "AuditEntity" NOT NULL,
    "entity_id" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL,
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "changes" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clubs_mongo_id_key" ON "clubs"("mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_name_key" ON "clubs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "stadiums_mongo_id_key" ON "stadiums"("mongo_id");

-- CreateIndex
CREATE INDEX "stadiums_main_club_id_idx" ON "stadiums"("main_club_id");

-- CreateIndex
CREATE UNIQUE INDEX "stadium_photos_stadium_id_position_key" ON "stadium_photos"("stadium_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "users_mongo_id_key" ON "users"("mongo_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_club_hincha_id_idx" ON "users"("club_hincha_id");

-- CreateIndex
CREATE INDEX "follows_followed_id_idx" ON "follows"("followed_id");

-- CreateIndex
CREATE INDEX "wishlist_stadium_id_idx" ON "wishlist"("stadium_id");

-- CreateIndex
CREATE UNIQUE INDEX "visits_mongo_id_key" ON "visits"("mongo_id");

-- CreateIndex
CREATE INDEX "visits_user_id_created_at_idx" ON "visits"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "visits_stadium_id_visit_date_idx" ON "visits"("stadium_id", "visit_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "visit_images_visit_id_position_key" ON "visit_images"("visit_id", "position");

-- CreateIndex
CREATE INDEX "visit_likes_user_id_idx" ON "visit_likes"("user_id");

-- CreateIndex
CREATE INDEX "saved_visits_visit_id_idx" ON "saved_visits"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_mongo_id_key" ON "reports"("mongo_id");

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "reports_visit_id_reporter_id_key" ON "reports"("visit_id", "reporter_id");

-- CreateIndex
CREATE UNIQUE INDEX "stadium_suggestions_mongo_id_key" ON "stadium_suggestions"("mongo_id");

-- CreateIndex
CREATE INDEX "stadium_suggestions_status_created_at_idx" ON "stadium_suggestions"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_mongo_id_key" ON "audit_logs"("mongo_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_username_idx" ON "audit_logs"("actor_username");

-- AddForeignKey
ALTER TABLE "stadiums" ADD CONSTRAINT "stadiums_main_club_id_fkey" FOREIGN KEY ("main_club_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_photos" ADD CONSTRAINT "stadium_photos_stadium_id_fkey" FOREIGN KEY ("stadium_id") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_club_hincha_id_fkey" FOREIGN KEY ("club_hincha_id") REFERENCES "clubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followed_id_fkey" FOREIGN KEY ("followed_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist" ADD CONSTRAINT "wishlist_stadium_id_fkey" FOREIGN KEY ("stadium_id") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_stadium_id_fkey" FOREIGN KEY ("stadium_id") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_images" ADD CONSTRAINT "visit_images_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_likes" ADD CONSTRAINT "visit_likes_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_likes" ADD CONSTRAINT "visit_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_visits" ADD CONSTRAINT "saved_visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_visits" ADD CONSTRAINT "saved_visits_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_suggestions" ADD CONSTRAINT "stadium_suggestions_stadium_id_fkey" FOREIGN KEY ("stadium_id") REFERENCES "stadiums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stadium_suggestions" ADD CONSTRAINT "stadium_suggestions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Reglas que Prisma no expresa en el esquema (agregadas a mano)

-- Un usuario tiene como mucho una sugerencia pendiente por dato y estadio (igual que el índice parcial de Mongo)
CREATE UNIQUE INDEX "stadium_suggestions_one_pending_key"
  ON "stadium_suggestions" ("stadium_id", "author_id", "field")
  WHERE "status" = 'pending';

-- Puntuación de 1 a 10 y nadie se sigue a sí mismo
ALTER TABLE "visits" ADD CONSTRAINT "visits_rating_range" CHECK ("rating" >= 1 AND "rating" <= 10);
ALTER TABLE "follows" ADD CONSTRAINT "follows_not_self" CHECK ("follower_id" <> "followed_id");
