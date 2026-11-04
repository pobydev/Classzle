// 반별 입력표: 담임이 생활지도만 적어 돌려주는 파일입니다.
// 개인정보가 핵심이므로 그 반 학생의 번호, 이름, 성별만 내보내고, 받을 때는 생활지도 값만 반영합니다.

import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import type { BehaviorType, Student } from '@/types';
import { parseBehaviorDropdown } from './excel';

// 앱 전체에서 왼쪽(위)부터 어려운 학생 → 괜찮은 학생 순서입니다.
export const BEHAVIOR_CRITERIA = [
    '행동(-3): 심각한 방해, 학교폭력 등 집중 관리 필요',
    '행동(-2): 잦은 방해, 지속적 지도 필요',
    '행동(-1): 가벼운 딴짓, 관심 필요',
    '정서(-3): 특별한 케어/전문가 개입 필요',
    '정서(-2): 교우관계/정서 지원 필요',
    '정서(-1): 다소 예민함, 배려 필요',
    '리더(+1): 모범적이고 성실한 학생',
    '리더(+2): 리더십이 탁월한 학생 (회장감)',
];

export const ONE_VALUE_RULE = '행동과 정서가 둘 다 있으면 정도를 감안해 하나만 고릅니다.';

const DROPDOWN = '"행동(-3),행동(-2),행동(-1),정서(-3),정서(-2),정서(-1),리더(+1),리더(+2),해당없음"';

export interface PrevClassGroup {
    grade: string;
    classNum: string;
    label: string;
    students: Student[];
}

const numberPart = (value: unknown): number | null => {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits === '' ? null : Number(digits);
};

// 전학년도 "2-3-15"를 나눕니다. 학년이나 반을 모르면 null입니다.
function prevParts(student: Student) {
    const [grade, classNum, number] = student.prev_info.split('-');
    const g = numberPart(grade);
    const c = numberPart(classNum);
    if (g === null || c === null) return null;
    return { grade: g, classNum: c, number: numberPart(number) };
}

const classLabel = (grade: number | string, classNum: number | string) => `${grade}학년 ${classNum}반`;

/** 전학년도 반별로 나눕니다. 반을 알 수 없는 학생은 skipped로 돌려줍니다. */
export function groupByPrevClass(students: Student[]): { groups: PrevClassGroup[]; skipped: Student[] } {
    const map = new Map<string, PrevClassGroup>();
    const skipped: Student[] = [];
    students.forEach((student) => {
        const parts = prevParts(student);
        if (!parts) {
            skipped.push(student);
            return;
        }
        const key = `${parts.grade}-${parts.classNum}`;
        if (!map.has(key)) {
            map.set(key, {
                grade: String(parts.grade),
                classNum: String(parts.classNum),
                label: classLabel(parts.grade, parts.classNum),
                students: [],
            });
        }
        map.get(key)!.students.push(student);
    });
    const groups = [...map.values()].sort(
        (a, b) => Number(a.grade) - Number(b.grade) || Number(a.classNum) - Number(b.classNum),
    );
    groups.forEach((group) =>
        group.students.sort((a, b) => (prevParts(a)?.number ?? 0) - (prevParts(b)?.number ?? 0)),
    );
    return { groups, skipped };
}

export const classSheetFileName = (group: PrevClassGroup) => `${group.label} 생활지도 입력표.xlsx`;

/** 한 반의 입력표입니다. 성적, 배정, 메모, 지금 값은 넣지 않습니다. */
export function buildClassSheetWorkbook(group: PrevClassGroup): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    // ExcelJS는 빈 값이면 자기 이름을 적으므로 공백을 넣어 작성자 칸을 비웁니다.
    workbook.creator = ' ';
    workbook.lastModifiedBy = ' ';
    workbook.company = '';
    workbook.manager = '';

    const sheet = workbook.addWorksheet('생활지도 입력');
    sheet.columns = [
        { header: '학년', key: 'grade', width: 8 },
        { header: '반', key: 'classNum', width: 8 },
        { header: '번호', key: 'number', width: 8 },
        { header: '이름', key: 'name', width: 14 },
        { header: '성별', key: 'gender', width: 8 },
        { header: '생활지도', key: 'behavior', width: 16 },
    ];
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const border: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
    };
    group.students.forEach((student) => {
        sheet.addRow({
            grade: Number(group.grade),
            classNum: Number(group.classNum),
            number: prevParts(student)?.number ?? '',
            name: student.name,
            gender: student.gender === 'M' ? '남' : '여',
            behavior: null,
        });
    });
    for (let rowNumber = 1; rowNumber <= group.students.length + 1; rowNumber++) {
        for (let col = 1; col <= 6; col++) {
            const cell = sheet.getRow(rowNumber).getCell(col);
            cell.border = border;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            cell.font = { name: 'Pretendard', size: 11, bold: rowNumber === 1 };
            if (rowNumber === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
            }
        }
        if (rowNumber > 1) {
            sheet.getCell(`F${rowNumber}`).dataValidation = {
                type: 'list',
                allowBlank: true,
                showErrorMessage: true,
                errorTitle: '목록에 없는 값입니다',
                error: '목록에서 골라 주세요.',
                formulae: [DROPDOWN],
            };
        }
    }

    sheet.getColumn(8).width = 62;
    const guide = [
        `${group.label} 생활지도 입력표`,
        '해당하는 학생만 생활지도 칸에서 고릅니다. 빈칸은 바꾸지 않습니다.',
        ONE_VALUE_RULE,
        '사유는 적지 않습니다. 번호와 이름은 고치지 않습니다.',
        '',
        '등급 기준',
        ...BEHAVIOR_CRITERIA,
        '',
        '이 파일에는 암호가 걸려 있지 않습니다. 학교 메신저처럼 정해진 경로로만 돌려주고, 보낸 뒤에는 지워 주세요.',
    ];
    guide.forEach((text, index) => {
        const cell = sheet.getCell(`H${index + 2}`);
        cell.value = text || null;
        cell.font = { name: 'Pretendard', size: 10, bold: index === 0 || text === '등급 기준' };
    });
    return workbook;
}

// ---- 받기 ----

export interface ClassSheetFile {
    fileName: string;
    rows: Record<string, unknown>[];
    /** 생활지도가 모두 빈칸이면 줄에는 나타나지 않으므로 머리글에서 따로 봅니다. */
    hasBehaviorColumn: boolean;
}

export interface BehaviorUpdate {
    id: string;
    behavior_type: BehaviorType;
    behavior_score: number;
}

export interface ImportedClass {
    label: string;
    fileName: string;
    matched: number;
    changed: number;
    /** 앱에는 있는데 파일에 없는 학생 수 */
    missing: number;
}

export interface ClassSheetPlan {
    classes: ImportedClass[];
    unmatched: { fileName: string; who: string; reason: string }[];
    unreadable: { fileName: string; who: string; value: string }[];
    duplicateClasses: { label: string; fileNames: string[] }[];
    invalidFiles: { fileName: string; reason: string }[];
    updates: BehaviorUpdate[];
}

const studentKey = (grade: number, classNum: number, number: number, name: string) =>
    `${grade}-${classNum}-${number}|${name}`;

/** 파일을 맞춰 보고 무엇을 반영할지 계산합니다. 학생 자료는 바꾸지 않습니다. */
export function planClassSheetImport(students: Student[], files: ClassSheetFile[]): ClassSheetPlan {
    const plan: ClassSheetPlan = { classes: [], unmatched: [], unreadable: [], duplicateClasses: [], invalidFiles: [], updates: [] };

    const byKey = new Map<string, Student[]>();
    const classSizes = new Map<string, number>();
    students.forEach((student) => {
        const parts = prevParts(student);
        if (!parts) return;
        const classKey = classLabel(parts.grade, parts.classNum);
        classSizes.set(classKey, (classSizes.get(classKey) ?? 0) + 1);
        if (parts.number === null) return;
        const key = studentKey(parts.grade, parts.classNum, parts.number, student.name.trim());
        byKey.set(key, [...(byKey.get(key) ?? []), student]);
    });

    // 반마다 어느 파일에 있는지 먼저 봅니다. 같은 반이 두 파일에 있으면 어느 쪽도 고르지 않습니다.
    type Row = { fileName: string; row: Record<string, unknown>; label: string | null };
    const rows: Row[] = [];
    const filesOfClass = new Map<string, Set<string>>();
    files.forEach(({ fileName, rows: fileRows, hasBehaviorColumn }) => {
        const dataRows = fileRows.filter((row) =>
            ['학년', '반', '번호', '이름'].some((key) => String(row[key] ?? '').trim() !== ''),
        );
        if (dataRows.length === 0) {
            plan.invalidFiles.push({ fileName, reason: '학생 줄을 찾지 못했습니다.' });
            return;
        }
        if (!hasBehaviorColumn || !dataRows.some((row) => '이름' in row)) {
            plan.invalidFiles.push({ fileName, reason: '입력표 형식이 아닙니다.' });
            return;
        }
        dataRows.forEach((row) => {
            const grade = numberPart(row['학년']);
            const classNum = numberPart(row['반']);
            const label = grade !== null && classNum !== null ? classLabel(grade, classNum) : null;
            rows.push({ fileName, row, label });
            if (label) {
                if (!filesOfClass.has(label)) filesOfClass.set(label, new Set());
                filesOfClass.get(label)!.add(fileName);
            }
        });
    });
    filesOfClass.forEach((names, label) => {
        if (names.size > 1) plan.duplicateClasses.push({ label, fileNames: [...names] });
    });
    const duplicated = new Set(plan.duplicateClasses.map((d) => d.label));

    const results = new Map<string, ImportedClass>();
    const seen = new Set<string>();
    rows.forEach(({ fileName, row, label }) => {
        const number = numberPart(row['번호']);
        const name = String(row['이름'] ?? '').trim();
        const who = `${label ?? '반 모름'} ${number ?? '?'}번 ${name || '(이름 없음)'}`;
        if (label && duplicated.has(label)) return;
        if (!label || number === null || !name) {
            plan.unmatched.push({ fileName, who, reason: '반, 번호, 이름 중 비어 있는 칸이 있습니다.' });
            return;
        }
        const grade = numberPart(row['학년'])!;
        const classNum = numberPart(row['반'])!;
        const key = studentKey(grade, classNum, number, name);
        const found = byKey.get(key) ?? [];
        if (found.length !== 1) {
            plan.unmatched.push({
                fileName,
                who,
                reason: found.length === 0 ? '명단에 같은 반, 번호, 이름이 없습니다.' : '명단에 같은 학생이 둘 있습니다.',
            });
            return;
        }
        if (seen.has(key)) {
            plan.unmatched.push({ fileName, who, reason: '파일에 같은 학생이 두 번 있습니다.' });
            return;
        }
        seen.add(key);

        if (!results.has(label)) {
            results.set(label, { label, fileName, matched: 0, changed: 0, missing: 0 });
        }
        const result = results.get(label)!;
        result.matched++;

        const student = found[0];
        const raw = String(row['생활지도'] ?? '').trim();
        if (raw === '') return; // 빈칸은 바꾸지 않습니다.
        const { behaviorType, behaviorScore, isUnreadable } = parseBehaviorDropdown(raw);
        if (isUnreadable) {
            plan.unreadable.push({ fileName, who, value: raw });
            return;
        }
        if (student.behavior_type !== behaviorType || student.behavior_score !== behaviorScore) {
            plan.updates.push({ id: student.id, behavior_type: behaviorType, behavior_score: behaviorScore });
            result.changed++;
        }
    });

    plan.classes = [...results.values()]
        .map((result) => ({ ...result, missing: Math.max(0, (classSizes.get(result.label) ?? 0) - result.matched) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'ko', { numeric: true }));
    return plan;
}

/** 생활지도 두 값만 바꿉니다. */
export function applyBehaviorUpdates(students: Student[], updates: BehaviorUpdate[]): Student[] {
    const byId = new Map(updates.map((update) => [update.id, update]));
    return students.map((student) => {
        const update = byId.get(student.id);
        return update
            ? { ...student, behavior_type: update.behavior_type, behavior_score: update.behavior_score }
            : student;
    });
}

/** 파일 내용을 줄 목록으로 읽습니다. */
export function readClassSheet(fileName: string, data: ArrayBuffer): ClassSheetFile {
    const book = XLSX.read(new Uint8Array(data), { type: 'array' });
    const sheet = book.Sheets[book.SheetNames[0]];
    const header = (XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })[0] ?? []) as unknown[];
    return {
        fileName,
        rows: XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet),
        hasBehaviorColumn: header.some((cell) => String(cell ?? '').trim() === '생활지도'),
    };
}
