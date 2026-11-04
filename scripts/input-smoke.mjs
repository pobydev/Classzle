// 생활지도 빠른 입력과 반별 입력표를 실제 앱으로 끝까지 시험합니다.
// 자료는 임시 폴더에 두고 명단은 저장소의 가상 표본입니다. 입력표도 임시 폴더에 만들고 지웁니다.
// 사용: npm run electron:build-main && npm run build, 그 뒤 PW_DIR=<폴더> node scripts/input-smoke.mjs
// 화면 사진은 INPUT_SHOTS 폴더에 저장합니다.
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import * as XLSX from 'xlsx';

const { _electron: electron, expect } = createRequire(path.join(path.resolve(process.env.PW_DIR), 'x.js'))(
    '@playwright/test',
);

const root = process.cwd();
const shots = process.env.INPUT_SHOTS;
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-input-'));
const userData = path.join(profile, 'data');
const sheetsDir = path.join(profile, 'sheets');
await fs.mkdir(sheetsDir);
const env = { ...process.env, NODE_ENV: 'production' };
delete env.ELECTRON_RUN_AS_NODE;

const checks = [];
const errors = [];
let app;

const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('classzle-storage') || '{}').state);

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
    await app.evaluate(({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        w.unmaximize();
        w.setSize(1600, 950);
    });

    const page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', async (d) => {
        errors.push(`기본 창: ${d.message()}`);
        await d.dismiss();
    });
    const shot = async (name) => {
        if (!shots) return;
        await fs.mkdir(shots, { recursive: true });
        await page.screenshot({ path: path.join(shots, `${name}.png`) });
    };

    await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });
    // 반별 입력표 내보내기: 담임에게 받기 메뉴 → 내보내기 창(개인정보 안내) → 내보내기
    const exportSheets = async () => {
        await page.getByRole('button', { name: '담임에게 받기' }).click();
        await page.getByRole('menuitem', { name: '반별 입력표 내보내기' }).click();
        await expect(page.getByRole('dialog')).toContainText('번호, 이름, 성별만 들어갑니다');
        await page.getByRole('dialog').getByRole('button', { name: '내보내기' }).click();
        await expect(page.getByRole('dialog').filter({ hasText: '번호, 이름, 성별만 들어갑니다' })).toHaveCount(0);
    };
    await page.locator('input[type=file]').first().setInputFiles(path.join(root, 'sample-students-12class.xlsx'));
    await expect(page.locator('[data-roster-summary]')).toContainText('330명', { timeout: 30000 });

    // ---- 빠른 입력: 표본의 값을 모두 지운 채로 시작합니다. ----
    await page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem('classzle-storage'));
        raw.state.students = raw.state.students.map((s) => ({ ...s, behavior_type: 'NONE', behavior_score: 0 }));
        localStorage.setItem('classzle-storage', JSON.stringify(raw));
    });
    await page.reload();
    await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });
    await page.locator('[data-student-table]').waitFor();
    await expect(page.locator('[data-behavior-total]')).toContainText('생활지도 0/330');

    await page.getByRole('tab', { name: /^1반 / }).click();
    const pickers = page.locator('[data-behavior-picker]');
    const count = await pickers.count();
    expect(count).toBeGreaterThanOrEqual(28);

    // 키보드: 학생 30명 몫을 한 반 28명 + 다음 반 2명으로 잽니다. 값이 있는 학생은 숫자, 없는 학생은 아래 키입니다.
    const values = ['3', 'ArrowDown', 'ArrowDown', '1', 'ArrowDown', '7', 'ArrowDown', '5', '2', 'ArrowDown'];
    await pickers.first().focus();
    let keyPresses = 0;
    const started = Date.now();
    for (let i = 0; i < count; i++) {
        await page.keyboard.press(values[i % values.length]);
        keyPresses++;
    }
    // 다음 반 2명까지 이어서 입력합니다: 탭 누르기 1번, 첫 칸으로 가기 1번, 키 2번입니다.
    await page.getByRole('tab', { name: /^2반 / }).click();
    await page.locator('[data-behavior-picker]').first().focus();
    await page.keyboard.press('4');
    await page.keyboard.press('ArrowDown');
    keyPresses += 2;
    const otherActions = 2;
    const typed = count + 2;
    expect(typed).toBe(30);
    const keyboardMs = Date.now() - started;
    await page.getByRole('tab', { name: /^1반 / }).click();
    let state = await stored(page);
    const firstClass = state.students.filter((s) => s.prev_info.startsWith('2-1-'));
    const entered = firstClass.filter((s) => s.behavior_type !== 'NONE').length;
    expect(entered).toBeGreaterThan(0);
    await expect(page.locator('[data-behavior-missing]')).toContainText('3반');
    await shot('1-quick-keyboard');
    checks.push(`키보드: ${typed}명에 입력 키 ${keyPresses}번, 반 옮기기 등 ${otherActions}번, 한 명 평균 ${Math.round(keyboardMs / typed)}ms`);

    // 마우스: 값 있는 학생만 한 번 누릅니다. 다시 누르면 해제합니다.
    const before = (await stored(page)).students.find((s) => s.prev_info === '2-1-2');
    const secondRow = page.locator('tbody tr').nth(1);
    await secondRow.getByRole('radio', { name: '정서 -2' }).click();
    state = await stored(page);
    expect(state.students.find((s) => s.id === before.id)).toMatchObject({ behavior_type: 'EMOTIONAL', behavior_score: -2 });
    await secondRow.getByRole('radio', { name: '정서 -2' }).click();
    state = await stored(page);
    expect(state.students.find((s) => s.id === before.id).behavior_type).toBe('NONE');
    checks.push('마우스: 값을 한 번 누르면 들어가고, 다시 누르면 해제됨');

    // 전체 탭 330명에서도 한 번 누르는 데 걸리는 시간
    await page.getByRole('tab', { name: /^전체 330명/ }).click();
    await page.locator('[data-behavior-picker]').nth(329).waitFor({ state: 'attached' });
    const clickMs = await page.evaluate(async () => {
        const button = document.querySelector('[data-behavior-picker] [role=radio]');
        const start = performance.now();
        button.click();
        await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
        return performance.now() - start;
    });
    checks.push(`330명 표에서 값 하나 넣기: ${Math.round(clickMs)}ms`);
    expect(clickMs).toBeLessThan(300);

    // 거르기
    await page.getByRole('switch', { name: '생활지도 있는 학생만' }).click();
    const filtered = await page.locator('[data-behavior-picker]').count();
    const withBehavior = (await stored(page)).students.filter((s) => s.behavior_type !== 'NONE').length;
    expect(filtered).toBe(withBehavior);
    await shot('2-only-with-behavior');
    await page.getByRole('switch', { name: '생활지도 있는 학생만' }).click();
    checks.push(`생활지도 있는 학생만: ${filtered}명`);

    // 수정 칸은 그대로 있습니다.
    const beforeEdit = (await stored(page)).students;
    const firstRow = page.locator('tbody tr').first();
    await firstRow.getByRole('button', { name: /수정$/ }).click();
    await firstRow.getByRole('button', { name: '완료' }).click();
    expect((await stored(page)).students).toEqual(beforeEdit);
    checks.push('이름, 성적 수정은 수정과 완료 방식 그대로');

    // ---- 반별 입력표 ----
    const original = (await stored(page)).students;
    await app.evaluate(({ dialog }, folder) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
    }, sheetsDir);
    await exportSheets();
    await page.getByText('입력표 12개를 저장했습니다.').waitFor({ timeout: 30000 });
    let names = (await fs.readdir(sheetsDir)).sort();
    expect(names).toHaveLength(12);
    await shot('3-exported');
    checks.push('12개 반 입력표를 파일 12개로 내보냄');

    // 내용 확인
    for (const name of names) {
        const book = XLSX.read(await fs.readFile(path.join(sheetsDir, name)));
        const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]).filter((row) => row.이름);
        const classNum = Number(name.match(/2학년 (\d+)반/)[1]);
        const classStudents = original.filter((s) => s.prev_info.split('-')[1] === String(classNum));
        // 다른 반에 같은 이름이 있을 수 있으므로 반, 번호, 이름을 함께 비교합니다.
        expect(rows.map((row) => `${row.학년}-${row.반}-${row.번호} ${row.이름}`).sort()).toEqual(
            classStudents.map((s) => `${s.prev_info} ${s.name}`).sort(),
        );
        for (const row of rows) {
            expect(Object.keys(row).filter((key) => !key.startsWith('__EMPTY')).sort()).toEqual(['반', '번호', '성별', '이름', '학년'].sort());
        }
    }
    checks.push('각 파일에 그 반 학생만 있고 성적이 없음');

    // 같은 폴더에 다시 내보내면 먼저 묻습니다.
    await exportSheets();
    await expect(page.getByRole('dialog')).toContainText('이미 있습니다');
    await page.getByRole('dialog').getByRole('button', { name: '취소' }).click();
    checks.push('같은 이름의 입력표가 있으면 덮어쓰기 전에 물음');

    // 담임이 값을 채운 것처럼 만듭니다: 반마다 한 명에 값을 넣고, 1반에는 이름 오타와 읽지 못한 값을 넣습니다.
    const expected = new Map();
    const fills = ['행동(-2)', '정서(-1)', '리더(+2)', '행동(-3)'];
    const filled = [];
    for (const [index, name] of names.entries()) {
        const full = path.join(sheetsDir, name);
        const book = XLSX.read(await fs.readFile(full));
        const sheet = book.Sheets[book.SheetNames[0]];
        const value = fills[index % fills.length];
        sheet.F2 = { t: 's', v: value };
        const student = XLSX.utils.sheet_to_json(sheet)[0];
        expected.set(`${student.학년}-${student.반}-${student.번호}`, value);
        if (name.startsWith('2학년 1반')) {
            sheet.D3 = { t: 's', v: '가상오타' };
            sheet.F3 = { t: 's', v: '행동(-1)' };
            sheet.F4 = { t: 's', v: '행동(-9)' };
        }
        await fs.writeFile(full, XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
        filled.push(full);
    }
    // 같은 반 파일을 하나 더 넣은 경우
    const copy = path.join(sheetsDir, '2학년 12반 수정본.xlsx');
    await fs.copyFile(filled[filled.findIndex((f) => f.includes('2학년 12반'))], copy);

    const beforeImport = (await stored(page)).students;
    const input = page.locator('[data-class-sheet-input]');
    await input.setInputFiles([...filled, copy]);
    const summary = page.getByRole('dialog');
    await expect(summary).toContainText('명을 반영할까요?');
    await expect(summary).toContainText('2학년 1반');
    await expect(summary).toContainText('못 맞춘 학생 1명');
    await expect(summary).toContainText('가상오타');
    await expect(summary).toContainText('읽지 못한 값 1개');
    await expect(summary).toContainText('행동(-9)');
    await expect(summary).toContainText('같은 반 파일이 둘 이상');
    await expect(summary).toContainText('2학년 12반 수정본.xlsx');
    await shot('4-import-summary');
    checks.push('반영 전 요약: 반별 인원, 못 맞춤, 읽지 못한 값, 같은 반 파일');

    // 취소하면 아무것도 바뀌지 않습니다.
    await summary.getByRole('button', { name: '취소' }).click();
    expect((await stored(page)).students).toEqual(beforeImport);
    checks.push('취소하면 바뀌지 않음');

    await input.setInputFiles([...filled, copy]);
    await page.getByRole('dialog').getByRole('button', { name: '반영' }).click();
    await page.getByText(/생활지도 \d+명을 반영했습니다/).waitFor();
    const after = (await stored(page)).students;

    const strip = ({ behavior_type, behavior_score, ...rest }) => rest;
    expect(after.map(strip)).toEqual(beforeImport.map(strip));
    checks.push('생활지도 외의 칸은 330명 모두 그대로');

    const label = { 리더: 'LEADER', 행동: 'BEHAVIOR', 정서: 'EMOTIONAL' };
    let applied = 0;
    for (const student of after) {
        const key = student.prev_info;
        const value = expected.get(key);
        const [grade, classNum] = key.split('-');
        if (!value) continue;
        if (classNum === '12') {
            // 같은 반 파일이 둘이라 반영하지 않습니다.
            expect(student.behavior_type).toBe(beforeImport.find((s) => s.id === student.id).behavior_type);
            continue;
        }
        const match = value.match(/(리더|행동|정서)\(([+-]\d)\)/);
        expect(student).toMatchObject({ behavior_type: label[match[1]], behavior_score: Number(match[2]) });
        applied++;
        expect(grade).toBe('2');
    }
    expect(applied).toBe(11);
    const typoRowStudent = after.find((s) => s.prev_info === '2-1-2');
    expect(typoRowStudent.behavior_score).toBe(beforeImport.find((s) => s.id === typoRowStudent.id).behavior_score);
    await shot('5-imported');
    checks.push('11개 반의 값이 반영되고, 이름 오타와 같은 반 파일은 반영되지 않음');

    // 받은 뒤 파일은 그대로 두되 앱은 파일을 지우지 않습니다.
    await page.getByRole('button', { name: '클래스즐 사용 가이드' }).first().click();
    await expect(page.getByRole('dialog')).toContainText('둘 다 있으면 정도를 감안해 하나만 고릅니다');
    await expect(page.getByRole('dialog')).toContainText('반별 입력표 내보내기');
    await page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
    checks.push('사용 가이드에 하나만 고르는 기준과 입력표 방법이 있음');

    expect(errors).toEqual([]);
    console.log(JSON.stringify({ checks }, null, 2));
} finally {
    await app?.close().catch(() => {});
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
