import { prisma } from '@/lib/prisma';

function extractLevelNumber(value: string) {
    const m = String(value || '').match(/(\d+)/);
    return m ? m[1] : '';
}

function toHabitBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (value == null || value === '') return null;
    const text = String(value).trim().toLowerCase();
    return !(text === 'false' || text === '0' || text === 'no' ||
        text.includes('ไม่ได้') || text.includes('ไม่'));
}

/**
 * Fitness service is stubbed because current DB has no fitness result tables.
 * It still resolves students by class/room so the page can be used for data entry UI.
 */
export const TeacherFitnessService = {
    async getStudentsForTest(teacher_id: number, classLevel?: string, room?: string, year?: number, semester?: number) {
        // Find authorized classrooms first
        const advisorClassrooms = await prisma.classroom_assignments.findMany({
            where: { teacher_id },
            select: { classroom_id: true }
        });
        const authorizedIds = advisorClassrooms.map(ac => ac.classroom_id);

        if (authorizedIds.length === 0) return [];

        const where: any = {
            classroom_students: {
                some: {
                    classroom_id: { in: authorizedIds },
                    classrooms: {}
                }
            }
        };
        
        if ((classLevel && classLevel !== 'ทั้งหมด') || (room && room !== 'ทั้งหมด')) {
            if (classLevel && classLevel !== 'ทั้งหมด') {
                const levelNum = extractLevelNumber(classLevel);
                if (levelNum) {
                    where.classroom_students.some.classrooms.levels = {
                        grade_level_name: { contains: levelNum }
                    };
                } else {
                    where.classroom_students.some.classrooms.levels = {
                        grade_level_name: classLevel
                    };
                }
            }
            
            if (room && room !== 'ทั้งหมด') {
                where.classroom_students.some.classrooms.room_name = { endsWith: room };
            }
        }

        const students = await (prisma.students as any).findMany({
            where,
            orderBy: { student_code: 'asc' },
            include: {
                name_prefixes: true,
                genders: true,
                classroom_students: { 
                    include: { classrooms: { include: { levels: true } } },
                    take: 1
                }
            },
        });

        // 2. Fetch existing fitness results and health checkups
        let fitnessRecords: any[] = [];
        let healthRecords: any[] = [];

        try {
            const studentIds = students.map((s: any) => s.id);
            if (studentIds.length > 0) {
                const idsString = studentIds.join(',');
                fitnessRecords = await prisma.$queryRawUnsafe<any[]>(
                    `SELECT f.id, f.student_id, f.test_result, f.grade, f.is_passed, f.fitness_test_id, f.created_at,
                            c.test_name
                     FROM student_fitness_records f
                     LEFT JOIN fitness_test_criteria c ON f.fitness_test_id = c.id
                     WHERE f.student_id IN (${idsString})`
                );
            }
        } catch (e) {
            console.error("Error fetching fitness records:", e);
            fitnessRecords = [];
        }

        try {
            const studentIds = students.map((s: any) => s.id);
            if (studentIds.length > 0) {
                const idsString = studentIds.join(',');
                healthRecords = await prisma.$queryRawUnsafe<any[]>(`
                    SELECT h.id, h.student_id, h.weight, h.height, h.checkup_date, h.created_at,
                           (SELECT d.brushes_teeth FROM student_daily_health_records d
                            WHERE d.student_id = h.student_id ORDER BY d.record_date DESC LIMIT 1) AS teeth_brushing,
                           (SELECT d.drinks_milk FROM student_daily_health_records d
                            WHERE d.student_id = h.student_id ORDER BY d.record_date DESC LIMIT 1) AS milk_drinking
                    FROM health_checkup_records h
                    WHERE h.student_id IN (${idsString})
                `);
            } else {
                healthRecords = [];
            }
        } catch (e) {
            console.error("Error fetching health checkups:", e);
            healthRecords = [];
        }

        // 3. Map students with their results
        const mapped = (students as any[]).map((s: any) => {
            const cs = s.classroom_students?.[0];
            const currentClassroom = cs?.classrooms;
            const levelName = currentClassroom?.levels?.grade_level_name || '';
            const roomName = currentClassroom?.room_name || '';
            const className = levelName && roomName && roomName !== levelName
                ? `${levelName}/${roomName}`
                : (levelName || roomName || '');
            
            const studentFitness = fitnessRecords.filter(r => r.student_id === s.id);
            const studentHealthRecords = healthRecords.filter(r => r.student_id === s.id);
            // Aggregate weight and height from all records in the term, taking the most recent non-null values
            const sortedHealth = [...studentHealthRecords].sort((a, b) => (b.created_at?.getTime() || 0) - (a.created_at?.getTime() || 0));
            const latestWeight = sortedHealth.find(r => r.weight !== null && r.weight !== undefined)?.weight;
            const latestHeight = sortedHealth.find(r => r.height !== null && r.height !== undefined)?.height;

            const tests = studentFitness.map(r => ({
                test_name: r.test_name,
                test_result: r.test_result,
                status: r.grade,
                is_passed: r.is_passed,
                fitness_test_id: r.fitness_test_id
            }));

            // Merge weight/height from healthRecords if they exist
            if (latestWeight !== undefined && latestWeight !== null) {
                tests.push({ test_name: "น้ำหนัก (Weight)", test_result: latestWeight, status: null, is_passed: null, fitness_test_id: null });
            }
            if (latestHeight !== undefined && latestHeight !== null) {
                tests.push({ test_name: "ส่วนสูง (Height)", test_result: latestHeight, status: null, is_passed: null, fitness_test_id: null });
            }

            return {
                id: s.id,
                student_code: s.student_code,
                prefix: s.name_prefixes?.prefix_name || '',
                first_name: s.first_name,
                last_name: s.last_name,
                gender: s.genders?.name || '',
                grade_level: levelName,
                class_name: className,
                roll_number: cs?.roll_number,
                fitness_tests: tests,
            };
        });

        const recordsMap: Record<number, { weight?: number, height?: number, teeth_brushing?: string | null, milk_drinking?: string | null, fitness: Record<string, any> }> = {};
        
        let semesterId: number | null = null;
        if (year && semester) {
            const semRes = await prisma.$queryRawUnsafe<any[]>(`
                SELECT s.id 
                FROM semesters s 
                JOIN academic_years a ON s.academic_year_id = a.id 
                WHERE a.year_name = $1 AND s.semester_number = $2
            `, String(year), Number(semester));
            if (semRes.length > 0) semesterId = semRes[0].id;
        }

        if (semesterId) {
             const studentIds = mapped.map((s: any) => Number(s.id)).filter(id => !isNaN(id) && id > 0);
             
             if (studentIds.length > 0) {
                 let healthRecords: any[] = [];
                 let fitnessRecords: any[] = [];
                 
                 try {
                     const idsStr = studentIds.join(',');
                     healthRecords = await prisma.$queryRawUnsafe<any[]>(`
                         SELECT h.student_id, h.weight, h.height,
                                (SELECT d.brushes_teeth FROM student_daily_health_records d
                                 WHERE d.student_id = h.student_id AND d.semester_id = $1
                                 ORDER BY d.record_date DESC LIMIT 1) AS teeth_brushing,
                                (SELECT d.drinks_milk FROM student_daily_health_records d
                                 WHERE d.student_id = h.student_id AND d.semester_id = $1
                                 ORDER BY d.record_date DESC LIMIT 1) AS milk_drinking
                         FROM health_checkup_records h
                         WHERE h.semester_id = $1 AND h.student_id IN (${idsStr})
                         ORDER BY h.checkup_date DESC
                     `, semesterId);
                 } catch (e) {
                     console.error("Failed to fetch existing health records:", e);
                 }
                 
                 try {
                     const idsStr = studentIds.join(',');
                     fitnessRecords = await prisma.$queryRawUnsafe<any[]>(`
                         SELECT r.student_id, c.test_name, r.test_result, r.grade 
                         FROM student_fitness_records r
                         LEFT JOIN fitness_test_criteria c ON r.fitness_test_id = c.id
                         WHERE (r.semester = $1 OR r.semester_id = $1) AND r.student_id IN (${idsStr})
                     `, Number(semesterId));
                 } catch (e) {
                     console.error("Failed to fetch existing fitness records:", e);
                 }
                 
                 healthRecords.forEach(h => {
                     if (!recordsMap[h.student_id]) recordsMap[h.student_id] = { fitness: {} };
                     recordsMap[h.student_id].weight = h.weight != null ? Number(h.weight) : undefined;
                     recordsMap[h.student_id].height = h.height != null ? Number(h.height) : undefined;
                     recordsMap[h.student_id].teeth_brushing = h.teeth_brushing;
                     recordsMap[h.student_id].milk_drinking = h.milk_drinking;
                 });
                 
                 fitnessRecords.forEach(f => {
                     if (!recordsMap[f.student_id]) recordsMap[f.student_id] = { fitness: {} };
                     if (f.test_name) {
                         recordsMap[f.student_id].fitness[f.test_name] = {
                             result: f.test_result != null ? Number(f.test_result) : undefined,
                             status: f.grade || undefined
                         };
                     }
                 });
             }
        }

        const finalMapped = mapped.map((s: any) => ({
            ...s,
            existing_health: recordsMap[s.id] ? { 
                weight: recordsMap[s.id].weight, 
                height: recordsMap[s.id].height,
                teeth_brushing: (recordsMap[s.id] as any).teeth_brushing,
                milk_drinking: (recordsMap[s.id] as any).milk_drinking
            } : null,
            existing_fitness: recordsMap[s.id]?.fitness || {},
        }));

        return finalMapped.sort((a, b) => {
            const aNum = a.roll_number != null ? Number(a.roll_number) : 999999;
            const bNum = b.roll_number != null ? Number(b.roll_number) : 999999;
            if (aNum !== bNum) return aNum - bNum;
            return String(a.student_code || '').localeCompare(String(b.student_code || ''));
        });
    },
    async getAcademicYears() {
        return prisma.academic_years.findMany({
            orderBy: { year_name: 'desc' },
            select: {
                id: true,
                year_name: true,
                is_active: true,
                semesters: {
                    select: {
                        id: true,
                        semester_number: true,
                        is_active: true
                    },
                    orderBy: {
                        semester_number: 'asc'
                    }
                }
            }
        });
    },
    async getAdvisorClasses(teacher_id: number) {
        const advisors = await prisma.classroom_assignments.findMany({
            where: { teacher_id },
            include: {
                classrooms: {
                    include: {
                        levels: true
                    }
                }
            }
        });

        return advisors.map(a => ({
            class_level: a.classrooms.levels.grade_level_name || '',
            room: a.classrooms.room_name
        }));
    },
    async getFitnessCriteria(test_name: string, grade_level: string, academic_year?: number, gender?: string) {
        let sql = `SELECT * FROM fitness_test_criteria WHERE test_name ILIKE $1`;
        const params: any[] = [`%${test_name}%`];
        let pIdx = 2;

        if (grade_level) {
            const levelNum = extractLevelNumber(grade_level);
            if (levelNum) {
                sql += ` AND (grade_level ILIKE $${pIdx} OR grade_level ILIKE $${pIdx + 1})`;
                params.push(`%${levelNum}%`, `%${grade_level}%`);
                pIdx += 2;
            } else {
                sql += ` AND grade_level ILIKE $${pIdx}`;
                params.push(`%${grade_level}%`);
                pIdx++;
            }
        }
        if (academic_year) {
            sql += ` AND academic_year = $${pIdx}`;
            params.push(academic_year);
            pIdx++;
        }
        if (gender) {
            sql += ` AND gender = $${pIdx}`;
            params.push(gender);
            pIdx++;
        }
        sql += ` ORDER BY created_at DESC LIMIT 1`;

        const results = await prisma.$queryRawUnsafe<any[]>(sql, ...params);
        return results[0] || null;
    },
    async getFitnessCriteriaForClass(test_name: string, grade_level: string, academic_year?: number) {
        let sql = `SELECT * FROM fitness_test_criteria WHERE test_name ILIKE $1`;
        const params: any[] = [`%${test_name}%`];
        let pIdx = 2;

        if (grade_level) {
            const levelNum = extractLevelNumber(grade_level);
            if (levelNum) {
                sql += ` AND (grade_level ILIKE $${pIdx} OR grade_level ILIKE $${pIdx + 1})`;
                params.push(`%${levelNum}%`, `%${grade_level}%`);
                pIdx += 2;
            } else {
                sql += ` AND grade_level ILIKE $${pIdx}`;
                params.push(`%${grade_level}%`);
                pIdx++;
            }
        }
        if (academic_year) {
            sql += ` AND academic_year = $${pIdx}`;
            params.push(academic_year);
            pIdx++;
        }
        sql += ` ORDER BY created_at DESC`;

        return prisma.$queryRawUnsafe<any[]>(sql, ...params);
    },

    async getAllCriteria(test_name?: string, grade_level?: string, academic_year?: number) {
        let sql = `SELECT * FROM fitness_test_criteria WHERE 1=1`;
        const params: any[] = [];
        let pIdx = 1;

        if (test_name) {
            sql += ` AND test_name ILIKE $${pIdx}`;
            params.push(`%${test_name}%`);
            pIdx++;
        }
        if (grade_level) {
            const levelNum = extractLevelNumber(grade_level);
            if (levelNum) {
                sql += ` AND (grade_level ILIKE $${pIdx} OR grade_level ILIKE $${pIdx + 1})`;
                params.push(`%${levelNum}%`, `%${grade_level}%`);
                pIdx += 2;
            } else {
                sql += ` AND grade_level ILIKE $${pIdx}`;
                params.push(`%${grade_level}%`);
                pIdx++;
            }
        }
        if (academic_year) {
            sql += ` AND academic_year = $${pIdx}`;
            params.push(academic_year);
            pIdx++;
        }
        sql += ` ORDER BY test_name ASC, grade_level ASC, gender ASC`;

        return prisma.$queryRawUnsafe<any[]>(sql, ...params);
    },

    async getDropdownOptions() {
        const [testNames, levels] = await Promise.all([
            prisma.$queryRaw<any[]>`
                SELECT DISTINCT test_name, unit 
                FROM fitness_test_criteria 
                WHERE test_name IS NOT NULL
                ORDER BY test_name ASC
            `,
            prisma.$queryRaw<any[]>`
                SELECT id, grade_level_name AS name FROM grade_level ORDER BY grade_level_name ASC
            `
        ]);
        return { testNames, levels };
    },

    async upsertCriteria(data: any) {
        const { id, test_name, grade_level, gender, passing_threshold, unit, comparison_type, academic_year } = data;
        const pThres = parseFloat(passing_threshold) || 0;
        const aYear = academic_year ? parseInt(academic_year as any) : null;

        if (id) {
            const results = await prisma.$queryRawUnsafe<any[]>(`
                UPDATE fitness_test_criteria 
                SET test_name = $1, grade_level = $2, gender = $3, passing_threshold = $4, 
                    unit = $5, comparison_type = $6, academic_year = $7
                WHERE id = $8
                RETURNING *
            `, test_name, grade_level, gender, pThres, unit, comparison_type, aYear, parseInt(id as any));
            return results[0];
        } else {
            const results = await prisma.$queryRawUnsafe<any[]>(`
                INSERT INTO fitness_test_criteria (test_name, grade_level, gender, passing_threshold, unit, comparison_type, academic_year)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, test_name, grade_level, gender, pThres, unit, comparison_type, aYear);
            return results[0];
        }
    },

    async deleteCriteria(id: number) {
        const criteriaId = parseInt(id as any);
        if (!criteriaId || Number.isNaN(criteriaId)) throw new Error('id is required');

        return prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`
                DELETE FROM student_fitness_records
                WHERE fitness_test_id = $1
            `, criteriaId);

            return tx.$executeRawUnsafe(`
                DELETE FROM fitness_test_criteria WHERE id = $1
            `, criteriaId);
        });
    },
    async saveFitnessTest(data: any) {
        const { record_type, student_id, teacher_id, test_name, result_value, status, year, semester, criteria_id, weight, height, teeth_brushing, milk_drinking } = data;

        const sId = Number(student_id);
        const tId = teacher_id ? Number(teacher_id) : null;

        // Resolve semesterId
        let semesterId: number | null = null;
        if (year && semester) {
            const semRes = await prisma.$queryRawUnsafe<any[]>(`
                SELECT s.id 
                FROM semesters s 
                JOIN academic_years a ON s.academic_year_id = a.id 
                WHERE a.year_name = $1 AND s.semester_number = $2
            `, String(year), Number(semester));
            if (semRes.length > 0) semesterId = semRes[0].id;
        }

        if (!semesterId) {
            throw new Error('ไม่พบข้อมูลปีการศึกษา/ภาคเรียนในระบบ');
        }

        // 2. Health Checkups
        if (record_type === 'health' || test_name === "น้ำหนัก (Weight)" || test_name === "ส่วนสูง (Height)") {
            const existingHealth = await prisma.$queryRawUnsafe<any[]>(`
                SELECT id, weight, height FROM health_checkup_records
                WHERE student_id = $1 AND semester_id = $2
                ORDER BY checkup_date DESC, id DESC
                LIMIT 1
            `, sId, semesterId);

            let w = weight !== undefined && weight !== null ? Number(weight) : null;
            let h = height !== undefined && height !== null ? Number(height) : null;
            const tb = toHabitBoolean(teeth_brushing);
            const md = toHabitBoolean(milk_drinking);

            // Legacy fallback
            if (test_name === "น้ำหนัก (Weight)") w = parseFloat(result_value) || 0;
            if (test_name === "ส่วนสูง (Height)") h = parseFloat(result_value) || 0;

            if (existingHealth.length > 0) {
                // Retain old value if new value is not provided
                if (w === null) w = existingHealth[0].weight ? Number(existingHealth[0].weight) : null;
                if (h === null) h = existingHealth[0].height ? Number(existingHealth[0].height) : null;
                const bmi = w != null && h != null && h > 0 ? w / Math.pow(h / 100, 2) : null;

                await prisma.$executeRawUnsafe(`
                    UPDATE health_checkup_records
                    SET weight = $1, height = $2, bmi = $3, checkup_date = CURRENT_DATE
                    WHERE id = $4
                `, w, h, bmi, existingHealth[0].id);
            } else {
                const bmi = w != null && h != null && h > 0 ? w / Math.pow(h / 100, 2) : null;
                await prisma.$executeRawUnsafe(`
                    INSERT INTO health_checkup_records (student_id, semester_id, checkup_date, weight, height, bmi)
                    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
                `, sId, semesterId, w, h, bmi);
            }

            if (tb !== null || md !== null) {
                await prisma.$executeRawUnsafe(`
                    INSERT INTO student_daily_health_records
                        (student_id, semester_id, record_date, brushes_teeth, drinks_milk, recorded_by)
                    VALUES ($1, $2, CURRENT_DATE, COALESCE($3, false), COALESCE($4, false), $5)
                    ON CONFLICT (student_id, record_date)
                    DO UPDATE SET
                        semester_id = EXCLUDED.semester_id,
                        brushes_teeth = COALESCE($3, student_daily_health_records.brushes_teeth),
                        drinks_milk = COALESCE($4, student_daily_health_records.drinks_milk),
                        recorded_by = EXCLUDED.recorded_by
                `, sId, semesterId, tb, md, tId);
            }
            return { success: true };
        }

        // 3. Fitness Tests
        let finalCriteriaId = criteria_id;
        if (!finalCriteriaId && test_name) {
            const criteria = await this.getFitnessCriteria(test_name, '', year);
            finalCriteriaId = criteria?.id || null;
        }

        if (!finalCriteriaId) {
            throw new Error('ไม่พบรหัสเกณฑ์การประเมิน (Criteria ID)');
        }

        const aYear = year ? parseInt(year as string) : null;
        const semNum = semester ? parseInt(semester as string) : null;

        const existingFitness = await prisma.$queryRawUnsafe<any[]>(`
            SELECT id FROM student_fitness_records
            WHERE student_id = $1 AND (semester = $2 OR semester_id = $3) AND fitness_test_id = $4
        `, sId, semNum, semesterId, finalCriteriaId);

        const resVal = parseFloat(result_value) || 0;
        const isPassed = status === 'ผ่าน';

        if (existingFitness.length > 0) {
            await prisma.$executeRawUnsafe(`
                UPDATE student_fitness_records
                SET test_result = $1, grade = $2, is_passed = $3, test_date = CURRENT_TIMESTAMP, recorded_by = $4,
                    semester = $5, academic_year = $6
                WHERE id = $7
            `, resVal, status, isPassed, tId, semNum, aYear, existingFitness[0].id);
        } else {
            // Try to insert into both to be safe against different DB versions
            await prisma.$executeRawUnsafe(`
                INSERT INTO student_fitness_records (student_id, semester_id, fitness_test_id, test_result, grade, is_passed, test_date, recorded_by, semester, academic_year)
                VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7, $8, $9)
            `, sId, semesterId, finalCriteriaId, resVal, status, isPassed, tId, semNum, aYear);
        }
        return { success: true };
    },
};
