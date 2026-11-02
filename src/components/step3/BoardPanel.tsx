'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CaretRight, CheckCircle, Handshake, Prohibit, WarningCircle, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { MINUS_TOTAL_TITLE, PLUS_TOTAL_TITLE, TOTAL_TITLE } from '@/lib/balanceTable';
import { describeScoreGapChange, type SwapRecommendation } from '@/lib/recommend';
import { previousClassOf } from '@/lib/assignment/problem';
import type { ClassFigures, SwapPreview } from '@/lib/swapPreview';
import type { CustomGroup, Student, Violation } from '@/types';
import { behaviorMark, groupsOf, relationMemo, UNASSIGNED, type RelationIndex } from './boardModel';
import { Mark, RankBadge, StudentMarks } from './StudentChip';

// 공통 디자인의 스크롤바: 평소에는 보이지 않고 마우스를 올린 곳에서만 5px로 나타납니다.

function Heading({ children }: { children: ReactNode }) {
    return <h3 className="mt-4 mb-1.5 flex items-center gap-1 text-small font-bold text-ink">{children}</h3>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-2 text-small">
            <dt className="text-soft">{label}</dt>
            <dd className="text-ink">{children}</dd>
        </div>
    );
}

export function BoardLegend() {
    return (
        <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-caption text-soft">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1"><Mark tone="level3">행-3</Mark>행동</span>
                <span className="flex items-center gap-1"><Mark tone="level2">정-2</Mark>정서</span>
                <span className="flex items-center gap-1"><Mark tone="leader">리+1</Mark>리더</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1"><Mark>고</Mark>고정 배정</span>
                <span className="flex items-center gap-1"><Mark>분</Mark>분리 배정</span>
                <span className="flex items-center gap-1"><Mark>함</Mark>함께 배정</span>
                <span className="flex items-center gap-1"><Mark>전</Mark>전출 예정</span>
            </p>
            <p>색이 있는 글자 하나는 그룹 분산의 그룹 이름 첫 글자입니다.</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1">
                    <span className="relative inline-block h-4 w-6 rounded-input border border-dashed border-accent bg-wash" />
                    <RankBadge rank={1} />추천 순위
                </span>
                <span className="flex items-center gap-1"><Prohibit size={13} className="text-danger" />분리 배정 상대</span>
                <span className="flex items-center gap-1"><Handshake size={13} className="text-ink" />함께 배정 상대</span>
            </p>
        </div>
    );
}

const FIGURE_ROWS: { label: string; title?: string; format: (f: ClassFigures) => string }[] = [
    { label: '인원', format: (f) => `${f.count}명` },
    { label: '남/여', format: (f) => `${f.male}/${f.female}` },
    { label: '평균', format: (f) => f.average.toFixed(1) },
    { label: '행동 -3', format: (f) => `${f.behavior3}명` },
    { label: '행동 -2', format: (f) => `${f.behavior2}명` },
    { label: '행동 -1', format: (f) => `${f.behavior1}명` },
    { label: '정서 -3', format: (f) => `${f.emotional3}명` },
    { label: '정서 -2', format: (f) => `${f.emotional2}명` },
    { label: '정서 -1', format: (f) => `${f.emotional1}명` },
    { label: '리더', format: (f) => `${f.leader}명` },
    { label: '-합계', title: MINUS_TOTAL_TITLE, format: (f) => String(f.minusTotal) },
    { label: '+합계', title: PLUS_TOTAL_TITLE, format: (f) => String(f.plusTotal) },
    { label: '합계', title: TOTAL_TITLE, format: (f) => String(f.guidanceTotal) },
];

// 달라지지 않는 값은 한 번만 흐리게 적고, 달라지는 값만 화살표와 함께 굵게 적습니다.
function BeforeAfter({ before, after }: { before: string; after: string }) {
    if (before === after) return <span className="whitespace-nowrap text-soft tabular-nums">{after}</span>;
    return (
        <span data-preview-changed className="whitespace-nowrap font-bold text-ink tabular-nums">
            {before} → {after}
        </span>
    );
}

function ComparisonCard({ student, partner, preview, onConfirm, onCancel }: {
    student: Student;
    partner: Student;
    preview: SwapPreview;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const [first, second] = preview.classes;
    return (
        <section data-swap-preview aria-label="교환 비교" className="mb-3 rounded-card border border-accent bg-wash p-2.5">
            <h3 className="text-body font-bold text-ink">{student.name} ↔ {partner.name}</h3>
            <p className="text-caption text-soft">바꾸면 두 반이 이렇게 달라집니다. 전출 뒤 기준입니다.</p>
            <table className="mt-2 w-full border-collapse text-caption">
                <thead>
                    <tr className="border-b border-hairline text-soft">
                        <th className="py-1 pr-1 text-left font-semibold" />
                        <th className="py-1 pr-1 text-left font-semibold">{first.className}</th>
                        <th className="py-1 text-left font-semibold">{second.className}</th>
                    </tr>
                </thead>
                <tbody>
                    {FIGURE_ROWS.map((row) => {
                        const changed = row.format(first.before) !== row.format(first.after) || row.format(second.before) !== row.format(second.after);
                        return (
                            <tr key={row.label} className="border-b border-line" data-preview-row={row.label}>
                                <th scope="row" title={row.title} className={`py-0.5 pr-1 text-left whitespace-nowrap ${changed ? 'font-bold text-ink' : 'font-normal text-soft'}`}>{row.label}</th>
                                <td className="py-0.5 pr-1"><BeforeAfter before={row.format(first.before)} after={row.format(first.after)} /></td>
                                <td className="py-0.5"><BeforeAfter before={row.format(second.before)} after={row.format(second.after)} /></td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            {preview.violations.length > 0 ? (
                <div className="mt-2 text-caption text-ink" data-preview-violations>
                    <p className="flex items-center gap-1 font-bold text-danger">
                        <WarningCircle size={14} className="shrink-0" />어기게 되는 조건 {preview.violations.length}건
                    </p>
                    <ul className="mt-1 space-y-1">
                        {preview.violations.map((v) => <li key={v.key ?? v.message}>{v.message}</li>)}
                    </ul>
                </div>
            ) : (
                <p className="mt-2 flex items-center gap-1 text-caption font-semibold text-accent-ink">
                    <CheckCircle size={14} className="shrink-0" />새로 어기는 조건이 없습니다.
                </p>
            )}
            <div className="mt-2.5 flex gap-2">
                <Button size="sm" className="flex-1" onClick={onConfirm}>바꾸기</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={onCancel}>취소</Button>
            </div>
        </section>
    );
}

function RelationList({ kind, student, partnerIds, byId }: {
    kind: 'avoid' | 'keep';
    student: Student;
    partnerIds: string[];
    byId: Map<string, Student>;
}) {
    if (partnerIds.length === 0) return null;
    const isAvoid = kind === 'avoid';
    return (
        <>
            <Heading>
                {isAvoid ? <Prohibit size={14} className="text-danger" /> : <Handshake size={14} className="text-ink" />}
                {isAvoid ? '분리 배정' : '함께 배정'}
            </Heading>
            <ul className="space-y-1">
                {partnerIds.map((id) => {
                    const partner = byId.get(id);
                    if (!partner) return null;
                    const memo = relationMemo(kind, student, partner);
                    const sameClass = !!student.assigned_class && student.assigned_class === partner.assigned_class;
                    const broken = isAvoid
                        ? sameClass
                        : !!student.assigned_class && !!partner.assigned_class && !sameClass;
                    return (
                        <li key={id} className="text-small text-ink">
                            <span className="font-semibold">{partner.name}</span>{' '}
                            <span className="text-soft">{partner.assigned_class || UNASSIGNED}</span>
                            {broken && (
                                <span className="ml-1 inline-flex items-center gap-0.5 text-caption font-semibold text-danger">
                                    <WarningCircle size={12} />
                                    {isAvoid ? '같은 반' : '다른 반'}
                                </span>
                            )}
                            {memo && <p className="text-caption text-soft">{memo}</p>}
                        </li>
                    );
                })}
            </ul>
        </>
    );
}

function SelectedDetail({
    student, groups, relations, byId, attendanceNumber, recommendations, comparePartnerId, showScores,
    onClear, onCompare, onPreviewPartner, onUnassign,
}: {
    student: Student;
    groups: CustomGroup[];
    relations: RelationIndex;
    byId: Map<string, Student>;
    attendanceNumber?: number;
    recommendations: SwapRecommendation[];
    comparePartnerId: string | null;
    showScores: boolean;
    onClear: () => void;
    onCompare: (partnerId: string) => void;
    onPreviewPartner: (partnerId: string | null) => void;
    onUnassign: () => void;
}) {
    const behavior = behaviorMark(student);
    const previous = previousClassOf(student);
    const studentGroups = groupsOf(student, groups);
    const placed = !!student.assigned_class;

    return (
        <>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h2 className="text-emph font-bold text-ink">{student.name}</h2>
                    <p className="text-small text-soft">
                        {student.assigned_class || UNASSIGNED} · {student.gender === 'M' ? '남' : '여'}
                        {showScores && ` · ${student.academic_score}점`}
                        {attendanceNumber !== undefined && ` · ${attendanceNumber}번`}
                    </p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="선택 해제" title="선택 해제">
                    <X />
                </Button>
            </div>

            <dl className="mt-2 space-y-1">
                <Row label="전학년도">{previous ? `${previous}반` : '없음'}</Row>
                <Row label="생활지도">{behavior ? behavior.label : '해당 없음'}</Row>
                {student.fixed_class && (
                    <Row label="고정 배정">
                        {student.fixed_class} 고정
                        {student.fixed_class_memo && <p className="text-caption text-soft">{student.fixed_class_memo}</p>}
                    </Row>
                )}
                {student.is_pre_transfer && <Row label="전출">전출 예정</Row>}
                {studentGroups.length > 0 && (
                    <Row label="그룹 분산">
                        <span className="flex flex-wrap gap-1">
                            {studentGroups.map((g) => (
                                <Mark key={g.id} className={g.color}>{g.name}</Mark>
                            ))}
                        </span>
                    </Row>
                )}
                {student.behavior_note && (
                    <Row label="비고"><span className="whitespace-pre-wrap">{student.behavior_note}</span></Row>
                )}
            </dl>

            <RelationList kind="avoid" student={student} partnerIds={relations.avoid.get(student.id) ?? []} byId={byId} />
            <RelationList kind="keep" student={student} partnerIds={relations.keep.get(student.id) ?? []} byId={byId} />

            <Heading>바꿔도 조건을 어기지 않는 상대 {recommendations.length}명</Heading>
            {recommendations.length === 0 && (
                <p className="text-small text-soft">
                    {placed ? '조건에 맞는 상대가 없습니다.' : '미배정 학생은 반 이름을 눌러 옮깁니다.'}
                </p>
            )}
            <ul className="space-y-1" data-recommendations>
                {recommendations.map((r, index) => {
                    const partner = byId.get(r.studentId);
                    if (!partner) return null;
                    const better = r.scoreGapChange <= -0.5;
                    const current = comparePartnerId === r.studentId;
                    return (
                        <li key={r.studentId}>
                            <button
                                type="button"
                                data-rec-row={r.studentId}
                                aria-pressed={current}
                                aria-label={`추천 ${index + 1}번 ${partner.name} 학생 ${partner.assigned_class}에서 비교하기`}
                                onClick={() => onCompare(r.studentId)}
                                onMouseEnter={() => onPreviewPartner(r.studentId)}
                                onMouseLeave={() => onPreviewPartner(null)}
                                onFocus={() => onPreviewPartner(r.studentId)}
                                onBlur={() => onPreviewPartner(null)}
                                className={`flex w-full cursor-pointer items-center gap-1.5 rounded-button border px-2 py-1 text-left transition-colors hover:border-accent hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-1 ${current ? 'border-accent bg-wash' : 'border-line'}`}
                            >
                                <RankBadge rank={index + 1} className="shrink-0" />
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-1 text-small">
                                        <span className="font-semibold text-ink">{partner.name}</span>
                                        <span className="text-soft">
                                            {partner.assigned_class}
                                            {showScores && ` · ${partner.academic_score}점`}
                                        </span>
                                        <StudentMarks
                                            student={partner}
                                            groups={groups}
                                            hasAvoid={relations.avoid.has(partner.id)}
                                            hasKeep={relations.keep.has(partner.id)}
                                        />
                                    </span>
                                    <span className={`block text-caption ${better ? 'text-accent-ink' : 'text-soft'}`}>
                                        {describeScoreGapChange(r.scoreGapChange)}
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center text-caption font-semibold text-accent-ink">
                                    비교<CaretRight size={12} />
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {placed && (
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onUnassign}>
                    미배정으로 보내기
                </Button>
            )}
            <p className="mt-2 text-caption text-soft">반 이름을 누르면 그 반으로 옮깁니다.</p>
        </>
    );
}

function EmptyDetail({ hasAssignments, violations, found, onPick }: {
    hasAssignments: boolean;
    violations: Violation[];
    found: Student[];
    onPick: (id: string) => void;
}) {
    return (
        <>
            <h2 className="text-emph font-bold text-ink">학생을 눌러 주세요</h2>
            <p className="mt-0.5 text-small text-soft">바꿔도 조건을 어기지 않는 상대를 균형이 좋아지는 순서로 보여 드립니다.</p>

            {found.length > 0 && (
                <>
                    <Heading>찾은 학생 {found.length}명</Heading>
                    <ul className="space-y-1" data-found-list>
                        {found.map((s) => (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    onClick={() => onPick(s.id)}
                                    className="flex w-full cursor-pointer items-center gap-1 rounded-input border border-line px-2 py-1 text-left text-small hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-1"
                                >
                                    <span className="font-semibold text-ink">{s.name}</span>
                                    <span className="text-soft">{s.assigned_class || UNASSIGNED}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            {!hasAssignments ? (
                <p className="mt-4 text-small text-soft">아직 배정하지 않았습니다. 학급별 균형 통계 탭에서 반편성을 시작합니다.</p>
            ) : violations.length > 0 ? (
                <div data-panel-violations>
                    <Heading><WarningCircle size={14} className="text-danger" />지키지 못한 조건 {violations.length}건</Heading>
                    <ul className="space-y-1.5">
                        {violations.map((v) => (
                            <li key={v.key ?? v.message} className="text-caption text-ink">{v.message}</li>
                        ))}
                    </ul>
                </div>
            ) : (
                <p className="mt-4 flex items-center gap-1 text-small text-accent-ink">
                    <CheckCircle size={14} className="shrink-0" />조건을 모두 지키고 있습니다.
                </p>
            )}
        </>
    );
}

interface BoardPanelProps {
    student: Student | null;
    groups: CustomGroup[];
    relations: RelationIndex;
    byId: Map<string, Student>;
    attendanceNumber?: number;
    recommendations: SwapRecommendation[];
    hasAssignments: boolean;
    violations: Violation[];
    found: Student[];
    comparePartner: Student | null;
    preview: SwapPreview | null;
    showScores: boolean;
    onPick: (id: string) => void;
    onClear: () => void;
    onCompare: (partnerId: string) => void;
    onPreviewPartner: (partnerId: string | null) => void;
    onConfirmCompare: () => void;
    onCancelCompare: () => void;
    onUnassign: () => void;
}

export function BoardPanel({
    student, groups, relations, byId, attendanceNumber, recommendations,
    hasAssignments, violations, found, comparePartner, preview, showScores,
    onPick, onClear, onCompare, onPreviewPartner, onConfirmCompare, onCancelCompare, onUnassign,
}: BoardPanelProps) {
    const ref = useRef<HTMLElement>(null);
    const studentId = student?.id;
    const partnerId = comparePartner?.id;

    // 다른 학생이나 다른 상대를 고르면 위에서부터 보여 줍니다.
    useEffect(() => {
        ref.current?.scrollTo({ top: 0 });
    }, [studentId, partnerId]);

    return (
        <aside
            ref={ref}
            aria-label="학생 정보와 추천"
            data-board-panel
            className="min-h-0 w-[280px] shrink-0 overflow-y-auto border-l border-line bg-card p-3"
        >
            {student && comparePartner && preview && (
                <ComparisonCard
                    student={student}
                    partner={comparePartner}
                    preview={preview}
                    onConfirm={onConfirmCompare}
                    onCancel={onCancelCompare}
                />
            )}
            {student ? (
                <SelectedDetail
                    student={student}
                    groups={groups}
                    relations={relations}
                    byId={byId}
                    attendanceNumber={attendanceNumber}
                    recommendations={recommendations}
                    comparePartnerId={comparePartner?.id ?? null}
                    showScores={showScores}
                    onClear={onClear}
                    onCompare={onCompare}
                    onPreviewPartner={onPreviewPartner}
                    onUnassign={onUnassign}
                />
            ) : (
                <EmptyDetail hasAssignments={hasAssignments} violations={violations} found={found} onPick={onPick} />
            )}
            <BoardLegend />
        </aside>
    );
}
