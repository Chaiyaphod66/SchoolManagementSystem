import { prisma } from '@/lib/prisma';

const NUMERIC_TO_LETTER_GRADE: Record<string, string> = {
    '4': 'A',
    '3.5': 'B+',
    '3': 'B',
    '2.5': 'C+',
    '2': 'C',
    '1.5': 'D+',
    '1': 'D',
    '0': 'F',
};

export const GradesService = {
    async getGrades(student_id: number, year?: number, semester?: number) {
        if (!student_id) return [];

        const membership = await prisma.classroom_students.findFirst({
            where: {
                student_id,
                ...(year ? { academic_years: { year_name: String(year) } } : {}),
            },
            orderBy: [
                { academic_years: { is_active: 'desc' } },
                { academic_year_id: 'desc' },
            ],
        });
        if (!membership) return [];

        const assignments = await prisma.teaching_assignments.findMany({
            where: {
                classroom_id: membership.classroom_id,
                semesters: {
                    academic_year_id: membership.academic_year_id,
                    ...(semester ? { semester_number: Number(semester) } : {}),
                },
            },
            include: {
                subjects: {
                    include: { subject_categories: true }
                },
                semesters: {
                    include: { academic_years: true }
                },
                grade_categories: {
                    include: {
                        assessment_items: {
                            include: {
                                student_scores: {
                                    where: { student_id }
                                }
                            }
                        }
                    }
                },
            }
        });
        const finalGrades = await prisma.final_grades.findMany({
            where: {
                student_id,
                semester_id: { in: assignments.map((assignment) => assignment.semester_id) },
                subject_id: { in: assignments.map((assignment) => assignment.subject_id) },
            },
            include: { grade_scales: true },
        });
        const finalGradeMap = new Map(
            finalGrades.map((grade) => [`${grade.subject_id}:${grade.semester_id}`, grade])
        );

        // Deduplicate by subject_code
        const uniqueSubjects = new Map();

        assignments.forEach(ta => {
            const subject = ta.subjects;
            if (!subject) return;

            // Calculate total score from assessment items
            let totalScore = 0;

            ta.grade_categories.forEach(cat => {
                cat.assessment_items.forEach(item => {
                    const studentScore = item.student_scores?.[0];
                    if (studentScore) {
                        totalScore += Number(studentScore.score || 0);
                    }
                });
            });

            const finalGrade = finalGradeMap.get(`${ta.subject_id}:${ta.semester_id}`);
            const normalizedGrade = normalizeGradeLabel(finalGrade?.letter_grade);
            const gradePoint = resolveGradePoint(normalizedGrade, finalGrade?.grade_point, finalGrade?.letter_grade);

            uniqueSubjects.set(`${subject.subject_code}:${ta.semester_id}`, {
                subject_code: subject.subject_code,
                subject: subject.subject_name,
                credit: Number(subject.credit || 0),
                total: finalGrade ? Number(finalGrade.total_score) : totalScore,
                grade: normalizedGrade,
                grade_raw: finalGrade?.letter_grade ?? null,
                grade_point: gradePoint,
                year: ta.semesters?.academic_years?.year_name || '',
                semester: ta.semesters?.semester_number || 0,
                category: subject.subject_categories?.category_name || '',
            });
        });

        function getCategoryRank(cat: string): number {
            if (!cat) return 99;
            if (cat.includes('พื้นฐาน')) return 1;
            if (cat.includes('เพิ่มเติม')) return 2;
            if (cat.includes('กิจกรรม')) return 3;
            return 99;
        }

        return Array.from(uniqueSubjects.values()).sort((a, b) => {
            const orderA = getCategoryRank(a.category);
            const orderB = getCategoryRank(b.category);

            if (orderA !== orderB) return orderA - orderB;
            return a.subject_code.localeCompare(b.subject_code);
        });
    }
};

function normalizeGradeLabel(rawGrade: unknown): string | null {
    const raw = String(rawGrade ?? '').trim().toUpperCase();
    if (!raw) return null;

    if (raw in NUMERIC_TO_LETTER_GRADE) return NUMERIC_TO_LETTER_GRADE[raw];

    if (['A', 'B+', 'B', 'C+', 'C', 'D+', 'D', 'F'].includes(raw)) {
        return raw;
    }

    return null;
}

function resolveGradePoint(normalizedGrade: string | null, rawGradePoint: unknown, rawGradeLabel: unknown): number | null {
    const parsedGradePoint = Number(rawGradePoint);
    if (rawGradePoint != null && rawGradePoint !== '' && Number.isFinite(parsedGradePoint)) {
        return parsedGradePoint;
    }

    const label = normalizedGrade ?? normalizeGradeLabel(rawGradeLabel);
    if (!label) return null;

    const map: Record<string, number> = {
        A: 4,
        'B+': 3.5,
        B: 3,
        'C+': 2.5,
        C: 2,
        'D+': 1.5,
        D: 1,
        F: 0,
    };

    return map[label] ?? null;
}
