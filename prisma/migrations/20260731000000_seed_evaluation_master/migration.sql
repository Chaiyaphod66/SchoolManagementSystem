DO $$
<<seed>>
DECLARE
    category_id INTEGER;
    form_id INTEGER;
    section_id INTEGER;
    student_role_id INTEGER;
    teacher_role_id INTEGER;
    question_text TEXT;
    question_order INTEGER;
BEGIN
    SELECT id INTO student_role_id FROM roles WHERE UPPER(role_name) = 'STUDENT' LIMIT 1;
    SELECT id INTO teacher_role_id FROM roles WHERE UPPER(role_name) = 'TEACHER' LIMIT 1;

    -- Student evaluates subject teacher.
    SELECT id INTO category_id
    FROM evaluation_categories
    WHERE name = 'การประเมินการสอนของครู'
    LIMIT 1;
    IF category_id IS NULL THEN
        INSERT INTO evaluation_categories (name, description, evaluator_role_id, target_type)
        VALUES ('การประเมินการสอนของครู', 'นักเรียนประเมินการจัดการเรียนการสอน', student_role_id, 'teaching')
        RETURNING id INTO category_id;
    END IF;

    SELECT id INTO form_id FROM evaluation_forms WHERE form_name = 'แบบประเมินการสอน' LIMIT 1;
    IF form_id IS NULL THEN
        INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
        VALUES (category_id, 'แบบประเมินการสอน', 'นักเรียนประเมินครูผู้สอนรายวิชา', true)
        RETURNING id INTO form_id;
    END IF;
    SELECT id INTO section_id FROM evaluation_sections
    WHERE evaluation_sections.form_id = seed.form_id
      AND section_name = 'ด้านการจัดการเรียนการสอน'
    LIMIT 1;
    IF section_id IS NULL THEN
        INSERT INTO evaluation_sections (form_id, section_name, section_description, order_number)
        VALUES (form_id, 'ด้านการจัดการเรียนการสอน', 'ประเมินการจัดกิจกรรมและบรรยากาศการเรียนรู้', 1)
        RETURNING id INTO section_id;
    END IF;
    question_order := 0;
    FOREACH question_text IN ARRAY ARRAY[
        'ครูอธิบายเนื้อหาได้ชัดเจนและเข้าใจง่าย',
        'ครูจัดกิจกรรมที่เปิดโอกาสให้นักเรียนมีส่วนร่วม',
        'ครูใช้สื่อและตัวอย่างประกอบการสอนได้เหมาะสม',
        'ครูวัดและประเมินผลอย่างยุติธรรม',
        'ครูให้คำแนะนำและช่วยเหลือนักเรียนอย่างเหมาะสม'
    ] LOOP
        question_order := question_order + 1;
        IF NOT EXISTS (
            SELECT 1 FROM evaluation_questions
            WHERE evaluation_questions.section_id = seed.section_id
              AND evaluation_questions.question_text = seed.question_text
        ) THEN
            INSERT INTO evaluation_questions
                (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
            VALUES (section_id, question_text, 1, 1, true, question_order);
        END IF;
    END LOOP;

    -- Student evaluates classroom advisor.
    SELECT id INTO category_id
    FROM evaluation_categories
    WHERE name = 'การประเมินครูที่ปรึกษา'
    LIMIT 1;
    IF category_id IS NULL THEN
        INSERT INTO evaluation_categories (name, description, evaluator_role_id, target_type)
        VALUES ('การประเมินครูที่ปรึกษา', 'นักเรียนประเมินการดูแลช่วยเหลือของครูประจำชั้น', student_role_id, 'advisor')
        RETURNING id INTO category_id;
    END IF;
    SELECT id INTO form_id FROM evaluation_forms WHERE form_name = 'แบบประเมินครูที่ปรึกษา' LIMIT 1;
    IF form_id IS NULL THEN
        INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
        VALUES (category_id, 'แบบประเมินครูที่ปรึกษา', 'นักเรียนประเมินครูประจำชั้น', true)
        RETURNING id INTO form_id;
    END IF;
    SELECT id INTO section_id FROM evaluation_sections WHERE evaluation_sections.form_id = seed.form_id LIMIT 1;
    IF section_id IS NULL THEN
        INSERT INTO evaluation_sections (form_id, section_name, order_number)
        VALUES (form_id, 'ด้านการดูแลนักเรียน', 1)
        RETURNING id INTO section_id;
    END IF;
    question_order := 0;
    FOREACH question_text IN ARRAY ARRAY[
        'ครูให้คำปรึกษาเมื่อนักเรียนมีปัญหา',
        'ครูดูแลนักเรียนอย่างทั่วถึงและเท่าเทียม',
        'ครูสื่อสารข้อมูลสำคัญให้นักเรียนทราบ',
        'ครูส่งเสริมวินัยและความรับผิดชอบ',
        'ครูสร้างบรรยากาศที่นักเรียนไว้วางใจ'
    ] LOOP
        question_order := question_order + 1;
        IF NOT EXISTS (
            SELECT 1 FROM evaluation_questions
            WHERE evaluation_questions.section_id = seed.section_id
              AND evaluation_questions.question_text = seed.question_text
        ) THEN
            INSERT INTO evaluation_questions
                (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
            VALUES (section_id, question_text, 1, 1, true, question_order);
        END IF;
    END LOOP;

    -- Teacher evaluates students in a subject.
    SELECT id INTO category_id
    FROM evaluation_categories
    WHERE name = 'การประเมินผลผู้เรียนโดยครู'
    LIMIT 1;
    IF category_id IS NULL THEN
        INSERT INTO evaluation_categories (name, description, evaluator_role_id, target_type)
        VALUES ('การประเมินผลผู้เรียนโดยครู', 'ครูประเมินพัฒนาการของนักเรียน', teacher_role_id, 'student')
        RETURNING id INTO category_id;
    END IF;
    SELECT id INTO form_id FROM evaluation_forms WHERE form_name = 'แบบประเมินผลผู้เรียนรายวิชา' LIMIT 1;
    IF form_id IS NULL THEN
        INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
        VALUES (category_id, 'แบบประเมินผลผู้เรียนรายวิชา', 'ครูประเมินนักเรียนในรายวิชาที่รับผิดชอบ', true)
        RETURNING id INTO form_id;
    END IF;
    SELECT id INTO section_id FROM evaluation_sections WHERE evaluation_sections.form_id = seed.form_id LIMIT 1;
    IF section_id IS NULL THEN
        INSERT INTO evaluation_sections (form_id, section_name, order_number)
        VALUES (form_id, 'ผลการเรียนรู้และการมีส่วนร่วม', 1)
        RETURNING id INTO section_id;
    END IF;
    question_order := 0;
    FOREACH question_text IN ARRAY ARRAY[
        'ความเข้าใจเนื้อหา',
        'การนำความรู้ไปใช้',
        'การมีส่วนร่วมในชั้นเรียน',
        'ความรับผิดชอบต่องานที่ได้รับมอบหมาย',
        'พัฒนาการโดยรวม'
    ] LOOP
        question_order := question_order + 1;
        IF NOT EXISTS (
            SELECT 1 FROM evaluation_questions
            WHERE evaluation_questions.section_id = seed.section_id
              AND evaluation_questions.question_text = seed.question_text
        ) THEN
            INSERT INTO evaluation_questions
                (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
            VALUES (section_id, question_text, 1, 1, true, question_order);
        END IF;
    END LOOP;

    -- Homeroom teacher evaluates desirable attributes.
    SELECT id INTO form_id FROM evaluation_forms WHERE form_name = 'แบบประเมินคุณลักษณะอันพึงประสงค์' LIMIT 1;
    IF form_id IS NULL THEN
        INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
        VALUES (category_id, 'แบบประเมินคุณลักษณะอันพึงประสงค์', 'ครูประจำชั้นประเมินคุณลักษณะนักเรียน', true)
        RETURNING id INTO form_id;
    END IF;
    SELECT id INTO section_id FROM evaluation_sections WHERE evaluation_sections.form_id = seed.form_id LIMIT 1;
    IF section_id IS NULL THEN
        INSERT INTO evaluation_sections (form_id, section_name, order_number)
        VALUES (form_id, 'คุณลักษณะอันพึงประสงค์', 1)
        RETURNING id INTO section_id;
    END IF;
    question_order := 0;
    FOREACH question_text IN ARRAY ARRAY[
        'ความรับผิดชอบ',
        'วินัยและการตรงต่อเวลา',
        'ความตั้งใจเรียน',
        'การอยู่ร่วมกับผู้อื่น',
        'การปฏิบัติตามกฎระเบียบ'
    ] LOOP
        question_order := question_order + 1;
        IF NOT EXISTS (
            SELECT 1 FROM evaluation_questions
            WHERE evaluation_questions.section_id = seed.section_id
              AND evaluation_questions.question_text = seed.question_text
        ) THEN
            INSERT INTO evaluation_questions
                (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
            VALUES (section_id, question_text, 1, 1, true, question_order);
        END IF;
    END LOOP;

    -- Reading, analytical thinking, and writing.
    SELECT id INTO form_id FROM evaluation_forms WHERE form_name = 'แบบประเมินการอ่านคิดวิเคราะห์' LIMIT 1;
    IF form_id IS NULL THEN
        INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
        VALUES (category_id, 'แบบประเมินการอ่านคิดวิเคราะห์', 'ครูประจำชั้นประเมินการอ่าน คิดวิเคราะห์ และเขียน', true)
        RETURNING id INTO form_id;
    END IF;
    SELECT id INTO section_id FROM evaluation_sections WHERE evaluation_sections.form_id = seed.form_id LIMIT 1;
    IF section_id IS NULL THEN
        INSERT INTO evaluation_sections (form_id, section_name, order_number)
        VALUES (form_id, 'การอ่าน คิดวิเคราะห์ และเขียน', 1)
        RETURNING id INTO section_id;
    END IF;
    question_order := 0;
    FOREACH question_text IN ARRAY ARRAY['การอ่าน', 'การคิดวิเคราะห์', 'การเขียน'] LOOP
        question_order := question_order + 1;
        IF NOT EXISTS (
            SELECT 1 FROM evaluation_questions
            WHERE evaluation_questions.section_id = seed.section_id
              AND evaluation_questions.question_text = seed.question_text
        ) THEN
            INSERT INTO evaluation_questions
                (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
            VALUES (section_id, question_text, 1, 1, true, question_order);
        END IF;
    END LOOP;

    -- Student self-assessment (SDQ screen).
    SELECT id INTO category_id
    FROM evaluation_categories
    WHERE name = 'แบบประเมินตนเอง SDQ'
    LIMIT 1;
    IF category_id IS NULL THEN
        INSERT INTO evaluation_categories (name, description, evaluator_role_id, target_type)
        VALUES ('แบบประเมินตนเอง SDQ', 'นักเรียนประเมินพฤติกรรมและความรู้สึกของตนเอง', student_role_id, 'sdq')
        RETURNING id INTO category_id;
    END IF;
    SELECT id INTO form_id FROM evaluation_forms WHERE form_name = 'แบบประเมิน SDQ' LIMIT 1;
    IF form_id IS NULL THEN
        INSERT INTO evaluation_forms (category_id, form_name, description, is_active)
        VALUES (category_id, 'แบบประเมิน SDQ', 'แบบประเมินพฤติกรรมและความรู้สึกเบื้องต้น', true)
        RETURNING id INTO form_id;
    END IF;
    SELECT id INTO section_id FROM evaluation_sections WHERE evaluation_sections.form_id = seed.form_id LIMIT 1;
    IF section_id IS NULL THEN
        INSERT INTO evaluation_sections (form_id, section_name, order_number)
        VALUES (form_id, 'พฤติกรรมและความรู้สึก', 1)
        RETURNING id INTO section_id;
    END IF;
    question_order := 0;
    FOREACH question_text IN ARRAY ARRAY[
        'ฉันสามารถควบคุมอารมณ์ของตนเองได้',
        'ฉันมีสมาธิในการเรียนและการทำงาน',
        'ฉันสามารถทำงานร่วมกับเพื่อนได้',
        'ฉันกล้าขอความช่วยเหลือเมื่อมีปัญหา',
        'ฉันรู้สึกปลอดภัยและมีความสุขที่โรงเรียน'
    ] LOOP
        question_order := question_order + 1;
        IF NOT EXISTS (
            SELECT 1 FROM evaluation_questions
            WHERE evaluation_questions.section_id = seed.section_id
              AND evaluation_questions.question_text = seed.question_text
        ) THEN
            INSERT INTO evaluation_questions
                (section_id, question_text, scale_type_id, question_type_id, is_required, order_number)
            VALUES (section_id, question_text, 1, 1, true, question_order);
        END IF;
    END LOOP;
END $$;

SELECT setval(
    pg_get_serial_sequence('evaluation_categories', 'id'),
    COALESCE((SELECT MAX(id) FROM evaluation_categories), 1),
    true
);
SELECT setval(
    pg_get_serial_sequence('evaluation_forms', 'id'),
    COALESCE((SELECT MAX(id) FROM evaluation_forms), 1),
    true
);
SELECT setval(
    pg_get_serial_sequence('evaluation_sections', 'id'),
    COALESCE((SELECT MAX(id) FROM evaluation_sections), 1),
    true
);
SELECT setval(
    pg_get_serial_sequence('evaluation_questions', 'id'),
    COALESCE((SELECT MAX(id) FROM evaluation_questions), 1),
    true
);
