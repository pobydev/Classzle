import { describe, expect, it, vi } from 'vitest';
import { parseProjectFile, repairStoredState } from '@/lib/projectFile';
import { makeStudent } from './helpers/students';

const settings = { classCount: 3, scoreTolerance: 50, numberingMethod: 'mixed', useAdvancedConstraints: true };
const file = (value: unknown) => JSON.stringify(value);

// v1.2.4(57c5986)의 엑셀 읽기 코드가 만들던 학생 모양입니다. 성적은 Number(글자)이고 저장하면 NaN이 null이 됩니다.
const fromV124 = (row: { 이름: string; 성적: unknown; 고정반?: unknown; 배정반?: string }) => ({
    id: `id-${row.이름}`,
    name: String(row.이름),
    prev_info: 'undefined-2-',
    gender: 'M',
    academic_score: Number(row.성적 || 500),
    behavior_score: -2,
    behavior_type: 'BEHAVIOR',
    behavior_note: '',
    group_ids: [],
    avoid_ids: [],
    keep_ids: [],
    fixed_class: row.고정반 || undefined,
    birth: undefined,
    assigned_class: row.배정반 ?? null,
});

describe('저장 파일 읽기', () => {
    it('제대로 된 파일은 그대로 읽습니다', () => {
        const students = [makeStudent({ id: 'a', name: '가상' })];
        const { data, notices } = parseProjectFile(file({ students, groups: [], settings, movementHistory: [] }))!;
        expect(data.students[0]).toMatchObject({ id: 'a', name: '가상' });
        expect(data.settings.classCount).toBe(3);
        expect(data.movementHistory).toEqual([]);
        expect(notices).toEqual([]);
    });

    it('예전 파일에 없는 값은 빈 값으로 채웁니다', () => {
        const { data } = parseProjectFile(file({ students: [{ id: 'a', name: '가상', academic_score: 500, behavior_score: 0 }], settings }))!;
        expect(data.groups).toEqual([]);
        expect(data.movementHistory).toBeUndefined();
        expect(data.students[0]).toMatchObject({ prev_info: '', behavior_type: 'NONE', group_ids: [], avoid_ids: [], keep_ids: [] });
    });

    it.each([
        ['JSON이 아님', '{깨진 파일'],
        ['객체가 아님', '[1, 2]'],
        ['null', 'null'],
        ['students가 글자', file({ students: '이상한 값', settings })],
        ['students가 없음', file({ settings })],
        ['학생이 객체가 아님', file({ students: [1], settings })],
        ['이름이 숫자', file({ students: [{ id: 'a', name: 1, academic_score: 1, behavior_score: 0 }], settings })],
        ['관계가 배열이 아님', file({ students: [{ id: 'a', name: '가', academic_score: 1, behavior_score: 0, avoid_ids: 'b' }], settings })],
        ['같은 학생 번호가 둘', file({ students: [{ id: 'a', name: '가' }, { id: 'a', name: '나' }], settings })],
        ['settings가 없음', file({ students: [] })],
        ['학급 수가 글자', file({ students: [], settings: { classCount: '3' } })],
        ['groups가 글자', file({ students: [], settings, groups: 'x' })],
        ['그룹 형식이 다름', file({ students: [], settings, groups: [{ id: 'g' }] })],
        ['이력이 글자', file({ students: [], settings, movementHistory: 'x' })],
        ['이력에 null', file({ students: [], settings, movementHistory: [null] })],
        ['이력의 반이 숫자', file({ students: [], settings, movementHistory: [{ studentId: 'a', oldClass: 1, newClass: '2반' }] })],
    ])('형식이 다르면 읽지 않습니다: %s', (_, content) => {
        expect(parseProjectFile(content)).toBeNull();
    });

    it.each([0, -3, 1, 21, 2.5, 3e7, 1e10])('학급 수는 2~20의 정수만 받습니다: %d', (classCount) => {
        expect(parseProjectFile(file({ students: [], settings: { ...settings, classCount } }))).toBeNull();
    });

    it.each([2, 20])('범위의 끝은 받습니다: %d', (classCount) => {
        expect(parseProjectFile(file({ students: [], settings: { ...settings, classCount } }))?.data.settings.classCount).toBe(classCount);
    });
});

describe('v1.2.4 저장 파일', () => {
    const students = [
        fromV124({ 이름: '결시생', 성적: '결시', 배정반: '1 반' }),
        fromV124({ 이름: '가상', 성적: 720, 고정반: 2 }),
    ];
    // JSON을 거치면 NaN이 null이 됩니다.
    const saved = file({ students, groups: [], settings });

    it('시험 자료가 v1.2.4와 같이 null을 담고 있습니다', () => {
        expect(JSON.parse(saved).students[0].academic_score).toBeNull();
    });

    it('성적이 빈 학생을 500점으로 넣고 이름과 함께 알립니다', () => {
        const { data, notices } = parseProjectFile(saved)!;
        expect(data.students[0].academic_score).toBe(500);
        expect(data.students[1].academic_score).toBe(720);
        expect(notices.join()).toContain('500점');
        expect(notices.join()).toContain('결시생');
        expect(notices.join()).not.toContain('가상');
    });

    it('옛 값을 지금 형식으로 맞춥니다', () => {
        const { data } = parseProjectFile(saved)!;
        expect(data.students[0].assigned_class).toBe('1반');
        // 옛 코드는 고정반 칸의 숫자를 그대로 저장했습니다.
        expect(data.students[1].fixed_class).toBe('2반');
        expect(data.students[0].behavior_score).toBe(-2);
    });

    it('옛 이력도 읽고 반 표기를 맞춥니다', () => {
        const old = { studentId: 'id-가상', studentName: '가상', oldClass: '1 반', newClass: null, timestamp: 5, type: 'move' };
        const { data } = parseProjectFile(file({ students, settings, movementHistory: [old] }))!;
        expect(data.movementHistory![0]).toMatchObject({ oldClass: '1반', newClass: null, timestamp: 5, type: 'move' });
    });

    it('있을 수 있는 다른 옛 필드에 걸리지 않습니다', () => {
        const others = [{ id: 'a', name: '가', gender: '', academic_score: '12', behavior_type: 'none', behavior_score: null, prev_info: 3, birth: '2010.01.01.', avoid_memos: null, group_ids: null }];
        const { data, notices } = parseProjectFile(file({ students: others, settings: { classCount: 2 } }))!;
        expect(data.students[0]).toMatchObject({ gender: 'F', academic_score: 12, behavior_type: 'NONE', behavior_score: 0, prev_info: '3', group_ids: [] });
        expect(data.settings).toMatchObject({ classCount: 2, numberingMethod: 'mixed', scoreTolerance: 50 });
        expect(notices.join()).toContain('여학생');
    });
});

describe('저장소의 나쁜 값 고치기', () => {
    const roster = [makeStudent({ id: 'a', assigned_class: '3반' }), makeStudent({ id: 'b', assigned_class: '1 반' })];

    it('비었으면 고칠 것이 없습니다', () => {
        expect(repairStoredState(undefined)).toBeNull();
        expect(repairStoredState('글자')).toBeNull();
    });

    it('학급 수를 배정된 반에서 찾아 고치고 알립니다', () => {
        const fixed = repairStoredState({ students: roster, settings: { ...settings, classCount: 1e10 } })!;
        expect(fixed.data.settings.classCount).toBe(3);
        expect(fixed.data.students).toHaveLength(2);
        expect(fixed.notices.join()).toContain('학급 수');
    });

    it('찾을 수 없으면 기본 학급 수로 둡니다', () => {
        expect(repairStoredState({ students: [], settings: { classCount: -3 } })!.data.settings.classCount).toBe(4);
    });

    it('명단이 글자이면 비우고 알립니다', () => {
        const fixed = repairStoredState({ students: '이상한 값', settings })!;
        expect(fixed.data.students).toEqual([]);
        expect(fixed.notices.join()).toContain('학생 명단');
    });

    it('읽을 수 있는 학생과 이력은 남깁니다', () => {
        const fixed = repairStoredState({ students: [null, ...roster], settings, movementHistory: [null, { studentId: 'a', oldClass: null, newClass: '1반', timestamp: 1 }] })!;
        expect(fixed.data.students.map((s) => s.id)).toEqual(['a', 'b']);
        expect(fixed.data.movementHistory).toHaveLength(1);
        expect(fixed.notices.join()).toContain('학생 1명');
        expect(fixed.notices.join()).toContain('변경 이력');
    });

    it('옛 값을 조용히 맞추고 성적이 빈 학생은 알립니다', () => {
        const fixed = repairStoredState({ students: [fromV124({ 이름: '결시생', 성적: '결시' }), ...roster], settings, movementHistory: [] })!;
        expect(fixed.data.students[0].academic_score).toBe(500);
        expect(fixed.data.students[2].assigned_class).toBe('1반');
        expect(fixed.notices).toHaveLength(1);
        expect(fixed.notices[0]).toContain('결시생');
    });

    it('멀쩡하면 알릴 것이 없습니다', () => {
        expect(repairStoredState({ students: roster, groups: [], settings, movementHistory: [] })!.notices).toEqual([]);
    });
});

describe('앱을 켤 때 저장소 읽기', () => {
    const start = async (saved: string) => {
        vi.resetModules();
        const memory = new Map([['classzle-storage', saved]]);
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => memory.get(key) ?? null,
            setItem: (key: string, value: string) => void memory.set(key, value),
            removeItem: (key: string) => void memory.delete(key),
        });
        const { useClasszleStore } = await import('@/lib/store');
        // 고친 값을 저장소에 다시 쓰는 일은 만든 다음에 합니다.
        await Promise.resolve();
        vi.unstubAllGlobals();
        return { state: useClasszleStore.getState(), memory };
    };
    const wrap = (state: unknown) => JSON.stringify({ state, version: 0 });

    it('학급 수가 터무니없어도 켜지고 고친 값을 저장합니다', async () => {
        const { state, memory } = await start(wrap({ students: [makeStudent({ id: 'a' })], groups: [], settings: { ...settings, classCount: 1e10 }, movementHistory: [] }));
        expect(state.settings.classCount).toBe(4);
        expect(state.students).toHaveLength(1);
        expect(state.notices.join()).toContain('학급 수');
        expect(JSON.parse(memory.get('classzle-storage')!).state.settings.classCount).toBe(4);
    });

    it('이력의 null과 되돌리기 기록의 글자를 쓰지 않습니다', async () => {
        const { state } = await start(wrap({ students: [], groups: [], settings, movementHistory: [null], undoStack: 'x' }));
        expect(state.movementHistory).toEqual([]);
        expect(state.undoStack).toEqual([]);
    });

    it('JSON이 깨졌으면 빈 작업으로 켜고 알립니다', async () => {
        const { state } = await start('{깨진');
        expect(state.students).toEqual([]);
        expect(state.notices.join()).toContain('읽지 못해');
    });

    it('멀쩡하면 알리지 않습니다', async () => {
        const { state } = await start(wrap({ students: [makeStudent({ id: 'a' })], groups: [], settings, movementHistory: [] }));
        expect(state.notices).toEqual([]);
        expect(state.settings.classCount).toBe(3);
    });
});
