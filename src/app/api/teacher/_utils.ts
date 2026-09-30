import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function getAuthenticatedTeacherId() {
    return (await getAuthenticatedTeacherIdentity())?.teacherId ?? null;
}

export async function getAuthenticatedTeacherIdentity() {
    const session = await getSession() as { id?: number | string; role?: string } | null;
    if (!session || session.role !== 'teacher') return null;

    const teacherId = Number(session.id);
    if (!Number.isInteger(teacherId) || teacherId <= 0) return null;

    const teacher = await prisma.teachers.findUnique({
        where: { id: teacherId },
        select: { id: true, user_id: true },
    });
    if (!teacher?.user_id) return null;
    return { teacherId: teacher.id, userId: teacher.user_id };
}

export async function teacherOwnsAssignment(teacherId: number, assignmentId: number) {
    const assignment = await prisma.teaching_assignments.findFirst({
        where: { id: assignmentId, teacher_id: teacherId },
        select: { id: true },
    });
    return Boolean(assignment);
}

export async function teacherCanAccessAssignmentStudent(
    teacherId: number,
    assignmentId: number,
    studentId: number,
) {
    const assignment = await prisma.teaching_assignments.findFirst({
        where: {
            id: assignmentId,
            teacher_id: teacherId,
        },
        select: {
            classroom_id: true,
            semesters: { select: { academic_year_id: true } },
        },
    });
    if (!assignment) return false;

    const membership = await prisma.classroom_students.findFirst({
        where: {
            student_id: studentId,
            classroom_id: assignment.classroom_id,
            academic_year_id: assignment.semesters.academic_year_id,
        },
        select: { id: true },
    });
    return Boolean(membership);
}

export async function teacherOwnsAssessmentItem(teacherId: number, itemId: number) {
    const item = await prisma.assessment_items.findFirst({
        where: {
            id: itemId,
            grade_categories: { teaching_assignments: { teacher_id: teacherId } },
        },
        select: { id: true },
    });
    return Boolean(item);
}

export async function teacherOwnsCategory(teacherId: number, categoryId: number) {
    const category = await prisma.grade_categories.findFirst({
        where: { id: categoryId, teaching_assignments: { teacher_id: teacherId } },
        select: { id: true },
    });
    return Boolean(category);
}

export async function teacherOwnsClassroom(
    teacherId: number,
    classroomId: number,
    academicYearId?: number,
) {
    const assignment = await prisma.classroom_assignments.findFirst({
        where: {
            teacher_id: teacherId,
            classroom_id: classroomId,
            ...(academicYearId ? { academic_year_id: academicYearId } : {}),
        },
        select: { id: true },
    });
    return Boolean(assignment);
}

export async function teacherCanAccessStudent(
    teacherId: number,
    studentId: number,
    academicYearId?: number,
    classroomId?: number,
) {
    const assignments = await prisma.classroom_assignments.findMany({
        where: {
            teacher_id: teacherId,
            ...(academicYearId ? { academic_year_id: academicYearId } : {}),
            ...(classroomId ? { classroom_id: classroomId } : {}),
        },
        select: { classroom_id: true, academic_year_id: true },
    });
    if (assignments.length === 0) return false;

    const membership = await prisma.classroom_students.findFirst({
        where: {
            student_id: studentId,
            OR: assignments.map((assignment) => ({
                classroom_id: assignment.classroom_id,
                academic_year_id: assignment.academic_year_id,
            })),
        },
        select: { id: true },
    });
    return Boolean(membership);
}

export async function teacherOwnsEvent(teacherId: number, userId: number, eventId: number) {
    const event = await prisma.events.findFirst({
        where: {
            id: eventId,
            OR: [{ teacher_id: teacherId }, { created_by: userId }],
        },
        select: { id: true },
    });
    return Boolean(event);
}
