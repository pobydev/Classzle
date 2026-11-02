import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isPrintSource } from '../main/printFiles';

describe('PDF 변환 창이 읽는 주소', () => {
    const html = path.resolve('임시 폴더#1', 'report 100%.html');

    it('리포트 파일만 읽습니다', () => {
        expect(isPrintSource(pathToFileURL(html).href, html)).toBe(true);
    });

    it.each([
        'https://example.invalid/leak.png',
        'http://127.0.0.1/leak.png',
        'data:text/html,x',
        'app://classzle/index.html',
    ])('밖의 주소는 막습니다: %s', (url) => {
        expect(isPrintSource(url, html)).toBe(false);
    });

    it('같은 컴퓨터의 다른 파일도 막습니다', () => {
        expect(isPrintSource(pathToFileURL(path.resolve('x')).href, html)).toBe(false);
    });
});
