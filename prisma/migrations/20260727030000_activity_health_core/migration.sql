CREATE TABLE "event_participants" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'registered',
    "registered_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "attended_at" TIMESTAMP(6),
    "remark" TEXT,
    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_participants_event_id_fkey"
        FOREIGN KEY ("event_id") REFERENCES "events"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "event_participants_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_event_participant"
ON "event_participants"("event_id", "user_id");
CREATE INDEX "idx_event_participant_user"
ON "event_participants"("user_id");

CREATE TABLE "event_evaluations" (
    "id" SERIAL NOT NULL,
    "event_id" INTEGER NOT NULL,
    "form_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_evaluations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_evaluations_event_id_fkey"
        FOREIGN KEY ("event_id") REFERENCES "events"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "event_evaluations_form_id_fkey"
        FOREIGN KEY ("form_id") REFERENCES "evaluation_forms"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_event_evaluation"
ON "event_evaluations"("event_id", "form_id");

ALTER TABLE "evaluation_responses"
ADD COLUMN "target_activity_id" INTEGER;
ALTER TABLE "evaluation_responses"
ADD CONSTRAINT "evaluation_responses_target_activity_id_fkey"
FOREIGN KEY ("target_activity_id") REFERENCES "events"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
CREATE INDEX "idx_eval_resp_activity"
ON "evaluation_responses"("target_activity_id");

ALTER TABLE "evaluation_answers"
ADD CONSTRAINT "evaluation_answers_response_id_fkey"
FOREIGN KEY ("response_id") REFERENCES "evaluation_responses"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "student_health_profiles" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "blood_type" VARCHAR(5),
    "allergies" TEXT,
    "chronic_illness" TEXT,
    "vaccinations" JSONB,
    "emergency_note" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_health_profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_health_profiles_student_id_fkey"
        FOREIGN KEY ("student_id") REFERENCES "students"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "student_health_profiles_student_id_key"
ON "student_health_profiles"("student_id");

CREATE TABLE "student_fitness_records" (
    "id" SERIAL NOT NULL,
    "student_id" INTEGER NOT NULL,
    "semester_id" INTEGER NOT NULL,
    "fitness_test_id" INTEGER NOT NULL,
    "test_result" DECIMAL(8,2),
    "grade" VARCHAR(30),
    "is_passed" BOOLEAN,
    "test_date" DATE NOT NULL DEFAULT CURRENT_DATE,
    "recorded_by" INTEGER,
    "semester" INTEGER,
    "academic_year" INTEGER,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "student_fitness_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "student_fitness_records_student_id_fkey"
        FOREIGN KEY ("student_id") REFERENCES "students"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "student_fitness_records_semester_id_fkey"
        FOREIGN KEY ("semester_id") REFERENCES "semesters"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "student_fitness_records_fitness_test_id_fkey"
        FOREIGN KEY ("fitness_test_id") REFERENCES "fitness_test_criteria"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT "student_fitness_records_recorded_by_fkey"
        FOREIGN KEY ("recorded_by") REFERENCES "teachers"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
);
CREATE UNIQUE INDEX "uq_student_fitness_term_test"
ON "student_fitness_records"("student_id", "semester_id", "fitness_test_id");
CREATE INDEX "idx_student_fitness_test"
ON "student_fitness_records"("fitness_test_id");
