'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLineDown } from '@phosphor-icons/react';
import { sameClass } from '@/lib/assignment/problem';
import { calculateAttendanceNumbers } from '@/lib/numbering';
import { recommendSwaps } from '@/lib/recommend';
import type { calculateClassStats } from '@/lib/stats';
import { previewSwap } from '@/lib/swapPreview';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { CustomGroup, NumberingMethod, Student, Violation } from '@/types';
import { BoardPanel } from './BoardPanel';
import { buildRelations, groupStudentsByClass, matchesQuery, UNASSIGNED } from './boardModel';
import { StudentChip, type ChipRelation } from './StudentChip';

export type BoardView = 'compact' | 'two';
export type BoardSize = 'auto' | 'large';
type ClassStat = ReturnType<typeof calculateClassStats>[number];

interface ChipSize {
    font: number;
    sub: number;
    mark: number;
    height: number;
    head: number;
}

// 글자는 공통 8단계(13, 14, 16)에 맞춥니다. 큰 것부터 대 보고 스크롤 없이 들어가는 첫 크기를 씁니다.
const FIT_SIZES: ChipSize[] = [
    { font: 16, sub: 13, mark: 12, height: 32, head: 16 },
    { font: 14, sub: 12, mark: 11, height: 28, head: 14 },
    { font: 13, sub: 12, mark: 11, height: 25, head: 14 },
];
const LARGE_SIZE: ChipSize = { font: 16, sub: 13, mark: 12, height: 36, head: 16 };
// 아주 넓은 모니터에서 칩의 글자가 벌어지지 않게 칸 너비를 막습니다.
const COMPACT_COLUMN_MAX = 220;
const WIDE_COLUMN_MAX = 720;

function applyChipSize(element: HTMLElement, size: ChipSize) {
    element.style.setProperty('--chip-font', `${size.font}px`);
    element.style.setProperty('--chip-sub', `${size.sub}px`);
    element.style.setProperty('--chip-mark', `${size.mark}px`);
    element.style.setProperty('--chip-h', `${size.height}px`);
    element.style.setProperty('--chip-head', `${size.head}px`);
    element.dataset.chipFont = String(size.font);
    element.dataset.chipHeight = String(size.height);
}

interface AssignmentBoardProps {
    students: Student[];
    groups: CustomGroup[];
    classNames: string[];
    numberingMethod: NumberingMethod;
    classStats: ClassStat[];
    violations: Violation[];
    hasAssignments: boolean;
    view: BoardView;
    size: BoardSize;
    twoClasses: [string, string];
    onTwoClassChange: (index: 0 | 1, className: string) => void;
    query: string;
    showScores: boolean;
    selectedId: string | null;
    // 비교 중인 상대입니다. 있으면 두 칸이 고른 학생의 반과 상대의 반으로 정해집니다.
    comparePartnerId: string | null;
    onChipClick: (id: string) => void;
    onHeadClick: (className: string) => void;
    onSelect: (id: string | null) => void;
    onCompare: (partnerId: string) => void;
    onConfirmCompare: () => void;
    onCancelCompare: () => void;
    onUnassign: () => void;
}

function HeadFigures({ stat }: { stat?: ClassStat }) {
    if (!stat) return null;
    return (
        <span className="flex flex-wrap gap-x-1.5 text-caption text-soft">
            <span className="whitespace-nowrap">남{stat.stayMaleCount} 여{stat.stayFemaleCount}</span>
            <span className="whitespace-nowrap">평균 {stat.stayAverageScore}</span>
        </span>
    );
}

function HeadCount({ stat }: { stat?: ClassStat }) {
    if (!stat) return null;
    return (
        <>
            <span className="text-caption text-soft">{stat.stayCount}명</span>
            {stat.preTransferCount > 0 && (
                <span className="text-caption text-soft" title={`전출 예정 ${stat.preTransferCount}명은 뺀 인원입니다. 전출 전 ${stat.studentCount}명`}>
                    +전{stat.preTransferCount}
                </span>
            )}
        </>
    );
}

export function AssignmentBoard({
    students, groups, classNames, numberingMethod, classStats, violations, hasAssignments,
    view, size, twoClasses, onTwoClassChange, query, showScores, selectedId, comparePartnerId,
    onChipClick, onHeadClick, onSelect, onCompare, onConfirmCompare, onCancelCompare, onUnassign,
}: AssignmentBoardProps) {
    const classCount = classNames.length;
    const boardRef = useRef<HTMLDivElement>(null);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const compactScroll = useRef({ top: 0, left: 0 });
    const fitRef = useRef<(() => void) | null>(null);
    // 패널의 추천 줄에 마우스나 초점이 있는 상대입니다.
    const [hoveredPartnerId, setPreviewPartnerId] = useState<string | null>(null);

    const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
    const byClass = useMemo(
        () => groupStudentsByClass(students, classNames, numberingMethod),
        [students, classNames, numberingMethod],
    );
    const attendanceNumbers = useMemo(() => {
        const numbers: Record<string, number> = {};
        classNames.forEach((name) => Object.assign(numbers, calculateAttendanceNumbers(byClass[name], numberingMethod)));
        return numbers;
    }, [byClass, classNames, numberingMethod]);
    const relations = useMemo(() => buildRelations(students), [students]);
    const statByClass = useMemo(() => new Map(classStats.map((stat) => [stat.className, stat])), [classStats]);

    // 고른 학생이 바뀌거나 배정이 바뀔 때만 계산합니다.
    const recommendations = useMemo(
        () => (selectedId ? recommendSwaps(selectedId, students, classCount, groups) : []),
        [selectedId, students, classCount, groups],
    );
    const rankById = useMemo(
        () => new Map(recommendations.map((r, index) => [r.studentId, index + 1])),
        [recommendations],
    );

    // 줄이 사라지면 mouseleave가 오지 않으므로 지금 추천에 있는 상대만 씁니다.
    const previewPartnerId = hoveredPartnerId && rankById.has(hoveredPartnerId) ? hoveredPartnerId : null;

    const selected = selectedId ? byId.get(selectedId) ?? null : null;
    const comparePartner = comparePartnerId ? byId.get(comparePartnerId) ?? null : null;
    const preview = useMemo(
        () => (selectedId && comparePartnerId ? previewSwap(selectedId, comparePartnerId, students, classCount, groups) : null),
        [selectedId, comparePartnerId, students, classCount, groups],
    );
    const comparing = preview !== null;
    const shownView: BoardView = comparing ? 'two' : view;
    const shownClasses: [string, string] = preview
        ? [preview.classes[0].className, preview.classes[1].className]
        : twoClasses;

    const avoidPartners = useMemo(() => new Set(selectedId ? relations.avoid.get(selectedId) ?? [] : []), [relations, selectedId]);
    const keepPartners = useMemo(() => new Set(selectedId ? relations.keep.get(selectedId) ?? [] : []), [relations, selectedId]);
    const unassigned = byClass[UNASSIGNED];
    const found = useMemo(() => (query ? students.filter((s) => matchesQuery(s, query)) : []), [students, query]);
    const previewClass = previewPartnerId ? byId.get(previewPartnerId)?.assigned_class ?? null : null;

    // 압축 보기의 칩 크기를 정합니다. 칩을 다시 그리지 않도록 CSS 변수만 바꿉니다.
    // 고르기와 추천은 칩 크기에 영향을 주지 않으므로 여기에 넣지 않습니다.
    useLayoutEffect(() => {
        const board = boardRef.current;
        const scroller = scrollerRef.current;
        if (!board || !scroller || shownView !== 'compact') return;
        if (size === 'large') {
            applyChipSize(board, LARGE_SIZE);
            return;
        }
        const fit = () => {
            const chosen = FIT_SIZES.find((candidate) => {
                applyChipSize(board, candidate);
                return scroller.scrollHeight <= scroller.clientHeight;
            });
            // 13px로도 넘치면 더 줄이지 않고 스크롤합니다.
            if (!chosen) applyChipSize(board, FIT_SIZES[FIT_SIZES.length - 1]);
        };
        fit();
        fitRef.current = fit;
        const observer = new ResizeObserver(fit);
        observer.observe(scroller);
        return () => {
            fitRef.current = null;
            observer.disconnect();
        };
    }, [shownView, size, groups, showScores, classCount]);

    // 교환과 옮기기로는 크기를 다시 고르지 않습니다. 칩을 고칠 때마다 글자가 바뀌지 않게 하고, 넘칠 때만 다시 맞춥니다.
    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        if (scroller && scroller.scrollHeight > scroller.clientHeight) fitRef.current?.();
    }, [students]);

    // 비교나 두 반 보기에서 돌아오면 있던 스크롤 자리로 돌아갑니다.
    useLayoutEffect(() => {
        const scroller = scrollerRef.current;
        if (!scroller || shownView !== 'compact') return;
        scroller.scrollTo(compactScroll.current);
    }, [shownView]);

    const scrollToChip = (selector: string) => {
        const scroller = scrollerRef.current;
        const target = scroller?.querySelector(selector);
        if (!scroller || !target) return;
        // 이미 보이는 칩이면 스크롤을 건드리지 않습니다. 위쪽 반 이름에 가려진 칩만 가려진 것으로 봅니다.
        const box = scroller.getBoundingClientRect();
        const rect = target.getBoundingClientRect();
        const headHeight = scroller.querySelector<HTMLElement>('[data-sticky-head]')?.offsetHeight ?? 0;
        const visible = rect.top >= box.top + headHeight && rect.bottom <= box.bottom && rect.left >= box.left && rect.right <= box.right;
        if (!visible) target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    // 찾은 학생이나 고른 학생이 스크롤 밖에 있으면 보이게 합니다.
    useEffect(() => {
        if (selectedId) scrollToChip('[data-chip][aria-pressed="true"]');
        else if (query) scrollToChip('[data-found]');
    }, [query, selectedId, shownView]);

    // 비교를 열면 상대가 보이게 합니다.
    useEffect(() => {
        if (comparing) scrollToChip('[data-partner]');
    }, [comparing, comparePartnerId]);

    // 패널에서 가리킨 상대를 그 학생이 있는 반에서 보여 줍니다.
    useEffect(() => {
        if (previewPartnerId) scrollToChip(`[data-student-id="${CSS.escape(previewPartnerId)}"]`);
    }, [previewPartnerId]);

    const renderChip = (student: Student, wide: boolean) => {
        const isFound = matchesQuery(student, query);
        const relation: ChipRelation = avoidPartners.has(student.id) ? 'avoid' : keepPartners.has(student.id) ? 'keep' : null;
        return (
            <StudentChip
                key={student.id}
                student={student}
                groups={groups}
                hasAvoid={relations.avoid.has(student.id)}
                hasKeep={relations.keep.has(student.id)}
                selected={student.id === selectedId}
                rank={rankById.get(student.id) ?? null}
                relation={relation}
                found={isFound}
                dimmed={query.length > 0 && !isFound}
                emphasized={student.id === previewPartnerId}
                partner={comparing && student.id === comparePartnerId}
                wide={wide}
                showScore={showScores}
                attendanceNumber={wide ? attendanceNumbers[student.id] : undefined}
                onSelect={onChipClick}
            />
        );
    };

    const moveHint = (className: string) => {
        if (!selected) return null;
        return sameClass(selected.assigned_class, className) ? '지금 이 반에 있습니다' : `${selected.name} 학생을 이 반으로 옮기기`;
    };
    const columnClass = (className: string) =>
        `@container min-w-0 rounded-card bg-card shadow-card ${previewClass === className ? 'ring-2 ring-accent' : ''}`;

    return (
        <div className="flex min-h-0 min-w-0 flex-1">
            <div ref={boardRef} data-board className="flex min-h-0 min-w-0 flex-1 flex-col">
                {unassigned.length > 0 && (
                    <section aria-label="미배정 학생" data-unassigned-strip className="@container flex-none border-b border-line bg-card px-2 py-1.5">
                        <h3 className="mb-1 text-small font-bold text-ink">
                            {UNASSIGNED} <span className="font-normal text-soft">{unassigned.length}명</span>
                        </h3>
                        <div className="grid max-h-[80px] grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-px overflow-y-auto">
                            {unassigned.map((s) => renderChip(s, false))}
                        </div>
                    </section>
                )}

                <div
                    ref={scrollerRef}
                    data-board-scroller
                    onScroll={(e) => {
                        if (shownView === 'compact') compactScroll.current = { top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft };
                    }}
                    className="min-h-0 flex-1 overflow-auto px-1 pb-1"
                >
                    {shownView === 'compact' ? (
                        <div
                            data-view="compact"
                            className="mt-1 grid content-start justify-center gap-[3px]"
                            style={{ gridTemplateColumns: `repeat(${classCount}, minmax(96px, ${COMPACT_COLUMN_MAX}px))` }}
                        >
                            {classNames.map((name) => {
                                const stat = statByClass.get(name);
                                const hint = moveHint(name);
                                return (
                                    <section key={name} aria-label={name} data-class-column={name} data-emphasized={previewClass === name || undefined} className={columnClass(name)}>
                                        <button
                                            type="button"
                                            data-class-head={name}
                                            data-sticky-head
                                            title={hint ?? '두 반 크게 보기로 열기'}
                                            onClick={() => onHeadClick(name)}
                                            className="sticky top-0 z-10 block w-full cursor-pointer rounded-t-card border-b border-line bg-card px-1.5 py-1 text-left transition-colors hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2"
                                        >
                                            <span className="flex items-center gap-1">
                                                <b className="text-[length:var(--chip-head,14px)] text-ink">{name}</b>
                                                <HeadCount stat={stat} />
                                                {selected && !sameClass(selected.assigned_class, name) && (
                                                    <ArrowLineDown size={13} className="ml-auto shrink-0 text-accent" aria-hidden />
                                                )}
                                            </span>
                                            <HeadFigures stat={stat} />
                                        </button>
                                        <div className="grid gap-px p-[3px]">
                                            {byClass[name].map((s) => renderChip(s, false))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    ) : (
                        <div
                            data-view="two"
                            className="mt-1 grid content-start justify-center gap-1"
                            style={{ gridTemplateColumns: `repeat(2, minmax(280px, ${WIDE_COLUMN_MAX}px))` }}
                        >
                            {([0, 1] as const).map((index) => {
                                const name = shownClasses[index];
                                const other = shownClasses[index === 0 ? 1 : 0];
                                const stat = statByClass.get(name);
                                const hint = comparing ? null : moveHint(name);
                                const canMove = !!selected && !comparing;
                                return (
                                    <section key={index} aria-label={name} data-class-column={name} data-emphasized={previewClass === name || undefined} className={columnClass(name)}>
                                        <div data-sticky-head className="sticky top-0 z-10 flex items-center gap-1 rounded-t-card border-b border-line bg-card px-2 py-1">
                                            {/* 비교하는 동안에는 반을 바꾸지 않습니다. 비교하는 두 반이 정해져 있습니다. */}
                                            <Select value={name} disabled={comparing} onValueChange={(value) => onTwoClassChange(index, value)}>
                                                <SelectTrigger size="sm" aria-label={`${index === 0 ? '왼쪽' : '오른쪽'} 칸에 보일 반`} className="w-[88px] text-small font-bold">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {classNames.map((option) => (
                                                        <SelectItem key={option} value={option} disabled={option === other}>
                                                            {option}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <button
                                                type="button"
                                                data-class-head={name}
                                                disabled={!canMove}
                                                title={hint ?? undefined}
                                                onClick={() => onHeadClick(name)}
                                                className="flex min-w-0 flex-1 items-center gap-2 rounded-input px-2 py-1 text-left enabled:cursor-pointer enabled:hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2"
                                            >
                                                <HeadCount stat={stat} />
                                                <HeadFigures stat={stat} />
                                                {canMove && !sameClass(selected.assigned_class, name) && (
                                                    <span className="ml-auto flex shrink-0 items-center gap-1 text-caption font-semibold text-accent-ink">
                                                        <ArrowLineDown size={13} aria-hidden />이 반으로 옮기기
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                        <div className="grid gap-px p-[3px]">
                                            {byClass[name]?.map((s) => renderChip(s, true))}
                                        </div>
                                    </section>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <BoardPanel
                student={selected}
                groups={groups}
                relations={relations}
                byId={byId}
                attendanceNumber={selected ? attendanceNumbers[selected.id] : undefined}
                recommendations={recommendations}
                hasAssignments={hasAssignments}
                violations={violations}
                found={found}
                comparePartner={comparing ? comparePartner : null}
                preview={preview}
                showScores={showScores}
                onPick={onSelect}
                onClear={() => onSelect(null)}
                onCompare={onCompare}
                onPreviewPartner={setPreviewPartnerId}
                onConfirmCompare={onConfirmCompare}
                onCancelCompare={onCancelCompare}
                onUnassign={onUnassign}
            />
        </div>
    );
}
