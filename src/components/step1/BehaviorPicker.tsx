'use client';

// 생활지도 빠른 입력: 학생 한 명당 한 동작입니다.
// 마우스는 값을 한 번 누르고, 키보드는 숫자 하나를 누르면 값을 넣고 다음 학생으로 갑니다.

import { memo } from 'react';
import { BehaviorIcon } from '@/components/BehaviorChip';
import type { BehaviorType } from '@/types';

type Kind = Exclude<BehaviorType, 'NONE'>;

const GROUPS: { type: Kind; label: string; options: { score: number; key: string }[] }[] = [
    { type: 'LEADER', label: '리더', options: [{ score: 2, key: '1' }, { score: 1, key: '2' }] },
    { type: 'BEHAVIOR', label: '행동', options: [{ score: -1, key: '3' }, { score: -2, key: '4' }, { score: -3, key: '5' }] },
    { type: 'EMOTIONAL', label: '정서', options: [{ score: -1, key: '6' }, { score: -2, key: '7' }, { score: -3, key: '8' }] },
];

const CSS_KEY: Record<Kind, string> = { LEADER: 'leader', BEHAVIOR: 'behavior', EMOTIONAL: 'emotional' };
const BUTTON_WIDTH = 32;
const BUTTON_GAP = 2;
const groupWidth = (count: number) => count * BUTTON_WIDTH + (count - 1) * BUTTON_GAP;

const signed = (score: number) => (score > 0 ? `+${score}` : String(score));

export const KEY_HINT = '↑ ↓ 학생 이동, 1 리더+2, 2 리더+1, 3~5 행동-1~-3, 6~8 정서-1~-3, 0 해당없음';

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
                                style={{
                                    width: BUTTON_WIDTH,
                                    backgroundColor: isOn
                                        ? `var(--behavior-${CSS_KEY[group.type]}-${Math.abs(option.score)})`
                                        : undefined,
                                }}
                                className={`h-7 rounded-input border text-small transition-colors ${
                                    isOn
                                        ? 'border-accent font-bold text-ink'
                                        : 'border-line bg-card text-soft hover:bg-surface-hover hover:text-ink'
                                }`}
                            >
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
