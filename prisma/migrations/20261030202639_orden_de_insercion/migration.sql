-- AlterTable
ALTER TABLE "stadiums" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "seq" SERIAL NOT NULL;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "seq" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "stadiums_seq_key" ON "stadiums"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "users_seq_key" ON "users"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "visits_seq_key" ON "visits"("seq");

