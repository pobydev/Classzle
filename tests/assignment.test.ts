import { describe, expect, it } from 'vitest';
import { assignStudents, collectViolations } from '@/lib/assignment';
import { recommendSwaps } from '@/lib/recommend';
import type { Student } from '@/types';
import { makeScenario, measure, SCENARIOS, snakeTentative } from './helpers/problem';
import { makeStudent } from './helpers/students';

// 시험이 시간 제한 때문에 달라지지 않도록 넉넉히 줍니다.
const FAST = { maxMs: 60000 };

describe('신규 배정', () => {
    it.each(Object.entries(SCENARIOS))('%s: 딱 떨어지는 조건을 모두 지킵니다', (_, cfg) => {
        for (let i = 0; i < 2; i++) {
            const p = makeScenario(cfg, 1000 + i * 7);
            const result = assignStudents(p.students, cfg.classes, p.groups, { seed: 5000 + i, ...FAST });
            const m = measure(result.students, p.groups, p.names);
            expect(m).toMatchObject({ fixed: 0, avoid: 0, keep: 0, unassigned: 0 });
            expect(m.groupSpread).toBeLessThanOrEqual(1);
            expect(m.count).toBeLessThanOrEqual(1);
            expect(m.male).toBeLessThanOrEqual(1);
            expect(m.female).toBeLessThanOrEqual(1);
            expect(result.violations).toEqual([]);
        }
    });

    it('평균만이 아니라 성적 구간까지 고르게 섞습니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1000);
        const result = assignStudents(p.students, cfg.classes, p.groups, { seed: 5000, ...FAST });
        const m = measure(result.students, p.groups, p.names);
        expect(m.score).toBeLessThan(5);
        expect(m.bandMax).toBeLessThanOrEqual(2);
    });

    it('-3, -2 학생 수를 반별 차이 1명 안으로 맞춥니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1000);
        const result = assignStudents(p.students, cfg.classes, p.groups, { seed: 5000, ...FAST });
        const m = measure(result.students, p.groups, p.names);
        expect(m.minus3).toBeLessThanOrEqual(1);
        expect(m.minus2).toBeLessThanOrEqual(1);
    });

    it('-3, -2는 유형별로 반별 차이 1명 안으로 맞추고 어려움 합계도 맞춥니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        for (let i = 0; i < 3; i++) {
            const p = makeScenario(cfg, 1000 + i * 7);
            const result = assignStudents(p.students, cfg.classes, p.groups, { seed: 5000 + i, ...FAST });
            const m = measure(result.students, p.groups, p.names);
            expect(Math.max(m.typeLevel.b3, m.typeLevel.e3, m.typeLevel.b2, m.typeLevel.e2)).toBeLessThanOrEqual(1);
            expect(m.negativeSum).toBeLessThanOrEqual(2);
            expect(result.violations).toEqual([]);
        }
    });

    it('리더가 반 수보다 많으면 리더 없는 반이 없습니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1007);
        const result = assignStudents(p.students, cfg.classes, p.groups, { seed: 5001, ...FAST });
        expect(measure(result.students, p.groups, p.names).noLeader).toBe(0);
    });

    it('같은 씨앗이면 결과가 같고, 씨앗이 다르면 달라집니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1000);
        const options = { iterations: 50000, maxMs: 60000 };
        const classes = (seed: number) =>
            assignStudents(p.students, cfg.classes, p.groups, { seed, ...options }).students.map((s) => s.assigned_class);
        expect(classes(1)).toEqual(classes(1));
        expect(classes(1)).not.toEqual(classes(2));
    });

    it('원본 학생 자료를 바꾸지 않습니다', () => {
        const students = [makeStudent({ id: 'a' }), makeStudent({ id: 'b' })];
        const before = JSON.stringify(students);
        assignStudents(students, 2, [], { seed: 1, iterations: 1000 });
        expect(JSON.stringify(students)).toBe(before);
    });

    it('학생 수와 순서를 그대로 둡니다', () => {
        const students = [makeStudent({ id: 'a' }), makeStudent({ id: 'b' }), makeStudent({ id: 'c' })];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 1000 });
        expect(result.students.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('학생이 없거나 반이 하나여도 멈추지 않습니다', () => {
        expect(assignStudents([], 3, []).students).toEqual([]);
        const one = assignStudents([makeStudent({ id: 'a' })], 1, [], { seed: 1 });
        expect(one.students[0].assigned_class).toBe('1반');
    });
});

describe('충돌할 때의 순서', () => {
    const base = (id: string, extra: Partial<Student> = {}) => makeStudent({ id, ...extra });

    it('고정 배정은 어떤 조건보다 먼저 지킵니다', () => {
        const students = [
            base('a', { fixed_class: '1반', avoid_ids: ['b'] }),
            base('b', { fixed_class: '1반', avoid_ids: ['a'] }),
            base('c'),
            base('d'),
        ];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).toBe('1반');
        expect(result.students[1].assigned_class).toBe('1반');
        expect(result.violations.map((v) => v.type)).toContain('AVOID');
    });

    it('분리 배정과 함께 배정이 부딪히면 분리 배정을 지키고 어긴 것을 보여 줍니다', () => {
        const students = [
            base('a', { avoid_ids: ['b'], keep_ids: ['b'] }),
            base('b', { avoid_ids: ['a'], keep_ids: ['a'] }),
            base('c'),
            base('d'),
        ];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).not.toBe(result.students[1].assigned_class);
        const types = result.violations.map((v) => v.type);
        expect(types).toContain('KEEP');
        expect(types).not.toContain('AVOID');
    });

    it('고정 배정이 다른 학생을 함께 배정하라고 하면 고정 배정을 지키고 어긴 것을 보여 줍니다', () => {
        const students = [
            base('a', { fixed_class: '1반', keep_ids: ['b'] }),
            base('b', { fixed_class: '2반', keep_ids: ['a'] }),
            base('c'),
            base('d'),
        ];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).toBe('1반');
        expect(result.students[1].assigned_class).toBe('2반');
        expect(result.violations.map((v) => v.type)).toContain('KEEP');
    });

    it('함께 배정이 그룹 분산보다 먼저입니다', () => {
        const groups = [{ id: 'g', name: '그룹', color: '', member_ids: ['a', 'b'] }];
        const students = [
            base('a', { keep_ids: ['b'], group_ids: ['g'] }),
            base('b', { keep_ids: ['a'], group_ids: ['g'] }),
            base('c'),
            base('d'),
        ];
        const result = assignStudents(students, 2, groups, { seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).toBe(result.students[1].assigned_class);
    });

    it('고정 배정 표기가 달라도 같은 반으로 봅니다', () => {
        const students = [base('a', { fixed_class: '2' }), base('b', { fixed_class: '2 반' }), base('c'), base('d')];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).toBe('2반');
        expect(result.students[1].assigned_class).toBe('2반');
    });

    it('없는 반에 고정하면 다른 반에 넣고 알립니다', () => {
        const students = [base('a', { fixed_class: '9반' }), base('b')];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 5000 });
        expect(['1반', '2반']).toContain(result.students[0].assigned_class);
        expect(result.violations.find((v) => v.type === 'FIXED_CLASS')?.message).toContain('9반');
    });

    it('지워진 학생과의 관계는 건너뜁니다', () => {
        const students = [base('a', { avoid_ids: ['없음'], keep_ids: ['없음'] }), base('b')];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 5000 });
        expect(result.violations).toEqual([]);
    });

    it('한쪽에만 적힌 관계도 지킵니다', () => {
        const students = [base('a', { avoid_ids: ['b'] }), base('b'), base('c'), base('d')];
        const result = assignStudents(students, 2, [], { seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).not.toBe(result.students[1].assigned_class);
    });
});

describe('전출 예정 학생', () => {
    it('전출 뒤 기준으로 인원과 남녀를 맞추고 전출 학생을 고르게 나눕니다', () => {
        const stay = Array.from({ length: 40 }, (_, i) =>
            makeStudent({ id: `s${i}`, gender: i % 2 ? 'M' : 'F', academic_score: 100 + i * 10 }),
        );
        const leaving = Array.from({ length: 4 }, (_, i) =>
            makeStudent({ id: `t${i}`, gender: 'M', is_pre_transfer: true }),
        );
        const students = [...stay, ...leaving];
        const result = assignStudents(students, 4, [], { seed: 3, ...FAST });
        const m = measure(result.students, [], ['1반', '2반', '3반', '4반']);
        expect(m.count).toBe(0);
        expect(m.male).toBe(0);
        expect(m.female).toBe(0);
        expect(m.transferMax).toBe(1);
    });
});

describe('전학년도 반 섞기', () => {
    it('같은 전학년도 반 학생이 한 반에 몰리지 않습니다', () => {
        const students = Array.from({ length: 80 }, (_, i) =>
            makeStudent({ id: `s${i}`, gender: i % 2 ? 'M' : 'F', academic_score: 1 + i * 11, prev_info: `2-${(i % 4) + 1}-${i}` }),
        );
        const result = assignStudents(students, 4, [], { seed: 3, ...FAST });
        const m = measure(result.students, [], ['1반', '2반', '3반', '4반']);
        expect(m.previousMax).toBeLessThanOrEqual(3);
    });

    it('조건이 있는 문제에서도 전학년도 반을 고르게 나눕니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        for (let i = 0; i < 3; i++) {
            const p = makeScenario(cfg, 1000 + i * 7);
            const result = assignStudents(p.students, cfg.classes, p.groups, { seed: 5000 + i, ...FAST });
            expect(measure(result.students, p.groups, p.names).previousMax).toBeLessThanOrEqual(3);
        }
    });
});

describe('어려움 합계', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const risky = (id: string, type: 'BEHAVIOR' | 'EMOTIONAL', level: number, extra: Partial<Student> = {}) =>
        makeStudent({ id, gender: 'M', behavior_type: type, behavior_score: level, ...extra });
    // 생활지도가 없고 성적이 같은 학생으로 반을 채웁니다.
    const fill = (count: number) =>
        Array.from({ length: count }, (_, i) => makeStudent({ id: `f${i}`, gender: i % 2 ? 'M' : 'F' }));
    const totals = (students: Student[], classCount: number) =>
        Array.from({ length: classCount }, (_, c) =>
            students.filter((s) => s.assigned_class === `${c + 1}반`).reduce((sum, s) => sum + Math.min(s.behavior_score, 0), 0),
        );
    const levelsIn = (students: Student[], level: number, classCount: number) =>
        Array.from({ length: classCount }, (_, c) =>
            students.filter((s) => s.assigned_class === `${c + 1}반` && s.behavior_score === level).length,
        );

    it.each([
        ['행동 -2, 행동 -1 2명', 'BEHAVIOR', 'BEHAVIOR', 'BEHAVIOR'],
        ['행동 -2, 정서 -1 2명', 'BEHAVIOR', 'EMOTIONAL', 'EMOTIONAL'],
        ['정서 -2, 행동 -1, 정서 -1', 'EMOTIONAL', 'BEHAVIOR', 'EMOTIONAL'],
    ] as const)('두 반에 -2 한 명과 -1 두 명이면 -2와 -1 둘로 나눕니다: %s', (_, a, b, c) => {
        const students = [risky('x', a, -2), risky('y', b, -1), risky('z', c, -1), ...fill(40)];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(totals(result.students, 2)).toEqual([-2, -2]);
            expect(result.violations).toEqual([]);
        }
    });

    it('두 반에 -3 한 명과 -1 세 명이면 -3과 -1 셋으로 나눕니다', () => {
        const students = [
            risky('x', 'BEHAVIOR', -3),
            risky('y', 'BEHAVIOR', -1),
            risky('z', 'EMOTIONAL', -1),
            risky('w', 'BEHAVIOR', -1),
            ...fill(40),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(totals(result.students, 2)).toEqual([-3, -3]);
            expect(levelsIn(result.students, -1, 2).sort()).toEqual([0, 3]);
        }
    });

    it('네 반이어도 -1 인원이 달라져야 합계가 같으면 합계를 맞춥니다', () => {
        // 반마다 -3이 되는 나눔은 (-3), (-3), (-2, -1), (-1, -1, -1) 하나뿐입니다.
        const students = [
            risky('a', 'BEHAVIOR', -3),
            risky('b', 'EMOTIONAL', -3),
            risky('c', 'BEHAVIOR', -2),
            risky('d', 'BEHAVIOR', -1),
            risky('e', 'EMOTIONAL', -1),
            risky('g', 'BEHAVIOR', -1),
            risky('h', 'EMOTIONAL', -1),
            ...fill(80),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 4, [], { seed, ...FAST });
            expect(totals(result.students, 4)).toEqual([-3, -3, -3, -3]);
            expect(levelsIn(result.students, -1, 4).sort()).toEqual([0, 0, 1, 3]);
        }
    });

    it('-1이 많아도 -3 두 명을 한 반에 넣지 않습니다', () => {
        const students = [
            risky('a', 'BEHAVIOR', -3),
            risky('b', 'BEHAVIOR', -3),
            ...['p', 'q', 'r', 's', 't', 'u'].map((id) => risky(id, 'EMOTIONAL', -1)),
            ...fill(40),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(levelsIn(result.students, -3, 2)).toEqual([1, 1]);
        }
    });

    it('-3을 모아야만 합계가 같아져도 -3 두 명을 한 반에 넣지 않습니다', () => {
        // 2반과 3반에 -1이 6명씩 고정이라 두 -3을 1반에 모으면 합계가 모두 -6이 됩니다. 유형이 달라 유형별 벌점도 없습니다.
        const fixedOnes = (cn: string, prefix: string) =>
            ['1', '2', '3', '4', '5', '6'].map((n) => risky(prefix + n, 'EMOTIONAL', -1, { fixed_class: cn }));
        const students = [
            risky('a', 'BEHAVIOR', -3),
            risky('b', 'EMOTIONAL', -3),
            ...fixedOnes('2반', 'p'),
            ...fixedOnes('3반', 'q'),
            ...Array.from({ length: 60 }, (_, i) => makeStudent({ id: `f${i}`, gender: i % 4 === 0 ? 'M' : 'F' })),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 3, [], { seed, ...FAST });
            expect(Math.max(...levelsIn(result.students, -3, 3))).toBe(1);
        }
    });

    it('합계를 고를 때 리더로 상쇄하지 않습니다', () => {
        // 리더를 합계에 넣으면 1반 -3, 리더 없음과 2반 -3, +2가 다르게 보입니다. 음수만 보므로 두 반의 합계는 같습니다.
        const students = [
            risky('a', 'BEHAVIOR', -3),
            risky('b', 'BEHAVIOR', -3),
            makeStudent({ id: 'l', gender: 'F', behavior_type: 'LEADER', behavior_score: 2 }),
            ...fill(20),
        ];
        for (const seed of SEEDS) {
            expect(totals(assignStudents(students, 2, [], { seed, ...FAST }).students, 2)).toEqual([-3, -3]);
        }
    });
});

describe('행동과 정서를 등급마다 따로 맞추기', () => {
    const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const CLASSES = ['1반', '2반'];

    const risky = (id: string, type: 'BEHAVIOR' | 'EMOTIONAL', level: number, extra: Partial<Student> = {}) =>
        makeStudent({ id, gender: 'M', behavior_type: type, behavior_score: level, ...extra });
    // 남녀 같은 수로 다른 학생을 채웁니다. 앞의 절반은 1반, 뒤의 절반은 2반입니다.
    const fillers = (count: number) =>
        Array.from({ length: count }, (_, i) =>
            makeStudent({
                id: `f${i}`,
                gender: i % 2 ? 'M' : 'F',
                academic_score: 100 + i * 37,
                assigned_class: i < count / 2 ? '1반' : '2반',
            }),
        );
    const perClass = (students: Student[], type: string, level: number) =>
        CLASSES.map((cn) => students.filter((s) => s.assigned_class === cn && s.behavior_type === type && s.behavior_score === level).length);

    it.each([-3, -2, -1])('행동 %i 2명과 정서 같은 등급 2명을 반마다 1명씩 나눕니다', (level) => {
        const students = [
            risky('b1', 'BEHAVIOR', level),
            risky('b2', 'BEHAVIOR', level),
            risky('e1', 'EMOTIONAL', level),
            risky('e2', 'EMOTIONAL', level),
            ...fillers(16),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(perClass(result.students, 'BEHAVIOR', level)).toEqual([1, 1]);
            expect(perClass(result.students, 'EMOTIONAL', level)).toEqual([1, 1]);
            expect(result.violations).toEqual([]);
        }
    });

    // 등급별 합과 유형별 합이 모두 맞아서 유형을 등급마다 보지 않으면 벌점이 0인 배치입니다.
    // 1반: 행동 -3 2명, 행동 -2 1명, 정서 -2 1명, 정서 -1 2명. 2반은 그 반대입니다.
    // 이 항목이 없으면 이런 배치가 네 번에 한 번쯤 나오므로 씨앗을 넉넉히 씁니다.
    const MANY_SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
    const masked = () => [
        risky('b3a', 'BEHAVIOR', -3, { assigned_class: '1반' }),
        risky('b3b', 'BEHAVIOR', -3, { assigned_class: '1반' }),
        risky('b2a', 'BEHAVIOR', -2, { assigned_class: '1반' }),
        risky('e2a', 'EMOTIONAL', -2, { assigned_class: '1반' }),
        risky('e1a', 'EMOTIONAL', -1, { assigned_class: '1반' }),
        risky('e1b', 'EMOTIONAL', -1, { assigned_class: '1반' }),
        risky('e3a', 'EMOTIONAL', -3, { assigned_class: '2반' }),
        risky('e3b', 'EMOTIONAL', -3, { assigned_class: '2반' }),
        risky('b2b', 'BEHAVIOR', -2, { assigned_class: '2반' }),
        risky('e2b', 'EMOTIONAL', -2, { assigned_class: '2반' }),
        risky('b1a', 'BEHAVIOR', -1, { assigned_class: '2반' }),
        risky('b1b', 'BEHAVIOR', -1, { assigned_class: '2반' }),
        ...fillers(16),
    ];
    const expectEven = (students: Student[]) => {
        for (const level of [-3, -2, -1]) {
            expect(perClass(students, 'BEHAVIOR', level)).toEqual([1, 1]);
            expect(perClass(students, 'EMOTIONAL', level)).toEqual([1, 1]);
        }
    };

    it('등급 합과 유형 합이 맞아 보여도 유형을 등급마다 나눕니다', () => {
        for (const seed of MANY_SEEDS) expectEven(assignStudents(masked(), 2, [], { seed, ...FAST }).students);
    });

    it('균형 조정도 한쪽에 몰린 유형을 나눕니다', () => {
        for (const seed of MANY_SEEDS) {
            const result = assignStudents(masked(), 2, [], { mode: 'balance', seed, ...FAST });
            expectEven(result.students);
            expect(result.violations).toEqual([]);
        }
    });

    it('수정은 어긴 조건이 없으면 유형이 몰려 있어도 옮기지 않습니다', () => {
        const result = assignStudents(masked(), 2, [], { mode: 'optimize', seed: 1, ...FAST });
        expect(result.moved).toBe(0);
    });

    it('교환 추천은 유형이 나뉘는 상대를 먼저 보여 줍니다', () => {
        // b3a를 e3a나 e3b와 바꾸면 두 반 모두 행동 -3과 정서 -3이 1명씩이 됩니다.
        const [first] = recommendSwaps('b3a', masked(), 2);
        expect(['e3a', 'e3b']).toContain(first.studentId);
        expect(first.balanceChange).toBeLessThan(0);
    });

    // 행동 2명은 유형 합 때문에 갈라집니다. 정서 -1이 어느 쪽에 가도 다른 항목의 벌점은 같습니다.
    it('등급이 같으면 어려움 합계가 비슷한 쪽을 고릅니다', () => {
        const students = [
            risky('b3', 'BEHAVIOR', -3),
            risky('b2', 'BEHAVIOR', -2),
            risky('e1', 'EMOTIONAL', -1),
            ...fillers(16),
        ];
        const total = (list: Student[], cn: string) =>
            list.filter((s) => s.assigned_class === cn).reduce((sum, s) => sum + s.behavior_score, 0);
        for (const seed of MANY_SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(total(result.students, '1반')).toBe(-3);
            expect(total(result.students, '2반')).toBe(-3);
        }
    });

    it('리더가 많아도 -3을 한 반에 모으지 않습니다', () => {
        // -3 두 명을 한 반에 모으고 리더를 몰아주면 점수를 다 더한 값은 0으로 같아지지만 그렇게 하지 않습니다.
        const students = [
            risky('b3a', 'BEHAVIOR', -3),
            risky('b3b', 'BEHAVIOR', -3),
            ...['l1', 'l2', 'l3'].map((id) => makeStudent({ id, gender: 'F', behavior_type: 'LEADER', behavior_score: 2 })),
            ...fillers(15),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(perClass(result.students, 'BEHAVIOR', -3)).toEqual([1, 1]);
        }
    });

    it('교환 추천도 어려움 합계를 봅니다', () => {
        // 1반 합계 -6, 2반 합계 0입니다. -1과 0을 바꾸면 등급은 그대로 고르고 합계만 가까워집니다.
        const students = [
            risky('b3', 'BEHAVIOR', -3, { assigned_class: '1반' }),
            risky('e2', 'EMOTIONAL', -2, { assigned_class: '1반' }),
            risky('e1', 'EMOTIONAL', -1, { assigned_class: '1반' }),
            makeStudent({ id: 'x', gender: 'M', assigned_class: '2반' }),
            makeStudent({ id: 'y', gender: 'M', assigned_class: '2반' }),
            makeStudent({ id: 'z', gender: 'M', assigned_class: '2반' }),
        ];
        const [best] = recommendSwaps('e1', students, 2);
        expect(best.balanceChange).toBeLessThan(0);
    });

    it('고정 배정이 유형 균형보다 먼저입니다', () => {
        const students = [
            risky('a', 'BEHAVIOR', -2, { fixed_class: '1반' }),
            risky('b', 'BEHAVIOR', -2, { fixed_class: '1반' }),
            ...fillers(10),
        ];
        for (const seed of SEEDS) {
            expect(perClass(assignStudents(students, 2, [], { seed, ...FAST }).students, 'BEHAVIOR', -2)).toEqual([2, 0]);
        }
    });

    it('분리 배정이 유형 균형보다 먼저입니다', () => {
        const students = [
            risky('a', 'BEHAVIOR', -3, { avoid_ids: ['c'] }),
            risky('b', 'BEHAVIOR', -3, { avoid_ids: ['c'] }),
            makeStudent({ id: 'c', gender: 'M' }),
            makeStudent({ id: 'd', gender: 'M' }),
            ...fillers(10),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(result.students[0].assigned_class).toBe(result.students[1].assigned_class);
            expect(result.violations).toEqual([]);
        }
    });

    it('함께 배정이 유형 균형보다 먼저입니다', () => {
        const students = [
            risky('a', 'BEHAVIOR', -3, { keep_ids: ['b'] }),
            risky('b', 'BEHAVIOR', -3, { keep_ids: ['a'] }),
            ...fillers(10),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(result.students[0].assigned_class).toBe(result.students[1].assigned_class);
            expect(result.violations).toEqual([]);
        }
    });

    it('남녀 인원이 유형 균형보다 먼저입니다', () => {
        // 고정된 학생 때문에 남은 남학생 둘이 모두 2반으로 가야 남녀 인원이 맞습니다.
        const students = [
            makeStudent({ id: 'p', gender: 'M', fixed_class: '1반' }),
            makeStudent({ id: 'q', gender: 'M', fixed_class: '1반' }),
            makeStudent({ id: 'r', gender: 'F', fixed_class: '2반' }),
            makeStudent({ id: 's', gender: 'F', fixed_class: '2반' }),
            risky('t', 'BEHAVIOR', -3),
            risky('u', 'BEHAVIOR', -3),
            makeStudent({ id: 'v', gender: 'F' }),
            makeStudent({ id: 'w', gender: 'F' }),
        ];
        for (const seed of SEEDS) {
            const result = assignStudents(students, 2, [], { seed, ...FAST });
            expect(perClass(result.students, 'BEHAVIOR', -3)).toEqual([0, 2]);
            expect(result.violations).toEqual([]);
        }
    });
});

describe('현재 배정 수정', () => {
    it('조건을 다 지킨 배정은 한 명도 옮기지 않습니다', () => {
        const cfg = SCENARIOS['보통 12반 330명'];
        const p = makeScenario(cfg, 1000);
        const solved = assignStudents(p.students, cfg.classes, p.groups, { seed: 5000, ...FAST });
        expect(solved.violations).toEqual([]);
        const result = assignStudents(solved.students, cfg.classes, p.groups, { mode: 'optimize', seed: 1, ...FAST });
        expect(result.moved).toBe(0);
        expect(result.violations).toEqual([]);
        expect(result.students.map((s) => s.assigned_class)).toEqual(solved.students.map((s) => s.assigned_class));
    });

    it.each(Object.entries(SCENARIOS))('%s: 어긴 조건을 고치고 신규 배정보다 적게 옮깁니다', (_, cfg) => {
        const p = makeScenario(cfg, 1000);
        const tentative = snakeTentative(p, 7000);
        const repaired = assignStudents(tentative, cfg.classes, p.groups, { mode: 'optimize', seed: 1, ...FAST });
        const m = measure(repaired.students, p.groups, p.names);
        expect(m).toMatchObject({ fixed: 0, avoid: 0, keep: 0, unassigned: 0 });
        expect(m.groupSpread).toBeLessThanOrEqual(1);
        expect(m.count).toBeLessThanOrEqual(1);
        expect(m.male).toBeLessThanOrEqual(1);
        expect(m.female).toBeLessThanOrEqual(1);

        const fresh = assignStudents(tentative, cfg.classes, p.groups, { mode: 'new', seed: 1, ...FAST });
        expect(repaired.moved).toBeLessThan(fresh.moved / 2);
    });

    it('빡빡한 문제에서도 여러 번 모두 고칩니다', () => {
        const cfg = SCENARIOS['빡빡 8반 220명'];
        for (let i = 0; i < 12; i++) {
            const p = makeScenario(cfg, 1000 + i * 7);
            const tentative = snakeTentative(p, 7000 + i);
            const repaired = assignStudents(tentative, cfg.classes, p.groups, { mode: 'optimize', seed: 5000 + i, ...FAST });
            expect(repaired.violations).toEqual([]);
        }
    });

    it('뱀 모양을 크게 흐트러뜨리지 않습니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1000);
        const tentative = snakeTentative(p, 7000);
        const before = measure(tentative, p.groups, p.names);
        const repaired = assignStudents(tentative, cfg.classes, p.groups, { mode: 'optimize', seed: 1, ...FAST });
        const after = measure(repaired.students, p.groups, p.names);
        expect(after.bandAvg).toBeLessThanOrEqual(before.bandAvg + 1);
    });

    it('어긴 고정 배정을 고칩니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', fixed_class: '2반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
        ];
        const result = assignStudents(students, 2, [], { mode: 'optimize', seed: 1, iterations: 20000 });
        expect(result.students[0].assigned_class).toBe('2반');
    });

    it('미배정 학생을 채웁니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '1반' }),
            makeStudent({ id: 'c', assigned_class: null }),
            makeStudent({ id: 'd', assigned_class: null }),
        ];
        const result = assignStudents(students, 2, [], { mode: 'optimize', seed: 1, iterations: 20000 });
        expect(result.students.every((s) => s.assigned_class)).toBe(true);
        expect(result.violations).toEqual([]);
    });
});

describe('균형 조정', () => {
    it('수정보다 성적을 더 고르게 맞춥니다', () => {
        const cfg = SCENARIOS['작음 5반 140명'];
        const p = makeScenario(cfg, 1000);
        const tentative = snakeTentative(p, 7000);
        const repaired = assignStudents(tentative, cfg.classes, p.groups, { mode: 'optimize', seed: 1, ...FAST });
        const balanced = assignStudents(tentative, cfg.classes, p.groups, { mode: 'balance', seed: 1, ...FAST });
        expect(measure(balanced.students, p.groups, p.names).score).toBeLessThan(measure(repaired.students, p.groups, p.names).score);
        expect(balanced.violations).toEqual([]);
    });
});

describe('어긴 조건 찾기', () => {
    const groups = [{ id: 'g', name: '축구부', color: '', member_ids: ['a', 'b', 'c'] }];

    it('모두 지키면 빈 목록입니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
        ];
        expect(collectViolations(students, 2)).toEqual([]);
    });

    it('고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀를 모두 찾습니다', () => {
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반', fixed_class: '2반', avoid_ids: ['b'] }),
            makeStudent({ id: 'b', gender: 'M', assigned_class: '1반', avoid_ids: ['a'], keep_ids: ['d'] }),
            makeStudent({ id: 'c', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'd', gender: 'F', assigned_class: '2반', keep_ids: ['b'] }),
        ];
        const types = collectViolations(students, 2, groups).map((v) => v.type);
        expect(types).toEqual(expect.arrayContaining(['FIXED_CLASS', 'AVOID', 'KEEP', 'GROUP_IMBALANCE', 'COUNT_IMBALANCE', 'GENDER_IMBALANCE']));
    });

    it('승인된 조건 이름으로 알립니다', () => {
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반', fixed_class: '2반', avoid_ids: ['b'] }),
            makeStudent({ id: 'b', gender: 'M', assigned_class: '1반', avoid_ids: ['a'], keep_ids: ['d'] }),
            makeStudent({ id: 'c', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'd', gender: 'F', assigned_class: '2반', keep_ids: ['b'] }),
            makeStudent({ id: 'e', gender: 'F', fixed_class: '9반', assigned_class: '1반' }),
        ];
        const text = (type: string) => collectViolations(students, 2, groups).filter((v) => v.type === type).map((v) => v.message).join(' ');
        expect(text('FIXED_CLASS')).toContain('2반 고정');
        expect(text('FIXED_CLASS')).toContain('고정 배정(9반)');
        expect(text('AVOID')).toContain('분리 배정');
        expect(text('KEEP')).toContain('함께 배정');
        expect(text('GROUP_IMBALANCE')).toContain('그룹 분산');
        const all = collectViolations(students, 2, groups).map((v) => v.message).join(' ');
        for (const old of ['떼어 놓', '함께 두', '고정 반', '제약 조건']) expect(all).not.toContain(old);
    });

    it('미배정 학생을 알립니다', () => {
        const students = [makeStudent({ id: 'a', assigned_class: null })];
        expect(collectViolations(students, 2).map((v) => v.type)).toContain('UNASSIGNED');
    });

    it('같은 어김을 두 번 적지 않습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', avoid_ids: ['b'] }),
            makeStudent({ id: 'b', assigned_class: '1반', avoid_ids: ['a'] }),
            makeStudent({ id: 'c', assigned_class: '2반' }),
            makeStudent({ id: 'd', assigned_class: '2반' }),
        ];
        expect(collectViolations(students, 2).filter((v) => v.type === 'AVOID')).toHaveLength(1);
    });

    it('전출 예정 학생은 인원에 넣지 않습니다', () => {
        const students = [
            makeStudent({ id: 'a', assigned_class: '1반', is_pre_transfer: true }),
            makeStudent({ id: 'b', assigned_class: '1반', is_pre_transfer: true }),
            makeStudent({ id: 'c', assigned_class: '1반' }),
            makeStudent({ id: 'd', assigned_class: '2반' }),
        ];
        expect(collectViolations(students, 2)).toEqual([]);
    });
});
