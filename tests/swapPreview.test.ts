import { describe, expect, it } from 'vitest';
import { previewSwap } from '@/lib/swapPreview';
import { calculateClassStats } from '@/lib/stats';
import { makeStudent } from './helpers/students';

describe('교환 미리 보기', () => {
    const students = [
        makeStudent({ id: 'a', gender: 'M', assigned_class: '1반', academic_score: 900, behavior_type: 'BEHAVIOR', behavior_score: -3 }),
        makeStudent({ id: 'k', gender: 'F', assigned_class: '1반', academic_score: 500 }),
        makeStudent({ id: 'b', gender: 'F', assigned_class: '2반', academic_score: 100, behavior_type: 'LEADER', behavior_score: 1 }),
        makeStudent({ id: 'm', gender: 'M', assigned_class: '2반', academic_score: 700, behavior_type: 'EMOTIONAL', behavior_score: -2 }),
    ];

    it('두 반의 바꾸기 전과 뒤 값을 줍니다', () => {
        const preview = previewSwap('a', 'b', students, 2)!;
        expect(preview.classes[0]).toEqual({
            className: '1반',
            before: { count: 2, male: 1, female: 1, average: 700, minus3: 1, minus2: 0, leader: 0 },
            after: { count: 2, male: 0, female: 2, average: 300, minus3: 0, minus2: 0, leader: 1 },
        });
        expect(preview.classes[1]).toEqual({
            className: '2반',
            before: { count: 2, male: 1, female: 1, average: 400, minus3: 0, minus2: 1, leader: 1 },
            after: { count: 2, male: 2, female: 0, average: 800, minus3: 1, minus2: 1, leader: 0 },
        });
    });

    it('실제 배정은 건드리지 않습니다', () => {
        const before = JSON.stringify(students);
        previewSwap('a', 'b', students, 2);
        expect(JSON.stringify(students)).toBe(before);
    });

    it('뒤 값은 실제로 바꾼 뒤의 통계와 같습니다', () => {
        const swapped = students.map((s) =>
            s.id === 'a' ? { ...s, assigned_class: '2반' } : s.id === 'b' ? { ...s, assigned_class: '1반' } : s,
        );
        const [first, second] = calculateClassStats(swapped, 2);
        const preview = previewSwap('a', 'b', students, 2)!;
        expect(preview.classes[0].after.average).toBe(first.stayAverageScore);
        expect(preview.classes[1].after.average).toBe(second.stayAverageScore);
        expect(preview.classes[0].after.leader).toBe(first.leaderCount);
        expect(preview.classes[1].after.minus3).toBe(second.minus3Count);
    });

    it('전출 예정 학생은 전출 뒤 값에 넣지 않습니다', () => {
        const list = [
            makeStudent({ id: 'a', assigned_class: '1반', academic_score: 900 }),
            makeStudent({ id: 'k', assigned_class: '1반', academic_score: 500 }),
            makeStudent({ id: 'b', assigned_class: '2반', academic_score: 100, is_pre_transfer: true }),
            makeStudent({ id: 'm', assigned_class: '2반', academic_score: 700 }),
        ];
        const preview = previewSwap('a', 'b', list, 2)!;
        expect(preview.classes[1].before).toMatchObject({ count: 1, average: 700 });
        expect(preview.classes[0].after).toMatchObject({ count: 1, average: 500 });
        expect(preview.classes[1].after).toMatchObject({ count: 2, average: 800 });
    });

    it('이 교환으로 어기는 조건을 알려 줍니다', () => {
        const list = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['m'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'm', assigned_class: '2반', avoid_ids: ['a'] }),
            makeStudent({ id: 'k', assigned_class: '1반' }),
        ];
        expect(previewSwap('a', 'b', list, 2)!.violations.map((v) => v.type)).toContain('AVOID');
        expect(previewSwap('a', 'm', list, 2)!.violations).toEqual([]);
    });

    it('같은 반이거나 미배정이거나 없는 학생이면 null입니다', () => {
        expect(previewSwap('a', 'k', students, 2)).toBeNull();
        expect(previewSwap('a', '없음', students, 2)).toBeNull();
        const list = [makeStudent({ id: 'a', assigned_class: null }), makeStudent({ id: 'b', assigned_class: '1반' })];
        expect(previewSwap('a', 'b', list, 2)).toBeNull();
    });
});
