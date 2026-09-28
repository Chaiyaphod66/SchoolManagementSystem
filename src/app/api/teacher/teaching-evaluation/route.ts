import { TeacherEvaluationService } from '@/features/teacher/evaluation.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import {
    getAuthenticatedTeacherId,
    teacherCanAccessAssignmentStudent,
    teacherOwnsAssignment,
} from '@/app/api/teacher/_utils';

export async function GET(request: Request) {
    // removed debug log
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');
        const teacher_id = await getAuthenticatedTeacherId();
        const yearParam = searchParams.get('year');
        const semesterParam = searchParams.get('semester');
        const year = yearParam ? Number(yearParam) : undefined;
        const semester = semesterParam ? Number(semesterParam) : undefined;

        // removed debug log

        if (!teacher_id) return errorResponse('Unauthorized', 401);

        if (action === 'results') {
            const section_id = searchParams.get('section_id') ? Number(searchParams.get('section_id')) : undefined;
            if (section_id && !await teacherOwnsAssignment(teacher_id, section_id)) return errorResponse('Forbidden section', 403);
            const data = await TeacherEvaluationService.getTeachingEvaluationResults(teacher_id, section_id, year, semester);
            return successResponse(data);
        }

        if (action === 'students') {
            const section_id = Number(searchParams.get('section_id'));
            if (!section_id) return errorResponse('section_id required', 400);
            if (!await teacherOwnsAssignment(teacher_id, section_id)) return errorResponse('Forbidden section', 403);
            const data = await TeacherEvaluationService.getSectionStudentsForEvaluation(teacher_id, section_id, year || 0, semester || 0);
            return successResponse(data);
        }

        if (action === 'student-results') {
            const section_id = Number(searchParams.get('section_id'));
            if (!section_id) return errorResponse('section_id required', 400);
            if (!await teacherOwnsAssignment(teacher_id, section_id)) return errorResponse('Forbidden section', 403);
            const data = await TeacherEvaluationService.getTeachingStudentEvaluationResults(teacher_id, section_id, year || 0, semester || 0);
            return successResponse(data);
        }

        if (action === 'template') {
            const student_id = Number(searchParams.get('student_id'));
            const section_id = Number(searchParams.get('section_id'));
            // removed debug log
            if (!student_id || !section_id) return errorResponse('IDs required', 400);
            if (!await teacherOwnsAssignment(teacher_id, section_id)) return errorResponse('Forbidden section', 403);
            if (!await teacherCanAccessAssignmentStudent(teacher_id, section_id, student_id)) {
                return errorResponse('Student is not in this classroom', 403);
            }

            const data = await TeacherEvaluationService.getSubjectEvaluationTemplate(teacher_id, student_id, section_id, year || 0, semester || 0);
            return successResponse(data);
        }

        const data = await TeacherEvaluationService.getTeachingEvaluation(teacher_id, year, semester);
        return successResponse(data);
    } catch (error: any) {
        console.error("[API Teaching Evaluation GET] Error:", error);
        // removed debug log
        return errorResponse(error.message || 'Failed', 500, {
            stack: error.stack,
            cause: error.cause,
            ...error
        });
    }
}

export async function POST(request: Request) {
    try {
        const teacherId = await getAuthenticatedTeacherId();
        if (!teacherId) return errorResponse('Unauthorized', 401);
        const body = await request.json();
        const sectionId = Number(body.section_id);
        if (!sectionId || !await teacherOwnsAssignment(teacherId, sectionId)) {
            return errorResponse('Forbidden section', 403);
        }
        const studentId = Number(body.student_id);
        if (!studentId || !await teacherCanAccessAssignmentStudent(teacherId, sectionId, studentId)) {
            return errorResponse('Student is not in this classroom', 403);
        }
        const data = await TeacherEvaluationService.submitSubjectEvaluation({ ...body, teacher_id: teacherId });
        return successResponse(data);
    } catch (error: any) {
        // removed debug log
        console.error("[API Teaching Evaluation POST] Error:", error);
        return errorResponse(error.message || 'Failed to submit evaluation', 500);
    }
}
