'use client';

import { memo, type ReactNode } from 'react';
import { Handshake, Prohibit } from '@phosphor-icons/react';
import type { CustomGroup, Student } from '@/types';
import { behaviorMark, groupsOf, guidanceTone, isDarkTone, TONE_CLASS, type GuidanceTone, type MarkTone } from './boardModel';

// 표시가 놓이는 바탕입니다. 생활지도 색을 칠한 칸 위에서는 표시를 반투명 흰 바탕으로 둡니다(진한 칸은 흰 글자).
export type MarkSurface = 'plain' | 'light' | 'dark';
const SURFACE_CLASS: Record<Exclude<MarkSurface, 'plain'>, string> = {
    light: 'bg-white/55 text-inherit',
    dark: 'bg-white/20 text-white',
};

export function Mark({ tone = 'plain', surface = 'plain', className, title, children }: {
    tone?: MarkTone;
    surface?: MarkSurface;
    className?: string;
    title?: string;
    children: ReactNode;
}) {
    const toneClass = surface !== 'plain' ? SURFACE_CLASS[surface] : tone === 'plain' ? 'bg-surface-hover text-ink' : TONE_CLASS[tone];
    return (
        <span
            title={title}
            className={`inline-flex h-[calc(var(--chip-mark,11px)+5px)] shrink-0 items-center rounded-full px-[3px] text-[length:var(--chip-mark,11px)] leading-none font-bold whitespace-nowrap ${className ?? toneClass}`}
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

// surface: 칠한 칸 위에 놓으면 'light'나 'dark'입니다. 따로 놓으면(패널, 안내) 'plain'이고 생활지도 표시에 그 색을 씁니다.
// 그룹 첫 글자는 어느 바탕에서도 그룹 색 그대로 둡니다.
export function StudentMarks({ student, groups, hasAvoid, hasKeep, surface = 'plain' }: {
    student: Student;
    groups: CustomGroup[];
    hasAvoid: boolean;
    hasKeep: boolean;
    surface?: MarkSurface;
}) {
    const behavior = behaviorMark(student);
    return (
        <>
            {behavior && <Mark tone={behavior.tone} surface={surface} title={behavior.label}>{behavior.text}</Mark>}
            {/* 표시에 마우스를 올리면 짧은 뜻이 나옵니다. 모아 본 뜻은 보드 위 ? 에 있습니다. */}
            {student.fixed_class && <Mark surface={surface} title={`고정 배정 (${student.fixed_class})`}>고</Mark>}
            {hasAvoid && <Mark surface={surface} title="분리 배정">분</Mark>}
            {hasKeep && <Mark surface={surface} title="함께 배정">함</Mark>}
            {student.is_pre_transfer && <Mark surface={surface} title="전출 예정">전</Mark>}
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

// 생활지도 바탕(A안, 2026-11-05): 학생 칸 전체를 종류의 색으로, 정도가 클수록 진하게 칠합니다. -1과 리+1도 아주 옅게 칠합니다.
export type ChipLevel = GuidanceTone | null;
export const chipLevelOf = guidanceTone;

// 생활지도 바탕이 있는 칩은 바탕을 그대로 두고 테두리와 고리로만 상태를 보여 줍니다.
// 그래서 고른 학생, 추천, 비교 상대도 생활지도 색과 함께 알아볼 수 있습니다.
function stateClass({ selected, rank, relation, found, emphasized, partner }: StudentChipProps, level: ChipLevel): string {
    const bg = (state: string) => (level ? TONE_CLASS[level] : state);
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
    return level ? `border-transparent ${TONE_CLASS[level]} hover:border-ink/40` : 'border-transparent hover:bg-surface-hover';
}

export const StudentChip = memo(function StudentChip(props: StudentChipProps) {
    const {
        student, groups, hasAvoid, hasKeep, selected, rank, relation, found, dimmed,
        partner, wide, showScore, attendanceNumber, onSelect,
    } = props;
    const gender = student.gender === 'M' ? '남' : '여';
    const level = chipLevelOf(student);
    const dark = isDarkTone(level);
    // 칠한 칸에서는 이름이 칸의 글자색을 따르고, 진한 칸은 이름 굵게 흰색, 성별과 점수는 옅은 흰색입니다.
    const subText = dark ? 'text-white/85' : 'text-soft';
    const surface: MarkSurface = !level ? 'plain' : dark ? 'dark' : 'light';
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
            {/* 이름은 줄이지 않습니다. 칸보다 긴 이름만 말줄임이 됩니다. */}
            <span className={`max-w-full shrink-0 truncate ${dark ? 'font-bold text-white' : level ? 'font-medium' : 'font-medium text-ink'} ${wide ? 'ml-1' : ''}`}>
                {student.name}
            </span>
            <span className={`shrink-0 ${subText} ${wide ? 'text-caption' : 'text-[length:var(--chip-sub,12px)]'}`}>{gender}</span>
            {showScore && !wide && (
                <span data-chip-score className={`shrink-0 text-[length:var(--chip-sub,12px)] ${subText} tabular-nums`}>
                    {/* 좁은 칸에서는 정수로 줄입니다. 소수점까지는 칩의 도움말, 패널, 두 반 보기에 나옵니다. */}
                    <span className="@min-[160px]:hidden">{Math.round(student.academic_score)}</span>
                    <span className="hidden @min-[160px]:inline">{student.academic_score}</span>
                </span>
            )}
            <StudentMarks student={student} groups={groups} hasAvoid={hasAvoid} hasKeep={hasKeep} surface={surface} />
            {wide && selected && <Mark className="bg-accent text-white">선택</Mark>}
            {wide && partner && <Mark className="bg-accent text-white">상대</Mark>}
            {showScore && wide && (
                <span data-chip-score className={`ml-auto shrink-0 pr-1 text-caption ${subText} tabular-nums`}>{student.academic_score}점</span>
            )}
        </button>
    );
});
