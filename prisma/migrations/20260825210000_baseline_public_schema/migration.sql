-- Baseline public application schema generated from prisma/schema.prisma.

-- CreateEnum
CREATE TYPE "public"."user_role" AS ENUM ('admin', 'dentist');

-- CreateEnum
CREATE TYPE "public"."gender_type" AS ENUM ('male', 'female', 'other');

-- CreateEnum
CREATE TYPE "public"."visit_phase" AS ENUM ('before_hygienic', 'after_hygienic', 'after_corrective');

-- CreateEnum
CREATE TYPE "public"."visit_status" AS ENUM ('draft', 'completed');

-- CreateEnum
CREATE TYPE "public"."chart_status" AS ENUM ('draft', 'saved', 'locked');

-- CreateEnum
CREATE TYPE "public"."tooth_arch" AS ENUM ('upper', 'lower');

-- CreateEnum
CREATE TYPE "public"."tooth_status" AS ENUM ('present', 'missing', 'implant');

-- CreateEnum
CREATE TYPE "public"."prognosis_kc_level" AS ENUM ('favorable', 'questionable', 'unfavorable', 'hopeless');

-- CreateEnum
CREATE TYPE "public"."prognosis_mn_level" AS ENUM ('good', 'fair', 'poor', 'questionable', 'hopeless');

-- CreateEnum
CREATE TYPE "public"."site_position" AS ENUM ('MB', 'B', 'DB', 'MP', 'P', 'DP', 'ML', 'L', 'DL');

-- CreateEnum
CREATE TYPE "public"."surface_group" AS ENUM ('buccal', 'palatal', 'lingual');

-- CreateEnum
CREATE TYPE "public"."furcation_grade" AS ENUM ('none', 'grade_1', 'grade_2', 'grade_3');

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'dentist',
    "student_id" INTEGER,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profile_image_url" TEXT,
    "is_active" BOOLEAN NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "patients" (
    "patient_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "owner_user_id" UUID NOT NULL,
    "hn" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "age" INTEGER,
    "nationality" TEXT,
    "gender" "gender_type",
    "note" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "visits" (
    "visit_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "dentist_user_id" UUID NOT NULL,
    "visit_date" DATE NOT NULL,
    "phase" "visit_phase" NOT NULL,
    "doctor_name" TEXT,
    "student_id" INTEGER,
    "clinical_note" TEXT,
    "status" "visit_status" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("visit_id")
);

-- CreateTable
CREATE TABLE "periodontal_charts" (
    "chart_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "visit_id" UUID NOT NULL,
    "chart_name" TEXT,
    "status" "chart_status" NOT NULL DEFAULT 'draft',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "periodontal_charts_pkey" PRIMARY KEY ("chart_id")
);

-- CreateTable
CREATE TABLE "periodontal_chart_teeth" (
    "chart_tooth_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chart_id" UUID NOT NULL,
    "tooth_number" SMALLINT NOT NULL,
    "arch" "tooth_arch" NOT NULL,
    "status" "tooth_status" NOT NULL DEFAULT 'present',
    "mobility" SMALLINT,
    "prognosis_kc" "prognosis_kc_level",
    "prognosis_mn" "prognosis_mn_level",
    "tooth_note" TEXT,

    CONSTRAINT "periodontal_chart_teeth_pkey" PRIMARY KEY ("chart_tooth_id")
);

-- CreateTable
CREATE TABLE "periodontal_tooth_surfaces" (
    "tooth_surface_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chart_tooth_id" UUID NOT NULL,
    "surface" "surface_group" NOT NULL,
    "ktw_mm" DECIMAL(4,1),

    CONSTRAINT "periodontal_tooth_surfaces_pkey" PRIMARY KEY ("tooth_surface_id")
);

-- CreateTable
CREATE TABLE "periodontal_tooth_sites" (
    "site_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chart_tooth_id" UUID NOT NULL,
    "surface" "surface_group" NOT NULL,
    "site_position" "site_position" NOT NULL,
    "pd_mm" INTEGER,
    "recession_mm" INTEGER,
    "cal_mm" INTEGER,
    "bop" BOOLEAN NOT NULL DEFAULT false,
    "plaque" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "periodontal_tooth_sites_pkey" PRIMARY KEY ("site_id")
);

-- CreateTable
CREATE TABLE "periodontal_tooth_furcations" (
    "furcation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chart_tooth_id" UUID NOT NULL,
    "surface" "surface_group" NOT NULL,
    "site_index" SMALLINT NOT NULL DEFAULT 0,
    "grade" "furcation_grade" NOT NULL DEFAULT 'none',

    CONSTRAINT "periodontal_tooth_furcations_pkey" PRIMARY KEY ("furcation_id")
);

-- CreateTable
CREATE TABLE "periodontal_chart_summaries" (
    "summary_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chart_id" UUID NOT NULL,
    "total_teeth" INTEGER,
    "bop_percentage" DECIMAL(5,2),
    "plaque_percentage" DECIMAL(5,2),

    CONSTRAINT "periodontal_chart_summaries_pkey" PRIMARY KEY ("summary_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "patients_owner_user_id_hn_key" ON "patients"("owner_user_id", "hn");
CREATE UNIQUE INDEX "periodontal_charts_visit_id_key" ON "periodontal_charts"("visit_id");
CREATE UNIQUE INDEX "periodontal_chart_teeth_chart_id_tooth_number_key" ON "periodontal_chart_teeth"("chart_id", "tooth_number");
CREATE UNIQUE INDEX "periodontal_tooth_surfaces_chart_tooth_id_surface_key" ON "periodontal_tooth_surfaces"("chart_tooth_id", "surface");
CREATE UNIQUE INDEX "periodontal_tooth_sites_chart_tooth_id_surface_site_positio_key" ON "periodontal_tooth_sites"("chart_tooth_id", "surface", "site_position");
CREATE UNIQUE INDEX "periodontal_tooth_furcations_chart_tooth_id_surface_site_in_key" ON "periodontal_tooth_furcations"("chart_tooth_id", "surface", "site_index");
CREATE UNIQUE INDEX "periodontal_chart_summaries_chart_id_key" ON "periodontal_chart_summaries"("chart_id");

-- CreateIndex
CREATE INDEX "patients_owner_user_id_idx" ON "patients"("owner_user_id");

-- CreateIndex
CREATE INDEX "visits_patient_id_visit_date_idx" ON "visits"("patient_id", "visit_date" DESC);

-- CreateIndex
CREATE INDEX "visits_dentist_user_id_idx" ON "visits"("dentist_user_id");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_dentist_user_id_fkey" FOREIGN KEY ("dentist_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodontal_charts" ADD CONSTRAINT "periodontal_charts_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("visit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodontal_chart_teeth" ADD CONSTRAINT "periodontal_chart_teeth_chart_id_fkey" FOREIGN KEY ("chart_id") REFERENCES "periodontal_charts"("chart_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodontal_tooth_surfaces" ADD CONSTRAINT "periodontal_tooth_surfaces_chart_tooth_id_fkey" FOREIGN KEY ("chart_tooth_id") REFERENCES "periodontal_chart_teeth"("chart_tooth_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodontal_tooth_sites" ADD CONSTRAINT "periodontal_tooth_sites_chart_tooth_id_fkey" FOREIGN KEY ("chart_tooth_id") REFERENCES "periodontal_chart_teeth"("chart_tooth_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodontal_tooth_furcations" ADD CONSTRAINT "periodontal_tooth_furcations_chart_tooth_id_fkey" FOREIGN KEY ("chart_tooth_id") REFERENCES "periodontal_chart_teeth"("chart_tooth_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "periodontal_chart_summaries" ADD CONSTRAINT "periodontal_chart_summaries_chart_id_fkey" FOREIGN KEY ("chart_id") REFERENCES "periodontal_charts"("chart_id") ON DELETE CASCADE ON UPDATE CASCADE;

