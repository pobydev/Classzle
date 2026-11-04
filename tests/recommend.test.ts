import { describe, expect, it } from 'vitest';
import { assignStudents } from '@/lib/assignment';
import { describeRecommendation, describeScoreDifference, describeScoreGapChange, guidanceSteps, recommendSwaps } from '@/lib/recommend';
import { validateMove, validateSwap } from '@/lib/validation';
import type { Student } from '@/types';
import { makeScenario, SCENARIOS } from './helpers/problem';
import { makeStudent } from './helpers/students';

const ids = (list: { studentId: string }[]) => list.map((r) => r.studentId);

describe('교환 추천', () => {
    const two = (extraA: Partial<Student> = {}, extraB: Partial<Student> = {}) => [
        makeStudent({ id: 'a', gender: 'M', assigned_class: '1반', ...extraA }),
        makeStudent({ id: 'b', gender: 'M', assigned_class: '2반', ...extraB }),
    ];

    it('같은 반 학생은 추천하지 않습니다', () => {
        const students = [...two(), makeStudent({ id: 'c', gender: 'M', assigned_class: '1반' })];
        expect(ids(recommendSwaps('a', students, 2))).toEqual(['b']);
    });

    it('고정 반을 어기는 상대는 뺍니다', () => {
        expect(recommendSwaps('a', two({ fixed_class: '1반' }), 2)).toEqual([]);
        expect(recommendSwaps('a', two({}, { fixed_class: '2반' }), 2)).toEqual([]);
    });

    it('분리 배정 상대와 같은 반이 되는 교환은 뺍니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['c'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '2반', avoid_ids: ['a'] }),
        ];
        // b와 바꾸면 a와 c가 같은 반이 됩니다. c와 맞바꾸면 여전히 다른 반이라 괜찮습니다.
        expect(ids(recommendSwaps('a', students, 2))).toEqual(['c']);
    });

    it('함께 둘 학생과 나뉘는 교환은 뺍니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', keep_ids: ['c'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '1반', keep_ids: ['a'] }),
        ];
        expect(ids(recommendSwaps('a', students, 2))).toEqual([]);
    });

    it('남녀 인원이 벌어지는 교환은 뺍니다', () => {
        const students = Array.from({ length: 8 }, (_, i) =>
            makeStudent({ id: `s${i}`, gender: i % 2 ? 'M' : 'F', assigned_class: i < 4 ? '1반' : '2반' }),
        );
        const self = students[0];
        const result = recommendSwaps(self.id, students, 2);
        result.forEach((r) => {
            const partner = students.find((s) => s.id === r.studentId)!;
            expect(partner.gender).toBe(self.gender);
        });
        expect(result.length).toBeGreaterThan(0);
    });

    it('그룹이 몰리는 교환은 뺍니다', () => {
        const groups = [{ id: 'g', name: '그룹', color: '', member_ids: ['a', 'c'] }];
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', group_ids: ['g'] }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '2반', group_ids: ['g'] }),
            makeStudent({ id: 'd', assigned_class: '1반' }),
        ];
        // a와 b를 바꾸면 2반에 그룹이 둘 모입니다. 차이 2명이므로 추천하지 않습니다.
        expect(ids(recommendSwaps('a', students, 2, groups))).not.toContain('b');
    });

    it('전출 예정 학생과 바꾸어 전출 뒤 인원이 벌어지면 뺍니다', () => {
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'k', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'b', gender: 'M', assigned_class: '2반', is_pre_transfer: true }),
            makeStudent({ id: 'm', gender: 'M', assigned_class: '2반' }),
            makeStudent({ id: 'n', gender: 'M', assigned_class: '2반' }),
        ];
        expect(ids(recommendSwaps('a', students, 2))).not.toContain('b');
    });

    // 남학생 21명을 10점 간격으로 둡니다(r0 100점 ~ r20 300점). 순위가 한 명 차이면 5%p입니다.
    // 성적 범위가 200점이라 점수 차이 상한은 20점(10%)입니다. 따로 적지 않은 학생은 3반에 둡니다.
    const ladder = (placed: Record<number, Partial<Student>>) =>
        Array.from({ length: 21 }, (_, r) =>
            makeStudent({ id: `r${r}`, gender: 'M', academic_score: 100 + r * 10, assigned_class: '3반', ...placed[r] }),
        );
    // 순위만 따로 보려고 점수를 촘촘히 둡니다. r0~r19는 1점 간격(600~619점)이고 r20만 1000점입니다.
    // 성적 범위가 400점이라 점수 차이 상한(40점)에 걸리는 학생은 r20뿐입니다.
    const denseLadder = (placed: Record<number, Partial<Student>>) =>
        Array.from({ length: 21 }, (_, r) =>
            makeStudent({ id: `r${r}`, gender: 'M', academic_score: r === 20 ? 1000 : 600 + r, assigned_class: '3반', ...placed[r] }),
        );

    it('같은 성별 학생만 추천합니다', () => {
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'k', gender: 'F', assigned_class: '1반' }),
            makeStudent({ id: 'girl', gender: 'F', assigned_class: '2반' }),
            makeStudent({ id: 'boy', gender: 'M', assigned_class: '2반' }),
        ];
        // 성적과 생활지도가 똑같아도 다른 성별은 추천하지 않습니다.
        expect(ids(recommendSwaps('a', students, 2))).toEqual(['boy']);
        expect(ids(recommendSwaps('k', students, 2))).toEqual(['girl']);
    });

    it('전출 예정 학생은 전출 예정 학생끼리, 남는 학생은 남는 학생끼리 추천합니다', () => {
        const students = [
            makeStudent({ id: 'leave1', assigned_class: '1반', is_pre_transfer: true }),
            makeStudent({ id: 'stay1', assigned_class: '1반' }),
            makeStudent({ id: 'leave2', assigned_class: '2반', is_pre_transfer: true }),
            makeStudent({ id: 'stay2', assigned_class: '2반' }),
            makeStudent({ id: 'leave3', assigned_class: '3반', is_pre_transfer: true }),
            makeStudent({ id: 'stay3', assigned_class: '3반' }),
        ];
        expect(ids(recommendSwaps('leave1', students, 3)).sort()).toEqual(['leave2', 'leave3']);
        expect(ids(recommendSwaps('stay1', students, 3)).sort()).toEqual(['stay2', 'stay3']);
    });

    it('전출 예정 학생끼리는 성적 순위와 생활지도가 달라도 추천합니다', () => {
        const students = [
            makeStudent({ id: 'leave1', assigned_class: '1반', is_pre_transfer: true, academic_score: 900 }),
            makeStudent({ id: 'leave2', assigned_class: '2반', is_pre_transfer: true, academic_score: 100, behavior_type: 'BEHAVIOR', behavior_score: -3 }),
            makeStudent({ id: 'stay1', assigned_class: '1반' }),
            makeStudent({ id: 'stay2', assigned_class: '2반' }),
        ];
        const [only] = recommendSwaps('leave1', students, 2);
        expect(only.studentId).toBe('leave2');
        expect(describeRecommendation(only)).toBe('성적 차이 800점 · 생활지도 다름(없음 → 행-3)');
    });

    it('성적 순위가 가장 비슷한 학생이 1번입니다', () => {
        const students = ladder({ 10: { assigned_class: '1반' }, 9: { assigned_class: '1반' }, 11: { assigned_class: '2반' }, 13: { assigned_class: '2반' } });
        const result = recommendSwaps('r10', students, 3);
        expect(result[0].studentId).toBe('r11');
        expect(result[0].rankDifference).toBeCloseTo(5);
        expect(describeRecommendation(result[0])).toBe('성적 차이 10점 · 생활지도 같음');
    });

    it('생활지도가 같아도 성적 순위가 15%p 넘게 차이 나면 뺍니다', () => {
        const students = denseLadder({ 10: { assigned_class: '1반' }, 9: { assigned_class: '1반' }, 11: { assigned_class: '2반' }, 14: { assigned_class: '2반' } });
        const result = recommendSwaps('r10', students, 3);
        // r7과 r13은 15%p, r6과 r14는 20%p 차이입니다. 점수 차이는 모두 40점 안입니다.
        expect(ids(result).sort()).toEqual(['r11', 'r12', 'r13', 'r7', 'r8']);
        result.forEach((r) => expect(r.rankDifference).toBeLessThanOrEqual(15 + 1e-9));
    });

    it('순위가 15%p 안이어도 점수 차이가 같은 성별 성적 범위의 10%를 넘으면 뺍니다', () => {
        const students = ladder({ 10: { assigned_class: '1반' }, 9: { assigned_class: '1반' }, 11: { assigned_class: '2반' }, 13: { assigned_class: '2반' } });
        const result = recommendSwaps('r10', students, 3);
        // 범위 200점의 10%는 20점입니다. r12, r8은 20점이라 남고, r13, r7은 15%p지만 30점이라 빠집니다.
        expect(ids(result).sort()).toEqual(['r11', 'r12', 'r8']);
        result.forEach((r) => expect(r.scoreDifference).toBeLessThanOrEqual(20 + 1e-9));
        // '성적만'은 이 상한이 없습니다.
        expect(ids(recommendSwaps('r10', students, 3, [], 10, 'score'))).toContain('r13');
    });

    it('생활지도가 한 칸 다르고 성적이 아주 가까운 학생이 생활지도가 같고 성적이 먼 학생보다 앞섭니다', () => {
        const students = denseLadder({
            10: { assigned_class: '1반' },
            11: { assigned_class: '2반', behavior_type: 'EMOTIONAL', behavior_score: -1 },
            13: { assigned_class: '2반' },
        });
        const result = recommendSwaps('r10', students, 3);
        const order = ids(result);
        // r11: 한 칸(5) + 5%p = 10. r13: 0칸 + 15%p = 15.
        expect(order.indexOf('r11')).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('r11')).toBeLessThan(order.indexOf('r13'));
        const near = result.find((r) => r.studentId === 'r11')!;
        expect(near.order).toBeCloseTo(10);
        expect(describeRecommendation(near)).toBe('성적 차이 1점 · 생활지도 한 칸 차이(없음 → 정-1)');
    });

    it('생활지도가 두 칸 이상 다르면 뺍니다', () => {
        const students = ladder({
            10: { assigned_class: '1반', behavior_type: 'BEHAVIOR', behavior_score: -3 },
            11: { assigned_class: '2반', behavior_type: 'BEHAVIOR', behavior_score: -1 },
            12: { assigned_class: '2반', behavior_type: 'BEHAVIOR', behavior_score: -2 },
            9: { assigned_class: '2반', behavior_type: 'LEADER', behavior_score: 1 },
        });
        // 행-3과 한 칸 차이는 r12(행-2)뿐입니다. 행-1, 리더, 생활지도 없는 학생은 두 칸 이상입니다.
        const result = recommendSwaps('r10', students, 3);
        expect(ids(result)).toEqual(['r12']);
        expect(describeRecommendation(result[0])).toBe('성적 차이 20점 · 생활지도 한 칸 차이(행-3 → 행-2)');
    });

    it('순서 값과 성적 차이가 같으면 균형이 좋아지는 상대를 앞에 둡니다', () => {
        const students = ladder({
            8: { assigned_class: '1반' },
            20: { assigned_class: '1반' },
            7: { assigned_class: '2반' },
            9: { assigned_class: '2반' },
        });
        // 둘 다 5%p, 10점 차이입니다. r7과 바꾸면 반 평균이 235와 185, r9와 바꾸면 245와 175입니다.
        const order = ids(recommendSwaps('r8', students, 3));
        expect(order.slice(0, 2)).toEqual(['r7', 'r9']);
    });

    it('성적이 같아도 분리 배정이나 고정 배정을 어기면 뺍니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['enemy'] }),
            makeStudent({ id: 'k', assigned_class: '1반' }),
            makeStudent({ id: 'enemy', assigned_class: '2반' }),
            makeStudent({ id: 'close', assigned_class: '2반' }),
            makeStudent({ id: 'pinned', assigned_class: '3반', fixed_class: '3반' }),
            makeStudent({ id: 'other', assigned_class: '3반' }),
        ];
        // close와 바꾸면 a가 enemy와 같은 반이 되고, pinned는 3반 고정입니다.
        expect(ids(recommendSwaps('a', students, 3)).sort()).toEqual(['enemy', 'other']);
    });

    it.each([
        ['-3', { behavior_type: 'BEHAVIOR', behavior_score: -3 }, { behavior_type: 'BEHAVIOR', behavior_score: -2 }],
        ['-2', { behavior_type: 'EMOTIONAL', behavior_score: -2 }, { behavior_type: 'EMOTIONAL', behavior_score: -1 }],
        ['리더 +2', { behavior_type: 'LEADER', behavior_score: 2 }, { behavior_type: 'LEADER', behavior_score: 1 }],
        ['리더 +1', { behavior_type: 'LEADER', behavior_score: 1 }, { behavior_type: 'NONE', behavior_score: 0 }],
    ] as const)('%s 학생을 이미 많은 반으로 보내는 교환은 뺍니다', (_, mark, neighbor) => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', ...mark }),
            makeStudent({ id: 'f1', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반', ...mark }),
            makeStudent({ id: 'c', assigned_class: '2반', ...mark }),
            // 생활지도 한 칸 차이에 성적이 같아 닮은 학생이지만, 바꾸면 2반이 3명이 됩니다.
            makeStudent({ id: 'f2', assigned_class: '2반', ...neighbor }),
            makeStudent({ id: 'f3', assigned_class: '3반' }),
            makeStudent({ id: 'f4', assigned_class: '3반' }),
        ];
        const result = ids(recommendSwaps('a', students, 3));
        expect(result).not.toContain('f2');
        expect(result).toContain('b');
    });

    it('10명까지만 돌려줍니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1000);
        const solved = assignStudents(p.students, cfg.classes, p.groups, { seed: 1, iterations: 100000 });
        const free = solved.students.find((s) => !s.fixed_class && s.avoid_ids.length === 0 && s.keep_ids.length === 0 && s.group_ids.length === 0)!;
        expect(recommendSwaps(free.id, solved.students, cfg.classes, p.groups).length).toBeLessThanOrEqual(10);
    });

    it('추천한 교환은 실제로 조건을 새로 어기지 않습니다', () => {
        const cfg = SCENARIOS['보통 12반 330명'];
        const p = makeScenario(cfg, 1000);
        const solved = assignStudents(p.students, cfg.classes, p.groups, { seed: 1, maxMs: 60000 });
        expect(solved.violations).toEqual([]);
        const chosen = solved.students.filter((s) => !s.fixed_class).slice(0, 12);
        for (const s of chosen) {
            for (const r of recommendSwaps(s.id, solved.students, cfg.classes, p.groups)) {
                expect(validateSwap(s.id, r.studentId, solved.students, cfg.classes, p.groups)).toEqual([]);
            }
        }
    });

    it('없는 학생이나 미배정 학생이면 빈 목록입니다', () => {
        expect(recommendSwaps('없음', two(), 2)).toEqual([]);
        expect(recommendSwaps('a', two({ assigned_class: null }), 2)).toEqual([]);
    });
});

describe('성적만 추천', () => {
    const ladder = (placed: Record<number, Partial<Student>>) =>
        Array.from({ length: 21 }, (_, r) =>
            makeStudent({ id: `r${r}`, gender: 'M', academic_score: 100 + r * 10, assigned_class: '3반', ...placed[r] }),
        );

    it('생활지도가 두 칸 이상 다른 상대도 성적이 가까우면 나오고, 다름이라고 씁니다', () => {
        const students = ladder({
            10: { assigned_class: '1반' },
            11: { assigned_class: '2반', behavior_type: 'BEHAVIOR', behavior_score: -3 },
        });
        expect(ids(recommendSwaps('r10', students, 3))).not.toContain('r11');
        const result = recommendSwaps('r10', students, 3, [], 10, 'score');
        const r11 = result.find((r) => r.studentId === 'r11')!;
        expect(r11).toBeDefined();
        expect(describeRecommendation(r11, 'score')).toBe('성적 차이 10점 · 생활지도 다름(없음 → 행-3)');
    });

    it('성적 순위 15%p 제한이 없고 성적이 가까운 순입니다', () => {
        const students = ladder({ 10: { assigned_class: '1반' }, 9: { assigned_class: '1반' }, 11: { assigned_class: '2반' }, 14: { assigned_class: '2반' } });
        const result = recommendSwaps('r10', students, 3, [], 20, 'score');
        expect(ids(result)).toContain('r14');
        const gaps = result.map((r) => r.scoreDifference);
        expect(gaps).toEqual([...gaps].sort((a, b) => a - b));
    });

    it('한 칸 차이도 다름이라고 씁니다', () => {
        expect(describeRecommendation({ scoreDifference: 4, guidanceChange: { from: '행-2', to: '행-1', steps: 1 } }, 'score'))
            .toBe('성적 차이 4점 · 생활지도 다름(행-2 → 행-1)');
    });

    it('필수 조건을 어기는 상대는 여전히 뺍니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['enemy'] }),
            makeStudent({ id: 'k', assigned_class: '1반' }),
            makeStudent({ id: 'enemy', assigned_class: '2반' }),
            makeStudent({ id: 'close', assigned_class: '2반' }),
            makeStudent({ id: 'pinned', assigned_class: '3반', fixed_class: '3반' }),
            makeStudent({ id: 'other', assigned_class: '3반' }),
            makeStudent({ id: 'girl', gender: 'F', assigned_class: '3반' }),
        ];
        expect(ids(recommendSwaps('a', students, 3, [], 10, 'score')).sort()).toEqual(['enemy', 'other']);
    });

    it('바꾸면 몰림이 새로 생기는 상대도 나오고 몰림을 글로 알립니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', behavior_type: 'EMOTIONAL', behavior_score: -2 }),
            makeStudent({ id: 'f1', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반', behavior_type: 'EMOTIONAL', behavior_score: -2 }),
            makeStudent({ id: 'c', assigned_class: '2반', behavior_type: 'EMOTIONAL', behavior_score: -2 }),
            makeStudent({ id: 'f2', assigned_class: '2반' }),
            makeStudent({ id: 'f3', assigned_class: '3반' }),
            makeStudent({ id: 'f4', assigned_class: '3반' }),
        ];
        expect(ids(recommendSwaps('a', students, 3))).not.toContain('f2');
        const f2 = recommendSwaps('a', students, 3, [], 10, 'score').find((r) => r.studentId === 'f2')!;
        expect(f2).toBeDefined();
        expect(f2.warnings).toEqual(['2반 -2가 몰립니다']);
        // 생활지도까지 방식에는 몰림 안내가 없습니다.
        recommendSwaps('a', students, 3).forEach((r) => expect(r.warnings).toEqual([]));
    });

    it('같은 반의 몰림은 더 자세한 쪽 하나만 적습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', behavior_type: 'EMOTIONAL', behavior_score: -2 }),
            makeStudent({ id: 'f1', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반', behavior_type: 'EMOTIONAL', behavior_score: -2 }),
            makeStudent({ id: 'c', assigned_class: '2반', behavior_type: 'BEHAVIOR', behavior_score: -2 }),
            makeStudent({ id: 'd', assigned_class: '3반', behavior_type: 'BEHAVIOR', behavior_score: -2 }),
            makeStudent({ id: 'f2', assigned_class: '2반' }),
            makeStudent({ id: 'f3', assigned_class: '3반' }),
            makeStudent({ id: 'f4', assigned_class: '3반' }),
        ];
        // a를 2반으로 보내면 -2 전체(3명)와 정서 -2(2명)가 함께 몰립니다.
        const f2 = recommendSwaps('a', students, 3, [], 10, 'score').find((r) => r.studentId === 'f2')!;
        expect(f2.warnings).toEqual(['2반 정서 -2가 몰립니다']);
    });

    it('리더가 한 명도 없게 되는 반은 모자랍니다라고 알립니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', behavior_type: 'LEADER', behavior_score: 1 }),
            makeStudent({ id: 'b', assigned_class: '2반', behavior_type: 'LEADER', behavior_score: 1 }),
            makeStudent({ id: 'f', assigned_class: '2반' }),
            makeStudent({ id: 'g', assigned_class: '1반' }),
        ];
        const f = recommendSwaps('a', students, 2, [], 10, 'score').find((r) => r.studentId === 'f')!;
        expect(f.warnings).toContain('1반 리더가 모자랍니다');
        expect(f.warnings).toContain('2반 리더가 몰립니다');
    });
});

describe('교환 뒤 성적 평균 차이', () => {
    // 3반에 성적이 아주 높은 학생 40명을 둡니다. 평균은 1반과 2반만 봅니다.
    // 성적이 먼 상대의 값도 보려고 점수 차이로 거르지 않는 '성적만'으로 셉니다. 평균 차이 계산은 두 방식이 같습니다.
    const pool = Array.from({ length: 40 }, (_, i) => makeStudent({ id: `p${i}`, assigned_class: '3반', academic_score: 2000 + i }));
    const changeFor = (students: Student[], partner: string) =>
        recommendSwaps('a', [...students, ...pool], 3, [], 10, 'score').find((r) => r.studentId === partner)?.scoreGapChange;

    it('두 반의 평균 차이가 얼마나 변하는지 알려 줍니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', academic_score: 900 }),
            makeStudent({ id: 'k', assigned_class: '1반', academic_score: 800 }),
            makeStudent({ id: 'b', assigned_class: '2반', academic_score: 100 }),
            makeStudent({ id: 'm', assigned_class: '2반', academic_score: 700 }),
        ];
        // 전: 850과 400, 차이 450. b와 바꾸면 450과 800, 차이 350. m과 바꾸면 750과 500, 차이 250.
        expect(changeFor(students, 'b')).toBeCloseTo(-100);
        expect(changeFor(students, 'm')).toBeCloseTo(-200);
    });

    it('평균 차이가 벌어지면 양수입니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', academic_score: 400 }),
            makeStudent({ id: 'k', assigned_class: '1반', academic_score: 600 }),
            makeStudent({ id: 'b', assigned_class: '2반', academic_score: 700 }),
            makeStudent({ id: 'm', assigned_class: '2반', academic_score: 300 }),
        ];
        // 전: 500과 500, 차이 0. b와 바꾸면 650과 350, 차이 300.
        expect(changeFor(students, 'b')).toBeCloseTo(300);
    });

    it('전출 예정 학생은 평균에 넣지 않습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', academic_score: 900 }),
            makeStudent({ id: 'k', assigned_class: '1반', academic_score: 500 }),
            makeStudent({ id: 'b', assigned_class: '2반', academic_score: 100 }),
            makeStudent({ id: 'm', assigned_class: '2반', academic_score: 300 }),
            makeStudent({ id: 't', assigned_class: '2반', academic_score: 1000, is_pre_transfer: true }),
        ];
        // 전: 1반 700, 2반 200(전출 학생 뺌), 차이 500. b와 바꾸면 1반 300, 2반 600, 차이 300.
        // 전출 학생을 넣고 셌다면 차이가 오히려 200 벌어진 것으로 나옵니다.
        expect(changeFor(students, 'b')).toBeCloseTo(-200);
    });

    it('전출 뒤 학생이 없는 반이 있으면 0입니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', academic_score: 900, is_pre_transfer: true }),
            makeStudent({ id: 'b', assigned_class: '2반', academic_score: 100, is_pre_transfer: true }),
        ];
        expect(changeFor(students, 'b')).toBe(0);
    });

    it('성적 차이를 점수로 알려 줍니다', () => {
        expect(describeScoreDifference(10)).toBe('성적 차이 10점');
        expect(describeScoreDifference(2.345)).toBe('성적 차이 2.3점');
        expect(describeScoreDifference(0)).toBe('성적 차이 0점');
    });

    it('교사가 읽을 문구로 바꿉니다', () => {
        expect(describeScoreGapChange(-2.34)).toBe('성적 평균 차이 2.3 줄어듦');
        expect(describeScoreGapChange(1.26)).toBe('성적 평균 차이 1.3 늘어남');
        expect(describeScoreGapChange(0.2)).toBe('성적 평균 차이 거의 그대로');
        expect(describeScoreGapChange(-0.49)).toBe('성적 평균 차이 거의 그대로');
        expect(describeScoreGapChange(0)).toBe('성적 평균 차이 거의 그대로');
    });
});

describe('학생 옮기기 검사', () => {
    it('남녀, 그룹, 인원을 함께 검사합니다', () => {
        const groups = [{ id: 'g', name: '그룹', color: '', member_ids: ['a', 'c'] }];
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'b', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'c', gender: 'M', assigned_class: '2반' }),
            makeStudent({ id: 'd', gender: 'M', assigned_class: '2반' }),
        ];
        const types = validateMove('a', '2반', students, 2, groups).map((v) => v.type);
        expect(types).toEqual(expect.arrayContaining(['GROUP_IMBALANCE', 'COUNT_IMBALANCE', 'GENDER_IMBALANCE']));
    });

    it('이미 어긴 조건이 나아지면 알리지 않습니다', () => {
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'b', gender: 'F', assigned_class: '1반' }),
            makeStudent({ id: 'c', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'd', gender: 'F', assigned_class: '1반' }),
            makeStudent({ id: 'e', gender: 'M', assigned_class: '2반' }),
        ];
        expect(validateMove('a', '2반', students, 2)).toEqual([]);
    });

    it('교환에서 그룹이 몰리면 알립니다', () => {
        const groups = [{ id: 'g', name: '그룹', color: '', member_ids: ['a', 'c'] }];
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '2반' }),
            makeStudent({ id: 'd', assigned_class: '1반' }),
        ];
        expect(validateSwap('a', 'b', students, 2, groups).map((v) => v.type)).toContain('GROUP_IMBALANCE');
    });
});

describe('생활지도 칸 수', () => {
    const g = (behavior_type: Student['behavior_type'], behavior_score: number) => ({ behavior_type, behavior_score });
    const none = g('NONE', 0);

    it('같으면 0칸입니다', () => {
        expect(guidanceSteps(g('BEHAVIOR', -2), g('BEHAVIOR', -2))).toBe(0);
        expect(guidanceSteps(none, none)).toBe(0);
        expect(guidanceSteps(g('LEADER', 2), g('LEADER', 2))).toBe(0);
    });

    it.each([
        ['행-3 ↔ 행-2', g('BEHAVIOR', -3), g('BEHAVIOR', -2)],
        ['정-2 ↔ 정-1', g('EMOTIONAL', -2), g('EMOTIONAL', -1)],
        ['행-1 ↔ 없음', g('BEHAVIOR', -1), none],
        ['없음 ↔ 정-1', none, g('EMOTIONAL', -1)],
        ['행-3 ↔ 정-3', g('BEHAVIOR', -3), g('EMOTIONAL', -3)],
        ['행-1 ↔ 정-1', g('BEHAVIOR', -1), g('EMOTIONAL', -1)],
        ['리+2 ↔ 리+1', g('LEADER', 2), g('LEADER', 1)],
        ['리+1 ↔ 없음', g('LEADER', 1), none],
    ])('%s는 한 칸입니다', (_, a, b) => {
        expect(guidanceSteps(a, b)).toBe(1);
        expect(guidanceSteps(b, a)).toBe(1);
    });

    it.each([
        ['행-3 ↔ 행-1', g('BEHAVIOR', -3), g('BEHAVIOR', -1)],
        ['행-2 ↔ 없음', g('BEHAVIOR', -2), none],
        ['행-3 ↔ 정-2', g('BEHAVIOR', -3), g('EMOTIONAL', -2)],
        ['리+2 ↔ 없음', g('LEADER', 2), none],
        ['리+1 ↔ 행-1', g('LEADER', 1), g('BEHAVIOR', -1)],
        ['리+2 ↔ 정-3', g('LEADER', 2), g('EMOTIONAL', -3)],
    ])('%s는 두 칸 이상입니다', (_, a, b) => {
        expect(guidanceSteps(a, b)).toBe(2);
        expect(guidanceSteps(b, a)).toBe(2);
    });
});
