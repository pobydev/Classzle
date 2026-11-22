// 앱의 틀을 실제 앱으로 시험합니다. 자료는 임시 폴더에 두고 명단은 저장소의 가상 표본입니다.
// 사용: npm run electron:build-main && npm run build, 그 뒤 PW_DIR=<폴더> node scripts/shell-smoke.mjs
// 화면 사진은 SHELL_SHOTS 폴더에 저장합니다.
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const { _electron: electron, expect } = createRequire(path.join(path.resolve(process.env.PW_DIR), 'x.js'))(
    '@playwright/test',
);

const root = process.cwd();
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const shots = process.env.SHELL_SHOTS;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-shell-'));
const userData = path.join(profile, 'data');
const env = { ...process.env, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;

const checks = [];
const errors = [];
const nativeDialogs = [];
let app;

try {
    app = await electron.launch({
        executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['.', `--user-data-dir=${userData}`],
        cwd: root,
        env,
        timeout: 60000,
    });
    // 실제 저장 자료를 건드리지 않는지 가장 먼저 봅니다.
    const actual = await app.evaluate(({ app: a }) => a.getPath('userData'));
    if (path.resolve(actual) !== path.resolve(userData)) throw new Error('시험이 임시 폴더가 아닌 곳을 쓰고 있어 멈춥니다.');

    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => {
        nativeDialogs.push(d.message());
        await d.dismiss();
    });
    const shot = async (name) => {
        if (!shots) return;
        await fs.mkdir(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `${name}.png`) });
    };
    await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });

    // 창 틀과 메뉴
    expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu())).toBeNull();
    const titlebar = page.locator('.titlebar');
    await expect(titlebar).toContainText('클래스즐');
    expect((await titlebar.boundingBox()).height).toBe(34);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--shell-top').trim())).toBe('34px');
    for (const name of ['창 최소화', '창 최대화', '앱 닫기']) {
        await expect(titlebar.getByRole('button', { name })).toBeVisible();
    }
    checks.push('34px 제목 바, 창 버튼 3개, 메뉴 없음');

    // 본문 영역 약속
    const main = page.locator('main');
    expect(await main.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.flexGrow, s.minHeight, s.overflowY].join();
    })).toBe('1,0px,auto');
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    checks.push('본문 영역이 flex-1 min-h-0 overflow-auto, 창 전체는 스크롤되지 않음');

    // 옛 머리글과 푸터가 없고, 사이드바에 로고와 슬로건이 있음
    const sidebar = page.locator('aside[data-sidebar="expanded"]');
    await expect(sidebar).toContainText('클래스즐');
    await expect(sidebar).toContainText('Classzle');
    await expect(sidebar).toContainText('완벽한 반 편성을 위한');
    await expect(page.getByText('All rights reserved')).toHaveCount(0);
    await expect(page.locator('img[src*="logo.jpg"]')).toHaveCount(0);
    await shot('1-step1');
    checks.push('사이드바 로고와 슬로건, 옛 머리글과 저작권 푸터 없음');

    // 단계 이동
    await page.locator('input[type=file]').first().setInputFiles(path.join(root, 'sample-students-12class.xlsx'));
    await expect(page.locator('[data-roster-summary]')).toContainText('330명', { timeout: 30000 });
    await page.getByRole('tab', { name: '2단계 조건 설정' }).click();
    await page.getByRole('tab', { name: /^분리 배정/ }).waitFor();
    await shot('2-step2');
    await page.getByRole('tab', { name: '3단계 반 편성' }).click();
    await page.getByRole('button', { name: '배정 실행' }).waitFor();
    await shot('3-step3');
    checks.push('1~3단계 메뉴로 이동, 가상 명단 330명');

    // 저장과 앱 안의 확인 창
    await sidebar.getByRole('button', { name: '작업 저장' }).click();
    await page.getByLabel('이름').fill('가상 작업');
    await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await expect(sidebar.getByRole('button', { name: '가상 작업', exact: true })).toBeVisible();
    await expect(titlebar).toContainText('가상 작업');
    checks.push('이름을 정해 저장하면 목록과 제목 바에 나옴');

    // 지금 연 작업을 다시 저장하면 묻지 않고, 다른 작업의 이름이면 묻습니다.
    const saveAs = async (name) => {
        await sidebar.getByRole('button', { name: '작업 저장' }).click();
        await page.getByLabel('이름').fill(name);
        await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    };
    await saveAs('가상 작업');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await saveAs('가상 작업 2');
    await expect(sidebar.getByRole('button', { name: '가상 작업 2', exact: true })).toBeVisible();
    await saveAs('가상 작업');
    const overwrite = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: '이미 있습니다' }));
    await expect(overwrite).toContainText('이미 있습니다');
    await shot('4a-overwrite');
    await overwrite.getByRole('button', { name: '취소' }).click();
    await expect(page.getByLabel('이름')).toHaveValue('가상 작업');
    await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
    await saveAs('가상 작업');
    await page.getByRole('dialog').filter({ hasText: '이미 있습니다' }).getByRole('button', { name: '덮어쓰기' }).click();
    await expect(titlebar).toContainText('가상 작업');
    await sidebar.getByRole('button', { name: '가상 작업 2 삭제' }).click({ force: true });
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
    await expect(sidebar.getByRole('button', { name: '가상 작업 2', exact: true })).toHaveCount(0);
    checks.push('같은 이름은 앱 안의 창으로 묻고, 지금 연 작업을 다시 저장하면 묻지 않음');

    await sidebar.getByRole('button', { name: '가상 작업', exact: true }).click();
    const confirmDialog = page.getByRole('dialog');
    await expect(confirmDialog).toContainText('이 작업을 불러올까요?');
    await shot('4-confirm');
    await confirmDialog.getByRole('button', { name: '취소' }).click();
    await expect(page.getByRole('tab', { name: '3단계 반 편성' })).toHaveAttribute('data-state', 'active');
    await sidebar.getByRole('button', { name: '가상 작업', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '불러오기' }).click();
    await expect(page.getByRole('tab', { name: '1단계 기초 정보' })).toHaveAttribute('data-state', 'active');
    checks.push('불러오기 전에 앱 안의 창으로 묻고, 취소하면 그대로임');

    await sidebar.getByRole('button', { name: '가상 작업 삭제' }).click({ force: true });
    await expect(page.getByRole('dialog')).toContainText('작업을 지울까요?');
    await page.keyboard.press('Escape');
    await expect(sidebar.getByRole('button', { name: '가상 작업', exact: true })).toBeVisible();
    await sidebar.getByRole('button', { name: '가상 작업 삭제' }).click({ force: true });
    await page.getByRole('dialog').getByRole('button', { name: '삭제' }).click();
    await expect(sidebar.getByRole('button', { name: '가상 작업', exact: true })).toHaveCount(0);
    expect(nativeDialogs).toEqual([]);
    checks.push('삭제도 앱 안의 창으로 묻고, Esc는 취소임. 기본 확인 창 없음');

    // 파일로 내보내기와 파일 열기 (1.3.2). 윈도 저장·열기 창은 메인 프로세스에서 바꿔 끼워 고른 것처럼 답합니다.
    const exported = path.join(profile, '내보낸 작업.json');
    const stubDialog = (kind, answer) =>
        app.evaluate(({ dialog }, [k, a]) => {
            globalThis.__dialogCalls = [];
            dialog[k] = async (...args) => {
                // 창을 함께 넘기면 설정은 둘째 값입니다.
                const { title, defaultPath } = args[args.length - 1];
                globalThis.__dialogCalls.push({ title, defaultPath });
                return a;
            };
        }, [kind, answer]);
    const dialogCalls = () => app.evaluate(() => globalThis.__dialogCalls);
    await stubDialog('showSaveDialog', { canceled: true });
    await sidebar.getByRole('button', { name: '파일로 내보내기' }).click();
    await expect.poll(dialogCalls).toHaveLength(1);
    await expect(page.getByText('파일로 내보냈습니다')).toHaveCount(0);
    await stubDialog('showSaveDialog', { canceled: false, filePath: exported });
    await sidebar.getByRole('button', { name: '파일로 내보내기' }).click();
    await expect(page.getByText("'내보낸 작업.json' 파일로 내보냈습니다.")).toBeVisible();
    const [saveOptions] = await dialogCalls();
    expect(saveOptions.title).toBe('작업을 파일로 내보내기');
    expect(saveOptions.defaultPath).toBe('클래스즐 작업.json');
    const exportedData = JSON.parse(await fs.readFile(exported, 'utf8'));
    expect(Object.keys(exportedData).sort()).toEqual(['groups', 'movementHistory', 'settings', 'students']);
    expect(exportedData.students).toHaveLength(330);
    checks.push('파일로 내보내기: 취소하면 조용하고, 고른 곳에 목록 저장과 같은 모양(학생 330명)으로 씀');

    const broken = path.join(profile, '깨진 파일.json');
    await fs.writeFile(broken, '{"students": 3}', 'utf8');
    await stubDialog('showOpenDialog', { canceled: false, filePaths: [broken] });
    await sidebar.getByRole('button', { name: '파일 열기' }).click();
    await expect(page.getByText('올바르지 않은 작업 파일입니다.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await stubDialog('showOpenDialog', { canceled: false, filePaths: [exported] });
    await page.getByRole('tab', { name: '3단계 반 편성' }).click();
    await sidebar.getByRole('button', { name: '파일 열기' }).click();
    await expect(page.getByRole('dialog')).toContainText('이 작업을 불러올까요?');
    await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
    await expect(page.getByRole('tab', { name: '3단계 반 편성' })).toHaveAttribute('data-state', 'active');
    await sidebar.getByRole('button', { name: '파일 열기' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '불러오기' }).click();
    await expect(page.getByText("'내보낸 작업.json' 파일을 불러왔습니다.")).toBeVisible();
    await expect(page.getByRole('tab', { name: '1단계 기초 정보' })).toHaveAttribute('data-state', 'active');
    await expect(page.locator('[data-roster-summary]')).toContainText('330명');
    expect((await dialogCalls())[0].title).toBe('작업 파일 열기');
    // 1단계에는 '이름 찾기' 칸이 있어 저장 창 안에서 찾습니다.
    await sidebar.getByRole('button', { name: '작업 저장' }).click();
    await page.getByRole('dialog').getByLabel('이름').fill('파일에서 연 작업');
    await page.getByRole('dialog').getByRole('button', { name: '저장', exact: true }).click();
    await expect(sidebar.getByRole('button', { name: '파일에서 연 작업', exact: true })).toBeVisible();
    await expect.poll(() => fs.readFile(path.join(userData, 'projects', '파일에서 연 작업.json'), 'utf8').then((t) => JSON.parse(t).students.length, () => 0)).toBe(330);
    await shot('4b-opened-file');
    checks.push('파일 열기: 잘못된 파일은 묻기 전에 알리고, 올바른 파일은 묻고 연 뒤 작업 저장으로 목록에 넣음');

    // 사용 가이드
    await sidebar.getByRole('button', { name: '클래스즐 사용 가이드' }).click();
    const guide = page.getByRole('dialog');
    await expect(guide.getByRole('heading', { name: '클래스즐 사용 가이드' })).toBeVisible();
    await expect(guide).toContainText('저장 파일은 암호화되지 않습니다.');
    await expect(guide).toContainText('학생 정보는 이 컴퓨터 밖으로 나가지 않습니다.');
    await expect(guide).toContainText('Ctrl + 0');
    await expect(guide.locator('[data-guide-work-file]')).toContainText('파일로 내보내기');
    await expect(guide).toContainText(`버전 ${version}`);
    await expect(guide.locator('[data-made-by] img')).toBeVisible();
    // made by gnilab을 누르면 기본 브라우저로 gnilab.kr을 엽니다(2026-11-09). 새 창은 생기지 않습니다.
    await app.evaluate(({ shell }) => {
        globalThis.__opened = [];
        shell.openExternal = (url) => (globalThis.__opened.push(url), Promise.resolve());
    });
    const windowsBefore = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    await guide.locator('a[data-made-by]').click();
    await expect.poll(() => app.evaluate(() => globalThis.__opened)).toEqual(['https://gnilab.kr/']);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(windowsBefore);
    for (const number of ['01', '02', '03', '04', '05', '06']) await expect(guide).toContainText(number);
    await shot('5-guide');
    await guide.getByRole('button', { name: '확인' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    checks.push('사용 가이드에 암호화 안내, 순서, 버전, made by gnilab이 있음');

    // 접은 사이드바
    await sidebar.getByRole('button', { name: '메뉴 접기' }).click();
    const rail = page.locator('aside[data-sidebar="collapsed"]');
    expect((await rail.boundingBox()).width).toBe(56);
    for (const name of ['작업 저장', '파일 열기', '파일로 내보내기']) await expect(rail.getByRole('button', { name })).toBeVisible();
    await page.getByRole('tab', { name: '3단계 반 편성' }).click();
    await expect(page.getByRole('tab', { name: '3단계 반 편성' })).toHaveAttribute('data-state', 'active');
    await shot('6-rail');
    await rail.getByRole('button', { name: '메뉴 펼치기' }).click();
    await expect(sidebar).toBeVisible();
    checks.push('56px 아이콘 줄로 접고 다시 펼침, 접어도 단계 이동됨, 접은 줄에도 저장·파일 열기·파일로 내보내기');

    // 확대 단축키: 메뉴가 없어도 Ctrl + +, Ctrl + -, Ctrl + 0이 동작하고, 값을 자료 폴더에 기억합니다.
    // Playwright의 키 입력은 메인 프로세스의 before-input-event까지 가지 않으므로 실제 키보드와 같은 길(sendInputEvent)로 누릅니다.
    const zoomLevel = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel());
    const pressCtrl = (keyCode) => app.evaluate(({ BrowserWindow }, k) => BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: ['control'] }), keyCode);
    await pressCtrl('=');
    await expect.poll(zoomLevel).toBe(0.5);
    await pressCtrl('=');
    await expect.poll(zoomLevel).toBe(1);
    await pressCtrl('-');
    await expect.poll(zoomLevel).toBe(0.5);
    await expect.poll(async () => fs.readFile(path.join(userData, 'zoom.json'), 'utf8').catch(() => '')).toContain('0.5');
    await pressCtrl('0');
    await expect.poll(zoomLevel).toBe(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    checks.push('Ctrl + +, Ctrl + -, Ctrl + 0으로 앱 전체 확대, 확대 값을 자료 폴더에 기억');

    expect(errors).toEqual([]);
    console.log(JSON.stringify({ checks }, null, 2));
} finally {
    await app?.close().catch(() => {});
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
