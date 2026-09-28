import { prisma } from '@/lib/prisma';

function formatTime(value: Date) {
    return value.toISOString().slice(11, 16);
}

export const TeacherExamCalendarService = {
    async getExamSchedule(teacher_id: number) {
        const rows = await prisma.exam_schedules.findMany({
            where: {
                teaching_assignments: { teacher_id },
            },
            include: {
                rooms: true,
                teaching_assignments: {
                    include: {
                        subjects: true,
                        classrooms: { include: { levels: true } },
                        teachers: { include: { name_prefixes: true } },
                    },
                },
            },
            orderBy: [{ exam_date: 'asc' }, { start_time: 'asc' }],
        });

        return rows.map((row) => {
            const assignment = row.teaching_assignments;
            const teacher = assignment.teachers;
            return {
                id: row.id,
                section_id: assignment.id,
                subject_code: assignment.subjects.subject_code,
                subject_name: assignment.subjects.subject_name,
                class_level: assignment.classrooms.levels?.grade_level_name || assignment.classrooms.room_name,
                teacher_name: [
                    teacher.name_prefixes?.prefix_name,
                    teacher.first_name,
                    teacher.last_name,
                ].filter(Boolean).join(' '),
                exam_type: row.exam_type.toLowerCase(),
                exam_date: row.exam_date,
                start_time: formatTime(row.start_time),
                end_time: formatTime(row.end_time),
                time_range: `${formatTime(row.start_time)}-${formatTime(row.end_time)}`,
                room: row.rooms?.room_name || assignment.classrooms.room_name,
            };
        });
    },
};
