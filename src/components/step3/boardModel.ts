import type { CustomGroup, NumberingMethod, Student } from '@/types';
import { resolveClassIndex } from '@/lib/assignment/problem';

export const UNASSIGNED = '미배정';

const compareNames = new Intl.Collator('ko').compare;

export type MarkTone = 'level3' | 'level2' | 'level1' | 'leader' | 'plain';

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
    if (type === 'LEADER') return { text: `리${value}`, label: `리더 ${value}`, tone: 'leader' };
    const tone: MarkTone = score <= -3 ? 'level3' : score === -2 ? 'level2' : 'level1';
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

// 출석번호 순서와 같게 정렬합니다. 전출 예정 학생은 맨 뒤입니다.
export function sortForClass(list: Student[], method: NumberingMethod): Student[] {
    return [...list].sort((a, b) => {
        const preA = a.is_pre_transfer ? 1 : 0;
        const preB = b.is_pre_transfer ? 1 : 0;
        if (preA !== preB) return preA - preB;
        if (method !== 'mixed' && a.gender !== b.gender) {
            const first = method === 'maleFirst' ? 'M' : 'F';
            return a.gender === first ? -1 : 1;
        }
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
