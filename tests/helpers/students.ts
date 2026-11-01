import type { Student } from '@/types';

// 시험에는 지어낸 학생만 씁니다.
export function makeStudent(overrides: Partial<Student> & { id: string }): Student {
    return {
        name: `가상${overrides.id}`,
        prev_info: '1-1-1',
        gender: 'M',
        academic_score: 500,
        behavior_score: 0,
        behavior_type: 'NONE',
        group_ids: [],
        avoid_ids: [],
        keep_ids: [],
        assigned_class: null,
        ...overrides,
    };
}
