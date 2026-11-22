import { app, BrowserWindow, shell, protocol, net, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';
import { appRequestPath } from './appProtocol';
import { isSafeExternalUrl } from './externalUrl';
import { createFolderApproval } from './folderApproval';
import { cleanOldPrintFiles, isPrintSource, PRINT_FOLDER } from './printFiles';
import { setupUpdates } from './updater';
import { setupZoom } from './zoom';
import { cleanLeftoverTemp, isFileLockedError, projectFilePath, writeFileSafely } from './projectFiles';
import { exportFileName, projectNameFromFile, projectNameProblem } from './projectName';
import { portableDataDir } from './portable';


const isDev = process.env.NODE_ENV === 'development';

// USB판은 자료를 실행 파일 옆 클래스즐-자료 폴더에 둡니다. 다른 사람 컴퓨터에서 켜도 학생 정보가 그 컴퓨터에 남지 않게 합니다.
// 어울림과 달리 sessionData는 옮기지 않습니다. 지금 작업이 화면의 localStorage(sessionData 안)에 있기 때문입니다.
const portableData = portableDataDir(process.env.PORTABLE_EXECUTABLE_DIR);
if (portableData) app.setPath('userData', portableData);

// 인쇄용 임시 파일에는 학생 이름이 있습니다. USB판은 컴퓨터의 임시 폴더 대신 자료 폴더에 둡니다.
const printRoot = () => (portableData ? app.getPath('userData') : app.getPath('temp'));

// 인쇄 미리보기 활성화
app.commandLine.appendSwitch('enable-print-preview');

// 맞춤법 검사를 쓰지 않는데도 Electron이 처음 켤 때 Google에서 사전을 받습니다.
// 창의 spellcheck 설정이나 setSpellCheckerEnabled(false)로는 막히지 않아서 세션마다 언어를 비웁니다.
app.on('session-created', (session) => session.setSpellCheckerLanguages([]));

let mainWindow: BrowserWindow | null = null;

// 설치본에는 public이 없고 빌드 결과인 out에 같은 파일이 있습니다.
const appIcon = path.join(__dirname, '..', isDev ? 'public' : 'out', 'icons', 'classzle-256.png');

// 커스텀 프로토콜 등록 (앱 시작 시 필수)
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);

// IPC 핸들러 등록
const getProjectsDir = () => path.join(app.getPath('userData'), 'projects');

async function ensureProjectsDir() {
    const dir = getProjectsDir();
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

// 작업을 교사가 고른 곳의 파일로 내보냅니다. 다른 컴퓨터로 옮기거나 USB에 담을 때 씁니다.
ipcMain.handle('save-project', async (_event, data: string, suggestedName?: string) => {
    const options: Electron.SaveDialogOptions = {
        title: '작업 파일로 내보내기',
        filters: [{ name: '클래스즐 작업 파일', extensions: ['json'] }],
        defaultPath: exportFileName(typeof suggestedName === 'string' ? suggestedName : null),
    };
    const { canceled, filePath } = mainWindow
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options);
    if (canceled || !filePath) return { status: 'canceled' };

    try {
        await writeFileSafely(filePath, data);
        return { status: 'saved', name: path.basename(filePath) };
    } catch (e) {
        console.error('Failed to save file:', e);
        return { status: isFileLockedError(e) ? 'locked' : 'failed' };
    }
});

// 어디에 있든 작업 파일 하나를 엽니다. 내용 검사는 화면 쪽(parseProjectFile)이 합니다.
ipcMain.handle('load-project', async () => {
    const options: Electron.OpenDialogOptions = {
        title: '작업 파일 열기',
        filters: [{ name: '클래스즐 작업 파일', extensions: ['json'] }],
        properties: ['openFile'],
    };
    const { canceled, filePaths } = mainWindow
        ? await dialog.showOpenDialog(mainWindow, options)
        : await dialog.showOpenDialog(options);
    if (canceled || filePaths.length === 0) return { status: 'canceled' };

    try {
        const data = await fs.readFile(filePaths[0], 'utf-8');
        return { status: 'opened', name: path.basename(filePaths[0]), data };
    } catch (e) {
        console.error('Failed to load file:', e);
        return { status: 'failed' };
    }
});

// --- Named Save/Load IPC ---
ipcMain.handle('save-named-project', async (event, name: string, data: string) => {
    try {
        await ensureProjectsDir();
        const filePath = projectFilePath(getProjectsDir(), name);
        if (!filePath) return false;
        // 이미 있는 파일은 지금 이름 규칙에 걸려도 다시 저장할 수 있어야 합니다.
        const exists = await fs.access(filePath).then(() => true, () => false);
        if (projectNameProblem(name) && !exists) return false;
        await writeFileSafely(filePath, data);
        return true;
    } catch (e) {
        console.error('Failed to save named project:', e);
        return isFileLockedError(e) ? 'locked' : false;
    }
});

ipcMain.handle('load-named-project', async (event, name: string) => {
    try {
        const filePath = projectFilePath(getProjectsDir(), name);
        if (!filePath) return null;
        const data = await fs.readFile(filePath, 'utf-8');
        return data;
    } catch (e) {
        console.error('Failed to load named project:', e);
        return null;
    }
});

ipcMain.handle('get-project-list', async () => {
    try {
        await ensureProjectsDir();
        const dir = getProjectsDir();
        const files = await fs.readdir(dir);
        return files
            .filter(f => f.endsWith('.json'))
            .map(projectNameFromFile);
    } catch (e) {
        console.error('Failed to get project list:', e);
        return [];
    }
});

ipcMain.handle('delete-project', async (event, name: string) => {
    try {
        const filePath = projectFilePath(getProjectsDir(), name);
        if (!filePath) return false;
        await fs.unlink(filePath);
        return true;
    } catch (e) {
        console.error('Failed to delete project:', e);
        return false;
    }
});

// 창 틀을 직접 그리므로 최소화, 최대화, 닫기를 화면의 버튼에서 받습니다.
ipcMain.on('window-action', (_event, action: 'minimize' | 'maximize' | 'close') => {
    if (!mainWindow) return;
    if (action === 'minimize') mainWindow.minimize();
    if (action === 'maximize') {
        if (mainWindow.isMaximized()) mainWindow.unmaximize();
        else mainWindow.maximize();
    }
    if (action === 'close') mainWindow.close();
});

// 반별 입력표를 고른 폴더에 저장합니다. 같은 이름이 있으면 묻도록 알리고, 확인을 받으면 folder를 넘겨받습니다.
// 쓰는 폴더는 메인에서 띄운 창으로 고른 곳뿐입니다. 화면이 넘긴 경로는 그 폴더와 같을 때만 받습니다.
const sheetFolder = createFolderApproval();

ipcMain.handle('save-class-sheets', async (_event, files: { name: string; data: Uint8Array }[], folder?: string) => {
    let target = folder;
    if (target) {
        if (!sheetFolder.take(target)) return { status: 'failed' };
    } else {
        const options: Electron.OpenDialogOptions = {
            title: '입력표를 저장할 폴더',
            properties: ['openDirectory', 'createDirectory'],
        };
        const { canceled, filePaths } = mainWindow
            ? await dialog.showOpenDialog(mainWindow, options)
            : await dialog.showOpenDialog(options);
        if (canceled || filePaths.length === 0) return { status: 'canceled' };
        target = filePaths[0];

        const existing: string[] = [];
        for (const file of files) {
            const exists = await fs.access(path.join(target, path.basename(file.name))).then(() => true, () => false);
            if (exists) existing.push(path.basename(file.name));
        }
        if (existing.length > 0) {
            sheetFolder.approve(target);
            return { status: 'exists', folder: target, existing };
        }
    }
    try {
        for (const file of files) {
            await writeFileSafely(path.join(target, path.basename(file.name)), Buffer.from(file.data));
        }
        return { status: 'saved', folder: target };
    } catch (e) {
        console.error('Failed to save class sheets:', e);
        return { status: isFileLockedError(e) ? 'locked' : 'failed' };
    }
});

// 인쇄물 쪽 아래 글입니다. 리포트가 넣은 글은 이미 이스케이프되어 있어 그대로 씁니다.
function printFooterTemplate(html: string): string {
    const text = /<meta name="classzle-footer" content="([^"]*)">/.exec(html)?.[1] ?? '';
    return `<div style="width:100%;padding:0 12mm;font-size:8px;color:#333;font-family:Pretendard,'Malgun Gothic',sans-serif;display:flex;justify-content:space-between;gap:12px;">`
        + `<span>${text}</span><span style="white-space:nowrap;"><span class="pageNumber"></span> / <span class="totalPages"></span>쪽</span></div>`;
}

// 인쇄 미리보기 핸들러
ipcMain.handle('print-preview', async (_event, htmlContent: string) => {
    const printDir = path.join(printRoot(), PRINT_FOLDER);
    const stamp = Date.now();
    const htmlPath = path.join(printDir, `report-${stamp}.html`);
    const pdfPath = path.join(printDir, `report-${stamp}.pdf`);
    let conversionWindow: BrowserWindow | null = null;
    let previewShown = false;

    try {
        // 1. HTML을 임시 파일로 저장 (UTF-8)
        await fs.mkdir(printDir, { recursive: true });
        await fs.writeFile(htmlPath, htmlContent, 'utf-8');

        // 2. 변환용 히든 윈도우 생성
        // 리포트에는 학생 정보가 있습니다. 스크립트를 끄고 리포트 파일 말고는 아무것도 읽지 못하게 합니다.
        conversionWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                javascript: false,
                partition: 'classzle-print',
            }
        });
        conversionWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
            callback({ cancel: !isPrintSource(details.url, htmlPath) });
        });

        await conversionWindow.loadURL(pathToFileURL(htmlPath).href);

        // 3. PDF로 변환
        // 쪽마다 아래에 안내, 출력 시각, 쪽 번호를 찍습니다. 글은 리포트의 <meta name="classzle-footer">에 이스케이프된 채로 있습니다.
        const pdfData = await conversionWindow.webContents.printToPDF({
            printBackground: true,
            landscape: false,
            pageSize: 'A4',
            displayHeaderFooter: true,
            headerTemplate: '<span></span>',
            footerTemplate: printFooterTemplate(htmlContent),
            margins: {
                top: 0.5,
                bottom: 0.6,
                left: 0.5,
                right: 0.5
            }
        });

        // 4. PDF 저장
        await fs.writeFile(pdfPath, pdfData);

        // 5. 미리보기 창 생성
        const previewWindow = new BrowserWindow({
            width: 1000,
            height: 800,
            title: '인쇄 미리보기',
            icon: appIcon,
            webPreferences: {
                plugins: true // PDF 뷰어 플러그인 허용
            }
        });

        previewWindow.setMenu(null);
        previewWindow.webContents.setWindowOpenHandler(openLinkOutside);
        previewWindow.on('closed', () => {
            fs.unlink(pdfPath).catch(err => console.error('Failed to delete temp pdf:', err));
        });
        // 창을 띄운 뒤로는 창을 닫을 때 PDF를 지웁니다.
        previewShown = true;
        await previewWindow.loadURL(pathToFileURL(pdfPath).href);

        return true;
    } catch (error) {
        console.error('Print preview failed:', error);
        if (!previewShown) await fs.unlink(pdfPath).catch(() => {});
        return false;
    } finally {
        // 성공해도 실패해도 HTML과 변환 창은 남기지 않습니다.
        conversionWindow?.destroy();
        await fs.unlink(htmlPath).catch(() => {});
    }
});

// 새 창을 만들지 않고 https 주소만 기본 브라우저로 넘깁니다.
function openLinkOutside({ url }: { url: string }): { action: 'deny' } {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        // 창 틀은 앱 화면의 TitleBar가 그립니다 (brand/DESIGN.md).
        frame: false,
        backgroundColor: '#f3f6fa',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        title: 'Classzle',
        icon: appIcon,
        show: false,
    });

    // 로딩 후 표시
    mainWindow.once('ready-to-show', () => {
        mainWindow?.maximize();
        mainWindow?.show();
    });

    // 외부 링크는 기본 브라우저로 열기
    mainWindow.webContents.setWindowOpenHandler(openLinkOutside);

    // 메뉴 없이도 Ctrl + +, Ctrl + −, Ctrl + 0으로 확대합니다. 확대 값은 다시 켜도 기억합니다.
    setupZoom(mainWindow, app.getPath('userData'));

    if (isDev) {
        // 개발 모드: Next.js 개발 서버에 연결
        const url = 'http://localhost:3000';
        mainWindow.loadURL(url);
        mainWindow.webContents.openDevTools();
    } else {
        // 프로덕션 모드: 커스텀 프로토콜을 사용하여 로드
        // app://classzle/index.html -> out/index.html
        mainWindow.loadURL('app://classzle/index.html');
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    void cleanOldPrintFiles(printRoot());
    void cleanLeftoverTemp(getProjectsDir());

    setupUpdates((status) => mainWindow?.webContents.send('update-status', status));

    // app 프로토콜 핸들러 등록
    protocol.handle('app', (request) => {
        // out 폴더 내의 파일로 매핑
        // 예: app://classzle/_next/static/... -> out/_next/static/...
        const filePath = appRequestPath(request.url, path.join(__dirname, '..', 'out'));
        if (!filePath) return new Response('Not found', { status: 404 });
        return net.fetch(pathToFileURL(filePath).href);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
