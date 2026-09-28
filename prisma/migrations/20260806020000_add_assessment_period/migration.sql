ALTER TABLE "assessment_items"
ADD COLUMN "assessment_period" VARCHAR(20);

ALTER TABLE "assessment_items"
ADD CONSTRAINT "assessment_items_period_check"
CHECK (
    "assessment_period" IS NULL
    OR "assessment_period" IN ('before_midterm', 'after_midterm')
);

-- Existing continuous-assessment items need a valid initial period.
UPDATE "assessment_items" ai
SET "assessment_period" = 'before_midterm'
FROM "grade_categories" gc
JOIN "grade_category_types" gct ON gct.id = gc.category_type_id
WHERE ai.grade_category_id = gc.id
  AND (gct.type_name LIKE '%คะแนนเก็บ%' OR gct.type_name LIKE '%ระหว่างภาค%')
  AND ai.assessment_period IS NULL;
