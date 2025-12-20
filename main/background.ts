import { app, BrowserWindow, shell, protocol, net, Menu, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';


const isDev = process.env.NODE_ENV === 'development';

// 인쇄 미리보기 활성화
app.commandLine.appendSwitch('enable-print-preview');

let mainWindow: BrowserWindow | null = null;

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
        await fs.writeFile(filePath, data, 'utf-8');
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
        await ensureProjectsDir();
        const filePath = path.join(getProjectsDir(), `${name}.json`);
        await fs.writeFile(filePath, data, 'utf-8');
        return true;
    } catch (e) {
        console.error('Failed to save named project:', e);
        return false;
    }
});

ipcMain.handle('load-named-project', async (event, name: string) => {
    try {
        const filePath = path.join(getProjectsDir(), `${name}.json`);
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
            .map(f => f.replace('.json', ''));
    } catch (e) {
        console.error('Failed to get project list:', e);
        return [];
    }
});

ipcMain.handle('delete-project', async (event, name: string) => {
    try {
        const filePath = path.join(getProjectsDir(), `${name}.json`);
        await fs.unlink(filePath);
        return true;
    } catch (e) {
        console.error('Failed to delete project:', e);
        return false;
    }
});

// 인쇄 미리보기 핸들러
ipcMain.handle('print-preview', async (event, htmlContent: string) => {
    try {
        // 1. HTML을 임시 파일로 저장 (UTF-8)
        const htmlPath = path.join(app.getPath('temp'), `report-${Date.now()}.html`);
        await fs.writeFile(htmlPath, htmlContent, 'utf-8');

        // 2. 변환용 히든 윈도우 생성
        const conversionWindow = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        await conversionWindow.loadURL(`file://${htmlPath}`);

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
            icon: path.join(__dirname, '..', 'public', 'favicon.png'),
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
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        title: 'Classzle - 학급 편성 도우미',
        icon: path.join(__dirname, '..', 'public', 'favicon.png'),
        show: false,
    });

    // 로딩 후 표시
    mainWindow.once('ready-to-show', () => {
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
    // 메뉴 설정
    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: '파일',
            submenu: [
                { role: 'quit', label: '종료' }
            ]
        },
        {
            label: '보기',
            submenu: [
                { role: 'reload', label: '새로고침' },
                { role: 'forceReload', label: '강제 새로고침' },
                { type: 'separator' },
                { role: 'toggleDevTools', label: '개발자 도구', accelerator: 'F12' },
                { type: 'separator' },
                { role: 'resetZoom', label: '확대/축소 초기화' },
                { role: 'zoomIn', label: '확대' },
                { role: 'zoomOut', label: '축소' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '전체화면' }
            ]
        },
        {
            label: '창',
            submenu: [
                { role: 'minimize', label: '최소화' },
                { role: 'close', label: '닫기' }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

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
