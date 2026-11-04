import { describe, expect, it } from 'vitest';
import { validateSwap } from '@/lib/validation';
import { makeStudent } from './helpers/students';

describe('학생 교환 검사', () => {
    it('같은 반끼리는 검사하지 않습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '1반' }),
        ];
        expect(validateSwap('a', 'b', students)).toEqual([]);
    });

    it('고정 반을 벗어나면 알립니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', fixed_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
        ];
        expect(validateSwap('a', 'b', students).map((v) => v.type)).toContain('FIXED_CLASS');
    });

    it('분리 배정 상대와 같은 반이 되면 알립니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['c'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '2반', avoid_ids: ['a'] }),
        ];
        expect(validateSwap('a', 'b', students).map((v) => v.type)).toContain('AVOID');
    });

    it('함께 둘 학생과 나뉘면 알립니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', keep_ids: ['c'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '1반', keep_ids: ['a'] }),
        ];
        expect(validateSwap('a', 'b', students).map((v) => v.type)).toContain('KEEP');
    });

    it('조건에 걸리지 않으면 아무것도 알리지 않습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
        ];
        expect(validateSwap('a', 'b', students)).toEqual([]);
    });
});

describe('반 이름을 눌러 옮길 때 몰림 경고', () => {
    it('-3이 이미 있는 반으로 -3 학생을 옮기면 알립니다', async () => {
        const { moveCrowdingWarnings } = await import('@/lib/validation');
        const { makeStudent } = await import('./helpers/students');
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', behavior_type: 'BEHAVIOR', behavior_score: -3 }),
            makeStudent({ id: 'b', assigned_class: '2반', behavior_type: 'BEHAVIOR', behavior_score: -3 }),
            makeStudent({ id: 'c', assigned_class: '3반' }),
            makeStudent({ id: 'd', assigned_class: '3반' }),
        ];
        const warnings = moveCrowdingWarnings('b', '1반', students, 3);
        expect(warnings.map((w) => w.message)).toEqual(['1반에 행동 -3이 몰립니다 (2명).']);
        expect(moveCrowdingWarnings('b', '3반', students, 3)).toEqual([]);
    });
});
