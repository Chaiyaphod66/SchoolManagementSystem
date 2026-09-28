import { prisma } from '@/lib/prisma';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET(request: Request) {
    try {
        const search = new URL(request.url).searchParams.get('search')?.trim();
        const subjects = await prisma.subjects.findMany({
            where: search ? {
                OR: [
                    { subject_code: { contains: search, mode: 'insensitive' } },
                    { subject_name: { contains: search, mode: 'insensitive' } },
                ],
            } : undefined,
            orderBy: [{ subject_code: 'asc' }, { subject_name: 'asc' }],
            select: { id: true, subject_code: true, subject_name: true },
        });
        return successResponse(subjects.map((subject) => ({
            id: subject.id,
            subject_code: subject.subject_code,
            subject_name: subject.subject_name,
            label: `[${subject.subject_code}] ${subject.subject_name}`,
        })));
    } catch (error: any) {
        return errorResponse('Failed to fetch subjects', 500, error.message);
    }
}
