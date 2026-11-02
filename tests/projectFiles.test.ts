import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectFilePath } from '../main/projectFiles';
import { findSameProject, overwritesOtherProject, projectNameFromFile, projectNameProblem } from '../main/projectName';

describe('저장 이름', () => {
    it.each(['14:30 저장', '../밖으로', '..\\밖으로', 'a/b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\tb'])('쓸 수 없는 글자를 알립니다: %s', (name) => {
        expect(projectNameProblem(name)).toContain('쓸 수 없습니다');
    });

    it.each(['CON', 'nul', 'Com1', 'lpt9', 'aux.백업', '..', '.'])('윈도우가 쓰는 이름을 알립니다: %s', (name) => {
        expect(projectNameProblem(name)).toContain('윈도우');
    });

    it('비었거나 너무 길면 알립니다', () => {
        expect(projectNameProblem('  ')).toContain('입력');
        expect(projectNameProblem('가'.repeat(101))).toContain('100자');
    });

    it.each(['2026학년도 1차', '이름.json 백업', '1-2반 (수정)', 'a.b', "선생님's", '#1 100%', 'console'])('평범한 이름은 통과합니다: %s', (name) => {
        expect(projectNameProblem(name)).toBeNull();
    });

    it('끝의 .json만 뗍니다', () => {
        expect(projectNameFromFile('이름.json 백업.json')).toBe('이름.json 백업');
        expect(projectNameFromFile('a.json.json')).toBe('a.json');
        expect(projectNameFromFile('정상 작업.json')).toBe('정상 작업');
    });
});

describe('저장 경로', () => {
    const dir = path.resolve('가상', 'projects');

    it('폴더 안의 파일만 가리킵니다', () => {
        expect(projectFilePath(dir, '정상 작업')).toBe(path.join(dir, '정상 작업.json'));
        expect(projectFilePath(dir, '이름.json 백업')).toBe(path.join(dir, '이름.json 백업.json'));
    });

    it.each(['../밖으로', '..\\밖으로', 'a/b', 'C:\\Windows\\x', '14:30 저장'])('밖이나 숨은 영역을 가리키면 null입니다: %s', (name) => {
        expect(projectFilePath(dir, name)).toBeNull();
    });

    it('이미 있을 수 있는 이름은 글자 규칙에 걸려도 열 수 있습니다', () => {
        // 끝에 .json이 붙으면 윈도우가 쓰는 이름이 아니던 예전 파일입니다.
        expect(projectFilePath(dir, '..')).toBe(path.join(dir, '...json'));
        expect(projectFilePath(dir, 'a*b')).toBe(path.join(dir, 'a*b.json'));
    });
});

describe('덮어쓰기를 물을지', () => {
    it('대소문자만 달라도 같은 작업입니다', () => {
        expect(overwritesOtherProject('test', ['Test'], null)).toBe(true);
        expect(findSameProject('test', ['Test'])).toBe('Test');
    });

    it('지금 연 작업을 다시 저장할 때는 묻지 않습니다', () => {
        expect(overwritesOtherProject('Test', ['Test'], 'Test')).toBe(false);
        expect(overwritesOtherProject('test', ['Test'], 'Test')).toBe(false);
    });

    it('다른 작업을 열고 있거나 연 작업이 없으면 묻습니다', () => {
        expect(overwritesOtherProject('Test', ['Test', '다른 작업'], '다른 작업')).toBe(true);
        expect(overwritesOtherProject('Test', ['Test'], null)).toBe(true);
    });

    it('새 이름이면 묻지 않습니다', () => {
        expect(overwritesOtherProject('새 작업', ['Test'], 'Test')).toBe(false);
    });
});
