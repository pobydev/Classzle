import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { repairStoredState } from '@/lib/projectFile';
import { Student, CustomGroup, AppSettings, AssignmentChange } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface ClasszleStore {
    // 새 명단이나 전체 초기화로 다른 작업이 시작될 때마다 바뀝니다. 저장하지 않습니다.
    workId: number;

    // 불러온 뒤 교사가 봐야 할 안내입니다. 1단계 화면에 보여 줍니다. 저장하지 않습니다.
    notices: string[];
    setNotices: (notices: string[]) => void;

    // 지금 명단을 읽은 엑셀 파일 이름입니다. 1단계 요약 줄에 보여 줍니다. 저장하지 않습니다.
    sourceName: string | null;
    setSourceName: (name: string | null) => void;

    // 데이터
    students: Student[];
    groups: CustomGroup[];
    settings: AppSettings;

    // 학생 관련 액션
    setStudents: (students: Student[]) => void;
    addStudent: (student: Omit<Student, 'id'>) => void;
    updateStudent: (id: string, updates: Partial<Student>) => void;
    deleteStudent: (id: string) => void;

    // 그룹 관련 액션
    setGroups: (groups: CustomGroup[]) => void;
    addGroup: (group: Omit<CustomGroup, 'id'>) => void;
    updateGroup: (id: string, updates: Partial<CustomGroup>) => void;
    deleteGroup: (id: string) => void;
    addStudentToGroup: (studentId: string, groupId: string) => void;
    removeStudentFromGroup: (studentId: string, groupId: string) => void;

    // 설정 관련 액션
    setClassCount: (count: number) => void;
    setScoreTolerance: (tolerance: number) => void;
    setNumberingMethod: (method: AppSettings['numberingMethod']) => void;
    setUseAdvancedConstraints: (use: boolean) => void;

    // 배정 관련 액션
    assignStudentToClass: (studentId: string, className: string | null) => void;
    resetAssignments: () => void;
    applyAssignment: (students: Student[], changes: AssignmentChange[], startHistory: boolean) => void;

    // 입력표 반영도 되돌리기 한 번으로 돌아옵니다.
    applyGuidance: (students: Student[]) => void;

    // 되돌리기. 배정, 이력, 입력표로 넣은 생활지도만 되돌리고 그 사이에 바꾼 조건은 그대로 둡니다.
    undoStack: UndoSnapshot[];
    undoLastChange: () => void;

    // 관계 설정 액션
    addAvoidRelation: (studentId: string, avoidId: string, memo?: string) => void;
    removeAvoidRelation: (studentId: string, avoidId: string) => void;
    addKeepRelation: (studentId: string, keepId: string, memo?: string) => void;
    removeKeepRelation: (studentId: string, keepId: string) => void;
    setFixedClass: (studentId: string, className: string | undefined, memo?: string) => void;
    swapStudents: (studentId1: string, studentId2: string) => void;

    // 초기화
    resetAll: () => void;
    loadProject: (data: { students: Student[]; groups: CustomGroup[]; settings: AppSettings; movementHistory?: AssignmentChange[] }) => void;

    // 이동 이력
    movementHistory: AssignmentChange[];
    addMovements: (changes: AssignmentChange[]) => void;
    clearMovements: () => void;
}

const defaultSettings: AppSettings = {
    classCount: 4,
    scoreTolerance: 50,
    numberingMethod: 'mixed',
    useAdvancedConstraints: true,
};

type GuidanceValue = Pick<Student, 'behavior_type' | 'behavior_score'>;

interface UndoSnapshot {
    assignments: Record<string, string | null>;
    movementHistory: AssignmentChange[];
    // 입력표가 실제로 바꾼 학생의 전과 후입니다. 번호 방식은 표시 설정이라 기록하지 않습니다.
    guidance?: Record<string, { before: GuidanceValue; applied: GuidanceValue }>;
}

const MAX_UNDO = 30;

function withSnapshot(
    state: { students: Student[]; movementHistory: AssignmentChange[]; undoStack: UndoSnapshot[] },
    guidance?: UndoSnapshot['guidance'],
): UndoSnapshot[] {
    const assignments: Record<string, string | null> = {};
    state.students.forEach((s) => {
        assignments[s.id] = s.assigned_class ?? null;
    });
    const snapshot: UndoSnapshot = { assignments, movementHistory: state.movementHistory };
    if (guidance) snapshot.guidance = guidance;
    return [...state.undoStack, snapshot].slice(-MAX_UNDO);
}

const guidanceOf = (s: Student): GuidanceValue => ({ behavior_type: s.behavior_type, behavior_score: s.behavior_score });
const sameGuidance = (a: GuidanceValue, b: GuidanceValue) => a.behavior_type === b.behavior_type && a.behavior_score === b.behavior_score;

// 관계 사유를 넣습니다. 비어 있으면 지웁니다.
function withMemo(memos: Record<string, string> | undefined, otherId: string, memo: string): Record<string, string> {
    const next = { ...memos };
    if (memo.trim()) next[otherId] = memo;
    else delete next[otherId];
    return next;
}

// 지운 학생을 다른 학생의 관계와 메모에서도 뺍니다.
function withoutRelationsTo(student: Student, removedId: string): Student {
    const hasAvoid = student.avoid_ids.includes(removedId);
    const hasKeep = student.keep_ids.includes(removedId);
    if (!hasAvoid && !hasKeep) return student;
    const avoid_memos = { ...student.avoid_memos };
    const keep_memos = { ...student.keep_memos };
    delete avoid_memos[removedId];
    delete keep_memos[removedId];
    return {
        ...student,
        avoid_ids: student.avoid_ids.filter((id) => id !== removedId),
        keep_ids: student.keep_ids.filter((id) => id !== removedId),
        avoid_memos,
        keep_memos,
    };
}

type PairKind = 'avoid' | 'keep';
const pairKeys = (kind: PairKind) =>
    kind === 'avoid' ? { ids: 'avoid_ids', memos: 'avoid_memos' } as const : { ids: 'keep_ids', memos: 'keep_memos' } as const;

// 두 학생 사이의 관계 하나를 지웁니다. 양쪽 모두에서 지웁니다.
export function unlinkPair(students: Student[], kind: PairKind, a: string, b: string): Student[] {
    const { ids, memos } = pairKeys(kind);
    return students.map((s) => {
        if (s.id !== a && s.id !== b) return s;
        const other = s.id === a ? b : a;
        if (!s[ids].includes(other) && !(s[memos] && other in s[memos]!)) return s;
        const nextMemos = { ...s[memos] };
        delete nextMemos[other];
        return { ...s, [ids]: s[ids].filter((id) => id !== other), [memos]: nextMemos };
    });
}

// 두 학생 사이에 관계를 넣습니다. 같은 쌍의 반대 관계(분리 ↔ 함께)는 지워서 한쪽만 남깁니다.
export function linkPair(students: Student[], kind: PairKind, a: string, b: string, memo?: string): Student[] {
    const { ids, memos } = pairKeys(kind);
    const cleared = unlinkPair(students, kind === 'avoid' ? 'keep' : 'avoid', a, b);
    return cleared.map((s) => {
        if (s.id !== a && s.id !== b) return s;
        const other = s.id === a ? b : a;
        const updates: Partial<Student> = {};
        if (!s[ids].includes(other)) updates[ids] = [...s[ids], other];
        if (memo !== undefined) updates[memos] = withMemo(s[memos], other, memo);
        return Object.keys(updates).length > 0 ? { ...s, ...updates } : s;
    });
}

export const useClasszleStore = create<ClasszleStore>()(
    persist(
        (set, get) => ({
            // 초기 상태
            workId: 0,
            notices: [],
            setNotices: (notices) => set({ notices }),
            sourceName: null,
            setSourceName: (sourceName) => set({ sourceName }),
            students: [],
            groups: [],
            settings: defaultSettings,
            movementHistory: [],
            undoStack: [],

            // 이동 이력 관련 액션
            addMovements: (changes) => set((state) => ({
                movementHistory: [...state.movementHistory, ...changes]
            })),
            clearMovements: () => set({ movementHistory: [] }),

            // 학생 관련 액션
            // 새 명단을 넣을 때 씁니다. 옛 명단의 되돌리기 기록은 쓸 수 없으므로 비웁니다.
            setStudents: (students) => set((state) => {
                const { assignedAt: _old, ...settings } = state.settings;
                void _old;
                return { students, settings, undoStack: [], notices: [], workId: state.workId + 1 };
            }),

            addStudent: (student) => set((state) => ({
                students: [...state.students, { ...student, id: uuidv4() }]
            })),

            updateStudent: (id, updates) => set((state) => ({
                students: state.students.map((s) =>
                    s.id === id ? { ...s, ...updates } : s
                )
            })),

            deleteStudent: (id) => set((state) => ({
                students: state.students
                    .filter((s) => s.id !== id)
                    .map((s) => withoutRelationsTo(s, id)),
                groups: state.groups.map((g) => ({
                    ...g,
                    member_ids: g.member_ids.filter((mid) => mid !== id)
                }))
            })),

            // 그룹 관련 액션
            setGroups: (groups) => set({ groups }),

            addGroup: (group) => set((state) => ({
                groups: [...state.groups, { ...group, id: uuidv4() }]
            })),

            updateGroup: (id, updates) => set((state) => ({
                groups: state.groups.map((g) =>
                    g.id === id ? { ...g, ...updates } : g
                )
            })),

            deleteGroup: (id) => set((state) => ({
                groups: state.groups.filter((g) => g.id !== id),
                students: state.students.map((s) => ({
                    ...s,
                    group_ids: s.group_ids.filter((gid) => gid !== id)
                }))
            })),

            addStudentToGroup: (studentId, groupId) => set((state) => ({
                students: state.students.map((s) =>
                    s.id === studentId && !s.group_ids.includes(groupId)
                        ? { ...s, group_ids: [...s.group_ids, groupId] }
                        : s
                ),
                groups: state.groups.map((g) =>
                    g.id === groupId && !g.member_ids.includes(studentId)
                        ? { ...g, member_ids: [...g.member_ids, studentId] }
                        : g
                )
            })),

            removeStudentFromGroup: (studentId, groupId) => set((state) => ({
                students: state.students.map((s) =>
                    s.id === studentId
                        ? { ...s, group_ids: s.group_ids.filter((gid) => gid !== groupId) }
                        : s
                ),
                groups: state.groups.map((g) =>
                    g.id === groupId
                        ? { ...g, member_ids: g.member_ids.filter((mid) => mid !== studentId) }
                        : g
                )
            })),

            // 설정 관련 액션
            setClassCount: (count) => set((state) => ({
                settings: { ...state.settings, classCount: count }
            })),

            setScoreTolerance: (tolerance) => set((state) => ({
                settings: { ...state.settings, scoreTolerance: tolerance }
            })),

            setNumberingMethod: (method) => set((state) => ({
                settings: { ...state.settings, numberingMethod: method }
            })),

            setUseAdvancedConstraints: (use) => set((state) => ({
                settings: { ...state.settings, useAdvancedConstraints: use }
            })),

            // 배정 관련 액션
            assignStudentToClass: (studentId, className) => set((state) => {
                const student = state.students.find(s => s.id === studentId);
                if (!student) return state;

                const change: AssignmentChange = {
                    studentId,
                    studentName: student.name,
                    oldClass: student.assigned_class || null,
                    newClass: className,
                    timestamp: Date.now(),
                    type: 'move',
                    source: 'manual'
                };

                return {
                    undoStack: withSnapshot(state),
                    students: state.students.map((s) =>
                        s.id === studentId ? { ...s, assigned_class: className } : s
                    ),
                    movementHistory: [...state.movementHistory, change]
                };
            }),

            resetAssignments: () => set((state) => ({
                undoStack: withSnapshot(state),
                students: state.students.map((s) => ({ ...s, assigned_class: null }))
            })),

            applyAssignment: (students, changes, startHistory) => set((state) => ({
                undoStack: withSnapshot(state),
                students,
                // 신규 배정한 때를 보고서의 편성 날짜로 둡니다.
                ...(startHistory ? { settings: { ...state.settings, assignedAt: Date.now() } } : {}),
                movementHistory: startHistory ? [] : [...state.movementHistory, ...changes]
            })),

            applyGuidance: (students) => set((state) => {
                const before = new Map(state.students.map((s) => [s.id, s]));
                const guidance: NonNullable<UndoSnapshot['guidance']> = {};
                students.forEach((s) => {
                    const old = before.get(s.id);
                    if (old && !sameGuidance(guidanceOf(old), guidanceOf(s))) {
                        guidance[s.id] = { before: guidanceOf(old), applied: guidanceOf(s) };
                    }
                });
                return { undoStack: withSnapshot(state, guidance), students };
            }),

            undoLastChange: () => set((state) => {
                const last = state.undoStack[state.undoStack.length - 1];
                if (!last) return state;
                return {
                    undoStack: state.undoStack.slice(0, -1),
                    movementHistory: last.movementHistory,
                    students: state.students.map((s) => {
                        const change = last.guidance?.[s.id];
                        return {
                            ...s,
                            ...(s.id in last.assignments ? { assigned_class: last.assignments[s.id] } : {}),
                            // 입력표 뒤에 표에서 직접 고친 학생은 교사가 마지막으로 넣은 값을 둡니다.
                            ...(change && sameGuidance(guidanceOf(s), change.applied) ? change.before : {}),
                        };
                    }),
                };
            }),

            // 관계 설정 액션
            // 한 쌍에는 분리 배정과 함께 배정 중 하나만 둡니다. 한쪽을 넣으면 다른 쪽은 지웁니다(2단계에서 먼저 묻습니다).
            addAvoidRelation: (studentId, avoidId, memo) => set((state) => ({
                students: linkPair(state.students, 'avoid', studentId, avoidId, memo),
            })),

            removeAvoidRelation: (studentId, avoidId) => set((state) => ({
                students: unlinkPair(state.students, 'avoid', studentId, avoidId),
            })),

            addKeepRelation: (studentId, keepId, memo) => set((state) => ({
                students: linkPair(state.students, 'keep', studentId, keepId, memo),
            })),

            removeKeepRelation: (studentId, keepId) => set((state) => ({
                students: unlinkPair(state.students, 'keep', studentId, keepId),
            })),

            setFixedClass: (studentId, className, memo) => set((state) => ({
                students: state.students.map((s) =>
                    s.id === studentId ? { ...s, fixed_class: className, fixed_class_memo: memo } : s
                )
            })),

            // 학생 교환 (Manual Swap)
            swapStudents: (studentId1, studentId2) => set((state) => {
                const s1 = state.students.find(s => s.id === studentId1);
                const s2 = state.students.find(s => s.id === studentId2);

                if (!s1 || !s2) return state;

                const class1 = s1.assigned_class || null;
                const class2 = s2.assigned_class || null;

                const swapRecord: AssignmentChange = {
                    studentId: studentId1,
                    studentName: s1.name,
                    oldClass: class1,
                    newClass: class2, // s1은 s2의 반으로 이동
                    timestamp: Date.now(),
                    type: 'swap',
                    source: 'manual',
                    partnerName: s2.name,
                    partnerId: studentId2
                };

                return {
                    undoStack: withSnapshot(state),
                    students: state.students.map(s => {
                        if (s.id === studentId1) return { ...s, assigned_class: class2 };
                        if (s.id === studentId2) return { ...s, assigned_class: class1 };
                        return s;
                    }),
                    movementHistory: [...state.movementHistory, swapRecord]
                };
            }),

            // 초기화
            resetAll: () => set((state) => ({
                workId: state.workId + 1,
                notices: [],
                sourceName: null,
                students: [],
                groups: [],
                settings: defaultSettings,
                movementHistory: [],
                undoStack: []
            })),

            loadProject: (data) => set({
                notices: [],
                sourceName: null,
                students: data.students || [],
                groups: data.groups || [],
                settings: data.settings || defaultSettings,
                // 옛 저장 파일에는 이력이 없습니다. 이전 작업의 이력이 남지 않도록 비웁니다.
                movementHistory: data.movementHistory || [],
                undoStack: []
            })
        }),
        {
            name: 'classzle-storage',
            // 되돌리기 기록은 켜 있는 동안만 씁니다.
            partialize: (state) => ({
                students: state.students,
                groups: state.groups,
                settings: state.settings,
                movementHistory: state.movementHistory,
            }) as unknown as ClasszleStore,
            // 저장소의 값도 파일과 같은 검사를 거칩니다. 나쁜 값이 있어도 앱은 켜지고, 고친 내용을 안내합니다.
            merge: (persisted, current) => {
                const repaired = repairStoredState(persisted);
                if (!repaired) return current;
                return { ...current, ...repaired.data, notices: repaired.notices, undoStack: [] };
            },
            onRehydrateStorage: () => (state, error) => {
                // 스토어가 다 만들어진 다음에 부르도록 미룹니다. 고친 값은 저장소에도 다시 씁니다.
                void Promise.resolve().then(() => {
                    if (error) {
                        useClasszleStore.setState({ notices: ['저장돼 있던 작업을 읽지 못해 빈 작업으로 시작했습니다. 저장한 작업이 있으면 왼쪽 목록에서 불러와 주세요.'] });
                    } else if (state && state.notices.length > 0) {
                        useClasszleStore.setState({});
                    }
                });
            },
        }
    )
);
