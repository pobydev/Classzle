import type { BehaviorType } from '@/types';

// 학생 추가 창에서 고르는 생활지도입니다. 유형과 점수가 어긋나지 않도록 함께 고릅니다. 값은 양식의 드롭다운과 같습니다.
export const BEHAVIOR_CHOICES: { value: string; label: string; type: BehaviorType; score: number }[] = [
    { value: 'NONE:0', label: '해당없음', type: 'NONE', score: 0 },
    { value: 'LEADER:2', label: '리더(+2)', type: 'LEADER', score: 2 },
    { value: 'LEADER:1', label: '리더(+1)', type: 'LEADER', score: 1 },
    { value: 'BEHAVIOR:-1', label: '행동(-1)', type: 'BEHAVIOR', score: -1 },
    { value: 'BEHAVIOR:-2', label: '행동(-2)', type: 'BEHAVIOR', score: -2 },
    { value: 'BEHAVIOR:-3', label: '행동(-3)', type: 'BEHAVIOR', score: -3 },
    { value: 'EMOTIONAL:-1', label: '정서(-1)', type: 'EMOTIONAL', score: -1 },
    { value: 'EMOTIONAL:-2', label: '정서(-2)', type: 'EMOTIONAL', score: -2 },
    { value: 'EMOTIONAL:-3', label: '정서(-3)', type: 'EMOTIONAL', score: -3 },
];

/** 성적 칸의 글자를 숫자로 읽습니다. 0과 소수점은 그대로 두고, 비었거나 숫자가 아니면 undefined입니다. */
export function scoreFromInput(text: string): number | undefined {
    if (text.trim() === '') return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
}
