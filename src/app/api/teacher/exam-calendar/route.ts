import { TeacherExamCalendarService } from '@/features/teacher/exam-calendar.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAuthenticatedTeacherId } from '@/app/api/teacher/_utils';

export async function GET() {
    try {
        const teacher_id = await getAuthenticatedTeacherId();
        if (!teacher_id) return errorResponse('Unauthorized', 401);

        const exams = await TeacherExamCalendarService.getExamSchedule(teacher_id);
        return successResponse(exams);
    } catch (error: any) {
        return errorResponse('Failed to load exam schedule', 500, error.message);
    }
}
