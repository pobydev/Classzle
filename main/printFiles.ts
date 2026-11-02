import { fileURLToPath } from 'url';

/** PDF 변환 창이 읽어도 되는 주소인지 봅니다. 리포트 파일 자체만 됩니다. */
export function isPrintSource(url: string, htmlPath: string): boolean {
    if (!url.startsWith('file:')) return false;
    try {
        return fileURLToPath(url).toLowerCase() === htmlPath.toLowerCase();
    } catch {
        return false;
    }
}
