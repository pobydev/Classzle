'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { CaretRight, CheckCircle, Handshake, Prohibit, WarningCircle, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { HelpTip } from '@/components/common/HelpTip';
import { MINUS_TOTAL_TITLE, PLUS_TOTAL_TITLE, TOTAL_TITLE, type CrowdedClass } from '@/lib/balanceTable';
import { describeRecommendation, GUIDANCE_STEP_PERCENT, MAX_SCORE_GAP_PERCENT, type RecommendMode, type SwapRecommendation } from '@/lib/recommend';
import { previousClassOf, sameClass } from '@/lib/assignment/problem';
import type { ClassFigures, SwapPreview } from '@/lib/swapPreview';
import type { CustomGroup, Student, Violation } from '@/types';
import { behaviorMark, groupsOf, relationMemo, UNASSIGNED, type RelationIndex } from './boardModel';
import { Mark, RankBadge, StudentMarks, LEVEL_BG } from './StudentChip';

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

// 보드 위 ? 상자의 내용입니다. 표시 → 뜻을 짝지어 보여 줍니다. 늘 보이는 범례는 두지 않고, 표시마다 마우스를 올려도 짧은 뜻이 나옵니다.
// 그룹은 이 작업의 실제 그룹으로 보여 주고, 그룹이 없으면 그 줄을 숨깁니다.
function Pair({ mark, children }: { mark: ReactNode; children: ReactNode }) {
    return (
        <li className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-x-2">
            <span className="flex flex-wrap items-center gap-1">{mark}</span>
            <span className="text-ink">{children}</span>
        </li>
    );
}

function HeadSample({ children, flagged = false }: { children: ReactNode; flagged?: boolean }) {
    return (
        <span className={`inline-flex h-[18px] items-center gap-[3px] rounded-[4px] px-[3px] text-caption tabular-nums ${flagged ? 'bg-danger-wash' : 'bg-surface-hover'}`}>
            {children}
        </span>
    );
}

export function BoardMarksHelp({ groups }: { groups: CustomGroup[] }) {
    const title = 'mb-1 text-caption font-semibold text-soft';
    return (
        <div data-board-marks-help className="space-y-3 text-small">
            <section>
                <h4 className={title}>생활지도 (행은 행동, 정은 정서)</h4>
                <ul className="space-y-1">
                    <Pair mark={<span className={`flex items-center rounded-input px-1 py-px ${LEVEL_BG.strong}`}><Mark tone="level3">행-3</Mark></span>}>-3, 이름 칸에 진한 바탕</Pair>
                    <Pair mark={<span className={`flex items-center rounded-input px-1 py-px ${LEVEL_BG.soft}`}><Mark tone="level2">정-2</Mark></span>}>-2, 이름 칸에 옅은 바탕</Pair>
                    <Pair mark={<Mark tone="level1">행-1</Mark>}>-1, 바탕 없음</Pair>
                    <Pair mark={<><span className="text-accent" aria-hidden="true">★</span><Mark tone="leader">리+2</Mark><Mark tone="leader">리+1</Mark></>}>리더 +2, +1. 이름 앞에 ★</Pair>
                </ul>
            </section>
            <section>
                <h4 className={title}>반 이름 아래 숫자 (전출 뒤 기준)</h4>
                <ul className="space-y-1">
                    <Pair mark={<span className="text-caption text-soft">27명 (전출 전 28)</span>}>전출 예정 학생을 뺀 인원</Pair>
                    <Pair mark={<HeadSample><span className="text-soft">-3</span><b className="text-ink">1</b></HeadSample>}>-3 학생 1명 (행동과 정서를 합침)</Pair>
                    <Pair mark={<HeadSample><span className="text-accent">★</span><b className="text-ink">3</b></HeadSample>}>리더 3명</Pair>
                    <Pair mark={<HeadSample flagged><b className="text-danger">!</b><span className="text-soft">-2</span><b className="text-ink">4</b></HeadSample>}>다른 반보다 몰림 (통계표의 빨간 칸과 같음)</Pair>
                </ul>
            </section>
            <section>
                <h4 className={title}>조건</h4>
                <ul className="space-y-1">
                    <Pair mark={<Mark>고</Mark>}>고정 배정</Pair>
                    <Pair mark={<Mark>분</Mark>}>분리 배정</Pair>
                    <Pair mark={<Mark>함</Mark>}>함께 배정</Pair>
                    <Pair mark={<Mark>전</Mark>}>전출 예정</Pair>
                    {groups.length > 0 && (
                        <Pair mark={groups.map((g) => <Mark key={g.id} className={g.color}>{g.name.slice(0, 1)}</Mark>)}>
                            그룹 이름 첫 글자: {groups.map((g) => g.name).join(', ')}
                        </Pair>
                    )}
                </ul>
            </section>
            <section>
                <h4 className={title}>학생을 눌렀을 때</h4>
                <ul className="space-y-1">
                    <Pair mark={<span className="relative inline-block h-4 w-7 rounded-input border border-dashed border-accent bg-wash"><RankBadge rank={1} className="absolute -top-1.5 -right-1.5" /></span>}>바꿔도 조건을 어기지 않는 상대와 추천 번호</Pair>
                    <Pair mark={<Prohibit size={14} className="text-danger" />}>분리 배정 상대 (빨간 테두리)</Pair>
                    <Pair mark={<Handshake size={14} className="text-ink" />}>함께 배정 상대 (진한 테두리)</Pair>
                </ul>
            </section>
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
                    const together = sameClass(student.assigned_class, partner.assigned_class);
                    const broken = isAvoid
                        ? together
                        : !!student.assigned_class && !!partner.assigned_class && !together;
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

// 추천 방식 전환입니다. 고른 방식은 앱 설정에 기억합니다.
function RecommendModeSwitch({ mode, onChange }: { mode: RecommendMode; onChange: (mode: RecommendMode) => void }) {
    const item = (value: RecommendMode, label: string) => (
        <button
            type="button"
            aria-pressed={mode === value}
            onClick={() => onChange(value)}
            className={`h-[24px] cursor-pointer rounded-input px-2 text-caption transition-colors focus-visible:outline-2 ${mode === value ? 'bg-card font-bold text-accent-ink shadow-card' : 'text-soft hover:text-ink'}`}
        >
            {label}
        </button>
    );
    return (
        <div role="group" aria-label="추천 방식" data-recommend-mode={mode} className="inline-flex gap-0.5 rounded-button bg-surface-hover p-[3px]">
            {item('guidance', '생활지도까지')}
            {item('score', '성적만')}
        </div>
    );
}

function SelectedDetail({
    student, groups, relations, byId, attendanceNumber, recommendations, comparePartnerId, showScores,
    recommendMode, onRecommendModeChange,
    onClear, onCompare, onPreviewPartner, onUnassign,
}: {
    recommendMode: RecommendMode;
    onRecommendModeChange: (mode: RecommendMode) => void;
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
            <div className="mb-1.5 flex items-center gap-1.5">
                <RecommendModeSwitch mode={recommendMode} onChange={onRecommendModeChange} />
                <HelpTip label="추천 방식" width={300}>
                    <p><strong>생활지도까지</strong>: 성적과 생활지도가 닮은 학생만 보여 줍니다. 점수 차이가 같은 성별 최고점과 최저점 차이의 {MAX_SCORE_GAP_PERCENT}% 안이고 생활지도가 한 칸 이하로 달라야 합니다. 바꿔도 -3, -2, 리더가 몰리지 않습니다.</p>
                    <p>순서는 성적 차이가 작은 순입니다. 생활지도가 한 칸 다르면 그 범위의 {GUIDANCE_STEP_PERCENT}%만큼 성적 차이가 더 나는 것으로 칩니다.</p>
                    <p><strong>성적만</strong>: 필수 조건만 지키고 성적이 가까운 순서로 보여 줍니다. 생활지도가 다르거나 몰림이 생기면 줄에 빨간 글로 알려 드리니, 알고 고릅니다.</p>
                </HelpTip>
            </div>
            {recommendations.length === 0 && (
                <p className="text-small text-soft">
                    {!placed
                        ? '미배정 학생은 반 이름을 눌러 옮깁니다.'
                        : recommendMode === 'guidance'
                            ? '생활지도까지 닮은 상대가 없습니다. 성적만을 누르면 성적이 가까운 학생을 볼 수 있습니다.'
                            : '조건에 맞는 상대가 없습니다.'}
                </p>
            )}
            {placed && recommendMode === 'guidance' && recommendations.length > 0 && recommendations.length < 3 && (
                <p className="mb-1.5 text-small text-soft" data-rec-few>생활지도까지 맞는 상대가 적습니다. 성적만을 누르면 더 볼 수 있습니다.</p>
            )}
            <ul className="space-y-1" data-recommendations>
                {recommendations.map((r, index) => {
                    const partner = byId.get(r.studentId);
                    if (!partner) return null;
                    // 생활지도가 같으면 평소 색, 한 칸 차이나 다름이면 눈에 띄게 둡니다. 글에도 '같음', '한 칸 차이', '다름'이 들어갑니다.
                    const guidanceDiffers = r.guidanceChange !== null;
                    const current = comparePartnerId === r.studentId;
                    // 몰림 경고가 붙은 줄은 왼쪽에 빨간 줄을 둬서 훑어볼 때 바로 보이게 합니다.
                    const warned = r.warnings.length > 0;
                    return (
                        <li key={r.studentId}>
                            <button
                                type="button"
                                data-rec-row={r.studentId}
                                data-rec-warned={warned || undefined}
                                aria-pressed={current}
                                aria-label={`추천 ${index + 1}번 ${partner.name} 학생 ${partner.assigned_class}에서 비교하기`}
                                onClick={() => onCompare(r.studentId)}
                                onMouseEnter={() => onPreviewPartner(r.studentId)}
                                onMouseLeave={() => onPreviewPartner(null)}
                                onFocus={() => onPreviewPartner(r.studentId)}
                                onBlur={() => onPreviewPartner(null)}
                                className={`flex w-full cursor-pointer items-center gap-1.5 rounded-button border px-2 py-1 text-left transition-colors hover:border-accent hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-1 ${current ? 'border-accent bg-wash' : warned ? 'border-danger/40' : 'border-line'} ${warned ? 'border-l-[3px] border-l-danger' : ''}`}
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
                                    <span data-rec-guidance={guidanceDiffers ? 'differs' : 'same'} className={`block text-caption ${guidanceDiffers ? 'font-semibold text-accent-ink' : 'text-soft'}`}>
                                        {describeRecommendation(r, recommendMode)}
                                    </span>
                                    {r.warnings.map((warning) => (
                                        <span key={warning} data-rec-warning className="block text-caption font-semibold text-danger">! {warning}</span>
                                    ))}
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

// 학생을 고르지 않았을 때는 '손볼 곳'을 보여 줍니다. 지키지 못한 조건, 몰린 반, 미배정 학생 순서입니다.
// 칸을 접었다 펴지 않습니다. 보드가 출렁이지 않게 하려는 것입니다.
function FixButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full cursor-pointer items-start gap-1 rounded-input border border-line px-2 py-1.5 text-left text-caption text-ink hover:border-accent hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-1"
        >
            <span className="min-w-0 flex-1">{children}</span>
            <CaretRight size={12} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden="true" />
        </button>
    );
}

function EmptyDetail({ hasAssignments, violations, crowded, unassigned, found, onPick, onOpenClass }: {
    hasAssignments: boolean;
    violations: Violation[];
    crowded: CrowdedClass[];
    unassigned: Student[];
    found: Student[];
    onPick: (id: string) => void;
    onOpenClass: (className: string) => void;
}) {
    // 미배정 학생은 아래에 이름으로 따로 보여 주므로 '반이 정해지지 않은 학생' 줄은 뺍니다.
    const unmet = violations.filter((v) => v.type !== 'UNASSIGNED');
    const total = unmet.length + crowded.length + (unassigned.length > 0 ? 1 : 0);
    return (
        <>
            {found.length > 0 && (
                <>
                    <h3 className="mb-1.5 text-small font-bold text-ink">찾은 학생 {found.length}명</h3>
                    <ul className="mb-3 space-y-1" data-found-list>
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
                <>
                    <h2 className="text-emph font-bold text-ink">아직 배정하지 않았습니다</h2>
                    <p className="mt-0.5 text-small text-soft">학급별 균형 통계 탭에서 배정 실행을 눌러 주세요.</p>
                </>
            ) : total === 0 ? (
                <div data-panel-fixes="none">
                    <h2 className="flex items-center gap-1 text-emph font-bold text-ink">
                        <CheckCircle size={16} className="shrink-0 text-accent" aria-hidden="true" />손볼 곳이 없습니다
                    </h2>
                    <p className="mt-0.5 text-small text-soft">조건을 모두 지키고 몰린 반도 없습니다. 학생을 누르면 바꿔도 조건을 어기지 않는 상대를 보여 드립니다.</p>
                </div>
            ) : (
                <div data-panel-fixes>
                    <h2 className="text-emph font-bold text-ink">손볼 곳</h2>
                    <p className="mt-0.5 text-small text-soft">누르면 그 학생이나 반으로 갑니다. 학생을 누르면 바꿀 상대를 보여 드립니다.</p>

                    {unmet.length > 0 && (
                        <div data-panel-violations>
                            <Heading><WarningCircle size={14} className="text-danger" />지키지 못한 조건 {unmet.length}건</Heading>
                            <ul className="space-y-1">
                                {unmet.map((v) => {
                                    const target = v.studentIds[0];
                                    const open = target ? () => onPick(target) : v.className ? () => onOpenClass(v.className!) : null;
                                    return (
                                        <li key={v.key ?? v.message}>
                                            {open ? <FixButton onClick={open}>{v.message}</FixButton> : <p className="px-2 text-caption text-ink">{v.message}</p>}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {crowded.length > 0 && (
                        <div data-panel-crowded>
                            <Heading><span className="font-bold text-danger" aria-hidden="true">!</span>몰린 반 {crowded.length}개</Heading>
                            <ul className="space-y-1">
                                {crowded.map((c) => (
                                    <li key={c.className}>
                                        <FixButton onClick={() => onOpenClass(c.className)}>
                                            <b className="font-semibold">{c.className}</b> {c.items.join(' · ')}
                                        </FixButton>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {unassigned.length > 0 && (
                        <div data-panel-unassigned>
                            <Heading>미배정 학생 {unassigned.length}명</Heading>
                            <p className="mb-1 text-caption text-soft">학생을 누른 뒤 보드의 반 이름을 누르면 그 반에 넣습니다.</p>
                            <ul className="flex flex-wrap gap-1">
                                {unassigned.map((s) => (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            onClick={() => onPick(s.id)}
                                            className="cursor-pointer rounded-input border border-line px-1.5 py-0.5 text-caption text-ink hover:border-accent hover:bg-wash focus-visible:outline-2"
                                        >
                                            {s.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
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
    crowded: CrowdedClass[];
    unassigned: Student[];
    onOpenClass: (className: string) => void;
    found: Student[];
    comparePartner: Student | null;
    preview: SwapPreview | null;
    showScores: boolean;
    recommendMode: RecommendMode;
    onRecommendModeChange: (mode: RecommendMode) => void;
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
    hasAssignments, violations, crowded, unassigned, onOpenClass, found, comparePartner, preview, showScores, recommendMode, onRecommendModeChange,
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
                    recommendMode={recommendMode}
                    onRecommendModeChange={onRecommendModeChange}
                    onClear={onClear}
                    onCompare={onCompare}
                    onPreviewPartner={onPreviewPartner}
                    onUnassign={onUnassign}
                />
            ) : (
                <EmptyDetail
                    hasAssignments={hasAssignments}
                    violations={violations}
                    crowded={crowded}
                    unassigned={unassigned}
                    found={found}
                    onPick={onPick}
                    onOpenClass={onOpenClass}
                />
            )}
        </aside>
    );
}
