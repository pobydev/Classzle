import { describe, expect, it } from 'vitest';
import { assignStudents } from '@/lib/assignment';
import { recommendSwaps } from '@/lib/recommend';
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

    it('떼어 놓을 학생과 같은 반이 되는 교환은 뺍니다', () => {
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

    it('성적 평균이 좋아지는 상대를 앞에 둡니다', () => {
        const students = [
            makeStudent({ id: 'high', assigned_class: '1반', academic_score: 900 }),
            makeStudent({ id: 'x', assigned_class: '1반', academic_score: 800 }),
            makeStudent({ id: 'low', assigned_class: '2반', academic_score: 100 }),
            makeStudent({ id: 'mid', assigned_class: '2반', academic_score: 700 }),
        ];
        // mid와 바꾸면 반 평균이 750과 500(차이 250), low와 바꾸면 450과 800(차이 350)입니다.
        expect(ids(recommendSwaps('high', students, 2))[0]).toBe('mid');
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
