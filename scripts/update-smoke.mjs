// 포장한 앱으로 새 버전 확인을 시험합니다. 어울림, ScoreShow와 같은 순서입니다.
// 이 컴퓨터의 시험용 서버만 쓰고 실제 설치는 하지 않습니다. 자료는 임시 폴더에 둡니다.
// 사용: npm run electron:build, 그 뒤 PW_DIR=<폴더> node scripts/update-smoke.mjs
// 화면 사진은 UPDATE_SHOTS 폴더에 저장합니다.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const { _electron: electron, expect } = createRequire(path.join(path.resolve(process.env.PW_DIR), 'x.js'))(
    '@playwright/test',
);

const root = process.cwd();
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'dist');
const exe = path.join(release, 'win-unpacked', 'Classzle.exe');
const installerName = `Classzle-Setup-${version}.exe`;
const installer = path.join(release, installerName);
const shots = process.env.UPDATE_SHOTS;

const bytes = await fs.readFile(installer);
const sha512 = createHash('sha512').update(bytes).digest('base64');
const latest = (v) => `version: ${v}
files:
  - url: ${installerName}
    sha512: ${sha512}
    size: ${bytes.length}
path: ${installerName}
sha512: ${sha512}
releaseDate: '${new Date().toISOString()}'
`;

// null이면 404로 답합니다. 시험용 서버를 막는 학교 인터넷과 같습니다.
let feedVersion = null;
let failDownload = false;
const requests = [];
const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, 'http://feed').pathname.slice(1));
    requests.push(name);
    if (name === 'latest.yml' && feedVersion) {
        res.writeHead(200, { 'content-type': 'text/yaml' });
        res.end(latest(feedVersion));
    } else if (name === installerName && !failDownload) {
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': bytes.length });
        // 내려받는 중 문구를 볼 수 있게 잠깐 멈춥니다.
        setTimeout(() => createReadStream(installer).pipe(res), 4000);
    } else {
        res.writeHead(404);
        res.end();
    }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-update-'));
const env = {
    ...process.env,
    CLASSZLE_UPDATE_FEED: `http://127.0.0.1:${server.address().port}/`,
    LOCALAPPDATA: profile,
};
delete env.ELECTRON_RUN_AS_NODE;

const checks = [];
const errors = [];
let log = '';
let app;
let page;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const checksOfFeed = () => requests.filter((r) => r === 'latest.yml').length;
const installerRunning = () =>
    execFileSync('tasklist', ['/FI', `IMAGENAME eq ${installerName}`], { encoding: 'utf8' }).includes(installerName);
const shot = async (name) => {
    if (!shots) return;
    await fs.mkdir(shots, { recursive: true });
    await page.screenshot({ path: path.join(shots, `${name}.png`) });
};

const notice = () => page.locator('[data-update-notice]');
const noticeBox = () => notice().locator('../..');
const guideSection = () => page.locator('[data-update-section]');
const openGuide = () => page.getByRole('button', { name: '클래스즐 사용 가이드' }).first().click();
const closeGuide = () => page.getByRole('dialog').getByRole('button', { name: '확인', exact: true }).click();
const setting = () => page.getByRole('switch', { name: '켤 때 새 버전 확인' });

async function launch() {
    const userData = path.join(profile, 'data');
    app = await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`], env, timeout: 30000 });
    // 실제 저장 자료를 건드리지 않는지 가장 먼저 봅니다.
    const actual = await app.evaluate(({ app: a }) => a.getPath('userData'));
    if (path.resolve(actual) !== path.resolve(userData)) throw new Error('시험이 임시 폴더가 아닌 곳을 쓰고 있어 멈춥니다.');
    app.process().stdout.on('data', (chunk) => (log += chunk));
    app.process().stderr.on('data', (chunk) => (log += chunk));
    page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.getByRole('tab', { name: '1단계 기초 정보' }).waitFor({ timeout: 60000 });
}

async function closeApp() {
    await app.close();
    app = null;
}

try {
    await launch();

    // 켠 지 5초 뒤 한 번 확인하고, 실패는 조용히 넘깁니다.
    expect(checksOfFeed()).toBe(0);
    checks.push('켠 직후에는 확인하지 않음');
    await expect.poll(checksOfFeed, { timeout: 15000 }).toBe(1);
    await wait(1000);
    await expect(notice()).toHaveCount(0);
    checks.push('켠 뒤 확인, 실패해도 알림 없음');

    // 직접 확인: 실패, 최신
    await openGuide();
    await expect(page.getByRole('dialog')).toContainText('인터넷은 새 버전 확인에만 씁니다.');
    checks.push('사용 가이드에 통일 문구가 보임');
    await expect(guideSection().getByRole('status')).toHaveCount(0);
    const checkButton = guideSection().getByRole('button', { name: '업데이트 확인' });
    await checkButton.click();
    await expect(guideSection().getByRole('status')).toHaveText('확인하지 못했습니다.');
    feedVersion = version;
    await checkButton.click();
    await expect(guideSection().getByRole('status')).toHaveText('최신 버전입니다.');
    checks.push('직접 확인이 실패와 최신을 알려 줌');

    // 새 버전: 동의 전에는 내려받지 않음
    feedVersion = '9.9.9';
    await checkButton.click();
    await expect(guideSection().getByRole('status')).toHaveText('새 버전(9.9.9)이 있습니다.');
    await expect(guideSection().getByRole('button', { name: '설치' })).toBeVisible();
    await guideSection().scrollIntoViewIfNeeded();
    await shot('guide-section');
    await closeGuide();
    await expect(notice()).toHaveText('새 버전(9.9.9)이 있습니다.');
    await shot('notice');

    // 접어도 알림이 있는 것을 알 수 있음
    await page.getByRole('button', { name: '메뉴 접기' }).click();
    await expect(page.locator('[data-update-rail]')).toBeVisible();
    await shot('rail-notice');
    await page.locator('[data-update-rail]').click();
    await expect(notice()).toBeVisible();
    checks.push('접은 줄에 새 버전 표시가 나오고, 누르면 펼쳐져 알림이 보임');

    await noticeBox().getByRole('button', { name: '나중에' }).click();
    await expect(notice()).toHaveCount(0);
    await wait(2000);
    expect(requests).not.toContain(installerName);
    checks.push('나중에를 누르면 알림만 닫히고 내려받지 않음');

    // 내려받기 실패
    failDownload = true;
    await openGuide();
    await guideSection().getByRole('button', { name: '설치' }).click();
    await expect(guideSection().getByRole('status')).toHaveText('새 버전을 내려받지 못했습니다.', { timeout: 30000 });
    failDownload = false;
    checks.push('내려받기 실패를 알리고 다시 시도할 수 있음');

    // 동의: 일하는 동안 내려받음
    await guideSection().getByRole('button', { name: '다시 시도' }).click();
    await expect(guideSection().getByRole('status')).toHaveText('새 버전을 내려받고 있습니다. 계속 쓰셔도 됩니다.');
    await closeGuide();
    await expect(notice()).toHaveText('새 버전을 내려받고 있습니다. 계속 쓰셔도 됩니다.');
    await expect(notice()).toHaveText('설치 준비가 끝났습니다. 앱을 닫으면 설치됩니다.', { timeout: 120000 });
    await shot('ready');
    await noticeBox().getByRole('button', { name: '지금 다시 시작' }).click();
    await expect.poll(() => log).toContain('[update] test feed: not installing');
    checks.push('동의하면 내려받고 다시 시작을 제안함');

    const pending = path.join(profile, 'classzle-update-test', 'pending');
    expect(await fs.readdir(pending)).toContain(installerName);
    await closeApp();
    expect(installerRunning()).toBe(false);
    checks.push('시험에서는 설치 프로그램이 실행되지 않음');

    // 다음에 켜면 다시 묻음
    let before = checksOfFeed();
    await launch();
    await expect(notice()).toHaveText('새 버전(9.9.9)이 있습니다.', { timeout: 15000 });
    expect(checksOfFeed()).toBeGreaterThan(before);
    checks.push('다음에 켜면 다시 물음');
    await noticeBox().getByRole('button', { name: '나중에' }).click();

    // 끄면 켤 때 확인하지 않고, 설정이 유지되며, 직접 확인은 됨
    await openGuide();
    await expect(setting()).toHaveAttribute('aria-checked', 'true');
    await setting().click();
    await expect(setting()).toHaveAttribute('aria-checked', 'false');
    await closeApp();

    before = checksOfFeed();
    await launch();
    await wait(8000);
    expect(checksOfFeed()).toBe(before);
    await expect(notice()).toHaveCount(0);
    await openGuide();
    await expect(setting()).toHaveAttribute('aria-checked', 'false');
    checks.push('끄면 켤 때 요청이 없고 설정이 유지됨');
    await guideSection().getByRole('button', { name: '업데이트 확인' }).click();
    await expect(guideSection().getByRole('status')).toHaveText('새 버전(9.9.9)이 있습니다.');
    expect(checksOfFeed()).toBeGreaterThan(before);
    checks.push('꺼도 직접 확인은 됨');
    await closeApp();

    expect(errors).toEqual([]);
    // 요청한 파일 이름을 그대로 보여 줍니다. 학생 정보가 나갈 자리가 없다는 근거입니다.
    console.log(JSON.stringify({ checks, requests: [...new Set(requests)] }, null, 2));
} catch (error) {
    console.error(log);
    if (page) await shot('failure').catch(() => {});
    throw error;
} finally {
    await app?.close().catch(() => {});
    server.closeAllConnections();
    server.close();
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}
