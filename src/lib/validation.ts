import type { CustomGroup, Student, Violation } from '@/types';
import { collectViolations, resolveClassIndex, makeClassNames } from './assignment';
import { sameClass } from './assignment/problem';
import { calculateBalanceTable, crowdedClasses } from './balanceTable';

function inferClassCount(students: Student[]): number {
    const numbers = students
        .map((s) => parseInt(String(s.assigned_class ?? '').replace(/[^0-9]/g, ''), 10))
        .filter((value) => Number.isFinite(value));
    return numbers.length ? Math.max(...numbers) : 0;
}

/**
 * 반을 바꾸면 새로 생기거나 더 나빠지는 어김만 돌려줍니다.
 */
export function validateChange(
    changes: Record<string, string | null>,
    students: Student[],
    classCount?: number,
    groups: CustomGroup[] = [],
): Violation[] {
    const count = classCount ?? inferClassCount(students);
    const before = new Map(collectViolations(students, count, groups).map((v) => [v.key, v]));
    const applied = students.map((s) => (s.id in changes ? { ...s, assigned_class: changes[s.id] } : s));
    return collectViolations(applied, count, groups).filter((v) => {
        const previous = before.get(v.key);
        return !previous || (v.amount ?? 0) > (previous.amount ?? 0);
    });
}

/**
 * 두 학생의 반을 바꿨을 때 발생하는 조건 위반을 검토합니다.
 */
export function validateSwap(
    studentId1: string,
    studentId2: string,
    allStudents: Student[],
    classCount?: number,
    groups: CustomGroup[] = [],
): Violation[] {
    const s1 = allStudents.find((s) => s.id === studentId1);
    const s2 = allStudents.find((s) => s.id === studentId2);
    if (!s1 || !s2 || sameClass(s1.assigned_class, s2.assigned_class)) return [];
    return validateChange(
        { [s1.id]: s2.assigned_class ?? null, [s2.id]: s1.assigned_class ?? null },
        allStudents,
        classCount,
        groups,
    );
}

/**
 * 학생 한 명을 다른 반으로 옮겼을 때 발생하는 조건 위반을 검토합니다.
 */
export function validateMove(
    studentId: string,
    className: string,
    allStudents: Student[],
    classCount?: number,
    groups: CustomGroup[] = [],
): Violation[] {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student || sameClass(student.assigned_class, className)) return [];
    const count = classCount ?? Math.max(inferClassCount(allStudents), resolveClassIndex(className, makeClassNames(99)) + 1);
    return validateChange({ [studentId]: className }, allStudents, count, groups);
}

/**
 * 반 이름을 눌러 학생을 옮길 때 새로 생기는 생활지도 몰림입니다. 통계표의 '!'와 같은 기준입니다.
 * 꼭 지킬 조건은 아니지만 경고 창에 함께 보여 줍니다. 예: '4반에 행동 -3이 몰립니다 (2명).'
 */
export function moveCrowdingWarnings(
    studentId: string,
    className: string,
    students: Student[],
    classCount: number,
    groups: CustomGroup[] = [],
): Violation[] {
    const student = students.find((s) => s.id === studentId);
    if (!student || sameClass(student.assigned_class, className)) return [];
    const itemsOf = (list: Student[]) =>
        new Set((crowdedClasses(calculateBalanceTable(list, classCount, groups)).find((c) => sameClass(c.className, className))?.items ?? [])
            .filter((item) => /^(행동|정서) -[23] /.test(item)));
    const before = itemsOf(students);
    const after = itemsOf(students.map((s) => (s.id === studentId ? { ...s, assigned_class: className } : s)));
    return [...after]
        .filter((item) => !before.has(item))
        .map((item) => {
            const [label, count] = [item.replace(/ \d+명$/, ''), item.match(/(\d+)명$/)?.[1]];
            return {
                type: 'BEHAVIOR_IMBALANCE' as const,
                key: `CROWD|${className}|${label}`,
                message: `${className}에 ${label}${label.endsWith('3') ? '이' : '가'} 몰립니다 (${count}명).`,
                studentIds: [studentId],
                className,
            };
        });
}
