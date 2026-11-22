import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PORTABLE_DATA_FOLDER, portableDataDir, updateSupport } from '../main/portable';
import { DEFAULT_EXPORT_NAME, exportFileName } from '../main/projectName';

describe('USB판', () => {
    it('자료 폴더는 실행 파일 옆 클래스즐-자료입니다', () => {
        const dir = path.resolve('E:/시연 USB');
        expect(portableDataDir(dir)).toBe(path.join(dir, '클래스즐-자료'));
        expect(PORTABLE_DATA_FOLDER).toBe('클래스즐-자료');
    });

    it('설치판과 개발 모드는 자료 폴더를 옮기지 않습니다', () => {
        expect(portableDataDir(undefined)).toBeNull();
        expect(portableDataDir('')).toBeNull();
    });

    it('USB판은 새 버전을 확인하지 않습니다. 시험용 주소가 있어도 마찬가지입니다', () => {
        const base = { portableDir: 'E:/usb', isPackaged: true, platform: 'win32' };
        expect(updateSupport({ ...base, testFeed: undefined })).toBe('portable');
        expect(updateSupport({ ...base, testFeed: 'http://127.0.0.1:1/' })).toBe('portable');
    });

    it('설치판은 윈도에서만 확인하고, 개발 모드는 시험용 주소가 있을 때만 확인합니다', () => {
        const none = { portableDir: undefined, testFeed: undefined };
        expect(updateSupport({ ...none, isPackaged: true, platform: 'win32' })).toBe('on');
        expect(updateSupport({ ...none, isPackaged: true, platform: 'darwin' })).toBe('off');
        expect(updateSupport({ ...none, isPackaged: false, platform: 'win32' })).toBe('off');
        expect(updateSupport({ portableDir: undefined, testFeed: 'http://127.0.0.1:1/', isPackaged: false, platform: 'win32' })).toBe('on');
    });

    it('설치 파일과 USB판을 함께 만들고, 이름은 Classzle-Setup과 Classzle-USB입니다', () => {
        const { build } = JSON.parse(readFileSync(path.resolve('package.json'), 'utf8'));
        expect(build.win.target.map((t: { target: string }) => t.target)).toEqual(['nsis', 'portable']);
        expect(build.nsis.artifactName).toBe('Classzle-Setup-${version}.${ext}');
        expect(build.portable.artifactName).toBe('Classzle-USB-${version}.${ext}');
        // 설치판의 새 버전 확인(latest.yml)이 이 저장소의 릴리스를 봅니다.
        expect(build.publish).toMatchObject({ provider: 'github', owner: 'pobydev', repo: 'Classzle' });
    });
});

describe('파일로 내보낼 때 미리 넣는 이름', () => {
    it('연 작업의 이름을 씁니다', () => {
        expect(exportFileName('2027학년도 1차')).toBe('2027학년도 1차.json');
    });

    it('연 작업이 없으면 클래스즐 작업입니다', () => {
        expect(exportFileName(null)).toBe(`${DEFAULT_EXPORT_NAME}.json`);
        expect(exportFileName('   ')).toBe('클래스즐 작업.json');
    });

    it('파일 이름에 쓸 수 없는 글자와 경로는 뺍니다', () => {
        expect(exportFileName('1/2 학기: 최종?')).toBe('12 학기 최종.json');
        expect(exportFileName(String.raw`..\..\x`)).toBe('....x.json');
        expect(exportFileName('con')).toBe('클래스즐 작업.json');
        expect(exportFileName('...')).toBe('클래스즐 작업.json');
    });

    it('.json을 두 번 붙이지 않고, 끝의 점과 공백을 지웁니다', () => {
        expect(exportFileName('시연.json')).toBe('시연.json');
        expect(exportFileName('시연. ')).toBe('시연.json');
    });
});
