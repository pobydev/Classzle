// 옛 저장 파일과 저장소의 나쁜 값을 실제 앱으로 시험합니다. 앱이 켜지는지까지 봐야 해서 앱을 여러 번 켭니다.
// 자료는 임시 폴더에 두고 학생은 가상입니다.
// 사용: npm run electron:build-main && npm run build, 그 뒤 PW_DIR=<폴더> node scripts/startup-smoke.mjs
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';

const { _electron: electron, expect } = createRequire(path.join(path.resolve(process.env.PW_DIR), 'x.js'))(
    '@playwright/test',
);

const root = process.cwd();
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-startup-'));
const env = { ...process.env, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;
const settings = { classCount: 3, scoreTolerance: 50, numberingMethod: 'mixed', useAdvancedConstraints: true };

// v1.2.4(57c5986)가 저장하던 학생 모양입니다. 결시 같은 글자는 NaN이 되어 저장하면 null입니다.
const oldStudent = (i, extra = {}) => ({
    id: `s${i}`, name: `가상${i}`, prev_info: `2-${(i % 3) + 1}-${i + 1}`, gender: i % 2 ? 'M' : 'F',
    academic_score: 500 + i, behavior_score: 0, behavior_type: 'NONE', behavior_note: '',
    group_ids: [], avoid_ids: [], keep_ids: [], assigned_class: `${(i % 3) + 1}반`, ...extra,
});
const roster = [oldStudent(0), oldStudent(1), oldStudent(2)];

const checks = [];
let count = 0;

async function launch(userData) {
    const app = await electron.launch({
        executablePath: path.join(root, 'node_modules/electron/dist/electron.exe'),
        args: ['.', `--user-data-dir=${userData}`],
        cwd: root,
        env,
        timeout: 60000,
    });
    const actual = await app.evaluate(({ app: a }) => a.getPath('userData'));
    if (path.resolve(actual) !== path.resolve(userData)) throw new Error('시험이 임시 폴더가 아닌 곳을 쓰고 있어 멈춥니다.');
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });
    return { app, page, errors };
}

const newProfile = async (files = {}) => {
    const userData = path.join(profile, `u${++count}`);
    await fs.mkdir(path.join(userData, 'projects'), { recursive: true });
    for (const [name, data] of Object.entries(files)) await fs.writeFile(path.join(userData, 'projects', `${name}.json`), JSON.stringify(data));
    return userData;
};
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('classzle-storage') || '{}').state);
const panel = (page) => page.locator('[data-import-notices]');
const sidebar = (page) => page.locator('aside[data-sidebar="expanded"]');

try {
    // 1. v1.2.4 파일
    {
        const students = [oldStudent(0, { academic_score: null, name: '결시학생' }), oldStudent(1)];
        const { app, page, errors } = await launch(await newProfile({ v124: { students, groups: [], settings } }));
        await sidebar(page).getByText('v124', { exact: true }).click();
        await expect(panel(page)).toContainText('결시학생');
        await expect(panel(page)).toContainText('500점');
        expect((await stored(page)).students[0].academic_score).toBe(500);
        // 저장소에 남은 null
        await page.evaluate(() => {
            const raw = JSON.parse(localStorage.getItem('classzle-storage'));
            raw.state.students[0].academic_score = null;
            localStorage.setItem('classzle-storage', JSON.stringify(raw));
        });
        await page.reload();
        await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });
        await expect(panel(page)).toContainText('결시학생');
        await expect.poll(async () => (await stored(page)).students[0].academic_score).toBe(500);
        expect(errors).toEqual([]);
        await app.close();
        checks.push('1 성적이 빈 v1.2.4 파일과 저장소의 null을 500점으로 넣고 이름을 알림');
    }

    // 2. 형식이 틀린 파일은 지금 작업을 건드리지 않음
    for (const [label, data] of [
        ['classCount 0', { students: roster, settings: { ...settings, classCount: 0 } }],
        ['classCount 2.5', { students: roster, settings: { ...settings, classCount: 2.5 } }],
        ['classCount 1e10', { students: roster, settings: { ...settings, classCount: 1e10 } }],
        ['classCount 3e7', { students: roster, settings: { ...settings, classCount: 3e7 } }],
        ['movementHistory [null]', { students: roster, settings, movementHistory: [null] }],
    ]) {
        const userData = await newProfile({ 시험: data });
        const first = await launch(userData);
        await first.page.locator('input[type=file]').first().setInputFiles(path.join(root, 'sample-students-12class.xlsx'));
        await first.page.getByText('330명의 학생 데이터 로드 완료').waitFor({ timeout: 30000 });
        await sidebar(first.page).getByText('시험', { exact: true }).click();
        await first.page.getByRole('dialog').getByRole('button', { name: '불러오기' }).click();
        await expect(first.page.getByText('올바르지 않은 작업 파일입니다.').first()).toBeVisible();
        const state = await stored(first.page);
        expect(state.students).toHaveLength(330);
        expect(first.errors).toEqual([]);
        await first.app.close();
        const again = await launch(userData);
        expect((await stored(again.page)).students).toHaveLength(330);
        await again.app.close();
        checks.push(`2 ${label} 파일을 거부하고 작업과 다음 실행이 그대로임`);
    }

    // 2. 저장소의 나쁜 값
    for (const [label, state, expected] of [
        ['classCount 1e10', { students: roster, groups: [], settings: { ...settings, classCount: 1e10 }, movementHistory: [] }, '학급 수'],
        ['movementHistory [null]', { students: roster, groups: [], settings, movementHistory: [null] }, '변경 이력'],
        ['students 글자', { students: '이상한 값', groups: [], settings, movementHistory: [] }, '학생 명단'],
        ['깨진 JSON', null, '읽지 못해'],
    ]) {
        const userData = await newProfile();
        const first = await launch(userData);
        await first.page.evaluate((text) => localStorage.setItem('classzle-storage', text), state ? JSON.stringify({ state, version: 0 }) : '{깨진');
        await first.app.close();
        const again = await launch(userData);
        await expect(panel(again.page)).toContainText(expected);
        await again.page.getByRole('tab', { name: '3단계 반 편성' }).click().catch(() => {});
        await again.page.waitForTimeout(500);
        expect(again.errors).toEqual([]);
        await again.app.close();
        checks.push(`2 저장소의 ${label}: 앱이 켜지고 안내함`);
    }

    // 5, 7, 11. 엑셀
    {
        const { app, page } = await launch(await newProfile());
        const write = (name, rows) => {
            const book = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'a');
            const file = path.join(profile, name);
            XLSX.writeFile(book, file);
            return file;
        };
        const bad = write('이름없음.xlsx', [{ 학생이름: '가상', 성별: '남', 성적: 1 }]);
        await page.locator('#file-upload').setInputFiles(bad);
        await expect(page.getByText('학생을 한 명도 읽지 못했습니다.')).toBeVisible();
        expect(await page.locator('#file-upload').evaluate((e) => e.value)).toBe('');
        checks.push('11 오류 뒤 같은 파일을 다시 고를 수 있게 입력값을 비움');

        const rows = Array.from({ length: 8 }, (_, i) => ({ 학년: 2, 반: 1, 번호: i + 1, 이름: `가상${i}`, 성별: '남', 성적: 500, 생활지도: '주의' }));
        rows[3].이전반 = 4;
        await page.locator('#file-upload').setInputFiles(write('섞임.xlsx', rows));
        await expect(panel(page)).toContainText('양식 A');
        await expect(panel(page)).toContainText('가상7');
        expect((await stored(page)).students.filter((s) => s.assigned_class)).toHaveLength(0);
        checks.push('5 칸 하나로 양식이 바뀌지 않고 어느 양식으로 읽었는지 알림');
        checks.push('7 읽지 못한 학생을 모두 이름으로 알림');
        await app.close();
    }

    console.log(JSON.stringify({ checks }, null, 2));
} finally {
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
