import type { CustomGroup, Student } from '@/types';
import { sameClass } from './assignment/problem';
import { guidancePointsOf } from './guidance';

export interface PreviousClassLevels {
    previousClass: string;
    total: number;
    minus3: number;
    minus2: number;
    minus1: number;
    leader: number;
}

/**
 * 전학년도 반별 생활지도 등급 인원입니다. 담임마다 기준이 다를 수 있어 교사가 살펴보는 표입니다.
 * 점수를 자동으로 고치지는 않습니다.
 */
export function calculatePreviousClassLevels(students: Student[]): PreviousClassLevels[] {
    const rows = new Map<string, PreviousClassLevels>();
    students.forEach((s) => {
        const parts = String(s.prev_info ?? '').split('-');
        const previous = parts.length > 1 ? parts[1].trim() : '';
        if (!previous || previous === 'undefined') return;
        const row = rows.get(previous) ?? { previousClass: previous, total: 0, minus3: 0, minus2: 0, minus1: 0, leader: 0 };
        row.total++;
        if (s.behavior_score <= -3) row.minus3++;
        else if (s.behavior_score === -2) row.minus2++;
        else if (s.behavior_score === -1) row.minus1++;
        if (s.behavior_type === 'LEADER') row.leader++;
        rows.set(previous, row);
    });
    return [...rows.values()].sort((a, b) => a.previousClass.localeCompare(b.previousClass, 'ko', { numeric: true }));
}

/**
 * 학급별 통계입니다. 인원과 평균은 전출 전(studentCount, averageScore)과
 * 전출 뒤(stayCount, stayAverageScore)를 모두 줍니다. 배정은 전출 뒤 기준으로 맞춥니다.
 */
export function calculateClassStats(students: Student[], classCountOrNames: number | string[], groups: CustomGroup[] = []) {
    const classNames = typeof classCountOrNames === 'number'
        ? Array.from({ length: classCountOrNames }, (_, i) => `${i + 1}반`)
        : classCountOrNames;

    const exactAverageOf = (list: Student[]) =>
        list.length > 0 ? list.reduce((sum, s) => sum + s.academic_score, 0) / list.length : 0;
    const averageOf = (list: Student[]) => Math.round(exactAverageOf(list));

    return classNames.map((cn) => {
        const cs = students.filter((s) => sameClass(s.assigned_class, cn));
        const preTransfer = cs.filter((s) => s.is_pre_transfer);
        const staying = cs.filter((s) => !s.is_pre_transfer);

        return {
            className: cn,
            studentCount: cs.length,
            stayCount: staying.length,
            // 생활지도가 없는 학생 수 (일반 학생)
            normalCount: cs.filter((s) => s.behavior_score === 0).length,
            maleCount: cs.filter((s) => s.gender === 'M').length,
            femaleCount: cs.filter((s) => s.gender === 'F').length,
            stayMaleCount: staying.filter((s) => s.gender === 'M').length,
            stayFemaleCount: staying.filter((s) => s.gender === 'F').length,
            averageScore: averageOf(cs),
            exactAverageScore: exactAverageOf(cs),
            stayAverageScore: averageOf(staying),
            // 합계는 어려운 학생과 리더의 점수를 모두 더한 값입니다. 앞의 둘은 그 안을 나눠 보여 주는 값입니다.
            minusTotal: cs.reduce((sum, s) => sum + Math.min(guidancePointsOf(s), 0), 0),
            plusTotal: cs.reduce((sum, s) => sum + Math.max(guidancePointsOf(s), 0), 0),
            guidanceTotal: cs.reduce((sum, s) => sum + guidancePointsOf(s), 0),

            // 등급별 인원. 배정은 -3, -2가 몰리지 않게 먼저 맞추고, 그다음 합계를 맞춥니다.
            minus3Count: staying.filter((s) => s.behavior_score <= -3).length,
            minus2Count: staying.filter((s) => s.behavior_score === -2).length,
            minus1Count: staying.filter((s) => s.behavior_score === -1).length,
            leaderCount: staying.filter((s) => s.behavior_type === 'LEADER').length,

            // 화면에서 쓰는 이름입니다. Plus지만 음수 점수를 뜻합니다.
            behaviorPlus3: cs.filter((s) => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -3).length,
            behaviorPlus2: cs.filter((s) => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -2).length,
            behaviorPlus1: cs.filter((s) => s.behavior_type === 'BEHAVIOR' && s.behavior_score === -1).length,

            emotionalPlus3: cs.filter((s) => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -3).length,
            emotionalPlus2: cs.filter((s) => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -2).length,
            emotionalPlus1: cs.filter((s) => s.behavior_type === 'EMOTIONAL' && s.behavior_score === -1).length,

            scorePlus1: cs.filter((s) => s.behavior_type === 'LEADER' && s.behavior_score === 1).length,
            scorePlus2: cs.filter((s) => s.behavior_type === 'LEADER' && s.behavior_score >= 2).length,

            preTransferCount: preTransfer.length,
            preTransferMaleCount: preTransfer.filter((s) => s.gender === 'M').length,
            preTransferFemaleCount: preTransfer.filter((s) => s.gender === 'F').length,

            groupCounts: groups.reduce((acc, g) => {
                acc[g.id] = cs.filter((s) => g.member_ids.includes(s.id)).length;
                return acc;
            }, {} as Record<string, number>),
        };
    });
}
