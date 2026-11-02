import type { CustomGroup, Student } from '@/types';
import { compileProblem, resolveClassIndex, type Weights } from './assignment/problem';

export interface SwapRecommendation {
    studentId: string;
    // 음수일수록 균형이 좋아지는 교환입니다.
    balanceChange: number;
    scoreDifference: number;
    // 바꾼 뒤 두 반의 전출 뒤 성적 평균 차이가 얼마나 달라지는지입니다. 음수면 차이가 줄어듭니다.
    scoreGapChange: number;
}

// 이보다 작은 변화는 교사가 평균을 볼 때 달라 보이지 않습니다.
const NEGLIGIBLE_GAP_CHANGE = 0.5;

export function describeScoreGapChange(change: number): string {
    if (Math.abs(change) < NEGLIGIBLE_GAP_CHANGE) return '성적 평균 차이 거의 그대로';
    return `성적 평균 차이 ${Math.abs(change).toFixed(1)} ${change < 0 ? '줄어듦' : '늘어남'}`;
}

const WEIGHTS: Weights = {
    avoid: 6000,
    keep: 3000,
    group: 1200,
    count: 600,
    gender: 300,
    transfer: 60,
    level3: 65,
    level2: 55,
    level1: 2,
    typeLevel3: 65,
    typeLevel2: 55,
    typeLevel1: 1,
    leader: 14,
    leaderStrong: 6,
    type: 2,
    band: 10,
    score: 0.5,
    difficulty: 6,
    previous: 1.5,
    moved: 0,
};

/**
 * 고른 학생과 바꿔도 조건을 새로 어기지 않는 상대를 균형이 좋아지는 순서로 찾습니다.
 * 고정 반, 떼어 놓기, 함께 두기, 그룹, 인원, 남녀, 전출 예정을 모두 검사합니다.
 */
export function recommendSwaps(
    studentId: string,
    students: Student[],
    classCount: number,
    groups: CustomGroup[] = [],
    limit = 10,
): SwapRecommendation[] {
    const self = students.findIndex((s) => s.id === studentId);
    if (self < 0) return [];

    const problem = compileProblem(students, classCount, groups, WEIGHTS);
    const { c, classNames, fixedTo, stay, score, meanScore, scoreWeight, difficultyPoints, meanDifficulty, dims, dimsOf, avoidAdj, keepAdj } = problem;
    const classOf = students.map((s) => resolveClassIndex(s.assigned_class, classNames));
    const home = classOf[self];
    if (home < 0) return [];

    const counts = new Int32Array(dims.length * c);
    const stayCount = new Int32Array(c);
    const stayScore = new Float64Array(c);
    const difficultySum = new Int32Array(c);
    classOf.forEach((cl, i) => {
        if (cl < 0) return;
        const ds = dimsOf[i];
        for (let k = 0; k < ds.length; k++) counts[ds[k] * c + cl]++;
        if (stay[i]) {
            stayCount[cl]++;
            stayScore[cl] += score[i];
            difficultySum[cl] += difficultyPoints[i];
        }
    });

    const penalty = (value: number, d: number) => {
        const dim = dims[d];
        if (value < dim.lo) return dim.lo - value;
        if (value > dim.hi) return value - dim.hi;
        return 0;
    };
    const scoreTerm = (sum: number, count: number) =>
        count > 0 ? Math.abs(sum / count - meanScore) * scoreWeight : 0;
    const difficultyTerm = (sum: number) => Math.abs(sum - meanDifficulty) * WEIGHTS.difficulty;
    // 전출 뒤 학생이 없는 반은 평균이 없으므로 차이를 말할 수 없습니다.
    const averageGap = (sumA: number, countA: number, sumB: number, countB: number) =>
        countA > 0 && countB > 0 ? Math.abs(sumA / countA - sumB / countB) : null;

    const pairsDelta = (i: number, from: number, to: number, partner: number) => {
        let delta = 0;
        for (const other of avoidAdj[i]) {
            if (other === partner) continue;
            if (classOf[other] === from) delta -= WEIGHTS.avoid;
            else if (classOf[other] === to) delta += WEIGHTS.avoid;
        }
        for (const other of keepAdj[i]) {
            if (other === partner) continue;
            if (classOf[other] === from) delta += WEIGHTS.keep;
            else if (classOf[other] === to) delta -= WEIGHTS.keep;
        }
        return delta;
    };

    const results: SwapRecommendation[] = [];
    students.forEach((candidate, j) => {
        if (j === self) return;
        const other = classOf[j];
        if (other < 0 || other === home) return;

        // 고정 반을 새로 어기는 교환은 뺍니다.
        if (fixedTo[self] >= 0 && fixedTo[self] !== other) return;
        if (fixedTo[j] >= 0 && fixedTo[j] !== home) return;

        // 항목별 인원 변화를 임시 표에 모읍니다. 둘이 같은 항목에 있으면 서로 상쇄됩니다.
        let hard = pairsDelta(self, home, other, j) + pairsDelta(j, other, home, self);
        let soft = 0;
        const change = new Map<number, number>();
        for (let k = 0; k < dimsOf[self].length; k++) {
            const d = dimsOf[self][k];
            change.set(d, (change.get(d) ?? 0) + 1);
        }
        for (let k = 0; k < dimsOf[j].length; k++) {
            const d = dimsOf[j][k];
            change.set(d, (change.get(d) ?? 0) - 1);
        }
        change.forEach((amount, d) => {
            if (amount === 0) return;
            const base = d * c;
            const va = counts[base + home];
            const vb = counts[base + other];
            const delta = dims[d].weight * (penalty(va - amount, d) - penalty(va, d) + penalty(vb + amount, d) - penalty(vb, d));
            if (dims[d].hard) hard += delta;
            else soft += delta;
        });
        // 조건을 새로 어기면 추천하지 않습니다.
        if (hard > 0) return;

        const beforeScore = scoreTerm(stayScore[home], stayCount[home]) + scoreTerm(stayScore[other], stayCount[other]);
        const homeCount = stayCount[home] - stay[self] + stay[j];
        const otherCount = stayCount[other] - stay[j] + stay[self];
        const homeSum = stayScore[home] - stay[self] * score[self] + stay[j] * score[j];
        const otherSum = stayScore[other] - stay[j] * score[j] + stay[self] * score[self];
        soft += scoreTerm(homeSum, homeCount) + scoreTerm(otherSum, otherCount) - beforeScore;

        // 배정과 같은 잣대가 되도록 어려움 합계 변화도 더합니다.
        const pointsIn = difficultyPoints[j] - difficultyPoints[self];
        soft += difficultyTerm(difficultySum[home] + pointsIn) + difficultyTerm(difficultySum[other] - pointsIn)
            - difficultyTerm(difficultySum[home]) - difficultyTerm(difficultySum[other]);

        const gapBefore = averageGap(stayScore[home], stayCount[home], stayScore[other], stayCount[other]);
        const gapAfter = averageGap(homeSum, homeCount, otherSum, otherCount);

        results.push({
            studentId: candidate.id,
            balanceChange: hard + soft,
            scoreDifference: Math.abs(score[self] - score[j]),
            scoreGapChange: gapBefore === null || gapAfter === null ? 0 : gapAfter - gapBefore,
        });
    });

    results.sort((a, b) => a.balanceChange - b.balanceChange || a.scoreDifference - b.scoreDifference);
    return results.slice(0, limit);
}
