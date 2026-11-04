import type { CustomGroup, Student } from '@/types';
import { FULL_WEIGHTS } from './assignment';
import { compileProblem, resolveClassIndex } from './assignment/problem';

// '생활지도까지'에서 닮은 성적의 기준입니다. 두 가지를 모두 지켜야 닮은 학생입니다.
// 1. 같은 성별 안 성적 순위(백분위) 차이가 이 값(%p) 이하입니다. 학교마다 점수 단위가 달라 순위로 봅니다.
export const MAX_RANK_GAP = 15;
// 2. 점수 차이가 같은 성별 성적 범위(최고 - 최저)의 이 비율(%) 이하입니다.
//    점수가 드문드문한 끝자리에서는 순위가 가까워도 점수가 크게 벌어지므로 점수로도 막습니다.
export const MAX_SCORE_GAP_PERCENT = 10;
// 생활지도가 한 칸 다르면 순위 차이 이만큼(%p)으로 칩니다. 두 칸 이상 다르면 추천하지 않습니다.
export const GUIDANCE_STEP_COST = 5;

export interface GuidanceChange {
    from: string;
    to: string;
    // 1은 한 칸, 2는 두 칸 이상입니다. 두 칸 이상은 전출 예정 학생끼리만 나옵니다.
    steps: 1 | 2;
}

// 추천 방식입니다. 'guidance'(생활지도까지)는 성적과 생활지도가 닮은 학생만, 'score'(성적만)는 성적이 가까운 학생을 찾습니다.
export type RecommendMode = 'guidance' | 'score';

export interface SwapRecommendation {
    studentId: string;
    // 추천 순서 값입니다. 생활지도 칸 수 x GUIDANCE_STEP_COST + 성적 순위 차이(%p). 작을수록 닮은 학생입니다.
    order: number;
    // 같은 성별 안 성적 순위(백분위) 차이입니다. 화면에는 쓰지 않습니다.
    rankDifference: number;
    // 생활지도 차이. 0칸이면 null, 한 칸이면 고른 학생 → 상대 표시입니다.
    guidanceChange: GuidanceChange | null;
    // 고른 학생과 상대의 성적 차이(점수, 절댓값)입니다. 순서 값이 같을 때 먼저 봅니다.
    scoreDifference: number;
    // 음수일수록 균형이 좋아지는 교환입니다. 순서 값과 성적 차이가 같을 때 봅니다.
    balanceChange: number;
    // 바꾼 뒤 두 반의 전출 뒤 성적 평균 차이가 얼마나 달라지는지입니다. 음수면 차이가 줄어듭니다.
    scoreGapChange: number;
    // '성적만'에서 바꾸면 새로 생기는 몰림입니다. 예: '7반 -2가 몰립니다'. '생활지도까지'에서는 늘 비어 있습니다.
    warnings: string[];
}

// 이보다 작은 변화는 교사가 평균을 볼 때 달라 보이지 않습니다.
const NEGLIGIBLE_GAP_CHANGE = 0.5;

export function describeScoreDifference(difference: number): string {
    return `성적 차이 ${Math.round(difference * 10) / 10}점`;
}

export function describeScoreGapChange(change: number): string {
    if (Math.abs(change) < NEGLIGIBLE_GAP_CHANGE) return '성적 평균 차이 거의 그대로';
    return `성적 평균 차이 ${Math.abs(change).toFixed(1)} ${change < 0 ? '줄어듦' : '늘어남'}`;
}

// 보드 패널의 추천 설명 한 줄입니다. 예: '성적 차이 4.1점 · 생활지도 한 칸 차이(행-2 → 행-1)'.
// '성적만'에서는 생활지도가 조금이라도 다르면 '다름'이라고 씁니다. 몰림 안내는 warnings로 따로 보여 줍니다.
export function describeRecommendation(
    r: Pick<SwapRecommendation, 'scoreDifference' | 'guidanceChange'>,
    mode: RecommendMode = 'guidance',
): string {
    const change = r.guidanceChange;
    const guidance = !change
        ? '생활지도 같음'
        : `생활지도 ${change.steps === 1 && mode === 'guidance' ? '한 칸 차이' : '다름'}(${change.from} → ${change.to})`;
    return `${describeScoreDifference(r.scoreDifference)} · ${guidance}`;
}

// 몰림 항목의 이름입니다. 배정 코드(problem.ts)의 몰림 항목과 같은 기준으로 학생을 묶어 이름을 붙입니다.
// 같은 학생 묶음이 여럿이면 앞의 이름(더 넓은 이름)을 씁니다.
function crowdingLabels(students: Student[], stay: ArrayLike<number>): { label: string; members: string }[] {
    const ids = (pick: (s: Student) => boolean) =>
        students.map((s, i) => (stay[i] && pick(s) ? i : -1)).filter((i) => i >= 0).join(',');
    const level = (s: Student, value: number) => (value === -3 ? s.behavior_score <= -3 : s.behavior_score === value);
    return [
        { label: '-3', members: ids((s) => level(s, -3)) },
        { label: '-2', members: ids((s) => level(s, -2)) },
        { label: '행동 -3', members: ids((s) => s.behavior_type === 'BEHAVIOR' && level(s, -3)) },
        { label: '행동 -2', members: ids((s) => s.behavior_type === 'BEHAVIOR' && level(s, -2)) },
        { label: '정서 -3', members: ids((s) => s.behavior_type === 'EMOTIONAL' && level(s, -3)) },
        { label: '정서 -2', members: ids((s) => s.behavior_type === 'EMOTIONAL' && level(s, -2)) },
        { label: '리더', members: ids((s) => s.behavior_type === 'LEADER') },
        { label: '리더 +2', members: ids((s) => s.behavior_type === 'LEADER' && s.behavior_score >= 2) },
    ];
}

interface CrowdingWarning {
    className: string;
    label: string;
    crowded: boolean;
}

// 같은 반에 '-2'와 '정서 -2'가 함께 몰리면 더 자세한 '정서 -2'만 남깁니다.
// 리더는 반대로 '리더'가 있으면 '리더 +2'를 뺍니다. 리더가 모자란 것이 더 큰 일입니다.
function formatWarnings(list: CrowdingWarning[]): string[] {
    const same = (x: CrowdingWarning, y: CrowdingWarning) => x.className === y.className && x.crowded === y.crowded;
    const kept = list.filter((w) => {
        if (w.label === '-3' || w.label === '-2') {
            return !list.some((o) => same(o, w) && (o.label === `행동 ${w.label}` || o.label === `정서 ${w.label}`));
        }
        if (w.label === '리더 +2') return !list.some((o) => same(o, w) && o.label === '리더');
        return true;
    });
    return [...new Set(kept.map((w) => `${w.className} ${withSubject(w.label)} ${w.crowded ? '몰립니다' : '모자랍니다'}`))];
}

// '-3이', '-2가', '리더가'처럼 받침에 맞춰 조사를 붙입니다.
const withSubject = (label: string) => `${label}${label.endsWith('3') ? '이' : '가'}`;

// 생활지도를 칸으로 나타냅니다. kind: 0 없음, 1 행동, 2 정서, 3 리더. level: 어려움은 1~3, 리더는 1~2.
interface GuidanceCell {
    kind: 0 | 1 | 2 | 3;
    level: number;
}

function guidanceCellOf(student: Pick<Student, 'behavior_type' | 'behavior_score'>): GuidanceCell {
    const { behavior_type: type, behavior_score: value } = student;
    if (type === 'LEADER') return value > 0 ? { kind: 3, level: value >= 2 ? 2 : 1 } : { kind: 0, level: 0 };
    if ((type === 'BEHAVIOR' || type === 'EMOTIONAL') && value < 0) {
        return { kind: type === 'BEHAVIOR' ? 1 : 2, level: Math.min(3, -value) };
    }
    return { kind: 0, level: 0 };
}

// 보드 칩과 같은 표기입니다(boardModel.ts의 behaviorMark).
function guidanceLabel(cell: GuidanceCell): string {
    if (cell.kind === 0) return '없음';
    if (cell.kind === 3) return `리+${cell.level}`;
    return `${cell.kind === 1 ? '행' : '정'}-${cell.level}`;
}

/**
 * 생활지도가 몇 칸 다른지 셉니다. 2는 '두 칸 이상'입니다.
 * 한 칸: 같은 유형에서 등급 하나(-3↔-2, -2↔-1), -1↔없음, 같은 등급에서 행동↔정서, 리더 +2↔+1, 리더 +1↔없음.
 */
export function guidanceSteps(
    a: Pick<Student, 'behavior_type' | 'behavior_score'>,
    b: Pick<Student, 'behavior_type' | 'behavior_score'>,
): 0 | 1 | 2 {
    const x = guidanceCellOf(a);
    const y = guidanceCellOf(b);
    if (x.kind === y.kind && x.level === y.level) return 0;
    if (x.kind === 0 || y.kind === 0) return Math.max(x.level, y.level) === 1 ? 1 : 2;
    if (x.kind === y.kind) return Math.abs(x.level - y.level) === 1 ? 1 : 2;
    if (x.kind !== 3 && y.kind !== 3 && x.level === y.level) return 1;
    return 2;
}

// 같은 성별 학생 안에서의 성적 순위를 0(가장 낮음)~100(가장 높음)으로 매깁니다. 같은 점수는 같은 순위입니다.
function percentileRanks(indices: number[], score: Float64Array, out: Float64Array) {
    const sorted = [...indices].sort((a, b) => score[a] - score[b]);
    const top = Math.max(1, sorted.length - 1);
    for (let start = 0; start < sorted.length;) {
        let end = start;
        while (end + 1 < sorted.length && score[sorted[end + 1]] === score[sorted[start]]) end++;
        const value = (((start + end) / 2) / top) * 100;
        for (let k = start; k <= end; k++) out[sorted[k]] = value;
        start = end + 1;
    }
}

// 배정과 같은 잣대로 추천합니다.
export const RECOMMEND_WEIGHTS = FULL_WEIGHTS;

/**
 * 고른 학생과 가장 닮은 학생을 찾아 바꿔도 균형이 거의 그대로이게 합니다.
 * 반드시 지키는 것(어기면 목록에 넣지 않음):
 * - 다른 반, 같은 성별, 같은 전출 예정 여부. 1:1로 바꾸므로 인원과 남녀가 틀어지지 않습니다.
 * - 고정 배정, 분리 배정, 함께 배정, 그룹 분산, 인원, 남녀를 새로 어기지 않습니다.
 * - -3, -2(행동, 정서 유형별 포함)와 리더(+2, 리더 전체)가 고르게 나뉜 범위를 새로 벗어나는 반을 만들지 않습니다.
 * - 같은 성별 안 성적 순위 차이가 MAX_RANK_GAP 이하이고, 점수 차이가 같은 성별 성적 범위의 MAX_SCORE_GAP_PERCENT 이하이며,
 *   생활지도가 한 칸 이하로 다릅니다.
 *   전출 예정 학생끼리는 이 두 가지를 보지 않습니다. 전출 뒤 기준으로 맞추므로 성적과 생활지도가 균형에 들어가지 않기 때문입니다.
 * 순서: 생활지도 칸 수 x GUIDANCE_STEP_COST + 순위 차이가 작은 순, 같으면 성적 차이, 그다음 균형 변화.
 *
 * mode 'score'(성적만)는 다른 반, 같은 성별, 같은 전출 예정 여부, 필수 조건(고정, 분리, 함께, 그룹, 인원, 남녀)만 지키고
 * 성적이 가장 가까운 순으로 찾습니다. 순위 차이와 생활지도 칸 수로 빼지 않고, -3, -2, 리더 몰림으로도 빼지 않는 대신
 * 새로 생기는 몰림을 warnings에 적습니다.
 */
export function recommendSwaps(
    studentId: string,
    students: Student[],
    classCount: number,
    groups: CustomGroup[] = [],
    limit = 10,
    mode: RecommendMode = 'guidance',
): SwapRecommendation[] {
    const self = students.findIndex((s) => s.id === studentId);
    if (self < 0) return [];

    const problem = compileProblem(students, classCount, groups, RECOMMEND_WEIGHTS);
    const { c, classNames, fixedTo, gender, stay, score, meanScore, scoreWeight, guidancePoints, meanGuidance, dims, dimsOf, avoidAdj, keepAdj } = problem;
    // 남는 학생은 같은 성별의 남는 학생 안에서, 전출 예정 학생은 같은 성별 전체 안에서 순위를 매깁니다.
    const rank = new Float64Array(students.length);
    const pool = students
        .map((_, i) => i)
        .filter((i) => gender[i] === gender[self] && (stay[self] ? stay[i] === 1 : true));
    percentileRanks(pool, score, rank);
    // 같은 성별 성적 범위로 '생활지도까지'의 점수 차이 상한을 정합니다. 순위와 같은 학생 묶음으로 잽니다.
    let poolMin = Infinity;
    let poolMax = -Infinity;
    for (const i of pool) {
        if (score[i] < poolMin) poolMin = score[i];
        if (score[i] > poolMax) poolMax = score[i];
    }
    const maxScoreGap = pool.length > 0 ? ((poolMax - poolMin) * MAX_SCORE_GAP_PERCENT) / 100 : 0;
    const classOf = students.map((s) => resolveClassIndex(s.assigned_class, classNames));
    const home = classOf[self];
    if (home < 0) return [];

    // '성적만'에서 몰림 안내에 쓸 이름입니다. 몰림 항목마다 학생 묶음을 맞춰 봅니다.
    const crowdingName = new Map<number, string>();
    if (mode === 'score') {
        const members: number[][] = dims.map(() => []);
        dimsOf.forEach((ds, i) => ds.forEach((d) => members[d].push(i)));
        const labels = crowdingLabels(students, stay);
        dims.forEach((dim, d) => {
            if (!dim.crowding) return;
            const key = members[d].join(',');
            crowdingName.set(d, labels.find((l) => l.members === key)?.label ?? '생활지도');
        });
    }

    const counts = new Int32Array(dims.length * c);
    const stayCount = new Int32Array(c);
    const stayScore = new Float64Array(c);
    const guidanceSum = new Int32Array(c);
    classOf.forEach((cl, i) => {
        if (cl < 0) return;
        const ds = dimsOf[i];
        for (let k = 0; k < ds.length; k++) counts[ds[k] * c + cl]++;
        if (stay[i]) {
            stayCount[cl]++;
            stayScore[cl] += score[i];
            guidanceSum[cl] += guidancePoints[i];
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
    const guidanceTerm = (sum: number) => Math.abs(sum - meanGuidance) * RECOMMEND_WEIGHTS.total;
    // 전출 뒤 학생이 없는 반은 평균이 없으므로 차이를 말할 수 없습니다.
    const averageGap = (sumA: number, countA: number, sumB: number, countB: number) =>
        countA > 0 && countB > 0 ? Math.abs(sumA / countA - sumB / countB) : null;

    // 이 학생이 옮겨서 새로 생기는 분리 배정, 함께 배정 어김이 있는지 봅니다.
    const breaksPair = (i: number, from: number, to: number, partner: number) =>
        avoidAdj[i].some((other) => other !== partner && classOf[other] === to)
        || keepAdj[i].some((other) => other !== partner && classOf[other] === from);

    const pairsDelta = (i: number, from: number, to: number, partner: number) => {
        let delta = 0;
        for (const other of avoidAdj[i]) {
            if (other === partner) continue;
            if (classOf[other] === from) delta -= RECOMMEND_WEIGHTS.avoid;
            else if (classOf[other] === to) delta += RECOMMEND_WEIGHTS.avoid;
        }
        for (const other of keepAdj[i]) {
            if (other === partner) continue;
            if (classOf[other] === from) delta += RECOMMEND_WEIGHTS.keep;
            else if (classOf[other] === to) delta -= RECOMMEND_WEIGHTS.keep;
        }
        return delta;
    };

    const results: SwapRecommendation[] = [];
    students.forEach((candidate, j) => {
        if (j === self) return;
        const other = classOf[j];
        if (other < 0 || other === home) return;

        // 같은 성별끼리, 남는 학생은 남는 학생끼리, 전출 예정은 전출 예정끼리 바꿉니다.
        if (gender[j] !== gender[self] || stay[j] !== stay[self]) return;

        // '생활지도까지'는 닮은 학생만 추천합니다. 전출 예정 학생끼리는 보지 않습니다. '성적만'은 이 제한이 없습니다.
        const rankDifference = Math.abs(rank[self] - rank[j]);
        const steps = guidanceSteps(students[self], candidate);
        const scoreGap = Math.abs(score[self] - score[j]);
        if (mode === 'guidance' && stay[self] && (rankDifference > MAX_RANK_GAP + 1e-9 || scoreGap > maxScoreGap + 1e-9 || steps > 1)) return;

        // 고정 반을 새로 어기는 교환은 뺍니다.
        if (fixedTo[self] >= 0 && fixedTo[self] !== other) return;
        if (fixedTo[j] >= 0 && fixedTo[j] !== home) return;

        // 다른 조건을 고치는 이득과 합치지 않고 새 어김이 하나라도 있으면 뺍니다.
        if (breaksPair(self, home, other, j) || breaksPair(j, other, home, self)) return;

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
        let rejected = false;
        const warnings: CrowdingWarning[] = [];
        change.forEach((amount, d) => {
            if (amount === 0) return;
            const base = d * c;
            const va = counts[base + home];
            const vb = counts[base + other];
            const homeChange = penalty(va - amount, d) - penalty(va, d);
            const otherChange = penalty(vb + amount, d) - penalty(vb, d);
            const delta = dims[d].weight * (homeChange + otherChange);
            // 어김이나 몰림이 다른 반으로 옮겨 가기만 해도 그 반에는 새로 생긴 것입니다.
            const worse = homeChange > 0 || otherChange > 0;
            if (dims[d].hard) {
                hard += delta;
                if (worse) rejected = true;
            } else {
                soft += delta;
                if (dims[d].crowding && worse) {
                    // '생활지도까지'는 몰림이 새로 생기는 교환을 빼고, '성적만'은 빼지 않고 글로 알립니다.
                    if (mode === 'guidance') rejected = true;
                    else {
                        // 많아지는 쪽은 몰림으로 적고, 적어지는 쪽은 리더일 때만 적습니다. -3, -2가 적어지는 것은 문제가 아닙니다.
                        const label = crowdingName.get(d) ?? '생활지도';
                        const note = (cl: number, after: number) => {
                            if (after > dims[d].hi) warnings.push({ className: classNames[cl], label, crowded: true });
                            else if (after < dims[d].lo && label.startsWith('리더')) warnings.push({ className: classNames[cl], label, crowded: false });
                        };
                        if (homeChange > 0) note(home, va - amount);
                        if (otherChange > 0) note(other, vb + amount);
                    }
                }
            }
        });
        if (rejected) return;

        const beforeScore = scoreTerm(stayScore[home], stayCount[home]) + scoreTerm(stayScore[other], stayCount[other]);
        const homeCount = stayCount[home] - stay[self] + stay[j];
        const otherCount = stayCount[other] - stay[j] + stay[self];
        const homeSum = stayScore[home] - stay[self] * score[self] + stay[j] * score[j];
        const otherSum = stayScore[other] - stay[j] * score[j] + stay[self] * score[self];
        soft += scoreTerm(homeSum, homeCount) + scoreTerm(otherSum, otherCount) - beforeScore;

        // 배정과 같은 잣대가 되도록 합계 변화도 더합니다.
        const pointsIn = guidancePoints[j] - guidancePoints[self];
        soft += guidanceTerm(guidanceSum[home] + pointsIn) + guidanceTerm(guidanceSum[other] - pointsIn)
            - guidanceTerm(guidanceSum[home]) - guidanceTerm(guidanceSum[other]);

        const gapBefore = averageGap(stayScore[home], stayCount[home], stayScore[other], stayCount[other]);
        const gapAfter = averageGap(homeSum, homeCount, otherSum, otherCount);

        results.push({
            studentId: candidate.id,
            order: Math.min(steps, 1) * GUIDANCE_STEP_COST + rankDifference,
            rankDifference,
            guidanceChange: steps === 0
                ? null
                : { from: guidanceLabel(guidanceCellOf(students[self])), to: guidanceLabel(guidanceCellOf(candidate)), steps },
            scoreDifference: Math.abs(score[self] - score[j]),
            balanceChange: hard + soft,
            scoreGapChange: gapBefore === null || gapAfter === null ? 0 : gapAfter - gapBefore,
            warnings: formatWarnings(warnings),
        });
    });

    // '성적만'은 성적이 가장 가까운 순, '생활지도까지'는 닮은 순입니다.
    if (mode === 'score') results.sort((a, b) => a.scoreDifference - b.scoreDifference || a.balanceChange - b.balanceChange);
    else results.sort((a, b) => a.order - b.order || a.scoreDifference - b.scoreDifference || a.balanceChange - b.balanceChange);
    return results.slice(0, limit);
}
