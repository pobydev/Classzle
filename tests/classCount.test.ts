import { describe, expect, it } from 'vitest';
import { classesLostByShrinking } from '@/lib/classCount';

describe('학급 수 줄이기', () => {
    const students = [
        { assigned_class: '1반' }, { assigned_class: '11반' }, { assigned_class: '12반' }, { assigned_class: '12반' }, { assigned_class: null },
    ];
    it('없어지는 반과 그 반 학생 수를 알려 줍니다', () => {
        expect(classesLostByShrinking(students, 12, 10)).toEqual({ label: '11·12반', count: 3 });
        expect(classesLostByShrinking(students, 12, 5)).toEqual({ label: '6~12반', count: 3 });
    });
    it('늘리거나 그 반에 학생이 없으면 0명입니다', () => {
        expect(classesLostByShrinking(students, 12, 14).count).toBe(0);
        expect(classesLostByShrinking([{ assigned_class: '1반' }], 12, 10).count).toBe(0);
    });
});
