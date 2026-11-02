import type { AppSettings, AssignmentChange, CustomGroup, Student } from '@/types';

export interface ProjectData {
    students: Student[];
    groups: CustomGroup[];
    settings: AppSettings;
    movementHistory?: AssignmentChange[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
const isNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
const isOptionalList = (value: unknown) => value === undefined || Array.isArray(value);

function isStudent(value: unknown): boolean {
    if (!isObject(value)) return false;
    return typeof value.id === 'string'
        && typeof value.name === 'string'
        && isNumber(value.academic_score)
        && isNumber(value.behavior_score)
        && isOptionalList(value.group_ids)
        && isOptionalList(value.avoid_ids)
        && isOptionalList(value.keep_ids);
}

function isGroup(value: unknown): boolean {
    return isObject(value) && typeof value.id === 'string' && typeof value.name === 'string' && Array.isArray(value.member_ids);
}

/**
 * 저장 파일을 읽습니다. 형식이 다르면 null입니다.
 * 형식이 다른 파일을 그대로 넣으면 화면이 멈추고, 그 상태가 저장돼 다음에 켤 때도 멈춥니다.
 * 예전 파일에 없을 수 있는 값은 빈 값으로 채웁니다.
 */
export function parseProjectFile(content: string): ProjectData | null {
    let data: unknown;
    try {
        data = JSON.parse(content);
    } catch {
        return null;
    }
    if (!isObject(data) || !Array.isArray(data.students) || !data.students.every(isStudent)) return null;
    if (!isObject(data.settings) || !isNumber(data.settings.classCount)) return null;
    if (!isOptionalList(data.groups) || !((data.groups ?? []) as unknown[]).every(isGroup)) return null;
    if (!isOptionalList(data.movementHistory)) return null;

    return {
        students: (data.students as Student[]).map((s) => ({
            ...s,
            prev_info: String(s.prev_info ?? ''),
            behavior_type: s.behavior_type ?? 'NONE',
            group_ids: s.group_ids ?? [],
            avoid_ids: s.avoid_ids ?? [],
            keep_ids: s.keep_ids ?? [],
        })),
        groups: (data.groups ?? []) as CustomGroup[],
        settings: data.settings as unknown as AppSettings,
        movementHistory: data.movementHistory as AssignmentChange[] | undefined,
    };
}
