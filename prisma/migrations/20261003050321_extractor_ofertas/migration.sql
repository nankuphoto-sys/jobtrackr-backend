-- CreateEnum
CREATE TYPE "Modality" AS ENUM ('remote', 'hybrid', 'onsite');

-- CreateEnum
CREATE TYPE "Seniority" AS ENUM ('junior', 'mid', 'senior');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('month', 'year', 'hour');

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN     "deadline" TIMESTAMP(3),
ADD COLUMN     "location" TEXT,
ADD COLUMN     "modality" "Modality",
ADD COLUMN     "salaryCurrency" TEXT,
ADD COLUMN     "salaryMax" INTEGER,
ADD COLUMN     "salaryMin" INTEGER,
ADD COLUMN     "salaryPeriod" "SalaryPeriod",
ADD COLUMN     "seniority" "Seniority",
ADD COLUMN     "stack" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "summary" TEXT;
