import { describe, expect, it } from 'vitest';
import { FULL_WEIGHTS } from '@/lib/assignment';
import { RECOMMEND_WEIGHTS } from '@/lib/recommend';

describe('12. 교환 추천의 가중치', () => {
    it('배정과 같은 값을 씁니다', () => {
        expect(RECOMMEND_WEIGHTS).toEqual(FULL_WEIGHTS);
    });
});
