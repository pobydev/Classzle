import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { parseRosterRows, requireStudents } from '@/lib/excel';
// @ts-expect-error 형식 선언이 없는 스크립트입니다.
import { buildWorkbook, makeRoster } from '../scripts/make-example-rosters.mjs';

// 홈페이지에 올리는 가상 학생 예시 명단이 앱에 경고 없이 들어오는지 봅니다.
describe('가상 학생 예시 명단', () => {
    it.each([
        [4, 100],
        [6, 150],
        [8, 220],
        [10, 300],
    ])('%i반 %i명 파일을 양식 A로 읽습니다', async (classes, count) => {
        const buffer = await buildWorkbook(makeRoster({ classes, students: count })).xlsx.writeBuffer();
        const sheet = XLSX.read(buffer, { type: 'array' }).Sheets['학생명단'];
        const [headers] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        const roster = requireStudents(parseRosterRows(XLSX.utils.sheet_to_json(sheet), headers.map(String)), headers.map(String));

        expect(roster.warnings).toEqual([]);
        expect(roster.formLine).toBe(`양식 A(전학년도 명단)로 읽었습니다. 학생 ${count}명.`);
        expect(new Set(roster.students.map((s) => s.name)).size).toBe(count);
        expect(new Set(roster.students.map((s) => s.prev_info.split('-')[1])).size).toBe(classes);

        // 남녀와 생활지도가 한쪽으로 쏠리지 않았는지 봅니다.
        const males = roster.students.filter((s) => s.gender === 'M').length;
        expect(Math.abs(males - count / 2)).toBeLessThanOrEqual(classes);
        for (const type of ['LEADER', 'BEHAVIOR', 'EMOTIONAL']) {
            expect(roster.students.some((s) => s.behavior_type === type)).toBe(true);
        }
        expect(roster.students.every((s) => s.academic_score >= 300 && s.academic_score <= 990)).toBe(true);
    });
});
