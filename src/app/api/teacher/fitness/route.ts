import { TeacherFitnessService } from '@/features/teacher/fitness.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import { getAuthenticatedTeacherId, teacherCanAccessStudent } from '@/app/api/teacher/_utils';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const teacher_id = await getAuthenticatedTeacherId();
        const class_level = searchParams.get('class_level') || '';
        const room = searchParams.get('room') || '';
        const action = searchParams.get('action');
        if (!teacher_id) return errorResponse('Unauthorized', 401);

        if (action === 'years') {
            const years = await TeacherFitnessService.getAcademicYears();
            return successResponse(years);
        }

        if (action === 'advisor-classes') {
            const classes = await TeacherFitnessService.getAdvisorClasses(teacher_id);
            return successResponse(classes);
        }

        if (action === 'criteria') {
            const test_name = searchParams.get('test_name') || '';
            const grade_level = searchParams.get('class_level') || '';
            const year = Number(searchParams.get('year'));
            const gender = searchParams.get('gender');
            
            if (gender) {
                const criteria = await TeacherFitnessService.getFitnessCriteria(test_name, grade_level, year || undefined, gender);
                return successResponse(criteria);
            } else {
                const criteria = await TeacherFitnessService.getFitnessCriteriaForClass(test_name, grade_level, year || undefined);
                return successResponse(criteria);
            }
        }

        if (action === 'students') {
            if (!class_level) return errorResponse('class_level required', 400);
            if (!room) return errorResponse('room required', 400);

            const year = Number(searchParams.get('year')) || undefined;
            const semester = Number(searchParams.get('semester')) || undefined;

            const data = await TeacherFitnessService.getStudentsForTest(teacher_id, class_level, room, year, semester);
            return successResponse(data);
        }

        if (action === 'dropdown-options') {
            const data = await TeacherFitnessService.getDropdownOptions();
            return successResponse(data);
        }

        if (action === 'list-all-criteria') {
            const test_name = searchParams.get('test_name') || undefined;
            const grade_level = searchParams.get('class_level') || undefined;
            const year = Number(searchParams.get('year')) || undefined;
            
            const data = await TeacherFitnessService.getAllCriteria(test_name, grade_level, year);
            return successResponse(data);
        }

        return errorResponse('Invalid or missing action parameter', 400);


    } catch (error: any) {
        return errorResponse('Failed', 500, error.message);
    }
}

export async function POST(request: Request) {
    try {
        const teacherId = await getAuthenticatedTeacherId();
        if (!teacherId) return errorResponse('Unauthorized', 401);
        const body = await request.json();
        const { action, ...payload } = body;

        if (action === 'upsert-criteria') {
            const data = await TeacherFitnessService.upsertCriteria(payload);
            return successResponse(data);
        }

        if (action === 'delete-criteria') {
            const data = await TeacherFitnessService.deleteCriteria(payload.id);
            return successResponse(data);
        }

        const studentId = Number(body.student_id);
        const academicYear = body.year
            ? await prisma.academic_years.findUnique({
                where: { year_name: String(body.year) },
                select: { id: true },
            })
            : null;
        if (!studentId || !academicYear || !await teacherCanAccessStudent(teacherId, studentId, academicYear.id)) {
            return errorResponse('Forbidden student', 403);
        }
        const data = await TeacherFitnessService.saveFitnessTest({ ...body, teacher_id: teacherId });
        return successResponse(data);
    } catch (error: any) {
        console.error("FITNESS SAVE ERROR:", error);
        return errorResponse('Failed to process request', 500, error.message);
    }
}
