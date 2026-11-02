import { describe, expect, it } from 'vitest';
import { buildResultWorkbook, parseRosterRows, requireStudents } from '@/lib/excel';
import { makeStudent } from './helpers/students';

describe('엑셀 명단 읽기', () => {
    it('값을 그대로 읽고 알릴 것이 없으면 안내가 비어 있습니다', () => {
        const { students, warnings } = parseRosterRows([
            { 학년: 2, 반: 1, 번호: 3, 이름: '가상일', 성별: '남', 성적: 720, 생활지도: '행동(-2)' },
        ]);
        expect(warnings).toEqual([]);
        expect(students[0]).toMatchObject({
            name: '가상일',
            gender: 'M',
            academic_score: 720,
            prev_info: '2-1-3',
            behavior_type: 'BEHAVIOR',
            behavior_score: -2,
        });
    });

    it('여학생 표기를 모두 읽습니다', () => {
        for (const value of ['여', '여자', 'F', 'female']) {
            const { students, warnings } = parseRosterRows([{ 이름: '가상', 성별: value, 성적: 1 }]);
            expect(students[0].gender).toBe('F');
            expect(warnings).toEqual([]);
        }
    });

    it('성별이 비면 여학생으로 넣되 알립니다', () => {
        const { students, warnings } = parseRosterRows([{ 이름: '가상둘', 성적: 1 }]);
        expect(students[0].gender).toBe('F');
        expect(warnings[0]).toContain('성별');
        expect(warnings[0]).toContain('가상둘');
    });

    it('성적이 비면 500점으로 넣되 알립니다', () => {
        const { students, warnings } = parseRosterRows([{ 이름: '가상셋', 성별: '남' }]);
        expect(students[0].academic_score).toBe(500);
        expect(warnings[0]).toContain('성적');
    });

    it('성적 0점은 500점으로 바꾸지 않습니다', () => {
        const { students, warnings } = parseRosterRows([{ 이름: '가상넷', 성별: '남', 성적: 0 }]);
        expect(students[0].academic_score).toBe(0);
        expect(warnings).toEqual([]);
    });

    it('성적이 숫자가 아니면 500점으로 넣되 알립니다', () => {
        const { students, warnings } = parseRosterRows([{ 이름: '가상넷', 성별: '남', 성적: '결시' }]);
        expect(students[0].academic_score).toBe(500);
        expect(warnings[0]).toContain('성적');
    });

    it('이름이 빈 행은 빼고 값이 있었으면 알립니다', () => {
        const { students, warnings } = parseRosterRows([
            { 이름: '가상', 성별: '남', 성적: 1 },
            { 성별: '여', 성적: 2 },
        ]);
        expect(students).toHaveLength(1);
        expect(warnings[0]).toContain('이름이 비어 있는 행 1개');
    });

    it('학생이 많으면 이름을 다 늘어놓지 않습니다', () => {
        const rows = Array.from({ length: 6 }, (_, i) => ({ 이름: `가상${i}`, 성적: 1 }));
        expect(parseRosterRows(rows).warnings[0]).toContain('외 3명');
    });

    it('고정 반 표기를 맞춥니다', () => {
        const { students } = parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 1, 고정반: 2 }]);
        expect(students[0].fixed_class).toBe('2반');
    });
});

describe('결과 엑셀', () => {
    const sensitive = [
        makeStudent({
            id: 'a', name: '가상가', assigned_class: '1반', prev_info: '1-1-1',
            behavior_type: 'BEHAVIOR', behavior_score: -3, avoid_ids: ['b'], fixed_class: '1반',
        }),
        makeStudent({ id: 'b', name: '가상나', assigned_class: '2반', prev_info: '1-1-2', avoid_ids: ['a'] }),
    ];
    const allText = (includeDetails: boolean) => {
        const workbook = buildResultWorkbook(sensitive, 2, { includeDetails });
        const cells: string[] = [];
        workbook.eachSheet((sheet) => {
            sheet.eachRow((row) => {
                row.eachCell((cell) => cells.push(String(cell.value ?? '')));
            });
        });
        return cells.join('|');
    };

    it('기본 정보만 고르면 생활지도와 관계가 나가지 않습니다', () => {
        const text = allText(false);
        expect(text).toContain('가상가');
        expect(text).not.toContain('행동(');
        expect(text).not.toContain('(분리)');
        expect(text).not.toContain('고정');
        expect(text).not.toContain('특이사항');
    });

    it('상세 정보를 고르면 함께 나갑니다', () => {
        const text = allText(true);
        expect(text).toContain('행동(-3)');
        expect(text).toContain('가상나(분리)');
    });

    const scoreList = [
        makeStudent({ id: 'c', name: '가상다', assigned_class: '1반', prev_info: '1-1-3', academic_score: 734, behavior_note: '가상 비고' }),
        makeStudent({ id: 'd', name: '가상라', assigned_class: '2반', prev_info: '1-1-4', academic_score: 612, is_pre_transfer: true }),
    ];
    const textOf = (students: typeof scoreList, includeDetails: boolean) => {
        const cells: string[] = [];
        buildResultWorkbook(students, 2, { includeDetails }).eachSheet((sheet) => {
            sheet.eachRow((row) => row.eachCell((cell) => cells.push(String(cell.value ?? ''))));
        });
        return cells.join('|');
    };

    it('기본 정보에도 성적과 반 평균이 들어갑니다', () => {
        const text = textOf(scoreList, false);
        expect(text).toContain('성적');
        expect(text).toContain('734');
        expect(text).toContain('612');
        // 반 평균 행은 소수점 한 자리입니다.
        expect(text).toContain('734.0');
        expect(text).toContain('612.0');
    });

    it('기본 정보에 성적이 들어가도 생활지도, 관계, 고정 반은 나가지 않습니다', () => {
        const text = allText(false);
        expect(text).toContain('성적');
        expect(text).not.toContain('행동(');
        expect(text).not.toContain('(분리)');
        expect(text).not.toContain('고정');
    });

    it('기본 정보에도 전출 예정은 비고로 표시합니다', () => {
        const text = textOf(scoreList, false);
        expect(text).toContain('비고');
        expect(text).toContain('전출 예정');
        expect(text).not.toContain('가상 비고');
    });

    it('전출 학생이 없으면 기본 정보에 비고 열을 만들지 않습니다', () => {
        expect(textOf([scoreList[0]], false)).not.toContain('비고');
    });

    it('상세 정보에는 성적, 전출 예정, 비고가 들어갑니다', () => {
        const text = textOf(scoreList, true);
        expect(text).toContain('성적');
        expect(text).toContain('734');
        expect(text).toContain('전출 예정');
        expect(text).toContain('비고: 가상 비고');
    });
});

describe('학생을 읽지 못한 파일', () => {
    it('이름 열이 없으면 오류이고 지금 작업을 건드리지 않게 합니다', () => {
        const roster = parseRosterRows([{ 학년: 2, 반: 1, 번호: 1, 학생이름: '가상', 성별: '남', 성적: 500 }]);
        expect(roster.students).toEqual([]);
        expect(() => requireStudents(roster)).toThrow('이름 또는 성명');
    });

    it('빈 파일도 오류입니다', () => {
        expect(() => requireStudents(parseRosterRows([]))).toThrow('학생을 한 명도');
    });

    it('한 명이라도 읽으면 그대로 돌려줍니다', () => {
        const roster = parseRosterRows([{ 이름: '가상', 성별: '남', 성적: 500 }]);
        expect(requireStudents(roster)).toBe(roster);
    });
});
