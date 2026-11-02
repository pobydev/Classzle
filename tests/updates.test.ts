import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    checkMessage,
    isFound,
    privacyNote,
    readCheckOnStart,
    updateMessage,
    writeCheckOnStart,
} from '../src/lib/updates';

const stored = new Map<string, string>();

beforeEach(() => {
    stored.clear();
    vi.stubGlobal('window', {
        localStorage: {
            getItem: (key: string) => stored.get(key) ?? null,
            setItem: (key: string, value: string) => stored.set(key, value),
            removeItem: (key: string) => stored.delete(key),
        },
    });
});

describe('문구', () => {
    it('패밀리와 같은 문구를 쓴다', () => {
        expect(updateMessage({ state: 'available', version: '1.3.0' })).toBe('새 버전(1.3.0)이 있습니다.');
        expect(updateMessage({ state: 'downloading', version: '1.3.0' })).toBe(
            '새 버전을 내려받고 있습니다. 계속 쓰셔도 됩니다.',
        );
        expect(updateMessage({ state: 'ready', version: '1.3.0' })).toBe(
            '설치 준비가 끝났습니다. 앱을 닫으면 설치됩니다.',
        );
        expect(updateMessage({ state: 'failed', version: '1.3.0' })).toBe('새 버전을 내려받지 못했습니다.');
        expect(checkMessage('latest')).toBe('최신 버전입니다.');
        expect(checkMessage('error')).toBe('확인하지 못했습니다.');
    });

    it('새 버전 확인이 되는 판에만 인터넷 문장을 쓴다', () => {
        expect(privacyNote(true)).toBe('학생 정보는 이 컴퓨터 밖으로 나가지 않습니다. 인터넷은 새 버전 확인에만 씁니다.');
        expect(privacyNote(false)).toBe('학생 정보는 이 컴퓨터 밖으로 나가지 않습니다.');
    });

    it('버전을 찾은 상태만 알림 대상이다', () => {
        expect(isFound({ state: 'available', version: '1.3.0' })).toBe(true);
        expect(isFound({ state: 'error' })).toBe(false);
    });
});

describe('켤 때 새 버전 확인 설정', () => {
    it('처음에는 켜져 있고, 끄면 기억하며, 다시 켤 수 있다', () => {
        expect(readCheckOnStart()).toBe(true);
        writeCheckOnStart(false);
        expect(readCheckOnStart()).toBe(false);
        writeCheckOnStart(true);
        expect(readCheckOnStart()).toBe(true);
    });

    it('저장소를 쓸 수 없어도 오류 없이 켜진 것으로 본다', () => {
        vi.stubGlobal('window', {
            localStorage: {
                getItem: () => {
                    throw new Error('막힘');
                },
                setItem: () => {
                    throw new Error('막힘');
                },
            },
        });
        expect(readCheckOnStart()).toBe(true);
        expect(() => writeCheckOnStart(false)).not.toThrow();
    });
});
