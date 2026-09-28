import { prisma } from '@/lib/prisma';

function formatTeacherName(teacher: any) {
    return [
        teacher?.name_prefixes?.prefix_name,
        teacher?.first_name,
        teacher?.last_name,
    ].filter(Boolean).join(' ');
}

async function findStudentClassroom(studentId: number, year?: number) {
    return prisma.classroom_students.findFirst({
        where: {
            student_id: studentId,
            ...(year ? { academic_years: { year_name: String(year) } } : {}),
        },
        include: {
            academic_years: true,
            classrooms: { include: { levels: true } },
        },
        orderBy: [
            { academic_years: { is_active: 'desc' } },
            { academic_year_id: 'desc' },
        ],
    });
}

export const ScheduleService = {
    async getClassSchedule(student_id: number, year?: number, semester?: number) {
        if (!student_id) return [];

        const membership = await findStudentClassroom(student_id, year);
        if (!membership) return [];

        const assignments = await prisma.teaching_assignments.findMany({
            where: {
                classroom_id: membership.classroom_id,
                status: 'open',
                semesters: {
                    academic_year_id: membership.academic_year_id,
                    ...(semester ? { semester_number: Number(semester) } : {}),
                },
            },
            include: {
                subjects: true,
                teachers: { include: { name_prefixes: true } },
                classrooms: { include: { levels: true } },
                semesters: { include: { academic_years: true } },
                class_schedules: {
                    include: {
                        day_of_weeks: true,
                        periods: true,
                        rooms: true,
                    },
                },
            },
        });

        const scheduleItems = assignments.flatMap((assignment) =>
            assignment.class_schedules.map((schedule) => ({
                id: schedule.id,
                teaching_assignment_id: assignment.id,
                subject_code: assignment.subjects.subject_code,
                subject_name: assignment.subjects.subject_name,
                credit: assignment.subjects.credit ? Number(assignment.subjects.credit) : 0,
                teacher_name: formatTeacherName(assignment.teachers),
                teacher_code: assignment.teachers.teacher_code,
                day: schedule.day_of_weeks.day_name_th,
                day_en: schedule.day_of_weeks.day_name_en,
                day_short: schedule.day_of_weeks.short_name,
                day_id: schedule.day_id,
                period: schedule.periods.period_name || '',
                start_time: schedule.periods.start_time,
                end_time: schedule.periods.end_time,
                room_name: schedule.rooms?.room_name || assignment.classrooms.room_name,
                room: schedule.rooms?.room_name || assignment.classrooms.room_name,
                class_level: assignment.classrooms.levels.grade_level_name || '',
                classroom: assignment.classrooms.room_name,
                year: assignment.semesters.academic_years.year_name,
                semester: assignment.semesters.semester_number,
            }))
        );

        return scheduleItems.sort((a, b) =>
            a.day_id - b.day_id ||
            String(a.start_time || '').localeCompare(String(b.start_time || ''))
        );
    },

    async getExamSchedule(student_id: number, year?: number, semester?: number) {
        if (!student_id) return [];

        const membership = await findStudentClassroom(student_id, year);
        if (!membership) return [];

        const exams = await prisma.exam_schedules.findMany({
            where: {
                teaching_assignments: {
                    classroom_id: membership.classroom_id,
                    status: 'open',
                    semesters: {
                        academic_year_id: membership.academic_year_id,
                        ...(semester ? { semester_number: Number(semester) } : {}),
                    },
                },
            },
            include: {
                rooms: { include: { buildings: true } },
                teaching_assignments: {
                    include: {
                        subjects: true,
                        classrooms: { include: { levels: true } },
                    },
                },
            },
            orderBy: [
                { exam_date: 'asc' },
                { start_time: 'asc' },
            ],
        });

        return exams.map((exam) => {
            const roomName = exam.rooms?.room_name ||
                exam.teaching_assignments.classrooms.room_name ||
                '-';
            const buildingName = exam.rooms?.buildings?.building_name;
            const formatTime = (value: Date) =>
                new Date(value).toISOString().substring(11, 16);

            return {
                id: exam.id,
                teaching_assignment_id: exam.teaching_assignment_id,
                subject_code: exam.teaching_assignments.subjects.subject_code,
                subject_name: exam.teaching_assignments.subjects.subject_name,
                exam_type: exam.exam_type,
                exam_date: exam.exam_date,
                time_range: `${formatTime(exam.start_time)}-${formatTime(exam.end_time)}`,
                room: buildingName ? `${roomName} (${buildingName})` : roomName,
                class_level:
                    exam.teaching_assignments.classrooms.levels.grade_level_name || '',
            };
        });
    },
};
