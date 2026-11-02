import { describe, expect, it } from 'vitest';
import { parseBehaviorDropdown } from '@/lib/excel';
import { BEHAVIOR_CHOICES, scoreFromInput } from '@/lib/studentInput';

describe('학생 추가 입력', () => {
    it('성적 0을 500으로 바꾸지 않습니다', () => {
        expect(scoreFromInput('0')).toBe(0);
    });

    it('소수점을 자르지 않습니다', () => {
        expect(scoreFromInput('87.5')).toBe(87.5);
    });

    it('비었거나 숫자가 아니면 값이 없습니다', () => {
        expect(scoreFromInput('')).toBeUndefined();
        expect(scoreFromInput('  ')).toBeUndefined();
        expect(scoreFromInput('가')).toBeUndefined();
    });

    it('고를 수 있는 생활지도는 유형과 점수가 맞는 값뿐입니다', () => {
        for (const choice of BEHAVIOR_CHOICES) {
            expect(parseBehaviorDropdown(choice.label)).toEqual({
                behaviorType: choice.type,
                behaviorScore: choice.score,
                isUnreadable: false,
            });
        }
        expect(BEHAVIOR_CHOICES.some((c) => c.type === 'NONE' && c.score !== 0)).toBe(false);
        expect(BEHAVIOR_CHOICES.some((c) => c.type === 'BEHAVIOR' && c.score > 0)).toBe(false);
    });
});
