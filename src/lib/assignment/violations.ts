import type { CustomGroup, Student, Violation } from '@/types';
import { isStaying, makeClassNames, resolveClassIndex, sameClass } from './problem';

/**
 * 지금 배정이 어긴 조건을 지키는 순서대로 모두 찾습니다.
 * 이 목록이 비어 있어야 '조건을 모두 지켰다'고 말할 수 있습니다.
 */
export function collectViolations(
    students: Student[],
    classCount: number,
    groups: CustomGroup[] = [],
): Violation[] {
    const classNames = makeClassNames(classCount);
    const byId = new Map(students.map((s) => [s.id, s]));
    const violations: Violation[] = [];

    const unassigned = students.filter((s) => resolveClassIndex(s.assigned_class, classNames) < 0);
    if (unassigned.length > 0) {
        violations.push({
            type: 'UNASSIGNED',
            key: 'UNASSIGNED',
            amount: unassigned.length,
            message: `반이 정해지지 않은 학생이 ${unassigned.length}명 있습니다.`,
            studentIds: unassigned.map((s) => s.id),
        });
    }

    for (const s of students) {
        if (!s.fixed_class) continue;
        const target = resolveClassIndex(s.fixed_class, classNames);
        if (target < 0) {
            violations.push({
                type: 'FIXED_CLASS',
                key: `FIXED|${s.id}`,
                message: `${s.name} 학생의 고정 배정(${s.fixed_class})이 학급 수를 벗어났습니다.`,
                studentIds: [s.id],
            });
        } else if (resolveClassIndex(s.assigned_class, classNames) !== target) {
            violations.push({
                type: 'FIXED_CLASS',
                key: `FIXED|${s.id}`,
                message: `${s.name} 학생은 ${classNames[target]} 고정인데 ${s.assigned_class || '미배정'} 상태입니다.`,
                studentIds: [s.id],
                className: s.assigned_class || undefined,
            });
        }
    }

    const seen = new Set<string>();
    const eachPair = (idsOf: (s: Student) => string[] | undefined, kind: string, visit: (a: Student, b: Student, key: string) => void) => {
        for (const a of students) {
            for (const id of idsOf(a) ?? []) {
                const b = byId.get(id);
                if (!b || b.id === a.id) continue;
                const key = [kind, ...[a.id, b.id].sort()].join('|');
                if (seen.has(key)) continue;
                seen.add(key);
                visit(a, b, key);
            }
        }
    };

    eachPair((s) => s.avoid_ids, 'AVOID', (a, b, key) => {
        if (sameClass(a.assigned_class, b.assigned_class)) {
            violations.push({
                type: 'AVOID',
                key,
                message: `${a.name} 학생과 ${b.name} 학생은 분리 배정인데 같은 반(${a.assigned_class})입니다.`,
                studentIds: [a.id, b.id],
                className: a.assigned_class,
            });
        }
    });

    eachPair((s) => s.keep_ids, 'KEEP', (a, b, key) => {
        if (a.assigned_class && b.assigned_class && !sameClass(a.assigned_class, b.assigned_class)) {
            violations.push({
                type: 'KEEP',
                key,
                message: `${a.name} 학생과 ${b.name} 학생은 함께 배정인데 ${a.assigned_class}과 ${b.assigned_class}으로 나뉘었습니다.`,
                studentIds: [a.id, b.id],
            });
        }
    });

    // 인원과 그룹은 반별 차이 1명까지 인정합니다. 전출 뒤 기준으로 셉니다.
    const staying = students.filter(isStaying);
    const describeSpread = (filter: (s: Student) => boolean) => {
        const counts = classNames.map((cn) => staying.filter((s) => sameClass(s.assigned_class, cn) && filter(s)).length);
        const max = Math.max(...counts);
        const min = Math.min(...counts);
        if (max - min <= 1) return null;
        return {
            amount: max - min,
            text: `${classNames[counts.indexOf(max)]} ${max}명, ${classNames[counts.indexOf(min)]} ${min}명으로 ${max - min}명 차이입니다.`,
        };
    };

    for (const group of groups) {
        const members = new Set(group.member_ids);
        const spread = describeSpread((s) => members.has(s.id));
        if (spread) {
            violations.push({
                type: 'GROUP_IMBALANCE',
                key: `GROUP|${group.id}`,
                amount: spread.amount,
                message: `'${group.name}' 그룹 분산: ${spread.text}`,
                studentIds: [...members],
            });
        }
    }

    const countSpread = describeSpread(() => true);
    if (countSpread) {
        violations.push({ type: 'COUNT_IMBALANCE', key: 'COUNT', amount: countSpread.amount, message: `전출 뒤 인원이 ${countSpread.text}`, studentIds: [] });
    }
    const maleSpread = describeSpread((s) => s.gender === 'M');
    if (maleSpread) {
        violations.push({ type: 'GENDER_IMBALANCE', key: 'GENDER|M', amount: maleSpread.amount, message: `전출 뒤 남학생이 ${maleSpread.text}`, studentIds: [] });
    }
    const femaleSpread = describeSpread((s) => s.gender === 'F');
    if (femaleSpread) {
        violations.push({ type: 'GENDER_IMBALANCE', key: 'GENDER|F', amount: femaleSpread.amount, message: `전출 뒤 여학생이 ${femaleSpread.text}`, studentIds: [] });
    }

    return violations;
}
