-- A student belongs to exactly one classroom in an academic year.
CREATE UNIQUE INDEX "uq_classroom_student_one_room_per_year"
ON "classroom_students"("student_id", "academic_year_id");

-- The old primary-key name came from the former meaning of this table.
ALTER TABLE "classroom_assignments"
RENAME CONSTRAINT "teaching_assignments_pkey" TO "classroom_assignments_pkey";

-- Keep the legacy schedule table until its rows have been mapped to the new
-- teaching-assignment based schedule near the end of this migration.

CREATE TABLE "teaching_assignments" (
    "id" SERIAL NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "teacher_id" INTEGER NOT NULL,
    "classroom_id" INTEGER NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "status" VARCHAR(20) DEFAULT 'open',
    "grade_scale_group_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "teaching_assignments_subject_id_fkey"
        FOREIGN KEY ("subject_id") REFERENCES "subjects"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "teaching_assignments_teacher_id_fkey"
        FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "teaching_assignments_classroom_id_fkey"
        FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "teaching_assignments_semester_id_fkey"
        FOREIGN KEY ("semester_id") REFERENCES "semesters"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "teaching_assignments_grade_scale_group_id_fkey"
        FOREIGN KEY ("grade_scale_group_id") REFERENCES "grade_scale_groups"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_teaching_assignment_subject_class_term"
ON "teaching_assignments"("subject_id", "classroom_id", "semester_id");
CREATE INDEX "idx_teaching_assignment_teacher_term"
ON "teaching_assignments"("teacher_id", "semester_id");
CREATE INDEX "idx_teaching_assignment_class_term"
ON "teaching_assignments"("classroom_id", "semester_id");

CREATE TABLE "class_schedules" (
    "id" SERIAL NOT NULL,
    "teaching_assignment_id" INTEGER NOT NULL,
    "day_id" INTEGER NOT NULL,
    "period_id" INTEGER NOT NULL,
    "room_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "class_schedules_teaching_assignment_id_fkey"
        FOREIGN KEY ("teaching_assignment_id") REFERENCES "teaching_assignments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "class_schedules_day_id_fkey"
        FOREIGN KEY ("day_id") REFERENCES "day_of_weeks"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "class_schedules_period_id_fkey"
        FOREIGN KEY ("period_id") REFERENCES "periods"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION,
    CONSTRAINT "class_schedules_room_id_fkey"
        FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_class_schedule_assignment_slot"
ON "class_schedules"("teaching_assignment_id", "day_id", "period_id");
CREATE INDEX "idx_class_schedule_slot"
ON "class_schedules"("day_id", "period_id");

CREATE TABLE "exam_schedules" (
    "id" SERIAL NOT NULL,
    "teaching_assignment_id" INTEGER NOT NULL,
    "exam_type" VARCHAR(20) NOT NULL,
    "exam_date" DATE NOT NULL,
    "start_time" TIME(6) NOT NULL,
    "end_time" TIME(6) NOT NULL,
    "room_id" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "exam_schedules_teaching_assignment_id_fkey"
        FOREIGN KEY ("teaching_assignment_id") REFERENCES "teaching_assignments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "exam_schedules_room_id_fkey"
        FOREIGN KEY ("room_id") REFERENCES "rooms"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_exam_schedule_assignment_type"
ON "exam_schedules"("teaching_assignment_id", "exam_type");
CREATE INDEX "idx_exam_schedule_date" ON "exam_schedules"("exam_date");

-- Existing curriculum data is derived automatically. A subject is assigned to
-- the classroom of the same grade and the homeroom teacher for that year.
INSERT INTO "teaching_assignments" (
    "subject_id",
    "teacher_id",
    "classroom_id",
    "semester_id",
    "status",
    "grade_scale_group_id"
)
SELECT
    subject."id",
    advisor."teacher_id",
    classroom."id",
    semester."id",
    'open',
    subject."grade_scale_group_id"
FROM "subjects" AS subject
JOIN "classrooms" AS classroom
  ON classroom."grade_level_id" = subject."level_id"
JOIN "semesters" AS semester
  ON TRUE
JOIN "classroom_assignments" AS advisor
  ON advisor."classroom_id" = classroom."id"
 AND advisor."academic_year_id" = semester."academic_year_id"
WHERE subject."level_id" IS NOT NULL
ON CONFLICT ("subject_id", "classroom_id", "semester_id") DO NOTHING;

-- Preserve legacy timetable rows by resolving each one to the matching
-- subject/classroom/semester assignment. Rows without a matching assignment
-- are left in place and abort the drop so that they cannot be lost silently.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "class_schedule" legacy
        LEFT JOIN "teaching_assignments" assignment
          ON assignment."subject_id" = legacy."subject_id"
         AND assignment."classroom_id" = legacy."classroom_id"
         AND assignment."semester_id" = legacy."semester_id"
        WHERE assignment."id" IS NULL
    ) THEN
        RAISE EXCEPTION 'Legacy class_schedule contains rows that cannot be mapped to teaching_assignments';
    END IF;
END $$;

INSERT INTO "class_schedules" ("teaching_assignment_id", "day_id", "period_id")
SELECT assignment."id", legacy."day_of_week_id", legacy."period_id"
FROM "class_schedule" legacy
JOIN "teaching_assignments" assignment
  ON assignment."subject_id" = legacy."subject_id"
 AND assignment."classroom_id" = legacy."classroom_id"
 AND assignment."semester_id" = legacy."semester_id"
ON CONFLICT ("teaching_assignment_id", "day_id", "period_id") DO NOTHING;

DROP TABLE "class_schedule";
