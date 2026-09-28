DROP INDEX IF EXISTS "uq_teacher_year";
CREATE INDEX IF NOT EXISTS "idx_classroom_advisor_teacher_year"
ON "classroom_assignments"("teacher_id", "academic_year_id");

-- T007 is the homeroom teacher for the two kindergarten classrooms.
INSERT INTO "classroom_assignments"
    ("teacher_id", "capacity", "status", "academic_year_id", "classroom_id")
SELECT
    teacher.id,
    classroom.capacity,
    'open',
    academic_year.id,
    classroom.id
FROM "teachers" teacher
CROSS JOIN "academic_years" academic_year
JOIN "classrooms" classroom ON true
JOIN "grade_level" level ON level.id = classroom.grade_level_id
WHERE teacher.teacher_code = 'T007'
  AND academic_year.is_active = true
  AND level.grade_level_name IN ('อนุบาล 2', 'อนุบาล 3')
  AND NOT EXISTS (
      SELECT 1
      FROM "classroom_assignments" existing
      WHERE existing.classroom_id = classroom.id
        AND existing.academic_year_id = academic_year.id
  );

-- Every classroom gets one subject for each of the eight learning groups.
WITH missing_subjects AS (
    SELECT
        classroom.grade_level_id AS level_id,
        learning_group.id AS group_id,
        learning_group.group_name,
        ROW_NUMBER() OVER (
            ORDER BY classroom.grade_level_id, learning_group.id
        ) AS row_number
    FROM "classrooms" classroom
    CROSS JOIN "learning_subject_groups" learning_group
    WHERE NOT EXISTS (
        SELECT 1
        FROM "subjects" existing
        WHERE existing.level_id = classroom.grade_level_id
          AND existing.learning_subject_group_id = learning_group.id
    )
),
next_subject_id AS (
    SELECT COALESCE(MAX(id), 0) AS max_id FROM "subjects"
)
INSERT INTO "subjects"
    (
        "id",
        "subject_code",
        "subject_name",
        "credit",
        "learning_subject_group_id",
        "subject_categories_id",
        "level_id"
    )
SELECT
    next_subject_id.max_id + missing_subjects.row_number,
    'bnl-' || missing_subjects.level_id || '-' || missing_subjects.group_id,
    missing_subjects.group_name,
    1.0,
    missing_subjects.group_id,
    1,
    missing_subjects.level_id
FROM missing_subjects
CROSS JOIN next_subject_id;

-- The homeroom teacher teaches every subject assigned to their classroom.
INSERT INTO "teaching_assignments"
    ("subject_id", "teacher_id", "classroom_id", "semester_id", "status")
SELECT
    subject.id,
    advisor.teacher_id,
    classroom.id,
    semester.id,
    'open'
FROM "classrooms" classroom
JOIN "subjects" subject
  ON subject.level_id = classroom.grade_level_id
JOIN "semesters" semester
  ON semester.academic_year_id = (
      SELECT id FROM "academic_years" WHERE is_active = true ORDER BY id DESC LIMIT 1
  )
JOIN "classroom_assignments" advisor
  ON advisor.classroom_id = classroom.id
 AND advisor.academic_year_id = semester.academic_year_id
ON CONFLICT ("subject_id", "classroom_id", "semester_id") DO NOTHING;

-- A compact weekly timetable: one regular slot per learning group.
INSERT INTO "class_schedules"
    ("teaching_assignment_id", "day_id", "period_id", "room_id")
SELECT
    assignment.id,
    CASE subject.learning_subject_group_id
        WHEN 1 THEN 1
        WHEN 2 THEN 1
        WHEN 3 THEN 2
        WHEN 4 THEN 2
        WHEN 5 THEN 3
        WHEN 6 THEN 4
        WHEN 7 THEN 4
        ELSE 5
    END AS day_id,
    CASE subject.learning_subject_group_id
        WHEN 1 THEN 1
        WHEN 2 THEN 2
        WHEN 3 THEN 1
        WHEN 4 THEN 2
        WHEN 5 THEN 1
        WHEN 6 THEN 1
        WHEN 7 THEN 2
        ELSE 1
    END AS period_id,
    NULL
FROM "teaching_assignments" assignment
JOIN "subjects" subject ON subject.id = assignment.subject_id
JOIN "semesters" semester ON semester.id = assignment.semester_id
JOIN "academic_years" academic_year ON academic_year.id = semester.academic_year_id
WHERE academic_year.is_active = true
ON CONFLICT ("teaching_assignment_id", "day_id", "period_id") DO NOTHING;
