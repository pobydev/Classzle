// 생활지도 유형 표시. 색만으로 구분하지 않도록 기호와 글자를 함께 씁니다.

import { Heart, Lightning, Star } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { BehaviorType } from '@/types';

const KINDS: Record<Exclude<BehaviorType, 'NONE'>, { key: string; label: string; Icon: Icon }> = {
    LEADER: { key: 'leader', label: '리더', Icon: Star },
    BEHAVIOR: { key: 'behavior', label: '행동', Icon: Lightning },
    EMOTIONAL: { key: 'emotional', label: '정서', Icon: Heart },
};

export function BehaviorChip({ type, score }: { type: BehaviorType; score: number }) {
    if (type === 'NONE') return <span>-</span>;
    const { key, label, Icon: KindIcon } = KINDS[type];
    const level = Math.min(Math.abs(score) || 1, type === 'LEADER' ? 2 : 3);
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption text-ink whitespace-nowrap"
            style={{ backgroundColor: `var(--behavior-${key}-${level})` }}
        >
            <KindIcon size={12} aria-hidden="true" />
            {label} ({score > 0 ? `+${score}` : score})
        </span>
    );
}

export function BehaviorIcon({ type, size = 16 }: { type: Exclude<BehaviorType, 'NONE'>; size?: number }) {
    const KindIcon = KINDS[type].Icon;
    return <KindIcon size={size} className="text-soft" aria-hidden="true" />;
}
