/*
  Warnings:

  - You are about to alter the column `rating` on the `visits` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.

*/
-- AlterTable
ALTER TABLE "visits" ALTER COLUMN "rating" SET DATA TYPE INTEGER;
