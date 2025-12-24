import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Student, CustomGroup, AppSettings, AssignmentChange } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface ClasszleStore {
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

    // 배정 관련 액션
    assignStudentToClass: (studentId: string, className: string | null) => void;
    resetAssignments: () => void;

    // 관계 설정 액션
    addAvoidRelation: (studentId: string, avoidId: string, memo?: string) => void;
    removeAvoidRelation: (studentId: string, avoidId: string) => void;
    addKeepRelation: (studentId: string, keepId: string, memo?: string) => void;
    removeKeepRelation: (studentId: string, keepId: string) => void;
    setFixedClass: (studentId: string, className: string | undefined, memo?: string) => void;
    swapStudents: (studentId1: string, studentId2: string) => void;

    // 초기화
    resetAll: () => void;
    loadProject: (data: { students: Student[]; groups: CustomGroup[]; settings: AppSettings }) => void;

    // 이동 이력
    movementHistory: AssignmentChange[];
    addMovements: (changes: AssignmentChange[]) => void;
    clearMovements: () => void;
}

const defaultSettings: AppSettings = {
    classCount: 4,
    scoreTolerance: 50,
    numberingMethod: 'mixed',
};

export const useClasszleStore = create<ClasszleStore>()(
    persist(
        (set, get) => ({
            // 초기 상태
            students: [],
            groups: [],
            settings: defaultSettings,
            movementHistory: [],

            // 이동 이력 관련 액션
            addMovements: (changes) => set((state) => ({
                movementHistory: [...state.movementHistory, ...changes]
            })),
            clearMovements: () => set({ movementHistory: [] }),

            // 학생 관련 액션
            setStudents: (students) => set({ students }),

            addStudent: (student) => set((state) => ({
                students: [...state.students, { ...student, id: uuidv4() }]
            })),

            updateStudent: (id, updates) => set((state) => ({
                students: state.students.map((s) =>
                    s.id === id ? { ...s, ...updates } : s
                )
            })),

            deleteStudent: (id) => set((state) => ({
                students: state.students.filter((s) => s.id !== id),
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
                    students: state.students.map((s) =>
                        s.id === studentId ? { ...s, assigned_class: className } : s
                    ),
                    movementHistory: [...state.movementHistory, change]
                };
            }),

            resetAssignments: () => set((state) => ({
                students: state.students.map((s) => ({ ...s, assigned_class: null }))
            })),

            // 관계 설정 액션
            addAvoidRelation: (studentId, avoidId, memo) => set((state) => ({
                students: state.students.map((s) => {
                    const updates: Partial<Student> = {};
                    if (s.id === studentId) {
                        if (!s.avoid_ids.includes(avoidId)) {
                            updates.avoid_ids = [...s.avoid_ids, avoidId];
                        }
                        if (memo) {
                            updates.avoid_memos = { ...(s.avoid_memos || {}), [avoidId]: memo };
                        }
                    }
                    if (s.id === avoidId) {
                        if (!s.avoid_ids.includes(studentId)) {
                            updates.avoid_ids = [...s.avoid_ids, studentId];
                        }
                        if (memo) {
                            // 반대편에도 메모 저장 (선택 사항이나 대칭성 위해)
                            updates.avoid_memos = { ...(s.avoid_memos || {}), [studentId]: memo };
                        }
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
                        if (memo) {
                            updates.keep_memos = { ...(s.keep_memos || {}), [keepId]: memo };
                        }
                    }
                    if (s.id === keepId) {
                        if (!s.keep_ids.includes(studentId)) {
                            updates.keep_ids = [...s.keep_ids, studentId];
                        }
                        if (memo) {
                            updates.keep_memos = { ...(s.keep_memos || {}), [studentId]: memo };
                        }
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
                    students: state.students.map(s => {
                        if (s.id === studentId1) return { ...s, assigned_class: class2 };
                        if (s.id === studentId2) return { ...s, assigned_class: class1 };
                        return s;
                    }),
                    movementHistory: [...state.movementHistory, swapRecord]
                };
            }),

            // 초기화
            resetAll: () => set({
                students: [],
                groups: [],
                settings: defaultSettings,
                movementHistory: []
            }),

            loadProject: (data) => set({
                students: data.students || [],
                groups: data.groups || [],
                settings: data.settings || defaultSettings
            })
        }),
        {
            name: 'classzle-storage',
        }
    )
);
