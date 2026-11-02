import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 인쇄용 임시 파일을 두는 폴더 이름입니다. 시스템 임시 폴더 안에 있습니다.
export const PRINT_FOLDER = 'classzle-print';

// 지금 쓰는 파일을 지우지 않도록 이보다 오래된 것만 지웁니다.
const OLD_AFTER_MS = 60 * 60 * 1000;

// 전 버전은 임시 폴더 바로 아래에 이 이름으로 썼습니다. 숫자는 만든 시각(밀리초)입니다.
const LEGACY_NAME = /^report-\d{13}\.(html|pdf)$/;

/** PDF 변환 창이 읽어도 되는 주소인지 봅니다. 리포트 파일 자체만 됩니다. */
export function isPrintSource(url: string, htmlPath: string): boolean {
    if (!url.startsWith('file:')) return false;
    try {
        return fileURLToPath(url).toLowerCase() === htmlPath.toLowerCase();
    } catch {
        return false;
    }
}

async function removeOld(dir: string, matches: (name: string) => boolean, now: number) {
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(names.filter(matches).map(async (name) => {
        const file = path.join(dir, name);
        const info = await fs.stat(file).catch(() => null);
        if (info?.isFile() && now - info.mtimeMs > OLD_AFTER_MS) await fs.unlink(file).catch(() => {});
    }));
}

/**
 * 앱이 꺼지거나 인쇄가 실패해 남은 임시 파일을 지웁니다. 학생 이름이 들어 있는 파일입니다.
 * 켤 때 부릅니다. 지우지 못해도 앱은 그대로 켭니다.
 */
export async function cleanOldPrintFiles(tempDir: string, now = Date.now()): Promise<void> {
    await removeOld(path.join(tempDir, PRINT_FOLDER), () => true, now);
    await removeOld(tempDir, (name) => LEGACY_NAME.test(name), now);
}
