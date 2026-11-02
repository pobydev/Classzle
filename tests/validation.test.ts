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
