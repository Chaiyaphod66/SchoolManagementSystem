import { HealthService } from '@/features/student/health.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import { parseStudentIdFromSession } from '@/app/api/student/_utils';

const updateHealthSchema = z.object({
    teeth_brushing: z.string().nullable().optional(),
    milk_drinking: z.string().nullable().optional(),
}).strict();

export async function GET(request: Request) {
    try {
        const session = await getSession();
        const sessionResult = parseStudentIdFromSession(session);
        if (!sessionResult.ok) return sessionResult.response;
        const student_id = sessionResult.studentId;

        const data = await HealthService.getHealthData(student_id);

        if (!data) {
            return errorResponse("Health data not found", 404);
        }

        return successResponse(data, "Health data retrieved");
    } catch (error: any) {
        return errorResponse("Failed to retrieve health data", 500, error.message);
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        const sessionResult = parseStudentIdFromSession(session);
        if (!sessionResult.ok) return sessionResult.response;
        const student_id = sessionResult.studentId;

        const body = await request.json();
        const parsed = updateHealthSchema.safeParse(body);
        if (!parsed.success) {
            return errorResponse("Invalid payload format", 400, parsed.error.format());
        }

        const updated = await HealthService.updateHealthData(student_id, parsed.data);

        return successResponse(updated, "Health data updated successfully");
    } catch (error: any) {
        return errorResponse("Failed to update health data", 500, error.message);
    }
}
