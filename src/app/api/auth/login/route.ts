import { AuthService } from '@/features/auth/auth.service';
import { setSessionCookie } from '@/lib/auth';
import { successResponse, errorResponse } from '@/lib/api-response';

function requestUsesHttps(request: Request) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    return forwardedProto ? forwardedProto === 'https' : new URL(request.url).protocol === 'https:';
}

export async function POST(request: Request) {
    try {
        const { code, password, role } = await request.json();

        if (!code || !password || !role) {
            return errorResponse('Missing required fields: code, password, or role', 400);
        }

        const payload = await AuthService.authenticateUser(code, password, role);

        // Set HTTPOnly Cookie
        await setSessionCookie(payload, { secure: requestUsesHttps(request) });

        return successResponse(payload, 'Login successful');
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Authentication failed';
        console.error('POST /api/auth/login error:', message);

        if (message.includes("Can't reach database server")) {
            return errorResponse('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาตรวจสอบ DATABASE_URL หรือสถานะ PostgreSQL', 503);
        }

        return errorResponse(message || 'Authentication failed', 401);
    }
}
