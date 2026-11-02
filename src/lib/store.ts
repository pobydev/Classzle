import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Student, CustomGroup, AppSettings, AssignmentChange } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface ClasszleStore {
    // 새 명단이나 전체 초기화로 다른 작업이 시작될 때마다 바뀝니다. 저장하지 않습니다.
    workId: number;

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
    // 입력표를 반영하기 전의 생활지도입니다. 번호 방식은 표시 설정이라 기록하지 않습니다.
    guidance?: Record<string, GuidanceValue>;
}

const MAX_UNDO = 30;

function withSnapshot(
    state: { students: Student[]; movementHistory: AssignmentChange[]; undoStack: UndoSnapshot[] },
    keepGuidance = false,
): UndoSnapshot[] {
    const assignments: Record<string, string | null> = {};
    const guidance: Record<string, GuidanceValue> = {};
    state.students.forEach((s) => {
        assignments[s.id] = s.assigned_class ?? null;
        if (keepGuidance) guidance[s.id] = { behavior_type: s.behavior_type, behavior_score: s.behavior_score };
    });
    const snapshot: UndoSnapshot = { assignments, movementHistory: state.movementHistory };
    if (keepGuidance) snapshot.guidance = guidance;
    return [...state.undoStack, snapshot].slice(-MAX_UNDO);
}

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

export const useClasszleStore = create<ClasszleStore>()(
    persist(
        (set, get) => ({
            // 초기 상태
            workId: 0,
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
            setStudents: (students) => set((state) => ({ students, undoStack: [], workId: state.workId + 1 })),

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
                movementHistory: startHistory ? [] : [...state.movementHistory, ...changes]
            })),

            applyGuidance: (students) => set((state) => ({
                undoStack: withSnapshot(state, true),
                students,
            })),

            undoLastChange: () => set((state) => {
                const last = state.undoStack[state.undoStack.length - 1];
                if (!last) return state;
                return {
                    undoStack: state.undoStack.slice(0, -1),
                    movementHistory: last.movementHistory,
                    students: state.students.map((s) => ({
                        ...s,
                        ...(s.id in last.assignments ? { assigned_class: last.assignments[s.id] } : {}),
                        ...last.guidance?.[s.id],
                    })),
                };
            }),

            // 관계 설정 액션
            addAvoidRelation: (studentId, avoidId, memo) => set((state) => ({
                students: state.students.map((s) => {
                    const updates: Partial<Student> = {};
                    if (s.id === studentId) {
                        if (!s.avoid_ids.includes(avoidId)) {
                            updates.avoid_ids = [...s.avoid_ids, avoidId];
                        }
                        if (memo !== undefined) updates.avoid_memos = withMemo(s.avoid_memos, avoidId, memo);
                    }
                    if (s.id === avoidId) {
                        if (!s.avoid_ids.includes(studentId)) {
                            updates.avoid_ids = [...s.avoid_ids, studentId];
                        }
                        // 반대편에도 메모 저장 (선택 사항이나 대칭성 위해)
                        if (memo !== undefined) updates.avoid_memos = withMemo(s.avoid_memos, studentId, memo);
                    }
                    if (Object.keys(updates).length > 0) {
                        return { ...s, ...updates };
                    }
                    return s;
                })
            })),

            removeAvoidRelation: (studentId, avoidId) => set((state) => ({
                students: state.students.map((s) => {
                    if (s.id === studentId) {
                        const newMemos = { ...s.avoid_memos };
                        delete newMemos[avoidId];
                        return {
                            ...s,
                            avoid_ids: s.avoid_ids.filter((id) => id !== avoidId),
                            avoid_memos: newMemos
                        };
                    }
                    if (s.id === avoidId) {
                        const newMemos = { ...s.avoid_memos };
                        delete newMemos[studentId];
                        return {
                            ...s,
                            avoid_ids: s.avoid_ids.filter((id) => id !== studentId),
                            avoid_memos: newMemos
                        };
                    }
                    return s;
                })
            })),

            addKeepRelation: (studentId, keepId, memo) => set((state) => ({
                students: state.students.map((s) => {
                    const updates: Partial<Student> = {};
                    if (s.id === studentId) {
                        if (!s.keep_ids.includes(keepId)) {
                            updates.keep_ids = [...s.keep_ids, keepId];
                        }
                        if (memo !== undefined) updates.keep_memos = withMemo(s.keep_memos, keepId, memo);
                    }
                    if (s.id === keepId) {
                        if (!s.keep_ids.includes(studentId)) {
                            updates.keep_ids = [...s.keep_ids, studentId];
                        }
                        if (memo !== undefined) updates.keep_memos = withMemo(s.keep_memos, studentId, memo);
                    }
                    if (Object.keys(updates).length > 0) {
                        return { ...s, ...updates };
                    }
                    return s;
                })
            })),

            removeKeepRelation: (studentId, keepId) => set((state) => ({
                students: state.students.map((s) => {
                    if (s.id === studentId) {
                        const newMemos = { ...s.keep_memos };
                        delete newMemos[keepId];
                        return {
                            ...s,
                            keep_ids: s.keep_ids.filter((id) => id !== keepId),
                            keep_memos: newMemos
                        };
                    }
                    if (s.id === keepId) {
                        const newMemos = { ...s.keep_memos };
                        delete newMemos[studentId];
                        return {
                            ...s,
                            keep_ids: s.keep_ids.filter((id) => id !== studentId),
                            keep_memos: newMemos
                        };
                    }
                    return s;
                })
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
                students: [],
                groups: [],
                settings: defaultSettings,
                movementHistory: [],
                undoStack: []
            })),

            loadProject: (data) => set({
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
        }
    )
);
