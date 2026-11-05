import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { assignStudents } from '@/lib/assignment';
import { parseBehaviorDropdown, parseRosterRows } from '@/lib/excel';
import { useClasszleStore } from '@/lib/store';
import { cleanOldPrintFiles, PRINT_FOLDER } from '../main/printFiles';
import { makeStudent } from './helpers/students';

const store = () => useClasszleStore.getState();

describe('3. 입력표 되돌리기', () => {
    const find = (id: string) => store().students.find((s) => s.id === id)!;

    beforeEach(() => {
        store().resetAll();
        store().setStudents([
            makeStudent({ id: 'a' }),
            makeStudent({ id: 'b' }),
            makeStudent({ id: 'c', behavior_type: 'LEADER', behavior_score: 1 }),
        ]);
    });

    const applySheet = () =>
        store().applyGuidance(store().students.map((s) => (s.id === 'a' ? { ...s, behavior_type: 'BEHAVIOR' as const, behavior_score: -2 } : s)));

    it('입력표가 바꾼 학생을 되돌립니다', () => {
        applySheet();
        store().undoLastChange();
        expect(find('a')).toMatchObject({ behavior_type: 'NONE', behavior_score: 0 });
    });

    it('입력표가 바꾸지 않은 학생을 표에서 직접 고친 값은 그대로 둡니다', () => {
        applySheet();
        store().updateStudent('b', { behavior_type: 'EMOTIONAL', behavior_score: -1 });
        store().updateStudent('c', { behavior_type: 'NONE', behavior_score: 0 });
        store().undoLastChange();
        expect(find('b')).toMatchObject({ behavior_type: 'EMOTIONAL', behavior_score: -1 });
        expect(find('c')).toMatchObject({ behavior_type: 'NONE', behavior_score: 0 });
        expect(find('a')).toMatchObject({ behavior_type: 'NONE', behavior_score: 0 });
    });

    it('입력표 뒤에 그 학생을 직접 고쳤으면 직접 고친 값을 둡니다', () => {
        applySheet();
        store().updateStudent('a', { behavior_type: 'BEHAVIOR', behavior_score: -3 });
        store().undoLastChange();
        expect(find('a')).toMatchObject({ behavior_type: 'BEHAVIOR', behavior_score: -3 });
    });
});

describe('4. 띄어 쓴 반 표기로 옮긴 수가 틀리지 않음', () => {
    it('표기만 다르면 옮긴 학생으로 세지 않습니다', () => {
        const students = Array.from({ length: 12 }, (_, i) =>
            makeStudent({ id: `s${i}`, gender: i % 2 ? 'M' : 'F', assigned_class: `${(i % 3) + 1} 반`, academic_score: 500 }),
        );
        const plain = students.map((s) => ({ ...s, assigned_class: String(s.assigned_class).replace(' ', '') }));
        const spaced = assignStudents(students, 3, [], { mode: 'optimize', seed: 1, maxMs: 200 });
        const same = assignStudents(plain, 3, [], { mode: 'optimize', seed: 1, maxMs: 200 });
        expect(spaced.moved).toBe(same.moved);
    });

    it('균형 조정도 그렇습니다', () => {
        const students = Array.from({ length: 12 }, (_, i) =>
            makeStudent({ id: `s${i}`, gender: i % 2 ? 'M' : 'F', assigned_class: `${(i % 3) + 1} 반`, academic_score: 500 }),
        );
        const plain = students.map((s) => ({ ...s, assigned_class: String(s.assigned_class).replace(' ', '') }));
        const spaced = assignStudents(students, 3, [], { mode: 'balance', seed: 1, maxMs: 200 });
        const same = assignStudents(plain, 3, [], { mode: 'balance', seed: 1, maxMs: 200 });
        expect(spaced.moved).toBe(same.moved);
    });
});

describe('5. 양식 판정', () => {
    const planA = (count: number) =>
        Array.from({ length: count }, (_, i): Record<string, unknown> => ({ 학년: 2, 반: 1, 번호: i + 1, 이름: `가상${i}`, 성별: '남', 성적: 500 }));
    const planB = (count: number) =>
        Array.from({ length: count }, (_, i): Record<string, unknown> => ({ 학년: 3, 반: 2, 번호: i + 1, 이름: `가상${i}`, 성별: '남', 성적: 500, 학년_1: 2, 반_1: 4, 번호_1: i + 1 }));

    it('양식 A에 칸 하나가 끼어도 시트 전체가 B가 되지 않습니다', () => {
        const rows = planA(10);
        rows[3].이전반 = 4;
        const { students, warnings, formLine } = parseRosterRows(rows);
        expect(students.filter((s) => s.assigned_class)).toEqual([]);
        expect(students[3].prev_info).toBe('2-1-4');
        expect(formLine).toContain('양식 A');
        expect(warnings.join()).toContain('가상3');
    });

    it('양식 B의 전입생은 이름과 함께 알립니다', () => {
        const rows = planB(6);
        delete rows[2].학년_1;
        delete rows[2].반_1;
        delete rows[2].번호_1;
        const { students, warnings, formLine } = parseRosterRows(rows);
        expect(students.every((s) => s.assigned_class === '2반')).toBe(true);
        expect(students[2].prev_info).toBe('');
        expect(formLine).toContain('양식 B');
        expect(warnings.join()).toContain('가상2');
        expect(warnings.join()).toContain('전입');
    });

    it('양식 B인데 이전 반이 모두 비면 경고합니다', () => {
        const rows = planA(4);
        const { formLine, warnings } = parseRosterRows(rows, ['학년', '반', '번호', '이름', '성별', '성적', '학년', '반', '번호']);
        expect(formLine).toContain('양식 A');
        expect(warnings.join()).toContain('전학년도 반 칸이 모두 비어');
    });

    it('평범한 양식 A와 B는 경고 없이 양식만 말합니다', () => {
        expect(parseRosterRows(planA(3), ['학년', '반', '번호', '이름', '성별', '성적'])).toMatchObject({ warnings: [] });
        const b = parseRosterRows(planB(3));
        expect(b.warnings).toEqual([]);
        expect(b.formLine).toContain('양식 B');
        expect(b.formLine).toContain('3명');
    });
});

describe('5. 저장소의 표본', () => {
    it.each([
        ['sample-students-12class.xlsx', '양식 A', 0],
        ['sample-students-12class - 복사본.xlsx', '양식 A', 0],
        ['샘플1 가상 학급.xlsx', '양식 A', 0],
        ['sample-students-12class-preassigned.xlsx', '양식 B', 330],
        ['샘플2 가상 학급.xlsx', '양식 B', 330],
    ])('%s는 %s로 경고 없이 읽습니다', (file, form, placed) => {
        const book = XLSX.read(readFileSync(file), { type: 'buffer' });
        const sheet = book.Sheets[book.SheetNames[0]];
        const [headers] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        const { students, warnings, formLine } = parseRosterRows(XLSX.utils.sheet_to_json(sheet), headers.map(String));
        expect(students).toHaveLength(330);
        expect(students.filter((s) => s.assigned_class)).toHaveLength(placed);
        expect(warnings).toEqual([]);
        expect(formLine).toContain(form);
    });
});

describe('6, 7. 생활지도 표기', () => {
    const unreadable = { behaviorType: 'NONE', behaviorScore: 0, isUnreadable: true };

    it.each([
        ['행동 3/14 상담'],
        ['행동 3.14 상담'],
        ['행동 3 월 전입'],
        ['행동 1.5'],
        ['정서 1,2반 갈등'],
        ['행동 -3/14'],
        ['행동(1.5)'],
        ['행동 2회'],
        ['행동 관찰 2회'],
        ['행동 12'],
    ])('메모의 숫자는 등급이 아닙니다: %s', (value) => {
        expect(parseBehaviorDropdown(value)).toEqual(unreadable);
    });

    it.each([
        ['행동（-2）', 'BEHAVIOR', -2],
        ['행동(－2)', 'BEHAVIOR', -2],
        ['리더(＋1)', 'LEADER', 1],
        ['행 동(-2)', 'BEHAVIOR', -2],
        ['행동(-2)메모', 'BEHAVIOR', -2],
        ['행동, -2', 'BEHAVIOR', -2],
        ['행동(-2점)', 'BEHAVIOR', -2],
        ['리더쉽(+2)', 'LEADER', 2],
        ['행동 3', 'BEHAVIOR', -3],
        ['행동 2점', 'BEHAVIOR', -2],
        ['행동(-2) 3월 전입', 'BEHAVIOR', -2],
        ['정서：-1', 'EMOTIONAL', -1],
    ])('예전에 읽히던 표기를 읽습니다: %s', (value, behaviorType, behaviorScore) => {
        expect(parseBehaviorDropdown(value)).toEqual({ behaviorType, behaviorScore, isUnreadable: false });
    });

    it('읽지 못한 학생은 모두 이름을 적습니다', () => {
        const rows = Array.from({ length: 8 }, (_, i) => ({ 이름: `가상${i}`, 성별: '남', 성적: 1, 생활지도: '주의' }));
        const text = parseRosterRows(rows).warnings.join();
        rows.forEach((row) => expect(text).toContain(row.이름));
        expect(text).not.toContain('외 ');
    });
});

describe('8. 인쇄 파일 청소와 링크', () => {
    const OLD = new Date(Date.now() - 2 * 60 * 60 * 1000);
    let temp: string;
    let outside: string;

    beforeEach(async () => {
        temp = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-link-'));
        outside = await fs.mkdtemp(path.join(os.tmpdir(), 'classzle-outside-'));
        await fs.writeFile(path.join(outside, '소중한 파일.txt'), '가상');
        await fs.utimes(path.join(outside, '소중한 파일.txt'), OLD, OLD);
    });
    afterEach(async () => {
        await fs.rm(temp, { recursive: true, force: true });
        await fs.rm(outside, { recursive: true, force: true });
    });

    it('classzle-print가 정션이면 안의 파일을 지우지 않습니다', async () => {
        await fs.symlink(outside, path.join(temp, PRINT_FOLDER), 'junction');
        await cleanOldPrintFiles(temp);
        expect(await fs.readdir(outside)).toEqual(['소중한 파일.txt']);
    });

    it('옛 이름이 정션이면 지우지 않습니다', async () => {
        const link = path.join(temp, 'report-1793616069652.pdf');
        await fs.symlink(outside, link, 'junction');
        await cleanOldPrintFiles(temp);
        expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
        expect(await fs.readdir(outside)).toEqual(['소중한 파일.txt']);
    });
});
