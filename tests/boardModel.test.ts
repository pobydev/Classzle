import { describe, expect, it } from 'vitest';
import {
    behaviorMark,
    buildRelations,
    groupsOf,
    groupStudentsByClass,
    matchesQuery,
    relationMemo,
    UNASSIGNED,
} from '@/components/step3/boardModel';
import { calculateAttendanceNumbers } from '@/lib/numbering';
import { makeStudent } from './helpers/students';

describe('칩의 생활지도 표시', () => {
    it('유형과 점수를 글자로 적습니다', () => {
        expect(behaviorMark({ behavior_type: 'BEHAVIOR', behavior_score: -3 })?.text).toBe('행-3');
        expect(behaviorMark({ behavior_type: 'EMOTIONAL', behavior_score: -2 })?.text).toBe('정-2');
        expect(behaviorMark({ behavior_type: 'LEADER', behavior_score: 1 })?.text).toBe('리+1');
    });

    it('해당 없음과 0점은 표시하지 않습니다', () => {
        expect(behaviorMark({ behavior_type: 'NONE', behavior_score: 0 })).toBeNull();
        expect(behaviorMark({ behavior_type: 'BEHAVIOR', behavior_score: 0 })).toBeNull();
    });
});

describe('학생 관계 찾기', () => {
    const students = [
        makeStudent({ id: 'a', avoid_ids: ['b', '지운학생'], keep_ids: ['c'], avoid_memos: { b: '다툼' } }),
        makeStudent({ id: 'b' }),
        makeStudent({ id: 'c', keep_ids: ['a'], keep_memos: { a: '단짝' } }),
    ];

    it('한쪽에만 적힌 관계도 양쪽으로 보고 지운 학생은 뺍니다', () => {
        const { avoid, keep } = buildRelations(students);
        expect(avoid.get('a')).toEqual(['b']);
        expect(avoid.get('b')).toEqual(['a']);
        expect(keep.get('a')).toEqual(['c']);
        expect(keep.get('c')).toEqual(['a']);
    });

    it('사유가 어느 쪽에 적혀 있어도 찾습니다', () => {
        const [a, b, c] = students;
        expect(relationMemo('avoid', b, a)).toBe('다툼');
        expect(relationMemo('avoid', a, b)).toBe('다툼');
        expect(relationMemo('keep', a, c)).toBe('단짝');
        expect(relationMemo('keep', a, b)).toBeUndefined();
    });
});

describe('반별 명단', () => {
    it('출석번호 순서와 같습니다', () => {
        const list = [
            makeStudent({ id: '1', name: '다', gender: 'M', assigned_class: '1반' }),
            makeStudent({ id: '2', name: '가', gender: 'F', assigned_class: '1반' }),
            makeStudent({ id: '3', name: '나', gender: 'M', assigned_class: '1반', is_pre_transfer: true }),
            makeStudent({ id: '4', name: '라', gender: 'M', assigned_class: '1반' }),
        ];
        const mixed = groupStudentsByClass(list, ['1반'], 'mixed')['1반'];
        const numbers = calculateAttendanceNumbers(list, 'mixed');
        expect(mixed.map((s) => numbers[s.id])).toEqual([1, 2, 3, 4]);
        expect(mixed.at(-1)?.id).toBe('3');
        const maleFirst = groupStudentsByClass(list, ['1반'], 'maleFirst')['1반'];
        expect(maleFirst.map((s) => s.id).slice(0, 2)).toEqual(['1', '4']);
    });

    it('없는 반에 있는 학생을 미배정에 넣어 사라지지 않게 합니다', () => {
        const list = [
            makeStudent({ id: '1', assigned_class: '13반' }),
            makeStudent({ id: '2', assigned_class: null }),
            makeStudent({ id: '3', assigned_class: '2' }),
        ];
        const result = groupStudentsByClass(list, ['1반', '2반'], 'mixed');
        expect(result[UNASSIGNED].map((s) => s.id).sort()).toEqual(['1', '2']);
        expect(result['2반'].map((s) => s.id)).toEqual(['3']);
    });
});

describe('그 밖의 도우미', () => {
    it('그룹은 어느 쪽에 적혀 있어도 찾습니다', () => {
        const groups = [
            { id: 'g1', name: '축구부', color: '', member_ids: ['a'] },
            { id: 'g2', name: '합창부', color: '', member_ids: [] },
            { id: 'g3', name: '방송부', color: '', member_ids: [] },
        ];
        const found = groupsOf(makeStudent({ id: 'a', group_ids: ['g2'] }), groups);
        expect(found.map((g) => g.id)).toEqual(['g1', 'g2']);
    });

    it('빈 검색어는 아무도 찾지 않습니다', () => {
        const s = makeStudent({ id: 'a', name: '가상일' });
        expect(matchesQuery(s, '')).toBe(false);
        expect(matchesQuery(s, '상일')).toBe(true);
        expect(matchesQuery(s, '없음')).toBe(false);
    });
});
