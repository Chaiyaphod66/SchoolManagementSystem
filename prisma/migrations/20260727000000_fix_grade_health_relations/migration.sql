-- final_grades.semester_id stores the semester reference.
ALTER TABLE "final_grades"
DROP CONSTRAINT "fk_final_grade_semester";

ALTER TABLE "final_grades"
ADD CONSTRAINT "fk_final_grade_semester"
FOREIGN KEY ("semester_id") REFERENCES "semesters"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

-- health_checkup_records.student_id stores a student reference, not a user reference.
ALTER TABLE "health_checkup_records"
DROP CONSTRAINT "health_checkup_records_student_id_fkey";

ALTER TABLE "health_checkup_records"
ADD CONSTRAINT "health_checkup_records_student_id_fkey"
FOREIGN KEY ("student_id") REFERENCES "students"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
