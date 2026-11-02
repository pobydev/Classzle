import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from '../main/externalUrl';
import { cleanOldPrintFiles, PRINT_FOLDER } from '../main/printFiles';

describe('27. 기본 브라우저로 넘기는 주소', () => {
    it('https만 넘깁니다', () => {
        expect(isSafeExternalUrl('https://github.com/pobydev/Classzle')).toBe(true);
    });

    it.each(['http://example.invalid', 'file:///C:/Windows/notepad.exe', 'smb://example.invalid/share', 'javascript:alert(1)', 'ms-settings:', 'mailto:a@example.invalid', '주소 아님', ''])(
        '다른 것은 넘기지 않습니다: %s',
        (url) => {
            expect(isSafeExternalUrl(url)).toBe(false);
        },
    );
});

describe('28. 인쇄 임시 파일 청소', () => {
    const HOUR = 60 * 60 * 1000;
    let temp: string;

    const touch = async (file: string, ageMs: number) => {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, '가상');
        const when = new Date(Date.now() - ageMs);
        await fs.utimes(file, when, when);
    };

    beforeEach(async () => {
        temp = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-clean-'));
    });
    afterEach(async () => {
        await fs.rm(temp, { recursive: true, force: true });
    });

    it('오래된 앱 임시 파일을 지웁니다', async () => {
        await touch(path.join(temp, PRINT_FOLDER, 'report-1.html'), 2 * HOUR);
        await touch(path.join(temp, 'report-1793616069652.html'), 2 * HOUR);
        await touch(path.join(temp, 'report-1793616069652.pdf'), 2 * HOUR);
        await cleanOldPrintFiles(temp);
        expect(await fs.readdir(path.join(temp, PRINT_FOLDER))).toEqual([]);
        expect(await fs.readdir(temp)).toEqual([PRINT_FOLDER]);
    });

    it('방금 만든 파일과 다른 프로그램의 파일은 그대로 둡니다', async () => {
        await touch(path.join(temp, PRINT_FOLDER, 'report-1.pdf'), 0);
        await touch(path.join(temp, 'report-1793616069652.pdf'), 0);
        await touch(path.join(temp, 'report-2026.pdf'), 2 * HOUR);
        await touch(path.join(temp, 'report.html'), 2 * HOUR);
        await touch(path.join(temp, 'other-1793616069652.pdf'), 2 * HOUR);
        await cleanOldPrintFiles(temp);
        expect((await fs.readdir(temp)).sort()).toEqual(
            [PRINT_FOLDER, 'other-1793616069652.pdf', 'report-1793616069652.pdf', 'report-2026.pdf', 'report.html'].sort(),
        );
        expect(await fs.readdir(path.join(temp, PRINT_FOLDER))).toEqual(['report-1.pdf']);
    });

    it('폴더가 없어도 멈추지 않습니다', async () => {
        await expect(cleanOldPrintFiles(path.join(temp, '없는 폴더'))).resolves.toBeUndefined();
    });
});
