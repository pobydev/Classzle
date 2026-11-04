'use client';

import { useMemo, useState } from 'react';
import { CheckCircle, Table as TableIcon } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HelpTip } from '@/components/common/HelpTip';
import { GuidanceCriteria } from '@/components/GuidanceCriteria';
import {
    BAND_DIFFERENCE_LIMIT,
    calculateBalanceTable,
    calculatePreviousClassMatrix,
    calculateScoreBands,
    MINUS_TOTAL_TITLE,
    PLUS_TOTAL_TITLE,
    SCORE_BANDS,
    TOTAL_TITLE,
    type BalanceCell,
    type BalanceColumn,
    type BalanceRow,
    type BandCounts,
} from '@/lib/balanceTable';
import { calculatePreviousClassLevels } from '@/lib/stats';
import type { CustomGroup, Student } from '@/types';

const TH = 'border-b border-line bg-canvas px-2 py-1.5 text-center text-caption font-semibold whitespace-nowrap text-soft';
const TD = 'border-b border-line px-2 py-1.5 text-center tabular-nums';
// 표의 머리글이 붙는 자리입니다. 위쪽 탭 줄 높이와 같습니다.
const STICKY_HEAD = 'sticky top-[49px] z-[5]';
// 칸 묶음(기본, 행동, 정서, 리더, 합계) 사이는 세로줄 대신 간격을 둡니다.
const GROUP_START = 'pl-5';
// 행동과 리더 묶음은 아주 옅은 바탕으로 이웃 묶음과 나눕니다.
const BAND_TINT = 'bg-canvas/50';

/** 기준을 넘은 칸 표시. 빨간 바탕과 '!'를 함께 씁니다. */
export function FlagMark() {
    return <span className="mr-0.5 text-caption font-bold text-danger" aria-label="기준 넘음">!</span>;
}

function Flagged({ cell, text, before, bold, className = '', tint = false }: { cell: BalanceCell; text?: string; before?: number; bold?: boolean; className?: string; tint?: boolean }) {
    // 0은 옅은 글자(--soft)로 둡니다. 읽어야 하는 값이라 장식용 --faint는 쓰지 않습니다. 차이 줄의 0도 같습니다.
    const zero = !cell.flagged && cell.value === 0;
    return (
        <td
            data-flagged={cell.flagged || undefined}
            title={cell.note}
            className={`${TD} ${className} ${cell.flagged ? 'bg-danger-wash font-semibold text-ink' : tint ? `${BAND_TINT} group-hover:bg-wash` : ''} ${zero ? 'text-soft' : bold ? 'font-bold text-ink' : ''}`}
        >
            {cell.flagged && <FlagMark />}
            {text ?? cell.value}
            {/* 전출 예정 학생이 있는 반은 전출 전 인원을 옆에 적습니다. 값은 전출 뒤 기준입니다. */}
            {before !== undefined && <span className="ml-1 font-normal whitespace-nowrap text-caption text-soft">(전출 전 {before})</span>}
        </td>
    );
}

// 인원, 남, 여 칸에 붙이는 전출 전 인원입니다. 전출 예정 학생이 없으면 붙이지 않습니다.
function beforeTransfer(row: BalanceRow, key: string): number | undefined {
    const transfer = key === 'count' ? row.transferMale + row.transferFemale : key === 'male' ? row.transferMale : key === 'female' ? row.transferFemale : 0;
    return transfer > 0 ? row.cells[key].value + transfer : undefined;
}

// 등급 칸 뒤에 오는 칸입니다.
const AFTER_LEVELS = ['minusTotal', 'plusTotal', 'guidanceTotal'];

function DifferenceHelp() {
    return (
        <HelpTip label="차이" width={360}>
            <p><strong>차이</strong>는 가장 많은 반과 가장 적은 반의 차이입니다. 모두 전출 뒤 기준입니다.</p>
            <p>인원, 남, 여, 그룹, -3, -2, 리더 +1, +2는 2명, 합계는 3 차이부터 차이 줄을 빨갛게 칠합니다. 대부분의 반이 모인 범위에서 벗어난 반의 칸도 칠합니다.</p>
            <p>생활지도는 많은 쪽, 합계는 어려움이 큰 쪽만 칠하고, 리더가 한 명도 없는 반은 +1 칸을 칠합니다.</p>
            <p>배정은 -3, -2가 몰리지 않게 먼저 맞추고, 그다음 합계를 맞춥니다. -1 인원은 합계에 맞춰 달라질 수 있습니다.</p>
        </HelpTip>
    );
}

function TotalsHelp() {
    return (
        <HelpTip label="합계" width={300}>
            <p><strong>-합계</strong>: {MINUS_TOTAL_TITLE}</p>
            <p><strong>+합계</strong>: {PLUS_TOTAL_TITLE}</p>
            <p><strong>합계</strong>: {TOTAL_TITLE}</p>
        </HelpTip>
    );
}

export function BalanceTable({ students, groups, classCount, hasAssignments, onOpenClass }: {
    students: Student[];
    groups: CustomGroup[];
    classCount: number;
    hasAssignments: boolean;
    onOpenClass: (className: string) => void;
}) {
    const table = useMemo(() => calculateBalanceTable(students, classCount, groups), [students, classCount, groups]);
    const single = (section: BalanceColumn['section']) => table.columns.filter((c) => c.section === section);
    const before = table.columns.filter((c) => !c.section && !AFTER_LEVELS.includes(c.key));
    const totals = table.columns.filter((c) => AFTER_LEVELS.includes(c.key));
    const behavior = single('행동');
    const emotional = single('정서');
    const leader = single('리더');
    const groupColumns = single('그룹 분산');
    const ordered = [...before, ...behavior, ...emotional, ...leader, ...totals, ...groupColumns];
    // 묶음의 첫 칸에 간격을 두고, 행동과 리더 묶음에 옅은 바탕을 둡니다.
    const starts = new Set([behavior[0]?.key, emotional[0]?.key, leader[0]?.key, totals[0]?.key, groupColumns[0]?.key]);
    const tinted = new Set([...behavior, ...leader].map((c) => c.key));
    const anyFlagged = [table.difference, ...table.rows.map((r) => r.cells)].some((cells) => Object.values(cells).some((c) => c.flagged));

    return (
        <div className="rounded-card bg-card shadow-card" data-balance-table>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2">
                <BalanceDetailButton students={students} groups={groups} classCount={classCount} disabled={!hasAssignments} />
                {hasAssignments && <BandLine students={students} groups={groups} classCount={classCount} />}
                {hasAssignments && (
                    <p data-flag-legend className="ml-auto flex items-center gap-1.5 text-small text-soft">
                        {anyFlagged ? (
                            <>
                                <span className="inline-flex h-5 items-center rounded-[4px] bg-danger-wash px-1.5"><FlagMark /></span>
                                <span><strong className="font-semibold text-ink">빨간 칸</strong>: 다른 반보다 몰린 곳</span>
                                <span className="text-hairline" aria-hidden="true">·</span>
                                <span><strong className="font-semibold text-ink">차이</strong>: 가장 많은 반과 가장 적은 반의 차이</span>
                            </>
                        ) : (
                            <span className="flex items-center gap-1 text-accent-ink">
                                <CheckCircle size={15} aria-hidden="true" />모든 칸이 기준 안에 있습니다
                            </span>
                        )}
                    </p>
                )}
            </div>

            {!hasAssignments ? (
                <p data-balance-empty className="border-t border-line px-3 py-16 text-center text-body text-soft">
                    배정 실행을 누르면 여기에 결과가 나옵니다.
                </p>
            ) : (
                <table className="w-full border-collapse text-small">
                    <thead className={STICKY_HEAD}>
                        <tr>
                            <th rowSpan={2} className={`${TH} text-left`}>반</th>
                            {before.map((c) => <th key={c.key} rowSpan={2} className={TH}>{c.label}</th>)}
                            <th colSpan={behavior.length} className={`${TH} ${GROUP_START}`}>
                                <span className="inline-flex items-center gap-0.5">행동<HelpTip label="행동 기준"><GuidanceCriteria only="BEHAVIOR" /></HelpTip></span>
                            </th>
                            <th colSpan={emotional.length} className={`${TH} ${GROUP_START}`}>
                                <span className="inline-flex items-center gap-0.5">정서<HelpTip label="정서 기준"><GuidanceCriteria only="EMOTIONAL" /></HelpTip></span>
                            </th>
                            <th colSpan={leader.length} className={`${TH} ${GROUP_START}`}>
                                <span className="inline-flex items-center gap-0.5">리더<HelpTip label="리더 기준"><GuidanceCriteria only="LEADER" /></HelpTip></span>
                            </th>
                            {totals.map((c, i) => (
                                <th key={c.key} rowSpan={2} className={`${TH} ${i === 0 ? GROUP_START : ''}`}>
                                    {c.key === 'guidanceTotal'
                                        ? <span className="inline-flex items-center gap-0.5">{c.label}<TotalsHelp /></span>
                                        : c.label}
                                </th>
                            ))}
                            {groupColumns.length > 0 && <th colSpan={groupColumns.length} className={`${TH} ${GROUP_START}`}>그룹 분산</th>}
                            <th rowSpan={2} className={`${TH} ${GROUP_START}`}>전출<span className="block font-normal">남/여</span></th>
                        </tr>
                        <tr>
                            {behavior.map((c) => <th key={c.key} className={`${TH} ${starts.has(c.key) ? GROUP_START : ''}`}>{c.label}</th>)}
                            {emotional.map((c) => <th key={c.key} className={`${TH} ${starts.has(c.key) ? GROUP_START : ''}`}>{c.label}</th>)}
                            {leader.map((c) => <th key={c.key} className={`${TH} ${starts.has(c.key) ? GROUP_START : ''}`}>{c.label}</th>)}
                            {groupColumns.map((c) => (
                                <th key={c.key} title={c.label} className={`${TH} max-w-[88px] truncate ${starts.has(c.key) ? GROUP_START : ''}`}>{c.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* 차이 줄: 옅은 바탕과 아래 굵은 선으로 반 줄과 나눕니다. */}
                        <tr data-difference-row className="bg-canvas font-bold [&>*]:border-b-2 [&>*]:border-b-hairline">
                            <th scope="row" className={`${TD} text-left font-bold text-ink`}>
                                <span className="inline-flex items-center gap-0.5">차이<DifferenceHelp /></span>
                            </th>
                            {ordered.map((c) => (
                                <Flagged
                                    key={c.key}
                                    cell={table.difference[c.key]}
                                    bold
                                    className={starts.has(c.key) ? GROUP_START : ''}
                                    text={c.key === 'average' ? table.difference.average.value.toFixed(1) : undefined}
                                />
                            ))}
                            <td className={`${TD} ${GROUP_START} text-soft`}>-</td>
                        </tr>
                        {table.rows.map((row) => (
                            <tr key={row.className} className="group hover:bg-wash">
                                <th scope="row" className={`${TD} text-left font-bold`}>
                                    <button
                                        type="button"
                                        data-open-class={row.className}
                                        aria-label={`${row.className} 골라 보기로 열기`}
                                        onClick={() => onOpenClass(row.className)}
                                        className="cursor-pointer rounded-input font-bold text-ink underline-offset-2 hover:text-accent-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-1"
                                    >
                                        {row.className}
                                    </button>
                                </th>
                                {ordered.map((c) => (
                                    <Flagged
                                        key={c.key}
                                        cell={row.cells[c.key]}
                                        before={beforeTransfer(row, c.key)}
                                        className={starts.has(c.key) ? GROUP_START : ''}
                                        tint={tinted.has(c.key)}
                                    />
                                ))}
                                <td className={`${TD} ${GROUP_START} ${row.transferMale + row.transferFemale > 0 ? 'text-ink' : 'text-soft'}`}>
                                    {row.transferMale + row.transferFemale > 0 ? `${row.transferMale}/${row.transferFemale}` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function BandCells({ counts }: { counts: BandCounts }) {
    return (
        <>
            {counts.map((value, i) => <td key={i} className={`${TD} ${i === 0 ? GROUP_START : ''} ${value === 0 ? 'text-soft' : ''}`}>{value}</td>)}
        </>
    );
}

function ScoreBandsTab({ students, groups, classCount }: { students: Student[]; groups: CustomGroup[]; classCount: number }) {
    const bands = useMemo(() => calculateScoreBands(students, classCount, groups), [students, classCount, groups]);
    return (
        <>
            <p className="mb-2 text-small text-soft">남녀 각각 성적순으로 네 구간(상, 중상, 중하, 하)으로 나눠 반별 인원을 셉니다. 전출 뒤 기준입니다.</p>
            <table className="w-full border-collapse text-small">
                <thead>
                    <tr>
                        <th rowSpan={2} className={`${TH} text-left`}>반</th>
                        <th colSpan={4} className={`${TH} ${GROUP_START}`}>전체</th>
                        <th colSpan={4} className={`${TH} ${GROUP_START}`}>남</th>
                        <th colSpan={4} className={`${TH} ${GROUP_START}`}>여</th>
                    </tr>
                    <tr>
                        {[0, 1, 2].flatMap((part) => SCORE_BANDS.map((band, i) => <th key={`${part}${band}`} className={`${TH} ${i === 0 ? GROUP_START : ''}`}>{band}</th>))}
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
        </>
    );
}

function PreviousMixTab({ students, classCount }: { students: Student[]; classCount: number }) {
    const matrix = useMemo(() => calculatePreviousClassMatrix(students, classCount), [students, classCount]);
    return (
        <>
            <p className="mb-2 text-small text-soft">새 반마다 전학년도 어느 반 학생이 몇 명 왔는지 보여 줍니다. 배정할 때 비슷하면 되는 약한 조건으로 맞춥니다. 전출 뒤 기준입니다.</p>
            {matrix.previousClasses.length === 0 ? (
                <p className="text-small text-soft">전학년도 반 정보가 없습니다.</p>
            ) : (
                <table className="w-full border-collapse text-small" data-previous-matrix>
                    <thead>
                        <tr>
                            <th className={`${TH} text-left`}>새 반 \ 전학년도</th>
                            {matrix.previousClasses.map((p) => <th key={p} className={TH}>{p}반</th>)}
                            <th className={`${TH} ${GROUP_START}`}>합계</th>
                        </tr>
                    </thead>
                    <tbody>
                        {matrix.rows.map((row) => (
                            <tr key={row.className} className="hover:bg-wash">
                                <th scope="row" className={`${TD} text-left font-bold text-ink`}>{row.className}</th>
                                {matrix.previousClasses.map((p) => (
                                    <td key={p} className={`${TD} ${row.counts[p] ? '' : 'text-soft'}`}>{row.counts[p] ?? 0}</td>
                                ))}
                                <td className={`${TD} ${GROUP_START} font-semibold`}>{row.total}</td>
                            </tr>
                        ))}
                        <tr>
                            <th scope="row" className={`${TD} text-left font-semibold text-soft`}>합계</th>
                            {matrix.previousClasses.map((p) => <td key={p} className={`${TD} text-soft`}>{matrix.totals[p] ?? 0}</td>)}
                            <td className={`${TD} ${GROUP_START} text-soft`}>{matrix.rows.reduce((sum, row) => sum + row.total, 0)}</td>
                        </tr>
                    </tbody>
                </table>
            )}
        </>
    );
}

function PreviousLevelsTab({ students }: { students: Student[] }) {
    const levels = useMemo(() => calculatePreviousClassLevels(students), [students]);
    return (
        <>
            <p className="mb-1 text-small font-semibold text-ink">배정과 관계없이 입력한 점수만 봅니다.</p>
            <p className="mb-2 text-small text-soft">
                전학년도 반마다 생활지도 등급 인원입니다. 담임 선생님마다 기준이 다를 수 있으니, 한 반만 유독 많거나 적으면 배정 전에 점수를 살펴봐 주세요. 점수를 자동으로 고치지는 않습니다. 기준 예시는 1단계 학생 표와 통계 표의 행동, 정서, 리더 머리글 옆 ? 에 있습니다.
            </p>
            {levels.length === 0 ? (
                <p className="text-small text-soft">전학년도 반 정보가 없습니다.</p>
            ) : (
                <table className="w-full border-collapse text-small" data-previous-levels>
                    <thead>
                        <tr>
                            <th className={`${TH} text-left`}>전학년도 반</th>
                            <th className={TH}>학생</th>
                            <th className={`${TH} ${GROUP_START}`}>-3</th>
                            <th className={TH}>-2</th>
                            <th className={TH}>-1</th>
                            <th className={`${TH} ${GROUP_START}`}>리더</th>
                        </tr>
                    </thead>
                    <tbody>
                        {levels.map((row) => (
                            <tr key={row.previousClass} className="hover:bg-wash">
                                <th scope="row" className={`${TD} text-left font-bold text-ink`}>{row.previousClass}반</th>
                                <td className={TD}>{row.total}</td>
                                <td className={`${TD} ${GROUP_START} ${row.minus3 ? '' : 'text-soft'}`}>{row.minus3}</td>
                                <td className={`${TD} ${row.minus2 ? '' : 'text-soft'}`}>{row.minus2}</td>
                                <td className={`${TD} ${row.minus1 ? '' : 'text-soft'}`}>{row.minus1}</td>
                                <td className={`${TD} ${GROUP_START} ${row.leader ? '' : 'text-soft'}`}>{row.leader}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </>
    );
}

/** '반 자세히 보기' 단추와 창. 표에 다 싣지 않은 값을 세 탭으로 나눠 봅니다. */
function BalanceDetailButton({ students, groups, classCount, disabled = false }: { students: Student[]; groups: CustomGroup[]; classCount: number; disabled?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled || students.length === 0}>
                <TableIcon />반 자세히 보기
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[1040px]">
                    <DialogHeader>
                        <DialogTitle className="text-title-sm font-bold">반 자세히 보기</DialogTitle>
                        <DialogDescription>표에 다 싣지 않은 자세한 값입니다.</DialogDescription>
                    </DialogHeader>
                    {open && (
                        <Tabs defaultValue="bands" className="gap-3" data-balance-detail>
                            <TabsList>
                                <TabsTrigger value="bands" className="px-3">성적 분포</TabsTrigger>
                                <TabsTrigger value="mix" className="px-3">전 학년 반 섞임</TabsTrigger>
                                <TabsTrigger value="levels" className="px-3">전 학년 반 점수 기준</TabsTrigger>
                            </TabsList>
                            <TabsContent value="bands"><ScoreBandsTab students={students} groups={groups} classCount={classCount} /></TabsContent>
                            <TabsContent value="mix"><PreviousMixTab students={students} classCount={classCount} /></TabsContent>
                            <TabsContent value="levels"><PreviousLevelsTab students={students} /></TabsContent>
                        </Tabs>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

function BandLine({ students, groups, classCount }: { students: Student[]; groups: CustomGroup[]; classCount: number }) {
    const largest = useMemo(
        () => calculateScoreBands(students, classCount, groups).largestDifference,
        [students, classCount, groups],
    );
    const over = largest > BAND_DIFFERENCE_LIMIT;
    return (
        <span data-band-line className={`flex items-center gap-1 text-small ${over ? 'font-semibold text-ink' : 'text-soft'}`}>
            <span className={over ? 'rounded-[4px] bg-danger-wash px-1.5' : ''}>
                {over && <FlagMark />}
                성적 구간 차이 {largest}
            </span>
            <HelpTip label="성적 구간 차이">
                <p>남녀 각각 성적순으로 네 구간으로 나눴을 때, 한 구간에서 반별 인원이 가장 많이 차이 나는 값입니다.</p>
                <p>성적순으로 한 명씩 돌아가며 나눈 모양이 흐트러지면 커집니다. {BAND_DIFFERENCE_LIMIT + 1}부터 빨갛게 칠합니다.</p>
                <p>구간별 인원은 반 자세히 보기의 성적 분포에서 봅니다.</p>
            </HelpTip>
        </span>
    );
}
