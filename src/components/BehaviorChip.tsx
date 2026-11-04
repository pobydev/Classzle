// 생활지도 유형 기호입니다. 표 머리글과 안내에서 글자와 함께 씁니다.

import { Heart, Lightning, Star } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import type { BehaviorType } from '@/types';

const KINDS: Record<Exclude<BehaviorType, 'NONE'>, { key: string; label: string; Icon: Icon }> = {
    LEADER: { key: 'leader', label: '리더', Icon: Star },
    BEHAVIOR: { key: 'behavior', label: '행동', Icon: Lightning },
    EMOTIONAL: { key: 'emotional', label: '정서', Icon: Heart },
};

export function BehaviorIcon({ type, size = 16 }: { type: Exclude<BehaviorType, 'NONE'>; size?: number }) {
    const KindIcon = KINDS[type].Icon;
    return <KindIcon size={size} className="text-soft" aria-hidden="true" />;
}
