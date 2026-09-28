import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

type UserWithRole = {
    id: number;
    username: string;
    password_hash: string | null;
    roles: {
        role_name: string;
    };
};

export const AuthService = {
    async authenticateUser(code: string, password: string, role: string) {
        const normalizedCode = String(code || '').trim();
        const normalizedRole = String(role || '').toLowerCase().trim();

        if (normalizedRole === 'student') {
            const student = await prisma.students.findUnique({
                where: { student_code: normalizedCode },
                include: {
                    users: { include: { roles: true } },
                    name_prefixes: true,
                    classroom_students: {
                        include: { classrooms: { include: { levels: true } } },
                        orderBy: { academic_year_id: 'desc' },
                        take: 1,
                    },
                },
            });

            if (!student) throw new Error('ไม่พบผู้ใช้ในระบบ');
            await verifyUser(student.users, password, normalizedRole);

            const prefix = student.name_prefixes?.prefix_name || '';
            const fullName = [prefix, student.first_name, student.last_name].filter(Boolean).join(' ').trim();
            const currentAssignment = student.classroom_students?.[0]?.classrooms;

            await updateLastLogin(student.users.id);

            return {
                id: student.id,
                userId: student.users.id,
                code: student.student_code,
                role: 'student',
                name: fullName || student.student_code,
                class_level: currentAssignment?.levels?.grade_level_name || '',
                room: currentAssignment?.room_name || '',
            };
        }

        if (normalizedRole === 'teacher') {
            const teacher = await prisma.teachers.findUnique({
                where: { teacher_code: normalizedCode },
                include: {
                    users: { include: { roles: true } },
                    name_prefixes: true,
                    teacher_positions: true,
                    departments: true,
                },
            });

            if (!teacher?.users) throw new Error('ไม่พบผู้ใช้ในระบบ');
            await verifyUser(teacher.users, password, normalizedRole);

            const prefix = teacher.name_prefixes?.prefix_name || '';
            const fullName = [prefix, teacher.first_name, teacher.last_name].filter(Boolean).join(' ').trim();

            await updateLastLogin(teacher.users.id);

            return {
                id: teacher.id,
                userId: teacher.users.id,
                code: teacher.teacher_code,
                role: 'teacher',
                name: fullName || teacher.teacher_code,
                position: teacher.teacher_positions?.title || '',
                department: teacher.departments?.department_name || '',
            };
        }

        if (normalizedRole === 'director') {
            const user = await prisma.users.findUnique({
                where: { username: normalizedCode },
                include: { roles: true },
            });

            if (!user) throw new Error('ไม่พบผู้ใช้ในระบบ');
            await verifyUser(user, password, normalizedRole);
            await updateLastLogin(user.id);

            return {
                id: user.id,
                userId: user.id,
                code: user.username,
                role: 'director',
                name: user.username,
            };
        }

        throw new Error('บทบาทไม่ถูกต้อง');
    },
};

async function verifyUser(user: UserWithRole, password: string, expectedRole: string) {
    const userRole = user.roles.role_name.toLowerCase();
    if (userRole !== expectedRole) {
        throw new Error('บทบาทไม่ตรงกับผู้ใช้');
    }

    const storedHash = (user.password_hash || '').trim();
    const isHashed = storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$');
    const isValid = isHashed && await bcrypt.compare(password, storedHash);
    if (!isValid) {
        throw new Error('รหัสผ่านไม่ถูกต้อง');
    }
}

async function updateLastLogin(userId: number) {
    await prisma.users.update({
        where: { id: userId },
        data: { last_login: new Date() },
    });
}
