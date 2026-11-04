// 독립 검토에서 고친 항목 가운데 화면과 메인 프로세스를 함께 봐야 하는 것을 실제 앱으로 시험합니다.
// 자료는 임시 폴더에 두고 명단은 저장소의 가상 표본입니다.
// 사용: npm run electron:build-main && npm run build, 그 뒤 PW_DIR=<폴더> node scripts/review-smoke.mjs
import { promises as fs } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';

const { _electron: electron, expect } = createRequire(path.join(path.resolve(process.env.PW_DIR), 'x.js'))(
    '@playwright/test',
);

const root = process.cwd();
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-review-'));
const userData = path.join(profile, 'data');
const projects = path.join(userData, 'projects');
await fs.mkdir(projects, { recursive: true });
await fs.writeFile(path.join(projects, '깨진 작업.json'), JSON.stringify({ students: '이상한 값', settings: { classCount: 3 } }));
const env = { ...process.env, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;

const checks = [];
const errors = [];
let app;

const exists = (file) => fs.access(file).then(() => true, () => false);
const walk = async (dir) =>
    (await Promise.all((await fs.readdir(dir, { withFileTypes: true })).map((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])))).flat();

try {
    app = await electron.launch({
        executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['.', `--user-data-dir=${userData}`],
        cwd: root,
        env,
        timeout: 60000,
    });
    const actual = await app.evaluate(({ app: a }) => a.getPath('userData'));
    if (path.resolve(actual) !== path.resolve(userData)) throw new Error('시험이 임시 폴더가 아닌 곳을 쓰고 있어 멈춥니다.');
    await app.evaluate(({ shell }) => {
        global.opened = [];
        shell.openExternal = async (url) => void global.opened.push(url);
    });

    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => {
        errors.push(`기본 창: ${d.message()}`);
        await d.dismiss();
    });
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('classzle-storage') || '{}').state);
    const dialog = page.getByRole('dialog');
    const sidebar = page.locator('aside[data-sidebar="expanded"]');
    const dismiss = async () => {
        for (let i = 0; i < 3 && (await dialog.isVisible().catch(() => false)); i++) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
        }
    };
    const saveAs = async (name) => {
        await sidebar.getByRole('button', { name: '작업 저장' }).click();
        await page.locator('#project-name').fill(name);
        await dialog.getByRole('button', { name: '저장', exact: true }).click();
        await page.waitForTimeout(300);
    };
    const closePreviews = () =>
        app.evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows().filter((w) => w.getSize()[0] === 1000 && w.getSize()[1] === 800).forEach((w) => w.close());
        });

    await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });

    // 11. 형식이 다른 저장 파일
    await sidebar.getByText('깨진 작업').click();
    await expect(page.getByText('올바르지 않은 작업 파일입니다.').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: '1단계 기초 정보' })).toBeVisible();
    expect(errors).toEqual([]);
    checks.push('11 형식이 다른 저장 파일을 알리고 화면이 그대로임');

    await page.locator('input[type=file]').first().setInputFiles(path.join(root, 'sample-students-12class.xlsx'));
    await expect(page.locator('[data-roster-summary]')).toContainText('330명', { timeout: 30000 });

    // 1. 저장 이름
    for (const name of ['14:30 저장', '../밖으로']) {
        await saveAs(name);
        await expect(dialog).toContainText('작업 저장');
        await dismiss();
    }
    expect(await exists(path.join(projects, '14'))).toBe(false);
    expect(await exists(path.join(userData, '밖으로.json'))).toBe(false);
    expect(await page.evaluate(() => window.electronAPI.saveNamedProject('../밖으로', '{}'))).toBe(false);
    expect(await exists(path.join(userData, '밖으로.json'))).toBe(false);
    await saveAs('이름.json 백업');
    await expect(sidebar.getByText('이름.json 백업', { exact: true })).toBeVisible();
    checks.push('1 쓸 수 없는 이름을 화면과 메인에서 막고, 이름 안의 .json은 그대로임');

    // 2. 묻지 않는 덮어쓰기
    await saveAs('Test');
    const testFile = path.join(projects, 'Test.json');
    const before = (await fs.stat(testFile)).mtimeMs;
    await saveAs('다른 작업');
    await saveAs('test');
    await expect(dialog).toContainText('이미 있습니다');
    await dismiss();
    await dismiss();
    expect((await fs.stat(testFile)).mtimeMs).toBe(before);

    await saveAs('Test');
    await dialog.getByRole('button', { name: '덮어쓰기' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: '기초 정보 메뉴' }).click();
    await page.getByRole('menuitem', { name: '전체 초기화' }).click();
    await dialog.getByRole('button', { name: '전체 초기화' }).click();
    await page.waitForTimeout(300);
    await expect(page.locator('.titlebar')).not.toContainText('Test');
    const afterReset = (await fs.stat(testFile)).mtimeMs;
    await saveAs('Test');
    await expect(dialog).toContainText('이미 있습니다');
    await dismiss();
    await dismiss();
    expect((await fs.stat(testFile)).mtimeMs).toBe(afterReset);
    checks.push('2 대소문자만 다른 이름과 초기화 뒤 옛 이름에 덮어쓸지 물음');

    await page.locator('input[type=file]').first().setInputFiles(path.join(root, 'sample-students-12class.xlsx'));
    await expect(page.locator('[data-roster-summary]')).toContainText('330명', { timeout: 30000 });

    // 4. 이름 열이 없는 엑셀
    const noName = path.join(profile, '이름없음.xlsx');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ 학년: 2, 반: 1, 번호: 1, 학생이름: '가상', 성별: '남', 성적: 500 }]), 'a');
    XLSX.writeFile(book, noName);
    const bytes = [...(await fs.readFile(noName))];
    await page.evaluate((data) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([new Uint8Array(data)], '이름없음.xlsx'));
        document.querySelector('[data-drop-zone]').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
    }, bytes);
    await expect(page.getByText('학생을 한 명도 읽지 못했습니다.')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    expect((await stored()).students).toHaveLength(330);
    checks.push('4 이름 열이 없는 엑셀은 오류이고 지금 작업이 그대로임');

    // 3. 학생 삭제
    const first = (await stored()).students.slice().sort((a, b) => a.prev_info.localeCompare(b.prev_info, undefined, { numeric: true }))[0];
    await page.getByRole('button', { name: `${first.name} 삭제` }).first().click();
    await expect(dialog).toContainText('지운 학생은 되돌릴 수 없습니다');
    expect((await stored()).students).toHaveLength(330);
    await dialog.getByRole('button', { name: '취소' }).click();
    expect((await stored()).students).toHaveLength(330);
    await page.getByRole('button', { name: `${first.name} 삭제` }).first().click();
    await dialog.getByRole('button', { name: '삭제' }).click();
    await page.waitForTimeout(200);
    expect((await stored()).students).toHaveLength(329);
    checks.push('3 학생을 지우기 전에 묻고, 취소하면 그대로임');

    // 2단계: 기준 학생을 고르면 왼쪽이 상대 고르기가 되고, 저장하면 탭의 개수가 늘어남
    await page.getByRole('tab', { name: '2단계 조건 설정' }).click();
    const avoidTab = page.getByRole('tab', { name: /^분리 배정/ });
    await avoidTab.click();
    await expect(avoidTab).toContainText('0');
    const picks = page.locator('[data-pick-student]');
    await picks.first().click();
    await expect(page.locator('section[aria-label="학생 고르기"] h3')).toContainText('상대 고르기');
    await picks.first().click();
    await expect(picks.first()).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-step2-save]').click();
    await expect(avoidTab).toContainText('1');
    await expect(page.locator('[data-relation-list]')).toBeVisible();
    await expect(page.locator('section[aria-label="학생 고르기"] h3')).toContainText('기준 학생 고르기');
    checks.push('2단계: 기준 학생 → 상대 고르기 → 저장, 탭에 설정한 개수');

    // 8. 2단계에서 사이드바로 옮기기
    await page.getByRole('tab', { name: /^전출 예정/ }).click();
    await page.locator('[data-pick-student]').first().click();
    await page.getByRole('tab', { name: '1단계 기초 정보' }).click();
    await expect(dialog).toContainText('저장하지 않은 변경 사항이 있습니다');
    await dialog.getByRole('button', { name: '이 화면에 머무르기' }).click();
    await expect(page.getByRole('tab', { name: '2단계 조건 설정' })).toHaveAttribute('data-state', 'active');
    await page.getByRole('tab', { name: '3단계 반 편성' }).click();
    await dialog.getByRole('button', { name: '버리고 이동' }).click();
    await expect(page.getByRole('tab', { name: '3단계 반 편성' })).toHaveAttribute('data-state', 'active');
    checks.push('8 사이드바로 옮길 때 저장하지 않은 변경을 묻고 머무를 수 있음');

    // 14. 배정이 사라지면 신규 탭
    await page.getByRole('button', { name: /반편성 시작|배정 실행/ }).click();
    await page.waitForSelector('text=/명의 학생 배정이 변경|옮긴 학생이 없습니다/', { timeout: 120000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    // 골라 보기: 2~4반을 나란히 보고, 비교하는 동안에는 두 반으로 정했다가 끝나면 보던 칸으로 돌아갑니다.
    await expect(page.locator('[data-balance-table]')).not.toContainText('▲');
    await page.getByRole('tab', { name: /상세 배치 조정/ }).click();
    await page.getByRole('button', { name: '골라 보기' }).click();
    const pickView = page.locator('[data-view="two"]');
    await expect(pickView).toHaveAttribute('data-columns', '2');
    await expect(pickView.getByRole('button', { name: /칸 빼기$/ })).toHaveCount(0);
    await page.getByRole('button', { name: '반 추가' }).click();
    await page.getByRole('button', { name: '반 추가' }).click();
    await expect(pickView).toHaveAttribute('data-columns', '4');
    await expect(page.getByRole('button', { name: '반 추가' })).toHaveCount(0);
    await pickView.getByRole('button', { name: '4반 칸 빼기' }).click();
    await expect(pickView).toHaveAttribute('data-columns', '3');
    await pickView.locator('[data-chip]').first().click();
    await page.locator('[data-rec-row]').first().click();
    await expect(pickView).toHaveAttribute('data-columns', '2');
    await expect(pickView.getByRole('button', { name: /칸 빼기$/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '반 추가' })).toHaveCount(0);
    await page.locator('[data-board-panel]').getByRole('button', { name: '취소' }).click();
    await expect(pickView).toHaveAttribute('data-columns', '3');
    await page.getByRole('tab', { name: /학급별 균형 통계/ }).click();
    checks.push('골라 보기: 2~4반, 빼기와 반 추가, 비교하는 동안 두 반으로 정하고 끝나면 보던 칸으로 돌아감');

    await page.getByRole('tab', { name: /균형 조정/ }).click();
    await page.getByRole('button', { name: '반 편성 메뉴' }).click();
    await page.getByRole('menuitem', { name: '배정 초기화' }).click();
    await dialog.getByRole('button', { name: /초기화/ }).last().click();
    await expect(page.getByRole('tab', { name: /신규 배정/ })).toHaveAttribute('data-state', 'active');
    checks.push('14 배정이 모두 사라지면 탭이 신규로 돌아감');

    // 6. 리포트 HTML이 그대로 넘어와도 스크립트와 밖으로 나가는 요청이 없음
    let hits = 0;
    const server = http.createServer((_req, res) => {
        hits++;
        res.end('x');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const printed = await page.evaluate((p) =>
        window.electronAPI.printPreview(`<html><body>가상<img src="http://127.0.0.1:${p}/a.png"><link rel="stylesheet" href="http://127.0.0.1:${p}/a.css"><script>fetch('http://127.0.0.1:${p}/f')</script></body></html>`), port);
    expect(printed).toBe(true);
    await page.waitForTimeout(1500);
    expect(hits).toBe(0);
    server.close();
    checks.push('6 PDF 변환 창에서 스크립트가 돌지 않고 밖으로 요청이 나가지 않음');

    // 28, 31. 경로의 #, 임시 파일 정리
    await closePreviews();
    await page.waitForTimeout(500);
    const oddTemp = path.join(profile, 'temp#1');
    await fs.mkdir(oddTemp);
    await app.evaluate(({ app: a }, dir) => a.setPath('temp', dir), oddTemp);
    expect(await page.evaluate(() => window.electronAPI.printPreview('<html><body>가상</body></html>'))).toBe(true);
    await page.waitForTimeout(500);
    expect((await walk(oddTemp)).map((f) => path.extname(f))).toEqual(['.pdf']);
    await closePreviews();
    await page.waitForTimeout(800);
    expect(await walk(oddTemp)).toEqual([]);
    checks.push('31 폴더 이름에 #이 있어도 미리보기가 열림');
    checks.push('28 미리보기를 닫으면 임시 파일이 남지 않음');

    // 28. 인쇄 실패 안내. 임시 폴더 자리에 파일이 있으면 폴더를 만들지 못합니다.
    const blocked = path.join(profile, 'blocked');
    await fs.writeFile(blocked, '');
    await app.evaluate(({ app: a }, dir) => a.setPath('temp', dir), blocked);
    await page.getByRole('button', { name: /배정 리포트/ }).click();
    await page.getByRole('button', { name: '보고서 인쇄' }).click();
    await expect(page.getByText('인쇄 미리보기를 열지 못했습니다.').first()).toBeVisible();
    await dismiss();
    checks.push('28 인쇄가 실패하면 화면에 알림');

    // 27. 밖으로 넘기는 주소
    await page.evaluate(() => {
        for (const url of ['https://example.invalid/ok', 'http://example.invalid/', 'smb://example.invalid/share']) window.open(url);
    });
    await page.waitForTimeout(400);
    expect(await app.evaluate(() => global.opened)).toEqual(['https://example.invalid/ok']);
    checks.push('27 https 주소만 기본 브라우저로 넘김');

    // 29. 고르지 않은 폴더
    const notChosen = path.join(profile, '고르지 않은 폴더');
    await fs.mkdir(notChosen);
    const result = await page.evaluate((folder) => window.electronAPI.saveClassSheets([{ name: '가상.xlsx', data: new Uint8Array([1]) }], folder), notChosen);
    expect(result.status).toBe('failed');
    expect(await fs.readdir(notChosen)).toEqual([]);
    checks.push('29 고르지 않은 폴더에 입력표를 쓰지 않음');

    expect(errors).toEqual([]);
    console.log(JSON.stringify({ checks }, null, 2));
} finally {
    await app?.close().catch(() => {});
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
