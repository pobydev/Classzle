import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { FULL_WEIGHTS, collectViolations } from '@/lib/assignment';
import { calculateBalanceTable, flagColumn } from '@/lib/balanceTable';
import { buildResultWorkbook, parseBehaviorDropdown, parseRosterRows } from '@/lib/excel';
import { calculateAttendanceNumbers } from '@/lib/numbering';
import { RECOMMEND_WEIGHTS, recommendSwaps } from '@/lib/recommend';
import { calculateClassStats } from '@/lib/stats';
import { previewSwap } from '@/lib/swapPreview';
import { validateMove } from '@/lib/validation';
import { groupStudentsByClass } from '@/components/step3/boardModel';
import { sameClass } from '@/lib/assignment/problem';
import { makeStudent } from './helpers/students';

const ids = (list: { studentId: string }[]) => list.map((r) => r.studentId);

async function rowsOf(sheet: ExcelJS.Worksheet) {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
        rows.push((row.values as unknown[]).slice(1).map((v) => String(v ?? '')));
    });
    return rows;
}

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
        // 그룹이 1반 3명, 2반 2명, 3반 1명입니다. 2반 학생과 바꾸면 어김이 2반으로 옮겨 가고, 3반 학생과 바꿔야 줄어듭니다.
        const groups = [{ id: 'g', name: '가상', color: '', member_ids: ['g1', 'g2', 'g3', 'g4', 'g5', 'g6'] }];
        const make = (id: string, cn: string) => makeStudent({ id, assigned_class: cn });
        const students = [
            make('g1', '1반'), make('g2', '1반'), make('g3', '1반'), make('a1', '1반'),
            make('g4', '2반'), make('g5', '2반'), make('b1', '2반'), make('b2', '2반'),
            make('g6', '3반'), make('c1', '3반'), make('c2', '3반'), make('c3', '3반'),
        ];
        const list = ids(recommendSwaps('g1', students, 3, groups, 12));
        expect(list).not.toContain('b1');
        expect(list).not.toContain('b2');
        expect(list).toEqual(expect.arrayContaining(['c1', 'c2', 'c3']));
    });

    it('남녀가 어긋나 있어도 다른 성별과는 바꾸지 않습니다', () => {
        // 1:1 같은 성별 교환만 추천합니다(사용자 결정, 2026-11-04). 남녀를 맞추는 일은 수정이 합니다.
        const students = [
            ...['m1', 'm2', 'm3', 'm4'].map((id) => makeStudent({ id, gender: 'M', assigned_class: '1반' })),
            ...['f1', 'f2', 'f3', 'f4'].map((id) => makeStudent({ id, gender: 'F', assigned_class: '2반' })),
        ];
        expect(recommendSwaps('m1', students, 2, [], 10)).toEqual([]);
    });
});

describe('17. 리더 칸', () => {
    const leader = (id: string, cn: string, score: number) =>
        makeStudent({ id, assigned_class: cn, behavior_type: 'LEADER', behavior_score: score });

    it('리더를 +1과 +2 두 칸으로 나눠 보여 줍니다(어려운 학생 → 괜찮은 학생 순서)', () => {
        const table = calculateBalanceTable([leader('a', '1반', 2), leader('b', '1반', 1), leader('c', '2반', 1)], 2);
        expect(table.columns.filter((c) => c.section === '리더').map((c) => c.label)).toEqual(['+1', '+2']);
        expect(table.rows.map((r) => [r.cells.leader2.value, r.cells.leader1.value])).toEqual([[1, 1], [0, 1]]);
    });

    it('+2가 한 반에 몰리면 그 반의 +2 칸을 표시합니다', () => {
        const table = calculateBalanceTable(
            [leader('a', '1반', 2), leader('b', '1반', 2), leader('c', '1반', 2), leader('d', '2반', 1), leader('e', '3반', 1)],
            3,
        );
        expect(table.difference.leader2.flagged).toBe(true);
        expect(table.rows.map((r) => r.cells.leader2.flagged)).toEqual([true, false, false]);
    });

    it('+1이 없어도 +2 리더가 있는 반은 리더가 없는 반으로 보지 않습니다', () => {
        const ones = (cn: string) => [leader(`${cn}x`, cn, 1), leader(`${cn}y`, cn, 1)];
        const table = calculateBalanceTable(
            [leader('a', '1반', 2), ...ones('2반'), ...ones('3반'), ...ones('4반'), makeStudent({ id: 'z', assigned_class: '5반' })],
            5,
        );
        expect(table.rows.map((r) => r.cells.leader1.flagged)).toEqual([false, false, false, false, true]);
    });

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
        expect(table.rows.map((r) => r.cells.leader1.flagged)).toEqual([true, false, false, false]);
    });

    it('많은 쪽도 그대로 표시하고 리더가 있는 적은 반은 표시하지 않습니다', () => {
        expect(flagColumn([1, 3, 3, 5], 1, 'aboveOrNone').cells.map((c) => c.flagged)).toEqual([false, false, false, true]);
    });

    it('차이가 기준 안이면 표시하지 않습니다', () => {
        expect(flagColumn([0, 1, 1, 1], 1, 'aboveOrNone').cells.some((c) => c.flagged)).toBe(false);
    });
});

describe('18. 두 반 보기 순서', () => {
    const list = [
        makeStudent({ id: 'm1', name: '가', gender: 'M', assigned_class: '1반' }),
        makeStudent({ id: 'm2', name: '다', gender: 'M', assigned_class: '1반', is_pre_transfer: true }),
        makeStudent({ id: 'f1', name: '나', gender: 'F', assigned_class: '1반' }),
        makeStudent({ id: 'f2', name: '라', gender: 'F', assigned_class: '1반', is_pre_transfer: true }),
    ];

    it.each(['mixed', 'maleFirst', 'femaleFirst'] as const)('번호 순서와 같습니다: %s', (method) => {
        const numbers = calculateAttendanceNumbers(list, method);
        const order = groupStudentsByClass(list, ['1반'], method)['1반'].map((s) => numbers[s.id]);
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });
});

describe('20. 계 줄', () => {
    const list = [
        makeStudent({ id: 'a', name: '가상가', gender: 'M', academic_score: 100, assigned_class: '1반', prev_info: '1-1-1' }),
        makeStudent({ id: 'b', name: '가상나', gender: 'F', academic_score: 200, assigned_class: '1반', prev_info: '1-1-2' }),
        makeStudent({ id: 't', name: '가상다', gender: 'M', academic_score: 900, assigned_class: '1반', prev_info: '1-1-3', is_pre_transfer: true }),
    ];

    it.each([0, 1])('전출 뒤 기준이고 전출을 함께 적습니다: 시트 %i', async (sheetIndex) => {
        const rows = await rowsOf(buildResultWorkbook(list, 2).worksheets[sheetIndex]);
        const total = rows.find((r) => r.includes('계'))!;
        expect(total).toContain('2명');
        expect(total).toContain('남:1 여:1');
        expect(total).toContain('150.0');
        expect(total).toContain('전출 1명 제외');
    });

    it('전출이 없으면 적지 않습니다', async () => {
        const rows = await rowsOf(buildResultWorkbook(list.slice(0, 2), 2).worksheets[0]);
        expect(rows.find((r) => r.includes('계'))!.join()).not.toContain('전출');
    });

    it('전출 학생만 있는 반의 평균이 NaN이 되지 않습니다', async () => {
        const rows = await rowsOf(buildResultWorkbook([list[2]], 2).worksheets[0]);
        expect(rows.flat().join()).not.toContain('NaN');
    });
});

describe('21. 글자로 나가는 undefined, NaN', () => {
    it('양식 B에서 이전 학년이 비어도 undefined가 들어가지 않습니다', () => {
        const { students } = parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 1, 반: 1, 반_1: 2 }]);
        expect(students[0].prev_info).toBe('-2-');
    });

    it('양식 A에서 번호가 비어도 undefined가 들어가지 않습니다', () => {
        const { students } = parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 1, 학년: 2, 반: 1 }]);
        expect(students[0].prev_info).toBe('2-1-');
    });

    it('이전 학년이 숫자가 아니면 배정 학년을 비웁니다', async () => {
        const list = [makeStudent({ name: '가상', assigned_class: '1반', prev_info: '가-1-1' })];
        for (const sheet of buildResultWorkbook(list, 2).worksheets) {
            const text = (await rowsOf(sheet)).flat().join();
            expect(text).not.toContain('NaN');
        }
    });

    it('예전 파일의 undefined도 결과 파일에 나가지 않습니다', async () => {
        const list = [makeStudent({ name: '가상', assigned_class: '1반', prev_info: 'undefined-2-undefined' })];
        for (const sheet of buildResultWorkbook(list, 2).worksheets) {
            expect((await rowsOf(sheet)).flat().join()).not.toContain('undefined');
        }
    });
});

describe('22. 양식 B의 전입생', () => {
    it('이전 반이 빈 줄도 앞쪽 반을 배정반으로 읽습니다', () => {
        const { students } = parseRosterRows([
            { 학년: 3, 반: 1, 번호: 1, 이름: '가상가', 성별: '남', 성적: 1, 학년_1: 2, 반_1: 5, 번호_1: 7 },
            { 학년: 3, 반: 2, 번호: 1, 이름: '전입생', 성별: '여', 성적: 1 },
        ]);
        expect(students[0]).toMatchObject({ assigned_class: '1반', prev_info: '2-5-7' });
        expect(students[1]).toMatchObject({ assigned_class: '2반', prev_info: '' });
    });

    it('양식 A는 그대로 앞쪽 반을 이전 반으로 읽습니다', () => {
        const { students } = parseRosterRows([{ 학년: 2, 반: 1, 번호: 3, 이름: '가상', 성별: '남', 성적: 1 }]);
        expect(students[0]).toMatchObject({ assigned_class: null, prev_info: '2-1-3' });
    });
});

describe('23. 생활지도 읽기', () => {
    const unreadable = { behaviorType: 'NONE', behaviorScore: 0, isUnreadable: true };

    it.each([
        ['행동(-2) 리더 2명과 갈등'],
        ['정서(-2) 행동 1회'],
        ['행동 관찰 2회'],
        ['행동 2회'],
        ['리더 2명과 갈등'],
        ['행동(-2) 정서(-1)'],
        ['행동(-4)'],
        ['리더(+3)'],
        ['행동 12'],
        ['관찰 필요'],
    ])('애매하면 읽지 않고 경고합니다: %s', (value) => {
        expect(parseBehaviorDropdown(value)).toEqual(unreadable);
    });

    it.each([
        ['행동(-2)', 'BEHAVIOR', -2],
        ['행동 -2', 'BEHAVIOR', -2],
        ['행동-2', 'BEHAVIOR', -2],
        ['행동2', 'BEHAVIOR', -2],
        ['행동(+1)', 'BEHAVIOR', -1],
        ['행동형(-3)', 'BEHAVIOR', -3],
        ['정서(-1)', 'EMOTIONAL', -1],
        ['리더(+2)', 'LEADER', 2],
        ['리더(-2)', 'LEADER', 2],
        ['리더십 +1', 'LEADER', 1],
        ['behavior(-3)', 'BEHAVIOR', -3],
        ['EMOTIONAL 2', 'EMOTIONAL', -2],
        ['행동(-2) 수업 방해가 잦음', 'BEHAVIOR', -2],
        ['학교폭력 행동(-3)', 'BEHAVIOR', -3],
        ['2학년 정서(-1)', 'EMOTIONAL', -1],
    ])('유형 낱말 바로 뒤의 등급만 읽습니다: %s', (value, behaviorType, behaviorScore) => {
        expect(parseBehaviorDropdown(value)).toEqual({ behaviorType, behaviorScore, isUnreadable: false });
    });
});

describe('24. 내보낸 결과 파일을 다시 올릴 때', () => {
    const header = { '학년(배정)': '학년(배정)', '반(배정)': '반(배정)', '번호(배정)': '번호(배정)', 성명: '성명', 성별: '성별', 성적: '성적', '학년(이전)': '학년(이전)', '반(이전)': '반(이전)', '번호(이전)': '번호(이전)' };
    const rows = [
        { '학년(배정)': 3, '반(배정)': 1, '번호(배정)': 1, 성명: '가상가', 성별: '남', 성적: 500, '학년(이전)': 2, '반(이전)': 4, '번호(이전)': 7 },
        { '반(배정)': '계', '번호(배정)': '1명', 성별: '남:1 여:0', 성적: '500.0' },
        header,
        { '학년(배정)': 3, '반(배정)': 2, '번호(배정)': 1, 성명: '가상나', 성별: '여', 성적: 400, '학년(이전)': 2, '반(이전)': 1, '번호(이전)': 2 },
        { '반(배정)': '계', '번호(배정)': '1명', 성명: '전출 1명 제외', 성별: '남:0 여:1', 성적: '400.0' },
    ];

    it('머리글 줄과 계 줄을 학생으로 읽지 않습니다', () => {
        const { students } = parseRosterRows(rows);
        expect(students.map((s) => s.name)).toEqual(['가상가', '가상나']);
    });

    it('반과 이전 반을 맞게 읽습니다', () => {
        const { students } = parseRosterRows(rows);
        expect(students[0]).toMatchObject({ assigned_class: '1반', prev_info: '2-4-7' });
    });

    it('결과 파일이라는 것과 빠진 내용을 알립니다', () => {
        const { warnings } = parseRosterRows(rows);
        expect(warnings.join()).toContain('배정 결과 파일');
        expect(warnings.join()).toContain('생활지도');
    });

    it('평범한 명단에는 그 안내가 없습니다', () => {
        expect(parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 1 }]).warnings).toEqual([]);
    });
});

describe('25. 띄어 쓴 반 표기', () => {
    it('같은 반인지 봅니다', () => {
        expect(sameClass('1 반', '1반')).toBe(true);
        expect(sameClass('1', '1반')).toBe(true);
        expect(sameClass('1반', '2반')).toBe(false);
        expect(sameClass(null, null)).toBe(false);
        expect(sameClass('', '')).toBe(false);
    });

    it('통계가 세어 줍니다', () => {
        const [first] = calculateClassStats([makeStudent({ assigned_class: '1 반', gender: 'M' })], 2);
        expect(first.studentCount).toBe(1);
    });

    it('분리 배정 검사가 잡습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1 반', avoid_ids: ['b'] }),
            makeStudent({ id: 'b', assigned_class: '1반', avoid_ids: ['a'] }),
        ];
        expect(collectViolations(students, 2, []).map((v) => v.type)).toContain('AVOID');
    });

    it('같은 반으로 옮기면 어김을 새로 말하지 않습니다', () => {
        const students = [makeStudent({ id: 'a', assigned_class: '1 반' }), makeStudent({ id: 'b', assigned_class: '1반' })];
        expect(validateMove('a', '1반', students, 2)).toEqual([]);
        expect(previewSwap('a', 'b', students, 2)).toBeNull();
    });

    it('엑셀에서 읽을 때 맞춥니다', () => {
        const { students } = parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 1, 배정반: '1 반', 고정반: '2 반' }]);
        expect(students[0]).toMatchObject({ assigned_class: '1반', fixed_class: '2반' });
    });
});
