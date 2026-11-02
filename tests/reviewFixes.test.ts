import { describe, expect, it } from 'vitest';
import { FULL_WEIGHTS } from '@/lib/assignment';
import { calculateBalanceTable, flagColumn } from '@/lib/balanceTable';
import { RECOMMEND_WEIGHTS, recommendSwaps } from '@/lib/recommend';
import { makeStudent } from './helpers/students';

const ids = (list: { studentId: string }[]) => list.map((r) => r.studentId);

describe('12. 교환 추천의 가중치', () => {
    it('배정과 같은 값을 씁니다', () => {
        expect(RECOMMEND_WEIGHTS).toEqual(FULL_WEIGHTS);
    });
});

describe('13. 새 어김이 있는 교환', () => {
    it('어긴 조건을 고쳐도 다른 조건을 새로 어기면 추천하지 않습니다', () => {
        // a와 x는 같은 반이라 분리 배정을 어겼습니다. a를 b와 바꾸면 고쳐지지만 x와 함께 둘 k에서 b가 떨어집니다.
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['x'] }),
            makeStudent({ id: 'x', assigned_class: '1반', avoid_ids: ['a'] }),
            makeStudent({ id: 'b', assigned_class: '2반', keep_ids: ['k'] }),
            makeStudent({ id: 'k', assigned_class: '2반', keep_ids: ['b'] }),
        ];
        expect(ids(recommendSwaps('a', students, 2, [], 10))).not.toContain('b');
    });

    it('그룹이 새로 몰리면 추천하지 않습니다', () => {
        // 분리 배정이 고쳐져도(-9000) 그룹을 새로 어기면(+1800) 빼야 합니다. 합으로만 보면 좋아 보이는 교환입니다.
        const groups = [{ id: 'g', name: '가상', color: '', member_ids: ['b', 'p', 'q'] }];
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['x'] }),
            makeStudent({ id: 'x', assigned_class: '1반', avoid_ids: ['a'] }),
            makeStudent({ id: 'p', assigned_class: '1반', group_ids: ['g'] }),
            makeStudent({ id: 'q', assigned_class: '1반', group_ids: ['g'] }),
            makeStudent({ id: 'b', assigned_class: '2반', group_ids: ['g'] }),
            makeStudent({ id: 'r', assigned_class: '2반' }),
            makeStudent({ id: 'u', assigned_class: '2반' }),
            makeStudent({ id: 'w', assigned_class: '2반' }),
        ];
        const list = ids(recommendSwaps('a', students, 2, groups, 10));
        expect(list).not.toContain('b');
        expect(list).toContain('r');
    });

    it('어긴 조건을 고치고 새로 어기지 않으면 추천합니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['x'] }),
            makeStudent({ id: 'x', assigned_class: '1반', avoid_ids: ['a'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '2반' }),
        ];
        const list = recommendSwaps('a', students, 2, [], 10);
        expect(ids(list)).toEqual(expect.arrayContaining(['b', 'c']));
        expect(list[0].balanceChange).toBeLessThan(0);
    });

    it('어김이 다른 반으로 옮겨 갈 뿐이면 추천하지 않습니다', () => {
        // 남학생이 1반 3명, 2반 2명, 3반 1명입니다. 2반 여학생과 바꾸면 어김이 2반으로 옮겨 가고, 3반 여학생과 바꿔야 줄어듭니다.
        const make = (id: string, gender: 'M' | 'F', cn: string) => makeStudent({ id, gender, assigned_class: cn });
        const students = [
            make('m1', 'M', '1반'), make('m2', 'M', '1반'), make('m3', 'M', '1반'), make('f1', 'F', '1반'),
            make('m4', 'M', '2반'), make('m5', 'M', '2반'), make('f2', 'F', '2반'), make('f3', 'F', '2반'),
            make('m6', 'M', '3반'), make('f4', 'F', '3반'), make('f5', 'F', '3반'), make('f6', 'F', '3반'),
        ];
        const list = ids(recommendSwaps('m1', students, 3, [], 12));
        expect(list).not.toContain('f2');
        expect(list).not.toContain('f3');
        expect(list).toEqual(expect.arrayContaining(['f4', 'f5', 'f6']));
    });

    it('한쪽 어김이 줄어드는 교환은 추천합니다', () => {
        const students = [
            ...['m1', 'm2', 'm3', 'm4'].map((id) => makeStudent({ id, gender: 'M', assigned_class: '1반' })),
            ...['f1', 'f2', 'f3', 'f4'].map((id) => makeStudent({ id, gender: 'F', assigned_class: '2반' })),
        ];
        expect(ids(recommendSwaps('m1', students, 2, [], 10)).length).toBeGreaterThan(0);
    });
});

describe('17. 리더 칸', () => {
    it('다른 반에 다 있는데 리더가 없는 반을 표시합니다', () => {
        expect(flagColumn([0, 2, 2, 2], 1, 'aboveOrNone').cells.map((c) => c.flagged)).toEqual([true, false, false, false]);
    });

    it('표에서도 그렇습니다', () => {
        const leaders = (cn: string, count: number) =>
            Array.from({ length: count }, (_, i) => makeStudent({ id: `${cn}${i}`, assigned_class: cn, behavior_type: 'LEADER', behavior_score: 1 }));
        const table = calculateBalanceTable(
            [...leaders('2반', 2), ...leaders('3반', 2), ...leaders('4반', 2), makeStudent({ id: 'z', assigned_class: '1반' })],
            4,
        );
        expect(table.rows.map((r) => r.cells.leader.flagged)).toEqual([true, false, false, false]);
    });

    it('많은 쪽도 그대로 표시하고 리더가 있는 적은 반은 표시하지 않습니다', () => {
        expect(flagColumn([1, 3, 3, 5], 1, 'aboveOrNone').cells.map((c) => c.flagged)).toEqual([false, false, false, true]);
    });

    it('차이가 기준 안이면 표시하지 않습니다', () => {
        expect(flagColumn([0, 1, 1, 1], 1, 'aboveOrNone').cells.some((c) => c.flagged)).toBe(false);
    });
});
