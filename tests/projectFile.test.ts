import { describe, expect, it } from 'vitest';
import { parseProjectFile } from '@/lib/projectFile';
import { makeStudent } from './helpers/students';

const settings = { classCount: 3, scoreTolerance: 50, numberingMethod: 'mixed', useAdvancedConstraints: true };
const file = (value: unknown) => JSON.stringify(value);

describe('저장 파일 읽기', () => {
    it('제대로 된 파일은 그대로 읽습니다', () => {
        const students = [makeStudent({ id: 'a', name: '가상' })];
        const data = parseProjectFile(file({ students, groups: [], settings, movementHistory: [] }))!;
        expect(data.students[0]).toMatchObject({ id: 'a', name: '가상' });
        expect(data.settings.classCount).toBe(3);
        expect(data.movementHistory).toEqual([]);
    });

    it('예전 파일에 없는 값은 빈 값으로 채웁니다', () => {
        const data = parseProjectFile(file({ students: [{ id: 'a', name: '가상', academic_score: 500, behavior_score: 0 }], settings }))!;
        expect(data.groups).toEqual([]);
        expect(data.movementHistory).toBeUndefined();
        expect(data.students[0]).toMatchObject({ prev_info: '', behavior_type: 'NONE', group_ids: [], avoid_ids: [], keep_ids: [] });
    });

    it.each([
        ['JSON이 아님', '{깨진 파일'],
        ['객체가 아님', '[1, 2]'],
        ['null', 'null'],
        ['students가 글자', file({ students: '이상한 값', settings })],
        ['students가 없음', file({ settings })],
        ['학생이 객체가 아님', file({ students: [1], settings })],
        ['이름이 숫자', file({ students: [{ id: 'a', name: 1, academic_score: 1, behavior_score: 0 }], settings })],
        ['성적이 글자', file({ students: [{ id: 'a', name: '가', academic_score: '1', behavior_score: 0 }], settings })],
        ['관계가 배열이 아님', file({ students: [{ id: 'a', name: '가', academic_score: 1, behavior_score: 0, avoid_ids: 'b' }], settings })],
        ['settings가 없음', file({ students: [] })],
        ['학급 수가 글자', file({ students: [], settings: { classCount: '3' } })],
        ['groups가 글자', file({ students: [], settings, groups: 'x' })],
        ['그룹 형식이 다름', file({ students: [], settings, groups: [{ id: 'g' }] })],
        ['이력이 글자', file({ students: [], settings, movementHistory: 'x' })],
    ])('형식이 다르면 읽지 않습니다: %s', (_, content) => {
        expect(parseProjectFile(content)).toBeNull();
    });
});
