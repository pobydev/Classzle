// USB판(설치하지 않고 실행 파일 하나로 쓰는 판)의 규칙입니다. 어울림 USB판과 같습니다.
// electron-builder의 portable 실행 파일은 켤 때 PORTABLE_EXECUTABLE_DIR에 자기가 있는 폴더를 넣어 줍니다.
// Electron을 불러오지 않아 시험에서 바로 부를 수 있습니다.
import * as path from 'path';

/** 실행 파일 옆에 만드는 자료 폴더 이름입니다. 저장한 작업과 지금 작업이 여기에 남습니다. */
export const PORTABLE_DATA_FOLDER = '클래스즐-자료';

export type UpdateSupport = 'on' | 'off' | 'portable';

/** USB판이면 자료 폴더 경로를, 설치판이나 개발 모드면 null을 줍니다. */
export function portableDataDir(exeDir: string | undefined): string | null {
    return exeDir ? path.join(exeDir, PORTABLE_DATA_FOLDER) : null;
}

/**
 * 새 버전 확인을 할지 정합니다. USB판은 시험용 주소가 있어도 확인하지 않습니다(패밀리 규칙: USB판은 자동 업데이트하지 않음).
 * 설치판은 윈도에서 패키지된 앱일 때만, 시험에서는 시험용 주소가 있을 때만 확인합니다.
 */
export function updateSupport({
    portableDir,
    testFeed,
    isPackaged,
    platform,
}: {
    portableDir: string | undefined;
    testFeed: string | undefined;
    isPackaged: boolean;
    platform: string;
}): UpdateSupport {
    if (portableDir) return 'portable';
    return testFeed || (isPackaged && platform === 'win32') ? 'on' : 'off';
}
