import type { CustomGroup, Student, Violation } from '@/types';
import { compileProblem, makeClassNames, resolveClassIndex, type Problem, type Weights } from './problem';
import { createRng, randomSeed, shuffled, type Rng } from './rng';
import { solve } from './solver';
import { collectViolations } from './violations';

export { collectViolations } from './violations';
export { makeClassNames, resolveClassIndex } from './problem';

// new: 처음부터 새로 나눕니다.
// optimize: 지금 배정을 두고 어긴 조건만 고칩니다.
// balance: 지금 배정에서 시작해 성적과 생활지도 균형까지 맞춥니다.
export type AssignmentMode = 'new' | 'optimize' | 'balance';

export interface AssignOptions {
    mode?: AssignmentMode;
    seed?: number;
    maxMs?: number;
    iterations?: number;
}

export interface AssignResult {
    students: Student[];
    violations: Violation[];
    moved: number;
    iterations: number;
}

// 어길 때의 벌점입니다. 충돌하면 고정 배정, 분리 배정, 함께 배정, 그룹 분산, 전체 인원, 남녀 순으로 지킵니다.
// 고정 배정은 학생을 옮기지 않는 것으로 지킵니다.
const HARD = { avoid: 3000, keep: 1500, group: 600, count: 300, gender: 150 };

// 비슷하면 되는 항목입니다. 학생 한 명을 옮겨 얻는 이득이 남녀 벌점 한 칸(150)을 넘지 않아야 조건이 먼저입니다.
// 가장 무거운 -3 행동 학생 기준: 2 x (level3 40 + typeLevel3 15 + type 5 + band 10) + 6 x guidance 1 = 146.
const FULL_WEIGHTS: Weights = {
    ...HARD,
    transfer: 60,
    level3: 40,
    level2: 30,
    level1: 8,
    typeLevel3: 15,
    typeLevel2: 12,
    typeLevel1: 4,
    leader: 14,
    leaderStrong: 6,
    type: 5,
    band: 10,
    score: 0.5,
    guidance: 1,
    moved: 0,
};

const REPAIR_WEIGHTS: Weights = {
    ...HARD,
    transfer: 60,
    level3: 8,
    level2: 6,
    level1: 2,
    typeLevel3: 3,
    typeLevel2: 2,
    typeLevel1: 1,
    leader: 2,
    leaderStrong: 1,
    type: 1,
    band: 4,
    score: 0.25,
    guidance: 0.2,
    moved: 25,
};

const BALANCE_WEIGHTS: Weights = { ...FULL_WEIGHTS, moved: 2 };

const SCHEDULES: Record<AssignmentMode, { t0: number; t1: number; rounds: number; iterationsPerStudent: number }> = {
    new: { t0: 80, t1: 0.02, rounds: 3, iterationsPerStudent: 2500 },
    optimize: { t0: 15, t1: 0.05, rounds: 6, iterationsPerStudent: 800 },
    balance: { t0: 25, t1: 0.02, rounds: 2, iterationsPerStudent: 2000 },
};

const WEIGHTS: Record<AssignmentMode, Weights> = {
    new: FULL_WEIGHTS,
    optimize: REPAIR_WEIGHTS,
    balance: BALANCE_WEIGHTS,
};

// 남녀 각각 성적순으로 뱀 모양으로 나눕니다. 반 순서는 매번 섞어 1반에 치우치지 않게 합니다.
function snakeStart(students: Student[], problem: Problem, rng: Rng): Int32Array {
    const { c, fixedTo } = problem;
    const classes = new Int32Array(students.length).fill(-1);
    const indices = students.map((_, i) => i);

    for (const gender of ['M', 'F'] as const) {
        const order = shuffled(Array.from({ length: c }, (_, i) => i), rng);
        const list = indices
            .filter((i) => students[i].gender === gender && !students[i].is_pre_transfer)
            .sort((a, b) => students[b].academic_score - students[a].academic_score);
        let position = 0;
        let direction = 1;
        for (const i of list) {
            classes[i] = order[position];
            position += direction;
            if (position >= c) {
                position = c - 1;
                direction = -1;
            } else if (position < 0) {
                position = 0;
                direction = 1;
            }
        }
    }

    const transferOrder = shuffled(Array.from({ length: c }, (_, i) => i), rng);
    indices
        .filter((i) => students[i].is_pre_transfer)
        .forEach((i, k) => {
            classes[i] = transferOrder[k % c];
        });

    problem.components.forEach((members, index) => {
        const target = problem.componentFixedClass[index] >= 0 ? problem.componentFixedClass[index] : classes[members[0]];
        members.forEach((i) => {
            classes[i] = target;
        });
    });

    fixedTo.forEach((target, i) => {
        if (target >= 0) classes[i] = target;
    });
    return classes;
}

// 지금 배정을 시작점으로 씁니다. 반이 없는 학생은 인원이 적은 반에 넣고, 고정 반은 맞춥니다.
function currentStart(students: Student[], problem: Problem): Int32Array {
    const { c, classNames, fixedTo } = problem;
    const classes = new Int32Array(students.length).fill(-1);
    const sizes = new Int32Array(c);

    students.forEach((s, i) => {
        const current = fixedTo[i] >= 0 ? fixedTo[i] : resolveClassIndex(s.assigned_class, classNames);
        if (current >= 0) {
            classes[i] = current;
            sizes[current]++;
        }
    });
    classes.forEach((value, i) => {
        if (value >= 0) return;
        let smallest = 0;
        for (let cl = 1; cl < c; cl++) if (sizes[cl] < sizes[smallest]) smallest = cl;
        classes[i] = smallest;
        sizes[smallest]++;
    });
    return classes;
}

export function assignStudents(
    students: Student[],
    classCount: number,
    groups: CustomGroup[],
    options: AssignOptions = {},
): AssignResult {
    const mode = options.mode ?? 'new';
    const copy = students.map((s) => ({ ...s }));
    if (students.length === 0 || classCount < 1) {
        return { students: copy, violations: [], moved: 0, iterations: 0 };
    }

    // 수정은 어긴 조건만 고칩니다. 어긴 것이 없으면 아무도 옮기지 않습니다.
    if (mode === 'optimize') {
        const existing = collectViolations(copy, classCount, groups);
        if (existing.length === 0) {
            return { students: copy, violations: [], moved: 0, iterations: 0 };
        }
    }

    const rng = createRng(options.seed ?? randomSeed());
    const problem = compileProblem(copy, classCount, groups, WEIGHTS[mode]);
    const schedule = SCHEDULES[mode];
    const iterations = options.iterations ?? Math.max(200000, schedule.iterationsPerStudent * students.length);

    const classNames = makeClassNames(classCount);
    const initial = mode === 'new' ? snakeStart(copy, problem, rng) : currentStart(copy, problem);
    const reference = mode === 'new' ? null : Int32Array.from(initial);

    const result = solve(problem, {
        rng,
        initial,
        reference,
        iterations,
        rounds: schedule.rounds,
        t0: schedule.t0,
        t1: schedule.t1,
        maxMs: options.maxMs ?? 6000,
        escalate: mode === 'optimize',
    });

    let moved = 0;
    copy.forEach((s, i) => {
        const next = classNames[result.classes[i]];
        if (s.assigned_class !== next) moved++;
        s.assigned_class = next;
    });

    return {
        students: copy,
        violations: collectViolations(copy, classCount, groups),
        moved,
        iterations: result.iterations,
    };
}
