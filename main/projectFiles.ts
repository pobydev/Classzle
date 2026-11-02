import * as fs from 'fs/promises';
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

// 저장 중인 다른 창의 파일을 지우지 않도록 이보다 오래된 것만 지웁니다.
const LEFTOVER_AFTER_MS = 60 * 1000;
const TEMP_NAME = /\.\d+\.\d+\.tmp$/;

/** 정전 등으로 남은 임시 파일을 지웁니다. 켤 때 부릅니다. 지우지 못해도 앱은 그대로 켭니다. */
export async function cleanLeftoverTemp(dir: string, now = Date.now()): Promise<void> {
    const names = await fs.readdir(dir).catch(() => [] as string[]);
    await Promise.all(names.filter((name) => TEMP_NAME.test(name)).map(async (name) => {
        const file = path.join(dir, name);
        const info = await fs.lstat(file).catch(() => null);
        if (info?.isFile() && now - info.mtimeMs > LEFTOVER_AFTER_MS) await fs.unlink(file).catch(() => {});
    }));
}

/** 다른 프로그램이 파일을 잡고 있어 실패한 오류인지 봅니다. */
export function isFileLockedError(error: unknown): boolean {
    const code = (error as { code?: string } | null)?.code;
    return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
}

// 백신처럼 잠깐 파일을 잡는 프로그램이 있어 몇 번 다시 해 봅니다.
async function renameWithRetry(from: string, to: string) {
    for (let attempt = 0; ; attempt++) {
        try {
            await fs.rename(from, to);
            return;
        } catch (e) {
            if (attempt >= 3 || !isFileLockedError(e)) throw e;
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
    }
}

/**
 * 같은 폴더의 임시 파일에 다 쓴 뒤 바꿔치기합니다. 쓰다가 멈춰도 원래 파일은 그대로입니다.
 * 임시 파일은 .json으로 끝나지 않으므로 작업 목록에 나오지 않습니다.
 */
export async function writeFileSafely(target: string, data: string | Uint8Array): Promise<void> {
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
        const handle = await fs.open(temp, 'w');
        try {
            await handle.writeFile(data);
            await handle.sync();
        } finally {
            await handle.close();
        }
        await renameWithRetry(temp, target);
    } catch (e) {
        await fs.unlink(temp).catch(() => {});
        throw e;
    }
}
