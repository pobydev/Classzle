'use client';

import { memo, type ReactNode } from 'react';
import { Handshake, Prohibit } from '@phosphor-icons/react';
import type { CustomGroup, Student } from '@/types';
import { behaviorMark, groupsOf, type MarkTone } from './boardModel';

const TONE_CLASS: Record<MarkTone, string> = {
    level3: 'bg-danger-wash text-danger',
    level2: 'bg-surface-hover text-danger',
    level1: 'bg-surface-hover text-ink',
    leader: 'bg-tint text-accent-ink',
    plain: 'bg-surface-hover text-ink',
};

export function Mark({ tone = 'plain', className, title, children }: {
    tone?: MarkTone;
    className?: string;
    title?: string;
    children: ReactNode;
}) {
    return (
        <span
            title={title}
            className={`inline-flex h-[calc(var(--chip-mark,11px)+5px)] shrink-0 items-center rounded-full px-[3px] text-[length:var(--chip-mark,11px)] leading-none font-bold whitespace-nowrap ${className ?? TONE_CLASS[tone]}`}
        >
            {children}
        </span>
    );
}

export function RankBadge({ rank, className = '' }: { rank: number; className?: string }) {
    return (
        <span className={`inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-0.5 text-micro leading-none font-bold text-white ${className}`}>
            {rank}
        </span>
    );
}

export function StudentMarks({ student, groups, hasAvoid, hasKeep }: {
    student: Student;
    groups: CustomGroup[];
    hasAvoid: boolean;
    hasKeep: boolean;
}) {
    const behavior = behaviorMark(student);
    return (
        <>
            {behavior && <Mark tone={behavior.tone} title={behavior.label}>{behavior.text}</Mark>}
            {/* 표시에 마우스를 올리면 짧은 뜻이 나옵니다. 모아 본 뜻은 보드 위 ? 에 있습니다. */}
            {student.fixed_class && <Mark title={`고정 배정 (${student.fixed_class})`}>고</Mark>}
            {hasAvoid && <Mark title="분리 배정">분</Mark>}
            {hasKeep && <Mark title="함께 배정">함</Mark>}
            {student.is_pre_transfer && <Mark title="전출 예정">전</Mark>}
            {groupsOf(student, groups).map((g) => (
                <Mark key={g.id} className={g.color} title={`그룹: ${g.name}`}>{g.name.slice(0, 1)}</Mark>
            ))}
        </>
    );
}

export type ChipRelation = 'avoid' | 'keep' | null;

interface StudentChipProps {
    student: Student;
    groups: CustomGroup[];
    hasAvoid: boolean;
    hasKeep: boolean;
    selected: boolean;
    // 추천 순위입니다. 추천 상대가 아니면 null입니다.
    rank: number | null;
    relation: ChipRelation;
    found: boolean;
    dimmed: boolean;
    // 패널에서 이 학생의 추천 줄에 마우스나 초점이 있습니다.
    emphasized: boolean;
    // 비교 화면의 상대입니다.
    partner: boolean;
    wide: boolean;
    showScore: boolean;
    attendanceNumber?: number;
    onSelect: (id: string) => void;
}

// 생활지도 바탕: -3은 진한, -2는 옅은 따뜻한 바탕입니다. -1과 리더는 바탕 없이 배지만 씁니다.
export type ChipLevel = 'strong' | 'soft' | null;
export function chipLevelOf(student: Pick<Student, 'behavior_type' | 'behavior_score'>): ChipLevel {
    if (student.behavior_type === 'LEADER' || student.behavior_type === 'NONE') return null;
    if (student.behavior_score <= -3) return 'strong';
    if (student.behavior_score === -2) return 'soft';
    return null;
}
export const LEVEL_BG: Record<Exclude<ChipLevel, null>, string> = {
    strong: 'bg-guidance-strong',
    soft: 'bg-guidance-soft',
};

// 생활지도 바탕이 있는 칩은 바탕을 그대로 두고 테두리와 고리로만 상태를 보여 줍니다.
// 그래서 고른 학생, 추천, 비교 상대도 -3, -2 바탕과 함께 알아볼 수 있습니다.
function stateClass({ selected, rank, relation, found, emphasized, partner }: StudentChipProps, level: ChipLevel): string {
    const bg = (state: string) => (level ? LEVEL_BG[level] : state);
    if (selected) return `border-accent ring-2 ring-accent ${bg('bg-tint')}`;
    if (partner) return `border-dashed border-accent ring-2 ring-accent ${bg('bg-tint')}`;
    const recommended = rank !== null;
    const emphasis = emphasized ? ' ring-2 ring-accent' : '';
    // 상대 표시는 점선 여부, 테두리 색, 아이콘이 따로 움직입니다. 추천이면서 분리 배정 상대일 수 있습니다.
    const line = recommended ? 'border-dashed' : 'border-solid';
    if (relation === 'avoid') return `${line} border-danger ${bg('bg-danger-wash')}${emphasis}`;
    if (relation === 'keep') return `${line} border-ink ${bg('bg-surface-hover')}${emphasis}`;
    if (recommended) return `border-dashed border-accent ${bg(emphasized ? 'bg-tint' : 'bg-wash')}${emphasis}`;
    if (found) return `border-accent-ink ${bg('bg-tint')}`;
    return level ? `border-transparent ${LEVEL_BG[level]} hover:border-hairline` : 'border-transparent hover:bg-surface-hover';
}

export const StudentChip = memo(function StudentChip(props: StudentChipProps) {
    const {
        student, groups, hasAvoid, hasKeep, selected, rank, relation, found, dimmed,
        partner, wide, showScore, attendanceNumber, onSelect,
    } = props;
    const gender = student.gender === 'M' ? '남' : '여';
    const level = chipLevelOf(student);
    const isLeader = student.behavior_type === 'LEADER' && student.behavior_score > 0;
    const relationLabel = relation === 'avoid' ? '분리 배정 상대' : relation === 'keep' ? '함께 배정 상대' : null;
    const title = [
        student.name,
        gender,
        showScore ? `${student.academic_score}점` : null,
        relationLabel,
        rank !== null ? `추천 ${rank}번` : null,
    ].filter(Boolean).join(' · ');
    // 순위와 관계 아이콘은 글자 줄 밖에 겹쳐 놓습니다. 고를 때마다 칩 높이가 달라져 명단이 밀리지 않게 합니다.
    const relationIcon = relation === 'avoid'
        ? <Prohibit size={13} className="text-danger" aria-label="분리 배정 상대" />
        : relation === 'keep'
            ? <Handshake size={13} className="text-ink" aria-label="함께 배정 상대" />
            : null;

    return (
        <button
            type="button"
            aria-pressed={selected}
            data-chip
            data-student-id={student.id}
            data-rank={rank ?? undefined}
            data-relation={relation ?? undefined}
            data-partner={partner || undefined}
            data-found={found || undefined}
            data-level={level ?? undefined}
            title={title}
            onClick={() => onSelect(student.id)}
            className={`relative flex w-full min-w-0 scroll-mt-16 cursor-pointer flex-wrap content-center items-center gap-x-[3px] rounded-input border px-[3px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 ${wide ? 'min-h-[30px] text-body' : 'min-h-[var(--chip-h,25px)] text-[length:var(--chip-font,13px)] leading-[1.3]'} ${stateClass(props, level)} ${dimmed ? 'opacity-30' : ''}`}
        >
            {relationIcon && (
                <span className={wide ? 'shrink-0' : 'absolute -top-1 -left-1 z-[1] rounded-full bg-card'}>{relationIcon}</span>
            )}
            {rank !== null && (
                <RankBadge rank={rank} className={wide ? 'shrink-0' : 'absolute -top-1 -right-0.5 z-[1]'} />
            )}
            {wide && (
                <span className="w-6 shrink-0 text-right text-caption text-soft tabular-nums">{attendanceNumber ?? ''}</span>
            )}
            {/* 이름은 줄이지 않습니다. 칸보다 긴 이름만 말줄임이 됩니다. 리더는 이름 앞에 ★를 둡니다. */}
            <span className={`max-w-full shrink-0 truncate font-medium text-ink ${wide ? 'ml-1' : ''}`}>
                {isLeader && <span className="mr-px text-accent" aria-hidden="true">★</span>}
                {student.name}
            </span>
            <span className={`shrink-0 text-soft ${wide ? 'text-caption' : 'text-[length:var(--chip-sub,12px)]'}`}>{gender}</span>
            {showScore && !wide && (
                <span data-chip-score className="shrink-0 text-[length:var(--chip-sub,12px)] text-soft tabular-nums">
                    {/* 좁은 칸에서는 정수로 줄입니다. 소수점까지는 칩의 도움말, 패널, 두 반 보기에 나옵니다. */}
                    <span className="@min-[160px]:hidden">{Math.round(student.academic_score)}</span>
                    <span className="hidden @min-[160px]:inline">{student.academic_score}</span>
                </span>
            )}
            <StudentMarks student={student} groups={groups} hasAvoid={hasAvoid} hasKeep={hasKeep} />
            {wide && selected && <Mark className="bg-accent text-white">선택</Mark>}
            {wide && partner && <Mark className="bg-accent text-white">상대</Mark>}
            {showScore && wide && (
                <span data-chip-score className="ml-auto shrink-0 pr-1 text-caption text-soft tabular-nums">{student.academic_score}점</span>
            )}
        </button>
    );
});
