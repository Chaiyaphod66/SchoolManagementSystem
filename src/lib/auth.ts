import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be configured in production');
}

const secretKey = process.env.JWT_SECRET || 'fallback-secret-key-for-local-development-only';
const key = new TextEncoder().encode(secretKey);

export async function encrypt(payload: any) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(key);
}

export async function decrypt(token: string): Promise<JWTPayload | null> {
    try {
        const { payload } = await jwtVerify(token, key, {
            algorithms: ['HS256'],
        });
        return payload;
    } catch {
        return null;
    }
}

export async function getSession() {
    const cookieStore = await cookies();
    const session = cookieStore.get('session')?.value;
    if (!session) return null;
    return await decrypt(session);
}

type SessionCookieOptions = {
    secure?: boolean;
};

export async function setSessionCookie(payload: any, options: SessionCookieOptions = {}) {
    const session = await encrypt(payload);
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const cookieStore = await cookies();
    cookieStore.set('session', session, {
        expires,
        httpOnly: true,
        secure: options.secure ?? process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });
}

export async function clearSessionCookie(options: SessionCookieOptions = {}) {
    const cookieStore = await cookies();
    cookieStore.set('session', '', {
        expires: new Date(0),
        httpOnly: true,
        secure: options.secure ?? process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
    });
}
