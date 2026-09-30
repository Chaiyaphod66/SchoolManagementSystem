import { TeacherDashboardService } from '@/features/teacher/dashboard.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAuthenticatedTeacherId } from '@/app/api/teacher/_utils';

export async function GET() {
    try {
        const teacher_id = await getAuthenticatedTeacherId();
        if (!teacher_id) return errorResponse('Unauthorized', 401);

        const summary = await TeacherDashboardService.getSummary(teacher_id);
        return successResponse(summary);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return errorResponse('Failed to load dashboard', 500, message);
    }
}
