import { describe, it } from 'vitest';
import { assignStudents, type AssignmentMode } from '@/lib/assignment';
import { BENCH_SCENARIOS, countTypeLevels, makeScenario, measure, snakeTentative, TYPE_LEVELS, type Measure } from '../helpers/problem';

// 평소 시험에서는 돌지 않습니다. 재려면 BENCH=1 npx vitest run tests/bench 로 실행합니다.
const runs = Number(process.env.BENCH || 0);
const avg = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
const f1 = (x: number) => Math.round(x * 10) / 10;
const f2 = (x: number) => Math.round(x * 100) / 100;
const pair = (values: number[]) => `${f2(avg(values))}/${Math.max(...values)}`;

function row(label: string, list: (Measure & { moved?: number; ms?: number })[]) {
    return {
        방식: label,
        모두지킴: `${list.filter((m) => m.allKept).length}/${list.length}`,
        옮긴학생: f1(avg(list.map((m) => m.moved ?? 0))),
        고정: f1(avg(list.map((m) => m.fixed))),
        떼기: f1(avg(list.map((m) => m.avoid))),
        함께: f1(avg(list.map((m) => m.keep))),
        그룹최대: Math.max(...list.map((m) => m.groupSpread)),
        인원: f1(avg(list.map((m) => m.count))),
        남: f1(avg(list.map((m) => m.male))),
        여: f1(avg(list.map((m) => m.female))),
        평균차: f2(avg(list.map((m) => m.score))),
        구간평균: f2(avg(list.map((m) => m.bandAvg))),
        구간최대: Math.max(...list.map((m) => m.bandMax)),
        '-3차': pair(list.map((m) => m.minus3)),
        '-2차': pair(list.map((m) => m.minus2)),
        '-1차': pair(list.map((m) => m.minus1)),
        ...Object.fromEntries(TYPE_LEVELS.map(([key]) => [key, pair(list.map((m) => m.typeLevel[key]))])),
        행동합: pair(list.map((m) => m.behaviorTotal)),
        정서합: pair(list.map((m) => m.emotionalTotal)),
        합계차: pair(list.map((m) => m.guidanceTotal)),
        음수합차: pair(list.map((m) => m.negativeSum)),
        리더차: f1(avg(list.map((m) => m.leader))),
        리더없는반: f1(avg(list.map((m) => m.noLeader))),
        이전반: `${f1(avg(list.map((m) => m.previousAvg)))}/${Math.max(...list.map((m) => m.previousMax))}`,
        전출최대: Math.max(...list.map((m) => m.transferMax)),
        초: f2(avg(list.map((m) => m.ms ?? 0)) / 1000),
    };
}

describe.skipIf(!runs)('배정 측정', () => {
    it('세 문제를 잽니다', () => {
        for (const [name, cfg] of Object.entries(BENCH_SCENARIOS)) {
            const fresh: (Measure & { moved?: number; ms?: number })[] = [];
            const repair: (Measure & { moved?: number; ms?: number })[] = [];
            const balance: (Measure & { moved?: number; ms?: number })[] = [];
            const good: (Measure & { moved?: number; ms?: number })[] = [];
            const timed = (students: Parameters<typeof assignStudents>[0], mode: AssignmentMode, seed: number, groups: Parameters<typeof assignStudents>[2], names: string[]) => {
                const t0 = Date.now();
                const result = assignStudents(students, cfg.classes, groups, { mode, seed });
                return { ...measure(result.students, groups, names), moved: result.moved, ms: Date.now() - t0 };
            };
            for (let i = 0; i < runs; i++) {
                const p = makeScenario(cfg, 1000 + i * 7);
                fresh.push(timed(p.students, 'new', 5000 + i, p.groups, p.names));
                const tentative = snakeTentative(p, 7000 + i);
                repair.push(timed(tentative, 'optimize', 5000 + i, p.groups, p.names));
                balance.push(timed(tentative, 'balance', 5000 + i, p.groups, p.names));
                const solved = p.students.map((s) => ({ ...s, assigned_class: p.hidden.get(s.id) }));
                good.push(timed(solved, 'optimize', 6000 + i, p.groups, p.names));
            }
            const sizes = Array.from({ length: runs }, (_, i) => countTypeLevels(makeScenario(cfg, 1000 + i * 7).students));
            console.log(name);
            console.log(JSON.stringify(Object.fromEntries(TYPE_LEVELS.map(([key]) => [key, f1(avg(sizes.map((v) => v[key])))]))));
            console.log(JSON.stringify(row('신규', fresh)));
            console.log(JSON.stringify(row('가배정 수정', repair)));
            console.log(JSON.stringify(row('가배정 균형', balance)));
            console.log(JSON.stringify(row('조건 지킨 배정 수정', good)));
        }
    });
});
