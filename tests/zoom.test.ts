import { describe, expect, it } from 'vitest';
import { nextZoomLevel, parseZoomLevel, zoomActionOf, ZOOM_MAX, ZOOM_MIN } from '../main/zoom';

const key = (over: Partial<Parameters<typeof zoomActionOf>[0]>) =>
    zoomActionOf({ type: 'keyDown', key: '', code: '', control: true, meta: false, alt: false, ...over });

describe('확대 단축키', () => {
    it('Ctrl + +, Ctrl + =, 숫자판 +는 확대입니다', () => {
        expect(key({ key: '+', code: 'Equal' })).toBe('in');
        expect(key({ key: '=', code: 'Equal' })).toBe('in');
        expect(key({ key: '+', code: 'NumpadAdd' })).toBe('in');
    });

    it('Ctrl + −와 숫자판 −는 축소, Ctrl + 0은 원래 크기입니다', () => {
        expect(key({ key: '-', code: 'Minus' })).toBe('out');
        expect(key({ key: '-', code: 'NumpadSubtract' })).toBe('out');
        expect(key({ key: '0', code: 'Digit0' })).toBe('reset');
        expect(key({ key: '0', code: 'Numpad0' })).toBe('reset');
    });

    it('한글 자판이어도 키 자리로 알아봅니다', () => {
        expect(key({ key: 'Process', code: 'Equal' })).toBe('in');
        expect(key({ key: 'Process', code: 'Minus' })).toBe('out');
    });

    it('Ctrl 없이 누르거나 Alt를 함께 누르거나 키를 뗄 때는 아닙니다', () => {
        expect(key({ key: '+', code: 'Equal', control: false })).toBeNull();
        expect(key({ key: '+', code: 'Equal', alt: true })).toBeNull();
        expect(key({ key: '+', code: 'Equal', type: 'keyUp' })).toBeNull();
        expect(key({ key: 'z', code: 'KeyZ' })).toBeNull();
    });
});

describe('확대 단계', () => {
    it('한 번에 0.5씩 바뀌고 0으로 돌아갑니다', () => {
        expect(nextZoomLevel(0, 'in')).toBe(0.5);
        expect(nextZoomLevel(0.5, 'out')).toBe(0);
        expect(nextZoomLevel(2.5, 'reset')).toBe(0);
    });

    it('범위를 넘지 않습니다', () => {
        expect(nextZoomLevel(ZOOM_MAX, 'in')).toBe(ZOOM_MAX);
        expect(nextZoomLevel(ZOOM_MIN, 'out')).toBe(ZOOM_MIN);
    });

    it('저장된 값을 읽고, 잘못된 값은 0으로 봅니다', () => {
        expect(parseZoomLevel('{"level":1.5}')).toBe(1.5);
        expect(parseZoomLevel('{"level":99}')).toBe(ZOOM_MAX);
        expect(parseZoomLevel('{"level":"big"}')).toBe(0);
        expect(parseZoomLevel('not json')).toBe(0);
    });
});
