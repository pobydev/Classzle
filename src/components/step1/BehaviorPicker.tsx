'use client';

// 생활지도 빠른 입력: 학생 한 명당 한 동작입니다.
// 마우스는 값을 한 번 누르고, 키보드는 숫자 하나를 누르면 값을 넣고 다음 학생으로 갑니다.

import { memo } from 'react';
import { BehaviorIcon } from '@/components/BehaviorChip';
import type { BehaviorType } from '@/types';

type Kind = Exclude<BehaviorType, 'NONE'>;

// 앱 전체에서 왼쪽부터 어려운 학생 → 괜찮은 학생 순서입니다. 키 숫자도 이 순서입니다. 0은 해당 없음입니다.
export const GROUPS: { type: Kind; label: string; options: { score: number; key: string }[] }[] = [
    { type: 'BEHAVIOR', label: '행동', options: [{ score: -3, key: '1' }, { score: -2, key: '2' }, { score: -1, key: '3' }] },
    { type: 'EMOTIONAL', label: '정서', options: [{ score: -3, key: '4' }, { score: -2, key: '5' }, { score: -1, key: '6' }] },
    { type: 'LEADER', label: '리더', options: [{ score: 1, key: '7' }, { score: 2, key: '8' }] },
];

// 고른 값의 색은 3단계 보드와 같은 뜻으로 씁니다(StudentChip.tsx).
// -3은 진한 바탕, -2는 옅은 바탕에 빨간 글자, -1은 배지처럼 회색 바탕, 리더는 ★와 옅은 하늘색입니다. 행동과 정서는 같은 색입니다.
function selectedClass(type: Kind, score: number): string {
    if (type === 'LEADER') return 'border-accent/40 bg-tint text-accent-ink';
    if (score <= -3) return 'border-danger/40 bg-guidance-strong text-danger';
    if (score === -2) return 'border-danger/30 bg-guidance-soft text-danger';
    return 'border-hairline bg-surface-hover text-ink';
}
const BUTTON_WIDTH = 32;
const BUTTON_GAP = 2;
const groupWidth = (count: number) => count * BUTTON_WIDTH + (count - 1) * BUTTON_GAP;

const signed = (score: number) => (score > 0 ? `+${score}` : String(score));

const KEY = 'inline-flex min-w-5 justify-center rounded-[4px] border border-hairline bg-canvas px-1 text-caption font-semibold text-ink';

/** 머리글 ? 에 넣는 키보드 안내입니다. */
export function KeyboardHint() {
    const rows: [string, string][] = [
        ['↑ ↓', '학생 옮기기'],
        ['1  2  3', '행동 -3, -2, -1'],
        ['4  5  6', '정서 -3, -2, -1'],
        ['7  8', '리더 +1, +2'],
        ['0', '해당 없음'],
    ];
    return (
        <div data-key-hint>
            <p className="mb-1 font-semibold text-ink">키보드로 넣기</p>
            <p className="mb-1.5 text-soft">표의 생활지도 칸을 한 번 누른 뒤 숫자 하나를 누르면 값이 들어가고 다음 학생으로 넘어갑니다.</p>
            <ul className="space-y-1">
                {rows.map(([keys, text]) => (
                    <li key={keys} className="flex items-center gap-2">
                        <span className="flex w-20 gap-1">{keys.split(/\s+/).map((k) => <kbd key={k} className={KEY}>{k}</kbd>)}</span>
                        {text}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 표 머리글. 줄의 단추와 칸을 맞춥니다. */
export function BehaviorPickerHeader() {
    return (
        <div className="flex justify-center gap-3">
            {GROUPS.map((group) => (
                <span
                    key={group.type}
                    className="flex items-center justify-center gap-1"
                    style={{ width: groupWidth(group.options.length) }}
                >
                    <BehaviorIcon type={group.type} size={13} />
                    {group.label}
                </span>
            ))}
        </div>
    );
}

function moveFocus(from: HTMLElement, delta: number) {
    const pickers = Array.from(
        from.closest('table')?.querySelectorAll<HTMLElement>('[data-behavior-picker]') ?? [],
    );
    const next = pickers[pickers.indexOf(from) + delta];
    if (next) {
        next.focus();
        next.scrollIntoView({ block: 'nearest' });
    }
}

function BehaviorPickerBase({
    studentId,
    studentName,
    type,
    score,
    onChange,
}: {
    studentId: string;
    studentName: string;
    type: BehaviorType;
    score: number;
    onChange: (id: string, type: BehaviorType, score: number) => void;
}) {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const group = event.currentTarget;
        if (event.key === 'ArrowDown' || event.key === 'Enter') {
            event.preventDefault();
            moveFocus(group, 1);
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveFocus(group, -1);
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key === '0' || event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            onChange(studentId, 'NONE', 0);
            moveFocus(group, 1);
            return;
        }
        for (const item of GROUPS) {
            const option = item.options.find((candidate) => candidate.key === event.key);
            if (option) {
                event.preventDefault();
                onChange(studentId, item.type, option.score);
                moveFocus(group, 1);
                return;
            }
        }
    };

    return (
        <div
            role="radiogroup"
            aria-label={`${studentName} 생활지도`}
            tabIndex={0}
            data-behavior-picker={studentId}
            onKeyDown={handleKeyDown}
            className="inline-flex justify-center gap-3 rounded-input scroll-my-12 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            {GROUPS.map((group) => (
                <span key={group.type} className="flex" style={{ gap: BUTTON_GAP }}>
                    {group.options.map((option) => {
                        const isOn = type === group.type && score === option.score;
                        return (
                            <button
                                key={option.score}
                                type="button"
                                role="radio"
                                aria-checked={isOn}
                                aria-label={`${group.label} ${signed(option.score)}`}
                                title={`${group.label}(${signed(option.score)}), 키 ${option.key}`}
                                tabIndex={-1}
                                // 값을 다시 누르면 해제합니다.
                                onClick={() => (isOn ? onChange(studentId, 'NONE', 0) : onChange(studentId, group.type, option.score))}
                                style={{ width: BUTTON_WIDTH }}
                                // 고르지 않은 값은 테두리 없이 흐린 글자로 두고, 고른 값만 보드와 같은 색을 칠합니다.
                                className={`h-7 cursor-pointer rounded-input border text-small tabular-nums whitespace-nowrap transition-colors ${
                                    isOn
                                        ? `${selectedClass(group.type, option.score)} font-bold`
                                        : 'border-transparent text-soft hover:bg-surface-hover hover:text-ink'
                                }`}
                            >
                                {isOn && group.type === 'LEADER' && <span aria-hidden="true">★</span>}
                                {signed(option.score)}
                            </button>
                        );
                    })}
                </span>
            ))}
        </div>
    );
}

export const BehaviorPicker = memo(BehaviorPickerBase);
