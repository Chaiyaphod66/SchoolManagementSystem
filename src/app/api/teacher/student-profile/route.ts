import { TeacherStudentsService } from '@/features/teacher/students.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAuthenticatedTeacherId } from '@/app/api/teacher/_utils';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const studentRaw = searchParams.get('student_id') || searchParams.get('id');
        const student_id = Number(studentRaw);
        const teacher_id = await getAuthenticatedTeacherId();
        if (!student_id || Number.isNaN(student_id)) return errorResponse('student_id required', 400);
        if (!teacher_id) return errorResponse('Unauthorized', 401);

        const profile = await TeacherStudentsService.getStudentProfileForTeacher(teacher_id, student_id);
        if (!profile) return errorResponse('Student not found in advisory list', 403);
        return successResponse(profile);
    } catch (error: any) {
        return errorResponse('Failed to load student profile', 500, error.message);
    }
}
