import * as path from 'path';

/**
 * app://classzle/... 주소를 out 폴더의 파일 경로로 바꿉니다. 폴더 밖을 가리키면 null입니다.
 * 주소의 %XX를 풀어야 파일 이름과 맞습니다. 쿼리와 #은 파일 이름이 아닙니다.
 */
export function appRequestPath(requestUrl: string, rootDir: string): string | null {
    let relative: string;
    try {
        relative = decodeURIComponent(new URL(requestUrl).pathname).replace(/^\/+/, '');
    } catch {
        return null;
    }
    const root = path.resolve(rootDir);
    const target = path.resolve(root, relative);
    return target === root || target.startsWith(root + path.sep) ? target : null;
}
