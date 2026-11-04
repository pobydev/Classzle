import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
    applyBehaviorUpdates,
    buildClassSheetWorkbook,
    classSheetFileName,
    groupByPrevClass,
    planClassSheetImport,
    readClassSheet,
} from '@/lib/classSheets';
import type { Student } from '@/types';
import { makeStudent } from './helpers/students';

const roster: Student[] = [
    makeStudent({ id: 'a', name: '가상가', prev_info: '2-1-1', academic_score: 734, gender: 'M', behavior_note: '비밀메모', avoid_ids: ['c'] }),
    makeStudent({ id: 'b', name: '가상나', prev_info: '2-1-2', academic_score: 612, gender: 'F', assigned_class: '3반', fixed_class: '3반', behavior_type: 'BEHAVIOR', behavior_score: -3 }),
    makeStudent({ id: 'c', name: '가상다', prev_info: '2-2-1', academic_score: 555, gender: 'F' }),
    makeStudent({ id: 'd', name: '가상라', prev_info: '2-10-1', academic_score: 444 }),
    makeStudent({ id: 'e', name: '가상마', prev_info: '' }),
];

const row = (classNum: number, number: number, name: string, value?: string) => ({
    학년: 2, 반: classNum, 번호: number, 이름: name, 성별: '남', ...(value === undefined ? {} : { 생활지도: value }),
});
const file = (fileName: string, rows: Record<string, unknown>[]) => ({ fileName, rows, hasBehaviorColumn: true });

describe('내보내기', () => {
    const { groups, skipped } = groupByPrevClass(roster);
    const first = groups[0];

    const exported = async () => {
        const saved = (await buildClassSheetWorkbook(first).xlsx.writeBuffer()) as ArrayBuffer;
        const book = XLSX.read(new Uint8Array(saved), { type: 'array' });
        const sheet = book.Sheets[book.SheetNames[0]];
        const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }).flat().map(String).join('|');
        return { saved, book, sheet, all };
    };

    it('반마다 나누고 번호순으로 둡니다. 반을 모르는 학생은 따로 알립니다', () => {
        expect(groups.map((g) => g.label)).toEqual(['2학년 1반', '2학년 2반', '2학년 10반']);
        expect(first.students.map((s) => s.name)).toEqual(['가상가', '가상나']);
        expect(skipped.map((s) => s.name)).toEqual(['가상마']);
        expect(classSheetFileName(first)).toBe('2학년 1반 생활지도 입력표.xlsx');
    });

    it('성적, 다른 반, 메모, 배정, 지금 값이 들어가지 않습니다', async () => {
        const { all, sheet } = await exported();
        expect(all).toContain('가상가');
        expect(all).toContain('가상나');
        for (const hidden of ['가상다', '가상라', '734', '612', '비밀메모', '3반']) {
            expect(all).not.toContain(hidden);
        }
        // 지금 값은 넣지 않습니다. 안내의 등급 기준에는 '행동(-3)'이 있으므로 학생 칸만 봅니다.
        const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 }).slice(1);
        expect(rows.slice(0, 2).map((r) => r.slice(0, 6))).toEqual([
            [2, 1, 1, '가상가', '남'],
            [2, 1, 2, '가상나', '여'],
        ].map((r) => [...r, undefined]));
    });

    it('등급 기준과 하나만 고르는 규칙을 넣고 사유 칸은 만들지 않습니다', async () => {
        const { all, sheet } = await exported();
        expect(all).toContain('행동과 정서가 둘 다 있으면 정도를 감안해 하나만 고릅니다.');
        expect(all).toContain('행동(-3): 심각한 방해');
        expect(all).toContain('암호가 걸려 있지 않습니다');
        const header = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0].slice(0, 6);
        expect(header).toEqual(['학년', '반', '번호', '이름', '성별', '생활지도']);
        expect(all).not.toContain('사유(');
    });

    it('파일 속성에 작성자 정보가 없습니다', async () => {
        const { book } = await exported();
        expect(String(book.Props?.Author ?? '').trim()).toBe('');
        expect(String(book.Props?.LastAuthor ?? '').trim()).toBe('');
        expect(String(book.Props?.Company ?? '').trim()).toBe('');
        expect(String(book.Props?.Manager ?? '').trim()).toBe('');
    });

    it('내보낸 파일을 그대로 받으면 바뀌는 것이 없습니다', async () => {
        const { saved } = await exported();
        const plan = planClassSheetImport(roster, [readClassSheet('a.xlsx', saved)]);
        expect(plan.invalidFiles).toEqual([]);
        expect(plan.unmatched).toEqual([]);
        expect(plan.updates).toEqual([]);
        expect(plan.classes).toEqual([{ label: '2학년 1반', fileName: 'a.xlsx', matched: 2, changed: 0, missing: 0 }]);
    });
});

describe('받기', () => {
    it('성적 칸이 있는 학생 명단 원본은 입력표로 받지 않습니다', () => {
        const plan = planClassSheetImport(roster, [
            { ...file('명단.xlsx', [row(1, 1, '가상가', '정서(-2)')]), hasScoreColumn: true },
        ]);
        expect(plan.invalidFiles).toEqual([{ fileName: '명단.xlsx', reason: '성적 칸이 있는 학생 명단 파일입니다. 담임에게 보낸 입력표만 골라 주세요.' }]);
        expect(plan.updates).toEqual([]);
    });

    it('맞는 학생의 생활지도만 계산합니다', () => {
        const plan = planClassSheetImport(roster, [
            file('1반.xlsx', [row(1, 1, '가상가', '정서(-2)'), row(1, 2, '가상나', '해당없음')]),
        ]);
        expect(plan.updates).toEqual([
            { id: 'a', behavior_type: 'EMOTIONAL', behavior_score: -2 },
            { id: 'b', behavior_type: 'NONE', behavior_score: 0 },
        ]);
        expect(plan.classes[0]).toMatchObject({ label: '2학년 1반', matched: 2, changed: 2, missing: 0 });
    });

    it('빈칸은 지금 값을 바꾸지 않습니다', () => {
        const plan = planClassSheetImport(roster, [file('1반.xlsx', [row(1, 2, '가상나', '')])]);
        expect(plan.updates).toEqual([]);
        expect(plan.classes[0]).toMatchObject({ matched: 1, changed: 0, missing: 1 });
    });

    it.each([
        ['이름 오타', row(1, 1, '가상갸', '행동(-1)')],
        ['번호 다름', row(1, 9, '가상가', '행동(-1)')],
        ['반 다름', row(2, 1, '가상가', '행동(-1)')],
    ])('%s는 맞춘 것으로 보지 않고 이름과 함께 알립니다', (_title, wrong) => {
        const plan = planClassSheetImport(roster, [file('1반.xlsx', [wrong])]);
        expect(plan.updates).toEqual([]);
        expect(plan.unmatched).toHaveLength(1);
        expect(plan.unmatched[0].who).toContain(String(wrong.이름));
    });

    it('읽지 못한 값은 반영하지 않고 값과 함께 알립니다', () => {
        const plan = planClassSheetImport(roster, [file('1반.xlsx', [row(1, 1, '가상가', '행동(-5)')])]);
        expect(plan.updates).toEqual([]);
        expect(plan.unreadable).toEqual([{ fileName: '1반.xlsx', who: '2학년 1반 1번 가상가', value: '행동(-5)' }]);
    });

    it('같은 반 파일이 둘이면 알리고 그 반은 반영하지 않습니다', () => {
        const plan = planClassSheetImport(roster, [
            file('1반.xlsx', [row(1, 1, '가상가', '행동(-1)')]),
            file('1반 수정.xlsx', [row(1, 1, '가상가', '행동(-2)')]),
            file('2반.xlsx', [row(2, 1, '가상다', '정서(-1)')]),
        ]);
        expect(plan.duplicateClasses).toEqual([{ label: '2학년 1반', fileNames: ['1반.xlsx', '1반 수정.xlsx'] }]);
        expect(plan.updates).toEqual([{ id: 'c', behavior_type: 'EMOTIONAL', behavior_score: -1 }]);
        expect(plan.classes.map((c) => c.label)).toEqual(['2학년 2반']);
    });

    it('한 파일에 같은 학생이 두 번 있으면 뒤의 줄은 반영하지 않습니다', () => {
        const plan = planClassSheetImport(roster, [
            file('1반.xlsx', [row(1, 1, '가상가', '행동(-1)'), row(1, 1, '가상가', '행동(-3)')]),
        ]);
        expect(plan.updates).toEqual([{ id: 'a', behavior_type: 'BEHAVIOR', behavior_score: -1 }]);
        expect(plan.unmatched[0].reason).toContain('두 번');
    });

    it('명단에 같은 반, 번호, 이름이 둘이면 짐작하지 않습니다', () => {
        const twins = [makeStudent({ id: 'x', name: '가상', prev_info: '2-1-1' }), makeStudent({ id: 'y', name: '가상', prev_info: '2-1-1' })];
        const plan = planClassSheetImport(twins, [file('1반.xlsx', [row(1, 1, '가상', '행동(-1)')])]);
        expect(plan.updates).toEqual([]);
        expect(plan.unmatched[0].reason).toContain('둘');
    });

    it('입력표가 아닌 파일은 알립니다', () => {
        const plan = planClassSheetImport(roster, [
            { fileName: '빈.xlsx', rows: [], hasBehaviorColumn: true },
            { fileName: '성적표.xlsx', rows: [{ 학년: 2, 반: 1, 번호: 1, 이름: '가상가', 성적: 1 }], hasBehaviorColumn: false },
        ]);
        expect(plan.invalidFiles.map((f) => f.fileName)).toEqual(['빈.xlsx', '성적표.xlsx']);
        expect(plan.updates).toEqual([]);
    });

    it('반영할 때 생활지도 외의 칸은 그대로입니다', () => {
        const before = JSON.parse(JSON.stringify(roster)) as Student[];
        const after = applyBehaviorUpdates(roster, [{ id: 'a', behavior_type: 'LEADER', behavior_score: 2 }]);
        expect(after[0]).toEqual({ ...before[0], behavior_type: 'LEADER', behavior_score: 2 });
        expect(after.slice(1)).toEqual(before.slice(1));
        expect(after[1]).toBe(roster[1]);
    });
});
