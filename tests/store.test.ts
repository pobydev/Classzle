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

describe('다른 작업이 시작됐는지', () => {
    const roster = [makeStudent({ id: 'a' })];

    it('새 명단과 전체 초기화에서 바뀝니다', () => {
        const start = useClasszleStore.getState().workId;
        useClasszleStore.getState().setStudents(roster);
        expect(useClasszleStore.getState().workId).toBe(start + 1);
        useClasszleStore.getState().resetAll();
        expect(useClasszleStore.getState().workId).toBe(start + 2);
    });

    it('학생을 고치거나 저장한 작업을 불러올 때는 그대로입니다', () => {
        useClasszleStore.getState().setStudents(roster);
        const start = useClasszleStore.getState().workId;
        useClasszleStore.getState().updateStudent('a', { name: '가상' });
        useClasszleStore.getState().loadProject({ students: roster, groups: [], settings: useClasszleStore.getState().settings });
        expect(useClasszleStore.getState().workId).toBe(start);
    });
});

describe('입력표 반영과 되돌리기', () => {
    const roster = () => [
        makeStudent({ id: 'a', assigned_class: '1반' }),
        makeStudent({ id: 'b', assigned_class: '2반', behavior_type: 'LEADER', behavior_score: 1 }),
    ];
    const withGuidance = (list: ReturnType<typeof roster>) =>
        list.map((s) => (s.id === 'a' ? { ...s, behavior_type: 'BEHAVIOR' as const, behavior_score: -2 } : s));

    beforeEach(() => {
        store().resetAll();
        store().setStudents(roster());
    });

    it('직전 변경이 입력표 반영이면 그것을 되돌립니다', () => {
        store().swapStudents('a', 'b');
        store().applyGuidance(withGuidance(store().students));
        store().undoLastChange();
        const a = store().students.find((s) => s.id === 'a')!;
        expect(a).toMatchObject({ behavior_type: 'NONE', behavior_score: 0 });
        // 앞선 교환은 아직 되돌리지 않았습니다.
        expect(a.assigned_class).toBe('2반');
        store().undoLastChange();
        expect(classOf('a')).toBe('1반');
    });

    it('반을 옮긴 뒤 되돌려도 입력표 값은 그대로입니다', () => {
        store().applyGuidance(withGuidance(store().students));
        store().swapStudents('a', 'b');
        store().undoLastChange();
        expect(store().students.find((s) => s.id === 'a')).toMatchObject({ assigned_class: '1반', behavior_score: -2 });
    });
});
