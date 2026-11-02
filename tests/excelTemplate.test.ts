import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
    buildPreAssignedSampleWorkbook,
    buildSampleWorkbook,
    parseRosterRows,
    TEMPLATE_LAST_ROW,
} from '@/lib/excel';

const behaviorOf = (value: unknown) => {
    const { students, warnings } = parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 1, 생활지도: value }]);
    return { type: students[0].behavior_type, score: students[0].behavior_score, warnings };
};

describe('생활지도 값 읽기', () => {
    it.each([
        ['리더(+2)', 'LEADER', 2],
        ['리더(+1)', 'LEADER', 1],
        ['행동(-3)', 'BEHAVIOR', -3],
        ['행동(-2)', 'BEHAVIOR', -2],
        ['행동(-1)', 'BEHAVIOR', -1],
        ['정서(-3)', 'EMOTIONAL', -3],
        ['정서(-2)', 'EMOTIONAL', -2],
        ['정서(-1)', 'EMOTIONAL', -1],
    ])('양식의 값 %s를 읽습니다', (value, type, score) => {
        expect(behaviorOf(value)).toEqual({ type, score, warnings: [] });
    });

    it.each(['', '해당없음', '해당 없음', '없음', '-', 'NONE'])('"%s"는 알리지 않고 해당없음입니다', (value) => {
        expect(behaviorOf(value)).toEqual({ type: 'NONE', score: 0, warnings: [] });
    });

    it('예전 파일의 반대 부호도 같은 등급으로 읽습니다', () => {
        expect(behaviorOf('리더(-2)')).toMatchObject({ type: 'LEADER', score: 2, warnings: [] });
        expect(behaviorOf('행동(+3)')).toMatchObject({ type: 'BEHAVIOR', score: -3, warnings: [] });
    });

    it('유형 뒤의 첫 숫자만 등급으로 봅니다', () => {
        expect(behaviorOf('행동(-2) 3월 전입')).toMatchObject({ type: 'BEHAVIOR', score: -2, warnings: [] });
        expect(behaviorOf('2학년 정서(-1)')).toMatchObject({ type: 'EMOTIONAL', score: -1, warnings: [] });
    });

    it.each(['행동', '행동(-12)', '행동(-5)', '리더(+3)', '정서(0)', '주의 필요', '3'])(
        '"%s"는 해당없음으로 넣되 이름과 함께 알립니다',
        (value) => {
            const { type, score, warnings } = behaviorOf(value);
            expect({ type, score }).toEqual({ type: 'NONE', score: 0 });
            expect(warnings).toHaveLength(1);
            expect(warnings[0]).toContain('생활지도');
            expect(warnings[0]).toContain('가상');
        },
    );

    it('이름이 빈 행은 생활지도 안내에 넣지 않습니다', () => {
        const { warnings } = parseRosterRows([{ 성별: '남', 성적: 1, 생활지도: '주의' }]);
        expect(warnings.join()).not.toContain('생활지도');
    });

    it('많아도 이름을 모두 적습니다', () => {
        const rows = Array.from({ length: 5 }, (_, i) => ({ 이름: `가상${i}`, 성별: '남', 성적: 1, 생활지도: '주의' }));
        expect(parseRosterRows(rows).warnings[0]).toContain('가상4');
    });
});

describe.each([
    ['양식 A', buildSampleWorkbook, 'G', 'A2:G'],
    ['양식 B', buildPreAssignedSampleWorkbook, 'H', 'A2:K'],
] as const)('%s', (_name, build, column, rangeStart) => {
    it('350명 학년보다 넉넉한 행까지 드롭다운과 색이 있습니다', async () => {
        expect(TEMPLATE_LAST_ROW).toBeGreaterThanOrEqual(1000);
        const saved = await build().xlsx.writeBuffer();
        const reloaded = new ExcelJS.Workbook();
        await reloaded.xlsx.load(saved);
        const sheet = reloaded.worksheets[0];

        for (const row of [2, 101, 351, TEMPLATE_LAST_ROW]) {
            expect(sheet.getCell(`${column}${row}`).dataValidation?.type).toBe('list');
        }
        expect(sheet.getCell(`${column}${TEMPLATE_LAST_ROW + 1}`).dataValidation).toBeUndefined();
        const refs = sheet.conditionalFormattings.map((format) => format.ref);
        expect(refs).toContain(`${rangeStart}${TEMPLATE_LAST_ROW}`);
    });

    it('받은 양식을 그대로 읽어도 빈 행이 학생이 되지 않습니다', async () => {
        const saved = await build().xlsx.writeBuffer();
        const book = XLSX.read(new Uint8Array(saved as ArrayBuffer), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
        const { students, warnings } = parseRosterRows(rows);
        expect(students.length).toBeGreaterThan(0);
        expect(students.length).toBeLessThan(10);
        expect(warnings).toEqual([]);
    });
});
