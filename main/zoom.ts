// 화면 확대와 축소입니다. 앱 메뉴를 없애서 Electron 기본 확대 단축키가 사라졌으므로 직접 받습니다.
// 회의에서 TV로 함께 볼 때 Ctrl + +, Ctrl + −, Ctrl + 0, Ctrl + 마우스 휠로 앱 전체를 키우고 줄입니다.
// 확대 값은 사용자 자료 폴더의 zoom.json에 두어 다시 켜도 그대로입니다.
import type { BrowserWindow, Input } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

export type ZoomAction = 'in' | 'out' | 'reset';

// Chromium 확대 단계입니다. 0이 100%이고 한 단계(0.5)마다 약 1.1배입니다. -2는 약 70%, 4는 약 200%입니다.
export const ZOOM_STEP = 0.5;
export const ZOOM_MIN = -2;
export const ZOOM_MAX = 4;

/** 누른 키가 확대 단축키인지 봅니다. 한글 자판에서도 같도록 key와 code를 함께 봅니다. */
export function zoomActionOf(input: Pick<Input, 'type' | 'key' | 'code' | 'control' | 'meta' | 'alt'>): ZoomAction | null {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return null;
    if (input.key === '+' || input.key === '=' || input.code === 'Equal' || input.code === 'NumpadAdd') return 'in';
    if (input.key === '-' || input.key === '_' || input.code === 'Minus' || input.code === 'NumpadSubtract') return 'out';
    if (input.key === '0' || input.code === 'Digit0' || input.code === 'Numpad0') return 'reset';
    return null;
}

/** 다음 확대 단계를 냅니다. 범위를 넘지 않습니다. */
export function nextZoomLevel(current: number, action: ZoomAction): number {
    if (action === 'reset') return 0;
    const next = Math.round((current + (action === 'in' ? ZOOM_STEP : -ZOOM_STEP)) / ZOOM_STEP) * ZOOM_STEP;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
}

/** 저장된 값을 읽습니다. 잘못된 값이면 0(100%)입니다. */
export function parseZoomLevel(text: string): number {
    try {
        const value = (JSON.parse(text) as { level?: unknown }).level;
        if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
        return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
    } catch {
        return 0;
    }
}

export function setupZoom(window: BrowserWindow, userDataDir: string) {
    const file = path.join(userDataDir, 'zoom.json');
    let level = 0;
    let loaded = fs.readFile(file, 'utf-8').then(parseZoomLevel, () => 0).then((saved) => {
        level = saved;
    });

    const apply = () => {
        if (!window.isDestroyed()) window.webContents.setZoomLevel(level);
    };
    const change = (action: ZoomAction) => {
        const next = nextZoomLevel(level, action);
        if (next === level) return;
        level = next;
        apply();
        // 저장하지 못해도 지금 창에서는 그대로 씁니다.
        loaded = loaded.then(() => fs.writeFile(file, JSON.stringify({ level }), 'utf-8')).catch(() => {});
    };

    // 페이지를 새로 읽을 때마다 저장된 확대를 다시 겁니다.
    window.webContents.on('did-finish-load', () => {
        void loaded.then(apply);
    });
    window.webContents.on('before-input-event', (event, input) => {
        const action = zoomActionOf(input);
        if (!action) return;
        event.preventDefault();
        change(action);
    });
    // Ctrl + 마우스 휠입니다.
    window.webContents.on('zoom-changed', (_event, direction) => {
        change(direction === 'in' ? 'in' : 'out');
    });
}
