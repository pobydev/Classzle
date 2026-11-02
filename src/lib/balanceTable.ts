import type { CustomGroup, Student } from '@/types';
import { compileProblem, isStaying, makeClassNames, previousClassOf, resolveClassIndex, type Weights } from './assignment/problem';
import { calculateClassStats } from './stats';

// 대부분의 반이 모인 범위에서 벗어난 칸 중 어느 쪽을 표시하는지입니다.
// 'outside'는 양쪽, 'above'는 많은 쪽만(몰림이 문제인 생활지도), 'none'은 표시하지 않습니다.
export type FlagMode = 'outside' | 'above' | 'none';

export interface BalanceColumn {
    key: string;
    label: string;
    // 두 줄 머리글의 윗줄입니다. 없으면 한 칸으로 합칩니다.
    section?: '행동' | '정서' | '그룹 분산';
    // 반별 차이가 이 값을 넘으면 표시합니다.
    limit: number | null;
    flag: FlagMode;
    // 머리글에 마우스를 올리면 보이는 설명입니다.
    title?: string;
}

export interface BalanceCell {
    value: number;
    flagged: boolean;
}

export interface BalanceRow {
    className: string;
    cells: Record<string, BalanceCell>;
    transferMale: number;
    transferFemale: number;
}

export interface BalanceTable {
    columns: BalanceColumn[];
    // 차이 줄입니다. 평균은 소수점이 있습니다.
    difference: Record<string, BalanceCell>;
    rows: BalanceRow[];
}

/**
 * 차이와 표시할 칸을 정합니다. values는 반 순서대로 들어옵니다.
 * 차이가 기준을 넘으면, 너비가 기준(limit)인 범위 중 반이 가장 많이 들어가는 범위를 찾아 거기서 벗어난 칸만 표시합니다.
 * 한 반만 어긋났을 때 그 반만 표시하기 위해서입니다. 범위가 여럿이면 낮은 쪽을 고릅니다.
 */
export function flagColumn(values: number[], limit: number | null, flag: FlagMode): { difference: BalanceCell; cells: BalanceCell[] } {
    if (values.length === 0) return { difference: { value: 0, flagged: false }, cells: [] };
    const difference = Math.max(...values) - Math.min(...values);
    if (limit === null || flag === 'none' || difference <= limit) {
        return {
            difference: { value: difference, flagged: false },
            cells: values.map((value) => ({ value, flagged: false })),
        };
    }

    // 범위의 아래 끝을 실제 값으로만 대 봐도 넣을 수 있는 묶음은 모두 나옵니다.
    let low = 0;
    let most = -1;
    for (const candidate of [...new Set(values)].sort((a, b) => a - b)) {
        const inside = values.filter((value) => value >= candidate && value <= candidate + limit).length;
        if (inside > most) {
            most = inside;
            low = candidate;
        }
    }
    const high = low + limit;
    return {
        difference: { value: difference, flagged: true },
        cells: values.map((value) => ({
            value,
            flagged: value > high || (flag === 'outside' && value < low),
        })),
    };
}

const COUNT_LIMIT = 1;
const LEVEL_LIMIT = 1;
const TOTAL_LIMIT = 2;

export const MINUS_TOTAL_TITLE = '어려운 학생의 점수만 더한 값입니다.';
export const PLUS_TOTAL_TITLE = '리더의 점수만 더한 값입니다.';
export const TOTAL_TITLE = '어려운 학생과 리더의 생활지도 점수를 모두 더한 값입니다.';

export function calculateBalanceTable(students: Student[], classCount: number, groups: CustomGroup[] = []): BalanceTable {
    const classNames = makeClassNames(classCount);
    // 전출 예정 학생을 뺀 명단으로 같은 통계 코드를 돌립니다. 모든 값이 전출 뒤 기준이 됩니다.
    const staying = students.filter(isStaying);
    const stats = calculateClassStats(staying, classNames, groups);
    const withTransfer = calculateClassStats(students, classNames, groups);

    type Stat = (typeof stats)[number];
    const specs: (BalanceColumn & { read: (stat: Stat) => number; flagBy?: (stat: Stat) => number })[] = [
        { key: 'count', label: '인원', limit: COUNT_LIMIT, flag: 'outside', read: (s) => s.studentCount },
        { key: 'male', label: '남', limit: COUNT_LIMIT, flag: 'outside', read: (s) => s.maleCount },
        { key: 'female', label: '여', limit: COUNT_LIMIT, flag: 'outside', read: (s) => s.femaleCount },
        { key: 'average', label: '평균', limit: null, flag: 'none', read: (s) => s.averageScore },
        { key: 'behavior3', label: '-3', section: '행동', limit: LEVEL_LIMIT, flag: 'above', read: (s) => s.behaviorPlus3 },
        { key: 'behavior2', label: '-2', section: '행동', limit: LEVEL_LIMIT, flag: 'above', read: (s) => s.behaviorPlus2 },
        // -1은 합계를 맞추느라 차이가 벌어질 수 있어 숫자만 보여 줍니다.
        { key: 'behavior1', label: '-1', section: '행동', limit: null, flag: 'none', read: (s) => s.behaviorPlus1 },
        { key: 'emotional3', label: '-3', section: '정서', limit: LEVEL_LIMIT, flag: 'above', read: (s) => s.emotionalPlus3 },
        { key: 'emotional2', label: '-2', section: '정서', limit: LEVEL_LIMIT, flag: 'above', read: (s) => s.emotionalPlus2 },
        { key: 'emotional1', label: '-1', section: '정서', limit: null, flag: 'none', read: (s) => s.emotionalPlus1 },
        { key: 'leader', label: '리더', limit: LEVEL_LIMIT, flag: 'above', read: (s) => s.leaderCount },
        // -합계와 +합계는 합계 안을 나눠 보여 주는 숫자입니다. 표시는 합계에만 합니다.
        { key: 'minusTotal', label: '-합계', title: MINUS_TOTAL_TITLE, limit: null, flag: 'none', read: (s) => s.minusTotal },
        { key: 'plusTotal', label: '+합계', title: PLUS_TOTAL_TITLE, limit: null, flag: 'none', read: (s) => s.plusTotal },
        {
            key: 'guidanceTotal',
            label: '합계',
            title: TOTAL_TITLE,
            limit: TOTAL_LIMIT,
            flag: 'above',
            read: (s) => s.guidanceTotal,
            // 낮을수록 어려운 반이므로 부호를 바꿔 어려움이 큰 쪽을 표시합니다. 양수가 섞여도 같습니다.
            flagBy: (s) => -s.guidanceTotal,
        },
        ...groups.map((g) => ({
            key: `group:${g.id}`,
            label: g.name,
            section: '그룹 분산' as const,
            limit: COUNT_LIMIT,
            flag: 'outside' as const,
            read: (s: Stat) => s.groupCounts[g.id] ?? 0,
        })),
    ];

    const rows: BalanceRow[] = stats.map((stat, i) => ({
        className: stat.className,
        cells: {},
        transferMale: withTransfer[i].preTransferMaleCount,
        transferFemale: withTransfer[i].preTransferFemaleCount,
    }));
    const difference: Record<string, BalanceCell> = {};
    for (const spec of specs) {
        const { difference: diff, cells } = flagColumn(stats.map(spec.flagBy ?? spec.read), spec.limit, spec.flag);
        difference[spec.key] = diff;
        cells.forEach((cell, i) => {
            rows[i].cells[spec.key] = { ...cell, value: spec.read(stats[i]) };
        });
    }

    // 평균의 차이는 반올림 전 값으로 냅니다. 학생이 없는 반은 평균이 없으므로 뺍니다.
    const averages = stats.filter((stat) => stat.studentCount > 0).map((stat) => stat.exactAverageScore);
    difference.average = {
        value: averages.length ? Math.round((Math.max(...averages) - Math.min(...averages)) * 10) / 10 : 0,
        flagged: false,
    };

    return { columns: specs.map(({ key, label, section, limit, flag, title }) => ({ key, label, section, limit, flag, title })), difference, rows };
}

export const SCORE_BANDS = ['상', '중상', '중하', '하'] as const;
export type BandCounts = [number, number, number, number];

export interface ScoreBandRow {
    className: string;
    total: BandCounts;
    male: BandCounts;
    female: BandCounts;
}

export interface ScoreBandTable {
    rows: ScoreBandRow[];
    // 같은 성별의 한 구간에서 반별 인원 차이가 가장 큰 값입니다.
    largestDifference: number;
}

// 성적 구간 차이가 이 값을 넘으면 뱀 모양 배치가 흐트러진 것으로 봅니다.
export const BAND_DIFFERENCE_LIMIT = 2;

// 구간 항목만 켜고 나머지는 모두 끕니다. 나중에 항목이 늘어도 꺼진 채로 둡니다.
const BAND_ONLY_WEIGHTS = new Proxy({ band: 1 } as unknown as Weights, {
    get: (target, key) => (key in target ? target[key as keyof Weights] : 0),
});

/**
 * 반별 성적 구간 인원입니다. 구간은 배정 코드가 정한 그대로 씁니다(같은 성별, 전출 뒤, 성적순 4구간).
 * 구간은 성적이 높은 쪽부터 만들어집니다. 한 성별이 4명보다 적으면 빈 구간이 앞쪽에 생깁니다.
 */
export function calculateScoreBands(students: Student[], classCount: number, groups: CustomGroup[] = []): ScoreBandTable {
    const problem = compileProblem(students, classCount, groups, BAND_ONLY_WEIGHTS);
    const classNames = problem.classNames;

    const dimsByGender: [number[], number[]] = [[], []];
    const genderOfDim = new Map<number, number>();
    students.forEach((_, i) => {
        problem.dimsOf[i].forEach((dim) => {
            if (!genderOfDim.has(dim)) genderOfDim.set(dim, problem.gender[i]);
        });
    });
    [...genderOfDim.keys()].sort((a, b) => a - b).forEach((dim) => dimsByGender[genderOfDim.get(dim)!].push(dim));
    const bandOfDim = new Map<number, number>();
    dimsByGender.forEach((dims) => dims.forEach((dim, position) => bandOfDim.set(dim, SCORE_BANDS.length - dims.length + position)));

    const empty = (): BandCounts => [0, 0, 0, 0];
    const rows: ScoreBandRow[] = classNames.map((className) => ({ className, total: empty(), male: empty(), female: empty() }));
    students.forEach((student, i) => {
        const classIndex = resolveClassIndex(student.assigned_class, classNames);
        if (classIndex < 0) return;
        problem.dimsOf[i].forEach((dim) => {
            const band = bandOfDim.get(dim)!;
            rows[classIndex].total[band]++;
            rows[classIndex][student.gender === 'M' ? 'male' : 'female'][band]++;
        });
    });

    let largestDifference = 0;
    for (const side of ['male', 'female'] as const) {
        for (let band = 0; band < SCORE_BANDS.length; band++) {
            const counts = rows.map((row) => row[side][band]);
            if (counts.length) largestDifference = Math.max(largestDifference, Math.max(...counts) - Math.min(...counts));
        }
    }
    return { rows, largestDifference };
}

export interface PreviousClassMatrix {
    previousClasses: string[];
    rows: { className: string; counts: Record<string, number>; total: number }[];
    totals: Record<string, number>;
}

// 새 반과 전학년도 반의 인원표입니다. 전출 뒤 기준입니다. 비슷하면 되는 약한 조건이라 표에 표시는 하지 않습니다.
export function calculatePreviousClassMatrix(students: Student[], classCount: number): PreviousClassMatrix {
    const classNames = makeClassNames(classCount);
    const previousSet = new Set<string>();
    const rows = classNames.map((className) => ({ className, counts: {} as Record<string, number>, total: 0 }));
    const totals: Record<string, number> = {};
    for (const student of students) {
        if (!isStaying(student)) continue;
        const classIndex = resolveClassIndex(student.assigned_class, classNames);
        const previous = previousClassOf(student);
        if (classIndex < 0 || previous === null) continue;
        previousSet.add(previous);
        rows[classIndex].counts[previous] = (rows[classIndex].counts[previous] ?? 0) + 1;
        rows[classIndex].total++;
        totals[previous] = (totals[previous] ?? 0) + 1;
    }
    const previousClasses = [...previousSet].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }));
    return { previousClasses, rows, totals };
}
