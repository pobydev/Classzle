import { normalizeClassName } from '@/lib/assignment/problem';
import { BLANK_SCORE } from '@/lib/studentInput';
import type { AppSettings, AssignmentChange, BehaviorType, CustomGroup, Gender, Student } from '@/types';

export interface ProjectData {
    students: Student[];
    groups: CustomGroup[];
    settings: AppSettings;
    movementHistory?: AssignmentChange[];
}

export interface ParsedProject {
    data: ProjectData;
    // 고쳐서 넣은 값입니다. 교사에게 알립니다.
    notices: string[];
}

const MIN_CLASSES = 2;
const MAX_CLASSES = 20;
const DEFAULT_CLASSES = 4;

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isClassCount = (value: unknown) => Number.isInteger(value) && (value as number) >= MIN_CLASSES && (value as number) <= MAX_CLASSES;
const isMissing = (value: unknown) => value === undefined || value === null;

const stringsOf = (value: unknown[]) => value.filter((item): item is string => typeof item === 'string');

// 반 표기를 맞춥니다. 옛 파일의 "1 반"이 그대로 들어오지 않게 합니다.
function classNameOf(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    return normalizeClassName(String(value)) || null;
}

function scoreOf(value: unknown): number | null {
    if (isFiniteNumber(value)) return value;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
    return null;
}

interface StudentIssues {
    blankScore: string[];
    blankGender: string[];
}

function readStudent(raw: unknown, issues: StudentIssues): Student | null {
    if (!isObject(raw) || typeof raw.id !== 'string' || raw.id === '' || typeof raw.name !== 'string') return null;
    for (const key of ['group_ids', 'avoid_ids', 'keep_ids']) {
        if (!isMissing(raw[key]) && !Array.isArray(raw[key])) return null;
    }

    // v1.2.4는 결시 같은 글자를 NaN으로 읽었고 저장하면 null이 됩니다. 엑셀을 읽을 때와 같은 규칙으로 넣습니다.
    let score = scoreOf(raw.academic_score);
    if (score === null) {
        issues.blankScore.push(raw.name);
        score = BLANK_SCORE;
    }
    let gender = raw.gender as Gender;
    if (gender !== 'M' && gender !== 'F') {
        issues.blankGender.push(raw.name);
        gender = 'F';
    }
    const type = raw.behavior_type as BehaviorType;
    const knownType = type === 'LEADER' || type === 'BEHAVIOR' || type === 'EMOTIONAL';

    const student = {
        ...raw,
        // 1.2.4 파일은 번호 칸이 없던 학생을 '2-1-undefined'로 저장했습니다. 그 부분은 빈칸으로 둡니다.
        prev_info: String(raw.prev_info ?? '').split('-').map((part) => (part === 'undefined' ? '' : part)).join('-'),
        gender,
        academic_score: score,
        behavior_type: knownType ? type : 'NONE',
        behavior_score: knownType && isFiniteNumber(raw.behavior_score) ? raw.behavior_score : 0,
        group_ids: stringsOf((raw.group_ids as unknown[]) ?? []),
        avoid_ids: stringsOf((raw.avoid_ids as unknown[]) ?? []),
        keep_ids: stringsOf((raw.keep_ids as unknown[]) ?? []),
        assigned_class: classNameOf(raw.assigned_class),
        fixed_class: classNameOf(raw.fixed_class) ?? undefined,
    } as unknown as Student;
    if (!isObject(student.avoid_memos)) delete student.avoid_memos;
    if (!isObject(student.keep_memos)) delete student.keep_memos;
    return student;
}

function readGroup(raw: unknown): CustomGroup | null {
    if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.name !== 'string' || !Array.isArray(raw.member_ids)) return null;
    return { ...raw, color: typeof raw.color === 'string' ? raw.color : '', member_ids: stringsOf(raw.member_ids) } as CustomGroup;
}

function readChange(raw: unknown): AssignmentChange | null {
    if (!isObject(raw) || typeof raw.studentId !== 'string') return null;
    const isClass = (value: unknown) => isMissing(value) || typeof value === 'string';
    if (!isClass(raw.oldClass) || !isClass(raw.newClass)) return null;
    return {
        ...raw,
        studentName: String(raw.studentName ?? ''),
        oldClass: classNameOf(raw.oldClass),
        newClass: classNameOf(raw.newClass),
        timestamp: isFiniteNumber(raw.timestamp) ? raw.timestamp : 0,
    } as unknown as AssignmentChange;
}

function readSettings(raw: unknown, students: Student[]): AppSettings {
    const value = isObject(raw) ? raw : {};
    const method = value.numberingMethod;
    return {
        classCount: isClassCount(value.classCount) ? (value.classCount as number) : classCountFrom(students),
        scoreTolerance: isFiniteNumber(value.scoreTolerance) ? value.scoreTolerance : 50,
        numberingMethod: method === 'maleFirst' || method === 'femaleFirst' ? method : 'mixed',
        useAdvancedConstraints: typeof value.useAdvancedConstraints === 'boolean' ? value.useAdvancedConstraints : true,
        // 옛 파일에는 없습니다. 없으면 보고서에 '기록 없음'으로 씁니다.
        ...(isFiniteNumber(value.assignedAt) ? { assignedAt: value.assignedAt } : {}),
    };
}

// 저장소의 학급 수가 잘못됐을 때 배정된 반에서 찾습니다.
function classCountFrom(students: Student[]): number {
    const numbers = students.map((s) => parseInt(String(s.assigned_class ?? ''))).filter(Number.isFinite);
    const largest = numbers.length > 0 ? Math.max(...numbers) : 0;
    return largest >= MIN_CLASSES && largest <= MAX_CLASSES ? largest : DEFAULT_CLASSES;
}

interface ReadResult extends ParsedProject {
    // 고칠 수 없어 뺀 값입니다. 파일이면 읽지 않고, 저장소면 뺀 뒤 알립니다.
    broken: string[];
}

function readProject(value: Record<string, unknown>): ReadResult {
    const broken: string[] = [];
    const issues: StudentIssues = { blankScore: [], blankGender: [] };

    let students: Student[] = [];
    if (Array.isArray(value.students)) {
        const seen = new Set<string>();
        let dropped = 0;
        for (const raw of value.students) {
            const student = readStudent(raw, issues);
            if (!student || seen.has(student.id)) {
                dropped++;
                continue;
            }
            seen.add(student.id);
            students.push(student);
        }
        if (dropped > 0) broken.push(`학생 ${dropped}명의 자료를 읽지 못해 뺐습니다.`);
    } else {
        students = [];
        broken.push('학생 명단을 읽지 못해 비웠습니다.');
    }

    const settings = readSettings(value.settings, students);
    if (!isObject(value.settings) || !isClassCount(value.settings.classCount)) {
        broken.push(`학급 수 값이 잘못되어 ${settings.classCount}개로 고쳤습니다.`);
    }

    let groups: CustomGroup[] = [];
    if (Array.isArray(value.groups)) {
        groups = value.groups.map(readGroup).filter((group): group is CustomGroup => group !== null);
        if (groups.length !== value.groups.length) broken.push('그룹 분산 일부를 읽지 못해 뺐습니다.');
    } else if (!isMissing(value.groups)) {
        broken.push('그룹 분산을 읽지 못해 비웠습니다.');
    }

    let movementHistory: AssignmentChange[] | undefined;
    if (Array.isArray(value.movementHistory)) {
        movementHistory = value.movementHistory.map(readChange).filter((change): change is AssignmentChange => change !== null);
        if (movementHistory.length !== value.movementHistory.length) broken.push('변경 이력 일부를 읽지 못해 뺐습니다.');
    } else if (!isMissing(value.movementHistory)) {
        movementHistory = [];
        broken.push('변경 이력을 읽지 못해 비웠습니다.');
    }

    const notices: string[] = [];
    if (issues.blankScore.length > 0) {
        notices.push(`성적이 비어 있거나 숫자가 아니어서 ${BLANK_SCORE}점으로 넣었습니다: ${issues.blankScore.join(', ')}`);
    }
    if (issues.blankGender.length > 0) {
        notices.push(`성별이 비어 있거나 읽을 수 없어 여학생으로 넣었습니다: ${issues.blankGender.join(', ')}`);
    }
    return { data: { students, groups, settings, movementHistory }, notices, broken };
}

/**
 * 저장 파일을 읽습니다. 형식이 다르면 null이고, 지금 작업을 건드리지 않습니다.
 * 예전 파일에 없을 수 있는 값은 채우고, 성적이 빈 학생은 엑셀과 같은 규칙으로 넣은 뒤 알립니다.
 * 되돌리기 기록(undoStack)은 파일과 저장소 어디서도 읽지 않습니다.
 */
export function parseProjectFile(content: string): ParsedProject | null {
    let value: unknown;
    try {
        value = JSON.parse(content);
    } catch {
        return null;
    }
    if (!isObject(value)) return null;
    const { data, notices, broken } = readProject(value);
    return broken.length > 0 ? null : { data, notices };
}

/**
 * 앱 저장소에 남은 값을 고칩니다. 잘못된 값 때문에 앱이 켜지지 않는 일이 없도록 읽을 수 있는 것만 남기고 알립니다.
 * 저장소가 비었으면 null입니다.
 */
export function repairStoredState(value: unknown): ParsedProject | null {
    if (!isObject(value)) return null;
    const { data, notices, broken } = readProject(value);
    return {
        data: { ...data, movementHistory: data.movementHistory ?? [] },
        notices: broken.length > 0 ? [`저장돼 있던 작업에 잘못된 값이 있어 고쳤습니다. ${broken.join(' ')}`, ...notices] : notices,
    };
}
