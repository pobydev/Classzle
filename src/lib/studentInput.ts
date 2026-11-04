import type { BehaviorType } from '@/types';

// 성적이 비어 있거나 숫자가 아닐 때 넣는 값입니다. 엑셀과 저장 파일이 같은 규칙을 씁니다.
export const BLANK_SCORE = 500;

// 학생 추가 창에서 고르는 생활지도입니다. 유형과 점수가 어긋나지 않도록 함께 고릅니다. 값과 순서는 양식의 드롭다운과 같습니다.
export const BEHAVIOR_CHOICES: { value: string; label: string; type: BehaviorType; score: number }[] = [
    { value: 'BEHAVIOR:-3', label: '행동(-3)', type: 'BEHAVIOR', score: -3 },
    { value: 'BEHAVIOR:-2', label: '행동(-2)', type: 'BEHAVIOR', score: -2 },
    { value: 'BEHAVIOR:-1', label: '행동(-1)', type: 'BEHAVIOR', score: -1 },
    { value: 'EMOTIONAL:-3', label: '정서(-3)', type: 'EMOTIONAL', score: -3 },
    { value: 'EMOTIONAL:-2', label: '정서(-2)', type: 'EMOTIONAL', score: -2 },
    { value: 'EMOTIONAL:-1', label: '정서(-1)', type: 'EMOTIONAL', score: -1 },
    { value: 'LEADER:1', label: '리더(+1)', type: 'LEADER', score: 1 },
    { value: 'LEADER:2', label: '리더(+2)', type: 'LEADER', score: 2 },
    { value: 'NONE:0', label: '해당없음', type: 'NONE', score: 0 },
];

/** 성적 칸의 글자를 숫자로 읽습니다. 0과 소수점은 그대로 두고, 비었거나 숫자가 아니면 undefined입니다. */
export function scoreFromInput(text: string): number | undefined {
    if (text.trim() === '') return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? value : undefined;
}
