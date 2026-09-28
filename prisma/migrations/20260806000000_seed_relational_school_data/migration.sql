-- Relational demonstration data for the active academic year.
-- Every insert is resolved from existing school records instead of fixed entity IDs.

-- Complete optional student contact fields with clearly synthetic, internally related data.
WITH current_year AS (
    SELECT id, start_date
    FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC
    LIMIT 1
), current_class AS (
    SELECT DISTINCT ON (cs.student_id)
        cs.student_id,
        gl.grade_level_name,
        cy.start_date
    FROM classroom_students cs
    JOIN current_year cy ON cy.id = cs.academic_year_id
    JOIN classrooms c ON c.id = cs.classroom_id
    JOIN grade_level gl ON gl.id = c.grade_level_id
    ORDER BY cs.student_id, cs.id DESC
)
UPDATE students s
SET date_of_birth = COALESCE(
        s.date_of_birth,
        make_date(
            EXTRACT(YEAR FROM cc.start_date)::integer -
                CASE
                    WHEN cc.grade_level_name LIKE '%อนุบาล 2%' THEN 5
                    WHEN cc.grade_level_name LIKE '%อนุบาล 3%' THEN 6
                    WHEN cc.grade_level_name LIKE '%ปีที่ 1%' THEN 7
                    WHEN cc.grade_level_name LIKE '%ปีที่ 2%' THEN 8
                    WHEN cc.grade_level_name LIKE '%ปีที่ 3%' THEN 9
                    WHEN cc.grade_level_name LIKE '%ปีที่ 4%' THEN 10
                    WHEN cc.grade_level_name LIKE '%ปีที่ 5%' THEN 11
                    WHEN cc.grade_level_name LIKE '%ปีที่ 6%' THEN 12
                    ELSE 8
                END,
            1 + MOD(s.id, 12),
            1 + MOD(s.id, 27)
        )
    ),
    address = COALESCE(s.address, 'ตำบลควนเมา อำเภอรัษฎา จังหวัดตรัง'),
    parent_name = COALESCE(s.parent_name, CONCAT('ผู้ปกครองของ ', s.first_name, ' ', s.last_name)),
    parent_phone = COALESCE(s.parent_phone, CONCAT('080', LPAD(MOD(s.id, 10000000)::text, 7, '0'))),
    updated_at = CURRENT_TIMESTAMP
FROM current_class cc
WHERE cc.student_id = s.id;

-- Complete basic teacher profile fields without changing names or official identifiers.
UPDATE teachers
SET phone = COALESCE(phone, CONCAT('081', LPAD(MOD(id, 10000000)::text, 7, '0'))),
    hire_date = COALESCE(hire_date, make_date(2012 + MOD(id, 8), 5, 1)),
    birth_date = COALESCE(birth_date, make_date(1978 + MOD(id, 15), 1 + MOD(id, 12), 1 + MOD(id, 27))),
    blood_type = COALESCE(blood_type, (ARRAY['A', 'B', 'O', 'AB'])[1 + MOD(id, 4)]),
    updated_at = CURRENT_TIMESTAMP;

-- Curriculum indicators: two measurable indicators per existing subject.
INSERT INTO indicators (subject_id, code, description, order_number)
SELECT s.id, seed.code, seed.description, seed.order_number
FROM subjects s
CROSS JOIN (VALUES
    ('I1', 'เข้าใจความรู้และแนวคิดพื้นฐานของรายวิชา', 1),
    ('I2', 'ประยุกต์ใช้ความรู้เพื่อแก้ปัญหาและสื่อสารได้', 2)
) AS seed(code, description, order_number)
ON CONFLICT (subject_id, code) DO NOTHING;

-- Four weighted grade categories for every current-semester teaching assignment.
WITH current_semester AS (
    SELECT sem.id
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
), category_seed AS (
    SELECT * FROM (VALUES
        ('คะแนนระหว่างเรียน', 'คะแนนเก็บ', 30.00::numeric),
        ('สอบกลางภาค', 'สอบกลางภาค', 20.00::numeric),
        ('ชิ้นงานและภาระงาน', 'งาน/ชิ้นงาน', 20.00::numeric),
        ('สอบปลายภาค', 'สอบปลายภาค', 30.00::numeric)
    ) AS v(name, type_name, weight_percent)
)
INSERT INTO grade_categories (teaching_assignment_id, category_type_id, name, weight_percent)
SELECT ta.id, gct.id, seed.name, seed.weight_percent
FROM teaching_assignments ta
JOIN current_semester sem ON sem.id = ta.semester_id
CROSS JOIN category_seed seed
JOIN grade_category_types gct ON gct.type_name = seed.type_name
WHERE NOT EXISTS (
    SELECT 1 FROM grade_categories gc
    WHERE gc.teaching_assignment_id = ta.id AND gc.name = seed.name
);

-- One assessment item per category keeps the demo calculation transparent.
INSERT INTO assessment_items (grade_category_id, name, max_score)
SELECT gc.id, gc.name, gc.weight_percent
FROM grade_categories gc
WHERE NOT EXISTS (
    SELECT 1 FROM assessment_items ai
    WHERE ai.grade_category_id = gc.id AND ai.name = gc.name
);

-- Connect assessment work to an indicator from the actual subject.
INSERT INTO assessment_item_indicators (assessment_item_id, indicator_id)
SELECT ai.id,
       CASE WHEN gct.type_name IN ('สอบกลางภาค', 'สอบปลายภาค') THEN i2.id ELSE i1.id END
FROM assessment_items ai
JOIN grade_categories gc ON gc.id = ai.grade_category_id
JOIN grade_category_types gct ON gct.id = gc.category_type_id
JOIN teaching_assignments ta ON ta.id = gc.teaching_assignment_id
JOIN indicators i1 ON i1.subject_id = ta.subject_id AND i1.code = 'I1'
JOIN indicators i2 ON i2.subject_id = ta.subject_id AND i2.code = 'I2'
ON CONFLICT (assessment_item_id, indicator_id) DO NOTHING;

-- Deterministic scores only for students who belong to the assignment classroom/year.
WITH current_year AS (
    SELECT id FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC
    LIMIT 1
), current_semester AS (
    SELECT sem.id
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
)
INSERT INTO student_scores (student_id, assessment_item_id, score, is_missing, is_passed, remark)
SELECT cs.student_id,
       ai.id,
       ROUND(ai.max_score * (0.62 + MOD(cs.student_id + ta.subject_id + ai.id, 34)::numeric / 100), 2),
       false,
       true,
       'ข้อมูลตัวอย่างสัมพันธ์กับห้องเรียนและรายวิชา'
FROM teaching_assignments ta
JOIN current_semester sem ON sem.id = ta.semester_id
JOIN current_year ay ON true
JOIN classroom_students cs
  ON cs.classroom_id = ta.classroom_id AND cs.academic_year_id = ay.id
JOIN grade_categories gc ON gc.teaching_assignment_id = ta.id
JOIN assessment_items ai ON ai.grade_category_id = gc.id
ON CONFLICT (student_id, assessment_item_id) DO UPDATE
SET score = EXCLUDED.score,
    is_missing = false,
    is_passed = EXCLUDED.is_passed,
    remark = EXCLUDED.remark,
    updated_at = CURRENT_TIMESTAMP;

-- Calculate final grades from the weighted assessment data and the configured scale.
WITH totals AS (
    SELECT ss.student_id,
           ta.subject_id,
           ta.semester_id,
           ta.teacher_id,
           ROUND(SUM((COALESCE(ss.score, 0) / NULLIF(ai.max_score, 0)) * gc.weight_percent), 2) AS total_score
    FROM student_scores ss
    JOIN assessment_items ai ON ai.id = ss.assessment_item_id
    JOIN grade_categories gc ON gc.id = ai.grade_category_id
    JOIN teaching_assignments ta ON ta.id = gc.teaching_assignment_id
    GROUP BY ss.student_id, ta.subject_id, ta.semester_id, ta.teacher_id
), graded AS (
    SELECT totals.*, gs.id AS grade_scale_id, gs.letter_grade, gs.grade_point
    FROM totals
    LEFT JOIN LATERAL (
        SELECT id, letter_grade, grade_point
        FROM grade_scales
        WHERE totals.total_score BETWEEN min_score AND max_score
        ORDER BY min_score DESC
        LIMIT 1
    ) gs ON true
)
INSERT INTO final_grades
    (student_id, subject_id, semester_id, total_score, letter_grade, grade_point,
     grade_scale_id, calculated_by, calculated_at, is_locked)
SELECT student_id, subject_id, semester_id, total_score, letter_grade, grade_point,
       grade_scale_id, teacher_id, CURRENT_TIMESTAMP, false
FROM graded
ON CONFLICT (student_id, subject_id, semester_id) DO UPDATE
SET total_score = EXCLUDED.total_score,
    letter_grade = EXCLUDED.letter_grade,
    grade_point = EXCLUDED.grade_point,
    grade_scale_id = EXCLUDED.grade_scale_id,
    calculated_by = EXCLUDED.calculated_by,
    calculated_at = CURRENT_TIMESTAMP;

-- Midterm and final examination slots, spread across four days per classroom.
WITH current_semester AS (
    SELECT sem.id, sem.start_date, sem.end_date
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
), ranked AS (
    SELECT ta.id,
           ROW_NUMBER() OVER (PARTITION BY ta.classroom_id ORDER BY ta.subject_id) AS slot_no,
           sem.start_date,
           sem.end_date
    FROM teaching_assignments ta
    JOIN current_semester sem ON sem.id = ta.semester_id
)
INSERT INTO exam_schedules
    (teaching_assignment_id, exam_type, exam_date, start_time, end_time)
SELECT r.id,
       exam.exam_type,
       (CASE WHEN exam.exam_type = 'MIDTERM'
             THEN r.start_date + 60
             ELSE r.end_date - 10
        END + ((r.slot_no - 1) / 2)::integer)::date,
       CASE WHEN MOD(r.slot_no::integer - 1, 2) = 0 THEN TIME '08:30' ELSE TIME '13:00' END,
       CASE WHEN MOD(r.slot_no::integer - 1, 2) = 0 THEN TIME '10:00' ELSE TIME '14:30' END
FROM ranked r
CROSS JOIN (VALUES ('MIDTERM'), ('FINAL')) AS exam(exam_type)
ON CONFLICT (teaching_assignment_id, exam_type) DO UPDATE
SET exam_date = EXCLUDED.exam_date,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    updated_at = CURRENT_TIMESTAMP;

-- Ten recent school days of attendance for every current student.
WITH current_context AS (
    SELECT ay.id AS academic_year_id,
           COALESCE(sem.end_date, ay.end_date, CURRENT_DATE) AS end_date,
           COALESCE(sem.start_date, ay.start_date, CURRENT_DATE - 30) AS start_date
    FROM academic_years ay
    JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
), school_days AS (
    SELECT d::date AS check_date
    FROM current_context ctx,
         generate_series(
             GREATEST(ctx.start_date, LEAST(CURRENT_DATE, ctx.end_date) - 20),
             LEAST(CURRENT_DATE, ctx.end_date),
             INTERVAL '1 day'
         ) d
    WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
    ORDER BY d DESC
    LIMIT 10
)
INSERT INTO attendance_records (student_id, check_date, check_time, status_id, remark)
SELECT cs.student_id,
       sd.check_date,
       CASE WHEN MOD(cs.student_id + EXTRACT(DAY FROM sd.check_date)::integer, 17) = 0
            THEN TIME '08:20' ELSE TIME '07:50' END,
       CASE
           WHEN MOD(cs.student_id + EXTRACT(DAY FROM sd.check_date)::integer, 37) = 0 THEN 2
           WHEN MOD(cs.student_id + EXTRACT(DAY FROM sd.check_date)::integer, 29) = 0 THEN 3
           WHEN MOD(cs.student_id + EXTRACT(DAY FROM sd.check_date)::integer, 17) = 0 THEN 5
           ELSE 1
       END,
       CASE WHEN MOD(cs.student_id + EXTRACT(DAY FROM sd.check_date)::integer, 17) = 0
            THEN 'มาสายเล็กน้อย (ข้อมูลตัวอย่าง)' ELSE NULL END
FROM current_context ctx
JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
CROSS JOIN school_days sd
ON CONFLICT (student_id, check_date) DO NOTHING;

-- Health profiles and one semester checkup per student.
INSERT INTO student_health_profiles
    (student_id, blood_type, allergies, chronic_illness, vaccinations, emergency_note)
SELECT s.id,
       (ARRAY['A', 'B', 'O', 'AB'])[1 + MOD(s.id, 4)],
       CASE WHEN MOD(s.id, 17) = 0 THEN 'อาหารทะเล' ELSE NULL END,
       CASE WHEN MOD(s.id, 23) = 0 THEN 'หอบหืด' ELSE NULL END,
       jsonb_build_object('basic', 'ครบตามเกณฑ์', 'updated_year', 2569),
       CASE WHEN MOD(s.id, 17) = 0 THEN 'หลีกเลี่ยงอาหารทะเล' ELSE NULL END
FROM students s
ON CONFLICT (student_id) DO NOTHING;

WITH current_context AS (
    SELECT sem.id AS semester_id,
           COALESCE(sem.start_date, ay.start_date, CURRENT_DATE - 60) AS start_date,
           ay.id AS academic_year_id
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
), measurements AS (
    SELECT cs.student_id,
           ctx.semester_id,
           (ctx.start_date + 30)::date AS checkup_date,
           (105 +
             CASE
                 WHEN gl.grade_level_name LIKE '%อนุบาล 2%' THEN 0
                 WHEN gl.grade_level_name LIKE '%อนุบาล 3%' THEN 5
                 WHEN gl.grade_level_name LIKE '%ปีที่ 1%' THEN 10
                 WHEN gl.grade_level_name LIKE '%ปีที่ 2%' THEN 16
                 WHEN gl.grade_level_name LIKE '%ปีที่ 3%' THEN 22
                 WHEN gl.grade_level_name LIKE '%ปีที่ 4%' THEN 28
                 WHEN gl.grade_level_name LIKE '%ปีที่ 5%' THEN 34
                 WHEN gl.grade_level_name LIKE '%ปีที่ 6%' THEN 40
                 ELSE 15
             END + MOD(cs.student_id, 5))::numeric AS height,
           (17 +
             CASE
                 WHEN gl.grade_level_name LIKE '%อนุบาล%' THEN 0
                 WHEN gl.grade_level_name LIKE '%ปีที่ 1%' THEN 3
                 WHEN gl.grade_level_name LIKE '%ปีที่ 2%' THEN 6
                 WHEN gl.grade_level_name LIKE '%ปีที่ 3%' THEN 9
                 WHEN gl.grade_level_name LIKE '%ปีที่ 4%' THEN 12
                 WHEN gl.grade_level_name LIKE '%ปีที่ 5%' THEN 15
                 WHEN gl.grade_level_name LIKE '%ปีที่ 6%' THEN 18
                 ELSE 5
             END + MOD(cs.student_id, 4))::numeric AS weight
    FROM current_context ctx
    JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
    JOIN classrooms c ON c.id = cs.classroom_id
    JOIN grade_level gl ON gl.id = c.grade_level_id
)
INSERT INTO health_checkup_records
    (student_id, semester_id, checkup_date, weight, height, bmi,
     vision_left, vision_right, dental_status, doctor_note)
SELECT m.student_id, m.semester_id, m.checkup_date, m.weight, m.height,
       ROUND(m.weight / POWER(m.height / 100, 2), 2),
       'ปกติ', 'ปกติ',
       CASE WHEN MOD(m.student_id, 11) = 0 THEN 'ควรพบทันตแพทย์' ELSE 'ปกติ' END,
       'ตรวจสุขภาพประจำภาคเรียน (ข้อมูลตัวอย่าง)'
FROM measurements m
WHERE NOT EXISTS (
    SELECT 1 FROM health_checkup_records h
    WHERE h.student_id = m.student_id AND h.semester_id = m.semester_id
);

-- Five recent daily-health observations.
WITH current_context AS (
    SELECT sem.id AS semester_id, ay.id AS academic_year_id,
           COALESCE(sem.start_date, ay.start_date, CURRENT_DATE - 30) AS start_date,
           COALESCE(sem.end_date, ay.end_date, CURRENT_DATE) AS end_date
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
), school_days AS (
    SELECT d::date AS record_date
    FROM current_context ctx,
         generate_series(
             GREATEST(ctx.start_date, LEAST(CURRENT_DATE, ctx.end_date) - 10),
             LEAST(CURRENT_DATE, ctx.end_date), INTERVAL '1 day'
         ) d
    WHERE EXTRACT(ISODOW FROM d) BETWEEN 1 AND 5
    ORDER BY d DESC
    LIMIT 5
)
INSERT INTO student_daily_health_records
    (student_id, semester_id, record_date, drinks_milk, brushes_teeth, recorded_by)
SELECT cs.student_id, ctx.semester_id, sd.record_date,
       MOD(cs.student_id + EXTRACT(DAY FROM sd.record_date)::integer, 9) <> 0,
       MOD(cs.student_id + EXTRACT(DAY FROM sd.record_date)::integer, 13) <> 0,
       ca.teacher_id
FROM current_context ctx
JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
LEFT JOIN classroom_assignments ca
  ON ca.classroom_id = cs.classroom_id AND ca.academic_year_id = ctx.academic_year_id
CROSS JOIN school_days sd
ON CONFLICT (student_id, record_date) DO NOTHING;

-- Fitness criteria for each existing classroom level and student gender.
WITH current_year AS (
    SELECT id, year_name FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC
    LIMIT 1
), levels AS (
    SELECT DISTINCT gl.grade_level_name
    FROM classrooms c
    JOIN grade_level gl ON gl.id = c.grade_level_id
), criteria AS (
    SELECT * FROM (VALUES
        ('ยืนกระโดดไกล', 'เซนติเมตร', 105.00::numeric, '>='),
        ('ลุก-นั่ง 30 วินาที', 'ครั้ง', 10.00::numeric, '>='),
        ('นั่งงอตัวไปข้างหน้า', 'เซนติเมตร', 5.00::numeric, '>='),
        ('วิ่ง 50 เมตร', 'วินาที', 15.00::numeric, '<=')
    ) AS v(test_name, unit, threshold, comparison_type)
)
INSERT INTO fitness_test_criteria
    (test_name, unit, passing_threshold, comparison_type, academic_year, gender, grade_level)
SELECT c.test_name, c.unit,
       c.threshold + CASE WHEN c.comparison_type = '>=' AND l.grade_level_name LIKE '%ปีที่%'
                          THEN COALESCE(NULLIF(regexp_replace(l.grade_level_name, '[^0-9]', '', 'g'), '')::integer, 0) * 2
                          ELSE 0 END,
       c.comparison_type,
       cy.year_name::integer,
       g.name,
       l.grade_level_name
FROM current_year cy
CROSS JOIN levels l
CROSS JOIN genders g
CROSS JOIN criteria c
WHERE g.name IN ('ชาย', 'หญิง')
  AND NOT EXISTS (
      SELECT 1 FROM fitness_test_criteria f
      WHERE f.test_name = c.test_name
        AND f.academic_year = cy.year_name::integer
        AND f.gender = g.name
        AND f.grade_level = l.grade_level_name
  );

-- A fitness result always uses the matching year, level and gender criterion.
WITH current_context AS (
    SELECT sem.id AS semester_id, sem.semester_number, ay.id AS academic_year_id,
           ay.year_name::integer AS academic_year,
           (COALESCE(sem.start_date, ay.start_date, CURRENT_DATE - 30) + 45)::date AS test_date
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
), matched AS (
    SELECT cs.student_id, ctx.semester_id, ctx.semester_number, ctx.academic_year,
           ctx.test_date, ca.teacher_id, f.id AS fitness_test_id,
           f.passing_threshold, f.comparison_type,
           MOD(cs.student_id + f.id, 9) AS variance
    FROM current_context ctx
    JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
    JOIN students s ON s.id = cs.student_id
    JOIN genders g ON g.id = s.gender_id
    JOIN classrooms c ON c.id = cs.classroom_id
    JOIN grade_level gl ON gl.id = c.grade_level_id
    JOIN fitness_test_criteria f
      ON f.academic_year = ctx.academic_year
     AND f.gender = g.name
     AND f.grade_level = gl.grade_level_name
    LEFT JOIN classroom_assignments ca
      ON ca.classroom_id = cs.classroom_id AND ca.academic_year_id = ctx.academic_year_id
)
INSERT INTO student_fitness_records
    (student_id, semester_id, fitness_test_id, test_result, grade, is_passed,
     test_date, recorded_by, semester, academic_year)
SELECT student_id, semester_id, fitness_test_id,
       CASE WHEN comparison_type = '<='
            THEN passing_threshold - 1 + variance * 0.10
            ELSE passing_threshold + variance - 2 END,
       CASE WHEN variance = 0 THEN 'ควรปรับปรุง' ELSE 'ผ่าน' END,
       variance <> 0,
       test_date, teacher_id, semester_number, academic_year
FROM matched
ON CONFLICT (student_id, semester_id, fitness_test_id) DO NOTHING;

-- Activity evaluation master data (the original forms only covered teaching/advisor/student/SDQ).
INSERT INTO evaluation_categories (name, description, evaluator_role_id, target_type)
SELECT 'การประเมินกิจกรรม', 'นักเรียนประเมินความพึงพอใจและประโยชน์ที่ได้รับจากกิจกรรม', r.id, 'activity'
FROM roles r
WHERE r.role_name = 'STUDENT'
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_categories ec WHERE ec.target_type = 'activity'
  );

INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
SELECT ec.id, 'แบบประเมินความพึงพอใจกิจกรรม',
       'แบบประเมินหลังเข้าร่วมกิจกรรมของโรงเรียน', true
FROM evaluation_categories ec
WHERE ec.target_type = 'activity'
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_forms ef
      WHERE ef.form_name = 'แบบประเมินความพึงพอใจกิจกรรม'
  );

INSERT INTO evaluation_sections (form_id, section_name, section_description, order_number)
SELECT ef.id, 'ความพึงพอใจต่อกิจกรรม', 'ประเมินภาพรวมและข้อเสนอแนะ', 1
FROM evaluation_forms ef
WHERE ef.form_name = 'แบบประเมินความพึงพอใจกิจกรรม'
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_sections es
      WHERE es.form_id = ef.id AND es.section_name = 'ความพึงพอใจต่อกิจกรรม'
  );

WITH question_seed AS (
    SELECT * FROM (VALUES
        ('กิจกรรมมีความน่าสนใจและเหมาะสม', 'RATING', 1),
        ('นักเรียนได้รับความรู้หรือประสบการณ์ใหม่', 'RATING', 2),
        ('ระยะเวลาและสถานที่มีความเหมาะสม', 'RATING', 3),
        ('นักเรียนสามารถนำสิ่งที่ได้ไปใช้ประโยชน์', 'RATING', 4),
        ('ข้อเสนอแนะเพิ่มเติม', 'TEXT', 5)
    ) AS v(question_text, type_code, order_number)
)
INSERT INTO evaluation_questions
    (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
SELECT es.id, seed.question_text,
       CASE WHEN seed.type_code = 'RATING'
            THEN (SELECT id FROM evaluation_scale_types ORDER BY id LIMIT 1)
            ELSE NULL END,
       qt.id,
       seed.type_code <> 'TEXT',
       seed.order_number
FROM evaluation_forms ef
JOIN evaluation_sections es ON es.form_id = ef.id
CROSS JOIN question_seed seed
JOIN evaluation_question_types qt ON qt.code_name = seed.type_code
WHERE ef.form_name = 'แบบประเมินความพึงพอใจกิจกรรม'
  AND es.section_name = 'ความพึงพอใจต่อกิจกรรม'
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_questions q
      WHERE q.section_id = es.id AND q.question_text = seed.question_text
  );

-- Open an evaluation window for every active form in the current semester.
WITH current_semester AS (
    SELECT sem.id, COALESCE(sem.start_date, ay.start_date) AS start_date,
           COALESCE(sem.end_date, ay.end_date) AS end_date
    FROM semesters sem
    JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number
    LIMIT 1
)
INSERT INTO evaluation_schedules (form_id, semester_id, start_time, end_time, description)
SELECT ef.id, sem.id,
       sem.start_date::timestamp + TIME '00:00',
       sem.end_date::timestamp + TIME '23:59',
       'ช่วงประเมินภาคเรียนปัจจุบัน'
FROM evaluation_forms ef
CROSS JOIN current_semester sem
WHERE ef.is_active = true
  AND sem.start_date IS NOT NULL
  AND sem.end_date IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_schedules es
      WHERE es.form_id = ef.id AND es.semester_id = sem.id
  );

-- Three projects tied to the active year, responsible teachers and real lookup records.
WITH current_year AS (
    SELECT id, year_name, start_date, end_date
    FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC
    LIMIT 1
), project_seed AS (
    SELECT * FROM (VALUES
        ('001', 'โครงการยกระดับผลสัมฤทธิ์ทางการเรียน', 'T001',
         'ฝ่ายบริหารงานวิชาการ', 'โครงการตามแผนปฏิบัติการ', 'งบอุดหนุนรัฐบาล',
         30000.00::numeric, 'IN_PROGRESS',
         'พัฒนาทักษะพื้นฐานและลดความแตกต่างระหว่างผู้เรียน',
         'นักเรียนมีผลการเรียนและทักษะการเรียนรู้ที่ดีขึ้น', 50),
        ('002', 'โครงการส่งเสริมสุขภาพและสมรรถภาพนักเรียน', 'T007',
         'ฝ่ายบริหารงานทั่วไป', 'กิจกรรมพัฒนาผู้เรียน', 'งบอุดหนุนรัฐบาล',
         18000.00::numeric, 'APPROVED',
         'ส่งเสริมสุขนิสัยและติดตามภาวะสุขภาพของนักเรียนอย่างต่อเนื่อง',
         'นักเรียนมีสุขนิสัยที่เหมาะสมและผ่านเกณฑ์สมรรถภาพ', 50),
        ('003', 'โครงการส่งเสริมนิสัยรักการอ่าน', 'T003',
         'ฝ่ายบริหารงานวิชาการ', 'โครงการตามแผนปฏิบัติการ', 'งบรายได้สถานศึกษา',
         12000.00::numeric, 'APPROVED',
         'เพิ่มโอกาสการเข้าถึงหนังสือและกิจกรรมอ่านอย่างสม่ำเสมอ',
         'นักเรียนอ่านคล่องขึ้นและเลือกอ่านตามความสนใจ', 50)
    ) AS v(code_suffix, project_name, teacher_code, department_name,
           project_type_name, budget_type_name, budget, status,
           rationale, expected_outcomes, target_participants)
)
INSERT INTO projects
    (project_code, project_name, description, teacher_id, start_date, end_date,
     department_id, budget_type_id, allocated_budget, project_type_id,
     academic_year_id, status, rationale, expected_outcomes, target_participants,
     created_by, submitted_by, approved_by, submitted_at, approved_at)
SELECT CONCAT('BKL-', cy.year_name, '-', seed.code_suffix),
       seed.project_name,
       CONCAT(seed.project_name, ' ประจำปีการศึกษา ', cy.year_name),
       t.id,
       cy.start_date + 30,
       LEAST(cy.end_date, cy.start_date + 240),
       d.id, bt.id, seed.budget, pt.id, cy.id, seed.status,
       seed.rationale, seed.expected_outcomes, seed.target_participants,
       creator.id, creator.id, director.id,
       cy.start_date::timestamp + INTERVAL '10 days',
       cy.start_date::timestamp + INTERVAL '15 days'
FROM current_year cy
CROSS JOIN project_seed seed
JOIN teachers t ON t.teacher_code = seed.teacher_code
JOIN departments d ON d.department_name = seed.department_name
JOIN project_types pt ON pt.name = seed.project_type_name
JOIN budget_types bt ON bt.name = seed.budget_type_name
JOIN users creator ON creator.id = t.user_id
CROSS JOIN LATERAL (
    SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.role_name = 'DIRECTOR' ORDER BY u.id LIMIT 1
) director
ON CONFLICT (project_code) DO NOTHING;

WITH project_seed AS (
    SELECT * FROM (VALUES
        ('001', 'พัฒนาผลสัมฤทธิ์และทักษะพื้นฐานของนักเรียน',
         'ร้อยละของนักเรียนที่ผ่านเกณฑ์รายวิชา', '85', 'ร้อยละ',
         'วิเคราะห์ผลและจัดกิจกรรมเสริมทักษะ', 16000.00::numeric),
        ('002', 'ส่งเสริมสุขนิสัยและสมรรถภาพทางกาย',
         'ร้อยละของนักเรียนที่ผ่านเกณฑ์สมรรถภาพ', '80', 'ร้อยละ',
         'ตรวจสุขภาพและทดสอบสมรรถภาพ', 10000.00::numeric),
        ('003', 'สร้างนิสัยรักการอ่านอย่างต่อเนื่อง',
         'จำนวนนักเรียนที่เข้าร่วมกิจกรรมอ่าน', '50', 'คน',
         'กิจกรรมอ่านทุกวันและบันทึกการอ่าน', 7000.00::numeric)
    ) AS v(code_suffix, objective, indicator_name, target_value, unit,
           activity_name, activity_budget)
), current_year AS (
    SELECT year_name, start_date, end_date FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC LIMIT 1
), seeded_projects AS (
    SELECT p.*, seed.objective, seed.indicator_name, seed.target_value, seed.unit,
           seed.activity_name, seed.activity_budget, cy.start_date, cy.end_date
    FROM project_seed seed
    CROSS JOIN current_year cy
    JOIN projects p ON p.project_code = CONCAT('BKL-', cy.year_name, '-', seed.code_suffix)
)
INSERT INTO project_objectives (project_id, objective_text, order_number)
SELECT id, objective, 1 FROM seeded_projects sp
WHERE NOT EXISTS (
    SELECT 1 FROM project_objectives po
    WHERE po.project_id = sp.id AND po.objective_text = sp.objective
);

WITH project_seed AS (
    SELECT * FROM (VALUES
        ('001', 'ร้อยละของนักเรียนที่ผ่านเกณฑ์รายวิชา', '85', 'ร้อยละ'),
        ('002', 'ร้อยละของนักเรียนที่ผ่านเกณฑ์สมรรถภาพ', '80', 'ร้อยละ'),
        ('003', 'จำนวนนักเรียนที่เข้าร่วมกิจกรรมอ่าน', '50', 'คน')
    ) AS v(code_suffix, indicator_name, target_value, unit)
), current_year AS (
    SELECT year_name FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC LIMIT 1
)
INSERT INTO project_indicators
    (project_id, indicator_name, target_value, actual_value, unit, result_note, order_number)
SELECT p.id, seed.indicator_name, seed.target_value,
       CASE WHEN seed.code_suffix = '001' THEN '78' ELSE NULL END,
       seed.unit, 'ติดตามจากข้อมูลในระบบ', 1
FROM project_seed seed
CROSS JOIN current_year cy
JOIN projects p ON p.project_code = CONCAT('BKL-', cy.year_name, '-', seed.code_suffix)
WHERE NOT EXISTS (
    SELECT 1 FROM project_indicators pi
    WHERE pi.project_id = p.id AND pi.indicator_name = seed.indicator_name
);

WITH project_seed AS (
    SELECT * FROM (VALUES
        ('001', 'วิเคราะห์ผลและจัดกิจกรรมเสริมทักษะ', 'T001', 16000.00::numeric, 'IN_PROGRESS'),
        ('002', 'ตรวจสุขภาพและทดสอบสมรรถภาพ', 'T007', 10000.00::numeric, 'IN_PROGRESS'),
        ('003', 'กิจกรรมอ่านทุกวันและบันทึกการอ่าน', 'T003', 7000.00::numeric, 'IN_PROGRESS')
    ) AS v(code_suffix, activity_name, teacher_code, planned_budget, status)
), current_year AS (
    SELECT year_name, start_date FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC LIMIT 1
)
INSERT INTO project_activities
    (project_id, activity_name, description, responsible_teacher_id,
     start_date, end_date, planned_budget, status, order_number)
SELECT p.id, seed.activity_name, CONCAT(seed.activity_name, ' ตามแผนงานประจำปี'),
       t.id, cy.start_date + 45, cy.start_date + 180,
       seed.planned_budget, seed.status, 1
FROM project_seed seed
CROSS JOIN current_year cy
JOIN projects p ON p.project_code = CONCAT('BKL-', cy.year_name, '-', seed.code_suffix)
JOIN teachers t ON t.teacher_code = seed.teacher_code
WHERE NOT EXISTS (
    SELECT 1 FROM project_activities pa
    WHERE pa.project_id = p.id AND pa.activity_name = seed.activity_name
);

WITH current_context AS (
    SELECT ay.year_name, sem.id AS semester_id
    FROM academic_years ay
    JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), budget_seed AS (
    SELECT * FROM (VALUES
        ('001', 'ค่าวัสดุ', 18000.00::numeric, 'วัสดุและสื่อการเรียนรู้'),
        ('002', 'ค่าใช้สอย', 10000.00::numeric, 'บริการตรวจสุขภาพและกิจกรรมกีฬา'),
        ('003', 'ค่าวัสดุ', 7000.00::numeric, 'หนังสือและอุปกรณ์บันทึกการอ่าน')
    ) AS v(code_suffix, category_name, planned_amount, note)
)
INSERT INTO project_budgets (project_id, semester_id, expense_category_id, planned_amount, note)
SELECT p.id, ctx.semester_id, ec.id, seed.planned_amount, seed.note
FROM current_context ctx
CROSS JOIN budget_seed seed
JOIN projects p ON p.project_code = CONCAT('BKL-', ctx.year_name, '-', seed.code_suffix)
JOIN expense_categories ec ON ec.name = seed.category_name
ON CONFLICT (project_id, semester_id, expense_category_id) DO NOTHING;

WITH current_context AS (
    SELECT ay.year_name, ay.start_date, sem.id AS semester_id
    FROM academic_years ay
    JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), expense_seed AS (
    SELECT * FROM (VALUES
        ('001', 'จัดซื้อสื่อและแบบฝึกเสริมทักษะ', 'ค่าวัสดุ', 8500.00::numeric),
        ('002', 'อุปกรณ์ตรวจสุขภาพและกีฬา', 'ค่าใช้สอย', 6200.00::numeric),
        ('003', 'หนังสือส่งเสริมการอ่าน', 'ค่าวัสดุ', 4800.00::numeric)
    ) AS v(code_suffix, title, category_name, amount)
)
INSERT INTO project_expenses
    (project_id, expense_date, title, amount, recorded_by, expense_category_id,
     semester_id, vendor_name, status, approved_by, approved_at, note)
SELECT p.id, ctx.start_date + 70, seed.title, seed.amount,
       p.created_by, ec.id, ctx.semester_id, 'ร้านค้าชุมชนตัวอย่าง',
       'APPROVED', p.approved_by, ctx.start_date::timestamp + INTERVAL '72 days',
       'รายการตัวอย่างตามกรอบงบประมาณโครงการ'
FROM current_context ctx
CROSS JOIN expense_seed seed
JOIN projects p ON p.project_code = CONCAT('BKL-', ctx.year_name, '-', seed.code_suffix)
JOIN expense_categories ec ON ec.name = seed.category_name
WHERE NOT EXISTS (
    SELECT 1 FROM project_expenses pe
    WHERE pe.project_id = p.id AND pe.semester_id = ctx.semester_id AND pe.title = seed.title
);

INSERT INTO project_approvals (project_id, action, action_by, note, created_at)
SELECT p.id, 'APPROVED', p.approved_by, 'อนุมัติตามแผนปฏิบัติการประจำปี', p.approved_at
FROM projects p
WHERE p.project_code LIKE 'BKL-%'
  AND p.approved_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM project_approvals pa
      WHERE pa.project_id = p.id AND pa.action = 'APPROVED'
  );

-- School events connected to the current semester and responsible staff.
WITH current_context AS (
    SELECT ay.id AS academic_year_id, ay.year_name, sem.id AS semester_id,
           COALESCE(sem.start_date, ay.start_date) AS start_date,
           COALESCE(sem.end_date, ay.end_date) AS end_date
    FROM academic_years ay
    JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), event_seed AS (
    SELECT * FROM (VALUES
        ('กิจกรรมวันสิ่งแวดล้อมโรงเรียน', 'ร่วมดูแลความสะอาดและสิ่งแวดล้อมภายในโรงเรียน',
         45, 2, 'T007', 'ฝ่ายบริหารงานทั่วไป', 'ลานกิจกรรม', true),
        ('กิจกรรมอ่านสร้างสุข', 'ฐานกิจกรรมอ่านและเล่าเรื่องจากหนังสือที่สนใจ',
         90, 1, 'T003', 'ฝ่ายบริหารงานวิชาการ', 'ห้องสมุดโรงเรียน', false),
        ('ประชุมผู้ปกครองภาคเรียนที่ 1', 'แลกเปลี่ยนข้อมูลการเรียนและการดูแลช่วยเหลือนักเรียน',
         110, 4, 'T001', 'ฝ่ายบริหารงานทั่วไป', 'อาคารอเนกประสงค์', true)
    ) AS v(title, description, day_offset, event_type_id, teacher_code,
           department_name, location, is_all_day)
)
INSERT INTO events
    (title, description, start_datetime, end_datetime, is_all_day, location,
     created_by, visibility, teacher_id, event_type_id, department_id, semester_id)
SELECT seed.title, seed.description,
       (ctx.start_date + seed.day_offset)::timestamp +
           CASE WHEN seed.is_all_day THEN TIME '08:30' ELSE TIME '09:00' END,
       (ctx.start_date + seed.day_offset)::timestamp +
           CASE WHEN seed.is_all_day THEN TIME '15:30' ELSE TIME '12:00' END,
       seed.is_all_day, seed.location, director.id, 'public',
       t.id, et.id, d.id, ctx.semester_id
FROM current_context ctx
CROSS JOIN event_seed seed
JOIN teachers t ON t.teacher_code = seed.teacher_code
JOIN departments d ON d.department_name = seed.department_name
JOIN event_types et ON et.id = seed.event_type_id
CROSS JOIN LATERAL (
    SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.role_name = 'DIRECTOR' ORDER BY u.id LIMIT 1
) director
WHERE NOT EXISTS (
    SELECT 1 FROM events e
    WHERE e.title = seed.title AND e.semester_id = ctx.semester_id
);

INSERT INTO event_targets (event_id, target_type, target_value)
SELECT e.id, 'ALL', NULL
FROM events e
WHERE e.title IN (
    'กิจกรรมวันสิ่งแวดล้อมโรงเรียน',
    'กิจกรรมอ่านสร้างสุข',
    'ประชุมผู้ปกครองภาคเรียนที่ 1'
)
  AND NOT EXISTS (
      SELECT 1 FROM event_targets et
      WHERE et.event_id = e.id AND et.target_type = 'ALL'
  );

-- All current students attended the first completed activity.
WITH current_year AS (
    SELECT id FROM academic_years
    ORDER BY is_active DESC NULLS LAST, year_name DESC LIMIT 1
), target_event AS (
    SELECT id, end_datetime FROM events
    WHERE title = 'กิจกรรมวันสิ่งแวดล้อมโรงเรียน'
    ORDER BY id DESC LIMIT 1
)
INSERT INTO event_participants (event_id, user_id, status, registered_at, attended_at, remark)
SELECT te.id, s.user_id, 'attended', te.end_datetime - INTERVAL '7 days',
       te.end_datetime, 'เข้าร่วมกิจกรรม (ข้อมูลตัวอย่าง)'
FROM target_event te
CROSS JOIN current_year cy
JOIN classroom_students cs ON cs.academic_year_id = cy.id
JOIN students s ON s.id = cs.student_id
ON CONFLICT (event_id, user_id) DO NOTHING;

INSERT INTO event_evaluations (event_id, form_id)
SELECT e.id, f.id
FROM events e
CROSS JOIN evaluation_forms f
WHERE e.title = 'กิจกรรมวันสิ่งแวดล้อมโรงเรียน'
  AND f.form_name = 'แบบประเมินความพึงพอใจกิจกรรม'
ON CONFLICT (event_id, form_id) DO NOTHING;

-- Student evaluation of one real teaching assignment in their classroom.
WITH current_context AS (
    SELECT ay.id AS academic_year_id, sem.id AS semester_id
    FROM academic_years ay JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), first_assignment AS (
    SELECT cs.student_id, s.user_id, ta.id AS assignment_id, ta.teacher_id,
           ROW_NUMBER() OVER (PARTITION BY cs.student_id ORDER BY ta.subject_id) AS rn,
           ctx.semester_id
    FROM current_context ctx
    JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
    JOIN students s ON s.id = cs.student_id
    JOIN teaching_assignments ta
      ON ta.classroom_id = cs.classroom_id AND ta.semester_id = ctx.semester_id
), target_form AS (
    SELECT ef.id FROM evaluation_forms ef
    JOIN evaluation_categories ec ON ec.id = ef.category_id
    WHERE ec.target_type = 'teaching' AND ef.is_active = true
    ORDER BY ef.id LIMIT 1
)
INSERT INTO evaluation_responses
    (form_id, evaluator_user_id, target_teacher_id, target_subject_id,
     status, submitted_at, semester_id)
SELECT tf.id, fa.user_id, fa.teacher_id, fa.assignment_id,
       'COMPLETED', CURRENT_TIMESTAMP - INTERVAL '5 days', fa.semester_id
FROM first_assignment fa CROSS JOIN target_form tf
WHERE fa.rn = 1
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_responses er
      WHERE er.form_id = tf.id AND er.evaluator_user_id = fa.user_id
        AND er.target_subject_id = fa.assignment_id AND er.semester_id = fa.semester_id
  );

-- Student evaluation of the advisor assigned to the same classroom/year.
WITH current_context AS (
    SELECT ay.id AS academic_year_id, sem.id AS semester_id
    FROM academic_years ay JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), target_form AS (
    SELECT ef.id FROM evaluation_forms ef
    JOIN evaluation_categories ec ON ec.id = ef.category_id
    WHERE ec.target_type = 'advisor' AND ef.is_active = true
    ORDER BY ef.id LIMIT 1
)
INSERT INTO evaluation_responses
    (form_id, evaluator_user_id, target_teacher_id, status, submitted_at, semester_id)
SELECT tf.id, s.user_id, ca.teacher_id, 'COMPLETED',
       CURRENT_TIMESTAMP - INTERVAL '4 days', ctx.semester_id
FROM current_context ctx
JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
JOIN students s ON s.id = cs.student_id
JOIN classroom_assignments ca
  ON ca.classroom_id = cs.classroom_id AND ca.academic_year_id = ctx.academic_year_id
CROSS JOIN target_form tf
WHERE NOT EXISTS (
    SELECT 1 FROM evaluation_responses er
    WHERE er.form_id = tf.id AND er.evaluator_user_id = s.user_id
      AND er.target_teacher_id = ca.teacher_id AND er.semester_id = ctx.semester_id
);

-- Teachers evaluate students in one subject, plus both homeroom evaluation forms.
WITH current_context AS (
    SELECT ay.id AS academic_year_id, sem.id AS semester_id
    FROM academic_years ay JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), first_assignment AS (
    SELECT cs.student_id, ta.id AS assignment_id, ta.teacher_id, t.user_id AS teacher_user_id,
           ROW_NUMBER() OVER (PARTITION BY cs.student_id ORDER BY ta.subject_id) AS rn,
           ctx.semester_id
    FROM current_context ctx
    JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
    JOIN teaching_assignments ta
      ON ta.classroom_id = cs.classroom_id AND ta.semester_id = ctx.semester_id
    JOIN teachers t ON t.id = ta.teacher_id
), target_form AS (
    SELECT ef.id FROM evaluation_forms ef
    WHERE ef.form_name = 'แบบประเมินผลผู้เรียนรายวิชา' AND ef.is_active = true
    ORDER BY ef.id LIMIT 1
)
INSERT INTO evaluation_responses
    (form_id, evaluator_user_id, target_student_id, target_teacher_id,
     target_subject_id, status, submitted_at, semester_id)
SELECT tf.id, fa.teacher_user_id, fa.student_id, fa.teacher_id,
       fa.assignment_id, 'COMPLETED', CURRENT_TIMESTAMP - INTERVAL '3 days', fa.semester_id
FROM first_assignment fa CROSS JOIN target_form tf
WHERE fa.rn = 1
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_responses er
      WHERE er.form_id = tf.id AND er.target_student_id = fa.student_id
        AND er.target_subject_id = fa.assignment_id AND er.semester_id = fa.semester_id
  );

WITH current_context AS (
    SELECT ay.id AS academic_year_id, sem.id AS semester_id
    FROM academic_years ay JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), homeroom_forms AS (
    SELECT id FROM evaluation_forms
    WHERE form_name IN ('แบบประเมินคุณลักษณะอันพึงประสงค์', 'แบบประเมินการอ่านคิดวิเคราะห์')
      AND is_active = true
)
INSERT INTO evaluation_responses
    (form_id, evaluator_user_id, target_student_id, target_teacher_id,
     status, submitted_at, semester_id)
SELECT hf.id, t.user_id, cs.student_id, ca.teacher_id,
       'COMPLETED', CURRENT_TIMESTAMP - INTERVAL '2 days', ctx.semester_id
FROM current_context ctx
JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
JOIN classroom_assignments ca
  ON ca.classroom_id = cs.classroom_id AND ca.academic_year_id = ctx.academic_year_id
JOIN teachers t ON t.id = ca.teacher_id
CROSS JOIN homeroom_forms hf
WHERE NOT EXISTS (
    SELECT 1 FROM evaluation_responses er
    WHERE er.form_id = hf.id AND er.target_student_id = cs.student_id
      AND er.target_subject_id IS NULL AND er.semester_id = ctx.semester_id
);

-- Student SDQ self-assessment.
WITH current_context AS (
    SELECT ay.id AS academic_year_id, sem.id AS semester_id
    FROM academic_years ay JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), target_form AS (
    SELECT ef.id FROM evaluation_forms ef
    JOIN evaluation_categories ec ON ec.id = ef.category_id
    WHERE ec.target_type = 'sdq' AND ef.is_active = true
    ORDER BY ef.id LIMIT 1
)
INSERT INTO evaluation_responses
    (form_id, evaluator_user_id, status, submitted_at, semester_id)
SELECT tf.id, s.user_id, 'COMPLETED', CURRENT_TIMESTAMP - INTERVAL '1 day', ctx.semester_id
FROM current_context ctx
JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
JOIN students s ON s.id = cs.student_id
CROSS JOIN target_form tf
WHERE NOT EXISTS (
    SELECT 1 FROM evaluation_responses er
    WHERE er.form_id = tf.id AND er.evaluator_user_id = s.user_id
      AND er.semester_id = ctx.semester_id
);

-- Half of the participants have completed the past activity evaluation.
WITH current_context AS (
    SELECT ay.id AS academic_year_id, sem.id AS semester_id
    FROM academic_years ay JOIN semesters sem ON sem.academic_year_id = ay.id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
), target_event AS (
    SELECT id FROM events WHERE title = 'กิจกรรมวันสิ่งแวดล้อมโรงเรียน'
    ORDER BY id DESC LIMIT 1
), target_form AS (
    SELECT id FROM evaluation_forms WHERE form_name = 'แบบประเมินความพึงพอใจกิจกรรม'
    ORDER BY id LIMIT 1
)
INSERT INTO evaluation_responses
    (form_id, evaluator_user_id, target_activity_id, status, submitted_at, semester_id)
SELECT tf.id, s.user_id, te.id, 'COMPLETED', CURRENT_TIMESTAMP, ctx.semester_id
FROM current_context ctx
JOIN classroom_students cs ON cs.academic_year_id = ctx.academic_year_id
JOIN students s ON s.id = cs.student_id
CROSS JOIN target_event te CROSS JOIN target_form tf
WHERE MOD(s.id, 2) = 0
  AND NOT EXISTS (
      SELECT 1 FROM evaluation_responses er
      WHERE er.form_id = tf.id AND er.evaluator_user_id = s.user_id
        AND er.target_activity_id = te.id AND er.semester_id = ctx.semester_id
  );

-- Complete every seeded current-semester response with answers from its actual form.
WITH current_semester AS (
    SELECT sem.id
    FROM semesters sem JOIN academic_years ay ON ay.id = sem.academic_year_id
    ORDER BY sem.is_active DESC NULLS LAST, ay.is_active DESC NULLS LAST,
             ay.year_name DESC, sem.semester_number LIMIT 1
)
INSERT INTO evaluation_answers (response_id, question_id, score_value, text_value)
SELECT er.id, q.id,
       CASE WHEN qt.code_name = 'TEXT' THEN NULL
            ELSE (3 + MOD(er.id + q.id, 3))::numeric END,
       CASE WHEN qt.code_name = 'TEXT' THEN 'กิจกรรมและการเรียนรู้เหมาะสม ควรจัดอย่างต่อเนื่อง'
            ELSE NULL END
FROM evaluation_responses er
JOIN current_semester sem ON sem.id = er.semester_id
JOIN evaluation_sections es ON es.form_id = er.form_id
JOIN evaluation_questions q ON q.section_id = es.id
LEFT JOIN evaluation_question_types qt ON qt.id = q.question_type_id
WHERE NOT EXISTS (
    SELECT 1 FROM evaluation_answers ea
    WHERE ea.response_id = er.id AND ea.question_id = q.id
);
