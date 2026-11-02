'use client';

import { useState, useMemo } from 'react';
import { useClasszleStore } from '@/lib/store';
import { assignStudents, collectViolations, type AssignmentMode } from '@/lib/assignment';
import { calculateClassStats, calculatePreviousClassLevels } from '@/lib/stats';
import { recommendSwaps } from '@/lib/recommend';
import { validateMove, validateSwap } from '@/lib/validation';
import { exportToExcel } from '@/lib/excel';
import { calculateAttendanceNumbers } from '@/lib/numbering';
import { Student, Violation, BehaviorType, AssignmentChange } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogDescription
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AssignmentReportDialog } from './AssignmentReportDialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Step3DashboardProps {
    onBack: () => void;
}

// 학생 카드 컴포넌트
function StudentCard({
    student,
    groups,
    allStudents,
    isSelected,
    isHighlighted,
    isRecommended,
    showScore,
    attendanceNumber,
    onClick,
    onHoverRelation,
}: {
    student: Student;
    groups: { id: string; name: string; color: string }[];
    allStudents: Student[];
    isSelected: boolean;
    isHighlighted: boolean;
    isRecommended: boolean;
    showScore: boolean;
    attendanceNumber?: number;
    onClick: () => void;
    onHoverRelation: (studentIds: string[] | null) => void;
}) {
    const studentGroups = groups.filter((g) =>
        student.group_ids.includes(g.id)
    );

    const getBehaviorStyle = (type: BehaviorType, score: number) => {
        if (type === 'NONE') return 'bg-white border-gray-200';
        if (type === 'LEADER') {
            return score >= 2
                ? 'bg-green-100 border-green-300'
                : 'bg-green-50 border-green-200';
        }
        if (type === 'BEHAVIOR') {
            if (score <= -3) return 'bg-red-100 border-red-300';
            if (score <= -2) return 'bg-orange-100 border-orange-300';
            return 'bg-orange-50 border-orange-200';
        }
        if (type === 'EMOTIONAL') {
            if (score <= -3) return 'bg-blue-100 border-blue-300';
            if (score <= -2) return 'bg-blue-50 border-blue-200';
            return 'bg-sky-50 border-sky-200';
        }
        return 'bg-white border-gray-200';
    };

    // 관계 학생 정보 조회 (allStudents가 없을 경우 빈 배열)
    const avoidStudents = (allStudents || []).length > 0 && student.avoid_ids.length > 0
        ? student.avoid_ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[]
        : [];
    const keepStudents = (allStudents || []).length > 0 && student.keep_ids.length > 0
        ? student.keep_ids.map(id => allStudents.find(s => s.id === id)).filter(Boolean) as Student[]
        : [];

    return (
        <div
            onClick={onClick}
            className={`
        p-2 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between min-h-[42px]
        ${getBehaviorStyle(student.behavior_type, student.behavior_score)}
        ${isSelected ? 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-md z-10' : ''}
        ${isHighlighted ? 'ring-2 ring-yellow-400 ring-offset-1 bg-yellow-50 shadow-lg z-20' : ''}
        ${isRecommended ? 'ring-2 ring-indigo-400 ring-offset-1 shadow-md z-10 animate-pulse' : ''}
        ${!isSelected && !isHighlighted && !isRecommended ? 'hover:shadow-md hover:scale-[1.01]' : ''}
      `}
        >
            <div className="flex items-center gap-1.5 overflow-hidden">
                {attendanceNumber !== undefined && (
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {attendanceNumber}.
                    </span>
                )}
                <span className="font-medium text-sm truncate">{student.name}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                    ({student.gender === 'M' ? '남' : '여'})
                </span>
                {student.behavior_type !== 'NONE' && (
                    <span className="text-[10px] opacity-70 shrink-0">
                        {student.behavior_type === 'LEADER' && '🟢'}
                        {student.behavior_type === 'BEHAVIOR' && '🟠'}
                        {student.behavior_type === 'EMOTIONAL' && '🔵'}
                        {student.behavior_score > 0 ? `+${student.behavior_score}` : student.behavior_score}
                    </span>
                )}
                {showScore && (
                    <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1 rounded border border-indigo-100 shrink-0">
                        {student.academic_score}점
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1 shrink-0 ml-1">
                {/* 관계 배지 - 피해야 할 관계 */}
                {avoidStudents.length > 0 && (
                    <div
                        className="relative group"
                        onMouseEnter={() => onHoverRelation(student.avoid_ids)}
                        onMouseLeave={() => onHoverRelation(null)}
                    >
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-200 border-red-200 text-[10px] px-1 py-0 h-5 cursor-help">
                            🚫{avoidStudents.length}
                        </Badge>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                <div className="font-semibold mb-0.5 text-red-300">피해야 할 학생</div>
                                {avoidStudents.map(s => {
                                    const classStudents = allStudents.filter(st => st.assigned_class === s.assigned_class).sort((a, b) => a.name.localeCompare(b.name));
                                    const studentNumber = classStudents.findIndex(st => st.id === s.id) + 1;
                                    // 이전 학년에서 +1, 새 반호수 추출, 새 번호
                                    const prevGrade = parseInt(s.prev_info.split('-')[0]) || 0;
                                    const newGrade = prevGrade + 1;
                                    const newClass = s.assigned_class ? s.assigned_class.replace('반', '') : '?';
                                    const newInfo = s.assigned_class ? `${newGrade}-${newClass}-${studentNumber}` : '미배정';
                                    return <div key={s.id}>{s.name} ({newInfo})</div>;
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 관계 배지 - 같은 반 희망 */}
                {keepStudents.length > 0 && (
                    <div
                        className="relative group"
                        onMouseEnter={() => onHoverRelation(student.keep_ids)}
                        onMouseLeave={() => onHoverRelation(null)}
                    >
                        <Badge className="bg-pink-100 text-pink-700 hover:bg-pink-200 border-pink-200 text-[10px] px-1 py-0 h-5 cursor-help">
                            💕{keepStudents.length}
                        </Badge>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-50">
                            <div className="bg-gray-900 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap shadow-lg">
                                <div className="font-semibold mb-0.5 text-pink-300">같은 반 희망 학생</div>
                                {keepStudents.map(s => {
                                    const classStudents = allStudents.filter(st => st.assigned_class === s.assigned_class).sort((a, b) => a.name.localeCompare(b.name));
                                    const studentNumber = classStudents.findIndex(st => st.id === s.id) + 1;
                                    // 이전 학년에서 +1, 새 반호수 추출, 새 번호
                                    const prevGrade = parseInt(s.prev_info.split('-')[0]) || 0;
                                    const newGrade = prevGrade + 1;
                                    const newClass = s.assigned_class ? s.assigned_class.replace('반', '') : '?';
                                    const newInfo = s.assigned_class ? `${newGrade}-${newClass}-${studentNumber}` : '미배정';
                                    return <div key={s.id}>{s.name} ({newInfo})</div>;
                                })}
                            </div>
                        </div>
                    </div>
                )}
                {/* 기존 배지들 */}
                {(studentGroups.length > 0 || student.is_pre_transfer || student.fixed_class) && (
                    <div className="flex gap-1">
                        {student.fixed_class && (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-200 border-green-200 text-[10px] px-1 py-0 h-5">
                                📌고정
                            </Badge>
                        )}
                        {student.is_pre_transfer && (
                            <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-200 text-[10px] px-1 py-0 h-5">
                                전출
                            </Badge>
                        )}
                        {studentGroups.map((group) => (
                            <Badge key={group.id} className={`${group.color} text-[10px] px-1 py-0 h-5`}>
                                {group.name}
                            </Badge>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}


export default function Step3Dashboard({ onBack }: Step3DashboardProps) {
    const {
        students, groups, settings,
        applyAssignment, undoLastChange, undoStack,
        assignStudentToClass, swapStudents,
        movementHistory, clearMovements,
        setNumberingMethod, resetAssignments
    } = useClasszleStore();
    const [isAssigning, setIsAssigning] = useState(false);
    const [isNewConfirmOpen, setIsNewConfirmOpen] = useState(false);

    const [activeRelationIds, setActiveRelationIds] = useState<string[] | null>(null);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    // 조건을 어기는 변경을 교사에게 확인받는 동안 들고 있습니다. 교환이면 s2Id, 반으로 옮기기면 className이 있습니다.
    const [pendingSwap, setPendingSwap] = useState<{ s1Id: string, s2Id?: string, className?: string, violations: Violation[] } | null>(null);

    // 리포트 다이얼로그 상태
    const [isReportOpen, setIsReportOpen] = useState(false);

    // 배정 초기화 확인 다이얼로그 상태
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    // 배정 모드 상태
    const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('new');

    const hasAssignments = students.some((s) => s.assigned_class);

    // 수동으로 바꾼 뒤에도 맞도록 지금 배정에서 바로 계산합니다.
    const violations = useMemo(
        () => (hasAssignments ? collectViolations(students, settings.classCount, groups) : []),
        [hasAssignments, students, settings.classCount, groups]
    );

    const handleClassHeaderClick = (className: string) => {
        handleMoveToClass(className);
    };

    const classNames = useMemo(
        () => Array.from({ length: settings.classCount }, (_, i) => `${i + 1}반`),
        [settings.classCount]
    );

    const classStats = useMemo(
        () => calculateClassStats(students, settings.classCount, groups),
        [students, settings.classCount, groups]
    );

    const previousClassLevels = useMemo(() => calculatePreviousClassLevels(students), [students]);

    const studentsByClass = useMemo(() => {
        const result: Record<string, Student[]> = {};
        classNames.forEach((cn) => {
            result[cn] = students
                .filter((s) => s.assigned_class === cn)
                .sort((a, b) => {
                    // 0. 전출 예정 여부 (일반 -> 전출)
                    // 전출 학생은 맨 뒤 출석번호
                    const aPre = a.is_pre_transfer ? 1 : 0;
                    const bPre = b.is_pre_transfer ? 1 : 0;
                    if (aPre !== bPre) return aPre - bPre;

                    if (settings.numberingMethod === 'mixed') {
                        // 1. 이름 (가나다순) - 남녀 혼합
                        return a.name.localeCompare(b.name, 'ko');
                    } else if (settings.numberingMethod === 'maleFirst') {
                        // 남학생 -> 여학생
                        if (a.gender !== b.gender) return a.gender === 'M' ? -1 : 1;
                        return a.name.localeCompare(b.name, 'ko');
                    } else {
                        // 여학생 -> 남학생
                        if (a.gender !== b.gender) return a.gender === 'F' ? -1 : 1;
                        return a.name.localeCompare(b.name, 'ko');
                    }
                });
        });
        result['미배정'] = students
            .filter((s) => !s.assigned_class)
            .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        return result;
    }, [students, classNames, settings.numberingMethod]);

    // 반별 출석번호 계산 (Memoized)
    const attendanceNumbersByClass = useMemo(() => {
        const result: Record<string, Record<string, number>> = {};
        classNames.forEach((cn) => {
            result[cn] = calculateAttendanceNumbers(
                students.filter(s => s.assigned_class === cn),
                settings.numberingMethod || 'mixed'
            );
        });
        // 미배정 학생은 단순 순번
        const unassignedStudents = students.filter(s => !s.assigned_class).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        result['미배정'] = {};
        unassignedStudents.forEach((s, idx) => {
            result['미배정'][s.id] = idx + 1;
        });
        return result;
    }, [students, classNames, settings.numberingMethod]);

    const handleAssign = () => {
        // 신규 배정은 지금 결과와 이력을 지우므로 먼저 묻습니다.
        if (assignmentMode === 'new' && hasAssignments) {
            setIsNewConfirmOpen(true);
            return;
        }
        runAssign();
    };

    const runAssign = () => {
        setIsAssigning(true);

        // 현재 상태 캡처 (Deep Copy to avoid reference issues)
        const beforeStudents = JSON.parse(JSON.stringify(students)) as Student[];

        setTimeout(() => {
            // 알고리즘 실행
            const result = assignStudents(students, settings.classCount, groups, { mode: assignmentMode });

            // 1차 변경 내역 추출 (단순 이동 리스트)
            const rawChanges: AssignmentChange[] = [];
            const batchId = String(Date.now());
            result.students.forEach(newStudent => {
                const oldStudent = beforeStudents.find(s => s.id === newStudent.id);
                if (oldStudent && oldStudent.assigned_class !== newStudent.assigned_class) {
                    rawChanges.push({
                        studentId: newStudent.id,
                        studentName: newStudent.name,
                        oldClass: oldStudent.assigned_class || null,
                        newClass: newStudent.assigned_class || null,
                        timestamp: Date.now(),
                        type: 'move',
                        source: 'auto',
                        batchId
                    });
                }
            });

            // 2차 가공: 교환(Swap) 쌍 검출 및 병합
            const changes: AssignmentChange[] = [];
            const processedIndices = new Set<number>();

            for (let i = 0; i < rawChanges.length; i++) {
                if (processedIndices.has(i)) continue;

                let isSwapped = false;
                for (let j = i + 1; j < rawChanges.length; j++) {
                    if (processedIndices.has(j)) continue;

                    const c1 = rawChanges[i];
                    const c2 = rawChanges[j];

                    // 상호 교환 조건 확인 (A->B, B->A)
                    if (
                        c1.oldClass === c2.newClass &&
                        c1.newClass === c2.oldClass &&
                        c1.oldClass !== null &&
                        c1.newClass !== null
                    ) {
                        changes.push({
                            ...c1,
                            type: 'swap',
                            source: 'auto',
                            partnerName: c2.studentName,
                            partnerId: c2.studentId
                        });
                        processedIndices.add(i);
                        processedIndices.add(j);
                        isSwapped = true;
                        break;
                    }
                }

                if (!isSwapped) {
                    changes.push({
                        ...rawChanges[i],
                        source: 'auto'
                    });
                    processedIndices.add(i);
                }
            }

            // 신규 배정은 이력을 새로 시작하고, 수정과 균형 조정은 이력에 더합니다.
            applyAssignment(result.students, assignmentMode === 'new' ? [] : changes, assignmentMode === 'new');
            setIsAssigning(false);

            setIsReportOpen(true); // 결과 리포트 열기

            if (result.moved > 0) {
                toast.success(`${result.moved}명의 학생 배정이 변경되었습니다.`);
            } else {
                toast.info('어긴 조건이 없어 옮긴 학생이 없습니다.');
            }
            if (result.violations.length > 0) {
                toast.warning(`지키지 못한 조건이 ${result.violations.length}건 있습니다. 아래 조건 준수 현황을 확인해 주세요.`);
            }
        }, 100);
    };

    const handleExport = () => {
        setIsExportDialogOpen(true);
    };

    const confirmExport = (includeDetails: boolean) => {
        const timestamp = new Date().toISOString().split('T')[0];
        exportToExcel(students, settings.classCount, `반편성_결과_${timestamp}.xlsx`, {
            includeDetails,
            groups,
            numberingMethod: settings.numberingMethod
        });
        setIsExportDialogOpen(false);
    };
    // 추천 교환 대상 학생 ID 목록
    const recommendedStudentIds = useMemo(() => {
        if (!selectedStudentId) return [];
        return recommendSwaps(selectedStudentId, students, settings.classCount, groups).map((r) => r.studentId);
    }, [selectedStudentId, students, settings.classCount, groups]);

    const handleStudentClick = (id: string) => {
        if (!selectedStudentId) {
            setSelectedStudentId(id);
        } else if (selectedStudentId === id) {
            setSelectedStudentId(null);
        } else {
            // 다른 학생 클릭 시 교환(Swap) 시도
            const s1 = students.find(s => s.id === selectedStudentId);
            const s2 = students.find(s => s.id === id);

            if (s1 && s2 && s1.assigned_class && s2.assigned_class && s1.assigned_class !== s2.assigned_class) {
                // 교환 전 위반 사항 체크
                const swapViolations = validateSwap(selectedStudentId, id, students, settings.classCount, groups);

                if (swapViolations.length > 0) {
                    // 위반 사항이 있으면 경고 다이얼로그 띄움
                    setPendingSwap({ s1Id: selectedStudentId, s2Id: id, violations: swapViolations });
                } else {
                    // 위반 사항 없으면 바로 교환
                    swapStudents(selectedStudentId, id);
                    setSelectedStudentId(null);
                    toast.success('학생 배정이 성공적으로 교차 변경되었습니다.');
                }
            } else if (s1 && s2 && s1.assigned_class === s2.assigned_class) {
                // 같은 반 학생을 클릭하면 선택 변경
                setSelectedStudentId(id);
            } else {
                setSelectedStudentId(id);
            }
        }
    };

    const confirmSwap = () => {
        if (pendingSwap) {
            if (pendingSwap.s2Id) {
                swapStudents(pendingSwap.s1Id, pendingSwap.s2Id);
            } else if (pendingSwap.className) {
                assignStudentToClass(pendingSwap.s1Id, pendingSwap.className);
            }
            setPendingSwap(null);
            setSelectedStudentId(null);
            toast.success('조건을 어기는 줄 알고 학생을 옮겼습니다. 조건 준수 현황에 표시됩니다.');
        }
    };

    const handleMoveToClass = (className: string | null) => {
        if (!selectedStudentId) return;
        // 미배정으로 빼는 것은 임시로 두는 일이라 묻지 않습니다.
        if (className) {
            const moveViolations = validateMove(selectedStudentId, className, students, settings.classCount, groups);
            if (moveViolations.length > 0) {
                setPendingSwap({ s1Id: selectedStudentId, className, violations: moveViolations });
                return;
            }
        }
        assignStudentToClass(selectedStudentId, className);
        setSelectedStudentId(null);
        toast.success(`${className || '미배정'} 구역으로 이동했습니다.`);
    };

    const selectedStudent = selectedStudentId
        ? students.find((s) => s.id === selectedStudentId)
        : null;

    return (
        <div className="space-y-6">
            <AssignmentReportDialog
                open={isReportOpen}
                onOpenChange={setIsReportOpen}
                students={students}
                groups={groups}
                history={movementHistory}
            />

            {/* 통계 헤더 */}
            <Card className="rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/50 backdrop-blur">
                <CardHeader className="pb-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* 왼쪽: 배정 모드 선택 */}
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-1 px-1">배정 모드 선택</span>
                                <Tabs
                                    value={assignmentMode}
                                    onValueChange={(v) => setAssignmentMode(v as AssignmentMode)}
                                    className="w-[420px]"
                                >
                                    <TabsList className="grid w-full grid-cols-3 h-11 bg-slate-100/50 p-1">
                                        <TabsTrigger value="new" className="text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm">
                                            🚀 신규 배정
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="optimize"
                                            disabled={!hasAssignments}
                                            className="text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            🛠️ 현재 배정 수정
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value="balance"
                                            disabled={!hasAssignments}
                                            className="text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-indigo-600 data-[state=active]:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            ⚖️ 균형 조정
                                        </TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>
                        </div>

                        {/* 오른쪽: 실행 버튼 그룹 */}
                        <div className="flex items-end gap-2 flex-wrap justify-end h-full pt-4">
                            <Button
                                onClick={handleAssign}
                                disabled={isAssigning || students.length === 0}
                                className={`h-10 px-5 font-bold shadow-md transition-all active:scale-95 bg-indigo-600 hover:bg-indigo-700`}
                            >
                                {isAssigning
                                    ? '배정 중...'
                                    : hasAssignments
                                        ? '🔄 배정 실행'
                                        : '🚀 반편성 시작'}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setIsResetConfirmOpen(true)}
                                disabled={!hasAssignments}
                                className="h-10 px-4 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors"
                            >
                                <span className="mr-2 text-base">🗑️</span> 배정 초기화
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => {
                                    undoLastChange();
                                    setSelectedStudentId(null);
                                    toast.success('직전 변경을 되돌렸습니다.');
                                }}
                                disabled={undoStack.length === 0}
                                className="h-10 px-4 border-slate-200 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                            >
                                <span className="mr-2 text-base">↩️</span> 되돌리기
                            </Button>

                            <div className="h-11 w-px bg-slate-200 mx-1" /> {/* 구분선 */}

                            <Button
                                variant="outline"
                                onClick={() => setIsReportOpen(true)}
                                disabled={students.length === 0}
                                className="h-10 px-4 border-slate-200 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                            >
                                <span className="mr-2 text-base">📊</span> 배정 리포트
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleExport}
                                disabled={!hasAssignments}
                                className="h-10 px-4 border-slate-200 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
                            >
                                <span className="mr-2 text-base">📥</span> 배정 결과 엑셀
                            </Button>
                        </div>
                    </div>

                    {/* 배정 모드 설명 문구 */}
                    <div className="mt-4 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 border-dashed text-[13px] text-muted-foreground leading-relaxed">
                        {assignmentMode === 'new' ? (
                            <p className="flex items-center gap-2">
                                <span className="text-primary font-bold">신규 배정:</span>
                                <span>남녀 각각 성적순(S자)으로 나눈 뒤 모든 조건(고정 반, 학생 관계, 그룹, 인원, 남녀, 생활지도, 성적)을 맞춰 처음부터 새로 편성합니다.</span>
                            </p>
                        ) : assignmentMode === 'optimize' ? (
                            <p className="flex items-center gap-2">
                                <span className="text-indigo-600 font-bold">현재 배정 수정:</span>
                                <span>지금 배정을 유지하고 어긴 조건(고정 반, 학생 관계, 그룹, 인원, 남녀)만 고칩니다. 옮기는 학생을 가장 적게 합니다.</span>
                            </p>
                        ) : (
                            <p className="flex items-center gap-2">
                                <span className="text-indigo-600 font-bold">균형 조정:</span>
                                <span>지금 배정에서 시작해 어긴 조건을 고치고 성적과 생활지도 균형까지 맞춥니다. 수정보다 많은 학생을 옮길 수 있습니다.</span>
                            </p>
                        )}
                    </div>
                </CardHeader>
            </Card>
            {/* 메인 탭 구성 */}
            <Tabs defaultValue="stats" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-12 mb-6">
                    <TabsTrigger value="stats" className="text-sm font-medium">📊 학급별 균형 통계</TabsTrigger>
                    <TabsTrigger value="board" className="text-sm font-medium">📋 상세 배치 조정</TabsTrigger>
                </TabsList>

                <TabsContent value="board" className="space-y-6 outline-none">
                    {/* 배정 작업 안내 */}
                    <div className="flex items-center justify-between gap-4">
                        <div className="text-sm font-medium text-primary flex items-center gap-2 bg-primary/5 px-3 py-2 rounded-md border border-primary/10">
                            <span className="text-lg">🖱️</span>
                            <span>학생을 클릭하여 선택한 후, 이동할 반을 클릭하거나 다른 학생과 교환하세요.</span>
                        </div>

                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
                            <label className="text-xs font-bold text-slate-500 whitespace-nowrap">번호 부여 방식</label>
                            <Select
                                value={settings.numberingMethod}
                                onValueChange={(v) => setNumberingMethod(v as any)}
                            >
                                <SelectTrigger className="w-[150px] h-9 bg-white border-slate-200 focus:ring-primary/20 text-sm">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mixed">성별 혼합</SelectItem>
                                    <SelectItem value="maleFirst">남학생 → 여학생</SelectItem>
                                    <SelectItem value="femaleFirst">여학생 → 남학생</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* 미배정 영역 (상단 배치) */}
                    <Card className={`rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur border-dashed overflow-hidden p-0 ${selectedStudentId ? 'ring-2 ring-primary/50 cursor-pointer hover:bg-muted/50 transition-all' : ''}`}>
                        <CardHeader className="py-3 px-4 bg-indigo-50/30 border-b cursor-pointer" onClick={() => handleMoveToClass(null)}>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    미배정 학생
                                    <Badge variant="secondary" className="text-xs">
                                        {studentsByClass['미배정'].length}명
                                    </Badge>
                                </CardTitle>
                                {selectedStudentId && (
                                    <span className="text-xs text-primary animate-pulse">
                                        클릭하여 선택된 학생을 미배정으로 이동하기
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-4">
                            {studentsByClass['미배정'].length === 0 ? (
                                <p className="text-center text-xs text-muted-foreground py-2">대기 중인 미배정 학생이 없습니다.</p>
                            ) : (
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                    {studentsByClass['미배정']
                                        .map((s) => (
                                            <StudentCard
                                                key={s.id}
                                                student={s}
                                                groups={groups}
                                                allStudents={students}
                                                isSelected={selectedStudentId === s.id}
                                                isHighlighted={activeRelationIds?.includes(s.id) || false}
                                                isRecommended={recommendedStudentIds.includes(s.id)}
                                                showScore={!!selectedStudentId && (selectedStudentId === s.id || recommendedStudentIds.includes(s.id))}
                                                attendanceNumber={attendanceNumbersByClass['미배정']?.[s.id]}
                                                onClick={() => handleStudentClick(s.id)}
                                                onHoverRelation={setActiveRelationIds}
                                            />
                                        ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* 각 반 영역 (그리드 보드) */}
                    <div className={`grid gap-4 ${settings.classCount <= 4 ? `grid-cols-${settings.classCount}` : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5'}`}>
                        {classNames.map((className) => (
                            <Card key={className} className={`h-full rounded-xl border-indigo-100 shadow-lg shadow-indigo-500/5 bg-white/80 backdrop-blur overflow-hidden p-0 ${selectedStudentId ? 'ring-2 ring-primary/50 cursor-pointer hover:bg-muted/50 transition-all' : ''}`}>
                                <CardHeader className="py-3 px-4 bg-indigo-50/50 border-b cursor-pointer" onClick={() => handleClassHeaderClick(className)}>
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-sm font-bold text-primary">{className}</CardTitle>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-xs">
                                                {studentsByClass[className].length}명
                                            </Badge>
                                            {selectedStudentId && (
                                                <span className="text-[10px] text-primary flex items-center animate-pulse">
                                                    여기로 ↵
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-2 min-h-[200px]">
                                    <div className="space-y-2">
                                        {studentsByClass[className]
                                            .map((s) => (
                                                <StudentCard
                                                    key={s.id}
                                                    student={s}
                                                    groups={groups}
                                                    allStudents={students}
                                                    isSelected={selectedStudentId === s.id}
                                                    isHighlighted={activeRelationIds?.includes(s.id) || false}
                                                    isRecommended={recommendedStudentIds.includes(s.id)}
                                                    showScore={!!selectedStudentId && (selectedStudentId === s.id || recommendedStudentIds.includes(s.id))}
                                                    attendanceNumber={attendanceNumbersByClass[className]?.[s.id]}
                                                    onClick={() => handleStudentClick(s.id)}
                                                    onHoverRelation={setActiveRelationIds}
                                                />
                                            ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                <TabsContent value="stats" className="outline-none">
                    <Card className="rounded-xl border-indigo-100 shadow-sm bg-white/50 overflow-hidden">
                        <CardContent className="pt-5">
                            <div className="mb-6 p-4 bg-indigo-50 rounded-lg text-sm text-slate-700 leading-relaxed border border-indigo-100/50">
                                💡 <strong>생활지도 균형</strong>: 합계가 아니라 등급별 학생 수로 맞춥니다. -3, -2 학생은 반별 차이 1명을 목표로 하고, 리더는 따로 세어 고르게 나눕니다. 인원, 평균, 남녀, 등급별 인원은 전출 뒤 기준입니다.
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-muted">
                                            <th className="p-3 text-left font-semibold">반</th>
                                            <th className="p-3 text-center font-semibold">인원</th>
                                            <th className="p-3 text-center font-semibold">평균</th>
                                            <th className="p-3 text-center font-semibold">남/여</th>
                                            <th className="p-3 text-center font-semibold text-slate-700">생활지도 점수별 학생수</th>
                                            <th className="p-3 text-center font-semibold text-slate-700">-3 / -2 / -1 / 리더</th>
                                            {groups.length > 0 && <th className="p-3 text-center font-semibold text-slate-700">분산 배정 그룹</th>}
                                            <th className="p-3 text-center font-semibold">전출(남/여)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {classStats.map((stat) => (
                                            <tr key={stat.className} className="border-b hover:bg-muted/30">
                                                <td className="p-3 font-bold">{stat.className}</td>
                                                <td className="p-3 text-center">
                                                    {stat.stayCount}
                                                    {stat.preTransferCount > 0 && (
                                                        <span className="block text-[10px] text-muted-foreground">전출 전 {stat.studentCount}</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">{stat.stayAverageScore}</td>
                                                <td className="p-3 text-center text-muted-foreground">{stat.stayMaleCount}/{stat.stayFemaleCount}</td>
                                                <td className="p-3">
                                                    <div className="flex items-center justify-center gap-4">
                                                        {/* 행동/정서 (-3, -2, -1) 2단 구성 */}
                                                        <div className="flex flex-col gap-1.5 justify-center">
                                                            {/* 행동형 행 */}
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#ef4444] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-3</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-red-600">{stat.behaviorPlus3}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#f97316] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-2</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-orange-600">{stat.behaviorPlus2}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#fb923c] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-1</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-orange-500">{stat.behaviorPlus1}</span>
                                                                </div>
                                                            </div>
                                                            {/* 정서형 행 */}
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#4f46e5] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-3</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-indigo-600">{stat.emotionalPlus3}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#3b82f6] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-2</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-blue-600">{stat.emotionalPlus2}</span>
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Badge variant="outline" className="bg-[#60a5fa] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">-1</Badge>
                                                                    <span className="text-[11px] font-semibold w-3 text-sky-500">{stat.emotionalPlus1}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 일반(0) */}
                                                        <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-full border border-slate-100">
                                                            <Badge variant="outline" className="bg-slate-200 text-slate-600 border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[10px] font-bold">0</Badge>
                                                            <span className="text-[11px] font-bold text-slate-600">{stat.normalCount}</span>
                                                        </div>

                                                        {/* 리더 (+1, +2) */}
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex items-center gap-1">
                                                                <Badge variant="outline" className="bg-[#22c55e] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">+1</Badge>
                                                                <span className="text-[11px] font-semibold text-green-700">{stat.scorePlus1}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <Badge variant="outline" className="bg-[#059669] text-white border-none w-5 h-5 p-0 flex items-center justify-center rounded-full text-[9px] font-bold">+2</Badge>
                                                                <span className="text-[11px] font-semibold text-emerald-800">{stat.scorePlus2}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center font-semibold text-slate-700">
                                                    {stat.minus3Count} / {stat.minus2Count} / {stat.minus1Count} / {stat.leaderCount}
                                                </td>
                                                {groups.length > 0 && (
                                                    <td className="p-3 text-center text-xs">
                                                        {groups.map(g => (
                                                            <Badge key={g.id} className={`${g.color} mr-1 mb-1 px-1 py-0`}>
                                                                {g.name.substring(0, 1)}:{stat.groupCounts[g.id] || 0}
                                                            </Badge>
                                                        ))}
                                                    </td>
                                                )}
                                                <td className="p-3 text-center text-orange-600">
                                                    {stat.preTransferMaleCount + stat.preTransferFemaleCount > 0 ? `${stat.preTransferMaleCount}/${stat.preTransferFemaleCount}` : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {previousClassLevels.length > 1 && (
                        <Card className="mt-6 rounded-xl border-indigo-100 shadow-sm bg-white/50 overflow-hidden">
                            <CardContent className="pt-5">
                                <h4 className="text-sm font-bold text-slate-800">전학년도 반별 생활지도 등급 인원</h4>
                                <p className="mt-1 mb-4 text-[13px] text-slate-600 leading-relaxed">
                                    담임 선생님마다 기준이 다를 수 있습니다. 한 반만 유독 많거나 적으면 배정 전에 점수를 살펴봐 주세요. 점수를 자동으로 고치지는 않습니다. 기준 예시는 아래 점수 기준 상세 안내에 있습니다.
                                </p>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead>
                                            <tr className="bg-muted">
                                                <th className="p-2 text-left font-semibold">전학년도 반</th>
                                                <th className="p-2 text-center font-semibold">학생</th>
                                                <th className="p-2 text-center font-semibold">-3</th>
                                                <th className="p-2 text-center font-semibold">-2</th>
                                                <th className="p-2 text-center font-semibold">-1</th>
                                                <th className="p-2 text-center font-semibold">리더</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previousClassLevels.map((row) => (
                                                <tr key={row.previousClass} className="border-b">
                                                    <td className="p-2 font-semibold">{row.previousClass}반</td>
                                                    <td className="p-2 text-center">{row.total}</td>
                                                    <td className="p-2 text-center">{row.minus3}</td>
                                                    <td className="p-2 text-center">{row.minus2}</td>
                                                    <td className="p-2 text-center">{row.minus1}</td>
                                                    <td className="p-2 text-center">{row.leader}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* 범례 및 안내 (상시 노출 영역) */}
            <div className="grid grid-cols-1 gap-4 mt-6">
                {/* 인라인 범례 */}
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500 px-1">
                    <span className="text-slate-700 font-bold mr-2">범례:</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500"></span> 행동(-3)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> 행동(-2)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span> 행동(-1)</span>
                    <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span> 정서(-3)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> 정서(-2)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-sky-400"></span> 정서(-1)</span>
                    <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-200"></span> 일반(0)</span>
                    <span className="flex items-center gap-1.5 ml-2"><span className="w-2.5 h-2.5 rounded-full bg-green-400"></span> 리더(+1)</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> 리더(+2)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 상세 점수 기준 안내 */}
                    <div className="p-5 bg-slate-50/50 rounded-xl border border-slate-100 shadow-sm">
                        <h4 className="font-bold text-[12px] text-slate-700 mb-4 flex items-center gap-2">
                            <span className="text-base text-yellow-500">💡</span> 점수 기준 상세 안내
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="space-y-3">
                                <h5 className="flex items-center gap-1.5 font-bold text-orange-700 text-[11px]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> 행동 (생활지도 소요)
                                </h5>
                                <ul className="text-[10px] text-slate-600 space-y-2 leading-relaxed">
                                    <li>• <strong>-1</strong>: 가벼운 딴짓, 관심 필요</li>
                                    <li>• <strong>-2</strong>: 잦은 방해, 지속적 지도 필요</li>
                                    <li>• <strong>-3</strong>: 심각한 방해, 학교폭력 등 집중 관리 필요</li>
                                </ul>
                            </div>
                            <div className="space-y-3">
                                <h5 className="flex items-center gap-1.5 font-bold text-blue-700 text-[11px]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> 정서 (세심한 배려)
                                </h5>
                                <ul className="text-[10px] text-slate-600 space-y-2 leading-relaxed">
                                    <li>• <strong>-1</strong>: 다소 예민함, 배려 필요</li>
                                    <li>• <strong>-2</strong>: 교우관계/정서 지원 필요</li>
                                    <li>• <strong>-3</strong>: 특별한 케어/전문가 개입 필요</li>
                                </ul>
                            </div>
                            <div className="space-y-3">
                                <h5 className="flex items-center gap-1.5 font-bold text-emerald-700 text-[11px]">
                                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span> 리더 (영향력)
                                </h5>
                                <ul className="text-[10px] text-slate-600 space-y-2 leading-relaxed">
                                    <li>• <strong>+1</strong>: 모범적이고 성실한 학생</li>
                                    <li>• <strong>+2</strong>: 리더십이 탁월한 학생 (회장감)</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-white/50 rounded-xl border border-orange-100/50 shadow-sm backdrop-blur-sm">
                        <h4 className="font-bold text-[13px] text-orange-700 mb-2 flex items-center gap-2">
                            <span className="text-base">⚠️</span> 제약 조건 준수 현황
                        </h4>
                        {!hasAssignments ? (
                            <p className="text-xs text-slate-500">아직 배정하지 않았습니다.</p>
                        ) : violations.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-[11px] text-orange-600 font-bold">지키지 못한 조건이 {violations.length}건 있습니다.</p>
                                <ul className="text-[11px] text-orange-700 space-y-1 max-h-40 overflow-y-auto">
                                    {violations.map((v) => <li key={v.key ?? v.message}>• {v.message}</li>)}
                                </ul>
                            </div>
                        ) : (
                            <p className="text-xs text-green-700 font-semibold">고정 반, 떼어 놓기, 함께 두기, 그룹, 인원, 남녀 조건을 모두 지키고 있습니다.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* 제약 조건 위반 경고 다이얼로그 */}
            <Dialog open={!!pendingSwap} onOpenChange={(open) => !open && setPendingSwap(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2 text-red-600">
                            ⚠️ 배정 제약 조건 위반 알림
                        </DialogTitle>
                        <DialogDescription>옮기면 새로 어기게 되는 조건을 확인하세요.</DialogDescription>
                    </DialogHeader>
                    <p className="text-sm font-medium text-gray-700">
                        {pendingSwap?.s2Id ? '두 학생을 바꾸면' : '이 반으로 옮기면'} 다음 조건을 어깁니다:
                    </p>
                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {pendingSwap?.violations.map((v, i) => (
                            <div key={i} className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-800 leading-relaxed font-medium">
                                • {v.message}
                            </div>
                        ))}
                    </div>
                    <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg border border-gray-100 mt-4">
                        이 위반 사항을 인지하고도 강제로 배정을 변경하시겠습니까?
                    </p>
                    <div className="flex justify-end gap-3 pt-4 border-t mt-6">
                        <Button variant="outline" onClick={() => setPendingSwap(null)}>취소</Button>
                        <Button variant="destructive" onClick={confirmSwap}>강제 변경 실행</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 엑셀 내보내기 옵션 다이얼로그 */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2">
                            📥 배정 결과 엑셀 내보내기
                        </DialogTitle>
                        <DialogDescription>
                            필요한 정보 수준에 따라 엑셀 출력 옵션을 선택하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        <p className="text-sm text-muted-foreground">
                            엑셀 파일에 포함할 정보 수준을 선택해 주세요.
                        </p>
                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                variant="outline"
                                className="h-20 flex flex-col items-center justify-center gap-1 hover:border-primary hover:bg-primary/5"
                                onClick={() => confirmExport(false)}
                            >
                                <span className="font-bold text-base text-slate-700">기본 정보만 출력</span>
                                <span className="text-[11px] text-slate-500">배정 결과(학년, 반, 번호)와 기본 인적 사항만 포함</span>
                            </Button>
                            <Button
                                variant="outline"
                                className="h-20 flex flex-col items-center justify-center gap-1 border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50"
                                onClick={() => confirmExport(true)}
                            >
                                <span className="font-bold text-base text-indigo-700">상세 정보 포함</span>
                                <span className="text-[11px] text-indigo-500">생활지도, 그룹, 관계 제약, 고정 배정 등 상세 옵션 포함</span>
                            </Button>
                        </div>
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)}>취소</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 배정 초기화 확인 다이얼로그 */}
            <Dialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl flex items-center gap-2 text-orange-600">
                            🗑️ 반편성 초기화
                        </DialogTitle>
                        <DialogDescription>
                            현재 반편성 결과를 초기화합니다.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-3">
                        <p className="text-sm text-slate-700">
                            모든 학생의 <strong>배정된 반</strong>이 초기화되어 <strong>미배정</strong> 상태가 됩니다.
                        </p>
                        <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 border-dashed">
                            💡 Step 2에서 설정한 모든 조건(관계, 그룹, 전출 등)은 그대로 유지됩니다.
                        </p>
                    </div>
                    <div className="flex justify-end gap-3 pt-2 border-t">
                        <Button variant="outline" onClick={() => setIsResetConfirmOpen(false)}>취소</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                resetAssignments();
                                clearMovements();
                                setIsResetConfirmOpen(false);
                                toast.success('반편성이 초기화되었습니다.');
                            }}
                        >
                            초기화 실행
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 신규 배정 확인 다이얼로그 */}
            <Dialog open={isNewConfirmOpen} onOpenChange={setIsNewConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-xl">처음부터 새로 배정할까요?</DialogTitle>
                        <DialogDescription>
                            지금 배정과 변경 이력이 새 결과로 바뀝니다. 직접 바꾼 내용도 함께 사라집니다.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-200 border-dashed">
                        어긴 조건만 고치려면 취소한 뒤 현재 배정 수정을 고르세요. 새로 배정한 뒤에도 되돌리기로 돌아올 수 있습니다.
                    </p>
                    <div className="flex justify-end gap-3 pt-2 border-t">
                        <Button variant="outline" onClick={() => setIsNewConfirmOpen(false)}>취소</Button>
                        <Button
                            onClick={() => {
                                setIsNewConfirmOpen(false);
                                runAssign();
                            }}
                        >
                            새로 배정
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <div className="flex justify-between mt-8 border-t pt-6">
                <Button
                    variant="outline"
                    size="lg"
                    onClick={onBack}
                    className="rounded-xl border-slate-200 hover:bg-slate-50 hover:text-indigo-600"
                >
                    ← 이전: 조건 설정
                </Button>
            </div>
        </div >
    );
}
