import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Vaccination = { name: string; date?: string | null; status?: string | null };

function dateOnly(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function habitLabel(value: boolean | null | undefined, positive: string, negative: string) {
    if (value == null) return '';
    return value ? positive : negative;
}

function habitValue(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (value == null || value === '') return undefined;
    const text = String(value).trim().toLowerCase();
    return !(text === 'false' || text === '0' || text === 'no' ||
        text.includes('ไม่ได้') || text.includes('ไม่'));
}

async function resolveSemesterId() {
    const today = new Date();
    const current = await prisma.semesters.findFirst({
        where: {
            OR: [
                { is_active: true },
                { start_date: { lte: today }, end_date: { gte: today } },
            ],
        },
        orderBy: [{ is_active: 'desc' }, { start_date: 'desc' }],
        select: { id: true },
    });
    if (current) return current.id;

    const latest = await prisma.semesters.findFirst({
        orderBy: [{ academic_years: { year_name: 'desc' } }, { semester_number: 'desc' }],
        select: { id: true },
    });
    return latest?.id ?? null;
}

export const HealthService = {
    async getHealthData(student_id: number) {
        if (!student_id) return null;

        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const [profile, checkup, weeklyHabits, fitnessRecords] = await Promise.all([
            prisma.student_health_profiles.findUnique({ where: { student_id } }),
            prisma.health_checkup_records.findFirst({
                where: { student_id },
                orderBy: [{ checkup_date: 'desc' }, { id: 'desc' }],
            }),
            prisma.student_daily_health_records.findMany({
                where: { student_id, record_date: { gte: weekStart, lte: weekEnd } },
                orderBy: { record_date: 'asc' },
            }),
            prisma.student_fitness_records.findMany({
                where: { student_id },
                include: { fitness_test_criteria: true },
                orderBy: [{ test_date: 'desc' }, { id: 'desc' }],
            }),
        ]);

        const vaccinations = Array.isArray(profile?.vaccinations)
            ? (profile.vaccinations as Vaccination[])
            : [];
        const latestHabit = weeklyHabits.at(-1);

        return {
            student_id,
            weight: checkup?.weight == null ? null : Number(checkup.weight),
            height: checkup?.height == null ? null : Number(checkup.height),
            bmi: checkup?.bmi == null ? null : Number(checkup.bmi),
            blood_type: profile?.blood_type ?? null,
            allergies: profile?.allergies ?? '',
            chronic_illness: profile?.chronic_illness ?? '',
            vision_left: checkup?.vision_left ?? null,
            vision_right: checkup?.vision_right ?? null,
            dental_status: checkup?.dental_status ?? null,
            doctor_note: checkup?.doctor_note ?? null,
            teeth_brushing: habitLabel(latestHabit?.brushes_teeth, 'แปรงแล้ว', 'ไม่ได้แปรง'),
            milk_drinking: habitLabel(latestHabit?.drinks_milk, 'ดื่มแล้ว', 'ไม่ได้ดื่ม'),
            weekly_habits: weeklyHabits.map((record) => ({
                date: dateOnly(record.record_date),
                teeth_brushing: habitLabel(record.brushes_teeth, 'แปรงแล้ว', 'ไม่ได้แปรง'),
                milk_drinking: habitLabel(record.drinks_milk, 'ดื่มแล้ว', 'ไม่ได้ดื่ม'),
            })),
            week_range: { start: dateOnly(weekStart), end: dateOnly(weekEnd) },
            vaccinations,
            fitness: fitnessRecords.map((record) => ({
                test_name: record.fitness_test_criteria.test_name,
                result_value: record.test_result == null ? 0 : Number(record.test_result),
                standard_value: Number(record.fitness_test_criteria.passing_threshold),
                status: record.is_passed == null ? (record.grade ?? '') : (record.is_passed ? 'ผ่าน' : 'ไม่ผ่าน'),
                unit: record.fitness_test_criteria.unit,
                test_date: dateOnly(record.test_date),
            })),
        };
    },

    async updateHealthData(student_id: number, data: any) {
        if (!student_id) return { success: false, message: 'Missing student ID' };

        const profileProvided = ['blood_type', 'allergies', 'chronic_illness', 'vaccinations', 'emergency_note']
            .some((key) => data[key] !== undefined);
        if (profileProvided) {
            const createData: Prisma.student_health_profilesUncheckedCreateInput = {
                student_id,
                blood_type: data.blood_type ?? null,
                allergies: data.allergies ?? null,
                chronic_illness: data.chronic_illness ?? null,
                emergency_note: data.emergency_note ?? null,
                vaccinations: Array.isArray(data.vaccinations)
                    ? data.vaccinations as Prisma.InputJsonValue
                    : Prisma.JsonNull,
                updated_at: new Date(),
            };
            const updateData: Prisma.student_health_profilesUncheckedUpdateInput = { updated_at: new Date() };
            for (const key of ['blood_type', 'allergies', 'chronic_illness', 'emergency_note'] as const) {
                if (data[key] !== undefined) updateData[key] = data[key];
            }
            if (data.vaccinations !== undefined) {
                updateData.vaccinations = Array.isArray(data.vaccinations)
                    ? data.vaccinations as Prisma.InputJsonValue
                    : Prisma.JsonNull;
            }
            await prisma.student_health_profiles.upsert({
                where: { student_id },
                create: createData,
                update: updateData,
            });
        }

        const hasMeasurements = ['weight', 'height', 'vision_left', 'vision_right', 'dental_status', 'doctor_note']
            .some((key) => data[key] !== undefined);
        const semesterId = await resolveSemesterId();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (hasMeasurements) {
            const existing = await prisma.health_checkup_records.findFirst({
                where: { student_id, checkup_date: today },
                orderBy: { id: 'desc' },
            });
            const weight = data.weight !== undefined
                ? data.weight
                : (existing?.weight == null ? null : Number(existing.weight));
            const height = data.height !== undefined
                ? data.height
                : (existing?.height == null ? null : Number(existing.height));
            const bmi = weight != null && height != null && Number(height) > 0
                ? Number(weight) / Math.pow(Number(height) / 100, 2)
                : null;
            const checkupData = {
                semester_id: semesterId,
                weight,
                height,
                bmi,
                vision_left: data.vision_left !== undefined ? data.vision_left : existing?.vision_left,
                vision_right: data.vision_right !== undefined ? data.vision_right : existing?.vision_right,
                dental_status: data.dental_status !== undefined ? data.dental_status : existing?.dental_status,
                doctor_note: data.doctor_note !== undefined ? data.doctor_note : existing?.doctor_note,
            };
            if (existing) {
                await prisma.health_checkup_records.update({ where: { id: existing.id }, data: checkupData });
            } else {
                await prisma.health_checkup_records.create({
                    data: { student_id, checkup_date: today, ...checkupData },
                });
            }
        }

        const brushesTeeth = habitValue(data.teeth_brushing);
        const drinksMilk = habitValue(data.milk_drinking);
        if ((brushesTeeth !== undefined || drinksMilk !== undefined) && semesterId) {
            await prisma.student_daily_health_records.upsert({
                where: { student_id_record_date: { student_id, record_date: today } },
                create: {
                    student_id,
                    semester_id: semesterId,
                    record_date: today,
                    brushes_teeth: brushesTeeth ?? false,
                    drinks_milk: drinksMilk ?? false,
                },
                update: {
                    ...(brushesTeeth !== undefined && { brushes_teeth: brushesTeeth }),
                    ...(drinksMilk !== undefined && { drinks_milk: drinksMilk }),
                    semester_id: semesterId,
                },
            });
        }

        return { success: true };
    },
};
