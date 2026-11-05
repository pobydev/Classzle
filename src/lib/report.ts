// 배정 결과 보고서의 내용입니다. 창(AssignmentReportDialog)과 인쇄물(reportHtml.ts)이 같은 값을 씁니다.
// 참고자료이고 결재란은 없습니다. 반별 학생 명단은 넣지 않습니다(명단은 배정 결과 엑셀로 받습니다).

import { calculateBalanceTable, type BalanceTable } from './balanceTable';
import { groupHistory, summarizeStudentChanges, type StudentChangeSummary } from './history';
import { isStaying, makeClassNames, resolveClassIndex, sameClass } from './assignment/problem';
import { collectViolations } from './assignment/violations';
import type { AssignmentChange, CustomGroup, Student, Violation } from '@/types';

// 인원, 남녀, 그룹, 전출 예정은 반별 차이 1명까지 지킨 것으로 봅니다(배정 코드와 같은 기준).
const SPREAD_LIMIT = 1;

export type ConditionKey = 'fixed' | 'avoid' | 'keep' | 'group' | 'count' | 'gender' | 'transfer';

export interface ConditionSummary {
    key: ConditionKey;
    label: string;
    // 'none'은 정한 조건이 없음입니다.
    status: 'none' | 'kept' | 'broken';
    // 예: '3 / 4쌍 지킴', '반별 차이 1명'
    detail: string;
}

export interface ReportStudent {
    name: string;
    className: string;
    // 전학년도 반. 예: '전학년도 2-12'. 같은 이름 학생을 구분할 때 씁니다.
    previous: string;
}

export interface PairRow {
    kind: 'avoid' | 'keep';
    a: ReportStudent;
    b: ReportStudent;
    kept: boolean;
}

export interface FixedRow {
    student: ReportStudent;
    target: string;
    kept: boolean;
}

export interface GroupRow {
    name: string;
    kept: boolean;
    // 반 순서대로 그 반에 간 그룹 학생입니다. 학생이 없는 반도 들어갑니다.
    classes: { className: string; names: string[] }[];
}

export interface HistoryRow {
    timestamp: number;
    source: 'auto' | 'manual';
    // 손으로 바꾼 것은 학생마다 한 줄, 자동 수정 한 번은 '자동 배정 1회'처럼 한 줄입니다.
    lines: string[];
}

export interface ReportModel {
    meta: {
        workName: string | null;
        assignedAt: number | null;
        classCount: number;
        totalBefore: number;
        totalAfter: number;
        maleAfter: number;
        femaleAfter: number;
        transferCount: number;
    };
    balance: BalanceTable;
    conditions: ConditionSummary[];
    manualChangeCount: number;
    // 이름 확인표
    unmet: Violation[];
    pairs: PairRow[];
    fixed: FixedRow[];
    groups: GroupRow[];
    transfers: ReportStudent[];
    movements: StudentChangeSummary[];
    history: HistoryRow[];
}

export function previousLabel(student: Pick<Student, 'prev_info'>): string {
    const [grade, classNum] = String(student.prev_info ?? '').split('-').map((part) => (part === 'undefined' ? '' : part.trim()));
    if (!grade || !classNum) return '';
    return `전학년도 ${grade}-${classNum}`;
}

const reportStudent = (s: Student): ReportStudent => ({
    name: s.name,
    className: s.assigned_class || '미배정',
    previous: previousLabel(s),
});

function spread(counts: number[]): number {
    return counts.length === 0 ? 0 : Math.max(...counts) - Math.min(...counts);
}

export function buildReport({
    students,
    groups,
    classCount,
    history,
    workName = null,
    assignedAt = null,
}: {
    students: Student[];
    groups: CustomGroup[];
    classCount: number;
    history: AssignmentChange[];
    workName?: string | null;
    assignedAt?: number | null;
}): ReportModel {
    const classNames = makeClassNames(classCount);
    const byId = new Map(students.map((s) => [s.id, s]));
    const staying = students.filter(isStaying);
    const placedIn = (s: Student) => resolveClassIndex(s.assigned_class, classNames);
    const countsBy = (list: Student[]) => classNames.map((_, i) => list.filter((s) => placedIn(s) === i).length);

    // 분리 배정과 함께 배정은 조건마다 따로 셉니다. 같은 두 학생이 두 조건에 모두 있어도 각각 한 번씩입니다.
    const pairs: PairRow[] = [];
    for (const kind of ['avoid', 'keep'] as const) {
        const seen = new Set<string>();
        for (const s of students) {
            for (const otherId of kind === 'avoid' ? s.avoid_ids : s.keep_ids) {
                const other = byId.get(otherId);
                if (!other || other.id === s.id) continue;
                const key = [s.id, other.id].sort().join('|');
                if (seen.has(key)) continue;
                seen.add(key);
                const together = sameClass(s.assigned_class, other.assigned_class);
                const bothPlaced = placedIn(s) >= 0 && placedIn(other) >= 0;
                const kept = kind === 'avoid' ? bothPlaced && !together : together;
                pairs.push({ kind, a: reportStudent(s), b: reportStudent(other), kept });
            }
        }
    }
    // 못 지킨 쌍을 위에, 그다음 분리 배정, 함께 배정 순서입니다.
    pairs.sort((x, y) => Number(x.kept) - Number(y.kept) || (x.kind === y.kind ? 0 : x.kind === 'avoid' ? -1 : 1) || x.a.name.localeCompare(y.a.name, 'ko'));

    const fixed: FixedRow[] = students
        .filter((s) => s.fixed_class)
        .map((s) => ({ student: reportStudent(s), target: s.fixed_class!, kept: sameClass(s.assigned_class, s.fixed_class) }))
        .sort((x, y) => Number(x.kept) - Number(y.kept) || x.target.localeCompare(y.target, 'ko', { numeric: true }));

    const groupRows: GroupRow[] = groups.map((g) => {
        const members = students.filter((s) => g.member_ids.includes(s.id) || s.group_ids.includes(g.id));
        const stayingMembers = members.filter(isStaying);
        return {
            name: g.name,
            kept: spread(countsBy(stayingMembers)) <= SPREAD_LIMIT,
            classes: classNames.map((className, i) => ({
                className,
                names: members.filter((s) => placedIn(s) === i).map((s) => s.name).sort((a, b) => a.localeCompare(b, 'ko')),
            })),
        };
    });

    const transferStudents = students.filter((s) => !isStaying(s));
    const transfers = transferStudents.map(reportStudent).sort((x, y) => x.className.localeCompare(y.className, 'ko', { numeric: true }));

    const countGap = spread(countsBy(staying));
    const maleGap = spread(countsBy(staying.filter((s) => s.gender === 'M')));
    const femaleGap = spread(countsBy(staying.filter((s) => s.gender === 'F')));
    const transferGap = spread(countsBy(transferStudents));

    const pairSummary = (kind: 'avoid' | 'keep', label: string): ConditionSummary => {
        const list = pairs.filter((p) => p.kind === kind);
        const kept = list.filter((p) => p.kept).length;
        return list.length === 0
            ? { key: kind, label, status: 'none', detail: '없음' }
            : { key: kind, label, status: kept === list.length ? 'kept' : 'broken', detail: `${kept} / ${list.length}쌍 지킴` };
    };
    const keptFixed = fixed.filter((f) => f.kept).length;
    const keptGroups = groupRows.filter((g) => g.kept).length;
    const conditions: ConditionSummary[] = [
        fixed.length === 0
            ? { key: 'fixed', label: '고정 배정', status: 'none', detail: '없음' }
            : { key: 'fixed', label: '고정 배정', status: keptFixed === fixed.length ? 'kept' : 'broken', detail: `${keptFixed} / ${fixed.length}명 지킴` },
        pairSummary('avoid', '분리 배정'),
        pairSummary('keep', '함께 배정'),
        groupRows.length === 0
            ? { key: 'group', label: '그룹 분산', status: 'none', detail: '없음' }
            : { key: 'group', label: '그룹 분산', status: keptGroups === groupRows.length ? 'kept' : 'broken', detail: `${keptGroups} / ${groupRows.length}개 그룹 지킴 (반별 차이 1명까지)` },
        { key: 'count', label: '인원', status: countGap <= SPREAD_LIMIT ? 'kept' : 'broken', detail: `전출 뒤 반별 차이 ${countGap}명 (1명까지)` },
        {
            key: 'gender',
            label: '남녀',
            status: maleGap <= SPREAD_LIMIT && femaleGap <= SPREAD_LIMIT ? 'kept' : 'broken',
            detail: `전출 뒤 남 차이 ${maleGap}명, 여 차이 ${femaleGap}명 (1명까지)`,
        },
        transferStudents.length === 0
            ? { key: 'transfer', label: '전출 예정', status: 'none', detail: '없음' }
            : {
                key: 'transfer',
                label: '전출 예정',
                status: transferGap <= SPREAD_LIMIT ? 'kept' : 'broken',
                detail: `${transferStudents.length}명, 반별 차이 ${transferGap}명 (1명까지)`,
            },
    ];

    const entries = groupHistory(history);
    const historyRows: HistoryRow[] = entries.map((entry) => {
        if (entry.source === 'auto') {
            const moved = entry.changes.reduce((sum, c) => sum + (c.type === 'swap' ? 2 : 1), 0);
            return { timestamp: entry.timestamp, source: 'auto', lines: [`자동 배정 1회 · ${moved}명 옮김`] };
        }
        return {
            timestamp: entry.timestamp,
            source: 'manual',
            lines: entry.changes.flatMap((c) => c.type === 'swap'
                ? [`${c.studentName} ${c.oldClass ?? '미배정'} → ${c.newClass ?? '미배정'}`, `${c.partnerName ?? ''} ${c.newClass ?? '미배정'} → ${c.oldClass ?? '미배정'}`]
                : [`${c.studentName} ${c.oldClass ?? '미배정'} → ${c.newClass ?? '미배정'}`]),
        };
    });

    return {
        meta: {
            workName,
            assignedAt,
            classCount,
            totalBefore: students.length,
            totalAfter: staying.length,
            maleAfter: staying.filter((s) => s.gender === 'M').length,
            femaleAfter: staying.filter((s) => s.gender === 'F').length,
            transferCount: transferStudents.length,
        },
        balance: calculateBalanceTable(students, classCount, groups),
        conditions,
        manualChangeCount: entries.filter((e) => e.source === 'manual').length,
        unmet: collectViolations(students, classCount, groups),
        pairs,
        fixed,
        groups: groupRows,
        transfers,
        movements: summarizeStudentChanges(history, students).filter((m) => !m.returned),
        history: historyRows,
    };
}

// '12월 10일 오전 10:00'처럼 씁니다. 화면 이력과 같은 꼴입니다.
export function formatReportTime(timestamp: number): string {
    return new Date(timestamp).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function formatReportDate(timestamp: number): string {
    return new Date(timestamp).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

export const PRIVACY_NOTICE = '학생 개인정보가 들어 있습니다. 보관과 파기에 주의해 주세요.';
export const REPORT_TITLE = '배정 결과 보고서';
