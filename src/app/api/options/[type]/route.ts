import { prisma } from "@/lib/prisma";
import { successResponse, errorResponse } from "@/lib/api-response";

export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
    try {
        const { type } = await params;

        if (type === "grades") {
            const query = await prisma.grade_level.findMany({
                orderBy: { id: 'asc' },
                select: { id: true, grade_level_name: true },
            });
            const data = query.map((level) => ({ id: level.id, label: level.grade_level_name || '' }));
            return successResponse(data);
        }

        if (type === "classrooms") {
            const classrooms = await prisma.classrooms.findMany({
                include: { levels: true },
                orderBy: [{ grade_level_id: 'asc' }, { room_name: 'asc' }]
            });
            const data = classrooms.map((c: any) => ({
                id: c.id,
                label: c.room_name.trim(),
                level: c.levels?.grade_level_name || ''
            }));
            return successResponse(data);
        }

        if (type === "subjects") {
            const subjects = await prisma.subjects.findMany({
                orderBy: { subject_code: 'asc' },
                select: { id: true, subject_code: true, subject_name: true }
            });
            const data = subjects.map((s: any) => ({
                id: s.id,
                label: `${s.subject_code} ${s.subject_name}`,
            }));
            return successResponse(data);
        }

        if (type === "learning-groups") {
            const groups = await prisma.learning_subject_groups.findMany({
                orderBy: { group_name: 'asc' },
                select: { id: true, group_name: true }
            });
            const data = groups.map((g: any) => ({
                id: g.id,
                label: g.group_name,
            }));
            return successResponse(data);
        }

        if (type === "buildings") {
            const buildings = await prisma.buildings.findMany({
                orderBy: { building_name: 'asc' },
            });
            const data = buildings.map((b: any) => ({
                id: b.id,
                label: b.building_name,
            }));
            return successResponse(data);
        }

        if (type === "rooms") {
            const { searchParams } = new URL(req.url);
            const buildingId = searchParams.get("buildingId");
            const where = buildingId ? { building_id: Number(buildingId) } : {};
            const rooms = await prisma.rooms.findMany({
                where,
                orderBy: { room_name: 'asc' },
            });
            const data = rooms.map((r: any) => ({
                id: r.id,
                label: r.room_name,
            }));
            return successResponse(data);
        }

        if (type === "target-types") {
            const targetTypes = await prisma.target_types.findMany({
                where: { is_active: true },
                orderBy: { display_name: 'asc' }
            });
            return successResponse(targetTypes);
        }

        if (type === "targets") {
            const { searchParams } = new URL(req.url);
            const targetType = searchParams.get("targetType");
            
            if (!targetType) return errorResponse("targetType is required", 400);

            const config = await prisma.target_types.findUnique({ where: { code: targetType } });
            if (!config) return errorResponse("Invalid target type", 400);

            if (config.input_type === 'none') return successResponse([]);

            let optionsType = "";
            switch (targetType.toLowerCase()) {
                case 'grade_level': optionsType = 'grades'; break;
                case 'classroom': optionsType = 'classrooms'; break;
                case 'learning_group': optionsType = 'learning-groups'; break;
                case 'teaching_assignment': optionsType = 'subjects'; break;
                case 'role': optionsType = 'roles'; break;
                case 'department': optionsType = 'departments'; break;
                case 'user': optionsType = 'users'; break;
                case 'all': optionsType = 'all'; break;
                default: optionsType = targetType.toLowerCase();
            }

            if (optionsType === 'grades') {
                const query = await prisma.grade_level.findMany({
                    orderBy: { id: 'asc' },
                    select: { id: true, grade_level_name: true },
                });
                return successResponse(query.map((level) => ({
                    id: String(level.id),
                    label: level.grade_level_name || '',
                })));
            }
            if (optionsType === 'classrooms') {
                const classrooms = await prisma.classrooms.findMany({
                    include: { levels: true },
                    orderBy: [{ grade_level_id: 'asc' }, { room_name: 'asc' }]
                });
                return successResponse(classrooms.map((c: any) => ({
                    id: String(c.id),
                    label: c.room_name.trim()
                })));
            }
            if (optionsType === 'learning-groups') {
                const groups = await prisma.learning_subject_groups.findMany({
                    orderBy: { group_name: 'asc' },
                    select: { id: true, group_name: true }
                });
                return successResponse(groups.map((g: any) => ({
                    id: String(g.id),
                    label: g.group_name,
                })));
            }
            if (optionsType === 'subjects') {
                const subjects = await prisma.subjects.findMany({
                    orderBy: { subject_code: 'asc' },
                    select: { id: true, subject_code: true, subject_name: true }
                });
                return successResponse(subjects.map((s: any) => ({
                    id: String(s.id),
                    label: `${s.subject_code} ${s.subject_name}`,
                })));
            }

            if (optionsType === 'roles') {
                const roles = await prisma.roles.findMany({
                    orderBy: { id: 'asc' },
                    select: { id: true, role_name: true },
                });
                return successResponse(roles.map((role) => ({
                    id: String(role.id),
                    label: role.role_name,
                })));
            }
            if (optionsType === 'departments') {
                const departments = await prisma.departments.findMany({
                    orderBy: { department_name: 'asc' },
                    select: { id: true, department_name: true },
                });
                return successResponse(departments.map((department) => ({
                    id: String(department.id),
                    label: department.department_name,
                })));
            }
            if (optionsType === 'users') {
                const users = await prisma.users.findMany({
                    orderBy: { username: 'asc' },
                    select: { id: true, username: true },
                });
                return successResponse(users.map((user) => ({
                    id: String(user.id),
                    label: user.username,
                })));
            }
            if (optionsType === 'all') return successResponse([{ id: 'all', label: 'ทุกคน' }]);

            return successResponse([]);
        }

        return errorResponse("Unknown option type", 400);

    } catch (e: any) {
        return errorResponse("Failed to fetch options", 500, e.message);
    }
}
