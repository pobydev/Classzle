import { app, BrowserWindow, shell, protocol, net, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';
import { isPrintSource } from './printFiles';
import { setupUpdates } from './updater';
import { projectFilePath, writeFileSafely } from './projectFiles';
import { projectNameFromFile, projectNameProblem } from './projectName';


const isDev = process.env.NODE_ENV === 'development';

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

ipcMain.handle('save-project', async (event, data) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
        filters: [{ name: 'Classzle Project', extensions: ['json'] }],
        defaultPath: 'classzle-project.json',
    });

    if (canceled || !filePath) return false;

    try {
        await writeFileSafely(filePath, data);
        return true;
    } catch (e) {
        console.error('Failed to save file:', e);
        throw e;
    }
});

ipcMain.handle('load-project', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        filters: [{ name: 'Classzle Project', extensions: ['json'] }],
        properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) return null;

    try {
        const data = await fs.readFile(filePaths[0], 'utf-8');
        return data;
    } catch (e) {
        console.error('Failed to load file:', e);
        throw e;
    }
});

// --- Named Save/Load IPC ---
ipcMain.handle('save-named-project', async (event, name: string, data: string) => {
    try {
        if (projectNameProblem(name)) return false;
        await ensureProjectsDir();
        const filePath = projectFilePath(getProjectsDir(), name);
        if (!filePath) return false;
        await writeFileSafely(filePath, data);
        return true;
    } catch (e) {
        console.error('Failed to save named project:', e);
        return false;
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
ipcMain.handle('save-class-sheets', async (_event, files: { name: string; data: Uint8Array }[], folder?: string) => {
    let target = folder;
    if (!target) {
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
        if (existing.length > 0) return { status: 'exists', folder: target, existing };
    }
    try {
        for (const file of files) {
            await writeFileSafely(path.join(target, path.basename(file.name)), Buffer.from(file.data));
        }
        return { status: 'saved', folder: target };
    } catch (e) {
        console.error('Failed to save class sheets:', e);
        return { status: 'failed' };
    }
});

// 인쇄 미리보기 핸들러
ipcMain.handle('print-preview', async (event, htmlContent: string) => {
    try {
        // 1. HTML을 임시 파일로 저장 (UTF-8)
        const htmlPath = path.join(app.getPath('temp'), `report-${Date.now()}.html`);
        await fs.writeFile(htmlPath, htmlContent, 'utf-8');

        // 2. 변환용 히든 윈도우 생성
        // 리포트에는 학생 정보가 있습니다. 스크립트를 끄고 리포트 파일 말고는 아무것도 읽지 못하게 합니다.
        const conversionWindow = new BrowserWindow({
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
        const pdfData = await conversionWindow.webContents.printToPDF({
            printBackground: true,
            landscape: false,
            pageSize: 'A4',
            margins: {
                top: 0,
                bottom: 0,
                left: 0,
                right: 0
            }
        });

        // 4. PDF 저장
        const pdfPath = path.join(app.getPath('temp'), `report-${Date.now()}.pdf`);
        await fs.writeFile(pdfPath, pdfData);

        // 5. 히든 윈도우 및 HTML 파일 정리
        conversionWindow.close();
        fs.unlink(htmlPath).catch(err => console.error('Failed to cleanup html:', err));

        // 6. 미리보기 창 생성
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
        await previewWindow.loadURL(`file://${pdfPath}`);

        previewWindow.on('closed', () => {
            fs.unlink(pdfPath).catch(err => console.error('Failed to delete temp pdf:', err));
        });

        return true;
    } catch (error) {
        console.error('Print preview failed:', error);
        return false;
    }
});

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
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

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

    setupUpdates((status) => mainWindow?.webContents.send('update-status', status));

    // app 프로토콜 핸들러 등록
    protocol.handle('app', (request) => {
        const url = request.url.replace(/^app:\/\/classzle\//, '');
        // out 폴더 내의 파일로 매핑
        // 예: app://classzle/_next/static/... -> out/_next/static/...
        const filePath = path.join(__dirname, '..', 'out', url);
        return net.fetch('file://' + filePath);
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
