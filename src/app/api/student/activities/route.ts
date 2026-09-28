import { ActivitiesService } from '@/features/student/activities.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getSession } from '@/lib/auth';
import { parseStudentIdFromSession } from '@/app/api/student/_utils';

export async function GET() {
    try {
        const session = await getSession();
        const sessionResult = parseStudentIdFromSession(session);
        if (!sessionResult.ok) return sessionResult.response;
        const activities = await ActivitiesService.getAllActivities(sessionResult.studentId);
        return successResponse(activities, "Activities retrieved successfully");
    } catch (error: any) {
        return errorResponse("Failed to retrieve activities", 500, error.message);
    }
}
