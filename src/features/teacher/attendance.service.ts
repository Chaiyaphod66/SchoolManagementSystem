import { prisma } from '@/lib/prisma';

type AttendanceRecordInput = { student_id?: number; status: string; remark?: string };
type UiAttendanceRecordInput = { student_id: number; classroom_id?: number; section_id?: number; date: string; status: string; remark?: string };

function formatLocalDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function assertEditableAttendanceDate(date: string) {
    if (date > formatLocalDate(new Date())) {
        throw new Error('attendance cannot be edited for a future date');
    }
}

function normalizeAttendanceStatus(status: string) {
    const value = String(status || '').trim().toLowerCase();
    if (value === 'absent' || value === 'ขาด') return 'absent';
    if (value === 'late' || value === 'สาย') return 'late';
    if (value === 'leave' || value === 'ลา') return 'leave';
    return 'present';
}

async function resolveAttendanceStatusId(status: string) {
    const normalized = normalizeAttendanceStatus(status);
    const existing = await prisma.attendance_status.findFirst({
        where: { status_name: normalized },
        select: { id: true },
    });
    if (existing) return existing.id;

    const latest = await prisma.attendance_status.findFirst({
        orderBy: { id: 'desc' },
        select: { id: true },
    });
    const created = await prisma.attendance_status.create({
        data: { id: (latest?.id || 0) + 1, status_name: normalized },
        select: { id: true },
    });
    return created.id;
}

async function resolveAcademicYearId(date: string) {
    const attendanceDate = new Date(`${date}T00:00:00.000Z`);
    const exactYear = await prisma.academic_years.findFirst({
        where: {
            start_date: { lte: attendanceDate },
            end_date: { gte: attendanceDate },
        },
        orderBy: { year_name: 'desc' },
        select: { id: true },
    });
    if (exactYear) return exactYear.id;

    const activeYear = await prisma.academic_years.findFirst({
        where: { is_active: true },
        orderBy: { year_name: 'desc' },
        select: { id: true },
    });
    if (!activeYear) throw new Error('Academic year not found for attendance date');
    return activeYear.id;
}

export const TeacherAttendanceService = {
    async getAdvisorClassrooms(teacher_id: number) {
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

        return advisors.map(a => {
            const room = a.classrooms;
            if (!room) return null;
            return {
                classroom_id: room.id,
                class_level: room.levels?.grade_level_name || '',
                room: room.room_name,
                label: room.levels?.grade_level_name || '',
            };
        }).filter(Boolean);
    },

    async getAttendanceList(teacher_id: number, classroom_id: number, date: string) {
        const teacher = await prisma.teachers.findUnique({
            where: { id: teacher_id },
            select: { id: true },
        });
        if (!teacher) throw new Error('Teacher not found');

        const academicYearId = await resolveAcademicYearId(date);
        const authorized = await prisma.classroom_assignments.findFirst({
            where: { teacher_id: teacher.id, classroom_id, academic_year_id: academicYearId },
            select: { id: true, academic_year_id: true },
        });
        if (!authorized) throw new Error('Classroom is not assigned to this teacher');

        // Get students in this classroom
        const classroomStudents = await prisma.classroom_students.findMany({
            where: { classroom_id, academic_year_id: authorized.academic_year_id },
            include: {
                students: {
                    include: { name_prefixes: true }
                }
            }
        });

        const studentIds = classroomStudents.map((row) => row.student_id);
        const existingRecords = studentIds.length > 0
            ? await prisma.attendance_records.findMany({
                where: { student_id: { in: studentIds }, check_date: new Date(date) },
                include: { attendance_status: true },
            })
            : [];

        return classroomStudents.map(cs => {
            const student = cs.students;
            if (!student) return null;
            const record = existingRecords.find(r => r.student_id === student.id);
            return {
                student_id: student.id,
                student_code: student.student_code,
                prefix: student.name_prefixes?.prefix_name || '',
                first_name: student.first_name,
                last_name: student.last_name,
                status: record?.attendance_status?.status_name || null,
                remark: record?.remark || '',
                record_id: record?.id || null,
            };
        }).filter(Boolean);
    },

    async saveAttendance(
        classroom_id: number | UiAttendanceRecordInput[],
        date?: string,
        records?: AttendanceRecordInput[],
        teacher_id?: number,
    ): Promise<{ success: boolean; count?: number }> {
        if (Array.isArray(classroom_id)) {
            const uiRecords = classroom_id;
            if (uiRecords.length === 0) return { success: true, count: 0 };

            const grouped = new Map<string, { classroom_id: number; date: string; records: AttendanceRecordInput[] }>();
            uiRecords.forEach((r) => {
                const targetId = Number(r.classroom_id || r.section_id);
                const sessionDate = String(r.date || '').trim();
                if (!targetId || Number.isNaN(targetId)) throw new Error('classroom_id or section_id required');
                if (!sessionDate) throw new Error('date required');
                assertEditableAttendanceDate(sessionDate);

                const key = `${targetId}:${sessionDate}`;
                if (!grouped.has(key)) {
                    grouped.set(key, { classroom_id: targetId, date: sessionDate, records: [] });
                }

                grouped.get(key)?.records.push({
                    student_id: Number(r.student_id),
                    status: String(r.status || 'present'),
                    remark: r.remark,
                });
            });

            for (const group of grouped.values()) {
                await this.saveAttendanceByStudent(group.classroom_id, group.date, group.records, teacher_id);
            }

            return { success: true, count: uiRecords.length };
        }

        const taId = Number(classroom_id);
        if (!taId || Number.isNaN(taId)) throw new Error('classroom_id required');
        if (!date) throw new Error('date required');
        assertEditableAttendanceDate(date);
        const normalized = Array.isArray(records) ? records : [];

        return this.saveAttendanceByStudent(taId, date, normalized, teacher_id);
    },

    async saveAttendanceByStudent(
        classroom_id: number,
        date: string,
        records: AttendanceRecordInput[],
        teacher_id?: number,
    ) {
        const academicYearId = await resolveAcademicYearId(date);
        if (teacher_id) {
            const advisor = await prisma.classroom_assignments.findFirst({
                where: {
                    teacher_id,
                    classroom_id,
                    academic_year_id: academicYearId,
                },
                select: { id: true },
            });
            if (!advisor) throw new Error('Forbidden classroom for attendance date');
        }

        const classroomStudentIds = new Set(
            (await prisma.classroom_students.findMany({
                where: { classroom_id, academic_year_id: academicYearId },
                select: { student_id: true },
            })).map((row) => row.student_id)
        );

        for (const rec of records) {
            if (!rec.student_id) continue;
            if (!classroomStudentIds.has(rec.student_id)) {
                throw new Error(`Student ${rec.student_id} is not in classroom ${classroom_id}`);
            }

            const status_id = await resolveAttendanceStatusId(rec.status);
            await prisma.attendance_records.upsert({
                where: {
                    student_id_check_date: {
                        student_id: rec.student_id,
                        check_date: new Date(date),
                    },
                },
                update: { status_id, remark: rec.remark || null },
                create: {
                    student_id: rec.student_id,
                    check_date: new Date(date),
                    status_id,
                    remark: rec.remark || null,
                },
            });
        }

        return { success: true };
    },
};
