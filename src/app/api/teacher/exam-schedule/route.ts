import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAuthenticatedTeacherId, teacherOwnsAssignment } from '@/app/api/teacher/_utils';

// GET /api/teacher/exam-schedule?section_id=XX
export async function GET(request: Request) {
    try {
        const teacherId = await getAuthenticatedTeacherId();
        if (!teacherId) return errorResponse('Unauthorized', 401);

        const { searchParams } = new URL(request.url);
        const section_id = Number(searchParams.get('section_id'));
        if (!section_id || Number.isNaN(section_id)) return errorResponse('section_id required', 400);

        if (!(await teacherOwnsAssignment(teacherId, section_id))) {
            return errorResponse('Forbidden', 403);
        }

        const rows = await prisma.exam_schedules.findMany({
            where: { teaching_assignment_id: section_id },
            orderBy: [{ exam_date: 'asc' }]
        });

        return successResponse(rows.map((r: any) => ({
            id: r.id,
            exam_type: r.exam_type,
            exam_date: r.exam_date,
            start_time: r.start_time,
            end_time: r.end_time,
        })));
    } catch (error: any) {
        return errorResponse('Failed to fetch exam schedule', 500, error.message);
    }
}

// POST /api/teacher/exam-schedule
export async function POST(request: Request) {
    try {
        const teacherId = await getAuthenticatedTeacherId();
        if (!teacherId) return errorResponse('Unauthorized', 401);

        const body = await request.json();
        const { section_id, exam_type, exam_date, start_time, end_time } = body;

        if (!section_id) return errorResponse('section_id required', 400);
        if (!exam_date) return errorResponse('exam_date required', 400);
        if (!start_time || !end_time) return errorResponse('start_time and end_time required', 400);

        const assignmentId = Number(section_id);
        if (!Number.isInteger(assignmentId) || !(await teacherOwnsAssignment(teacherId, assignmentId))) {
            return errorResponse('Forbidden', 403);
        }

        // Standardize exam type to uppercase enum value
        const examTypeVal = (exam_type || 'MIDTERM').toUpperCase() as any;

        // Find existing schedule for this subject, semester, and type
        const existing = await prisma.exam_schedules.findFirst({
            where: {
                teaching_assignment_id: assignmentId,
                exam_type: examTypeVal
            }
        });

        // Parse date and time correctly
        // exam_date is "YYYY-MM-DD"
        const examDateObj = new Date(exam_date);
        
        // start_time and end_time are "HH:mm"
        // For Postgres TIME fields, Prisma expects a Date object where the time part is used
        const startTimeObj = new Date(`1970-01-01T${start_time}:00Z`);
        const endTimeObj = new Date(`1970-01-01T${end_time}:00Z`);

        let result;
        if (existing) {
            result = await prisma.exam_schedules.update({
                where: { id: existing.id },
                data: {
                    exam_date: examDateObj,
                    start_time: startTimeObj,
                    end_time: endTimeObj
                }
            });
        } else {
            result = await prisma.exam_schedules.create({
                data: {
                    teaching_assignment_id: assignmentId,
                    exam_type: examTypeVal,
                    exam_date: examDateObj,
                    start_time: startTimeObj,
                    end_time: endTimeObj
                }
            });
        }

        return successResponse({ id: result.id }, existing ? 'Exam schedule updated' : 'Exam schedule created');
    } catch (error: any) {
        console.error('Save exam error:', error);
        return errorResponse('Failed to save exam schedule', 500, error.message);
    }
}
