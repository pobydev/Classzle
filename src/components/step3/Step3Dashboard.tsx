'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowClockwise,
    ArrowCounterClockwise,
    ArrowLeft,
    ChartBar,
    CheckCircle,
    DownloadSimple,
    Lightbulb,
    MagnifyingGlass,
    Rocket,
    Rows,
    Scales,
    Trash,
    WarningCircle,
    Wrench,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useClasszleStore } from '@/lib/store';
import { assignStudents, collectViolations, type AssignmentMode } from '@/lib/assignment';
import { calculateClassStats } from '@/lib/stats';
import { validateMove, validateSwap } from '@/lib/validation';
import { exportToExcel, studentsLeftOutOfExport } from '@/lib/excel';
import { resolveClassIndex } from '@/lib/assignment/problem';
import type { AssignmentChange, NumberingMethod, Student, Violation } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { AssignmentReportDialog } from './AssignmentReportDialog';
import { AssignmentBoard, type BoardSize, type BoardView } from './AssignmentBoard';
import { BalanceDetailBar, BalanceTable, CriteriaAndStatus } from './BalanceStats';

interface Step3DashboardProps {
    onBack: () => void;
    // 상세 배치 조정 탭이 열리고 닫힐 때 알립니다. 앱 틀이 사이드바를 접는 데 씁니다.
    onBoardActiveChange?: (active: boolean) => void;
}

type DashboardTab = 'stats' | 'board';

const BOARD_SIZE_KEY = 'classzle-board-size';

function readBoardSize(): BoardSize {
    try {
        return localStorage.getItem(BOARD_SIZE_KEY) === 'large' ? 'large' : 'auto';
    } catch {
        return 'auto';
    }
}

// 칩이 다시 그려지지 않도록 함수의 정체성을 고정하고, 부를 때는 최신 내용을 씁니다.
function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result) {
    const latest = useRef(callback);
    useLayoutEffect(() => {
        latest.current = callback;
    });
    return useCallback((...args: Args) => latest.current(...args), []);
}

export default function Step3Dashboard({ onBack, onBoardActiveChange }: Step3DashboardProps) {
    const {
        students, groups, settings,
        applyAssignment, undoLastChange, undoStack,
        assignStudentToClass, swapStudents,
        movementHistory, clearMovements,
        setNumberingMethod, resetAssignments
    } = useClasszleStore();
    const [tab, setTab] = useState<DashboardTab>('stats');
    const [isAssigning, setIsAssigning] = useState(false);
    const [isNewConfirmOpen, setIsNewConfirmOpen] = useState(false);
    const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('new');

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    // 비교 중인 상대입니다. 보기 방식과 두 칸의 반은 그대로 두므로 취소하면 있던 자리로 돌아갑니다.
    const [comparePartnerId, setComparePartnerId] = useState<string | null>(null);
    // 조건을 어기는 변경을 교사에게 확인받는 동안 들고 있습니다. 교환이면 s2Id, 반으로 옮기기면 className이 있습니다.
    const [pendingSwap, setPendingSwap] = useState<{ s1Id: string, s2Id?: string, className?: string, violations: Violation[] } | null>(null);

    const [view, setView] = useState<BoardView>('compact');
    const [twoClasses, setTwoClasses] = useState<[string, string]>(['1반', '2반']);
    const [searchText, setSearchText] = useState('');
    const [showScores, setShowScores] = useState(true);
    const [boardSize, setBoardSize] = useState<BoardSize>(readBoardSize);
    const query = searchText.trim();

    const hasAssignments = students.some((s) => s.assigned_class);

    const classNames = useMemo(
        () => Array.from({ length: settings.classCount }, (_, i) => `${i + 1}반`),
        [settings.classCount]
    );

    // 수동으로 바꾼 뒤에도 맞도록 지금 배정에서 바로 계산합니다.
    const violations = useMemo(
        () => (hasAssignments ? collectViolations(students, settings.classCount, groups) : []),
        [hasAssignments, students, settings.classCount, groups]
    );
    const classStats = useMemo(
        () => calculateClassStats(students, settings.classCount, groups),
        [students, settings.classCount, groups]
    );

    const boardActive = tab === 'board';
    useEffect(() => {
        onBoardActiveChange?.(boardActive);
    }, [boardActive, onBoardActiveChange]);
    const notifyBoardClosed = useStableCallback(() => onBoardActiveChange?.(false));
    useEffect(() => () => notifyBoardClosed(), [notifyBoardClosed]);

    const clearSelection = () => {
        setSelectedStudentId(null);
        setComparePartnerId(null);
    };

    const handleTabChange = (value: string) => {
        setTab(value as DashboardTab);
        clearSelection();
    };

    const handleUndo = () => {
        undoLastChange();
        clearSelection();
        toast.success('직전 변경을 되돌렸습니다.');
    };

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

    const leftOutOfExport = useMemo(
        () => (isExportDialogOpen ? studentsLeftOutOfExport(students, settings.classCount) : []),
        [isExportDialogOpen, students, settings.classCount]
    );

    const confirmExport = (includeDetails: boolean) => {
        const timestamp = new Date().toISOString().split('T')[0];
        exportToExcel(students, settings.classCount, `반편성_결과_${timestamp}.xlsx`, {
            includeDetails,
            groups,
            numberingMethod: settings.numberingMethod
        });
        setIsExportDialogOpen(false);
    };

    const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? '';

    // 칩을 눌러 바꾸는 길과 비교 화면의 바꾸기 버튼이 모두 이 길을 지납니다.
    const trySwap = (firstId: string, secondId: string) => {
        const swapViolations = validateSwap(firstId, secondId, students, settings.classCount, groups);
        if (swapViolations.length > 0) {
            setPendingSwap({ s1Id: firstId, s2Id: secondId, violations: swapViolations });
            return;
        }
        swapStudents(firstId, secondId);
        clearSelection();
        toast.success(`${nameOf(firstId)} 학생과 ${nameOf(secondId)} 학생을 바꿨습니다.`);
    };

    const handleChipClick = useStableCallback((id: string) => {
        if (!selectedStudentId) {
            setSelectedStudentId(id);
            return;
        }
        if (selectedStudentId === id) {
            clearSelection();
            return;
        }
        const first = students.find((s) => s.id === selectedStudentId);
        const second = students.find((s) => s.id === id);
        if (!first || !second) return;
        const firstClass = resolveClassIndex(first.assigned_class, classNames);
        const secondClass = resolveClassIndex(second.assigned_class, classNames);
        if (firstClass >= 0 && secondClass >= 0 && firstClass !== secondClass) {
            trySwap(first.id, second.id);
        } else {
            // 같은 반 학생이나 미배정 학생을 누르면 고른 학생만 바뀝니다.
            setSelectedStudentId(id);
            if (secondClass < 0) setComparePartnerId(null);
        }
    });

    const moveSelectedTo = (className: string | null) => {
        if (!selectedStudentId) return;
        // 미배정으로 빼는 것은 임시로 두는 일이라 묻지 않습니다.
        if (className) {
            const moveViolations = validateMove(selectedStudentId, className, students, settings.classCount, groups);
            if (moveViolations.length > 0) {
                setPendingSwap({ s1Id: selectedStudentId, className, violations: moveViolations });
                return;
            }
        }
        const name = nameOf(selectedStudentId);
        assignStudentToClass(selectedStudentId, className);
        clearSelection();
        toast.success(className ? `${name} 학생을 ${className}으로 옮겼습니다.` : `${name} 학생을 미배정으로 뺐습니다.`);
    };

    const openInTwoClassView = (className: string) => {
        setTwoClasses(([left, right]) => [className, left === className ? right : left]);
        setView('two');
    };

    const handleHeadClick = useStableCallback((className: string) => {
        const selected = selectedStudentId ? students.find((s) => s.id === selectedStudentId) : null;
        if (selected) {
            // 지금 있는 반을 누르면 아무 일도 하지 않습니다. 같은 반으로 옮긴 이력을 남기지 않습니다.
            if (selected.assigned_class !== className) moveSelectedTo(className);
            return;
        }
        if (view === 'compact') openInTwoClassView(className);
    });

    const handleOpenClassFromStats = (className: string) => {
        openInTwoClassView(className);
        setTab('board');
        clearSelection();
    };

    const handleTwoClassChange = (index: 0 | 1, className: string) => {
        setTwoClasses(([left, right]) => (index === 0 ? [className, right] : [left, className]));
    };

    const handleViewChange = (next: BoardView) => {
        setComparePartnerId(null);
        setView(next);
    };

    const handleBoardSizeChange = (next: BoardSize) => {
        setBoardSize(next);
        try {
            localStorage.setItem(BOARD_SIZE_KEY, next);
        } catch {
            // 저장하지 못해도 지금 창에서는 그대로 씁니다.
        }
    };

    const handleSelect = useStableCallback((id: string | null) => {
        setSelectedStudentId(id);
        setComparePartnerId(null);
    });

    const confirmCompare = () => {
        if (selectedStudentId && comparePartnerId) trySwap(selectedStudentId, comparePartnerId);
    };

    const confirmSwap = () => {
        if (pendingSwap) {
            if (pendingSwap.s2Id) {
                swapStudents(pendingSwap.s1Id, pendingSwap.s2Id);
            } else if (pendingSwap.className) {
                assignStudentToClass(pendingSwap.s1Id, pendingSwap.className);
            }
            setPendingSwap(null);
            clearSelection();
            toast.success('조건을 어기는 변경을 적용했습니다. 조건 준수 현황에 표시됩니다.');
        }
    };

    const seg = (active: boolean) =>
        `h-[26px] cursor-pointer rounded-input px-3 text-small transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${active ? 'bg-card font-bold text-accent-ink shadow-card' : 'text-soft hover:text-ink'}`;
    const shownView: BoardView = comparePartnerId ? 'two' : view;

    return (
        <div>
            <AssignmentReportDialog
                open={isReportOpen}
                onOpenChange={setIsReportOpen}
                students={students}
                groups={groups}
                history={movementHistory}
            />

            <Tabs
                value={tab}
                onValueChange={handleTabChange}
                className={`gap-0 ${boardActive ? 'h-[calc(100vh-var(--shell-top,0px))]' : ''}`}
            >
                <div data-step3-toolbar className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-card px-3 py-2">
                    <TabsList className="h-8">
                        <TabsTrigger value="stats" className="text-small">
                            <ChartBar />학급별 균형 통계
                        </TabsTrigger>
                        <TabsTrigger value="board" className="text-small">
                            <Rows />상세 배치 조정
                        </TabsTrigger>
                    </TabsList>

                    {boardActive && (
                        <>
                            <div role="group" aria-label="보기 방식" className="inline-flex gap-0.5 rounded-button bg-surface-hover p-[3px]">
                                <button type="button" aria-pressed={shownView === 'compact'} className={seg(shownView === 'compact')} onClick={() => handleViewChange('compact')}>
                                    {settings.classCount}칸 압축
                                </button>
                                <button type="button" aria-pressed={shownView === 'two'} className={seg(shownView === 'two')} onClick={() => handleViewChange('two')}>
                                    두 반 크게
                                </button>
                            </div>
                            <div className="relative w-[170px]">
                                <MagnifyingGlass size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-soft" />
                                <Input
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    placeholder="학생 이름 찾기"
                                    aria-label="학생 이름 찾기"
                                    className="h-8 pl-8 text-small"
                                />
                            </div>
                            <label className="flex cursor-pointer items-center gap-1.5 text-small text-ink">
                                <Switch checked={showScores} onCheckedChange={setShowScores} aria-label="성적 표시" />
                                성적 표시
                            </label>
                            <div className="flex items-center gap-1.5">
                                <span className="text-small whitespace-nowrap text-soft">글자</span>
                                <div role="group" aria-label="글자 크기" className="inline-flex gap-0.5 rounded-button bg-surface-hover p-[3px]">
                                    <button type="button" title="스크롤 없이 들어가는 가장 큰 글자로 맞춥니다" aria-pressed={boardSize === 'auto'} className={seg(boardSize === 'auto')} onClick={() => handleBoardSizeChange('auto')}>자동</button>
                                    <button type="button" title="16px로 넉넉하게 보고 세로로 스크롤합니다" aria-pressed={boardSize === 'large'} className={seg(boardSize === 'large')} onClick={() => handleBoardSizeChange('large')}>크게</button>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoStack.length === 0}>
                                <ArrowCounterClockwise />되돌리기
                            </Button>
                            <div className="flex items-center gap-1.5">
                                <span className="text-small whitespace-nowrap text-soft">번호 부여 방식</span>
                                <Select
                                    value={settings.numberingMethod}
                                    onValueChange={(v) => setNumberingMethod(v as NumberingMethod)}
                                >
                                    <SelectTrigger size="sm" aria-label="번호 부여 방식" className="w-[136px] text-small">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="mixed">성별 혼합</SelectItem>
                                        <SelectItem value="maleFirst">남학생 → 여학생</SelectItem>
                                        <SelectItem value="femaleFirst">여학생 → 남학생</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <span role="status" data-board-status className={`ml-auto flex items-center gap-1 text-small font-semibold whitespace-nowrap ${violations.length > 0 ? 'text-danger' : 'text-ink'}`}>
                                {violations.length > 0 ? <WarningCircle size={15} /> : <CheckCircle size={15} className="text-accent-ink" />}
                                조건 어김 {violations.length}건 · 전체 {students.length}명
                            </span>
                        </>
                    )}
                </div>

                <TabsContent value="board" className="flex min-h-0 flex-1 data-[state=inactive]:hidden">
                    <AssignmentBoard
                        students={students}
                        groups={groups}
                        classNames={classNames}
                        numberingMethod={settings.numberingMethod || 'mixed'}
                        classStats={classStats}
                        violations={violations}
                        hasAssignments={hasAssignments}
                        view={view}
                        size={boardSize}
                        twoClasses={twoClasses}
                        onTwoClassChange={handleTwoClassChange}
                        query={query}
                        showScores={showScores}
                        selectedId={selectedStudentId}
                        comparePartnerId={comparePartnerId}
                        onChipClick={handleChipClick}
                        onHeadClick={handleHeadClick}
                        onSelect={handleSelect}
                        onCompare={setComparePartnerId}
                        onConfirmCompare={confirmCompare}
                        onCancelCompare={() => setComparePartnerId(null)}
                        onUnassign={() => moveSelectedTo(null)}
                    />
                </TabsContent>

                <TabsContent value="stats" className="space-y-4 p-4">
                    {/* 배정 모드 */}
                    <section className="rounded-card bg-card p-4 shadow-card">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <p className="mb-1 px-1 text-caption font-semibold text-soft">배정 모드 선택</p>
                                <Tabs value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as AssignmentMode)} className="w-[420px] max-w-full">
                                    <TabsList className="grid h-10 w-full grid-cols-3">
                                        <TabsTrigger value="new"><Rocket />신규 배정</TabsTrigger>
                                        <TabsTrigger value="optimize" disabled={!hasAssignments}><Wrench />현재 배정 수정</TabsTrigger>
                                        <TabsTrigger value="balance" disabled={!hasAssignments}><Scales />균형 조정</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button onClick={handleAssign} disabled={isAssigning || students.length === 0}>
                                    {hasAssignments ? <ArrowClockwise /> : <Rocket />}
                                    {isAssigning ? '배정 중...' : hasAssignments ? '배정 실행' : '반편성 시작'}
                                </Button>
                                <Button variant="destructive" onClick={() => setIsResetConfirmOpen(true)} disabled={!hasAssignments}>
                                    <Trash />배정 초기화
                                </Button>
                                <Button variant="outline" onClick={handleUndo} disabled={undoStack.length === 0}>
                                    <ArrowCounterClockwise />되돌리기
                                </Button>
                                <span className="mx-1 h-8 w-px bg-line" aria-hidden />
                                <Button variant="outline" onClick={() => setIsReportOpen(true)} disabled={students.length === 0}>
                                    <ChartBar />배정 리포트
                                </Button>
                                <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} disabled={!hasAssignments}>
                                    <DownloadSimple />배정 결과 엑셀
                                </Button>
                            </div>
                        </div>

                        <div className="mt-3 flex items-start gap-2 rounded-button bg-wash px-3 py-2 text-small text-accent-ink">
                            <Lightbulb size={16} className="mt-0.5 shrink-0" />
                            {assignmentMode === 'new' ? (
                                <p><strong>신규 배정:</strong> 남녀 각각 성적순(S자)으로 나눈 뒤 모든 조건(고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀, 생활지도, 성적)을 맞춰 처음부터 새로 편성합니다.</p>
                            ) : assignmentMode === 'optimize' ? (
                                <p><strong>현재 배정 수정:</strong> 지금 배정을 유지하고 어긴 조건(고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀)만 고칩니다. 옮기는 학생을 가장 적게 합니다.</p>
                            ) : (
                                <p><strong>균형 조정:</strong> 지금 배정에서 시작해 어긴 조건을 고치고 성적과 생활지도 균형까지 맞춥니다. 수정보다 많은 학생을 옮길 수 있습니다.</p>
                            )}
                        </div>
                    </section>

                    <BalanceDetailBar students={students} groups={groups} classCount={settings.classCount} hasAssignments={hasAssignments} />
                    <BalanceTable students={students} groups={groups} classCount={settings.classCount} onOpenClass={handleOpenClassFromStats} />
                    <CriteriaAndStatus hasAssignments={hasAssignments} violations={violations} />

                    <div className="border-t border-line pt-4">
                        <Button variant="outline" onClick={onBack}>
                            <ArrowLeft />이전: 조건 설정
                        </Button>
                    </div>
                </TabsContent>
            </Tabs>

            {/* 조건을 어기는 변경 경고 */}
            <Dialog open={!!pendingSwap} onOpenChange={(open) => !open && setPendingSwap(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-title-sm font-bold text-danger">
                            <WarningCircle size={22} />조건 위반 알림
                        </DialogTitle>
                        <DialogDescription>옮기면 새로 어기게 되는 조건을 확인하세요.</DialogDescription>
                    </DialogHeader>
                    <p className="text-body font-medium text-ink">
                        {pendingSwap?.s2Id ? '두 학생을 바꾸면' : '이 반으로 옮기면'} 다음 조건을 어깁니다.
                    </p>
                    <ul className="max-h-[200px] space-y-2 overflow-y-auto" data-warning-list>
                        {pendingSwap?.violations.map((v, i) => (
                            <li key={i} className="rounded-button bg-danger-wash p-3 text-small text-ink">{v.message}</li>
                        ))}
                    </ul>
                    <p className="text-body text-soft">알고도 강제로 바꾸시겠습니까?</p>
                    <div className="flex justify-end gap-2 border-t border-line pt-4">
                        <Button variant="outline" onClick={() => setPendingSwap(null)}>취소</Button>
                        <Button variant="destructive" onClick={confirmSwap}>강제 변경 실행</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 엑셀 내보내기 옵션 */}
            <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-title-sm font-bold">
                            <DownloadSimple size={22} className="text-brand" />배정 결과 엑셀 내보내기
                        </DialogTitle>
                        <DialogDescription>엑셀 파일에 넣을 정보 수준을 고릅니다.</DialogDescription>
                    </DialogHeader>
                    {leftOutOfExport.length > 0 && (
                        <div data-export-left-out className="rounded-button bg-danger-wash p-3 text-small text-ink">
                            <p className="font-semibold">반이 없는 학생 {leftOutOfExport.length}명은 결과 파일에 들어가지 않습니다.</p>
                            <p className="mt-1 max-h-24 overflow-y-auto text-caption">{leftOutOfExport.map((s) => s.name).join(', ')}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-3">
                        <Button
                            variant="outline"
                            className="h-auto flex-col gap-1 py-3 whitespace-normal"
                            onClick={() => confirmExport(false)}
                        >
                            <span className="text-body font-bold text-ink">기본 정보만 출력</span>
                            <span className="text-caption font-normal text-soft">배정 결과(학년, 반, 번호), 성적, 기본 인적 사항</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="h-auto flex-col gap-1 py-3 whitespace-normal"
                            onClick={() => confirmExport(true)}
                        >
                            <span className="text-body font-bold text-ink">상세 정보 포함</span>
                            <span className="text-caption font-normal text-soft">배정 결과(학년, 반, 번호), 성적, 기본 인적 사항, 생활지도, 그룹 분산, 분리 배정, 함께 배정, 고정 배정</span>
                        </Button>
                    </div>
                    <div className="flex justify-end pt-2">
                        <Button variant="ghost" onClick={() => setIsExportDialogOpen(false)}>취소</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 배정 초기화 확인 */}
            <Dialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-title-sm font-bold">
                            <Trash size={22} className="text-danger" />반편성 초기화
                        </DialogTitle>
                        <DialogDescription>현재 반편성 결과를 초기화합니다.</DialogDescription>
                    </DialogHeader>
                    <p className="text-body text-ink">
                        모든 학생의 <strong>배정된 반</strong>이 초기화되어 <strong>미배정</strong> 상태가 됩니다.
                    </p>
                    <p className="rounded-button bg-wash p-3 text-small text-accent-ink">
                        조건 설정에서 정한 모든 조건(분리 배정, 함께 배정, 그룹 분산, 전출 예정 등)은 그대로 유지됩니다.
                    </p>
                    <div className="flex justify-end gap-2 border-t border-line pt-4">
                        <Button variant="outline" onClick={() => setIsResetConfirmOpen(false)}>취소</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                resetAssignments();
                                clearMovements();
                                clearSelection();
                                setIsResetConfirmOpen(false);
                                toast.success('반편성이 초기화되었습니다.');
                            }}
                        >
                            초기화 실행
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 신규 배정 확인 */}
            <Dialog open={isNewConfirmOpen} onOpenChange={setIsNewConfirmOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-title-sm font-bold">처음부터 새로 배정할까요?</DialogTitle>
                        <DialogDescription>
                            지금 배정과 변경 이력이 새 결과로 바뀝니다. 직접 바꾼 내용도 함께 사라집니다.
                        </DialogDescription>
                    </DialogHeader>
                    <p className="rounded-button bg-wash p-3 text-small text-accent-ink">
                        어긴 조건만 고치려면 취소한 뒤 현재 배정 수정을 고르세요. 새로 배정한 뒤에도 되돌리기로 돌아올 수 있습니다.
                    </p>
                    <div className="flex justify-end gap-2 border-t border-line pt-4">
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
        </div>
    );
}
