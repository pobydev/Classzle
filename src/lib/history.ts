import type { AssignmentChange, Student } from '@/types';

export interface HistoryEntry {
    key: string;
    source: 'auto' | 'manual';
    timestamp: number;
    changes: AssignmentChange[];
}

export interface StudentChangeSummary {
    id: string;
    name: string;
    firstClass: string | null;
    currentClass: string | null;
    moveCount: number;
    // 옮겼다가 처음 반으로 돌아온 학생입니다.
    returned: boolean;
}

// 예전 저장 파일에는 묶음 표시가 없어서 2초 안에 이어진 자동 변경을 한 번으로 봅니다.
const OLD_FILE_GAP_MS = 2000;

/**
 * 변경 기록을 화면에 보여 줄 줄로 묶습니다. 자동 수정 한 번은 한 줄입니다.
 */
export function groupHistory(history: AssignmentChange[]): HistoryEntry[] {
    const entries: HistoryEntry[] = [];
    history.forEach((change, index) => {
        const source = change.source === 'auto' ? 'auto' : 'manual';
        const last = entries[entries.length - 1];
        const lastChange = last?.changes[last.changes.length - 1];
        const sameRun =
            source === 'auto' &&
            last?.source === 'auto' &&
            lastChange !== undefined &&
            (change.batchId !== undefined || lastChange.batchId !== undefined
                ? change.batchId === lastChange.batchId
                : change.timestamp - lastChange.timestamp <= OLD_FILE_GAP_MS);
        if (sameRun) {
            last.changes.push(change);
        } else {
            entries.push({ key: `${index}-${change.timestamp}`, source, timestamp: change.timestamp, changes: [change] });
        }
    });
    return entries;
}

/**
 * 학생별로 처음 반과 지금 반을 정리합니다. 이력에 나오는 학생만 돌려줍니다.
 */
export function summarizeStudentChanges(history: AssignmentChange[], students: Student[]): StudentChangeSummary[] {
    const first = new Map<string, string | null>();
    const counts = new Map<string, number>();
    const note = (id: string, oldClass: string | null) => {
        if (!first.has(id)) first.set(id, oldClass);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    };
    history.forEach((change) => {
        note(change.studentId, change.oldClass);
        if (change.type === 'swap' && change.partnerId) note(change.partnerId, change.newClass);
    });

    const summaries: StudentChangeSummary[] = [];
    students.forEach((s) => {
        if (!first.has(s.id)) return;
        const firstClass = first.get(s.id) ?? null;
        const currentClass = s.assigned_class ?? null;
        summaries.push({
            id: s.id,
            name: s.name,
            firstClass,
            currentClass,
            moveCount: counts.get(s.id) ?? 0,
            returned: firstClass === currentClass,
        });
    });
    return summaries.sort(
        (a, b) =>
            (a.firstClass ?? '').localeCompare(b.firstClass ?? '', 'ko', { numeric: true }) ||
            a.name.localeCompare(b.name, 'ko'),
    );
}

export function changeMentions(change: AssignmentChange, keyword: string): boolean {
    return change.studentName.includes(keyword) || (change.partnerName ?? '').includes(keyword);
}
