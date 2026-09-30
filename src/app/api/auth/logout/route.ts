import { clearSessionCookie } from '@/lib/auth';
import { NextResponse } from 'next/server';

function requestUsesHttps(request: Request) {
    const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
    return forwardedProto ? forwardedProto === 'https' : new URL(request.url).protocol === 'https:';
}

export async function POST(request: Request) {
    await clearSessionCookie({ secure: requestUsesHttps(request) });
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
}
