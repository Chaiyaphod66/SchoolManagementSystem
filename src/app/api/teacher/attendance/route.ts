import { TeacherAttendanceService } from '@/features/teacher/attendance.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAuthenticatedTeacherId, teacherOwnsClassroom } from '@/app/api/teacher/_utils';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const teacher_id = await getAuthenticatedTeacherId();
        const action = searchParams.get('action');
        if (!teacher_id) return errorResponse('Unauthorized', 401);

        if (action === 'advisor-classrooms') {
            const classrooms = await TeacherAttendanceService.getAdvisorClassrooms(teacher_id);
            return successResponse(classrooms);
        }

        const classroom_id = Number(searchParams.get('classroom_id') || searchParams.get('section_id'));
        const date = searchParams.get('date') || new Date().toISOString().slice(0, 10);

        if (!classroom_id || Number.isNaN(classroom_id)) return errorResponse('classroom_id or section_id required', 400);

        const data = await TeacherAttendanceService.getAttendanceList(teacher_id, classroom_id, date);
        return successResponse(data);
    } catch (error: any) {
        return errorResponse('Failed', 500, error.message);
    }
}

export async function POST(request: Request) {
    try {
        const teacherId = await getAuthenticatedTeacherId();
        if (!teacherId) return errorResponse('Unauthorized', 401);
        const { records } = await request.json();
        if (!Array.isArray(records)) return errorResponse('records required', 400);
        const classroomIds = Array.from(new Set(records.map((record: any) =>
            Number(record.classroom_id || record.section_id)
        ).filter((id: number) => Number.isInteger(id) && id > 0)));
        for (const classroomId of classroomIds) {
            if (!await teacherOwnsClassroom(teacherId, classroomId)) {
                return errorResponse('Forbidden classroom', 403);
            }
        }
        const data = await TeacherAttendanceService.saveAttendance(records);
        return successResponse(data);
    } catch (error: any) {
        return errorResponse('Failed to save attendance', 500, error.message);
    }
}
