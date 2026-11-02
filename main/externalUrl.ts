/** 기본 브라우저로 넘겨도 되는 주소인지 봅니다. https만 됩니다. */
export function isSafeExternalUrl(url: string): boolean {
    try {
        return new URL(url).protocol === 'https:';
    } catch {
        return false;
    }
}
