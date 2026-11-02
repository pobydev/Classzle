import type { CustomGroup, Student } from '@/types';

/** 학생을 지울 때 함께 사라지는 것을 문구로 줍니다. 없으면 빈 목록입니다. */
export function removalConsequences(student: Student, students: Student[], groups: CustomGroup[]): string[] {
    // 관계는 한쪽에만 적혀 있어도 양쪽 관계로 봅니다.
    const related = (idsOf: (s: Student) => string[] | undefined) =>
        new Set(
            students
                .filter((other) => other.id !== student.id)
                .filter((other) => idsOf(student)?.includes(other.id) || idsOf(other)?.includes(student.id))
                .map((other) => other.id),
        ).size;

    const consequences: string[] = [];
    const avoid = related((s) => s.avoid_ids);
    const keep = related((s) => s.keep_ids);
    if (avoid > 0) consequences.push(`분리 배정 ${avoid}건`);
    if (keep > 0) consequences.push(`함께 배정 ${keep}건`);
    const memberOf = groups.filter((g) => g.member_ids.includes(student.id) || student.group_ids.includes(g.id));
    if (memberOf.length > 0) consequences.push(`그룹 소속(${memberOf.map((g) => g.name).join(', ')})`);
    if (student.fixed_class) consequences.push(`고정 배정(${student.fixed_class})`);
    if (student.is_pre_transfer) consequences.push('전출 예정 표시');
    if (student.assigned_class) consequences.push(`배정된 반(${student.assigned_class})`);
    return consequences;
}
