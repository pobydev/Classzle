import { describe, expect, it } from 'vitest';
import {
    calculateBalanceTable,
    calculatePreviousClassMatrix,
    calculateScoreBands,
    flagColumn,
} from '@/lib/balanceTable';
import { makeStudent } from './helpers/students';

describe('차이와 표시 규칙', () => {
    it('기준 안이면 조용합니다', () => {
        const { difference, cells } = flagColumn([3, 4, 3], 1, 'outside');
        expect(difference).toEqual({ value: 1, flagged: false });
        expect(cells.some((c) => c.flagged)).toBe(false);
    });

    // 12반 화면에서 두 학생을 1반에서 2반으로 옮겼을 때의 값입니다.
    const flaggedValues = (values: number[], limit: number, flag: 'outside' | 'above') =>
        flagColumn(values, limit, flag).cells.filter((c) => c.flagged).map((c) => c.value);

    it('대부분의 반에서 벗어난 칸만 표시합니다', () => {
        const count = [27, 31, 29, 29, 29, 29, 29, 29, 29, 29, 30, 29];
        const male = [14, 16, 15, 15, 15, 15, 15, 16, 15, 15, 16, 16];
        const female = [13, 15, 14, 14, 14, 14, 14, 13, 14, 14, 14, 13];
        expect(flaggedValues(count, 1, 'outside')).toEqual([27, 31]);
        expect(flagColumn(male, 1, 'outside').cells.map((c) => c.flagged)).toEqual([true, ...Array(11).fill(false)]);
        expect(flagColumn(female, 1, 'outside').cells.map((c) => c.flagged)).toEqual([false, true, ...Array(10).fill(false)]);
        // 차이 줄의 표시는 그대로입니다.
        expect(flagColumn(male, 1, 'outside').difference).toEqual({ value: 2, flagged: true });
    });

    it('outside는 양쪽을 모두 표시합니다', () => {
        expect(flaggedValues([5, 3, 3, 3, 1], 1, 'outside')).toEqual([5, 1]);
    });

    it('above는 많은 쪽만 표시합니다', () => {
        const { difference, cells } = flagColumn([3, 1, 0], 1, 'above');
        expect(difference.flagged).toBe(true);
        expect(cells.map((c) => c.flagged)).toEqual([true, false, false]);
        expect(flaggedValues([0, 2, 2, 2, 2], 1, 'above')).toEqual([]);
    });

    it('범위가 여럿이면 낮은 쪽을 골라 몰린 반을 놓치지 않습니다', () => {
        // 위쪽 범위를 고르면 3명 있는 반이 표시되지 않습니다.
        expect(flaggedValues([3, 3, 0, 0], 1, 'above')).toEqual([3, 3]);
        expect(flaggedValues([14, 14, 15, 15, 16, 16], 1, 'outside')).toEqual([16, 16]);
    });

    it('-1은 차이 2까지 괜찮고 3부터 표시합니다', () => {
        expect(flagColumn([2, 0], 2, 'above').difference.flagged).toBe(false);
        const over = flagColumn([3, 0], 2, 'above');
        expect(over.difference.flagged).toBe(true);
        expect(over.cells.map((c) => c.flagged)).toEqual([true, false]);
    });

    it('none은 차이가 커도 표시하지 않습니다', () => {
        const { difference, cells } = flagColumn([900, 100], null, 'none');
        expect(difference).toEqual({ value: 800, flagged: false });
        expect(cells.every((c) => !c.flagged)).toBe(true);
    });

    it('반이 없으면 0입니다', () => {
        expect(flagColumn([], 1, 'outside').difference).toEqual({ value: 0, flagged: false });
    });
});

describe('학급별 균형 표', () => {
    const groups = [{ id: 'g', name: '축구부', color: '', member_ids: ['a', 'b', 't'] }];
    const students = [
        makeStudent({ id: 'a', gender: 'M', assigned_class: '1반', academic_score: 601, behavior_type: 'BEHAVIOR', behavior_score: -3 }),
        makeStudent({ id: 'b', gender: 'M', assigned_class: '1반', academic_score: 600, behavior_type: 'BEHAVIOR', behavior_score: -3 }),
        makeStudent({ id: 'c', gender: 'M', assigned_class: '1반', academic_score: 600, behavior_type: 'EMOTIONAL', behavior_score: -3 }),
        makeStudent({ id: 'd', gender: 'F', assigned_class: '2반', academic_score: 400, behavior_type: 'LEADER', behavior_score: 2 }),
        // 전출 예정 학생은 어느 값에도 들어가지 않습니다.
        makeStudent({ id: 't', gender: 'M', assigned_class: '2반', academic_score: 1000, is_pre_transfer: true, behavior_type: 'BEHAVIOR', behavior_score: -3 }),
    ];
    const table = calculateBalanceTable(students, 2, groups);
    const [first, second] = table.rows;

    it('행동과 정서를 나눠서 세고 전출 뒤 기준입니다', () => {
        expect(first.cells.behavior3.value).toBe(2);
        expect(first.cells.emotional3.value).toBe(1);
        expect(second.cells.behavior3.value).toBe(0);
        expect(second.cells.count.value).toBe(1);
        expect(second.cells.male.value).toBe(0);
        expect(second.cells['group:g'].value).toBe(0);
        expect(second.cells.leader.value).toBe(1);
    });

    it('전출은 남/여를 따로 보여 줍니다', () => {
        expect([second.transferMale, second.transferFemale]).toEqual([1, 0]);
        expect([first.transferMale, first.transferFemale]).toEqual([0, 0]);
    });

    it('평균 차이는 소수점 한 자리이고 표시하지 않습니다', () => {
        // 1반 평균 600.33, 2반 400.
        expect(table.difference.average).toEqual({ value: 200.3, flagged: false });
        expect(first.cells.average.flagged).toBe(false);
    });

    it('합계는 전출 뒤 어려움 합계이고 리더를 더하지 않으며 어려움이 큰 반을 표시합니다', () => {
        // 1반 -3 -3 -3, 2반 리더 +2. 2반의 전출 예정 -3은 뺍니다.
        expect(first.cells.difficultyTotal).toEqual({ value: -9, flagged: true });
        expect(second.cells.difficultyTotal).toEqual({ value: 0, flagged: false });
        expect(table.difference.difficultyTotal).toEqual({ value: 9, flagged: true });
        expect(table.columns.find((c) => c.key === 'difficultyTotal')?.title).toBe('어려운 학생의 점수만 더한 값입니다. 리더는 더하지 않습니다.');
    });

    describe('합계의 표시 기준', () => {
        const withTotals = (totals: number[]) =>
            calculateBalanceTable(
                totals.map((total, i) =>
                    makeStudent({ id: `s${i}`, assigned_class: `${i + 1}반`, behavior_type: total ? 'BEHAVIOR' : 'NONE', behavior_score: total }),
                ),
                totals.length,
            );
        const flags = (totals: number[]) => withTotals(totals).rows.map((row) => row.cells.difficultyTotal.flagged);

        it('차이 2까지는 표시하지 않습니다', () => {
            expect(withTotals([-3, -2, -1]).difference.difficultyTotal).toEqual({ value: 2, flagged: false });
            expect(flags([-3, -2, -1])).toEqual([false, false, false]);
        });

        it('차이 3부터 대부분의 반에서 벗어난 큰 쪽만 표시합니다', () => {
            // -3 한 반만 무겁습니다. 값이 음수여도 어려움이 큰 쪽입니다.
            expect(flags([-3, 0, 0, 0])).toEqual([true, false, false, false]);
        });

        it('어려움이 작은 반은 표시하지 않습니다', () => {
            expect(flags([-3, -3, -3, 0])).toEqual([false, false, false, false]);
            expect(withTotals([-3, -3, -3, 0]).difference.difficultyTotal.flagged).toBe(true);
        });

        it('표시해도 칸의 값은 음수 그대로입니다', () => {
            expect(withTotals([-3, 0]).rows[0].cells.difficultyTotal.value).toBe(-3);
        });
    });

    it('행동 -1과 정서 -1은 차이가 커도 표시하지 않고 숫자만 보여 줍니다', () => {
        const list = [
            ...['a', 'b', 'c', 'd'].map((id) => makeStudent({ id, assigned_class: '1반', behavior_type: 'BEHAVIOR', behavior_score: -1 })),
            ...['e', 'f', 'g', 'h'].map((id) => makeStudent({ id, assigned_class: '2반', behavior_type: 'EMOTIONAL', behavior_score: -1 })),
        ];
        const mild = calculateBalanceTable(list, 2);
        expect(mild.difference.behavior1).toEqual({ value: 4, flagged: false });
        expect(mild.difference.emotional1).toEqual({ value: 4, flagged: false });
        expect(mild.rows.every((row) => !row.cells.behavior1.flagged && !row.cells.emotional1.flagged)).toBe(true);
    });

    it('인원, 남, 그룹, 행동 -3의 차이 줄과 벗어난 칸을 표시합니다', () => {
        expect(table.difference.count).toEqual({ value: 2, flagged: true });
        // 두 반뿐이면 낮은 범위를 골라 많은 반을 표시합니다.
        expect(first.cells.count.flagged).toBe(true);
        expect(second.cells.count.flagged).toBe(false);
        expect(first.cells.male.flagged).toBe(true);
        expect(first.cells['group:g'].flagged).toBe(true);
        expect(first.cells.behavior3.flagged).toBe(true);
        expect(second.cells.behavior3.flagged).toBe(false);
    });

    it('차이가 기준 안이면 표시하지 않습니다', () => {
        expect(table.difference.leader.flagged).toBe(false);
        expect(second.cells.leader.flagged).toBe(false);
        expect(table.difference.emotional3.flagged).toBe(false);
    });

    it('그룹마다 한 칸입니다', () => {
        const keys = table.columns.map((c) => c.key);
        expect(keys).toContain('group:g');
        expect(table.columns.find((c) => c.key === 'group:g')?.label).toBe('축구부');
    });

    it('학생이 없는 반은 평균 차이에서 뺍니다', () => {
        const list = [makeStudent({ id: 'a', assigned_class: '1반', academic_score: 700 })];
        expect(calculateBalanceTable(list, 2).difference.average.value).toBe(0);
    });
});

describe('성적 구간', () => {
    // 남녀 각각 8명. 성적이 높은 순서대로 네 구간에 2명씩 들어갑니다.
    const make = (classOf: (i: number, gender: 'M' | 'F') => string) =>
        (['M', 'F'] as const).flatMap((gender) =>
            Array.from({ length: 8 }, (_, i) =>
                makeStudent({ id: `${gender}${i}`, gender, academic_score: 900 - i * 100, assigned_class: classOf(i, gender) }),
            ),
        );

    it('같은 성별 안에서 성적순 네 구간으로 셉니다', () => {
        const { rows, largestDifference } = calculateScoreBands(make((i) => (i % 2 ? '2반' : '1반')), 2);
        expect(rows[0].male).toEqual([1, 1, 1, 1]);
        expect(rows[1].female).toEqual([1, 1, 1, 1]);
        expect(rows[0].total).toEqual([2, 2, 2, 2]);
        expect(largestDifference).toBe(0);
    });

    it('한 반에 몰리면 가장 큰 차이가 커집니다', () => {
        const { rows, largestDifference } = calculateScoreBands(make((i, gender) => (gender === 'M' && i < 2 ? '1반' : i % 2 ? '2반' : '1반')), 2);
        expect(rows[0].male[0]).toBe(2);
        expect(rows[1].male[0]).toBe(0);
        expect(largestDifference).toBe(2);
    });

    it('높은 성적이 상 구간입니다', () => {
        const { rows } = calculateScoreBands(make((i) => (i < 2 ? '1반' : '2반')), 2);
        expect(rows[0].male).toEqual([2, 0, 0, 0]);
        expect(rows[1].male).toEqual([0, 2, 2, 2]);
    });

    it('전출 예정 학생과 미배정 학생은 세지 않습니다', () => {
        const list = make(() => '1반');
        list[0] = { ...list[0], is_pre_transfer: true };
        list[1] = { ...list[1], assigned_class: null };
        const { rows } = calculateScoreBands(list, 2);
        const count = rows[0].male.reduce((a, b) => a + b, 0);
        expect(count).toBe(6);
    });

    it('학생이 없어도 멈추지 않습니다', () => {
        expect(calculateScoreBands([], 2).largestDifference).toBe(0);
    });
});

describe('전학년도 반별 인원표', () => {
    it('새 반과 전학년도 반으로 셉니다', () => {
        const matrix = calculatePreviousClassMatrix([
            makeStudent({ id: 'a', assigned_class: '1반', prev_info: '3-2-1' }),
            makeStudent({ id: 'b', assigned_class: '1반', prev_info: '3-2-2' }),
            makeStudent({ id: 'c', assigned_class: '2반', prev_info: '3-10-1' }),
            makeStudent({ id: 'd', assigned_class: '2반', prev_info: '3-2-3', is_pre_transfer: true }),
            makeStudent({ id: 'e', assigned_class: null, prev_info: '3-2-4' }),
        ], 2);
        expect(matrix.previousClasses).toEqual(['2', '10']);
        expect(matrix.rows[0]).toEqual({ className: '1반', counts: { 2: 2 }, total: 2 });
        expect(matrix.rows[1]).toEqual({ className: '2반', counts: { 10: 1 }, total: 1 });
        expect(matrix.totals).toEqual({ 2: 2, 10: 1 });
    });
});
