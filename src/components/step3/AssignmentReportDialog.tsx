'use client';

// 배정 결과 보고서 창입니다. 인쇄물의 미리보기이고, 같은 내용(src/lib/report.ts)을 세 탭으로 나눠 봅니다.
// 참고자료라 결재란은 없습니다. '보고서 인쇄'를 누르면 요약만 뽑을지, 이름 확인표까지 뽑을지 고릅니다.

import { useMemo, type ReactNode } from 'react';
import { CaretDown, CheckCircle, Printer, WarningCircle, XCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import type { AssignmentChange, CustomGroup, Student } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { BalanceColumn } from '@/lib/balanceTable';
import { buildReport, formatReportDate, formatReportTime, PRIVACY_NOTICE, REPORT_TITLE, type ConditionSummary, type ReportModel, type ReportStudent } from '@/lib/report';
import { buildReportHtml, type ReportPrintMode } from '@/lib/reportHtml';
import { HistoryPanel } from './HistoryPanel';

const TH = 'border-b border-line bg-canvas px-2 py-1.5 text-center text-caption font-semibold whitespace-nowrap text-soft';
const TD = 'border-b border-line px-2 py-1.5 text-center tabular-nums';

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-body font-bold text-ink">{title}</h3>
            {children}
        </section>
    );
}

function Kept({ ok }: { ok: boolean }) {
    return ok ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-accent-ink"><CheckCircle size={14} aria-hidden="true" />지킴</span>
    ) : (
        <span className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-danger"><XCircle size={14} aria-hidden="true" />못 지킴</span>
    );
}

function ConditionStatus({ status }: { status: ConditionSummary['status'] }) {
    if (status === 'none') return <span className="text-soft">– 없음</span>;
    return <Kept ok={status === 'kept'} />;
}

function Who({ student }: { student: ReportStudent }) {
    return (
        <span className="whitespace-nowrap">
            <strong className="font-semibold text-ink">{student.name}</strong> <span className="text-soft">{student.className}</span>
            {student.previous && <span className="ml-1 text-caption text-soft">{student.previous}</span>}
        </span>
    );
}

function BalanceSummary({ model }: { model: ReportModel }) {
    const { balance } = model;
    const order = ['기본', '행동', '정서', '리더', '합계', '그룹 분산'];
    const sectionOf = (c: BalanceColumn) => c.section ?? (['minusTotal', 'plusTotal', 'guidanceTotal'].includes(c.key) ? '합계' : '기본');
    const columns = order.flatMap((section) => balance.columns.filter((c) => sectionOf(c) === section));
    const head = (c: BalanceColumn) => (c.section && c.section !== '그룹 분산' ? `${c.section} ${c.label}` : c.key === 'count' ? '인원' : c.label);
    const cell = (value: string | number, flagged: boolean, key: string) => (
        <td key={key} data-flagged={flagged || undefined} className={`${TD} ${flagged ? 'bg-danger-wash font-semibold text-ink' : value === 0 ? 'text-soft' : ''}`}>
            {flagged && <b className="mr-0.5 text-danger">!</b>}
            {value}
        </td>
    );
    return (
        <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full border-collapse text-small">
                <thead>
                    <tr>
                        <th className={`${TH} text-left`}>반</th>
                        {columns.map((c) => <th key={c.key} className={TH}>{head(c)}</th>)}
                    </tr>
                </thead>
                <tbody>
                    <tr className="bg-canvas font-bold">
                        <th scope="row" className={`${TD} text-left`}>차이</th>
                        {columns.map((c) => cell(c.key === 'average' ? balance.difference.average.value.toFixed(1) : balance.difference[c.key].value, balance.difference[c.key].flagged, c.key))}
                    </tr>
                    {balance.rows.map((row) => (
                        <tr key={row.className}>
                            <th scope="row" className={`${TD} text-left font-bold text-ink`}>{row.className}</th>
                            {columns.map((c) => cell(row.cells[c.key].value, row.cells[c.key].flagged, c.key))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function SummaryTab({ model }: { model: ReportModel }) {
    const { meta } = model;
    const facts: [string, string][] = [
        ['작업 이름', meta.workName ?? '저장하지 않은 작업'],
        ['편성 날짜', meta.assignedAt ? formatReportDate(meta.assignedAt) : '기록 없음'],
        ['반 수', `${meta.classCount}개 반`],
        ['인원', meta.transferCount > 0 ? `전출 전 ${meta.totalBefore}명 · 전출 뒤 ${meta.totalAfter}명` : `${meta.totalAfter}명`],
        ['남녀 (전출 뒤)', `남 ${meta.maleAfter}명 · 여 ${meta.femaleAfter}명`],
        ['손으로 바꾼 횟수', `${model.manualChangeCount}회`],
    ];
    return (
        <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-card border border-line p-4 text-body md:grid-cols-3" data-report-facts>
                {facts.map(([label, value]) => (
                    <div key={label} className="flex gap-2">
                        <dt className="shrink-0 text-soft">{label}</dt>
                        <dd className="font-semibold text-ink">{value}</dd>
                    </div>
                ))}
            </dl>
            <Section title="조건 지킴">
                <div className="divide-y divide-line rounded-card border border-line" data-report-conditions>
                    {model.conditions.map((c) => (
                        <div key={c.key} className="grid grid-cols-[96px_96px_minmax(0,1fr)] items-center gap-3 px-4 py-2 text-body">
                            <span className="font-semibold text-ink">{c.label}</span>
                            <ConditionStatus status={c.status} />
                            <span className="text-small text-soft">{c.detail}</span>
                        </div>
                    ))}
                </div>
            </Section>
            <Section title="반별 균형">
                <p className="text-small text-soft">전출 뒤 기준입니다. <b className="text-danger">!</b>는 다른 반보다 몰린 칸입니다. 학급별 균형 통계 표와 같습니다.</p>
                <BalanceSummary model={model} />
            </Section>
        </div>
    );
}

function CheckTab({ model }: { model: ReportModel }) {
    const none = <p className="text-small text-soft">없음</p>;
    return (
        <div className="space-y-6">
            <Section title={`지키지 못한 조건 ${model.unmet.length}건`}>
                {model.unmet.length === 0 ? none : (
                    <ul className="space-y-1 rounded-card border border-danger/30 bg-danger-wash/40 p-3" data-report-unmet>
                        {model.unmet.map((v) => (
                            <li key={v.key ?? v.message} className="flex items-start gap-1.5 text-small text-ink">
                                <WarningCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />{v.message}
                            </li>
                        ))}
                    </ul>
                )}
            </Section>
            <Section title="분리 배정 · 함께 배정">
                {model.pairs.length === 0 ? none : (
                    <table className="w-full border-collapse overflow-hidden rounded-card text-small" data-report-pairs>
                        <thead><tr><th className={`${TH} text-left`}>구분</th><th className={`${TH} text-left`}>학생</th><th className={`${TH} text-left`}>학생</th><th className={TH}>결과</th></tr></thead>
                        <tbody>
                            {model.pairs.map((p, i) => (
                                <tr key={i}>
                                    <td className={`${TD} text-left whitespace-nowrap`}>{p.kind === 'avoid' ? '분리 배정' : '함께 배정'}</td>
                                    <td className={`${TD} text-left`}><Who student={p.a} /></td>
                                    <td className={`${TD} text-left`}><Who student={p.b} /></td>
                                    <td className={TD}><Kept ok={p.kept} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>
            <Section title="고정 배정">
                {model.fixed.length === 0 ? none : (
                    <table className="w-full border-collapse text-small">
                        <thead><tr><th className={`${TH} text-left`}>학생</th><th className={TH}>고정 반</th><th className={TH}>결과</th></tr></thead>
                        <tbody>
                            {model.fixed.map((f, i) => (
                                <tr key={i}>
                                    <td className={`${TD} text-left`}><Who student={f.student} /></td>
                                    <td className={TD}>{f.target}</td>
                                    <td className={TD}><Kept ok={f.kept} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </Section>
            <Section title="그룹별 반 나뉨">
                {model.groups.length === 0 ? none : model.groups.map((g) => (
                    <div key={g.name} className="rounded-card border border-line p-3">
                        <p className="mb-1 flex items-center gap-2 text-small font-semibold text-ink">{g.name} <Kept ok={g.kept} /></p>
                        <p className="text-small text-ink">
                            {g.classes.filter((c) => c.names.length > 0).map((c) => (
                                <span key={c.className} className="mr-3 inline-block"><span className="text-soft">{c.className} {c.names.length}명</span> {c.names.join(', ')}</span>
                            ))}
                        </p>
                    </div>
                ))}
            </Section>
            <Section title={`전출 예정 ${model.transfers.length}명`}>
                {model.transfers.length === 0 ? none : (
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-small">{model.transfers.map((t, i) => <Who key={i} student={t} />)}</p>
                )}
            </Section>
        </div>
    );
}

export function AssignmentReportDialog({
    open,
    onOpenChange,
    students,
    groups,
    history,
    classCount,
    workName,
    assignedAt,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    students: Student[];
    groups: CustomGroup[];
    history: AssignmentChange[];
    classCount: number;
    workName: string | null;
    assignedAt: number | null;
}) {
    const model = useMemo(
        () => (open ? buildReport({ students, groups, classCount, history, workName, assignedAt }) : null),
        [open, students, groups, classCount, history, workName, assignedAt],
    );

    const handlePrint = async (mode: ReportPrintMode) => {
        if (!model) return;
        const html = buildReportHtml(model, { mode, printedAt: formatReportTime(Date.now()) });
        if (window.electronAPI) {
            const opened = await window.electronAPI.printPreview(html).catch(() => false);
            if (!opened) toast.error('인쇄 미리보기를 열지 못했습니다. 다시 시도해 주세요.');
            return;
        }
        // 앱 밖(개발용 브라우저)에서는 숨긴 틀에 넣어 인쇄합니다.
        document.getElementById('print-frame')?.remove();
        const iframe = document.createElement('iframe');
        iframe.id = 'print-frame';
        Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
        document.body.appendChild(iframe);
        const frame = iframe.contentWindow;
        if (!frame) return;
        frame.document.write(html);
        frame.document.close();
        frame.focus();
        frame.print();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent id="report-dialog-content" className="flex h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
                <DialogHeader className="p-6 pb-2">
                    <DialogTitle className="text-title font-bold">{REPORT_TITLE}</DialogTitle>
                    <DialogDescription>인쇄물과 같은 내용입니다. 참고자료이고, 반별 학생 명단은 배정 결과 엑셀로 받습니다.</DialogDescription>
                </DialogHeader>

                {model && (
                    <Tabs defaultValue="summary" className="flex min-h-0 flex-1 flex-col gap-0">
                        <div className="border-b border-line px-6">
                            <TabsList className="h-11 justify-start gap-6 bg-transparent p-0">
                                {[
                                    ['summary', '요약'],
                                    ['check', `조건 확인${model.unmet.length > 0 ? ` (못 지킴 ${model.unmet.length})` : ''}`],
                                    ['history', `바꾼 기록 (${model.history.length})`],
                                ].map(([value, label]) => (
                                    <TabsTrigger
                                        key={value}
                                        value={value}
                                        className="h-full flex-none rounded-none border-0 border-b-2 border-transparent px-2 data-[state=active]:border-accent data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                                    >
                                        {label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-6">
                            <TabsContent value="summary" className="m-0"><SummaryTab model={model} /></TabsContent>
                            <TabsContent value="check" className="m-0">
                                <p className="mb-4 text-small text-soft">{PRIVACY_NOTICE} 인쇄할 때 '요약 + 이름 확인표'를 고르면 이 내용이 들어갑니다.</p>
                                <CheckTab model={model} />
                            </TabsContent>
                            <TabsContent value="history" className="m-0">
                                {history.length === 0 ? (
                                    <p className="py-16 text-center text-body text-soft">배정한 뒤 바꾼 기록이 없습니다. 직접 바꾸거나 현재 배정 수정, 균형 조정을 하면 여기에 남습니다.</p>
                                ) : (
                                    <HistoryPanel history={history} students={students} />
                                )}
                            </TabsContent>
                        </div>
                    </Tabs>
                )}

                <div className="flex justify-between border-t border-line bg-canvas p-4 px-6">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2 data-[state=open]:bg-wash">
                                <Printer aria-hidden="true" />보고서 인쇄<CaretDown aria-hidden="true" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" side="top" className="w-[300px]">
                            <DropdownMenuItem onSelect={() => void handlePrint('summary')}>
                                <span className="flex flex-col">
                                    <span className="font-semibold">요약만</span>
                                    <span className="text-caption text-soft">개요, 반별 균형, 조건 지킴. 학생 이름이 없습니다.</span>
                                </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => void handlePrint('names')}>
                                <span className="flex flex-col">
                                    <span className="font-semibold">요약 + 이름 확인표</span>
                                    <span className="text-caption text-soft">조건별 학생 이름과 바꾼 기록까지. 쪽마다 개인정보 안내가 찍힙니다.</span>
                                </span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <Button onClick={() => onOpenChange(false)}>닫기</Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
