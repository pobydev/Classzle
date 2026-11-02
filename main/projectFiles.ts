import * as path from 'path';

/**
 * 작업 이름에 해당하는 파일 경로입니다. 폴더 밖이나 파일의 숨은 영역(:)을 가리키면 null입니다.
 * 읽기와 지우기에도 쓰므로 글자 규칙(projectNameProblem)보다 넓게 둡니다. 이미 있는 파일은 계속 열 수 있어야 합니다.
 */
export function projectFilePath(dir: string, name: string): string | null {
    if (/[/\\:\u0000-\u001f]/.test(name)) return null;
    const root = path.resolve(dir);
    const target = path.resolve(root, `${name}.json`);
    return path.dirname(target) === root ? target : null;
}
