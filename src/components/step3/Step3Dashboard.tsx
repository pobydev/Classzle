'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
    ArrowClockwise,
    ArrowCounterClockwise,
    CaretDown,
    ChartBar,
    DownloadSimple,
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
import { assignmentNotices } from '@/lib/assignment/messages';
import { calculateClassStats } from '@/lib/stats';
import { validateMove, validateSwap } from '@/lib/validation';
import { exportToExcel, studentsLeftOutOfExport } from '@/lib/excel';
import type { RecommendMode } from '@/lib/recommend';
import { resolveClassIndex, sameClass } from '@/lib/assignment/problem';
import type { AssignmentChange, NumberingMethod, Student, Violation } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HelpTip } from '@/components/common/HelpTip';
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
import { MoreMenu, MoreMenuItem } from '@/components/common/MoreMenu';
import { AssignmentReportDialog } from './AssignmentReportDialog';
import { BoardMarksHelp } from './BoardPanel';
import { AssignmentBoard, type BoardSize, type BoardView } from './AssignmentBoard';
import { BalanceTable } from './BalanceStats';
import { ConditionsStatus } from './ConditionsStatus';

interface Step3DashboardProps {
    // 상세 배치 조정 탭이 열리고 닫힐 때 알립니다. 앱 틀이 사이드바를 접는 데 씁니다.
    onBoardActiveChange?: (active: boolean) => void;
}

type DashboardTab = 'stats' | 'board';

const BOARD_SIZE_KEY = 'classzle-board-size';
// 추천 방식도 이 컴퓨터의 앱 설정에 기억합니다. 저장 파일에는 넣지 않습니다.
const RECOMMEND_MODE_KEY = 'classzle-recommend-mode';

function readRecommendMode(): RecommendMode {
    try {
        return localStorage.getItem(RECOMMEND_MODE_KEY) === 'score' ? 'score' : 'guidance';
    } catch {
        return 'guidance';
    }
}
// '성적 표시'도 다시 켜도 그대로입니다. '골라 보기'의 반 구성은 그때그때 고르므로 기억하지 않습니다.
const SHOW_SCORES_KEY = 'classzle-show-scores';

function readShowScores(): boolean {
    try {
        return localStorage.getItem(SHOW_SCORES_KEY) !== 'off';
    } catch {
        return true;
    }
}

const MIN_PICKED = 2;
const MAX_PICKED = 4;

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

export default function Step3Dashboard({ onBoardActiveChange }: Step3DashboardProps) {
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
    // 반이 이미 정해진 명단(양식 B나 배정한 뒤)이면 '현재 배정 수정'을 먼저 골라 둡니다.
    const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>(() =>
        useClasszleStore.getState().students.some((s) => s.assigned_class) ? 'optimize' : 'new');

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    // 비교 중인 상대입니다. 보기 방식과 두 칸의 반은 그대로 두므로 취소하면 있던 자리로 돌아갑니다.
    const [comparePartnerId, setComparePartnerId] = useState<string | null>(null);
    // 조건을 어기는 변경을 교사에게 확인받는 동안 들고 있습니다. 교환이면 s2Id, 반으로 옮기기면 className이 있습니다.
    const [pendingSwap, setPendingSwap] = useState<{ s1Id: string, s2Id?: string, className?: string, violations: Violation[] } | null>(null);

    const [view, setView] = useState<BoardView>('compact');
    // 골라 보기에서 나란히 볼 반입니다. 2반부터 4반까지입니다.
    const [pickedClasses, setPickedClasses] = useState<string[]>(['1반', '2반']);
    const [searchText, setSearchText] = useState('');
    const [showScores, setShowScoresState] = useState(readShowScores);
    const setShowScores = (next: boolean) => {
        setShowScoresState(next);
        try {
            if (next) localStorage.removeItem(SHOW_SCORES_KEY);
            else localStorage.setItem(SHOW_SCORES_KEY, 'off');
        } catch {
            // 기억하지 못해도 지금 화면에는 그대로 씁니다.
        }
    };
    const [boardSize, setBoardSize] = useState<BoardSize>(readBoardSize);
    const [recommendMode, setRecommendMode] = useState<RecommendMode>(readRecommendMode);
    const query = searchText.trim();

    const hasAssignments = students.some((s) => s.assigned_class);

    // 수정과 균형 조정은 배정이 있어야 고를 수 있습니다. 배정이 모두 사라지면 신규로 돌립니다.
    useEffect(() => {
        if (!hasAssignments) setAssignmentMode('new');
    }, [hasAssignments]);

    const classNames = useMemo(
        () => Array.from({ length: settings.classCount }, (_, i) => `${i + 1}반`),
        [settings.classCount]
    );
    // 학급 수가 줄어 없는 반이 들어 있으면 빼고, 두 칸보다 적으면 남은 반으로 채웁니다.
    const shownPicked = useMemo(() => {
        const kept = [...new Set(pickedClasses)].filter((name) => classNames.includes(name)).slice(0, MAX_PICKED);
        for (const name of classNames) {
            if (kept.length >= Math.min(MIN_PICKED, classNames.length)) break;
            if (!kept.includes(name)) kept.push(name);
        }
        return kept;
    }, [pickedClasses, classNames]);

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

    // 보드에서 Esc를 누르면 비교 중이면 비교를 닫고, 아니면 고른 학생을 놓습니다.
    // 열린 창이나 메뉴가 있거나 글자를 쓰는 중이면 그쪽에 맡깁니다.
    const handleEscape = useStableCallback((event: KeyboardEvent) => {
        if (event.key !== 'Escape' || event.defaultPrevented || !boardActive) return;
        if (!selectedStudentId && !comparePartnerId) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
        if (document.querySelector('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]')) return;
        event.preventDefault();
        if (comparePartnerId) setComparePartnerId(null);
        else setSelectedStudentId(null);
    });
    useEffect(() => {
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [handleEscape]);

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
                if (oldStudent && !sameClass(oldStudent.assigned_class, newStudent.assigned_class)) {
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
            // 수정과 균형 조정에서 옮긴 학생이 없으면 되돌릴 것도 없으므로 되돌리기 칸을 쌓지 않습니다.
            if (assignmentMode === 'new' || result.moved > 0) {
                applyAssignment(result.students, assignmentMode === 'new' ? [] : changes, assignmentMode === 'new');
            }
            setIsAssigning(false);

            // 리포트는 교사가 누를 때만 엽니다. 옮긴 인원 알림은 되돌리기 버튼과 함께 오래 둡니다.
            assignmentNotices(result.moved, result.violations.length, assignmentMode).forEach((notice) => {
                if (notice.undoable) {
                    toast[notice.kind](notice.text, {
                        duration: 12000,
                        action: { label: '되돌리기', onClick: handleUndo },
                    });
                } else {
                    toast[notice.kind](notice.text);
                }
            });
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

    // 반 이름을 누르면 골라 보기로 그 반을 엽니다. 이미 보고 있는 반이면 칸은 그대로 둡니다.
    const openInTwoClassView = (className: string) => {
        if (!shownPicked.includes(className)) setPickedClasses([className, ...shownPicked].slice(0, shownPicked.length));
        setView('two');
    };

    const handleHeadClick = useStableCallback((className: string) => {
        const selected = selectedStudentId ? students.find((s) => s.id === selectedStudentId) : null;
        if (selected) {
            // 지금 있는 반을 누르면 아무 일도 하지 않습니다. 같은 반으로 옮긴 이력을 남기지 않습니다.
            if (!sameClass(selected.assigned_class, className)) moveSelectedTo(className);
            return;
        }
        if (view === 'compact') openInTwoClassView(className);
    });

    const handleOpenClassFromStats = (className: string) => {
        openInTwoClassView(className);
        setTab('board');
        clearSelection();
    };

    const handlePickedChange = (next: string[]) => setPickedClasses(next.slice(0, MAX_PICKED));

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

    const handleRecommendModeChange = (next: RecommendMode) => {
        setRecommendMode(next);
        setComparePartnerId(null);
        try {
            localStorage.setItem(RECOMMEND_MODE_KEY, next);
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
            toast.success("조건을 어기는 변경을 적용했습니다. 위쪽 '지키지 못한 조건'을 누르면 목록이 나옵니다.");
        }
    };

    const seg = (active: boolean) =>
        `h-[26px] cursor-pointer rounded-input px-3 text-small transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${active ? 'bg-card font-bold text-accent-ink shadow-card' : 'text-soft hover:text-ink'}`;
    const shownView: BoardView = comparePartnerId ? 'two' : view;

    return (
        <div className="h-full">
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
                className={`gap-0 ${boardActive ? 'h-full' : ''}`}
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
                                    전체 반
                                </button>
                                <button type="button" aria-pressed={shownView === 'two'} className={seg(shownView === 'two')} onClick={() => handleViewChange('two')}>
                                    골라 보기
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
                            <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="data-[state=open]:bg-wash">
                                        보기<CaretDown aria-hidden="true" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start">
                                    <DropdownMenuCheckboxItem checked={showScores} onCheckedChange={(v) => setShowScores(v === true)} onSelect={(e) => e.preventDefault()}>
                                        성적 표시
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel>글자 크기 (전체 반)</DropdownMenuLabel>
                                    <DropdownMenuRadioGroup value={boardSize} onValueChange={(v) => handleBoardSizeChange(v as BoardSize)}>
                                        <DropdownMenuRadioItem value="auto" onSelect={(e) => e.preventDefault()}>
                                            <span className="flex flex-col">
                                                자동
                                                <span className="text-caption text-soft">스크롤 없이 들어가는 가장 큰 글자</span>
                                            </span>
                                        </DropdownMenuRadioItem>
                                        <DropdownMenuRadioItem value="large" onSelect={(e) => e.preventDefault()}>
                                            <span className="flex flex-col">
                                                크게
                                                <span className="text-caption text-soft">16px로 넉넉하게, 세로로 스크롤</span>
                                            </span>
                                        </DropdownMenuRadioItem>
                                    </DropdownMenuRadioGroup>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            {/* 보드 표시의 뜻을 모아 둔 상자입니다. 늘 보이는 범례 대신 둡니다. */}
                            <HelpTip label="보드 표시" width={380}>
                                <BoardMarksHelp groups={groups} />
                            </HelpTip>
                            <Button variant="outline" size="sm" onClick={handleUndo} disabled={undoStack.length === 0}>
                                <ArrowCounterClockwise />되돌리기
                            </Button>
                            {/* 통계 탭과 같은 이름과 같은 목록을 씁니다. */}
                            <span role="status" data-board-status className="ml-auto flex items-center gap-2 whitespace-nowrap">
                                <ConditionsStatus hasAssignments={hasAssignments} violations={violations} />
                                <span className="text-small text-soft">전체 {students.length}명</span>
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
                        pickedClasses={shownPicked}
                        onPickedChange={handlePickedChange}
                        query={query}
                        showScores={showScores}
                        recommendMode={recommendMode}
                        onRecommendModeChange={handleRecommendModeChange}
                        selectedId={selectedStudentId}
                        comparePartnerId={comparePartnerId}
                        onChipClick={handleChipClick}
                        onHeadClick={handleHeadClick}
                        onSelect={handleSelect}
                        onCompare={setComparePartnerId}
                        onConfirmCompare={confirmCompare}
                        onCancelCompare={() => setComparePartnerId(null)}
                        onUnassign={() => moveSelectedTo(null)}
                        onOpenClass={(className) => {
                            clearSelection();
                            openInTwoClassView(className);
                        }}
                    />
                </TabsContent>

                <TabsContent value="stats" className="space-y-4 p-4">
                    {/* 배정 방식과 실행 */}
                    <section className="rounded-card bg-card p-4 shadow-card">
                        <div className="flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <p className="mb-1 flex items-center gap-1 px-1 text-caption font-semibold text-soft">
                                    배정 방식
                                    <HelpTip label="배정 방식" width={380}>
                                        <p><strong>신규 배정</strong>: 남녀 각각 성적순으로 한 명씩 돌아가며 나눈 뒤 모든 조건(고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀, 생활지도, 성적)을 맞춰 처음부터 새로 편성합니다.</p>
                                        <p><strong>현재 배정 수정</strong>: 지금 배정을 유지하고 어긴 조건(고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀)만 고칩니다. 옮기는 학생을 가장 적게 합니다.</p>
                                        <p><strong>균형 조정</strong>: 지금 배정에서 시작해 어긴 조건을 고치고 성적과 생활지도 균형까지 맞춥니다. 수정보다 많은 학생을 옮길 수 있습니다.</p>
                                        <p className="text-soft">수정과 균형 조정은 배정이 있어야 고를 수 있습니다.</p>
                                    </HelpTip>
                                </p>
                                <Tabs value={assignmentMode} onValueChange={(v) => setAssignmentMode(v as AssignmentMode)} className="w-[420px] max-w-full">
                                    <TabsList className="grid h-[38px] w-full grid-cols-3">
                                        <TabsTrigger value="new"><Rocket />신규 배정</TabsTrigger>
                                        <TabsTrigger value="optimize" disabled={!hasAssignments}><Wrench />현재 배정 수정</TabsTrigger>
                                        <TabsTrigger value="balance" disabled={!hasAssignments}><Scales />균형 조정</TabsTrigger>
                                    </TabsList>
                                </Tabs>
                            </div>

                            <div className="flex flex-col items-end gap-1.5">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    <Button onClick={handleAssign} disabled={isAssigning || students.length === 0}>
                                        {hasAssignments ? <ArrowClockwise /> : <Rocket />}
                                        {isAssigning ? '배정 중...' : '배정 실행'}
                                    </Button>
                                    <Button variant="outline" onClick={handleUndo} disabled={undoStack.length === 0}>
                                        <ArrowCounterClockwise />되돌리기
                                    </Button>
                                    <span className="mx-1 h-8 w-px bg-line" aria-hidden />
                                    <Button variant="outline" onClick={() => setIsReportOpen(true)} disabled={!hasAssignments}>
                                        <ChartBar />배정 리포트
                                    </Button>
                                    <Button variant="outline" onClick={() => setIsExportDialogOpen(true)} disabled={!hasAssignments}>
                                        <DownloadSimple />배정 결과 엑셀
                                    </Button>
                                    <MoreMenu label="반 편성 메뉴" size="icon">
                                        <MoreMenuItem danger disabled={!hasAssignments} onSelect={() => setIsResetConfirmOpen(true)}>
                                            <Trash aria-hidden="true" />배정 초기화
                                        </MoreMenuItem>
                                    </MoreMenu>
                                </div>
                                <ConditionsStatus hasAssignments={hasAssignments} violations={violations} />
                            </div>
                        </div>
                    </section>

                    <BalanceTable
                        students={students}
                        groups={groups}
                        classCount={settings.classCount}
                        hasAssignments={hasAssignments}
                        onOpenClass={handleOpenClassFromStats}
                    />
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
                        <DialogDescription>번호 매기는 방식과 넣을 정보를 고릅니다.</DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center justify-between gap-3 rounded-button bg-canvas px-3 py-2">
                        <label htmlFor="numbering-method" className="text-small font-semibold text-ink">번호 부여 방식</label>
                        <Select
                            value={settings.numberingMethod}
                            onValueChange={(v) => setNumberingMethod(v as NumberingMethod)}
                        >
                            <SelectTrigger id="numbering-method" size="sm" aria-label="번호 부여 방식" className="w-[160px] bg-card text-small">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mixed">성별 혼합</SelectItem>
                                <SelectItem value="maleFirst">남학생 → 여학생</SelectItem>
                                <SelectItem value="femaleFirst">여학생 → 남학생</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
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
                            <span className="text-caption font-normal text-soft">배정 학년, 반, 번호와 이름, 성별, 이전 반과 번호, 성적, 반 평균, 전출 표시</span>
                        </Button>
                        <Button
                            variant="outline"
                            className="h-auto flex-col gap-1 py-3 whitespace-normal"
                            onClick={() => confirmExport(true)}
                        >
                            <span className="text-body font-bold text-ink">상세 정보 포함</span>
                            <span className="text-caption font-normal text-soft">기본 내용에 더해 생활지도, 그룹 분산, 분리 배정, 함께 배정, 고정 배정, 비고</span>
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
