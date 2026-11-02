import type { CustomGroup, Student } from '@/types';

// 지어낸 학생으로 문제를 만듭니다. 모든 조건을 지키는 '숨은 정답'을 먼저 만든 뒤 조건을 뽑으므로
// 정답이 있는 문제만 나옵니다. brand/classzle-측정/bench.mjs와 같은 만들기 방식입니다.
export function seeded(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface ScenarioConfig {
    classes: number;
    n: number;
    avoid: number;
    keep: number;
    fixed: number;
    groups: number[];
    transfer: number;
}

export const SCENARIOS: Record<string, ScenarioConfig> = {
    '작음 5반 140명': { classes: 5, n: 140, avoid: 8, keep: 5, fixed: 3, groups: [5], transfer: 3 },
    '보통 12반 330명': { classes: 12, n: 330, avoid: 20, keep: 12, fixed: 6, groups: [12, 24], transfer: 6 },
    '빡빡 8반 220명': { classes: 8, n: 220, avoid: 60, keep: 30, fixed: 15, groups: [8, 16, 24], transfer: 8 },
};

export interface Scenario {
    students: Student[];
    groups: CustomGroup[];
    names: string[];
    hidden: Map<string, string>;
}

export function makeScenario(cfg: ScenarioConfig, seed: number): Scenario {
    const r = seeded(seed);
    const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
    const names = Array.from({ length: cfg.classes }, (_, i) => `${i + 1}반`);
    const students: Student[] = Array.from({ length: cfg.n }, (_, i) => {
        const roll = r();
        let behavior_type: Student['behavior_type'] = 'NONE';
        let behavior_score = 0;
        if (roll < 0.08) {
            behavior_type = 'BEHAVIOR';
            behavior_score = -1 - Math.floor(r() * 3);
        } else if (roll < 0.14) {
            behavior_type = 'EMOTIONAL';
            behavior_score = -1 - Math.floor(r() * 3);
        } else if (roll < 0.24) {
            behavior_type = 'LEADER';
            behavior_score = 1 + Math.floor(r() * 2);
        }
        return {
            id: `s${i}`,
            name: `가상${i}`,
            prev_info: `3-${(i % cfg.classes) + 1}-${i + 1}`,
            gender: r() < 0.5 ? 'M' : 'F',
            academic_score: 1 + Math.floor(r() * 1000),
            behavior_type,
            behavior_score,
            group_ids: [],
            avoid_ids: [],
            keep_ids: [],
            assigned_class: null,
        };
    });

    const shuffledStudents = [...students].sort(() => r() - 0.5);
    const transfers = shuffledStudents.slice(0, cfg.transfer);
    transfers.forEach((s) => {
        s.is_pre_transfer = true;
    });

    const hidden = new Map<string, string>();
    const order = names.map((_, i) => i).sort(() => r() - 0.5);
    for (const g of ['M', 'F'] as const) {
        const stay = shuffledStudents.filter((s) => !s.is_pre_transfer && s.gender === g);
        const start = g === 'M' ? 0 : stay.length % cfg.classes;
        stay.forEach((s, i) => hidden.set(s.id, names[order[(i + start) % cfg.classes]]));
    }
    transfers.forEach((s, i) => hidden.set(s.id, names[order[i % cfg.classes]]));
    const free = shuffledStudents.slice(cfg.transfer);

    const used = new Set<string>();
    const groups: CustomGroup[] = cfg.groups.map((size, gi) => {
        const member_ids: string[] = [];
        for (let c = 0; member_ids.length < size; c = (c + 1) % cfg.classes) {
            const cand = free.find((s) => hidden.get(s.id) === names[order[c]] && !used.has(s.id));
            if (!cand) break;
            used.add(cand.id);
            cand.group_ids.push(`g${gi}`);
            member_ids.push(cand.id);
        }
        return { id: `g${gi}`, name: `그룹${gi}`, color: '', member_ids };
    });

    const addPair = (field: 'avoid_ids' | 'keep_ids', a: Student, b: Student) => {
        a[field].push(b.id);
        b[field].push(a.id);
    };
    const seen = new Set<string>();
    const key = (a: Student, b: Student) => [a.id, b.id].sort().join('|');
    let guard = 0;
    for (let k = 0; k < cfg.avoid && guard < 20000; guard++) {
        const a = pick(students);
        const b = pick(students);
        if (a === b || seen.has(key(a, b)) || hidden.get(a.id) === hidden.get(b.id)) continue;
        seen.add(key(a, b));
        addPair('avoid_ids', a, b);
        k++;
    }
    guard = 0;
    for (let k = 0; k < cfg.keep && guard < 20000; guard++) {
        const a = pick(free);
        const b = pick(free);
        if (a === b || seen.has(key(a, b)) || hidden.get(a.id) !== hidden.get(b.id)) continue;
        seen.add(key(a, b));
        addPair('keep_ids', a, b);
        k++;
    }
    free.filter((s) => s.keep_ids.length === 0)
        .slice(0, cfg.fixed)
        .forEach((s) => {
            s.fixed_class = hidden.get(s.id);
        });

    return { students, groups, names, hidden };
}

const spread = (values: number[]) => (values.length ? Math.max(...values) - Math.min(...values) : 0);

export interface Measure {
    fixed: number;
    avoid: number;
    keep: number;
    groupSpread: number;
    count: number;
    male: number;
    female: number;
    score: number;
    bandAvg: number;
    bandMax: number;
    minus3: number;
    minus2: number;
    minus1: number;
    leader: number;
    noLeader: number;
    previousAvg: number;
    previousMax: number;
    transferMax: number;
    unassigned: number;
    allKept: boolean;
}

export function measure(students: Student[], groups: CustomGroup[], names: string[]): Measure {
    const byId = new Map(students.map((s) => [s.id, s]));
    let fixed = 0;
    let avoid = 0;
    let keep = 0;
    for (const s of students) {
        if (s.fixed_class && s.assigned_class !== s.fixed_class) fixed++;
        for (const id of s.avoid_ids) if (s.id < id && byId.get(id)!.assigned_class === s.assigned_class) avoid++;
        for (const id of s.keep_ids) if (s.id < id && byId.get(id)!.assigned_class !== s.assigned_class) keep++;
    }
    const stay = students.filter((s) => !s.is_pre_transfer);
    const countBy = (fn: (s: Student) => boolean) => names.map((cn) => stay.filter((s) => s.assigned_class === cn && fn(s)).length);
    const groupSpread = Math.max(0, ...groups.map((g) => spread(countBy((s) => g.member_ids.includes(s.id)))));
    const count = spread(countBy(() => true));
    const male = spread(countBy((s) => s.gender === 'M'));
    const female = spread(countBy((s) => s.gender === 'F'));
    const lists = names.map((cn) => stay.filter((s) => s.assigned_class === cn));
    const score = spread(lists.map((l) => l.reduce((a, s) => a + s.academic_score, 0) / Math.max(l.length, 1)));

    const bandDiffs: number[] = [];
    for (const g of ['M', 'F'] as const) {
        const sorted = stay.filter((s) => s.gender === g).sort((a, b) => b.academic_score - a.academic_score);
        for (let b = 0; b < 4; b++) {
            const part = sorted.slice(Math.floor((sorted.length * b) / 4), Math.floor((sorted.length * (b + 1)) / 4));
            bandDiffs.push(spread(names.map((cn) => part.filter((s) => s.assigned_class === cn).length)));
        }
    }

    const previous = [...new Set(stay.map((s) => s.prev_info.split('-')[1]))];
    const previousDiffs = previous.map((pc) => spread(names.map((cn) => stay.filter((s) => s.assigned_class === cn && s.prev_info.split('-')[1] === pc).length)));
    const leaders = countBy((s) => s.behavior_type === 'LEADER');

    return {
        fixed,
        avoid,
        keep,
        groupSpread,
        count,
        male,
        female,
        score,
        bandAvg: bandDiffs.reduce((a, b) => a + b, 0) / bandDiffs.length,
        bandMax: Math.max(...bandDiffs),
        minus3: spread(countBy((s) => s.behavior_score === -3)),
        minus2: spread(countBy((s) => s.behavior_score === -2)),
        minus1: spread(countBy((s) => s.behavior_score === -1)),
        leader: spread(leaders),
        noLeader: leaders.filter((v) => v === 0).length,
        previousAvg: previousDiffs.reduce((a, b) => a + b, 0) / Math.max(previousDiffs.length, 1),
        previousMax: Math.max(0, ...previousDiffs),
        transferMax: Math.max(...names.map((cn) => students.filter((s) => s.assigned_class === cn && s.is_pre_transfer).length)),
        unassigned: students.filter((s) => !names.includes(s.assigned_class as string)).length,
        allKept: fixed === 0 && avoid === 0 && keep === 0 && groupSpread <= 1 && count <= 1 && male <= 1 && female <= 1,
    };
}

// 담당 선생님이 남녀 각각 성적 뱀 모양으로만 나눈 가배정입니다. 조건은 모릅니다.
export function snakeTentative(s: Scenario, seed: number): Student[] {
    const r = seeded(seed);
    const order = s.names.map((_, c) => c).sort(() => r() - 0.5);
    const out = new Map<string, string>();
    for (const g of ['M', 'F'] as const) {
        let c = 0;
        let dir = 1;
        for (const st of s.students.filter((x) => x.gender === g).sort((a, b) => b.academic_score - a.academic_score)) {
            out.set(st.id, s.names[order[c]]);
            c += dir;
            if (c >= order.length) {
                c = order.length - 1;
                dir = -1;
            } else if (c < 0) {
                c = 0;
                dir = 1;
            }
        }
    }
    return s.students.map((st) => ({ ...st, assigned_class: out.get(st.id) }));
}
