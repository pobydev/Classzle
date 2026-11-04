import type { CustomGroup, NumberingMethod, Student } from '@/types';
import { resolveClassIndex } from '@/lib/assignment/problem';

export const UNASSIGNED = '미배정';

const compareNames = new Intl.Collator('ko').compare;

// 생활지도 색 단계입니다(globals.css의 --guidance-*). b는 행동, e는 정서, l은 리더이고 숫자가 클수록 진합니다.
export type GuidanceTone = 'b1' | 'b2' | 'b3' | 'e1' | 'e2' | 'e3' | 'l1' | 'l2';
export type MarkTone = GuidanceTone | 'plain';

// 바탕과 글자를 함께 칠합니다. 1단계 버튼, 보드 칸과 배지, 반 머리, 안내 창이 같은 값을 씁니다.
export const TONE_CLASS: Record<GuidanceTone, string> = {
    b1: 'bg-guidance-b1 text-guidance-b1-ink',
    b2: 'bg-guidance-b2 text-guidance-b2-ink',
    b3: 'bg-guidance-b3 text-guidance-b3-ink',
    e1: 'bg-guidance-e1 text-guidance-e1-ink',
    e2: 'bg-guidance-e2 text-guidance-e2-ink',
    e3: 'bg-guidance-e3 text-guidance-e3-ink',
    l1: 'bg-guidance-l1 text-guidance-l1-ink',
    l2: 'bg-guidance-l2 text-guidance-l2-ink',
};

// 흰 글자를 쓰는 진한 단계입니다(-3, 리+2).
export const isDarkTone = (tone: GuidanceTone | null | undefined) => tone === 'b3' || tone === 'e3' || tone === 'l2';

export function guidanceTone(student: Pick<Student, 'behavior_type' | 'behavior_score'>): GuidanceTone | null {
    const { behavior_type: type, behavior_score: score } = student;
    if (type === 'LEADER') return score >= 2 ? 'l2' : score >= 1 ? 'l1' : null;
    if (type !== 'BEHAVIOR' && type !== 'EMOTIONAL' || score >= 0) return null;
    const level = Math.min(3, -score) as 1 | 2 | 3;
    return `${type === 'BEHAVIOR' ? 'b' : 'e'}${level}` as GuidanceTone;
}

export interface BehaviorMark {
    text: string;
    label: string;
    tone: MarkTone;
}

const signed = (score: number) => (score > 0 ? `+${score}` : String(score));

// 칩에 쓰는 생활지도 표시입니다. 유형과 등급을 글자로 적어 색만으로 구분하지 않습니다.
export function behaviorMark(student: Pick<Student, 'behavior_type' | 'behavior_score'>): BehaviorMark | null {
    const { behavior_type: type, behavior_score: score } = student;
    if (type === 'NONE' || !score) return null;
    const value = signed(score);
    const tone: MarkTone = guidanceTone(student) ?? 'plain';
    if (type === 'LEADER') return { text: `리${value}`, label: `리더 ${value}`, tone };
    return type === 'BEHAVIOR'
        ? { text: `행${value}`, label: `행동 ${value}`, tone }
        : { text: `정${value}`, label: `정서 ${value}`, tone };
}

export function groupsOf(student: Student, groups: CustomGroup[]): CustomGroup[] {
    return groups.filter((g) => student.group_ids.includes(g.id) || g.member_ids.includes(student.id));
}

export interface RelationIndex {
    avoid: Map<string, string[]>;
    keep: Map<string, string[]>;
}

// 배정 코드처럼 한쪽에만 적혀 있어도 양쪽 관계로 봅니다. 지워진 학생은 건너뜁니다.
export function buildRelations(students: Student[]): RelationIndex {
    const known = new Set(students.map((s) => s.id));
    const collect = (idsOf: (s: Student) => string[] | undefined) => {
        const sets = new Map<string, Set<string>>();
        const add = (a: string, b: string) => {
            const set = sets.get(a);
            if (set) set.add(b);
            else sets.set(a, new Set([b]));
        };
        for (const s of students) {
            for (const other of idsOf(s) ?? []) {
                if (other === s.id || !known.has(other)) continue;
                add(s.id, other);
                add(other, s.id);
            }
        }
        const result = new Map<string, string[]>();
        sets.forEach((set, id) => result.set(id, [...set]));
        return result;
    };
    return { avoid: collect((s) => s.avoid_ids), keep: collect((s) => s.keep_ids) };
}

// 사유는 양쪽에 적히기도 하고 한쪽에만 적히기도 합니다.
export function relationMemo(kind: 'avoid' | 'keep', a: Student, b: Student): string | undefined {
    const key = kind === 'avoid' ? 'avoid_memos' : 'keep_memos';
    return a[key]?.[b.id] || b[key]?.[a.id] || undefined;
}

// 출석번호 순서와 같게 정렬합니다. 남녀를 나누면 성별 안에서, 섞으면 반 전체에서 전출 예정 학생이 뒤입니다.
export function sortForClass(list: Student[], method: NumberingMethod): Student[] {
    return [...list].sort((a, b) => {
        if (method !== 'mixed' && a.gender !== b.gender) {
            const first = method === 'maleFirst' ? 'M' : 'F';
            return a.gender === first ? -1 : 1;
        }
        const preA = a.is_pre_transfer ? 1 : 0;
        const preB = b.is_pre_transfer ? 1 : 0;
        if (preA !== preB) return preA - preB;
        return compareNames(a.name, b.name);
    });
}

// 없는 반에 있는 학생도 화면에서 사라지지 않게 미배정에 넣습니다. 조건 검사도 미배정으로 셉니다.
export function groupStudentsByClass(
    students: Student[],
    classNames: string[],
    method: NumberingMethod,
): Record<string, Student[]> {
    const lists: Student[][] = classNames.map(() => []);
    const unassigned: Student[] = [];
    for (const s of students) {
        const index = resolveClassIndex(s.assigned_class, classNames);
        if (index >= 0) lists[index].push(s);
        else unassigned.push(s);
    }
    const result: Record<string, Student[]> = {};
    classNames.forEach((name, i) => {
        result[name] = sortForClass(lists[i], method);
    });
    result[UNASSIGNED] = [...unassigned].sort((a, b) => compareNames(a.name, b.name));
    return result;
}

export function matchesQuery(student: Student, query: string): boolean {
    return query.length > 0 && student.name.includes(query);
}
