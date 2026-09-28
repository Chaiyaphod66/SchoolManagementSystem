import { prisma } from '@/lib/prisma';

function mapClassroomSubject(assignment: any) {
    return {
        id: assignment.id,
        teaching_assignment_id: assignment.id,
        subject_id: assignment.subject_id,
        subject_code: assignment.subjects?.subject_code || '',
        subject_name: assignment.subjects?.subject_name || '',
        credit: Number(assignment.subjects?.credit || 0),
        teacher_name: [
            assignment.teachers?.name_prefixes?.prefix_name,
            assignment.teachers?.first_name,
            assignment.teachers?.last_name,
        ].filter(Boolean).join(' '),
        teacher_code: assignment.teachers?.teacher_code || '',
        class_level: assignment.classrooms?.levels?.grade_level_name || '',
        classroom: assignment.classrooms?.room_name || '',
        year: assignment.semesters?.academic_years?.year_name || '',
        semester: assignment.semesters?.semester_number || 0,
        status: 'assigned',
        schedules: (assignment.class_schedules || []).map((schedule: any) => ({
            id: schedule.id,
            day_id: schedule.day_id,
            day: schedule.day_of_weeks?.day_name_th || '',
            period_id: schedule.period_id,
            period: schedule.periods?.period_name || '',
            start_time: schedule.periods?.start_time || null,
            end_time: schedule.periods?.end_time || null,
            room: schedule.rooms?.room_name || assignment.classrooms?.room_name || '',
        })),
    };
}

async function findAssignments(where: any) {
    return prisma.teaching_assignments.findMany({
        where,
        include: {
            subjects: true,
            teachers: { include: { name_prefixes: true } },
            classrooms: { include: { levels: true } },
            semesters: { include: { academic_years: true } },
            class_schedules: {
                include: { day_of_weeks: true, periods: true, rooms: true },
                orderBy: [{ day_id: 'asc' }, { period_id: 'asc' }],
            },
        },
        orderBy: [{ semester_id: 'desc' }, { subject_id: 'asc' }],
    });
}

export const RegistrationService = {
    async resolveSemesterId(year: number, semester: number) {
        const found = await prisma.semesters.findFirst({
            where: {
                semester_number: Number(semester),
                academic_years: { year_name: String(year) },
            },
            select: { id: true },
        });
        return found?.id;
    },

    async getRegistered(student_id: number, semesterId?: number) {
        const membership = await prisma.classroom_students.findFirst({
            where: {
                student_id,
                ...(semesterId
                    ? { academic_year_id: (await prisma.semesters.findUnique({
                        where: { id: semesterId },
                        select: { academic_year_id: true },
                    }))?.academic_year_id }
                    : {}),
            },
            orderBy: { academic_year_id: 'desc' },
        });
        if (!membership) return [];

        const rows = await findAssignments({
            classroom_id: membership.classroom_id,
            ...(semesterId ? { semester_id: semesterId } : {}),
        });
        return rows.map(mapClassroomSubject);
    },

    async getAdvisor(student_id: number, year?: number, semester?: number) {
        if (!student_id) return [];

        const membership = await prisma.classroom_students.findFirst({
            where: {
                student_id,
                ...(year ? { academic_years: { year_name: String(year) } } : {}),
            },
            include: { academic_years: true },
            orderBy: { academic_year_id: 'desc' },
        });
        if (!membership) return [];

        const advisorRows = await prisma.classroom_assignments.findMany({
            where: {
                classroom_id: membership.classroom_id,
                academic_year_id: membership.academic_year_id,
            },
            include: {
                teachers: { include: { name_prefixes: true } },
            },
        });

        return advisorRows.map((row) => ({
            id: row.id,
            teacher_id: row.teacher_id,
            classroom_id: row.classroom_id,
            teacher_code: row.teachers.teacher_code,
            prefix: row.teachers.name_prefixes?.prefix_name || '',
            first_name: row.teachers.first_name,
            last_name: row.teachers.last_name,
            name: [
                row.teachers.name_prefixes?.prefix_name,
                row.teachers.first_name,
                row.teachers.last_name,
            ].filter(Boolean).join(' '),
            phone: row.teachers.phone || '',
            year: Number(membership.academic_years.year_name) || year || null,
            semester: semester ?? null,
        }));
    },

    async getActiveSemester() {
        const active = await prisma.semesters.findFirst({
            where: { is_active: true },
            include: { academic_years: true },
            orderBy: { id: 'desc' },
        });
        if (!active) return null;
        return {
            id: active.id,
            year: active.academic_years.year_name,
            semester_number: active.semester_number,
            academic_year_id: active.academic_year_id,
        };
    },
};
