import { prisma } from '@/lib/prisma';

export async function resolveTargetValues(targets: any[]) {
    const dict: Record<string, string> = {};
    const valuesByType = new Map<string, Set<number>>();
    for (const target of targets) {
        const type = String(target.target_type || '').toUpperCase();
        const value = Number(target.target_value);
        if (!Number.isInteger(value) || value <= 0) continue;
        if (!valuesByType.has(type)) valuesByType.set(type, new Set());
        valuesByType.get(type)?.add(value);
    }

    const classroomIds = Array.from(valuesByType.get('CLASSROOM') || []);
    const roleIds = Array.from(valuesByType.get('ROLE') || []);
    const departmentIds = Array.from(valuesByType.get('DEPARTMENT') || []);
    const userIds = Array.from(valuesByType.get('USER') || []);

    const [classrooms, roles, departments, users] = await Promise.all([
        classroomIds.length
            ? prisma.classrooms.findMany({
                where: { id: { in: classroomIds } },
                include: { levels: true },
            })
            : [],
        roleIds.length
            ? prisma.roles.findMany({ where: { id: { in: roleIds } } })
            : [],
        departmentIds.length
            ? prisma.departments.findMany({ where: { id: { in: departmentIds } } })
            : [],
        userIds.length
            ? prisma.users.findMany({
                where: { id: { in: userIds } },
                select: { id: true, username: true },
            })
            : [],
    ]);

    classrooms.forEach((classroom) => {
        const level = classroom.levels?.grade_level_name || '';
        const room = classroom.room_name || '';
        dict[`CLASSROOM:${classroom.id}`] = !room || room === level ? level : `${level}/${room}`;
    });
    roles.forEach((role) => {
        dict[`ROLE:${role.id}`] = role.role_name;
    });
    departments.forEach((department) => {
        dict[`DEPARTMENT:${department.id}`] = department.department_name;
    });
    users.forEach((user) => {
        dict[`USER:${user.id}`] = user.username;
    });
    return dict;
}

export function formatTargetValue(target_type: string, target_value: any, dict: any) {
    if (!target_value || target_value === 'all') return 'ทุกคน';
    const key = `${String(target_type || '').toUpperCase()}:${target_value}`;
    return dict?.[key] || String(target_value);
}
