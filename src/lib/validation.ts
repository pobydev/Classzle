import { Student, Violation } from '@/types';

/**
 * 두 학생의 반을 바꿨을 때 발생하는 제약 조건 위반 사항을 검토합니다.
 */
export function validateSwap(
    studentId1: string,
    studentId2: string,
    allStudents: Student[]
): Violation[] {
    const s1 = allStudents.find(s => s.id === studentId1);
    const s2 = allStudents.find(s => s.id === studentId2);

    if (!s1 || !s2) return [];

    const violations: Violation[] = [];

    // 교환 후의 가상 상태 시뮬레이션
    const class1 = s1.assigned_class;
    const class2 = s2.assigned_class;

    // 만약 같은 반이라면 검사할 필요 없음 (이동이 아니므로)
    if (class1 === class2) return [];

    // 1. 고정 배정 위반 검사
    if (s1.fixed_class && s1.fixed_class !== class2) {
        violations.push({
            type: 'FIXED_CLASS',
            message: `${s1.name} 학생은 ${s1.fixed_class}에 고정되어야 합니다.`,
            studentIds: [s1.id],
            className: class2 || undefined
        });
    }
    if (s2.fixed_class && s2.fixed_class !== class1) {
        violations.push({
            type: 'FIXED_CLASS',
            message: `${s2.name} 학생은 ${s2.fixed_class}에 고정되어야 합니다.`,
            studentIds: [s2.id],
            className: class1 || undefined
        });
    }

    // 2. 피해야 할 관계 (AVOID) 위반 검사
    // s1이 class2로 갔을 때, class2에 있는 학생들 중 s1이 피해야 할 학생이 있는지 확인
    const s1AvoidInClass2 = allStudents.filter(s =>
        s.assigned_class === class2 &&
        s.id !== studentId2 && // s2는 나갈 거니까 제외
        (s1.avoid_ids.includes(s.id) || s.avoid_ids.includes(studentId1))
    );
    s1AvoidInClass2.forEach(target => {
        violations.push({
            type: 'AVOID',
            message: `${s1.name} 학생과 ${target.name} 학생은 피해야 할 관계입니다.`,
            studentIds: [s1.id, target.id],
            className: class2 || undefined
        });
    });

    // s2가 class1로 갔을 때
    const s2AvoidInClass1 = allStudents.filter(s =>
        s.assigned_class === class1 &&
        s.id !== studentId1 &&
        (s2.avoid_ids.includes(s.id) || s.avoid_ids.includes(studentId2))
    );
    s2AvoidInClass1.forEach(target => {
        violations.push({
            type: 'AVOID',
            message: `${s2.name} 학생과 ${target.name} 학생은 피해야 할 관계입니다.`,
            studentIds: [s2.id, target.id],
            className: class1 || undefined
        });
    });

    // 3. 같은 반 희망 (KEEP) 위반 검사 (분리되는 경우)
    // s1의 파트너가 class1에 있는데 s1만 class2로 가는 경우
    const s1KeepInClass1 = allStudents.filter(s =>
        s.assigned_class === class1 &&
        s.id !== studentId1 &&
        s1.keep_ids.includes(s.id)
    );
    s1KeepInClass1.forEach(target => {
        violations.push({
            type: 'KEEP',
            message: `${s1.name} 학생과 ${target.name} 학생은 같은 반 희망 관계이나 분리됩니다.`,
            studentIds: [s1.id, target.id]
        });
    });

    // s2의 파트너가 class2에 있는데 s2만 class1로 가는 경우
    const s2KeepInClass2 = allStudents.filter(s =>
        s.assigned_class === class2 &&
        s.id !== studentId2 &&
        s2.keep_ids.includes(s.id)
    );
    s2KeepInClass2.forEach(target => {
        violations.push({
            type: 'KEEP',
            message: `${s2.name} 학생과 ${target.name} 학생은 같은 반 희망 관계이나 분리됩니다.`,
            studentIds: [s2.id, target.id]
        });
    });

    return violations;
}
