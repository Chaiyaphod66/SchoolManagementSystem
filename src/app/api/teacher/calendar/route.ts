import { TeacherCalendarService } from '@/features/teacher/calendar.service';
import { successResponse, errorResponse } from '@/lib/api-response';
import {
    getAuthenticatedTeacherIdentity,
    teacherOwnsEvent,
} from '@/app/api/teacher/_utils';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (action === 'departments') {
            return successResponse(await TeacherCalendarService.getDepartments());
        }
        if (action === 'event-types') {
            return successResponse(await TeacherCalendarService.getEventTypes());
        }
        if (action === 'target-types') {
            return successResponse(await TeacherCalendarService.getTargetTypes());
        }

        const events = await TeacherCalendarService.getAll();
        return successResponse(events);
    } catch (error: any) {
        return errorResponse('Failed to load calendar', 500, error.message);
    }
}

export async function POST(request: Request) {
    try {
        const identity = await getAuthenticatedTeacherIdentity();
        if (!identity) return errorResponse('Unauthorized', 401);
        const body = await request.json();
        const event = await TeacherCalendarService.add({
            ...body,
            userId: identity.userId,
            responsible_teacher_id: identity.teacherId,
        });
        return successResponse(event, 'Event added');
    } catch (error: any) {
        return errorResponse('Failed to add event', 500, error.message);
    }
}

export async function PUT(request: Request) {
    try {
        const identity = await getAuthenticatedTeacherIdentity();
        if (!identity) return errorResponse('Unauthorized', 401);
        const { id, ...data } = await request.json();
        if (!id) return errorResponse('id required', 400);
        if (!await teacherOwnsEvent(identity.teacherId, identity.userId, Number(id))) {
            return errorResponse('Forbidden event', 403);
        }
        const event = await TeacherCalendarService.update(id, {
            ...data,
            responsible_teacher_id: identity.teacherId,
        });
        return successResponse(event, 'Event updated');
    } catch (error: any) {
        return errorResponse('Failed to update event', 500, error.message);
    }
}

export async function DELETE(request: Request) {
    try {
        const identity = await getAuthenticatedTeacherIdentity();
        if (!identity) return errorResponse('Unauthorized', 401);
        const { searchParams } = new URL(request.url);
        const id = Number(searchParams.get('id'));
        if (!id || Number.isNaN(id)) return errorResponse('id required', 400);
        if (!await teacherOwnsEvent(identity.teacherId, identity.userId, id)) {
            return errorResponse('Forbidden event', 403);
        }
        await TeacherCalendarService.remove(id);
        return successResponse({ success: true });
    } catch (error: any) {
        return errorResponse('Failed to delete event', 500, error.message);
    }
}
