import { TeacherBehaviorService } from '@/features/teacher/behavior.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getSession } from '@/lib/auth';
import { getAuthenticatedTeacherId, teacherCanAccessStudent } from '@/app/api/teacher/_utils';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'init') {
            const [behaviorTypes, levels, academicYears, semesters] = await Promise.all([
                TeacherBehaviorService.getBehaviorTypes(),
                TeacherBehaviorService.getLevels(),
                TeacherBehaviorService.getAcademicYears(),
                TeacherBehaviorService.getSemesters()
            ]);
            return successResponse({ behaviorTypes, levels, academicYears, semesters });
        }

        if (action === 'classrooms') {
            const session = await getSession() as any;
            if (!session) return errorResponse('Unauthorized', 401);
            const level_id = searchParams.get('level_id') ? Number(searchParams.get('level_id')) : undefined;
            const teacher_id = session.role === 'teacher'
                ? (await getAuthenticatedTeacherId()) ?? undefined
                : undefined;
            const classrooms = await TeacherBehaviorService.getClassrooms(level_id, teacher_id);
            return successResponse(classrooms);
        }

        if (action === 'students') {
            const session = await getSession() as any;
            const teacher_id = session?.role === 'teacher'
                ? (await getAuthenticatedTeacherId()) ?? undefined
                : undefined;
            const year = searchParams.get('year') ? Number(searchParams.get('year')) : undefined;
            const semester = searchParams.get('semester') ? Number(searchParams.get('semester')) : undefined;
            const level_id = searchParams.get('level_id') ? Number(searchParams.get('level_id')) : undefined;
            const classroom_id = searchParams.get('classroom_id') ? Number(searchParams.get('classroom_id')) : undefined;

            const students = await TeacherBehaviorService.getFilteredStudents({
                teacher_id,
                year,
                semester,
                level_id,
                classroom_id
            });
            
            return successResponse(students);
        }

        if (action === 'pending') {
            const session = await getSession() as any;
            const isApprover = session?.role === 'director' || 
                session?.position?.includes('ปกครอง') || 
                session?.department?.includes('ปกครอง') || 
                session?.department?.includes('กิจการนักเรียน');
            if (!session || !isApprover) return errorResponse('Unauthorized', 401);
            
            const pending = await TeacherBehaviorService.getPendingRecords();
            return successResponse(pending);
        }

        if (action === 'history') {
            const session = await getSession() as any;
            if (!session || !session.id) return errorResponse('Unauthorized', 401);

            const studentId = searchParams.get('student_id') ? Number(searchParams.get('student_id')) : undefined;
            if (!studentId) return errorResponse('Student ID is required', 400);

            if (session.role === 'teacher') {
                const teacherId = await getAuthenticatedTeacherId();
                if (!teacherId || !await teacherCanAccessStudent(teacherId, studentId)) {
                    return errorResponse('Student is not in your homeroom classroom', 403);
                }
            } else if (session.role !== 'director') {
                return errorResponse('Forbidden', 403);
            }

            const history = await TeacherBehaviorService.getStudentBehaviorHistory(studentId);
            return successResponse(history);
        }

        return errorResponse('Invalid action', 400);
    } catch (error: any) {
        return errorResponse('Failed to load behavior data', 500, error.message);
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession() as any;
        if (!session || !session.id) return errorResponse('Unauthorized', 401);

        const body = await request.json();
        const { action, ...payload } = body;

        if (action === 'approve' || action === 'reject') {
            const isApprover = session.role === 'director' || 
                session.position?.includes('ปกครอง') || 
                session.department?.includes('ปกครอง') || 
                session.department?.includes('กิจการนักเรียน');
            if (!isApprover) return errorResponse('Forbidden', 403);
            
            const result = await TeacherBehaviorService.updateRecordStatus({
                id: payload.id,
                status: action === 'approve' ? 'APPROVED' : 'REJECTED',
                user_id: session.id,
                reason: payload.reason
            });
            return successResponse(result, `Record ${action}d successfully`);
        }

        if (session.role === 'teacher') {
            const teacherId = await getAuthenticatedTeacherId();
            if (!teacherId || !await teacherCanAccessStudent(teacherId, Number(body.student_id))) {
                return errorResponse('Student is not in your homeroom classroom', 403);
            }
        }

        // Default: Record behavior
        const result = await TeacherBehaviorService.recordBehavior({
            ...body,
            reporter_user_id: session.userId
        });
        return successResponse(result, 'Behavior recorded successfully');
    } catch (error: any) {
        return errorResponse('Failed to process behavior action', 500, error.message);
    }
}
