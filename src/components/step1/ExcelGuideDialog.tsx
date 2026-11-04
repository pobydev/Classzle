'use client';

// 1단계 '작성 방법'을 누르면 여는 엑셀 양식 안내 창입니다.
// 오래 읽는 안내 창이라 공통 기준(brand/DESIGN.md)대로 본문 16px, 진한 글자, 창 너비 760px입니다.
// 생활지도 값은 보드 표시와 같은 이름표로 보여 주고, 순서는 앱 전체와 같이 행동 → 정서 → 리더 → 해당 없음입니다.

import type { ReactNode } from 'react';
import { DownloadSimple, FileXls, WarningCircle } from '@phosphor-icons/react';
import { BehaviorIcon } from '@/components/BehaviorChip';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Mark } from '@/components/step3/StudentChip';
import type { MarkTone } from '@/components/step3/boardModel';
import { downloadPreAssignedSampleExcel, downloadSampleExcel } from '@/lib/excel';
import { ONE_VALUE_RULE } from '@/lib/classSheets';

const BODY = 'text-emph !leading-[26px] text-ink';
const HEADING = 'text-title-sm font-bold text-ink';

// 엑셀 첫 줄과 두세 줄을 그린 작은 예시입니다. 위에 열 글자(A, B, …), 왼쪽에 줄 번호를 둡니다.
function SheetSample({ head, rows, highlight = [] }: { head: string[]; rows: (string | number)[][]; highlight?: number[] }) {
    const letters = head.map((_, i) => String.fromCharCode(65 + i));
    const cell = 'border border-hairline px-1.5 py-0.5 whitespace-nowrap';
    return (
        <div className="overflow-x-auto" data-sheet-sample>
            <table className="border-collapse text-caption tabular-nums">
                <thead>
                    <tr className="bg-canvas text-soft">
                        <th className={`${cell} w-6 font-normal`} />
                        {letters.map((letter) => <th key={letter} className={`${cell} font-normal`}>{letter}</th>)}
                    </tr>
                </thead>
                <tbody className="bg-card text-ink">
                    <tr>
                        <td className={`${cell} bg-canvas text-center text-soft`}>1</td>
                        {head.map((h, i) => (
                            <td key={i} className={`${cell} font-bold ${highlight.includes(i) ? 'bg-wash text-accent-ink' : 'bg-surface-hover'}`}>{h}</td>
                        ))}
                    </tr>
                    {rows.map((row, r) => (
                        <tr key={r}>
                            <td className={`${cell} bg-canvas text-center text-soft`}>{r + 2}</td>
                            {row.map((value, i) => <td key={i} className={cell}>{value}</td>)}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Columns({ items }: { items: [string, ReactNode][] }) {
    return (
        <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1">
            {items.map(([name, text]) => (
                <div key={name} className="contents">
                    <dt className="font-semibold">{name}</dt>
                    <dd>{text}</dd>
                </div>
            ))}
        </dl>
    );
}

const GUIDANCE: { type: 'BEHAVIOR' | 'EMOTIONAL' | 'LEADER'; title: string; values: { text: string; tone: MarkTone; meaning: string }[] }[] = [
    {
        type: 'BEHAVIOR',
        title: '행동',
        values: [
            { text: '행동(-3)', tone: 'b3', meaning: '심각한 방해, 학교폭력 등 집중 관리 필요' },
            { text: '행동(-2)', tone: 'b2', meaning: '잦은 방해, 지속적 지도 필요' },
            { text: '행동(-1)', tone: 'b1', meaning: '가벼운 딴짓, 관심 필요' },
        ],
    },
    {
        type: 'EMOTIONAL',
        title: '정서',
        values: [
            { text: '정서(-3)', tone: 'e3', meaning: '특별한 케어/전문가 개입 필요' },
            { text: '정서(-2)', tone: 'e2', meaning: '교우관계/정서 지원 필요' },
            { text: '정서(-1)', tone: 'e1', meaning: '다소 예민함, 배려 필요' },
        ],
    },
    {
        type: 'LEADER',
        title: '리더',
        values: [
            { text: '리더(+1)', tone: 'l1', meaning: '모범적이고 성실한 학생' },
            { text: '리더(+2)', tone: 'l2', meaning: '리더십이 탁월한 학생 (회장감)' },
        ],
    },
];

function GuidanceValues() {
    return (
        <div className="flex flex-col gap-3" data-guide-guidance>
            {GUIDANCE.map((group) => (
                <div key={group.type}>
                    <p className="mb-1 flex items-center gap-1.5 font-semibold"><BehaviorIcon type={group.type} />{group.title}</p>
                    <ul className="flex flex-col gap-1 pl-6">
                        {group.values.map((value) => (
                            <li key={value.text} className="flex items-center gap-2">
                                {/* 보드의 표시와 같은 이름표입니다. 엑셀에는 이 글자를 그대로 넣습니다. */}
                                <span className="w-[84px] shrink-0 [--chip-mark:14px]"><Mark tone={value.tone}>{value.text}</Mark></span>
                                <span>{value.meaning}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
            <div>
                <p className="mb-1 font-semibold">해당 없음</p>
                <p className="flex items-center gap-2 pl-6">
                    <span className="w-[84px] shrink-0 [--chip-mark:14px]"><Mark>해당없음</Mark></span>
                    <span>또는 빈 칸</span>
                </p>
            </div>
        </div>
    );
}

export function ExcelGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[calc(100vh-32px)] gap-6 overflow-y-auto p-8 sm:max-w-[760px]">
                <div className="flex flex-col gap-2 pr-6">
                    <DialogTitle className="flex items-center gap-2 text-title font-bold">
                        <FileXls size={26} className="text-accent" aria-hidden="true" />
                        엑셀 파일 작성 방법
                    </DialogTitle>
                    <DialogDescription className={BODY}>양식을 받아 첫 줄은 그대로 두고, 둘째 줄부터 학생 한 명을 한 줄에 적습니다.</DialogDescription>
                </div>

                <Tabs defaultValue="form-a" className="gap-4">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="form-a">양식 A: 새로 편성할 때</TabsTrigger>
                        <TabsTrigger value="form-b">양식 B: 편성한 안을 고칠 때</TabsTrigger>
                    </TabsList>

                    <TabsContent value="form-a" className={`${BODY} flex flex-col gap-3`}>
                        <p>지난 학년도 명단으로 처음부터 반을 편성할 때 씁니다.</p>
                        <SheetSample
                            head={['학년', '반', '번호', '이름', '성별', '성적', '생활지도']}
                            rows={[[2, 1, 1, '김민준', '남', 950, '해당없음'], [2, 1, 2, '이서연', '여', 920, '리더(+1)'], [2, 1, 3, '박도윤', '남', 780, '행동(-2)']]}
                        />
                        <Columns
                            items={[
                                ['학년, 반, 번호', '지난 학년도의 학년, 반, 번호입니다.'],
                                ['이름', '꼭 넣습니다. 열 이름은 성명이어도 됩니다.'],
                                ['성별', '남, 여 (M, F도 됩니다)'],
                                ['성적', '숫자입니다. 비우면 500점으로 넣고 알려 드립니다.'],
                                ['생활지도', '아래 값 가운데 하나입니다. 양식에서는 목록에서 고릅니다.'],
                            ]}
                        />
                        <div>
                            <Button variant="outline" onClick={() => void downloadSampleExcel()}>
                                <DownloadSimple aria-hidden="true" />양식 A 받기
                            </Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="form-b" className={`${BODY} flex flex-col gap-3`}>
                        <p>이미 나눈 배정안을 불러와 고칠 때 씁니다. 3단계에서 <strong className="font-bold">현재 배정 수정</strong>으로 이어서 고칩니다.</p>
                        <SheetSample
                            head={['학년', '반', '번호', '성명', '생년월일', '성별', '기준성적', '생활지도', '학년', '반', '번호']}
                            highlight={[0, 1, 2]}
                            rows={[[3, 1, 1, '김배정', '2010.01.16.', '남', 950, '해당없음', 2, 2, 15], [3, 1, 2, '이수정', '2010.02.20.', '여', 880, '리더(+1)', 2, 1, 5]]}
                        />
                        <Columns
                            items={[
                                ['앞쪽 학년, 반, 번호', <><strong className="font-bold">새 학년도</strong>에 나눈 반입니다(A~C열).</>],
                                ['뒤쪽 학년, 반, 번호', '지난 학년도의 학년, 반, 번호입니다(I~K열). 전입생은 비워도 됩니다.'],
                                ['성명, 성별, 기준성적', '양식 A의 이름, 성별, 성적과 같습니다.'],
                                ['생년월일', '있어도 되고 없어도 됩니다. 앱은 읽지 않습니다.'],
                            ]}
                        />
                        <div>
                            <Button variant="outline" onClick={() => void downloadPreAssignedSampleExcel()}>
                                <DownloadSimple aria-hidden="true" />양식 B 받기
                            </Button>
                        </div>
                    </TabsContent>
                </Tabs>

                <section className={`${BODY} flex flex-col gap-2`}>
                    <h3 className={HEADING}>생활지도 값 (두 양식 공통)</h3>
                    <p>칸에 아래 글자를 그대로 넣습니다. {ONE_VALUE_RULE}</p>
                    <GuidanceValues />
                </section>

                <section className={`${BODY} flex flex-col gap-2`} data-guide-pitfalls>
                    <h3 className={`${HEADING} flex items-center gap-1.5`}><WarningCircle size={20} className="text-accent" aria-hidden="true" />자주 막히는 곳</h3>
                    <ul className="ml-5 list-disc">
                        <li><strong className="font-bold">합친 칸(셀 병합)</strong>: 합친 칸은 첫 칸에만 값이 들어갑니다. 합치기를 풀고 칸마다 값을 넣어 주세요.</li>
                        <li><strong className="font-bold">빈 줄</strong>: 명단 사이 빈 줄은 건너뜁니다. 이름만 빈 줄은 따로 알려 드립니다.</li>
                        <li><strong className="font-bold">제목 줄이 두 줄</strong>: 첫 줄이 열 이름이어야 합니다. 맨 위에 학교 이름이나 표 제목이 있으면 그 줄을 지워 주세요.</li>
                        <li><strong className="font-bold">열 이름</strong>: 이름(성명), 성별, 성적(기준성적) 열을 찾지 못하면 파일을 넣지 않고 어느 열이 없는지 알려 드립니다.</li>
                    </ul>
                </section>

                <div className="flex justify-end border-t border-line pt-[19px]">
                    <Button onClick={() => onOpenChange(false)}>확인</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
