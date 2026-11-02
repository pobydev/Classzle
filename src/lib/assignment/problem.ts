import type { CustomGroup, Student } from '@/types';
import { guidancePointsOf } from '../guidance';

export function makeClassNames(classCount: number): string[] {
    return Array.from({ length: classCount }, (_, i) => `${i + 1}반`);
}

// "2", "2반", "2 반"을 같은 반으로 봅니다. 없는 반이면 -1입니다.
export function resolveClassIndex(value: string | null | undefined, classNames: string[]): number {
    if (value === null || value === undefined) return -1;
    const text = String(value).trim();
    if (!text) return -1;
    const exact = classNames.indexOf(text);
    if (exact >= 0) return exact;
    const digits = text.match(/(\d+)\s*반?$/);
    return digits ? classNames.indexOf(`${Number(digits[1])}반`) : -1;
}

// "3-2-15"에서 전학년도 반(2)을 꺼냅니다.
export function previousClassOf(student: Student): string | null {
    const parts = String(student.prev_info ?? '').split('-');
    const value = parts.length > 1 ? parts[1].trim() : '';
    return value && value !== 'undefined' ? value : null;
}

export function isStaying(student: Student): boolean {
    return !student.is_pre_transfer;
}

export interface Weights {
    avoid: number;
    keep: number;
    group: number;
    count: number;
    gender: number;
    transfer: number;
    level3: number;
    level2: number;
    level1: number;
    typeLevel3: number;
    typeLevel2: number;
    typeLevel1: number;
    leader: number;
    leaderStrong: number;
    type: number;
    band: number;
    score: number;
    total: number;
    previous: number;
    moved: number;
}

// 고르게 나눌 항목 하나입니다. 예: 남학생 수, 축구부 수, -3 학생 수.
export interface BalanceDim {
    weight: number;
    lo: number;
    hi: number;
    hard: boolean;
    // 'single'은 혼자 옮겨야, 'crossGender'는 다른 성별과 바꿔야 줄어드는 항목입니다.
    fix: 'single' | 'crossGender' | 'sameGender';
}

export interface Problem {
    n: number;
    c: number;
    classNames: string[];
    fixedTo: Int32Array;
    gender: Uint8Array;
    stay: Uint8Array;
    score: Float64Array;
    meanScore: number;
    scoreWeight: number;
    // 전출 뒤 남는 학생의 생활지도 점수(guidance.ts)와, 그 합을 반 수로 나눈 값입니다.
    guidancePoints: Int32Array;
    meanGuidance: number;
    avoidAdj: number[][];
    keepAdj: number[][];
    avoidEdges: [number, number][];
    keepEdges: [number, number][];
    components: number[][];
    componentFixedClass: number[];
    dims: BalanceDim[];
    dimsOf: Int32Array[];
    weights: Weights;
}

export function compileProblem(
    students: Student[],
    classCount: number,
    groups: CustomGroup[],
    weights: Weights,
): Problem {
    const n = students.length;
    const c = classCount;
    const classNames = makeClassNames(classCount);
    const indexOf = new Map(students.map((s, i) => [s.id, i]));

    const fixedTo = new Int32Array(n);
    const gender = new Uint8Array(n);
    const stay = new Uint8Array(n);
    const score = new Float64Array(n);
    students.forEach((s, i) => {
        fixedTo[i] = resolveClassIndex(s.fixed_class, classNames);
        gender[i] = s.gender === 'M' ? 0 : 1;
        stay[i] = isStaying(s) ? 1 : 0;
        score[i] = Number.isFinite(s.academic_score) ? s.academic_score : 0;
    });

    // 한쪽에만 적혀 있어도 양쪽 관계로 봅니다. 지워진 학생은 건너뜁니다.
    const collectEdges = (idsOf: (s: Student) => string[] | undefined) => {
        const seen = new Set<string>();
        const edges: [number, number][] = [];
        const adj: number[][] = students.map(() => []);
        students.forEach((s, a) => {
            for (const id of idsOf(s) ?? []) {
                const b = indexOf.get(id);
                if (b === undefined || b === a) continue;
                const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                if (seen.has(key)) continue;
                seen.add(key);
                edges.push([a, b]);
                adj[a].push(b);
                adj[b].push(a);
            }
        });
        return { edges, adj };
    };
    const avoid = collectEdges((s) => s.avoid_ids);
    const keep = collectEdges((s) => s.keep_ids);

    // 함께 둘 학생 묶음을 찾습니다.
    const parent = students.map((_, i) => i);
    const find = (x: number): number => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };
    keep.edges.forEach(([a, b]) => {
        parent[find(a)] = find(b);
    });
    const byRoot = new Map<number, number[]>();
    students.forEach((_, i) => {
        const root = find(i);
        const list = byRoot.get(root);
        if (list) list.push(i);
        else byRoot.set(root, [i]);
    });
    const components: number[][] = [];
    const componentFixedClass: number[] = [];
    for (const members of byRoot.values()) {
        if (members.length < 2) continue;
        const fixedClasses = new Set(members.map((i) => fixedTo[i]).filter((v) => v >= 0));
        // 고정 반이 둘 이상이면 함께 둘 수 없으므로 묶음으로 옮기지 않습니다.
        if (fixedClasses.size > 1) continue;
        components.push(members);
        componentFixedClass.push(fixedClasses.size === 1 ? [...fixedClasses][0] : -1);
    }

    // 고르게 나눌 항목을 만듭니다.
    const dims: BalanceDim[] = [];
    const memberLists: number[][] = students.map(() => []);
    const addDim = (
        members: number[],
        weight: number,
        options: { hard?: boolean; fix?: BalanceDim['fix'] } = {},
    ) => {
        if (members.length === 0 || weight <= 0) return;
        const id = dims.length;
        dims.push({
            weight,
            lo: Math.floor(members.length / c),
            hi: Math.ceil(members.length / c),
            hard: options.hard ?? false,
            fix: options.fix ?? 'sameGender',
        });
        members.forEach((i) => memberLists[i].push(id));
    };

    const indices = students.map((_, i) => i);
    const stayers = indices.filter((i) => stay[i]);
    addDim(stayers, weights.count, { hard: true, fix: 'single' });
    addDim(stayers.filter((i) => gender[i] === 0), weights.gender, { hard: true, fix: 'crossGender' });
    addDim(stayers.filter((i) => gender[i] === 1), weights.gender, { hard: true, fix: 'crossGender' });
    addDim(indices.filter((i) => !stay[i]), weights.transfer);

    for (const group of groups) {
        const members = (group.member_ids ?? [])
            .map((id) => indexOf.get(id))
            .filter((i): i is number => i !== undefined && stay[i] === 1);
        addDim([...new Set(members)], weights.group, { hard: true });
    }

    const scoreIs = (level: number) => (i: number) => {
        const value = students[i].behavior_score;
        return level === -3 ? value <= -3 : value === level;
    };
    addDim(stayers.filter(scoreIs(-3)), weights.level3);
    addDim(stayers.filter(scoreIs(-2)), weights.level2);
    addDim(stayers.filter(scoreIs(-1)), weights.level1);
    // 행동과 정서는 다른 어려움입니다. 등급별 합이 맞아도 한 반에 한 유형만 몰리지 않게 따로 맞춥니다.
    for (const type of ['BEHAVIOR', 'EMOTIONAL'] as const) {
        const ofType = stayers.filter((i) => students[i].behavior_type === type);
        addDim(ofType.filter(scoreIs(-3)), weights.typeLevel3);
        addDim(ofType.filter(scoreIs(-2)), weights.typeLevel2);
        addDim(ofType.filter(scoreIs(-1)), weights.typeLevel1);
    }
    addDim(stayers.filter((i) => students[i].behavior_type === 'LEADER'), weights.leader);
    addDim(stayers.filter((i) => students[i].behavior_type === 'LEADER' && students[i].behavior_score >= 2), weights.leaderStrong);
    addDim(stayers.filter((i) => students[i].behavior_type === 'BEHAVIOR'), weights.type);
    addDim(stayers.filter((i) => students[i].behavior_type === 'EMOTIONAL'), weights.type);

    // 남녀 각각 성적순 4구간으로 나눠 구간마다 고르게 섞습니다.
    for (const g of [0, 1]) {
        const sorted = stayers
            .filter((i) => gender[i] === g)
            .sort((a, b) => score[b] - score[a]);
        for (let band = 0; band < 4; band++) {
            const part = sorted.slice(
                Math.floor((sorted.length * band) / 4),
                Math.floor((sorted.length * (band + 1)) / 4),
            );
            addDim(part, weights.band);
        }
    }

    // 전학년도 반이 새 반에 몰리지 않게 합니다.
    const byPrevious = new Map<string, number[]>();
    for (const i of stayers) {
        const previous = previousClassOf(students[i]);
        if (previous === null) continue;
        const list = byPrevious.get(previous);
        if (list) list.push(i);
        else byPrevious.set(previous, [i]);
    }
    if (byPrevious.size > 1) {
        for (const members of byPrevious.values()) addDim(members, weights.previous);
    }

    // 성적 단위가 달라도(100점, 1000점) 같은 무게가 되게 맞춥니다.
    const stayScores = stayers.map((i) => score[i]);
    const min = stayScores.length ? Math.min(...stayScores) : 0;
    const max = stayScores.length ? Math.max(...stayScores) : 0;
    const meanScore = stayScores.length ? stayScores.reduce((a, b) => a + b, 0) / stayScores.length : 0;
    const scoreWeight = (weights.score * 1000) / Math.max(1, max - min);

    const guidancePoints = Int32Array.from(students, (s, i) => (stay[i] ? guidancePointsOf(s) : 0));
    const meanGuidance = guidancePoints.reduce((a, b) => a + b, 0) / Math.max(1, c);

    return {
        n,
        c,
        classNames,
        fixedTo,
        gender,
        stay,
        score,
        meanScore,
        scoreWeight,
        guidancePoints,
        meanGuidance,
        avoidAdj: avoid.adj,
        keepAdj: keep.adj,
        avoidEdges: avoid.edges,
        keepEdges: keep.edges,
        components,
        componentFixedClass,
        dims,
        dimsOf: memberLists.map((list) => Int32Array.from(list)),
        weights,
    };
}
