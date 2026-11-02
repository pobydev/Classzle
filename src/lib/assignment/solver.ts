import type { Problem } from './problem';
import type { Rng } from './rng';

export interface SolveOptions {
    rng: Rng;
    // 시작 배정. 모든 학생이 반을 가지고 있어야 합니다.
    initial: Int32Array;
    // 옮긴 학생을 셀 때의 기준. null이면 세지 않습니다.
    reference: Int32Array | null;
    iterations: number;
    rounds: number;
    t0: number;
    t1: number;
    maxMs: number;
    // 켜면 조건을 다 지킬 때까지 판마다 더 크게 흔들고, 다 지키면 바로 멈춥니다. 수정 모드에서 씁니다.
    escalate?: boolean;
}

export interface SolveResult {
    classes: Int32Array;
    cost: number;
    hardCost: number;
    iterations: number;
    rounds: number;
}

// 정해진 판을 다 돌아도 조건을 어긴 채면 더 크게 흔들며 이만큼 더 돕니다. 조건을 지키면 이 판들은 돌지 않습니다.
const EXTRA_ROUNDS = 6;

/**
 * 담금질로 배정을 찾습니다. 조건마다 벌점을 매기고, 벌점이 줄어드는 교환은 받아들이고
 * 늘어나는 교환은 처음에는 가끔, 끝으로 갈수록 드물게 받아들입니다.
 * 항목별 인원을 들고 있어서 한 번 옮길 때 그 학생과 관련된 항목만 다시 셉니다.
 */
export function solve(problem: Problem, options: SolveOptions): SolveResult {
    const { n, c, fixedTo, gender, stay, score, meanScore, scoreWeight, difficultyPoints, meanDifficulty, avoidAdj, keepAdj, dims, dimsOf, weights } = problem;
    const { rng, reference } = options;
    const cls = Int32Array.from(options.initial);

    const dimCount = dims.length;
    const counts = new Int32Array(dimCount * c);
    const dimLo = new Int32Array(dimCount);
    const dimHi = new Int32Array(dimCount);
    const dimWeight = new Float64Array(dimCount);
    dims.forEach((dim, d) => {
        dimLo[d] = dim.lo;
        dimHi[d] = dim.hi;
        dimWeight[d] = dim.weight;
    });

    const stayCount = new Int32Array(c);
    const stayScore = new Float64Array(c);
    const difficultySum = new Int32Array(c);

    // 반, 성별별 학생 목록. 무작위로 고르고 옮기는 일을 바로 할 수 있게 위치를 함께 둡니다.
    const roster: number[][] = Array.from({ length: c * 2 }, () => []);
    const rosterPos = new Int32Array(n);
    const rosterIndex = (cl: number, g: number) => cl * 2 + g;

    for (let i = 0; i < n; i++) {
        const cl = cls[i];
        const list = roster[rosterIndex(cl, gender[i])];
        rosterPos[i] = list.length;
        list.push(i);
        const ds = dimsOf[i];
        for (let k = 0; k < ds.length; k++) counts[ds[k] * c + cl]++;
        if (stay[i]) {
            stayCount[cl]++;
            stayScore[cl] += score[i];
            difficultySum[cl] += difficultyPoints[i];
        }
    }

    const penalty = (value: number, d: number) => {
        if (value < dimLo[d]) return dimLo[d] - value;
        if (value > dimHi[d]) return value - dimHi[d];
        return 0;
    };
    const scoreTerm = (sum: number, count: number) =>
        count > 0 ? Math.abs(sum / count - meanScore) * scoreWeight : 0;
    // 절대값이라 학생 한 명을 옮겨 얻는 이득은 점수의 2배 x 가중치를 넘지 않습니다. 합계 때문에 -3이 몰리는 일을 이 상한으로 막습니다.
    const difficultyTerm = (sum: number) => Math.abs(sum - meanDifficulty) * weights.difficulty;

    const computeCost = () => {
        let total = 0;
        for (const [a, b] of problem.avoidEdges) if (cls[a] === cls[b]) total += weights.avoid;
        for (const [a, b] of problem.keepEdges) if (cls[a] !== cls[b]) total += weights.keep;
        for (let d = 0; d < dimCount; d++) {
            for (let cl = 0; cl < c; cl++) total += penalty(counts[d * c + cl], d) * dimWeight[d];
        }
        for (let cl = 0; cl < c; cl++) total += scoreTerm(stayScore[cl], stayCount[cl]) + difficultyTerm(difficultySum[cl]);
        if (reference) {
            for (let i = 0; i < n; i++) if (reference[i] !== cls[i]) total += weights.moved;
        }
        return total;
    };

    const computeHardCost = () => {
        let total = 0;
        for (const [a, b] of problem.avoidEdges) if (cls[a] === cls[b]) total += weights.avoid;
        for (const [a, b] of problem.keepEdges) if (cls[a] !== cls[b]) total += weights.keep;
        for (let d = 0; d < dimCount; d++) {
            if (!dims[d].hard) continue;
            for (let cl = 0; cl < c; cl++) total += penalty(counts[d * c + cl], d) * dimWeight[d];
        }
        return total;
    };

    // 학생 한 명을 옮기고 벌점 변화를 돌려줍니다.
    const moveStudent = (i: number, to: number): number => {
        const from = cls[i];
        if (from === to) return 0;
        let delta = 0;

        const ds = dimsOf[i];
        for (let k = 0; k < ds.length; k++) {
            const d = ds[k];
            const base = d * c;
            const va = counts[base + from];
            const vb = counts[base + to];
            delta += dimWeight[d] * (penalty(va - 1, d) - penalty(va, d) + penalty(vb + 1, d) - penalty(vb, d));
            counts[base + from] = va - 1;
            counts[base + to] = vb + 1;
        }

        const avoidList = avoidAdj[i];
        for (let k = 0; k < avoidList.length; k++) {
            const other = cls[avoidList[k]];
            if (other === from) delta -= weights.avoid;
            else if (other === to) delta += weights.avoid;
        }
        const keepList = keepAdj[i];
        for (let k = 0; k < keepList.length; k++) {
            const other = cls[keepList[k]];
            if (other === from) delta += weights.keep;
            else if (other === to) delta -= weights.keep;
        }

        if (stay[i]) {
            const before = scoreTerm(stayScore[from], stayCount[from]) + scoreTerm(stayScore[to], stayCount[to]);
            stayScore[from] -= score[i];
            stayCount[from]--;
            stayScore[to] += score[i];
            stayCount[to]++;
            delta += scoreTerm(stayScore[from], stayCount[from]) + scoreTerm(stayScore[to], stayCount[to]) - before;
            const points = difficultyPoints[i];
            if (points !== 0) {
                delta += difficultyTerm(difficultySum[from] - points) + difficultyTerm(difficultySum[to] + points)
                    - difficultyTerm(difficultySum[from]) - difficultyTerm(difficultySum[to]);
                difficultySum[from] -= points;
                difficultySum[to] += points;
            }
        }

        if (reference) {
            const home = reference[i];
            if (from === home) delta += weights.moved;
            else if (to === home) delta -= weights.moved;
        }

        const g = gender[i];
        const fromList = roster[rosterIndex(from, g)];
        const pos = rosterPos[i];
        const last = fromList[fromList.length - 1];
        fromList[pos] = last;
        rosterPos[last] = pos;
        fromList.pop();
        const toList = roster[rosterIndex(to, g)];
        rosterPos[i] = toList.length;
        toList.push(i);

        cls[i] = to;
        return delta;
    };

    const movable: number[] = [];
    for (let i = 0; i < n; i++) if (fixedTo[i] < 0) movable.push(i);

    const randomInt = (limit: number) => Math.floor(rng() * limit);
    const randomOtherClass = (cl: number) => {
        const value = randomInt(c - 1);
        return value >= cl ? value + 1 : value;
    };
    const pickFrom = (cl: number, g: number): number => {
        const list = roster[rosterIndex(cl, g)];
        if (list.length === 0) return -1;
        return list[randomInt(list.length)];
    };

    // 이번 시도에서 옮긴 기록. 받아들이지 않으면 거꾸로 되돌립니다.
    const undoStudent: number[] = [];
    const undoClass: number[] = [];
    const applyMove = (i: number, to: number): number => {
        const from = cls[i];
        if (from === to) return 0;
        undoStudent.push(i);
        undoClass.push(from);
        return moveStudent(i, to);
    };
    const rollback = () => {
        for (let k = undoStudent.length - 1; k >= 0; k--) moveStudent(undoStudent[k], undoClass[k]);
    };

    const swapWith = (x: number, to: number, partnerGender: number): number | null => {
        const from = cls[x];
        const partner = pickFrom(to, partnerGender);
        if (partner < 0 || fixedTo[partner] >= 0) return null;
        return applyMove(x, to) + applyMove(partner, from);
    };

    const proposeRelationFix = (): number | null => {
        const total = problem.keepEdges.length + problem.avoidEdges.length;
        if (total === 0) return null;
        const pick = randomInt(total);
        if (pick < problem.keepEdges.length) {
            const [a, b] = problem.keepEdges[pick];
            if (cls[a] === cls[b]) return null;
            const useA = fixedTo[a] < 0 && (fixedTo[b] >= 0 || rng() < 0.5);
            const x = useA ? a : b;
            const y = useA ? b : a;
            if (fixedTo[x] >= 0) return null;
            return swapWith(x, cls[y], gender[x]);
        }
        const [a, b] = problem.avoidEdges[pick - problem.keepEdges.length];
        if (cls[a] !== cls[b]) return null;
        const useA = fixedTo[a] < 0 && (fixedTo[b] >= 0 || rng() < 0.5);
        const x = useA ? a : b;
        if (fixedTo[x] >= 0) return null;
        return swapWith(x, randomOtherClass(cls[x]), gender[x]);
    };

    const proposeComponentMove = (): number | null => {
        if (problem.components.length === 0) return null;
        const index = randomInt(problem.components.length);
        const members = problem.components[index];
        const fixedClass = problem.componentFixedClass[index];
        const to = fixedClass >= 0 ? fixedClass : randomInt(c);
        let delta = 0;
        for (const x of members) {
            if (cls[x] === to || fixedTo[x] >= 0) continue;
            const from = cls[x];
            delta += applyMove(x, to);
            // 묶음 밖의 같은 성별 학생을 맞바꿔 인원을 유지합니다.
            for (let attempt = 0; attempt < 4; attempt++) {
                const partner = pickFrom(to, gender[x]);
                if (partner < 0 || fixedTo[partner] >= 0 || members.includes(partner)) continue;
                delta += applyMove(partner, from);
                break;
            }
        }
        return delta;
    };

    const hardDims: number[] = [];
    dims.forEach((dim, d) => {
        if (dim.hard) hardDims.push(d);
    });
    const inDim = (i: number, d: number) => {
        const ds = dimsOf[i];
        for (let k = 0; k < ds.length; k++) if (ds[k] === d) return true;
        return false;
    };

    // 인원이나 그룹이 어긋난 항목을 골라 많은 반에서 적은 반으로 직접 옮겨 봅니다.
    const proposeDimFix = (): number | null => {
        if (hardDims.length === 0) return null;
        const d = hardDims[randomInt(hardDims.length)];
        const base = d * c;
        let over = -1;
        let under = -1;
        let high = -Infinity;
        let low = Infinity;
        const offset = randomInt(c);
        for (let k = 0; k < c; k++) {
            const cl = (k + offset) % c;
            const value = counts[base + cl];
            if (value > high) {
                high = value;
                over = cl;
            }
            if (value < low) {
                low = value;
                under = cl;
            }
        }
        if (high - low <= 1) return null;

        const start = randomInt(2);
        for (let g0 = 0; g0 < 2; g0++) {
            const g = (start + g0) % 2;
            const list = roster[rosterIndex(over, g)];
            if (list.length === 0) continue;
            const listStart = randomInt(list.length);
            for (let k = 0; k < list.length; k++) {
                const x = list[(listStart + k) % list.length];
                if (fixedTo[x] >= 0 || !inDim(x, d)) continue;
                const fix = dims[d].fix;
                if (fix === 'single') return applyMove(x, under);
                const partnerGender = fix === 'crossGender' ? 1 - g : g;
                for (let attempt = 0; attempt < 6; attempt++) {
                    const partner = pickFrom(under, partnerGender);
                    if (partner < 0 || fixedTo[partner] >= 0 || inDim(partner, d)) continue;
                    return applyMove(x, under) + applyMove(partner, over);
                }
                return null;
            }
        }
        return null;
    };

    const proposeSwap = (sameGender: boolean): number | null => {
        const x = movable[randomInt(movable.length)];
        const to = randomOtherClass(cls[x]);
        const partnerGender = sameGender ? gender[x] : randomInt(2);
        return swapWith(x, to, partnerGender);
    };

    const proposeSingle = (): number | null => {
        const x = movable[randomInt(movable.length)];
        return applyMove(x, randomOtherClass(cls[x]));
    };

    const propose = (): number | null => {
        const roll = rng();
        if (roll < 0.08) return proposeRelationFix();
        if (roll < 0.14) return proposeComponentMove();
        if (roll < 0.22) return proposeDimFix();
        if (roll < 0.32) return proposeSingle();
        if (roll < 0.4) return proposeSwap(false);
        return proposeSwap(true);
    };

    let current = computeCost();
    let best = current;
    const bestClasses = Int32Array.from(cls);
    let iterationsDone = 0;
    let roundsDone = 0;

    const startedAt = Date.now();
    const noMoves = movable.length === 0 || c < 2;

    if (!noMoves) {
        for (let round = 0; round < options.rounds + EXTRA_ROUNDS; round++) {
            roundsDone++;
            const extra = round - options.rounds + 1;
            const t0 = options.escalate
                ? options.t0 * (round + 1)
                : extra > 0
                  ? options.t0 * extra
                  : options.t0 * Math.pow(0.5, round);
            let temperature = t0;
            const cooling = Math.pow(options.t1 / t0, 1 / Math.max(1, options.iterations));

            for (let iter = 0; iter < options.iterations; iter++) {
                temperature *= cooling;
                undoStudent.length = 0;
                undoClass.length = 0;
                const delta = propose();
                iterationsDone++;

                if (delta === null) {
                    rollback();
                } else if (delta <= 0 || rng() < Math.exp(-delta / temperature)) {
                    current += delta;
                    if (current < best - 1e-9) {
                        best = current;
                        bestClasses.set(cls);
                    }
                } else {
                    rollback();
                }

                if ((iter & 4095) === 0 && Date.now() - startedAt > options.maxMs) break;
            }

            // 다음 판은 찾은 것 중 가장 좋은 배정에서 다시 시작합니다.
            if (Date.now() - startedAt > options.maxMs) break;
            for (let i = 0; i < n; i++) if (cls[i] !== bestClasses[i]) moveStudent(i, bestClasses[i]);
            current = computeCost();
            if (computeHardCost() === 0 && (options.escalate || round >= 1)) break;
        }
    }

    for (let i = 0; i < n; i++) if (cls[i] !== bestClasses[i]) moveStudent(i, bestClasses[i]);

    return {
        classes: Int32Array.from(cls),
        cost: computeCost(),
        hardCost: computeHardCost(),
        iterations: iterationsDone,
        rounds: roundsDone,
    };
}
