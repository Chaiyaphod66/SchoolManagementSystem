ALTER TABLE "student_scores"
ALTER COLUMN "student_id" SET NOT NULL;

ALTER TABLE "final_grades"
ALTER COLUMN "student_id" SET NOT NULL,
ALTER COLUMN "subject_id" SET NOT NULL,
ALTER COLUMN "semester_id" SET NOT NULL;
