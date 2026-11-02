import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl } from '../main/externalUrl';

describe('27. 기본 브라우저로 넘기는 주소', () => {
    it('https만 넘깁니다', () => {
        expect(isSafeExternalUrl('https://github.com/pobydev/Classzle')).toBe(true);
    });

    it.each(['http://example.invalid', 'file:///C:/Windows/notepad.exe', 'smb://example.invalid/share', 'javascript:alert(1)', 'ms-settings:', 'mailto:a@example.invalid', '주소 아님', ''])(
        '다른 것은 넘기지 않습니다: %s',
        (url) => {
            expect(isSafeExternalUrl(url)).toBe(false);
        },
    );
});
