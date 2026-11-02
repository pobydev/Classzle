import { beforeEach, describe, expect, it } from 'vitest';
import { useClasszleStore } from '@/lib/store';
import { makeStudent } from './helpers/students';

const store = () => useClasszleStore.getState();
const classOf = (id: string) => store().students.find((s) => s.id === id)?.assigned_class;

describe('작업 상태', () => {
    beforeEach(() => {
        store().resetAll();
        store().setStudents([
            makeStudent({ id: 'a', assigned_class: '1반' }),
            makeStudent({ id: 'b', assigned_class: '2반' }),
            makeStudent({ id: 'c', assigned_class: '2반' }),
        ]);
    });

    it('학생을 지우면 다른 학생의 관계와 메모에서도 빠집니다', () => {
        store().addAvoidRelation('a', 'b', '사유');
        store().addKeepRelation('a', 'c');
        store().deleteStudent('b');
        const a = store().students.find((s) => s.id === 'a')!;
        expect(a.avoid_ids).toEqual([]);
        expect(a.avoid_memos).toEqual({});
        expect(a.keep_ids).toEqual(['c']);
    });

    it('교환을 되돌리면 반과 이력이 돌아옵니다', () => {
        store().swapStudents('a', 'b');
        expect(classOf('a')).toBe('2반');
        expect(store().movementHistory).toHaveLength(1);
        store().undoLastChange();
        expect(classOf('a')).toBe('1반');
        expect(classOf('b')).toBe('2반');
        expect(store().movementHistory).toHaveLength(0);
        expect(store().undoStack).toHaveLength(0);
    });

    it('반으로 옮기기를 되돌립니다', () => {
        store().assignStudentToClass('a', '2반');
        store().undoLastChange();
        expect(classOf('a')).toBe('1반');
    });

    it('자동 배정을 되돌리면 그 전 배정과 이력이 돌아옵니다', () => {
        store().swapStudents('a', 'b');
        const next = store().students.map((s) => ({ ...s, assigned_class: '1반' }));
        store().applyAssignment(next, [], true);
        expect(store().movementHistory).toHaveLength(0);
        store().undoLastChange();
        expect(classOf('a')).toBe('2반');
        expect(store().movementHistory).toHaveLength(1);
    });

    it('되돌려도 그 사이에 바꾼 조건은 남습니다', () => {
        store().swapStudents('a', 'b');
        store().addAvoidRelation('a', 'c');
        store().undoLastChange();
        expect(classOf('a')).toBe('1반');
        expect(store().students.find((s) => s.id === 'a')!.avoid_ids).toEqual(['c']);
    });

    it('되돌릴 것이 없으면 아무 일도 하지 않습니다', () => {
        const before = store().students;
        store().undoLastChange();
        expect(store().students).toBe(before);
    });

    it('수정 이력은 쌓이고 신규 배정은 이력을 새로 시작합니다', () => {
        const change = { studentId: 'a', studentName: '가', oldClass: '1반', newClass: '2반', timestamp: 1 };
        store().applyAssignment(store().students, [change], false);
        store().applyAssignment(store().students, [change], false);
        expect(store().movementHistory).toHaveLength(2);
        store().applyAssignment(store().students, [], true);
        expect(store().movementHistory).toHaveLength(0);
    });

    it('저장 파일의 이력을 불러오고, 없으면 이전 이력을 지웁니다', () => {
        const change = { studentId: 'a', studentName: '가', oldClass: '1반', newClass: '2반', timestamp: 1 };
        const { students, groups, settings } = store();
        store().loadProject({ students, groups, settings, movementHistory: [change] });
        expect(store().movementHistory).toEqual([change]);
        store().loadProject({ students, groups, settings });
        expect(store().movementHistory).toEqual([]);
        expect(store().undoStack).toEqual([]);
    });

    it('새 명단을 넣으면 되돌리기 기록을 비웁니다', () => {
        store().swapStudents('a', 'b');
        store().setStudents([makeStudent({ id: 'z' })]);
        expect(store().undoStack).toEqual([]);
    });
});
