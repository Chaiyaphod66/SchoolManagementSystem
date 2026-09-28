-- Keep the synthetic health data varied enough for dashboard distributions.
-- Weight is derived from each recorded height and a deterministic BMI band.
UPDATE health_checkup_records h
SET weight = ROUND(
        POWER(h.height / 100, 2) * (16.5 + MOD(h.student_id, 8) * 1.1),
        2
    ),
    bmi = ROUND(16.5 + MOD(h.student_id, 8) * 1.1, 2)
WHERE h.height IS NOT NULL
  AND h.doctor_note = 'ตรวจสุขภาพประจำภาคเรียน (ข้อมูลตัวอย่าง)';
