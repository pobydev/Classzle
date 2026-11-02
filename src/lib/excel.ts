import * as XLSX from 'xlsx';
import { Student, BehaviorType, Gender, CustomGroup, NumberingMethod } from '@/types';
import { makeClassNames, normalizeClassName, resolveClassIndex } from './assignment/problem';
import { calculateAttendanceNumbers } from './numbering';
import { v4 as uuidv4 } from 'uuid';

export interface ParsedRoster {
    students: Student[];
    // 짐작해서 넣은 값이 있으면 교사에게 알립니다.
    warnings: string[];
    // 어느 양식으로 읽었는지 한 줄로 알립니다.
    formLine: string;
}

// 엑셀 파일에서 학생 데이터 파싱
export function parseExcelFile(file: File): Promise<ParsedRoster> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            let roster: ParsedRoster;
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                // 값이 모두 빈 열은 행에 나오지 않으므로 머리글은 따로 읽습니다.
                const [headers] = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
                roster = parseRosterRows(XLSX.utils.sheet_to_json(worksheet), (headers ?? []).map(String));
            } catch (error) {
                reject(new Error('엑셀 파일 파싱 오류: ' + (error as Error).message));
                return;
            }
            try {
                resolve(requireStudents(roster));
            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => {
            reject(new Error('파일 읽기 오류'));
        };

        reader.readAsBinaryString(file);
    });
}

// 학생을 한 명도 읽지 못한 파일로 지금 작업을 바꾸지 않도록 오류로 돌립니다.
export function requireStudents(roster: ParsedRoster): ParsedRoster {
    if (roster.students.length === 0) {
        throw new Error('학생을 한 명도 읽지 못했습니다. 첫 줄에 이름 또는 성명 열이 있는지 확인해 주세요. 지금 작업은 바뀌지 않았습니다.');
    }
    return roster;
}

// 학년, 반, 번호를 이전 학적 글자로 잇습니다. 비어 있는 칸이 undefined로 나가지 않게 합니다.
const joinPrevInfo = (grade: unknown, classNum: unknown, number: unknown) =>
    `${grade ?? ''}-${classNum ?? ''}-${number ?? ''}`;

// 이전 학적을 나눕니다. 예전 저장 파일에 남은 undefined는 빈 칸으로 봅니다.
function prevParts(info: string) {
    const [grade = '', classNum = '', number = ''] = String(info ?? '').split('-').map((part) => (part === 'undefined' ? '' : part));
    return { grade, classNum, number };
}

// 배정 학년은 이전 학년 + 1입니다. 숫자가 아니면 비웁니다.
function nextGradeOf(prevGrade: string): string {
    const grade = parseInt(prevGrade);
    return Number.isFinite(grade) ? String(grade + 1) : '';
}

// 비어 있지 않은 첫 값을 고릅니다. 0도 값으로 봅니다.
function firstValue(row: any, keys: string[]): any {
    for (const key of keys) {
        const value = row[key];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return undefined;
}

function isRepeatedHeaderRow(row: any): boolean {
    const name = String(firstValue(row, ['이름', 'name', '성명']) ?? '').trim();
    const gender = String(firstValue(row, ['성별', 'gender']) ?? '').trim();
    return ['이름', 'name', '성명'].includes(name) && ['성별', 'gender'].includes(gender);
}

function isTotalRow(row: any): boolean {
    return ['반', '반(배정)', '반(이전)'].some((key) => String(row[key] ?? '').trim() === '계');
}

// 엑셀 행을 학생으로 바꿉니다.
export function parseRosterRows(allRows: any[], headers: string[] = []): ParsedRoster {
    // 이 앱이 내보낸 결과 파일은 반마다 머리글 줄과 계 줄이 끼어 있습니다.
    const isResultFile = allRows.some((row) => row['반(배정)'] !== undefined && row['반(이전)'] !== undefined);
    const rows = allRows.filter((row) => !isRepeatedHeaderRow(row) && !isTotalRow(row));

    const blankGender: string[] = [];
    const blankScore: string[] = [];
    const unreadableBehavior: string[] = [];
    let blankNameRows = 0;

    // 양식은 대다수 줄을 보고 정합니다. 양식 B의 전입생은 이전 반이 빈 칸이고, 양식 A에 잘못 들어간 칸 하나로 시트 전체가 바뀌면 안 됩니다.
    const prevClassOf = (row: any) => row['반_1'] || row['class_1'] || row['이전반'] || row['prev_class'] || row['반(이전)'];
    const nameOfRow = (row: any) => String(firstValue(row, ['이름', 'name', '성명']) ?? '').trim();
    const namedRows = rows.filter((row) => nameOfRow(row) !== '');
    const rowsWithPrev = namedRows.filter((row) => prevClassOf(row) !== undefined);
    const isFormB = rowsWithPrev.length > 0 && rowsWithPrev.length * 2 >= namedRows.length;

    const students: Student[] = rows.map((row: any) => {
                    const rowName = String(firstValue(row, ['이름', 'name', '성명']) ?? '');
                    const rawGender = firstValue(row, ['성별', 'gender']);
                    const gender = parseGender(rawGender);
                    const rawScore = firstValue(row, ['성적', 'academic_score', '점수', '기준성적']);
                    const parsedScore = Number(rawScore);
                    const hasScore = rawScore !== undefined && Number.isFinite(parsedScore);

                    if (rowName.trim() === '') {
                        // 합계 줄 같은 빈 행은 세지 않고, 다른 값이 있는 행만 알립니다.
                        if (firstValue(row, ['성별', 'gender', '성적', 'academic_score', '점수', '기준성적']) !== undefined) {
                            blankNameRows++;
                        }
                    } else {
                        if (gender === null) blankGender.push(rowName);
                        if (!hasScore) blankScore.push(rowName);
                    }

                    // 생활지도 드롭다운 파싱
                    const { behaviorType, behaviorScore, isUnreadable } = parseBehaviorDropdown(
                        row['생활지도'] || row['behavior'] || ''
                    );
                    if (isUnreadable && rowName.trim() !== '') unreadableBehavior.push(rowName);

                    // 1. NEIS/기배정 서식 처리 (중복 헤더 발생: 반 vs 반_1)
                    // 순서: 학년(New), 반(New), 번호(New) ... 학년(Old), 반(Old), 번호(Old)
                    const assignedGrade = row['학년'] || row['grade'];
                    const assignedClass = row['반'] || row['class'] || row['반(배정)'];
                    const assignedNumber = row['번호'] || row['number'];

                    const prevGrade = row['학년_1'] || row['grade_1'] || row['이전학년'] || row['prev_grade'] || row['학년(이전)'];
                    const prevClass = prevClassOf(row);
                    const prevNumber = row['번호_1'] || row['number_1'] || row['이전번호'] || row['prev_number'] || row['번호(이전)'];

                    // 기배정 여부 판단 로직 개선
                    let finalAssignedClass = null;
                    let finalPrevInfoForLogic = '';

                    // 중복 헤더(반_1)가 존재한다는 것은 "New(반) ... Old(반_1)" 구조라는 뜻
                    if (isFormB) {
                        // 서식 일치: 앞쪽 '반'은 배정반, 뒤쪽 '반_1'은 이전반
                        finalAssignedClass = parseAssignedClass(assignedClass);
                        finalPrevInfoForLogic = prevGrade || prevClass || prevNumber ? joinPrevInfo(prevGrade, prevClass, prevNumber) : '';
                    } else {
                        // 중복 헤더 없음: 기존 서식 (학년/반/번호 -> 이전 정보로 간주)
                        // 단, 명시적 '반(배정)' 컬럼이 있으면 그걸 배정반으로 씀
                        finalPrevInfoForLogic = assignedGrade && assignedClass ? joinPrevInfo(assignedGrade, assignedClass, assignedNumber) : (row['이전학년정보'] || row['prev_info'] || '');

                        finalAssignedClass = parseAssignedClass(row['반(배정)'] || row['assigned_class'] || row['배정반'] || row['새로운반'] || row['new_class']);
                    }

                    return {
                        id: uuidv4(),
                        name: rowName,
                        prev_info: finalPrevInfoForLogic,
                        gender: gender ?? 'F',
                        academic_score: hasScore ? parsedScore : 500,
                        behavior_score: behaviorScore,
                        behavior_type: behaviorType,
                        behavior_note: String(row['비고'] || row['behavior_note'] || ''),
                        group_ids: [],
                        avoid_ids: [],
                        keep_ids: [],
                        fixed_class: parseAssignedClass(row['고정반'] || row['fixed_class']) ?? undefined,
                        birth: undefined, // 생년월일은 수집하지 않음
                        assigned_class: finalAssignedClass
                    };
    });

    const warnings: string[] = [];
    if (isResultFile) {
        warnings.push('배정 결과 파일을 읽었습니다. 이름, 성별, 성적, 반만 들어왔고 생활지도와 조건은 들어오지 않았습니다. 이어서 작업하려면 저장한 작업을 불러와 주세요.');
    }
    // 값이 빠진 채 배정되는 일이라 이름을 모두 적습니다. 안내 칸은 스크롤됩니다.
    const listNames = (names: string[]) => names.join(', ');
    if (blankNameRows > 0) {
        warnings.push(`이름이 비어 있는 행 ${blankNameRows}개를 건너뛰었습니다.`);
    }
    if (blankGender.length > 0) {
        warnings.push(`성별이 비어 있거나 읽을 수 없어 여학생으로 넣었습니다: ${listNames(blankGender)}`);
    }
    if (blankScore.length > 0) {
        warnings.push(`성적이 비어 있거나 숫자가 아니어서 500점으로 넣었습니다: ${listNames(blankScore)}`);
    }
    if (unreadableBehavior.length > 0) {
        warnings.push(`생활지도 값을 읽지 못해 해당없음으로 넣었습니다: ${listNames(unreadableBehavior)}. 행동(-2)처럼 적어 주세요.`);
    }

    if (isFormB && rowsWithPrev.length < namedRows.length) {
        const blank = namedRows.filter((row) => prevClassOf(row) === undefined).map(nameOfRow);
        warnings.push(`양식 B로 읽었는데 이전 반이 비어 있는 학생이 있습니다: ${listNames(blank)}. 전입생이면 그대로 두어도 됩니다.`);
    }
    if (!isFormB && rowsWithPrev.length > 0) {
        warnings.push(`양식 A로 읽었습니다. 이전 반 칸이 채워진 줄은 이 양식과 맞지 않아 그 칸을 쓰지 않았습니다: ${listNames(rowsWithPrev.map(nameOfRow))}`);
    }
    const hasPrevHeader = headers.some((h) => ['이전반', 'prev_class', '반_1', 'class_1', '반(이전)'].includes(h.trim()))
        || headers.filter((h) => h.trim() === '반').length > 1;
    if (!isFormB && rowsWithPrev.length === 0 && hasPrevHeader) {
        warnings.push('이전 반 칸이 모두 비어 있어 양식 A로 읽었습니다. 앞쪽 반을 이전 반으로 넣었습니다. 양식 B라면 이전 학년, 반, 번호를 채워 주세요.');
    }

    const named = students.filter((s) => s.name.trim() !== '');
    const placed = named.filter((s) => s.assigned_class).length;
    const formName = isResultFile ? '배정 결과 파일' : isFormB ? '양식 B(기배정안)' : '양식 A(이전 학년 명단)';
    const formLine = `${formName}로 읽었습니다. 학생 ${named.length}명${placed > 0 ? `, 반이 정해진 학생 ${placed}명` : ''}.`;

    return { students: named, warnings, formLine };
}

// 성별 파싱. 읽을 수 없으면 null입니다.
function parseGender(value: any): Gender | null {
    const str = String(value ?? '').toUpperCase().trim();
    if (str === 'M' || str === '남' || str === '남자' || str === 'MALE') return 'M';
    if (str === 'F' || str === '여' || str === '여자' || str === 'FEMALE') return 'F';
    return null;
}

// 생활지도 값의 유형과 등급 범위
const BEHAVIOR_KINDS: { type: BehaviorType; words: string[]; sign: 1 | -1; maxLevel: number }[] = [
    { type: 'LEADER', words: ['리더십', '리더쉽', '리더형', '리더', 'LEADER'], sign: 1, maxLevel: 2 },
    { type: 'BEHAVIOR', words: ['행동형', '행동', 'BEHAVIOR'], sign: -1, maxLevel: 3 },
    { type: 'EMOTIONAL', words: ['정서형', '정서', 'EMOTIONAL'], sign: -1, maxLevel: 3 },
];

const NO_BEHAVIOR_VALUES = ['', '해당없음', '없음', '-', 'NONE'];

// 한글 낱말은 글자 사이가 띄어져 있어도 봅니다. '행 동(-2)'
const BEHAVIOR_WORDS = BEHAVIOR_KINDS.flatMap((kind) => kind.words)
    .map((word) => (/^[가-힣]+$/.test(word) ? [...word].join('\\s*') : word))
    .join('|');
const SIGN = '[+\\-−–]';
// 유형 낱말 바로 뒤의 등급만 읽습니다. 셋 중 하나여야 하고, 그 밖의 숫자는 날짜나 횟수일 수 있어 읽지 않습니다.
// 괄호: 행동(-2), 행동(-2점), 행동(-2)메모 / 부호: 행동 -2, 행동, -2 메모 / 숫자만: 값이 거기서 끝나는 행동 3, 행동 2점
const BEHAVIOR_VALUE = new RegExp(
    `(${BEHAVIOR_WORDS})[\\s,:]*(?:`
    + `[(\\[]\\s*${SIGN}?\\s*(\\d)\\s*점?\\s*(?:[)\\]]|$)`
    + `|${SIGN}\\s*(\\d)점?(?=$|\\s|,\\s)`
    + `|(\\d)\\s*점?$`
    + `)`,
);
const ANY_BEHAVIOR_WORD = new RegExp(BEHAVIOR_WORDS, 'g');

// 생활지도 드롭다운 파싱
// 옵션: 해당없음, 리더(+2), 리더(+1), 행동(-1), 행동(-2), 행동(-3), 정서(-1), 정서(-2), 정서(-3)
// 전각 문자를 먼저 맞춥니다. 예전 파일의 리더(-2), 행동(+1)처럼 부호가 반대여도 등급은 같습니다.
// 앞뒤에 메모가 있어도 읽되, 유형 낱말이 둘 이상이거나 애매하면 짐작하지 않고 읽지 못한 값으로 알립니다.
export function parseBehaviorDropdown(value: any): { behaviorType: BehaviorType; behaviorScore: number; isUnreadable: boolean } {
    const text = String(value).normalize('NFKC').trim().toUpperCase();
    if (NO_BEHAVIOR_VALUES.includes(text.replace(/\s/g, ''))) {
        return { behaviorType: 'NONE', behaviorScore: 0, isUnreadable: false };
    }

    const wordCount = text.match(ANY_BEHAVIOR_WORD)?.length ?? 0;
    const match = wordCount === 1 ? text.match(BEHAVIOR_VALUE) : null;
    if (match) {
        const word = match[1].replace(/\s/g, '');
        const kind = BEHAVIOR_KINDS.find((candidate) => candidate.words.includes(word));
        const level = Number(match[2] ?? match[3] ?? match[4]);
        if (kind && level >= 1 && level <= kind.maxLevel) {
            return { behaviorType: kind.type, behaviorScore: kind.sign * level, isUnreadable: false };
        }
    }

    return { behaviorType: 'NONE', behaviorScore: 0, isUnreadable: true };
}

// 배정된 반 정보 정규화 (예: 1 -> "1반", "1반" -> "1반")
function parseAssignedClass(value: any): string | null {
    if (!value) return null;
    const str = String(value).trim();
    if (str === '') return null;

    // "1", "1 반"은 "1반"으로 맞춥니다.
    return normalizeClassName(str);
}

// 생년월일 파싱 및 정규화 (YYYY.MM.DD.)
function parseBirthDate(value: any): string | undefined {
    if (!value) return undefined;

    // 엑셀 날짜 객체인 경우
    if (value instanceof Date) {
        const y = value.getFullYear();
        const m = String(value.getMonth() + 1).padStart(2, '0');
        const d = String(value.getDate()).padStart(2, '0');
        return `${y}.${m}.${d}.`;
    }

    let str = String(value).trim();
    if (str === '') return undefined;

    // "2010-01-16" -> "2010.01.16."
    // "2010/01/16" -> "2010.01.16."
    // "2010.01.16" -> "2010.01.16."
    str = str.replace(/[-/]/g, '.');

    // 마지막에 점이 없으면 붙여줌
    if (!str.endsWith('.')) {
        str += '.';
    }

    return str;
}

interface ExportOptions {
    includeDetails?: boolean;
    groups?: CustomGroup[];
    numberingMethod?: NumberingMethod;
}

// 학생 데이터를 엑셀로 내보내기 (ExcelJS 사용)
export async function exportToExcel(
    students: Student[],
    classCount: number,
    filename: string = 'classzle-result.xlsx',
    options: ExportOptions = {}
) {
    const workbook = buildResultWorkbook(students, classCount, options);

    // 파일 다운로드
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
}

// 계 줄에 넣을 값입니다. 전출 뒤 기준으로 세고, 전출 예정 학생은 따로 셉니다.
interface ClassTally {
    total: number;
    male: number;
    female: number;
    scoreSum: number;
    transfer: number;
}

const emptyTally = (): ClassTally => ({ total: 0, male: 0, female: 0, scoreSum: 0, transfer: 0 });

function addToTally(tally: ClassTally, student: Student) {
    if (student.is_pre_transfer) {
        tally.transfer++;
        return;
    }
    tally.total++;
    if (student.gender === 'M') tally.male++;
    else tally.female++;
    tally.scoreSum += student.academic_score;
}

function tallyCells(tally: ClassTally) {
    return {
        count: `${tally.total}명`,
        note: tally.transfer > 0 ? `전출 ${tally.transfer}명 제외` : '',
        gender: `남:${tally.male} 여:${tally.female}`,
        // 전출 예정 학생만 있는 반은 평균이 없습니다.
        average: tally.total > 0 ? (tally.scoreSum / tally.total).toFixed(1) : '',
    };
}

// 결과 파일에 들어가지 않는 학생입니다. 미배정과, 학급 수를 줄여 없어진 반의 학생입니다. 보드도 이들을 미배정으로 보여 줍니다.
export function studentsLeftOutOfExport(students: Student[], classCount: number): Student[] {
    const classNames = makeClassNames(classCount);
    return students.filter((s) => resolveClassIndex(s.assigned_class, classNames) < 0);
}

// 결과 통합 문서를 만듭니다. 기본 정보만 고르면 생활지도와 관계 정보가 들어가지 않아야 합니다.
export function buildResultWorkbook(
    students: Student[],
    classCount: number,
    options: ExportOptions = {}
): ExcelJS.Workbook {
    const { includeDetails = false, groups = [], numberingMethod = 'mixed' } = options;
    const workbook = new ExcelJS.Workbook();

    // 있는 반에 배정된 학생만 넣고 반 표기를 맞춥니다.
    const classNames = makeClassNames(classCount);
    const placedStudents = students.flatMap((s) => {
        const index = resolveClassIndex(s.assigned_class, classNames);
        return index < 0 ? [] : [{ ...s, assigned_class: classNames[index] }];
    });

    // 기본 정보에도 성적과 반 평균이 들어갑니다. 담임 협의와 담당 교사가 씁니다. 학생에게 알리는 일은 NEIS로 합니다.
    // 전출 예정은 명단을 쓰는 데 필요해서 있을 때만 비고로 넣습니다.
    const hasTransfer = students.some((s) => s.is_pre_transfer);
    const lastColumnHeader = includeDetails ? '특이사항/조건' : hasTransfer ? '비고' : null;
    const lastColumnFor = (s: Student) =>
        includeDetails ? formatStudentDetails(s, groups, students) : s.is_pre_transfer ? '전출 예정' : '';

    // 공통 스타일 정의
    const baseFont = { name: 'Pretendard', size: 11 };
    const headerFont = { name: 'Pretendard', size: 11, bold: true };
    const borderStyle: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };
    const headerFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' }
    };
    const alignmentCenter: Partial<ExcelJS.Alignment> = { vertical: 'middle', horizontal: 'center' };

    // ---------------------------------------------------------
    // 1. 배정 결과 (반별 정렬) 시트
    // ---------------------------------------------------------
    const sheet1 = workbook.addWorksheet('배정결과(반별)');
    // sheet1.pageSetup.printTitlesRow = '1:1'; // 이 설정 제거 (수동 헤더와 중복됨)
    sheet1.pageSetup.fitToPage = true;
    sheet1.pageSetup.fitToHeight = 0; // 높이는 자동 (페이지 수 제한 없음)
    sheet1.pageSetup.fitToWidth = 1;  // 너비는 1페이지에 맞춤
    sheet1.pageSetup.orientation = 'portrait'; // 세로 방향
    sheet1.pageSetup.margins = {
        left: 0.25, right: 0.25, top: 0.75, bottom: 0.75,
        header: 0.3, footer: 0.3
    }; // 좁은 여백
    sheet1.pageSetup.horizontalCentered = true; // 가로 가운데 정렬
    sheet1.properties.defaultRowHeight = 25; // 기본 행 높이 설정 (모든 행에 적용안될수있으므로 명시적 설정 병행)

    // 시트 1 헤더 값 정의
    const sheet1HeaderValues = {
        new_grade: '학년(배정)',
        new_class: '반(배정)',
        new_number: '번호(배정)',
        name: '성명',
        gender: '성별',
        score: '성적',
        prev_grade: '학년(이전)',
        prev_class: '반(이전)',
        prev_number: '번호(이전)'
    };

    sheet1.columns = [
        { header: '학년(배정)', key: 'new_grade', width: 9 },
        { header: '반(배정)', key: 'new_class', width: 7 },
        { header: '번호(배정)', key: 'new_number', width: 9 },
        { header: '성명', key: 'name', width: 11 },
        { header: '성별', key: 'gender', width: 18 },
        { header: '성적', key: 'score', width: 9 },
        { header: '학년(이전)', key: 'prev_grade', width: 9 },
        { header: '반(이전)', key: 'prev_class', width: 7 },
        { header: '번호(이전)', key: 'prev_number', width: 9 },
    ];

    if (lastColumnHeader) {
        sheet1.columns = [
            ...sheet1.columns,
            { header: lastColumnHeader, key: 'details', width: includeDetails ? 40 : 14 }
        ];
        // 중간 헤더에도 details 컬럼 포함
        (sheet1HeaderValues as any).details = lastColumnHeader;
    }

    // 헤더 스타일 적용 (첫 번째 행)
    const firstHeaderRow1 = sheet1.getRow(1);
    firstHeaderRow1.height = 25; // 첫 헤더 높이 명시
    firstHeaderRow1.eachCell((cell) => {
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.border = borderStyle;
        cell.alignment = alignmentCenter;
    });

    // 데이터 준비 (반별 정렬)
    // 1. 반별로 그룹화하여 정렬
    const sortedByClass = [...placedStudents].sort((a, b) => {
        const classA = parseInt(a.assigned_class?.replace(/[^0-9]/g, '') || '0');
        const classB = parseInt(b.assigned_class?.replace(/[^0-9]/g, '') || '0');
        if (classA !== classB) return classA - classB;

        if (numberingMethod === 'mixed') {
            const preA = a.is_pre_transfer ? 1 : 0;
            const preB = b.is_pre_transfer ? 1 : 0;
            if (preA !== preB) return preA - preB;
            return a.name.localeCompare(b.name, 'ko');
        } else {
            const firstGender = numberingMethod === 'maleFirst' ? 'M' : 'F';
            if (a.gender !== b.gender) return a.gender === firstGender ? -1 : 1;
            const preA = a.is_pre_transfer ? 1 : 0;
            const preB = b.is_pre_transfer ? 1 : 0;
            if (preA !== preB) return preA - preB;
            return a.name.localeCompare(b.name, 'ko');
        }
    });

    // 각 반별 출석 번호 미리 계산
    const classAttendanceMaps: Record<string, Record<string, number>> = {};
    const classesList = Array.from(new Set(sortedByClass.map(s => s.assigned_class as string)));
    classesList.forEach(cn => {
        const classStudents = sortedByClass.filter(s => s.assigned_class === cn);
        classAttendanceMaps[cn] = calculateAttendanceNumbers(classStudents, numberingMethod);
    });

    let currentClass = '';
    let newNumberCounter = 1;

    // 반별 요약 계산을 위한 변수
    let classStats = emptyTally();

    sortedByClass.forEach((s, index) => {
        const assignedClass = s.assigned_class || '';

        // 반이 바뀌면 이전 반 요약 출력 및 줄바꿈 처리
        if (currentClass && currentClass !== assignedClass) {

            // 첫 번째 반이 아니면 요약 행 및 공백 추가
            if (currentClass !== '') {
                // 요약 행 추가
                const summaryRow = sheet1.addRow({
                    new_grade: '',
                    new_class: '계',
                    new_number: tallyCells(classStats).count,
                    name: tallyCells(classStats).note,
                    gender: tallyCells(classStats).gender,
                    score: tallyCells(classStats).average,
                    prev_grade: '',
                    prev_class: '',
                    prev_number: '',
                    details: ''
                });

                summaryRow.height = 25; // 요약 행 높이 명시

                // 요약 행 스타일
                summaryRow.eachCell((cell) => {
                    cell.font = headerFont;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
                    cell.border = borderStyle;
                    cell.alignment = alignmentCenter;
                });

                // 시각적 분리를 위한 빈 행 추가
                sheet1.addRow({});
                sheet1.addRow({});

                // 페이지 나누기
                sheet1.getRow(sheet1.rowCount).addPageBreak();

                // **다음 반 시작 전 헤더 추가**
                const headerRow = sheet1.addRow(sheet1HeaderValues);
                headerRow.height = 25; // 중간 헤더 높이 명시
                headerRow.eachCell((cell) => {
                    cell.font = headerFont;
                    cell.fill = headerFill;
                    cell.border = borderStyle;
                    cell.alignment = alignmentCenter;
                });
            }

            // 초기화
            newNumberCounter = 1;
            classStats = emptyTally();
        }

        currentClass = assignedClass;

        // 이전 학년 정보 파싱 (예: "2-1-15")
        const { grade: prevGrade, classNum: prevClass, number: prevNumber } = prevParts(s.prev_info);

        // 배정 학년 추론 (이전학년 + 1)
        const newGrade = nextGradeOf(prevGrade);

        // 데이터 행 추가
        const row = sheet1.addRow({
            new_grade: newGrade,
            new_class: assignedClass.replace('반', ''),
            new_number: classAttendanceMaps[assignedClass]?.[s.id] || '',
            name: s.name,
            gender: s.gender === 'M' ? '남' : '여',
            score: s.academic_score,
            prev_grade: prevGrade,
            prev_class: prevClass,
            prev_number: prevNumber,
            details: lastColumnFor(s)
        });

        row.height = 25; // 데이터 행 높이 명시

        // 데이터 행 스타일
        row.eachCell((cell) => {
            cell.font = baseFont;
            cell.border = borderStyle;
            cell.alignment = alignmentCenter;
        });

        // 통계 누적
        addToTally(classStats, s);

        // 마지막 행 처리
        if (index === sortedByClass.length - 1) {
            const summaryRow = sheet1.addRow({
                new_grade: '',
                new_class: '계',
                new_number: tallyCells(classStats).count,
                name: tallyCells(classStats).note,
                gender: tallyCells(classStats).gender,
                score: tallyCells(classStats).average,
                prev_grade: '',
                prev_class: '',
                prev_number: '',
                details: ''
            });
            summaryRow.height = 25; // 마지막 요약 행 높이 명시
            summaryRow.eachCell((cell) => {
                cell.font = headerFont;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
                cell.border = borderStyle;
                cell.alignment = alignmentCenter;
            });
        }
    });


    // ---------------------------------------------------------
    // 2. 배정 결과 (이전반 정렬) 시트
    // ---------------------------------------------------------
    const sheet2 = workbook.addWorksheet('배정결과(이전반별)');
    // sheet2.pageSetup.printTitlesRow = '1:1'; // 이 설정 제거 (수동 헤더와 중복됨)
    sheet2.pageSetup.fitToPage = true;
    sheet2.pageSetup.fitToHeight = 0;
    sheet2.pageSetup.fitToWidth = 1;
    sheet2.pageSetup.orientation = 'portrait';
    sheet2.pageSetup.margins = {
        left: 0.25, right: 0.25, top: 0.75, bottom: 0.75,
        header: 0.3, footer: 0.3
    };
    sheet2.pageSetup.horizontalCentered = true; // 가로 가운데 정렬
    sheet2.properties.defaultRowHeight = 25; // 기본 행 높이 설정


    const sheet2HeaderValues = {
        prev_grade: '학년(이전)',
        prev_class: '반(이전)',
        prev_number: '번호(이전)',
        name: '성명',
        gender: '성별',
        score: '성적',
        new_grade: '학년(배정)',
        new_class: '반(배정)',
        new_number: '번호(배정)'
    };

    sheet2.columns = [
        { header: '학년(이전)', key: 'prev_grade', width: 9 },
        { header: '반(이전)', key: 'prev_class', width: 7 },
        { header: '번호(이전)', key: 'prev_number', width: 9 },
        { header: '성명', key: 'name', width: 11 },
        { header: '성별', key: 'gender', width: 18 },
        { header: '성적', key: 'score', width: 9 },
        { header: '학년(배정)', key: 'new_grade', width: 9 },
        { header: '반(배정)', key: 'new_class', width: 7 },
        { header: '번호(배정)', key: 'new_number', width: 9 },
    ];

    if (lastColumnHeader) {
        sheet2.columns = [
            ...sheet2.columns,
            { header: lastColumnHeader, key: 'details', width: includeDetails ? 40 : 14 }
        ];
        // 중간 헤더에도 details 컬럼 포함
        (sheet2HeaderValues as any).details = lastColumnHeader;
    }

    const firstHeaderRow2 = sheet2.getRow(1);
    firstHeaderRow2.height = 25; // 첫 헤더 높이 명시
    firstHeaderRow2.eachCell((cell) => {
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.border = borderStyle;
        cell.alignment = alignmentCenter;
    });

    // 2. 이전 반 -> 이전 번호 순으로 정렬
    const sortedByPrevClass = [...placedStudents].sort((a, b) => {
        const parsePrev = (info: string) => {
            const parts = info.split('-');
            return {
                grade: parseInt(parts[0]) || 0,
                classNum: parseInt(parts[1]) || 0,
                studentNum: parseInt(parts[2]) || 0
            };
        };

        const prevA = parsePrev(a.prev_info);
        const prevB = parsePrev(b.prev_info);

        if (prevA.grade !== prevB.grade) return prevA.grade - prevB.grade;
        if (prevA.classNum !== prevB.classNum) return prevA.classNum - prevB.classNum;
        return prevA.studentNum - prevB.studentNum;
    });

    // 배정 번호 맵 생성 (학생 ID -> 배정 번호) - 시트1에서 생성된 번호를 유지하기 위함이 아니라, 시트2는 그냥 목록이므로 재계산보다 그냥 출력
    // 하지만 "배정 번호"는 시트 1의 로직(반별 정렬 순)을 따라야 함.
    // 따라서 sortedByClass를 순회하며 배정 번호를 map에 저장해두고 여기서 쓰는게 정확함.
    const assignedNumberMap = new Map<string, number>();
    {
        let currentC = '';
        let num = 1;
        // sortedByClass는 이미 위에서 정의됨 (ID가 필요하므로 원본 참조)
        sortedByClass.forEach(s => {
            if (currentC !== s.assigned_class) {
                currentC = s.assigned_class || '';
                num = 1;
            }
            assignedNumberMap.set(s.id, num++);
        });
    }


    let currentPrevClassFull = ''; // 학년-반 조합
    classStats = emptyTally();

    sortedByPrevClass.forEach((s, index) => {
        const { grade: prevGrade, classNum: prevClass, number: prevNumber } = prevParts(s.prev_info);
        const prevClassFull = `${prevGrade}-${prevClass}`;

        if (currentPrevClassFull && currentPrevClassFull !== prevClassFull) {
            // 요약 행
            const summaryRow = sheet2.addRow({
                prev_grade: '',
                prev_class: '계',
                prev_number: tallyCells(classStats).count,
                name: tallyCells(classStats).note,
                gender: tallyCells(classStats).gender,
                score: tallyCells(classStats).average,
                new_grade: '',
                new_class: '',
                new_number: ''
            });
            summaryRow.height = 25; // 요약 행 높이 명시

            summaryRow.eachCell((cell) => {
                cell.font = headerFont;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
                cell.border = borderStyle;
                cell.alignment = alignmentCenter;
            });

            // 시각적 분리를 위한 빈 행 추가
            sheet2.addRow({});
            sheet2.addRow({});

            // 페이지 나누기
            sheet2.getRow(sheet2.rowCount).addPageBreak();

            // **다음 반 시작 전 헤더 추가**
            const headerRow = sheet2.addRow(sheet2HeaderValues);
            headerRow.height = 25; // 중간 헤더 높이 명시
            headerRow.eachCell((cell) => {
                cell.font = headerFont;
                cell.fill = headerFill;
                cell.border = borderStyle;
                cell.alignment = alignmentCenter;
            });

            classStats = emptyTally();
        }

        currentPrevClassFull = prevClassFull;

        const newGrade = nextGradeOf(prevGrade);
        const assignedClassNum = s.assigned_class?.replace('반', '') || '';

        const row = sheet2.addRow({
            prev_grade: prevGrade,
            prev_class: prevClass,
            prev_number: prevNumber,
            name: s.name,
            gender: s.gender === 'M' ? '남' : '여',
            score: s.academic_score,
            new_grade: newGrade,
            new_class: assignedClassNum,
            new_number: classAttendanceMaps[s.assigned_class!]?.[s.id] || '',
            details: lastColumnFor(s)
        });

        row.height = 25; // 데이터 행 높이 명시

        row.eachCell((cell) => {
            cell.font = baseFont;
            cell.border = borderStyle;
            cell.alignment = alignmentCenter;
        });

        addToTally(classStats, s);

        if (index === sortedByPrevClass.length - 1) {
            const summaryRow = sheet2.addRow({
                prev_grade: '',
                prev_class: '계',
                prev_number: tallyCells(classStats).count,
                name: tallyCells(classStats).note,
                gender: tallyCells(classStats).gender,
                score: tallyCells(classStats).average,
                new_grade: '',
                new_class: '',
                new_number: ''
            });
            summaryRow.height = 25; // 마지막 요약 행 높이 명시
            summaryRow.eachCell((cell) => {
                cell.font = headerFont;
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F7F7' } };
                cell.border = borderStyle;
                cell.alignment = alignmentCenter;
            });
        }
    });

    return workbook;
}

// 상세 정보 포맷팅
function formatStudentDetails(student: Student, groups: CustomGroup[], allStudents: Student[]): string {
    const details: string[] = [];

    if (student.is_pre_transfer) {
        details.push('전출 예정');
    }

    // 1. 생활지도
    if (student.behavior_type !== 'NONE') {
        const typeMap: Record<string, string> = {
            'LEADER': '리더',
            'BEHAVIOR': '행동',
            'EMOTIONAL': '정서'
        };
        const sign = student.behavior_score > 0 ? '+' : '';
        details.push(`${typeMap[student.behavior_type] || student.behavior_type}(${sign}${student.behavior_score})`);
    }

    // 2. 그룹
    student.group_ids?.forEach(gid => {
        const group = groups.find(g => g.id === gid);
        if (group) {
            details.push(`[${group.name}]`);
        }
    });

    // 3. 관계 (분리)
    student.avoid_ids?.forEach(aid => {
        const other = allStudents.find(s => s.id === aid);
        if (other) {
            details.push(`${other.name}(분리)`);
        }
    });

    // 4. 관계 (함께)
    student.keep_ids?.forEach(kid => {
        const other = allStudents.find(s => s.id === kid);
        if (other) {
            details.push(`${other.name}(함께)`);
        }
    });

    // 5. 고정 배정
    if (student.fixed_class) {
        details.push(`${student.fixed_class}고정`);
    }

    if (student.behavior_note) {
        details.push(`비고: ${student.behavior_note}`);
    }

    return details.join(', ');
}

import ExcelJS from 'exceljs';

// 양식의 드롭다운과 색을 적용할 마지막 행. 학년 전체 명단도 들어가도록 넉넉하게 둡니다.
export const TEMPLATE_LAST_ROW = 1000;

function addBehaviorDropdown(sheet: ExcelJS.Worksheet, column: string) {
    for (let i = 2; i <= TEMPLATE_LAST_ROW; i++) {
        sheet.getCell(`${column}${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"해당없음,리더(+2),리더(+1),행동(-1),행동(-2),행동(-3),정서(-1),정서(-2),정서(-3)"']
        };
    }
}

export async function saveWorkbook(workbook: ExcelJS.Workbook, filename: string) {
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.URL.revokeObjectURL(url);
}

// 샘플 엑셀 다운로드
export async function downloadSampleExcel() {
    await saveWorkbook(buildSampleWorkbook(), 'classzle-template.xlsx');
}

export function buildSampleWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('학생명단');

    // 헤더 설정
    sheet.columns = [
        { header: '학년', key: 'grade', width: 10 },
        { header: '반', key: 'class', width: 10 },
        { header: '번호', key: 'number', width: 10 },
        { header: '이름', key: 'name', width: 15 },
        { header: '성별', key: 'gender', width: 10 },
        { header: '성적', key: 'score', width: 15 },
        { header: '생활지도', key: 'behavior', width: 20 },
    ];

    // 샘플 데이터 추가 (예시 5명)
    const sampleData = [
        { grade: 2, class: 1, number: 1, name: '김민준', gender: '남', score: 950, behavior: '해당없음' },
        { grade: 2, class: 1, number: 2, name: '이서연', gender: '여', score: 920, behavior: '리더(+1)' },
        { grade: 2, class: 1, number: 3, name: '박도윤', gender: '남', score: 780, behavior: '행동(-2)' },
        { grade: 2, class: 2, number: 1, name: '최서윤', gender: '여', score: 650, behavior: '정서(-1)' },
        { grade: 2, class: 2, number: 2, name: '정지우', gender: '남', score: 500, behavior: '해당없음' },
    ];

    // 스타일 정의
    const borderStyle: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
    };

    const headerFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEEEEEE' } // 연한 회색 배경
    };

    const baseFont = { name: 'Pretendard', size: 11 };
    const headerFont = { name: 'Pretendard', size: 11, bold: true };

    // 헤더 행 스타일 적용
    const headerRow = sheet.getRow(1);

    // 1~7열(A~G)까지만 헤더 스타일 적용
    for (let i = 1; i <= 7; i++) {
        const cell = headerRow.getCell(i);
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    sampleData.forEach(row => {
        sheet.addRow(row);
    });

    // 조건부 서식 적용 (A~G열 전체 배경색 변경)
    const RANGE = `A2:G${TEMPLATE_LAST_ROW}`;

    // Helper to create rule
    const createRule = (searchText: string, argb: string, priority: number): ExcelJS.ConditionalFormattingRule => ({
        type: 'expression',
        priority,
        formulae: [`ISNUMBER(SEARCH("${searchText}", $G2))`],
        style: {
            fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb },
            }
        }
    });

    const rules: ExcelJS.ConditionalFormattingRule[] = [
        // Leader (+2) - Darker Green
        createRule('리더(+2)', 'FFBBF7D0', 1), // green-200
        // Leader (+1) - Lighter Green (Default Leader)
        createRule('리더', 'FFDCFCE7', 2),     // green-100 (catch-all for other leader types if any)

        // Behavior (-3) - Darkest Orange
        createRule('행동(-3)', 'FFFDBA74', 3), // orange-300
        // Behavior (-2) - Medium Orange
        createRule('행동(-2)', 'FFFED7AA', 4), // orange-200
        // Behavior (-1) - Light Orange (Default Behavior)
        createRule('행동', 'FFFFEDD5', 5),     // orange-100

        // Emotional (-3) - Darkest Blue
        createRule('정서(-3)', 'FF93C5FD', 6), // blue-300
        // Emotional (-2) - Medium Blue
        createRule('정서(-2)', 'FFBFDBFE', 7), // blue-200
        // Emotional (-1) - Light Blue (Default Emotional)
        createRule('정서', 'FFDBEAFE', 8),     // blue-100
    ];

    sheet.addConditionalFormatting({
        ref: RANGE,
        rules: rules
    });

    // 작성 가이드 추가 (I열 - 9번째 열)
    sheet.getColumn(9).width = 60; // I열 너비 설정

    const guideTitle = sheet.getCell('I2');
    guideTitle.value = '📌 엑셀 작성 가이드';
    guideTitle.font = { name: 'Pretendard', size: 12, bold: true };

    const guides = [
        '1. 학년, 반, 번호, 이름, 성별은 필수 입력 항목입니다.',
        '2. 성적은 숫자(점수)로 입력해주세요. (입력하지 않으면 기본값 500점)',
        '3. 생활지도는 드롭다운 목록에서 선택하실 수 있습니다.',
        '4. 생활지도를 포함한 모든 학생 정보는 앱 내',
        '   [기초정보 > 학생관리] 표에서 언제든지 수정하실 수 있습니다.'
    ];

    guides.forEach((text, index) => {
        const cell = sheet.getCell(`I${index + 4}`);
        cell.value = text;
        cell.font = { name: 'Pretendard', size: 10 };
        // 4, 5번째 항목(앱 내 수정 가능) 강조
        if (index >= 3) {
            cell.font = { name: 'Pretendard', size: 10, bold: true, color: { argb: 'FFDC2626' } }; // Red color for emphasis
        }
    });

    // 전체 셀 스타일 적용 (테두리 및 정렬)
    // 데이터가 있는 1~7열(A~G)만 테두리 및 정렬 적용
    sheet.eachRow((row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            if (colNumber <= 7) {
                cell.border = borderStyle;
                cell.font = rowNumber === 1 ? headerFont : baseFont;
                cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
        });
    });

    // 드롭다운 옵션 (생활지도 - G열)
    addBehaviorDropdown(sheet, 'G');

    return workbook;
}

// 기배정 데이터용 샘플 엑셀 다운로드 (서식 2: NEIS형)
export async function downloadPreAssignedSampleExcel() {
    await saveWorkbook(buildPreAssignedSampleWorkbook(), 'classzle-template-preassigned.xlsx');
}

export function buildPreAssignedSampleWorkbook(): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('기배정명단');

    // 헤더 설정 (NEIS 서식 스타일: 앞쪽이 배정반, 뒤쪽이 이전반)
    // 중복된 헤더 이름 사용 (sheet_to_json 파싱 시 _1 등이 붙음)
    sheet.columns = [
        { header: '학년', key: 'new_grade', width: 10 },
        { header: '반', key: 'new_class', width: 10 },
        { header: '번호', key: 'new_number', width: 10 },
        { header: '성명', key: 'name', width: 15 },
        { header: '생년월일', key: 'birth', width: 15 },
        { header: '성별', key: 'gender', width: 10 },
        { header: '기준성적', key: 'score', width: 15 },
        { header: '생활지도', key: 'behavior', width: 20 },
        { header: '학년', key: 'old_grade', width: 10 },
        { header: '반', key: 'old_class', width: 10 },
        { header: '번호', key: 'old_number', width: 10 },
    ];

    // 샘플 데이터 추가
    const sampleData = [
        {
            new_grade: 3, new_class: 1, new_number: 1,
            name: '김배정', birth: '2010.01.16.', gender: '남', score: 950, behavior: '해당없음',
            old_grade: 2, old_class: 2, old_number: 15
        },
        {
            new_grade: 3, new_class: 1, new_number: 2,
            name: '이수정', birth: '2010.02.20.', gender: '여', score: 880, behavior: '리더(+1)',
            old_grade: 2, old_class: 1, old_number: 5
        },
        {
            new_grade: 3, new_class: 2, new_number: 1,
            name: '박철수', birth: '2010.03.05.', gender: '남', score: 700, behavior: '행동(-2)',
            old_grade: 2, old_class: 3, old_number: 20
        },
    ];

    // 스타일 정의
    const borderStyle: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    };
    const headerFill: ExcelJS.Fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } // 연한 회색 (통일)
    };
    const headerFont = { name: 'Pretendard', size: 11, bold: true };
    const baseFont = { name: 'Pretendard', size: 11 };

    // 헤더 행 스타일
    const headerRow = sheet.getRow(1);
    for (let i = 1; i <= 11; i++) {
        const cell = headerRow.getCell(i);
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
    }

    sampleData.forEach(row => sheet.addRow(row));

    // 전체 셀 스타일
    sheet.eachRow((row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
            cell.border = borderStyle;
            cell.font = rowNumber === 1 ? headerFont : baseFont;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
    });

    // 조건부 서식 적용 (A~K열 전체 배경색 변경)
    // Behavior column is H (8th column)
    const RANGE = `A2:K${TEMPLATE_LAST_ROW}`;

    // Helper to create rule (Same logic as Form A, but checking $H2)
    const createRule = (searchText: string, argb: string, priority: number): ExcelJS.ConditionalFormattingRule => ({
        type: 'expression',
        priority,
        formulae: [`ISNUMBER(SEARCH("${searchText}", $H2))`],
        style: {
            fill: {
                type: 'pattern',
                pattern: 'solid',
                bgColor: { argb },
            }
        }
    });

    const rules: ExcelJS.ConditionalFormattingRule[] = [
        createRule('리더(+2)', 'FFBBF7D0', 1), // green-200
        createRule('리더', 'FFDCFCE7', 2),     // green-100
        createRule('행동(-3)', 'FFFDBA74', 3), // orange-300
        createRule('행동(-2)', 'FFFED7AA', 4), // orange-200
        createRule('행동', 'FFFFEDD5', 5),     // orange-100
        createRule('정서(-3)', 'FF93C5FD', 6), // blue-300
        createRule('정서(-2)', 'FFBFDBFE', 7), // blue-200
        createRule('정서', 'FFDBEAFE', 8),     // blue-100
    ];

    sheet.addConditionalFormatting({
        ref: RANGE,
        rules: rules
    });

    // 드롭다운 옵션 (생활지도 - H열)
    addBehaviorDropdown(sheet, 'H');

    // 안내 문구
    const guideColIndex = 13; // M열
    sheet.getColumn(guideColIndex).width = 60;
    const guideTitle = sheet.getCell(2, guideColIndex);
    guideTitle.value = '📌 교무부/기배정 양식 가이드';
    guideTitle.font = { name: 'Pretendard', size: 12, bold: true };

    const guides = [
        '1. 앞쪽 [학년, 반, 번호]는 "새로 배정된" 정보입니다.',
        '2. 뒤쪽 [학년, 반, 번호]는 "이전(작년)" 정보입니다.',
        '   예: 2 (학년), 1 (반), 15 (번호)',
        '3. 입력된 반 배정 정보는 초기 배정 상태로 불러와집니다.',
        '   (반 편성에서 [현재 배정 수정] 또는 [신규 배정] 선택 가능)',
        '4. 성명, 성별, 기준성적 등은 기존과 동일합니다.',
        '5. 생활지도는 H열 드롭다운을 통해 선택 가능합니다.'
    ];

    guides.forEach((text, index) => {
        const cell = sheet.getCell(index + 4, guideColIndex);
        cell.value = text;
        cell.font = { name: 'Pretendard', size: 10 };
    });

    return workbook;
}

