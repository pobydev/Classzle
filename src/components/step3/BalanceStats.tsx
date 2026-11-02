'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Lightbulb, Table as TableIcon, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    BAND_DIFFERENCE_LIMIT,
    calculateBalanceTable,
    calculatePreviousClassMatrix,
    calculateScoreBands,
    SCORE_BANDS,
    type BalanceCell,
    type BalanceColumn,
    type BandCounts,
} from '@/lib/balanceTable';
import { calculateClassStats, calculatePreviousClassLevels } from '@/lib/stats';
import { isStaying } from '@/lib/assignment/problem';
import type { CustomGroup, Student, Violation } from '@/types';
import { Mark } from './StudentChip';

const TH = 'border-b border-line bg-canvas px-2 py-1.5 text-center text-caption font-semibold whitespace-nowrap text-soft';
const TD = 'border-b border-line px-2 py-1.5 text-center tabular-nums';
// 표의 머리글이 붙는 자리입니다. 위쪽 탭 줄 높이와 같습니다.
const STICKY_HEAD = 'sticky top-[49px] z-[5]';

function Flagged({ cell, text, bold }: { cell: BalanceCell; text?: string; bold?: boolean }) {
    return (
        <td
            data-flagged={cell.flagged || undefined}
            className={`${TD} ${cell.flagged ? 'bg-danger-wash font-semibold text-ink' : ''} ${bold ? 'font-bold text-ink' : ''}`}
        >
            {cell.flagged && <span className="mr-0.5 text-micro text-danger" aria-label="기준 넘음">▲</span>}
            {text ?? cell.value}
        </td>
    );
}

// 등급 칸 뒤에 오는 칸입니다.
const AFTER_LEVELS = ['leader', 'minusTotal', 'plusTotal', 'guidanceTotal'];

export function BalanceTable({ students, groups, classCount, onOpenClass }: {
    students: Student[];
    groups: CustomGroup[];
    classCount: number;
    onOpenClass: (className: string) => void;
}) {
    const table = useMemo(() => calculateBalanceTable(students, classCount, groups), [students, classCount, groups]);
    const single = (section: BalanceColumn['section']) => table.columns.filter((c) => c.section === section);
    const before = table.columns.filter((c) => !c.section && !AFTER_LEVELS.includes(c.key));
    const leader = table.columns.filter((c) => AFTER_LEVELS.includes(c.key));
    const behavior = single('행동');
    const emotional = single('정서');
    const groupColumns = single('그룹 분산');
    const ordered = [...before, ...behavior, ...emotional, ...leader, ...groupColumns];

    return (
        <div className="rounded-card bg-card shadow-card" data-balance-table>
            <table className="w-full border-collapse text-small">
                <thead className={STICKY_HEAD}>
                    <tr>
                        <th rowSpan={2} className={`${TH} rounded-tl-card text-left`}>반</th>
                        {before.map((c) => <th key={c.key} rowSpan={2} className={TH}>{c.label}</th>)}
                        <th colSpan={behavior.length} className={TH}>행동</th>
                        <th colSpan={emotional.length} className={TH}>정서</th>
                        {leader.map((c) => <th key={c.key} rowSpan={2} title={c.title} className={TH}>{c.label}</th>)}
                        {groupColumns.length > 0 && <th colSpan={groupColumns.length} className={TH}>그룹 분산</th>}
                        <th rowSpan={2} className={`${TH} rounded-tr-card`}>전출<span className="block font-normal">남/여</span></th>
                    </tr>
                    <tr>
                        {behavior.map((c) => <th key={c.key} className={TH}>{c.label}</th>)}
                        {emotional.map((c) => <th key={c.key} className={TH}>{c.label}</th>)}
                        {groupColumns.map((c) => (
                            <th key={c.key} title={c.label} className={`${TH} max-w-[88px] truncate`}>{c.label}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    <tr data-difference-row className="font-bold">
                        <th scope="row" className={`${TD} text-left font-bold text-ink`}>차이</th>
                        {ordered.map((c) => (
                            <Flagged
                                key={c.key}
                                cell={table.difference[c.key]}
                                bold
                                text={c.key === 'average' ? table.difference.average.value.toFixed(1) : undefined}
                            />
                        ))}
                        <td className={`${TD} text-soft`}>-</td>
                    </tr>
                    {table.rows.map((row) => (
                        <tr key={row.className} className="hover:bg-wash">
                            <th scope="row" className={`${TD} text-left font-bold`}>
                                <button
                                    type="button"
                                    data-open-class={row.className}
                                    title="두 반 크게 보기로 열기"
                                    onClick={() => onOpenClass(row.className)}
                                    className="cursor-pointer rounded-input font-bold text-ink underline-offset-2 hover:text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-1"
                                >
                                    {row.className}
                                </button>
                            </th>
                            {ordered.map((c) => <Flagged key={c.key} cell={row.cells[c.key]} />)}
                            <td className={`${TD} text-soft`}>
                                {row.transferMale + row.transferFemale > 0 ? `${row.transferMale}/${row.transferFemale}` : '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="px-3 py-2 text-caption text-soft">
                생활지도는 -3, -2가 몰리지 않게 먼저 맞추고, 그다음 합계를 맞춥니다. 합계는 어려운 학생과 리더의 점수를 모두 더한 값입니다. -1 인원은 합계에 맞춰 달라질 수 있습니다. 모두 전출 뒤 기준입니다. 인원, 남, 여, 그룹, -3, -2, 리더는 2명, 합계는 3 차이부터 차이 줄에 ▲를 붙이고, 대부분의 반이 모인 범위에서 벗어난 반에도 붙입니다. 생활지도는 많은 쪽, 합계는 어려움이 큰 쪽만 표시하고, 리더는 없는 반도 표시합니다.
            </p>
        </div>
    );
}

function BandCells({ counts }: { counts: BandCounts }) {
    return (
        <>
            {counts.map((value, i) => <td key={i} className={TD}>{value}</td>)}
        </>
    );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return <h3 className="mb-1 text-emph font-bold text-ink">{children}</h3>;
}

function DetailContent({ students, groups, classCount }: { students: Student[]; groups: CustomGroup[]; classCount: number }) {
    const bands = useMemo(() => calculateScoreBands(students, classCount, groups), [students, classCount, groups]);
    const matrix = useMemo(() => calculatePreviousClassMatrix(students, classCount), [students, classCount]);
    const levels = useMemo(() => calculatePreviousClassLevels(students), [students]);
    const leaders = useMemo(
        () => calculateClassStats(students.filter(isStaying), classCount, groups),
        [students, classCount, groups],
    );

    return (
        <div className="space-y-6" data-balance-detail>
            <section>
                <SectionTitle>성적 분포</SectionTitle>
                <p className="mb-2 text-small text-soft">남녀 각각 성적순으로 네 구간(상, 중상, 중하, 하)으로 나눠 반별 인원을 셉니다. 전출 뒤 기준입니다.</p>
                <table className="w-full border-collapse text-small">
                    <thead>
                        <tr>
                            <th rowSpan={2} className={`${TH} text-left`}>반</th>
                            <th colSpan={4} className={TH}>전체</th>
                            <th colSpan={4} className={TH}>남</th>
                            <th colSpan={4} className={TH}>여</th>
                        </tr>
                        <tr>
                            {[0, 1, 2].flatMap((part) => SCORE_BANDS.map((band) => <th key={`${part}${band}`} className={TH}>{band}</th>))}
                        </tr>
                    </thead>
                    <tbody>
                        {bands.rows.map((row) => (
                            <tr key={row.className} className="hover:bg-wash">
                                <th scope="row" className={`${TD} text-left font-bold text-ink`}>{row.className}</th>
                                <BandCells counts={row.total} />
                                <BandCells counts={row.male} />
                                <BandCells counts={row.female} />
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>

            <section>
                <SectionTitle>전학년도 반별 인원</SectionTitle>
                <p className="mb-2 text-small text-soft">새 반마다 전학년도 어느 반 학생이 몇 명 왔는지 보여 줍니다. 배정할 때 비슷하면 되는 약한 조건으로 맞춥니다. 전출 뒤 기준입니다.</p>
                {matrix.previousClasses.length === 0 ? (
                    <p className="text-small text-soft">전학년도 반 정보가 없습니다.</p>
                ) : (
                    <table className="w-full border-collapse text-small" data-previous-matrix>
                        <thead>
                            <tr>
                                <th className={`${TH} text-left`}>새 반 \ 전학년도</th>
                                {matrix.previousClasses.map((p) => <th key={p} className={TH}>{p}반</th>)}
                                <th className={TH}>합계</th>
                            </tr>
                        </thead>
                        <tbody>
                            {matrix.rows.map((row) => (
                                <tr key={row.className} className="hover:bg-wash">
                                    <th scope="row" className={`${TD} text-left font-bold text-ink`}>{row.className}</th>
                                    {matrix.previousClasses.map((p) => (
                                        <td key={p} className={`${TD} ${row.counts[p] ? '' : 'text-soft'}`}>{row.counts[p] ?? 0}</td>
                                    ))}
                                    <td className={`${TD} font-semibold`}>{row.total}</td>
                                </tr>
                            ))}
                            <tr>
                                <th scope="row" className={`${TD} text-left font-semibold text-soft`}>합계</th>
                                {matrix.previousClasses.map((p) => <td key={p} className={`${TD} text-soft`}>{matrix.totals[p] ?? 0}</td>)}
                                <td className={`${TD} text-soft`}>{matrix.rows.reduce((sum, row) => sum + row.total, 0)}</td>
                            </tr>
                        </tbody>
                    </table>
                )}
            </section>

            {levels.length > 1 && (
                <section>
                    <SectionTitle>전학년도 반별 생활지도 등급 인원</SectionTitle>
                    <p className="mb-2 text-small text-soft">
                        담임 선생님마다 기준이 다를 수 있습니다. 한 반만 유독 많거나 적으면 배정 전에 점수를 살펴봐 주세요. 점수를 자동으로 고치지는 않습니다. 기준 예시는 학급별 균형 통계 탭의 생활지도 기준 안내에 있습니다.
                    </p>
                    <table className="w-full border-collapse text-small">
                        <thead>
                            <tr>
                                <th className={`${TH} text-left`}>전학년도 반</th>
                                <th className={TH}>학생</th>
                                <th className={TH}>-3</th>
                                <th className={TH}>-2</th>
                                <th className={TH}>-1</th>
                                <th className={TH}>리더</th>
                            </tr>
                        </thead>
                        <tbody>
                            {levels.map((row) => (
                                <tr key={row.previousClass} className="hover:bg-wash">
                                    <th scope="row" className={`${TD} text-left font-bold text-ink`}>{row.previousClass}반</th>
                                    <td className={TD}>{row.total}</td>
                                    <td className={TD}>{row.minus3}</td>
                                    <td className={TD}>{row.minus2}</td>
                                    <td className={TD}>{row.minus1}</td>
                                    <td className={TD}>{row.leader}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}

            <section>
                <SectionTitle>리더 +1, +2</SectionTitle>
                <table className="w-full max-w-sm border-collapse text-small" data-leader-split>
                    <thead>
                        <tr>
                            <th className={`${TH} text-left`}>반</th>
                            <th className={TH}>+1</th>
                            <th className={TH}>+2</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaders.map((stat) => (
                            <tr key={stat.className} className="hover:bg-wash">
                                <th scope="row" className={`${TD} text-left font-bold text-ink`}>{stat.className}</th>
                                <td className={TD}>{stat.scorePlus1}</td>
                                <td className={TD}>{stat.scorePlus2}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

export function BalanceDetailBar({ students, groups, classCount, hasAssignments }: {
    students: Student[];
    groups: CustomGroup[];
    classCount: number;
    hasAssignments: boolean;
}) {
    const [open, setOpen] = useState(false);
    const largest = useMemo(
        () => calculateScoreBands(students, classCount, groups).largestDifference,
        [students, classCount, groups],
    );
    const over = largest > BAND_DIFFERENCE_LIMIT;

    return (
        <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={students.length === 0}>
                <TableIcon />성적 분포, 전학년도 반 보기
            </Button>
            {hasAssignments && (
                <span
                    data-band-line
                    title="같은 성별의 성적 구간에서 반별 인원 차이가 가장 큰 값입니다. 뱀 모양 배치가 흐트러지면 커집니다."
                    className={`text-small ${over ? 'font-semibold text-ink' : 'text-soft'}`}
                >
                    {over && <span className="mr-0.5 text-micro text-danger" aria-label="기준 넘음">▲</span>}
                    성적 구간 차이 {largest}
                </span>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[1040px]">
                    <DialogHeader>
                        <DialogTitle className="text-title-sm font-bold">성적 분포, 전학년도 반 보기</DialogTitle>
                        <DialogDescription>표에 다 싣지 않은 자세한 값입니다.</DialogDescription>
                    </DialogHeader>
                    {open && <DetailContent students={students} groups={groups} classCount={classCount} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}

function CriteriaColumn({ mark, tone, title, items }: {
    mark: string;
    tone: 'level3' | 'level2' | 'leader';
    title: string;
    items: { level: string; text: string }[];
}) {
    return (
        <div>
            <h5 className="mb-2 flex items-center gap-1 text-small font-bold text-ink">
                <Mark tone={tone}>{mark}</Mark> {title}
            </h5>
            <ul className="space-y-1.5 text-caption text-soft">
                {items.map((item) => (
                    <li key={item.level}><strong className="text-ink">{item.level}</strong>: {item.text}</li>
                ))}
            </ul>
        </div>
    );
}

export function CriteriaAndStatus({ hasAssignments, violations }: { hasAssignments: boolean; violations: Violation[] }) {
    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-card bg-card p-4 shadow-card">
                <h4 className="mb-3 flex items-center gap-1.5 text-body font-bold text-ink">
                    <Lightbulb size={16} className="text-brand" /> 생활지도 기준 안내
                </h4>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <CriteriaColumn
                        mark="행"
                        tone="level2"
                        title="행동 (생활지도 소요)"
                        items={[
                            { level: '-1', text: '가벼운 딴짓, 관심 필요' },
                            { level: '-2', text: '잦은 방해, 지속적 지도 필요' },
                            { level: '-3', text: '심각한 방해, 학교폭력 등 집중 관리 필요' },
                        ]}
                    />
                    <CriteriaColumn
                        mark="정"
                        tone="level2"
                        title="정서 (세심한 배려)"
                        items={[
                            { level: '-1', text: '다소 예민함, 배려 필요' },
                            { level: '-2', text: '교우관계/정서 지원 필요' },
                            { level: '-3', text: '특별한 케어/전문가 개입 필요' },
                        ]}
                    />
                    <CriteriaColumn
                        mark="리"
                        tone="leader"
                        title="리더 (영향력)"
                        items={[
                            { level: '+1', text: '모범적이고 성실한 학생' },
                            { level: '+2', text: '리더십이 탁월한 학생 (회장감)' },
                        ]}
                    />
                </div>
            </div>

            <div className="rounded-card bg-card p-4 shadow-card" data-conditions-status>
                <h4 className="mb-2 flex items-center gap-1.5 text-body font-bold text-ink">
                    <WarningCircle size={16} className="text-danger" /> 조건 준수 현황
                </h4>
                {!hasAssignments ? (
                    <p className="text-small text-soft">아직 배정하지 않았습니다.</p>
                ) : violations.length > 0 ? (
                    <div className="space-y-2">
                        <p className="text-small font-bold text-danger">지키지 못한 조건이 {violations.length}건 있습니다.</p>
                        <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-caption text-ink">
                            {violations.map((v) => <li key={v.key ?? v.message}>{v.message}</li>)}
                        </ul>
                    </div>
                ) : (
                    <p className="flex items-start gap-1.5 text-small font-semibold text-accent-ink">
                        <CheckCircle size={16} className="mt-0.5 shrink-0" />
                        고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀 조건을 모두 지키고 있습니다.
                    </p>
                )}
            </div>
        </div>
    );
}
