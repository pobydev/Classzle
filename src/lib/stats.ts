import type { CustomGroup, Student } from '@/types';

/**
 * 학급별 통계입니다. 인원과 평균은 전출 전(studentCount, averageScore)과
 * 전출 뒤(stayCount, stayAverageScore)를 모두 줍니다. 배정은 전출 뒤 기준으로 맞춥니다.
 */
export function calculateClassStats(students: Student[], classCountOrNames: number | string[], groups: CustomGroup[] = []) {
    const classNames = typeof classCountOrNames === 'number'
        ? Array.from({ length: classCountOrNames }, (_, i) => `${i + 1}반`)
        : classCountOrNames;

    const averageOf = (list: Student[]) =>
        list.length > 0 ? Math.round(list.reduce((sum, s) => sum + s.academic_score, 0) / list.length) : 0;

    return classNames.map((cn) => {
        const cs = students.filter((s) => s.assigned_class === cn);
        const preTransfer = cs.filter((s) => s.is_pre_transfer);
        const staying = cs.filter((s) => !s.is_pre_transfer);

        return {
            className: cn,
            studentCount: cs.length,
            stayCount: staying.length,
            // 생활지도 점수가 0인 학생 수 (일반 학생)
            normalCount: cs.filter((s) => s.behavior_score === 0).length,
            maleCount: cs.filter((s) => s.gender === 'M').length,
            femaleCount: cs.filter((s) => s.gender === 'F').length,
            stayMaleCount: staying.filter((s) => s.gender === 'M').length,
            stayFemaleCount: staying.filter((s) => s.gender === 'F').length,
            averageScore: averageOf(cs),
            stayAverageScore: averageOf(staying),
            behaviorTotal: cs.reduce((sum, s) => sum + s.behavior_score, 0),

            // 등급별 인원. 배정은 합계가 아니라 이 인원을 맞춥니다.
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
