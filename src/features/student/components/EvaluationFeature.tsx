"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StudentApiService } from "@/services/student-api.service";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { getAcademicSemesterDefault, getCurrentAcademicYearBE } from "@/features/student/academic-term";

interface EvaluationFeatureProps {
    session: any;
}

export function EvaluationFeature({}: EvaluationFeatureProps) {

    const academicYearsQuery = useQuery({
        queryKey: ["student", "lookups", "academic-years"],
        queryFn: () => StudentApiService.getAcademicYears(),
    });

    const yearOptionsData = useMemo(
        () => (academicYearsQuery.data as any[]) || [],
        [academicYearsQuery.data],
    );
    const yearOptions = useMemo(
        () => yearOptionsData.map((y: any) => Number(y.year_name)),
        [yearOptionsData],
    );

    // Select state
    const [year, setYear] = useState<number>(getCurrentAcademicYearBE());
    const [semester, setSemester] = useState<number>(getAcademicSemesterDefault());

    const selectedYearLookup = yearOptionsData.find((y: any) => Number(y.year_name) === Number(year));
    const semesterOptions = useMemo(
        () => selectedYearLookup?.semesters || [],
        [selectedYearLookup],
    );

    // Sync year state if data is loaded
    useEffect(() => {
        if (!year && yearOptions.length > 0) {
            setYear(yearOptions[0]);
        }
    }, [year, yearOptions]);

    // Data state
    const [topics, setTopics] = useState<any[]>([]);
    const [isSdqEvaluated, setIsSdqEvaluated] = useState<boolean>(false);
    const [history, setHistory] = useState<any[]>([]);

    const [isLoadingInit, setIsLoadingInit] = useState(true);
    const [isLoadingTopics, setIsLoadingTopics] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form state
    const [scores, setScores] = useState<Record<string, number | string>>({});
    const [feedback, setFeedback] = useState("");

    // Dynamic Options from History
    const dynamicYearOptions = useMemo(() => {
        const years = new Set<number>();
        if (history.length > 0) {
            history.forEach(h => {
                if (h.year) years.add(Number(h.year));
            });
        }
        if (years.size === 0) return yearOptions;
        return Array.from(years).sort((a, b) => b - a);
    }, [history, yearOptions]);

    const dynamicSemesterOptions = useMemo(() => {
        const semesters = new Set<number>();
        if (history.length > 0) {
            history.forEach(h => {
                if (Number(h.year) === year && h.semester) {
                    semesters.add(Number(h.semester));
                }
            });
        }
        if (semesters.size === 0) {
            return semesterOptions.length > 0
                ? semesterOptions.map((s: any) => s.semester_number)
                : [1, 2];
        }
        return Array.from(semesters).sort((a, b) => a - b);
    }, [history, year, semesterOptions]);

    const fetchTopics = useCallback(async () => {
        setIsLoadingTopics(true);
        try {
            const result = await StudentApiService.getEvaluationTopics(year, semester, 'sdq');
            if (result && Array.isArray(result)) {
                const validTopics = result.filter((t: any) => t.name && t.name.trim().length > 0);
                setTopics(validTopics);
                const initScores: Record<string, number | string> = {};
                validTopics.forEach((t: any) => {
                    const isTextTopic = t.type === 'text' || t.type === 'textarea' || t.name?.includes("แสดงความคิดเห็น");
                    initScores[t.name] = isTextTopic ? "" : -1;
                });
                setScores(initScores);
            }
        } catch (error) {
            console.error("Failed to load SDQ topics", error);
        } finally {
            setIsLoadingTopics(false);
        }
    }, [semester, year]);

    const initData = useCallback(async () => {
        setIsLoadingInit(true);
        try {
            if (history.length === 0) {
                const allGrades = await StudentApiService.getGrades();
                if (Array.isArray(allGrades) && allGrades.length > 0) {
                    setHistory(allGrades);
                    const years = allGrades.map(g => Number(g.year));
                    const latestYear = Math.max(...years);
                    const semsForLatest = allGrades
                        .filter(g => Number(g.year) === latestYear)
                        .map(g => Number(g.semester));
                    const latestSem = Math.max(...semsForLatest);
                    const exists = allGrades.some(g => Number(g.year) === year && Number(g.semester) === semester);
                    if (!exists) {
                        setYear(latestYear);
                        setSemester(latestSem);
                        return;
                    }
                }
            }

            const evData = await StudentApiService.getEvaluatedSections(year, semester);
            setIsSdqEvaluated(!!evData.sdqDone);

            await fetchTopics();
            setFetchError(null);
        } catch (err: any) {
            console.error("Failed to load evaluation data", err);
            setFetchError(err.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลแบบประเมิน");
        } finally {
            setIsLoadingInit(false);
        }
    }, [fetchTopics, history, semester, year]);

    useEffect(() => {
        initData();
    }, [initData]);

    const handleScoreChange = (topicName: string, value: number | string) => {
        setScores(prev => ({ ...prev, [topicName]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (topics.length === 0) {
            toast.error("ไม่พบข้อคำถามในการประเมิน");
            return;
        }

        const unanswered = topics.filter((t: any) => {
            const val = scores[t.name];
            if (t.type === 'text' || t.type === 'textarea') {
                return val === undefined || val === null;
            }
            return val === undefined || val === null || val === -1;
        });
        if (unanswered.length > 0) {
            toast.error("กรุณากรอกข้อมูลให้ครบ");
            return;
        }

        setIsSubmitting(true);
        try {
            const dataToSubmit = topics.map((t: any) => {
                const selectedVal = scores[t.name];
                const isText = t.type === 'text' || t.type === 'textarea' || t.name?.includes("แสดงความคิดเห็น");
                if (isText) {
                    return { name: t.name, value: selectedVal };
                }
                return {
                    name: t.name,
                    value: (selectedVal !== undefined && selectedVal !== null && selectedVal !== -1 ? selectedVal : 0) as number
                };
            });

            await StudentApiService.submitEvaluation(dataToSubmit, year, semester, null, feedback, 'sdq');

            toast.success("ส่งแบบประเมินสำเร็จ ขอบคุณสำหรับความร่วมมือ");
            await initData();
            setFeedback("");
        } catch (error: any) {
            console.error("Failed to submit evaluation", error);
            toast.error(error?.message || "เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoadingInit) {
        return (
            <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-slate-500">
                <svg className="w-8 h-8 animate-spin text-red-600 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p>กำลังเตรียมข้อมูลประเมิน...</p>
            </div>
        );
    }

    if (fetchError) {
        return (
            <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-red-500">
                <p>{fetchError}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Hero Section */}
            <section className="bg-gradient-to-br from-pink-600 to-red-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row md:justify-between md:items-start gap-6">
                    <div>
                        <div className="inline-block bg-white/20 px-3 py-0.5 rounded-full text-xs font-medium mb-3 backdrop-blur-sm border border-white/20">
                            SDQ Evaluation
                        </div>
                        <h1 className="text-2xl font-bold mb-1">แบบประเมิน SDQ</h1>
                        <p className="text-red-100 text-sm mt-1">ประเมินพฤติกรรมและอารมณ์ของนักเรียน</p>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 min-w-[200px]">
                        <div className="text-red-100 text-xs font-medium mb-2">สถานะล่าสุด</div>
                        {isSdqEvaluated ? (
                            <div className="text-lg font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-pink-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                ประเมินแล้ว
                            </div>
                        ) : (
                            <div className="text-lg font-bold text-white flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                พร้อมประเมิน
                            </div>
                        )}
                    </div>
                </div>

                {/* Decoration */}
                <div className="absolute top-0 right-0 w-64 h-full bg-white opacity-5 transform -skew-x-12 translate-x-20"></div>
                <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-pink-500 rounded-full blur-2xl opacity-50"></div>
                <svg className="absolute top-1/2 right-1/4 transform -translate-y-1/2 w-48 h-48 text-white/5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </section>

            {/* Year/Semester Selection */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">เลือกปีการศึกษา และภาคเรียน</h3>
                        <p className="text-slate-500 text-sm">กำหนดช่วงเวลาที่ต้องการประเมิน</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">ปีการศึกษา</label>
                        <select
                            value={year}
                            onChange={(e) => setYear(parseInt(e.target.value))}
                            className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-100 appearance-none text-slate-700 shadow-sm"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                        >
                            {dynamicYearOptions.map((y: any) => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">ภาคเรียน</label>
                        <select
                            value={semester}
                            onChange={(e) => setSemester(parseInt(e.target.value))}
                            className="w-full border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-slate-100 appearance-none text-slate-700 shadow-sm"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: `right 0.5rem center`, backgroundRepeat: `no-repeat`, backgroundSize: `1.5em 1.5em` }}
                        >
                            {dynamicSemesterOptions.map((s: any) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </section>

            {/* SDQ Form */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-800">รายการประเมิน SDQ</h3>
                        <p className="text-slate-500 text-sm">
                            {(() => {
                                const scaleTopic = topics.find((t: any) => t.options && t.options.length > 0);
                                if (scaleTopic?.options) {
                                    return `ตอบแบบประเมิน ` + scaleTopic.options.map((s: any) => `${s.value}: ${s.label}`).reverse().join(' ');
                                }
                                return "ตอบแบบประเมิน 2: จริง 1: ค่อนข้างจริง 0: ไม่จริง";
                            })()}
                        </p>
                    </div>
                </div>

                {isLoadingTopics ? (
                    <div className="text-center py-12 text-slate-500">
                        <svg className="w-8 h-8 animate-spin mx-auto text-red-500 mb-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        กำลังโหลดหัวข้อประเมิน...
                    </div>
                ) : isSdqEvaluated ? (
                    <div className="bg-red-50 p-8 rounded-2xl text-center">
                        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 mb-2">ประเมินแล้ว</h3>
                        <p className="text-slate-500">นักเรียนได้ทำแบบประเมิน SDQ ในภาคเรียนนี้เรียบร้อยแล้ว</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 mb-6">
                            <table className="w-full text-sm text-left">
                                <thead className="text-sm text-slate-600 bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 font-bold w-1/2 min-w-[300px]">หัวข้อประเมิน</th>
                                        {(() => {
                                            const scaleTopic = topics.find((t: any) => t.options && t.options.length > 0);
                                            return (scaleTopic?.options || []).map((s: any, i: number) => (
                                                <th key={i} className="px-3 py-4 font-medium text-center">
                                                    <span className="text-sm font-semibold text-slate-700">{s.label}</span>
                                                </th>
                                            ));
                                        })()}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {(() => {
                                        const scaleTopic = topics.find((t: any) => t.options && t.options.length > 0);
                                        const colCount = 1 + (scaleTopic?.options?.length || 0);

                                        if (topics.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={colCount} className="px-6 py-8 text-center text-slate-500">
                                                        ยังไม่มีหัวข้อประเมิน SDQ
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        const rows: React.ReactNode[] = [];
                                        let lastSectionId: number | null = null;
                                        let sectionIdx = 0;
                                        let itemIdx = 0;
                                        topics.forEach((topic: any, idx: number) => {
                                            const sid = topic.section_id ?? null;
                                            if (sid !== lastSectionId) {
                                                lastSectionId = sid;
                                                itemIdx = 0;
                                                const sectionMatch = topic.section_name?.match(/ตอนที่\s*(\d+)/);
                                                if (sectionMatch) {
                                                    sectionIdx = parseInt(sectionMatch[1]);
                                                } else {
                                                    sectionIdx++;
                                                }
                                                if (topic.section_name) {
                                                    rows.push(
                                                        <tr key={`sec-${sid}`} className="bg-red-50 border-y border-red-200">
                                                            <td colSpan={colCount} className="px-6 py-3 font-bold text-red-800 text-sm">
                                                                {topic.section_name}
                                                            </td>
                                                        </tr>
                                                    );
                                                }
                                            }

                                            const isText = topic.type === 'text' || topic.type === 'textarea' || topic.name?.includes("แสดงความคิดเห็น");
                                            if (isText) return;

                                            itemIdx++;
                                            const displayNum = `${sectionIdx}.${itemIdx}`;

                                            rows.push(
                                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4 font-medium text-slate-700">
                                                        {displayNum} {topic.name.replace(/^[\d.]+\s*/, '')}
                                                    </td>
                                                    {(scaleTopic?.options || []).map((headerOpt: any, i: number) => {
                                                        const currentScore = scores[topic.name];
                                                        const isChecked = currentScore !== undefined && currentScore !== null && currentScore !== -1
                                                            && String(currentScore) === String(headerOpt.value);
                                                        return (
                                                            <td key={`col-${i}`} className="px-3 py-4 text-center">
                                                                <label className="flex justify-center items-center w-full h-full cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        name={`topic-${idx}`}
                                                                        value={headerOpt.value}
                                                                        checked={isChecked}
                                                                        onChange={() => handleScoreChange(topic.name, headerOpt.value)}
                                                                        className="w-5 h-5 text-red-600 bg-slate-100 border-slate-300 focus:ring-red-500 cursor-pointer"
                                                                        required
                                                                    />
                                                                </label>
                                                            </td>
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        });
                                        return rows;
                                    })()}
                                </tbody>
                            </table>
                        </div>

                        {/* Text/Comment questions */}
                        {(() => {
                            const textTopics = topics.filter((t: any) =>
                                t.type === 'text' || t.type === 'textarea' || t.name?.includes('แสดงความคิดเห็น')
                            );
                            if (textTopics.length === 0) return null;
                            return (
                                <div className="mt-4 space-y-4">
                                    {textTopics.map((topic: any, idx: number) => (
                                        <div key={`text-${idx}`} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                                {topic.name.replace(/^[\d.]+\s*/, '')}
                                            </label>
                                            <textarea
                                                value={scores[topic.name] as string || ''}
                                                onChange={(e) => handleScoreChange(topic.name, e.target.value)}
                                                placeholder="พิมพ์ข้อเสนอแนะของคุณ..."
                                                className="w-full h-24 border border-slate-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white transition-all resize-none text-sm text-slate-700"
                                            />
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        <div className="flex justify-end pt-4">
                            <button
                                type="submit"
                                disabled={isSubmitting || topics.length === 0}
                                className={`px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                                    isSubmitting || topics.length === 0
                                        ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                        : "bg-red-600 text-white hover:bg-red-700"
                                }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        กำลังบันทึก...
                                    </>
                                ) : "ส่งแบบประเมิน"}
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </div>
    );
}
