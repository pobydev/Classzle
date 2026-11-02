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
    await expect(titlebar).toContainText('클래즐');
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
    await expect(sidebar).toContainText('클래즐');
    await expect(sidebar).toContainText('Classzle');
    await expect(sidebar).toContainText('완벽한 반 편성을 위한');
    await expect(page.getByText('All rights reserved')).toHaveCount(0);
    await expect(page.locator('img[src*="logo.jpg"]')).toHaveCount(0);
    await shot('1-step1');
    checks.push('사이드바 로고와 슬로건, 옛 머리글과 저작권 푸터 없음');

    // 단계 이동
    await page.locator('input[type=file]').first().setInputFiles(path.join(root, 'sample-students-12class.xlsx'));
    await page.getByText('330명의 학생 데이터 로드 완료').waitFor({ timeout: 30000 });
    await page.getByRole('tab', { name: '2단계 조건 설정' }).click();
    await page.getByRole('button', { name: '피해야 할 관계' }).waitFor();
    await shot('2-step2');
    await page.getByRole('tab', { name: '3단계 반 편성' }).click();
    await page.getByRole('button', { name: /반편성 시작|배정 실행/ }).waitFor();
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

    // 사용 가이드
    await sidebar.getByRole('button', { name: 'Classzle 사용 가이드' }).click();
    const guide = page.getByRole('dialog');
    await expect(guide.getByRole('heading', { name: 'Classzle 사용 가이드' })).toBeVisible();
    await expect(guide).toContainText('저장 파일은 암호화되지 않습니다.');
    await expect(guide).toContainText('학생 정보는 이 컴퓨터 밖으로 나가지 않습니다.');
    await expect(guide).toContainText(`버전 ${version}`);
    await expect(guide.locator('[data-made-by] img')).toBeVisible();
    for (const number of ['01', '02', '03', '04', '05']) await expect(guide).toContainText(number);
    await shot('5-guide');
    await guide.getByRole('button', { name: '확인' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    checks.push('사용 가이드에 암호화 안내, 순서, 버전, made by gnilab이 있음');

    // 접은 사이드바
    await sidebar.getByRole('button', { name: '메뉴 접기' }).click();
    const rail = page.locator('aside[data-sidebar="collapsed"]');
    expect((await rail.boundingBox()).width).toBe(56);
    await page.getByRole('tab', { name: '3단계 반 편성' }).click();
    await expect(page.getByRole('tab', { name: '3단계 반 편성' })).toHaveAttribute('data-state', 'active');
    await shot('6-rail');
    await rail.getByRole('button', { name: '메뉴 펼치기' }).click();
    await expect(sidebar).toBeVisible();
    checks.push('56px 아이콘 줄로 접고 다시 펼침, 접어도 단계 이동됨');

    expect(errors).toEqual([]);
    console.log(JSON.stringify({ checks }, null, 2));
} finally {
    await app?.close().catch(() => {});
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
