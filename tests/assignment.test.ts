import { describe, expect, it } from 'vitest';
import { assignStudents, collectViolations } from '@/lib/assignment';
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

    it('고정 반은 어떤 조건보다 먼저 지킵니다', () => {
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

    it('떼어 놓기와 함께 두기가 부딪히면 떼어 놓기를 지키고 어긴 것을 보여 줍니다', () => {
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

    it('고정 반이 다른 학생을 함께 두라고 하면 고정 반을 지키고 어긴 것을 보여 줍니다', () => {
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

    it('함께 두기가 그룹 분산보다 먼저입니다', () => {
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

    it('고정 반 표기가 달라도 같은 반으로 봅니다', () => {
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

    it('어긴 고정 반을 고칩니다', () => {
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

    it('고정, 떼어 놓기, 함께 두기, 그룹, 인원, 남녀를 모두 찾습니다', () => {
        const students = [
            makeStudent({ id: 'a', gender: 'M', assigned_class: '1반', fixed_class: '2반', avoid_ids: ['b'] }),
            makeStudent({ id: 'b', gender: 'M', assigned_class: '1반', avoid_ids: ['a'], keep_ids: ['d'] }),
            makeStudent({ id: 'c', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: 'd', gender: 'F', assigned_class: '2반', keep_ids: ['b'] }),
        ];
        const types = collectViolations(students, 2, groups).map((v) => v.type);
        expect(types).toEqual(expect.arrayContaining(['FIXED_CLASS', 'AVOID', 'KEEP', 'GROUP_IMBALANCE', 'COUNT_IMBALANCE', 'GENDER_IMBALANCE']));
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
