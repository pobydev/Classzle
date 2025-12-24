import * as XLSX from 'xlsx';
import { Student, BehaviorType, Gender, CustomGroup, NumberingMethod } from '@/types';
import { calculateAttendanceNumbers } from './numbering';
import { v4 as uuidv4 } from 'uuid';

// 엑셀 파일에서 학생 데이터 파싱
export function parseExcelFile(file: File): Promise<Student[]> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const students: Student[] = jsonData.map((row: any) => {
                    // 생활지도 드롭다운 파싱
                    const { behaviorType, behaviorScore } = parseBehaviorDropdown(
                        row['생활지도'] || row['behavior'] || ''
                    );

                    // 1. NEIS/기배정 서식 처리 (중복 헤더 발생: 반 vs 반_1)
                    // 순서: 학년(New), 반(New), 번호(New) ... 학년(Old), 반(Old), 번호(Old)
                    const assignedGrade = row['학년'] || row['grade'];
                    const assignedClass = row['반'] || row['class'];
                    const assignedNumber = row['번호'] || row['number'];

                    const prevGrade = row['학년_1'] || row['grade_1'] || row['이전학년'] || row['prev_grade'];
                    const prevClass = row['반_1'] || row['class_1'] || row['이전반'] || row['prev_class'];
                    const prevNumber = row['번호_1'] || row['number_1'] || row['이전번호'] || row['prev_number'];

                    // 기배정 여부 판단 로직 개선
                    let finalAssignedClass = null;
                    let finalPrevInfoForLogic = '';

                    // 중복 헤더(반_1)가 존재한다는 것은 "New(반) ... Old(반_1)" 구조라는 뜻
                    if (prevClass !== undefined) {
                        // 서식 일치: 앞쪽 '반'은 배정반, 뒤쪽 '반_1'은 이전반
                        finalAssignedClass = parseAssignedClass(assignedClass);
                        finalPrevInfoForLogic = `${prevGrade}-${prevClass}-${prevNumber || ''}`;
                    } else {
                        // 중복 헤더 없음: 기존 서식 (학년/반/번호 -> 이전 정보로 간주)
                        // 단, 명시적 '반(배정)' 컬럼이 있으면 그걸 배정반으로 씀
                        finalPrevInfoForLogic = assignedGrade && assignedClass ? `${assignedGrade}-${assignedClass}-${assignedNumber}` : (row['이전학년정보'] || row['prev_info'] || '');

                        finalAssignedClass = parseAssignedClass(row['반(배정)'] || row['assigned_class'] || row['배정반'] || row['새로운반'] || row['new_class']);
                    }

                    return {
                        id: uuidv4(),
                        name: String(row['이름'] || row['name'] || row['성명'] || ''),
                        prev_info: finalPrevInfoForLogic,
                        gender: parseGender(row['성별'] || row['gender']),
                        academic_score: Number(row['성적'] || row['academic_score'] || row['점수'] || row['기준성적'] || 500),
                        behavior_score: behaviorScore,
                        behavior_type: behaviorType,
                        behavior_note: String(row['비고'] || row['behavior_note'] || ''),
                        group_ids: [],
                        avoid_ids: [],
                        keep_ids: [],
                        fixed_class: row['고정반'] || row['fixed_class'] || undefined,
                        birth: undefined, // 생년월일은 수집하지 않음
                        assigned_class: finalAssignedClass
                    };
                });

                resolve(students.filter(s => s.name.trim() !== ''));
            } catch (error) {
                reject(new Error('엑셀 파일 파싱 오류: ' + (error as Error).message));
            }
        };

        reader.onerror = () => {
            reject(new Error('파일 읽기 오류'));
        };

        reader.readAsBinaryString(file);
    });
}

// 성별 파싱
function parseGender(value: any): Gender {
    const str = String(value).toUpperCase().trim();
    if (str === 'M' || str === '남' || str === '남자' || str === 'MALE') {
        return 'M';
    }
    return 'F';
}

// 생활지도 드롭다운 파싱
// 옵션: 해당없음, 리더(-2), 리더(-1), 행동(+1), 행동(+2), 행동(+3), 정서(+1), 정서(+2), 정서(+3)
function parseBehaviorDropdown(value: any): { behaviorType: BehaviorType; behaviorScore: number } {
    const str = String(value).trim();

    if (!str || str === '해당없음' || str === 'NONE') {
        return { behaviorType: 'NONE', behaviorScore: 0 };
    }

    // 리더형 파싱
    if (str.includes('리더') || str.toUpperCase().includes('LEADER')) {
        if (str.includes('+2') || str.includes('2')) return { behaviorType: 'LEADER', behaviorScore: 2 };
        if (str.includes('+1') || str.includes('1')) return { behaviorType: 'LEADER', behaviorScore: 1 };
        return { behaviorType: 'LEADER', behaviorScore: 1 }; // 기본값
    }

    // 행동형 파싱
    if (str.includes('행동') || str.toUpperCase().includes('BEHAVIOR')) {
        if (str.includes('-3') || str.includes('3')) return { behaviorType: 'BEHAVIOR', behaviorScore: -3 };
        if (str.includes('-2') || str.includes('2')) return { behaviorType: 'BEHAVIOR', behaviorScore: -2 };
        if (str.includes('-1') || str.includes('1')) return { behaviorType: 'BEHAVIOR', behaviorScore: -1 };
        return { behaviorType: 'BEHAVIOR', behaviorScore: -1 }; // 기본값
    }

    // 정서형 파싱
    if (str.includes('정서') || str.toUpperCase().includes('EMOTIONAL')) {
        if (str.includes('-3') || str.includes('3')) return { behaviorType: 'EMOTIONAL', behaviorScore: -3 };
        if (str.includes('-2') || str.includes('2')) return { behaviorType: 'EMOTIONAL', behaviorScore: -2 };
        if (str.includes('-1') || str.includes('1')) return { behaviorType: 'EMOTIONAL', behaviorScore: -1 };
        return { behaviorType: 'EMOTIONAL', behaviorScore: -1 }; // 기본값
    }

    return { behaviorType: 'NONE', behaviorScore: 0 };
}

// 배정된 반 정보 정규화 (예: 1 -> "1반", "1반" -> "1반")
function parseAssignedClass(value: any): string | null {
    if (!value) return null;
    const str = String(value).trim();
    if (str === '') return null;

    // "반"이 포함되어 있으면 그대로 사용
    if (str.includes('반')) return str;

    // 숫자만 있는 경우 "반"을 붙여줌
    if (/^\d+$/.test(str)) {
        return `${str}반`;
    }

    return str;
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

// 학생 데이터를 엑셀로 내보내기 (ExcelJS 사용)
export async function exportToExcel(
    students: Student[],
    classCount: number,
    filename: string = 'classzle-result.xlsx',
    options: {
        includeDetails?: boolean;
        groups?: CustomGroup[];
        numberingMethod?: NumberingMethod;
    } = {}
) {
    const { includeDetails = false, groups = [], numberingMethod = 'mixed' } = options;
    const workbook = new ExcelJS.Workbook();

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

    if (includeDetails) {
        sheet1.columns = [
            ...sheet1.columns,
            { header: '특이사항/조건', key: 'details', width: 40 }
        ];
        // 중간 헤더에도 details 컬럼 포함
        (sheet1HeaderValues as any).details = '특이사항/조건';
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
    const sortedByClass = [...students].filter(s => s.assigned_class).sort((a, b) => {
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
    let classStats = {
        total: 0,
        male: 0,
        female: 0,
        scoreSum: 0
    };

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
                    new_number: `${classStats.total}명`,
                    name: '',
                    gender: `남:${classStats.male} 여:${classStats.female}`,
                    score: (classStats.scoreSum / classStats.total).toFixed(1),
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
            classStats = { total: 0, male: 0, female: 0, scoreSum: 0 };
        }

        currentClass = assignedClass;

        // 이전 학년 정보 파싱 (예: "2-1-15")
        const prevParts = s.prev_info.split('-');
        const prevGrade = prevParts.length > 0 ? prevParts[0] : '';
        const prevClass = prevParts.length > 1 ? prevParts[1] : '';
        const prevNumber = prevParts.length > 2 ? prevParts[2] : '';

        // 배정 학년 추론 (이전학년 + 1)
        const newGrade = prevGrade ? String(parseInt(prevGrade) + 1) : '';

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
            details: includeDetails ? formatStudentDetails(s, groups, students) : ''
        });

        row.height = 25; // 데이터 행 높이 명시

        // 데이터 행 스타일
        row.eachCell((cell) => {
            cell.font = baseFont;
            cell.border = borderStyle;
            cell.alignment = alignmentCenter;
        });

        // 통계 누적
        classStats.total++;
        if (s.gender === 'M') classStats.male++;
        else classStats.female++;
        classStats.scoreSum += s.academic_score;

        // 마지막 행 처리
        if (index === sortedByClass.length - 1) {
            const summaryRow = sheet1.addRow({
                new_grade: '',
                new_class: '계',
                new_number: `${classStats.total}명`,
                name: '',
                gender: `남:${classStats.male} 여:${classStats.female}`,
                score: (classStats.scoreSum / classStats.total).toFixed(1),
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

    if (includeDetails) {
        sheet2.columns = [
            ...sheet2.columns,
            { header: '특이사항/조건', key: 'details', width: 40 }
        ];
        // 중간 헤더에도 details 컬럼 포함
        (sheet2HeaderValues as any).details = '특이사항/조건';
    }

    const firstHeaderRow2 = sheet2.getRow(1);
    firstHeaderRow2.height = 25; // 첫 헤더 높이 명시
    firstHeaderRow2.eachCell((cell) => {
        cell.font = headerFont;
        cell.fill = headerFill;
        cell.border = borderStyle;
        cell.alignment = alignmentCenter;
    });

    // 2. 기초 구성을 위해 반 -> 번호 순으로 정렬 (시트 1과 일관성 유지)
    const sortedByPrevClass = [...students].filter(s => s.assigned_class).sort((a, b) => {
        const classA = parseInt(a.assigned_class?.replace(/[^0-9]/g, '') || '0');
        const classB = parseInt(b.assigned_class?.replace(/[^0-9]/g, '') || '0');
        if (classA !== classB) return classA - classB;

        const numA = classAttendanceMaps[a.assigned_class!]?.[a.id] || 0;
        const numB = classAttendanceMaps[b.assigned_class!]?.[b.id] || 0;
        return numA - numB;
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
    classStats = { total: 0, male: 0, female: 0, scoreSum: 0 };

    sortedByPrevClass.forEach((s, index) => {
        const prevParts = s.prev_info.split('-');
        const prevGrade = prevParts[0] || '';
        const prevClass = prevParts[1] || '';
        const prevNumber = prevParts[2] || '';
        const prevClassFull = `${prevGrade}-${prevClass}`;

        if (currentPrevClassFull && currentPrevClassFull !== prevClassFull) {
            // 요약 행
            const summaryRow = sheet2.addRow({
                prev_grade: '',
                prev_class: '계',
                prev_number: `${classStats.total}명`,
                name: '',
                gender: `남:${classStats.male} 여:${classStats.female}`,
                score: (classStats.scoreSum / classStats.total).toFixed(1),
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

            classStats = { total: 0, male: 0, female: 0, scoreSum: 0 };
        }

        currentPrevClassFull = prevClassFull;

        const newGrade = prevGrade ? String(parseInt(prevGrade) + 1) : '';
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
            details: includeDetails ? formatStudentDetails(s, groups, students) : ''
        });

        row.height = 25; // 데이터 행 높이 명시

        row.eachCell((cell) => {
            cell.font = baseFont;
            cell.border = borderStyle;
            cell.alignment = alignmentCenter;
        });

        classStats.total++;
        if (s.gender === 'M') classStats.male++;
        else classStats.female++;
        classStats.scoreSum += s.academic_score;

        if (index === sortedByPrevClass.length - 1) {
            const summaryRow = sheet2.addRow({
                prev_grade: '',
                prev_class: '계',
                prev_number: `${classStats.total}명`,
                name: '',
                gender: `남:${classStats.male} 여:${classStats.female}`,
                score: (classStats.scoreSum / classStats.total).toFixed(1),
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

// 상세 정보 포맷팅
function formatStudentDetails(student: Student, groups: CustomGroup[], allStudents: Student[]): string {
    const details: string[] = [];

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

    // 3. 관계 (피함)
    student.avoid_ids?.forEach(aid => {
        const other = allStudents.find(s => s.id === aid);
        if (other) {
            details.push(`${other.name}(피함)`);
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

    return details.join(', ');
}

import ExcelJS from 'exceljs';

// 샘플 엑셀 다운로드
export async function downloadSampleExcel() {
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

    // 조건부 서식 적용 (2행부터 100행까지, A~G열 전체 배경색 변경)
    const MAX_ROW = 100;
    const RANGE = `A2:G${MAX_ROW}`;

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
        '4. 생활지도 점수와 유형을 포함한 모든 학생 정보는 앱 내',
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
    // 데이터가 있는 행부터 100행까지 적용
    for (let i = 2; i <= 100; i++) {
        sheet.getCell(`G${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"해당없음,리더(+2),리더(+1),행동(-1),행동(-2),행동(-3),정서(-1),정서(-2),정서(-3)"']
        };
    }

    // 파일 다운로드 트리거
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'classzle-template.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
}

// 기배정 데이터용 샘플 엑셀 다운로드 (서식 2: NEIS형)
export async function downloadPreAssignedSampleExcel() {
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

    // 조건부 서식 적용 (2행부터 100행까지, A~K열 전체 배경색 변경)
    // Behavior column is H (8th column)
    const MAX_ROW = 100;
    const RANGE = `A2:K${MAX_ROW}`;

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
    for (let i = 2; i <= 100; i++) {
        sheet.getCell(`H${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"해당없음,리더(+2),리더(+1),행동(-1),행동(-2),행동(-3),정서(-1),정서(-2),정서(-3)"']
        };
    }

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
        '   (반 편성 탭에서 [기존 배정 유지] 또는 [전체 초기화] 선택 가능)',
        '4. 성명, 성별, 기준성적 등은 기존과 동일합니다.',
        '5. 생활지도는 H열 드롭다운을 통해 선택 가능합니다.'
    ];

    guides.forEach((text, index) => {
        const cell = sheet.getCell(index + 4, guideColIndex);
        cell.value = text;
        cell.font = { name: 'Pretendard', size: 10 };
    });

    // 다운로드 트리거
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'classzle-template-preassigned.xlsx';
    anchor.click();
    window.URL.revokeObjectURL(url);
}

