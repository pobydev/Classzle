// 저장 작업 이름의 규칙입니다. 앱 화면과 메인 프로세스가 함께 씁니다.
// 화면에서도 불러오므로 fs, path 같은 Node 모듈을 쓰지 않습니다.

const FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
const MAX_LENGTH = 100;

/** 저장할 수 없는 이름이면 화면에 보여 줄 문구를, 괜찮으면 null을 줍니다. */
export function projectNameProblem(name: string): string | null {
    if (name.trim() === '') return '작업 이름을 입력해 주세요.';
    if (FORBIDDEN.test(name)) return '작업 이름에 \\ / : * ? " < > | 는 쓸 수 없습니다. 빼고 입력해 주세요.';
    if (/^\.+$/.test(name) || RESERVED.test(name)) return '이 이름은 윈도우에서 파일 이름으로 쓸 수 없습니다. 다른 이름을 입력해 주세요.';
    if (name.length > MAX_LENGTH) return `작업 이름은 ${MAX_LENGTH}자까지 쓸 수 있습니다.`;
    return null;
}

/** 파일 이름에서 작업 이름을 얻습니다. 이름 안의 .json은 두고 끝의 확장자만 뗍니다. */
export function projectNameFromFile(file: string): string {
    return file.endsWith('.json') ? file.slice(0, -'.json'.length) : file;
}

// 윈도우는 파일 이름의 대소문자를 가리지 않으므로 Test와 test는 같은 파일입니다.
// 저장 창은 앞뒤 공백을 지우므로 옛 파일의 ' 이름 '도 같은 작업으로 봅니다.
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/** 목록에서 이 이름과 같은 파일로 저장될 작업을 찾습니다. */
export function findSameProject(name: string, names: string[]): string | null {
    if (name.trim() === '') return null;
    return names.find((existing) => sameName(existing, name)) ?? null;
}

/** 저장할 이름을 정합니다. 이미 있는 작업은 지금 규칙에 걸려도 그 이름 그대로 다시 저장합니다. */
export function resolveSaveName(typed: string, names: string[]): { name: string; problem: string | null } {
    const existing = findSameProject(typed, names);
    return existing !== null ? { name: existing, problem: null } : { name: typed, problem: projectNameProblem(typed) };
}

/** 다른 작업을 덮어쓰게 되면 true입니다. 지금 연 작업을 다시 저장할 때는 묻지 않습니다. */
export function overwritesOtherProject(name: string, names: string[], activeName: string | null): boolean {
    const existing = findSameProject(name, names);
    return existing !== null && !(activeName !== null && sameName(existing, activeName));
}
