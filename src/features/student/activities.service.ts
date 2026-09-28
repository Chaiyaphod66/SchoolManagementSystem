import { prisma } from '@/lib/prisma';
import { resolveTargetValues, formatTargetValue } from '@/lib/target-resolver';

async function getStudentAudience(studentId: number) {
    const student = await prisma.students.findUnique({
        where: { id: studentId },
        select: {
            user_id: true,
            users: { select: { role_id: true } },
            classroom_students: {
                orderBy: { academic_year_id: 'desc' },
                take: 1,
                select: { classroom_id: true },
            },
        },
    });
    if (!student) return null;
    return {
        userId: student.user_id,
        roleId: student.users.role_id,
        classroomId: student.classroom_students[0]?.classroom_id ?? null,
    };
}

export const ActivitiesService = {
    async getAllActivities(studentId: number) {
        const audience = await getStudentAudience(studentId);
        if (!audience) return [];

        const events: any[] = await prisma.$queryRaw`
            SELECT 
                e.id, e.title, e.description, e.start_datetime, e.end_datetime, 
                e.is_all_day, e.location, e.visibility, e.created_by,
                u.username as creator_name,
                et.name as event_type_name,
                d.department_name as department_name,
                t.first_name as teacher_first_name,
                t.last_name as teacher_last_name,
                np.prefix_name as teacher_prefix_name
            FROM events e
            LEFT JOIN users u ON e.created_by = u.id
            LEFT JOIN event_types et ON e.event_type_id = et.id
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN teachers t ON e.teacher_id = t.id
            LEFT JOIN name_prefixes np ON t.prefix_id = np.id
            WHERE LOWER(e.visibility) IN ('public', 'all')
               OR EXISTS (
                    SELECT 1
                    FROM event_targets audience_target
                    WHERE audience_target.event_id = e.id
                      AND (
                          UPPER(audience_target.target_type) = 'ALL'
                          OR (
                              UPPER(audience_target.target_type) = 'USER'
                              AND audience_target.target_value = ${String(audience.userId)}
                          )
                          OR (
                              UPPER(audience_target.target_type) = 'ROLE'
                              AND audience_target.target_value = ${String(audience.roleId)}
                          )
                          OR (
                              UPPER(audience_target.target_type) = 'CLASSROOM'
                              AND audience_target.target_value = ${String(audience.classroomId ?? '')}
                          )
                      )
               )
            ORDER BY e.start_datetime DESC
        `;

        // Fetch participants count and targets separately to avoid complex SQL
        const eventIds = events.map(e => e.id);
        let participantCounts: any[] = [];
        let eventTargets: any[] = [];
        
        if (eventIds.length > 0) {
            participantCounts = await prisma.$queryRawUnsafe(`
                SELECT event_id, COUNT(*)::int as count 
                FROM event_participants 
                WHERE event_id IN (${eventIds.join(',')})
                GROUP BY event_id
            `);

            eventTargets = await prisma.$queryRawUnsafe(`
                SELECT et.*, tt.display_name as target_type_display
                FROM event_targets et
                LEFT JOIN target_types tt ON et.target_type = tt.code
                WHERE et.event_id IN (${eventIds.join(',')})
            `);
        }

        const countMap = new Map(participantCounts.map(c => [c.event_id, c.count]));
        const targetsByEvent = new Map<number, any[]>();
        eventTargets.forEach(t => {
            const list = targetsByEvent.get(t.event_id) || [];
            list.push({
                target_type: t.target_type,
                target_value: t.target_value,
                target_types: { display_name: t.target_type_display }
            });
            targetsByEvent.set(t.event_id, list);
        });

        const targetDict = await resolveTargetValues(eventTargets);

        return events.map(e => ({
            id: e.id,
            title: e.title,
            name: e.title,
            description: e.description || '',
            date: e.start_datetime ? new Date(e.start_datetime).toISOString().split('T')[0] : null,
            start_date: e.start_datetime,
            end_date: e.end_datetime,
            is_all_day: e.is_all_day || false,
            location: e.location || '',
            visibility: e.visibility,
            created_by: e.creator_name || '',
            participant_count: countMap.get(e.id) || 0,
            event_type_name: e.event_type_name || 'ทั้งหมด',
            department_name: e.department_name || 'ทั้งหมด',
            teacher_name: e.teacher_first_name ? `${e.teacher_prefix_name || ''}${e.teacher_first_name} ${e.teacher_last_name}`.trim() : 'ทั้งหมด',
            targets: (targetsByEvent.get(e.id) || []).map(t => ({
                type_name: t.target_types?.display_name || t.target_type,
                value: formatTargetValue(t.target_type, t.target_value, targetDict)
            }))
        }));
    },

    async getStudentActivities(student_id: number) {
        if (!student_id) return [];

        // Get user_id from student
        const student = await prisma.students.findUnique({
            where: { id: student_id },
            select: { user_id: true }
        });
        if (!student) return [];

        // Raw SQL to avoid joins with outdated models
        const participations: any[] = await prisma.$queryRawUnsafe(`
            SELECT ep.*, e.id as event_id, e.title, e.start_datetime, e.end_datetime, e.location, e.description
            FROM event_participants ep
            JOIN events e ON ep.event_id = e.id
            WHERE ep.user_id = $1
            ORDER BY ep.registered_at DESC
        `, student.user_id);

        return participations.map(p => ({
            id: p.event_id,
            title: p.title,
            description: p.description || '',
            start_date: p.start_datetime,
            end_date: p.end_datetime,
            location: p.location || '',
            status: p.status || 'registered',
        }));
    },

    async getStudentActivityEvaluations(student_id: number, year: number, semester: number) {
        const audience = await getStudentAudience(student_id);
        if (!audience) return [];
        const student = await prisma.students.findUnique({
            where: { id: student_id },
            select: { user_id: true }
        });
        if (!student) return [];

        const semesterObj = await prisma.semesters.findFirst({
            where: {
                semester_number: semester,
                academic_years: { year_name: String(year) },
            },
            include: { academic_years: true }
        });
        
        if (!semesterObj) return [];

        const startDate = semesterObj.start_date || semesterObj.academic_years.start_date;
        const endDate = semesterObj.end_date || semesterObj.academic_years.end_date;

        // Fetch activities using raw SQL to handle potential schema sync issues
        // Use queryRaw with template literals for safer parameter binding
        const participations: any[] = await prisma.$queryRaw`
            SELECT 
                e.id, e.title, e.start_datetime as date, e.location,
                al.form_id,
                ef.form_name,
                EXISTS(
                    SELECT 1 FROM evaluation_responses er 
                    WHERE er.evaluator_user_id = ${student.user_id}
                    AND er.target_activity_id = e.id 
                    AND er.semester_id = ${semesterObj.id}
                ) as is_evaluated
            FROM events e
            LEFT JOIN event_evaluations al ON al.event_id = e.id
            LEFT JOIN evaluation_forms ef ON ef.id = al.form_id
            WHERE (
                e.semester_id = ${semesterObj.id} 
                OR (
                    ${startDate}::date IS NOT NULL AND ${endDate}::date IS NOT NULL 
                    AND e.start_datetime >= ${startDate}::timestamp 
                    AND e.start_datetime <= ${endDate}::timestamp
                )
            )
            AND (
                LOWER(e.visibility) IN ('public', 'all')
                OR EXISTS (
                    SELECT 1
                    FROM event_targets audience_target
                    WHERE audience_target.event_id = e.id
                      AND (
                          UPPER(audience_target.target_type) = 'ALL'
                          OR (UPPER(audience_target.target_type) = 'USER' AND audience_target.target_value = ${String(audience.userId)})
                          OR (UPPER(audience_target.target_type) = 'ROLE' AND audience_target.target_value = ${String(audience.roleId)})
                          OR (UPPER(audience_target.target_type) = 'CLASSROOM' AND audience_target.target_value = ${String(audience.classroomId ?? '')})
                      )
                )
            )
            ORDER BY e.start_datetime DESC
        `;

        return participations.map((p: any) => ({
            id: p.id,
            title: p.title,
            date: p.date,
            location: p.location,
            form_id: p.form_id || null,
            form_name: p.form_name || null,
            has_evaluation: !!p.form_id,
            is_evaluated: p.is_evaluated,
        }));
    },

    async submitActivityEvaluation(
        student_id: number,
        activity_id: number,
        year: number,
        semester: number,
        data: { name: string; value: number | string }[],
        feedback?: string
    ) {
        const visibleActivities = await this.getAllActivities(Number(student_id));
        if (!visibleActivities.some((activity: any) => Number(activity.id) === Number(activity_id))) {
            throw new Error('Activity is not available for this student');
        }

        // Resolve user_id from student_id
        const student = await prisma.students.findUnique({
            where: { id: Number(student_id) },
            select: { user_id: true }
        });
        
        if (!student) throw new Error(`Student with ID ${student_id} not found`);
        const user_id = student.user_id;

        // Resolve semester_id
        const semesterObj = await prisma.semesters.findFirst({
            where: {
                semester_number: Number(semester),
                academic_years: { year_name: String(year) },
            }
        });
        
        if (!semesterObj) throw new Error(`Semester ${semester}/${year} not found`);
        const semester_id = semesterObj.id;

        // The evaluation form must be explicitly linked to the activity.
        const eventData: any[] = await prisma.$queryRawUnsafe(`
            SELECT al.form_id
            FROM events e
            LEFT JOIN event_evaluations al ON al.event_id = e.id
            WHERE e.id = ${Number(activity_id)}
            LIMIT 1
        `);
        
        if (eventData.length === 0) throw new Error('Activity not found');
        
        const form_id = eventData[0].form_id;
        
        if (!form_id) throw new Error('No evaluation form linked to this activity');

        // Fetch questions for this form
        const questions: any[] = await prisma.$queryRawUnsafe(`
            SELECT eq.id, eq.question_text, eq.question_type_id 
            FROM evaluation_questions eq
            JOIN evaluation_sections es ON es.id = eq.section_id
            WHERE es.form_id = ${Number(form_id)}
        `);

        const questionMap = new Map<string, any>();
        questions.forEach(q => {
            if (q.question_text) {
                questionMap.set(q.question_text.trim().toLowerCase(), q);
            }
        });
        
        // --- AUTO REPAIR SEQUENCES ---
        try {
            console.log('Running inline sequence repair before submission...');
            const tables = ['evaluation_responses', 'evaluation_answers'];
            for (const table of tables) {
                const maxRes = await prisma.$queryRawUnsafe(`SELECT MAX(id) as max FROM ${table}`);
                const maxId = Number((maxRes as any)[0].max || 0);
                if (maxId > 0) {
                    await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), ${maxId}, true)`);
                }
            }
        } catch (e) {
            console.error('Sequence repair failed, proceeding anyway:', e);
        }
        // -----------------------------

        return prisma.$transaction(async (tx: any) => {
            const res = await tx.$queryRawUnsafe(`
                INSERT INTO evaluation_responses (form_id, evaluator_user_id, semester_id, target_activity_id, status, submitted_at)
                VALUES (${Number(form_id)}, ${Number(user_id)}, ${Number(semester_id)}, ${Number(activity_id)}, 'COMPLETED', NOW())
                RETURNING id
            `);
            
            const responseId = Number((res as any)[0].id);

            for (const item of data) {
                const qText = String(item.name || '').trim().toLowerCase();
                const q = questionMap.get(qText);
                
                if (q) {
                    const isText = q.question_type_id === 4;
                    const score = !isText && typeof item.value === 'number' ? item.value : null;
                    const text = (isText || typeof item.value === 'string') ? String(item.value) : null;
                    
                    await tx.$executeRawUnsafe(`
                        INSERT INTO evaluation_answers (response_id, question_id, score_value, text_value)
                        VALUES (${responseId}, ${Number(q.id)}, ${score}, ${text === null ? 'NULL' : `'${text.replace(/'/g, "''")}'`})
                    `);
                }
            }

            if (feedback?.trim()) {
                const cleanFeedback = feedback.trim().replace(/'/g, "''");
                await tx.$executeRawUnsafe(`
                    INSERT INTO evaluation_answers (response_id, text_value)
                    VALUES (${responseId}, '${cleanFeedback}')
                `);
            }

            return { success: true, id: responseId };
        });
    }
};
