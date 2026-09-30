ALTER TABLE "grade_categories"
DROP CONSTRAINT "grade_categories_teaching_assignment_id_fkey";

-- Legacy categories pointed to homeroom assignments and did not identify a
-- subject. Refuse an ambiguous automatic conversion instead of accidentally
-- attaching real scores to an unrelated teaching assignment.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "grade_categories") THEN
        RAISE EXCEPTION 'grade_categories contains legacy rows; map classroom_assignment_id to teaching_assignment_id explicitly before deploying this migration';
    END IF;
END $$;

ALTER TABLE "grade_categories"
RENAME COLUMN "classroom_assignment_id" TO "teaching_assignment_id";

ALTER TABLE "grade_categories"
ADD CONSTRAINT "grade_categories_teaching_assignment_id_fkey"
FOREIGN KEY ("teaching_assignment_id") REFERENCES "teaching_assignments"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE INDEX "idx_grade_category_assignment"
ON "grade_categories"("teaching_assignment_id");

CREATE TABLE "indicators" (
    "id" SERIAL NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "order_number" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "indicators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "indicators_subject_id_fkey"
        FOREIGN KEY ("subject_id") REFERENCES "subjects"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_indicator_subject_code"
ON "indicators"("subject_id", "code");

CREATE TABLE "assessment_item_indicators" (
    "id" SERIAL NOT NULL,
    "assessment_item_id" INTEGER NOT NULL,
    "indicator_id" INTEGER NOT NULL,
    CONSTRAINT "assessment_item_indicators_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "assessment_item_indicators_assessment_item_id_fkey"
        FOREIGN KEY ("assessment_item_id") REFERENCES "assessment_items"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "assessment_item_indicators_indicator_id_fkey"
        FOREIGN KEY ("indicator_id") REFERENCES "indicators"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_assessment_item_indicator"
ON "assessment_item_indicators"("assessment_item_id", "indicator_id");
