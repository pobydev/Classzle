import { describe, expect, it } from 'vitest';
import { changeMentions, groupHistory, summarizeStudentChanges } from '@/lib/history';
import type { AssignmentChange } from '@/types';
import { makeStudent } from './helpers/students';

const change = (over: Partial<AssignmentChange>): AssignmentChange => ({
    studentId: 'a',
    studentName: '가상가',
    oldClass: '1반',
    newClass: '2반',
    timestamp: 1000,
    type: 'move',
    source: 'manual',
    ...over,
});

describe('변경 기록 묶기', () => {
    it('자동 수정 한 번은 한 줄입니다', () => {
        const entries = groupHistory([
            change({ source: 'auto', batchId: 'x' }),
            change({ source: 'auto', batchId: 'x', studentId: 'b' }),
            change({ source: 'manual', timestamp: 2000 }),
            change({ source: 'auto', batchId: 'y', timestamp: 3000 }),
        ]);
        expect(entries.map((e) => [e.source, e.changes.length])).toEqual([
            ['auto', 2],
            ['manual', 1],
            ['auto', 1],
        ]);
    });

    it('직접 바꾼 것은 묶지 않습니다', () => {
        expect(groupHistory([change({}), change({ timestamp: 1001 })])).toHaveLength(2);
    });

    it('묶음 표시가 없는 예전 기록은 시간으로 묶습니다', () => {
        const entries = groupHistory([
            change({ source: 'auto', timestamp: 1000 }),
            change({ source: 'auto', timestamp: 1500 }),
            change({ source: 'auto', timestamp: 90000 }),
        ]);
        expect(entries.map((e) => e.changes.length)).toEqual([2, 1]);
    });

    it('빈 기록은 빈 목록입니다', () => {
        expect(groupHistory([])).toEqual([]);
    });
});

describe('학생별 변화', () => {
    const students = [
        makeStudent({ id: 'a', name: '가상가', assigned_class: '2반' }),
        makeStudent({ id: 'b', name: '가상나', assigned_class: '1반' }),
        makeStudent({ id: 'c', name: '가상다', assigned_class: '3반' }),
        makeStudent({ id: 'z', name: '가상없음', assigned_class: '3반' }),
    ];

    it('처음 반과 지금 반을 보여 주고 이력에 없는 학생은 뺍니다', () => {
        const result = summarizeStudentChanges(
            [change({ studentId: 'a', oldClass: '1반', newClass: '2반' })],
            students,
        );
        expect(result).toEqual([
            { id: 'a', name: '가상가', firstClass: '1반', currentClass: '2반', moveCount: 1, returned: false },
        ]);
    });

    it('교환 상대의 처음 반도 찾습니다', () => {
        const result = summarizeStudentChanges(
            [change({ studentId: 'a', oldClass: '1반', newClass: '2반', type: 'swap', partnerId: 'b', partnerName: '가상나' })],
            students,
        );
        expect(result.find((s) => s.id === 'b')).toMatchObject({ firstClass: '2반', currentClass: '1반' });
    });

    it('옮겼다 되돌아온 학생을 표시합니다', () => {
        const result = summarizeStudentChanges(
            [
                change({ studentId: 'c', oldClass: '3반', newClass: '1반' }),
                change({ studentId: 'c', oldClass: '1반', newClass: '3반' }),
            ],
            students,
        );
        expect(result[0]).toMatchObject({ id: 'c', returned: true, moveCount: 2 });
    });
});

describe('이름 찾기', () => {
    it('학생과 교환 상대 이름을 모두 봅니다', () => {
        const swap = change({ type: 'swap', partnerName: '가상나' });
        expect(changeMentions(swap, '가상나')).toBe(true);
        expect(changeMentions(swap, '가상가')).toBe(true);
        expect(changeMentions(swap, '없는이름')).toBe(false);
    });
});
