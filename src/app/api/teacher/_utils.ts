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
            classrooms: {
                classroom_students: { some: { student_id: studentId } },
            },
        },
        select: { id: true },
    });
    return Boolean(assignment);
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

export async function teacherOwnsClassroom(teacherId: number, classroomId: number) {
    const assignment = await prisma.classroom_assignments.findFirst({
        where: { teacher_id: teacherId, classroom_id: classroomId },
        select: { id: true },
    });
    return Boolean(assignment);
}

export async function teacherCanAccessStudent(teacherId: number, studentId: number) {
    const assignment = await prisma.classroom_assignments.findFirst({
        where: {
            teacher_id: teacherId,
            classrooms: {
                classroom_students: { some: { student_id: studentId } },
            },
        },
        select: { id: true },
    });
    return Boolean(assignment);
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
