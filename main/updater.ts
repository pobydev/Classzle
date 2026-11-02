// 새 버전 확인. 동작은 어울림, ScoreShow와 같습니다 (패밀리 규칙은 gnilab/CLAUDE.md).
// 켤 때 GitHub에서 latest.yml을 받아 버전 번호를 확인합니다. 학생 정보는 보내지 않습니다.
// 이때 electron-updater가 임의로 만들어 이 컴퓨터에 둔 ID도 머리글(x-user-staging-id)로 함께 보냅니다.
// 단계적 배포에 쓰는 값이며 학생 정보와 관계가 없습니다.
// 교사가 설치를 누르기 전에는 내려받지 않고, 내려받은 뒤에는 앱을 닫을 때 설치합니다.
// 확인을 언제 시작할지는 교사의 설정을 아는 화면 쪽(useUpdates)이 정합니다.
import { app, ipcMain } from 'electron';
import { writeFileSync } from 'fs';
import * as path from 'path';

type UpdateStatus =
    | { state: 'idle' | 'checking' | 'latest' | 'error' }
    | { state: 'available' | 'downloading' | 'ready' | 'failed'; version: string };

// scripts/update-smoke.mjs가 시험용 주소를 넣습니다. 이 주소로 받은 파일은 설치하지 않습니다.
const testFeed = process.env.CLASSZLE_UPDATE_FEED;
const support = testFeed || (app.isPackaged && process.platform === 'win32') ? 'on' : 'off';

export function setupUpdates(notify: (status: UpdateStatus) => void) {
    let status: UpdateStatus = { state: 'idle' };
    const set = (next: UpdateStatus) => {
        status = next;
        notify(next);
    };

    ipcMain.handle('update-info', () => ({ updates: support, status }));
    if (support !== 'on') return;

    // 개발 모드와 웹에서는 불러오지 않습니다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = !testFeed;
    if (testFeed) {
        // 설치본의 app-update.yml을 대신합니다. 내려받기가 이 파일의 캐시 폴더 이름을 읽으므로 주소만으로는 부족합니다.
        const config = path.join(app.getPath('userData'), 'test-update.yml');
        writeFileSync(
            config,
            ['provider: generic', `url: ${JSON.stringify(testFeed)}`, 'updaterCacheDirName: classzle-update-test'].join('\n'),
        );
        autoUpdater.updateConfigPath = config;
        autoUpdater.forceDevUpdateConfig = true;
    }

    autoUpdater.on('update-not-available', () => set({ state: 'latest' }));
    autoUpdater.on('update-available', (info) => set({ state: 'available', version: info.version }));
    autoUpdater.on('update-downloaded', (info) => set({ state: 'ready', version: info.version }));
    // 학교 인터넷은 자주 막힙니다. 확인 실패는 조용히 넘기고, 교사가 요청한 내려받기만 실패를 알립니다.
    autoUpdater.on('error', () => {
        if (status.state === 'downloading') set({ state: 'failed', version: status.version });
        else if (status.state !== 'ready') set({ state: 'error' });
    });

    ipcMain.handle('update-check', () => {
        if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return;
        set({ state: 'checking' });
        // 실패는 위 error 이벤트로도 옵니다.
        autoUpdater.checkForUpdates().catch(() => {});
    });

    ipcMain.handle('update-download', () => {
        if (status.state !== 'available' && status.state !== 'failed') return;
        set({ state: 'downloading', version: status.version });
        // 실패는 위 error 이벤트로도 옵니다.
        autoUpdater.downloadUpdate().catch(() => {});
    });

    ipcMain.handle('update-install', () => {
        if (status.state !== 'ready') return;
        if (testFeed) console.info('[update] test feed: not installing');
        // 설치 창 없이 설치하고 앱을 다시 켭니다. '지금 다시 시작'이라는 버튼 이름과 맞춥니다.
        else autoUpdater.quitAndInstall(true, true);
    });
}
