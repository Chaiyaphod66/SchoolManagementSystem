"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TeacherApiService } from "@/services/teacher-api.service";

type AttendanceStatus = "present" | "absent" | "late" | "leave";
type RemarkValue = "late" | "absent" | "personal_leave" | "sick_leave";

type AttendanceEntry = {
    status: AttendanceStatus;
    remark?: string;
};

type WeekDay = {
    date: string;
    dayName: string;
};

const REMARK_OPTIONS: Array<{ value: RemarkValue; label: string; status: AttendanceStatus }> = [
    { value: "late", label: "สาย", status: "late" },
    { value: "absent", label: "ขาด", status: "absent" },
    { value: "personal_leave", label: "ลากิจ", status: "leave" },
    { value: "sick_leave", label: "ลาป่วย", status: "leave" },
];
const DEFAULT_REMARK_VALUE: RemarkValue = "absent";
const DAY_NAMES = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์"];

function parseDateInput(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, (month || 1) - 1, day || 1);
}

function formatDateInput(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatThaiDate(value: string) {
    return parseDateInput(value).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

function getMonday(value: string) {
    const date = parseDateInput(value);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
}

function getWeekDays(value: string): WeekDay[] {
    const monday = getMonday(value);
    return DAY_NAMES.map((dayName, index) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + index);
        return {
            date: formatDateInput(date),
            dayName,
        };
    });
}

function getAttendanceKey(date: string, studentId: number) {
    return `${date}:${studentId}`;
}

function normalizeLoadedEntry(status?: string | null, remark?: string | null): AttendanceEntry | null {
    const raw = String(status || "").trim().toLowerCase();
    const rawRemark = String(remark || "").trim();

    if (!raw) return null;
    if (raw === "present" || raw.includes("มา")) return { status: "present", remark: "" };
    if (raw === "absent" || raw.includes("ขาด")) return { status: "absent", remark: rawRemark || "ขาด" };
    if (raw === "late" || raw.includes("สาย")) return { status: "late", remark: rawRemark || "สาย" };
    if (raw === "leave" || raw.includes("ลา")) {
        return { status: "leave", remark: rawRemark || "ลากิจ" };
    }
    return { status: "absent", remark: rawRemark || "ขาด" };
}

function getRemarkOption(value?: RemarkValue) {
    return REMARK_OPTIONS.find((option) => option.value === value) || REMARK_OPTIONS[1];
}

function getRemarkValueFromEntry(entry?: AttendanceEntry): RemarkValue {
    if (!entry || entry.status === "present") return DEFAULT_REMARK_VALUE;
    if (entry.status === "late") return "late";
    if (entry.status === "leave" && entry.remark?.includes("ป่วย")) return "sick_leave";
    if (entry.status === "leave") return "personal_leave";
    return "absent";
}

export function AttendanceFeature({ session }: { session: any }) {
    const [classrooms, setClassrooms] = useState<any[]>([]);
    const [selectedClassroomId, setSelectedClassroomId] = useState<number | "">("");
    const [weekAnchor, setWeekAnchor] = useState(formatDateInput(new Date()));
    const [students, setStudents] = useState<any[]>([]);
    const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceEntry>>({});
    const [remarkMap, setRemarkMap] = useState<Record<number, RemarkValue>>({});
    const [loading, setLoading] = useState(true);
    const [savingDate, setSavingDate] = useState<string | null>(null);

    const weekDays = useMemo(() => getWeekDays(weekAnchor), [weekAnchor]);
    const weekRangeLabel = `${formatThaiDate(weekDays[0].date)} - ${formatThaiDate(weekDays[weekDays.length - 1].date)}`;
    const todayDate = formatDateInput(new Date());
    const isEditableDate = (date: string) => date <= todayDate;
    const latestEditableDay = [...weekDays].reverse().find((day) => isEditableDate(day.date));

    useEffect(() => {
        setLoading(true);
        TeacherApiService.getAdvisorClassrooms(session.id)
            .then((data) => {
                const rows = data || [];
                setClassrooms(rows);
                if (rows.length > 0) {
                    setSelectedClassroomId(rows[0].classroom_id);
                }
            })
            .catch((err) => {
                console.error("Failed to fetch advisor classrooms:", err);
            })
            .finally(() => setLoading(false));
    }, [session.id]);

    const selectedClassroomInfo = useMemo(() => {
        return classrooms.find((c) => c.classroom_id === selectedClassroomId);
    }, [selectedClassroomId, classrooms]);

    const totalSlots = students.length * weekDays.length;
    const isComplete = totalSlots > 0;

    const loadAttendance = useCallback(async () => {
        if (!selectedClassroomId) return;
        setLoading(true);
        try {
            const dailyRows = await Promise.all(
                weekDays.map(async (day) => {
                    const rows = await TeacherApiService.getAttendanceStudents(session.id, selectedClassroomId, day.date);
                    return { date: day.date, rows: rows || [] };
                })
            );

            const firstStudentList = dailyRows.find((day) => day.rows.length > 0)?.rows || [];
            const nextMap: Record<string, AttendanceEntry> = {};
            const nextRemarkMap: Record<number, RemarkValue> = {};

            dailyRows.forEach((day) => {
                day.rows.forEach((student: any) => {
                    const entry = normalizeLoadedEntry(student.status, student.remark);
                    if (entry) {
                        nextMap[getAttendanceKey(day.date, student.student_id)] = entry;
                        if (entry.status !== "present" && !nextRemarkMap[student.student_id]) {
                            nextRemarkMap[student.student_id] = getRemarkValueFromEntry(entry);
                        }
                    }
                });
            });

            firstStudentList.forEach((student: any) => {
                if (!nextRemarkMap[student.student_id]) {
                    nextRemarkMap[student.student_id] = DEFAULT_REMARK_VALUE;
                }
            });

            setStudents(firstStudentList);
            setAttendanceMap(nextMap);
            setRemarkMap(nextRemarkMap);
        } catch (error) {
            console.error("Failed to load attendance list:", error);
        } finally {
            setLoading(false);
        }
    }, [selectedClassroomId, session.id, weekDays]);

    useEffect(() => {
        if (selectedClassroomId) {
            loadAttendance();
        } else {
            setStudents([]);
            setAttendanceMap({});
            setRemarkMap({});
        }
    }, [selectedClassroomId, loadAttendance]);

    const setEntry = (date: string, studentId: number, entry?: AttendanceEntry) => {
        const key = getAttendanceKey(date, studentId);
        setAttendanceMap((current) => {
            const next = { ...current };
            if (entry) {
                next[key] = entry;
            } else {
                delete next[key];
            }
            return next;
        });
    };

    const handlePresentChange = (date: string, studentId: number, checked: boolean) => {
        if (!isEditableDate(date)) return;
        setEntry(date, studentId, checked ? { status: "present", remark: "" } : undefined);
    };

    const markDayPresent = (date: string) => {
        if (!isEditableDate(date)) return;
        setAttendanceMap((current) => {
            const next = { ...current };
            students.forEach((student) => {
                next[getAttendanceKey(date, student.student_id)] = { status: "present", remark: "" };
            });
            return next;
        });
    };

    const clearDay = (date: string) => {
        if (!isEditableDate(date)) return;
        setAttendanceMap((current) => {
            const next = { ...current };
            students.forEach((student) => {
                delete next[getAttendanceKey(date, student.student_id)];
            });
            return next;
        });
    };

    const handleSaveDay = async (day: WeekDay) => {
        if (!selectedClassroomId) return;
        if (!isEditableDate(day.date)) {
            alert("ไม่สามารถบันทึกล่วงหน้าได้");
            return;
        }

        setSavingDate(day.date);
        try {
            const records = students.map((student) => {
                const entry = attendanceMap[getAttendanceKey(day.date, student.student_id)];
                const isPresent = entry?.status === "present";
                const remarkOption = getRemarkOption(remarkMap[student.student_id]);
                return {
                    student_id: student.student_id,
                    classroom_id: selectedClassroomId,
                    date: day.date,
                    status: isPresent ? "present" : remarkOption.status,
                    remark: isPresent ? "" : remarkOption.label,
                };
            });

            await TeacherApiService.saveAttendance(records);
            await loadAttendance();
            alert(`บันทึกเวลาเรียนวันที่ ${formatThaiDate(day.date)} เรียบร้อยแล้ว`);
        } catch (error: any) {
            alert("เกิดข้อผิดพลาด: " + (error.message || error));
        } finally {
            setSavingDate(null);
        }
    };

    const getDayPresentCount = (date: string) => {
        return students.filter((student) => attendanceMap[getAttendanceKey(date, student.student_id)]?.status === "present").length;
    };

    return (
        <div className="space-y-6">
            <section className="bg-gradient-to-br from-pink-600 to-red-700 rounded-3xl p-8 text-white shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20" />
                <div className="relative z-10">
                    <div className="inline-block bg-white/20 px-3 py-1 rounded-full text-sm font-medium mb-4">Attendance</div>
                    <h1 className="text-3xl font-bold flex items-center gap-2">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        บันทึกเวลาเรียนรายสัปดาห์
                    </h1>
                    {selectedClassroomInfo ? (
                        <div className="mt-2 text-pink-100 text-sm opacity-90 leading-relaxed">
                            <div>ระดับชั้น: {selectedClassroomInfo.label}</div>
                            <div>สัปดาห์: {weekRangeLabel}</div>
                        </div>
                    ) : (
                        <p className="text-pink-100 mt-2">เช็คชื่อนักเรียนประจำชั้นแบบจันทร์ถึงศุกร์</p>
                    )}
                </div>
            </section>

            {classrooms.length === 0 && !loading ? (
                <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-sm max-w-lg mx-auto mt-8">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">ไม่พบระดับชั้นในที่ปรึกษา</h3>
                    <p className="text-sm text-slate-500">บัญชีของคุณยังไม่ได้ถูกบันทึกเป็นครูที่ปรึกษาของระดับชั้นใดในภาคเรียนนี้</p>
                </div>
            ) : (
                <>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 flex flex-wrap gap-4 items-end">
                        <div className="flex-1 min-w-[220px]">
                            <label className="text-xs text-slate-500 font-medium block mb-1">ระดับชั้นประจำชั้น</label>
                            <div className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 font-medium">
                                {selectedClassroomInfo?.label || "-"}
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-slate-500 font-medium block mb-1">เลือกสัปดาห์</label>
                            <input
                                type="date"
                                className="px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-pink-500"
                                value={weekAnchor}
                                onChange={(e) => setWeekAnchor(e.target.value)}
                            />
                        </div>
                        <div className="text-sm text-slate-500 px-2 pb-2">
                            จันทร์-ศุกร์: <span className="font-bold text-slate-800">{weekRangeLabel}</span>
                        </div>
                    </div>

                    {selectedClassroomId && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                            {loading ? (
                                <div className="p-8 text-center text-slate-500">กำลังโหลด...</div>
                            ) : (
                                <>
                                    <div className="overflow-x-auto">
                                        <table className="w-full min-w-[980px]">
                                            <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200">
                                                    <th className="px-4 py-3 text-center text-sm font-medium text-slate-600 w-16">เลขที่</th>
                                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 w-32">รหัส</th>
                                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-600 min-w-[220px]">ชื่อ-นามสกุล</th>
                                                    {weekDays.map((day) => {
                                                        const canEdit = isEditableDate(day.date);
                                                        return (
                                                            <th key={day.date} className={`px-3 py-3 text-center text-sm font-medium w-32 ${canEdit ? "bg-pink-50 text-slate-700" : "text-slate-500"}`}>
                                                                <div className="font-bold text-slate-800">วัน{day.dayName}</div>
                                                                <div className="text-[11px] font-normal text-slate-400">{formatThaiDate(day.date)}</div>
                                                                <div className={`mt-1 text-[10px] font-bold ${canEdit ? "text-pink-600" : "text-red-400"}`}>
                                                                    {canEdit ? (day.date === todayDate ? "แก้ไขวันนี้" : "แก้ไขย้อนหลังได้") : "ยังไม่ถึงวัน"}
                                                                </div>
                                                            </th>
                                                        );
                                                    })}
                                                    <th className="px-4 py-3 text-sm text-center font-medium text-slate-600 w-44">หมายเหตุ</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {students.map((student, index) => (
                                                    <tr key={student.student_id} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                                                        <td className="px-4 py-3 text-sm text-slate-500 text-center">{index + 1}</td>
                                                        <td className="px-4 py-3 text-sm text-slate-800 tracking-tight">{student.student_code}</td>
                                                        <td className="px-4 py-3 text-sm text-slate-800">
                                                            {student.prefix}{student.first_name} {student.last_name}
                                                        </td>
                                                        {weekDays.map((day) => {
                                                            const key = getAttendanceKey(day.date, student.student_id);
                                                            const isPresent = attendanceMap[key]?.status === "present";
                                                            const canEdit = isEditableDate(day.date);
                                                            return (
                                                                <td key={key} className={`px-3 py-3 text-center border-l border-slate-100 ${isPresent ? "bg-pink-50/50" : canEdit ? "bg-white" : "bg-slate-50/60"}`}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isPresent}
                                                                        onChange={(event) => handlePresentChange(day.date, student.student_id, event.target.checked)}
                                                                        disabled={!canEdit || !!savingDate}
                                                                        className="h-5 w-5 rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                                                                        aria-label={`มาเรียน ${student.first_name} ${student.last_name} วัน${day.dayName}`}
                                                                    />
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="px-4 py-3 border-l border-slate-100">
                                                            <select
                                                                value={remarkMap[student.student_id] || DEFAULT_REMARK_VALUE}
                                                                onChange={(event) => {
                                                                    const value = event.target.value as RemarkValue;
                                                                    setRemarkMap((current) => ({ ...current, [student.student_id]: value }));
                                                                }}
                                                                disabled={!latestEditableDay || !!savingDate}
                                                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-pink-500 disabled:bg-slate-100 disabled:text-slate-400"
                                                            >
                                                                {REMARK_OPTIONS.map((option) => (
                                                                    <option key={option.value} value={option.value}>
                                                                        {option.label}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {students.length > 0 && (
                                                    <tr className="bg-white border-t border-slate-200">
                                                        <td colSpan={3} className="px-4 py-3 text-sm font-bold text-slate-600">
                                                            จัดการรายวัน
                                                        </td>
                                                        {weekDays.map((day) => {
                                                            const canEdit = isEditableDate(day.date);
                                                            const isSavingDay = savingDate === day.date;
                                                            return (
                                                                <td key={day.date} className={`px-2 py-3 text-center border-l border-slate-100 ${canEdit ? "bg-pink-50/40" : "bg-slate-50/70"}`}>
                                                                    <div className="flex flex-col items-stretch gap-1">
                                                                        <div className="grid grid-cols-2 gap-1">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => markDayPresent(day.date)}
                                                                                disabled={!canEdit || !!savingDate}
                                                                                className={`px-2 py-1.5 rounded-md text-[10px] font-bold transition-colors ${canEdit ? "bg-pink-600 text-white hover:bg-pink-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
                                                                            >
                                                                                ทั้งหมด
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => clearDay(day.date)}
                                                                                disabled={!canEdit || !!savingDate}
                                                                                className={`px-2 py-1.5 rounded-md border text-[10px] font-bold transition-colors ${canEdit ? "bg-white text-slate-500 border-slate-200 hover:text-red-600 hover:border-red-200" : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"}`}
                                                                            >
                                                                                ล้าง
                                                                            </button>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSaveDay(day)}
                                                                            disabled={!canEdit || !isComplete || !!savingDate}
                                                                            className={`w-full px-2 py-1.5 rounded-md text-[10px] font-bold transition-colors ${canEdit && isComplete ? "bg-red-600 text-white hover:bg-red-700" : "bg-slate-200 text-slate-400 cursor-not-allowed"}`}
                                                                        >
                                                                            {isSavingDay ? "กำลังบันทึก..." : "บันทึก"}
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                )}
                                            </tbody>
                                            <tfoot>
                                                <tr className="bg-slate-50 border-t border-slate-200">
                                                    <td colSpan={3} className="px-4 py-3 text-sm font-bold text-slate-600">รวมมาเรียน</td>
                                                    {weekDays.map((day) => (
                                                        <td key={day.date} className="px-3 py-3 text-center text-sm font-bold text-pink-700 border-l border-slate-100">
                                                            {getDayPresentCount(day.date)} / {students.length}
                                                        </td>
                                                    ))}
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
