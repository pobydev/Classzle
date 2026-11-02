import type { CustomGroup, Student, Violation } from '@/types';
import { isStaying } from './assignment/problem';
import { calculateClassStats } from './stats';
import { validateSwap } from './validation';

// 비교 화면에 보여 주는 값입니다. 모두 전출 뒤 기준입니다.
export interface ClassFigures {
    count: number;
    male: number;
    female: number;
    average: number;
    minus3: number;
    minus2: number;
    leader: number;
    // 리더를 포함한 생활지도 점수 합입니다. 참고 값입니다.
    guidanceTotal: number;
}

export interface SwapPreviewClass {
    className: string;
    before: ClassFigures;
    after: ClassFigures;
}

export interface SwapPreview {
    classes: [SwapPreviewClass, SwapPreviewClass];
    // 이 교환으로 새로 어기거나 더 나빠지는 조건입니다.
    violations: Violation[];
}

function figuresOf(stat: ReturnType<typeof calculateClassStats>[number]): ClassFigures {
    return {
        count: stat.studentCount,
        male: stat.maleCount,
        female: stat.femaleCount,
        average: stat.averageScore,
        minus3: stat.minus3Count,
        minus2: stat.minus2Count,
        leader: stat.leaderCount,
        guidanceTotal: stat.behaviorTotal,
    };
}

/**
 * 두 학생을 바꾸면 두 반이 어떻게 달라지는지 계산합니다. 실제 배정은 건드리지 않습니다.
 * 통계와 조건 검사는 화면의 다른 곳과 같은 코드를 씁니다.
 * 같은 반이거나 미배정 학생이 끼어 있으면 null입니다.
 */
export function previewSwap(
    studentId: string,
    partnerId: string,
    students: Student[],
    classCount: number,
    groups: CustomGroup[] = [],
): SwapPreview | null {
    const student = students.find((s) => s.id === studentId);
    const partner = students.find((s) => s.id === partnerId);
    const classA = student?.assigned_class;
    const classB = partner?.assigned_class;
    if (!classA || !classB || classA === classB) return null;

    const swapped = students.map((s) => {
        if (s.id === studentId) return { ...s, assigned_class: classB };
        if (s.id === partnerId) return { ...s, assigned_class: classA };
        return s;
    });
    const names = [classA, classB];
    // 전출 예정 학생을 뺀 명단으로 돌려 모든 값을 전출 뒤 기준으로 만듭니다.
    const before = calculateClassStats(students.filter(isStaying), names, groups);
    const after = calculateClassStats(swapped.filter(isStaying), names, groups);

    return {
        classes: [
            { className: classA, before: figuresOf(before[0]), after: figuresOf(after[0]) },
            { className: classB, before: figuresOf(before[1]), after: figuresOf(after[1]) },
        ],
        violations: validateSwap(studentId, partnerId, students, classCount, groups),
    };
}
