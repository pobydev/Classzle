// 홈페이지에 올리는 가상 학생 예시 명단(양식 A)을 만듭니다. 이름, 성적, 생활지도는 모두 지어낸 값입니다.
// 실행: node scripts/make-example-rosters.mjs [출력 폴더]
// 기본 출력 폴더는 ../gnilab-site/public/examples/classzle 입니다. 같은 씨앗을 쓰므로 다시 돌려도 같은 명단이 나옵니다.
import ExcelJS from 'exceljs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(process.argv[2] ?? path.join(here, '../../gnilab-site/public/examples/classzle'));

// 전학년도 학급 수와 학생 수
const ROSTERS = [
    { classes: 4, students: 100 },
    { classes: 6, students: 150 },
    { classes: 8, students: 220 },
    { classes: 10, students: 300 },
];

// 학년 전체에서 생활지도 값이 차지하는 비율
const BEHAVIOR_SHARE = [
    ['행동(-3)', 0.01],
    ['행동(-2)', 0.03],
    ['행동(-1)', 0.05],
    ['정서(-3)', 0.007],
    ['정서(-2)', 0.02],
    ['정서(-1)', 0.04],
    ['리더(+2)', 0.025],
    ['리더(+1)', 0.07],
];

// 성이 흔한 만큼 자주 나오게 합니다.
const LAST_NAMES = [
    ['김', 21], ['이', 15], ['박', 8], ['최', 5], ['정', 5], ['강', 3], ['조', 3], ['윤', 2], ['장', 2], ['임', 2],
    ['한', 2], ['오', 2], ['서', 2], ['신', 2], ['권', 1], ['황', 1], ['안', 1], ['송', 1], ['류', 1], ['전', 1],
    ['홍', 1], ['고', 1], ['문', 1], ['양', 1], ['손', 1], ['배', 1], ['백', 1], ['허', 1], ['유', 1], ['남', 1],
    ['심', 1], ['노', 1], ['하', 1], ['곽', 1], ['성', 1], ['차', 1], ['주', 1], ['우', 1], ['구', 1], ['민', 1],
];
const MALE_NAMES = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지훈', '준서', '준우', '현우', '도현', '건우', '우진', '승현', '준혁', '재윤', '윤호', '시현', '정우', '승우', '유준', '현준', '태현', '지환', '민재', '동현', '민성', '규민', '연우', '서진', '수호', '현성', '승민', '성민', '재현', '태윤', '예성', '세준', '은호', '민호', '성준', '재원', '현석', '동우', '경민', '민혁', '원준', '지성', '준영', '은우', '민규', '성현', '승호', '기현', '준호', '현빈', '승준', '찬우', '세현', '호준', '진우', '한결', '윤성', '태민', '준수', '재훈', '선우', '우혁', '형준', '영민', '준기', '희준', '태원', '성훈', '정현', '진혁', '은성', '윤재', '시원', '동훈', '우빈', '민수', '태양', '세훈', '경호', '상현', '동민', '현수'];
const FEMALE_NAMES = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '채원', '수아', '다은', '예은', '지민', '수빈', '소율', '예린', '지아', '시은', '하린', '아린', '다인', '지원', '소은', '채은', '서영', '나은', '예지', '하영', '승아', '지연', '정은', '수민', '유진', '은서', '채린', '서아', '지현', '예원', '민지', '은채', '유나', '윤아', '다연', '소연', '민주', '혜원', '수연', '소영', '지수', '예나', '채윤', '시아', '주아', '유빈', '소희', '나윤', '채아', '세아', '다현', '수현', '슬기', '수정', '서희', '은비', '은지', '예서', '가은', '다영', '주연', '보람', '세은', '현주', '민정', '지영', '윤지', '수진', '혜린', '소정', '나연', '아영', '세영', '보영', '채영', '나영', '효진', '세희', '다솜', '해인', '정민', '서율', '민아'];

// 씨앗이 있는 난수 (mulberry32)
function makeRandom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffle(list, random) {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
}

function pickLastName(random) {
    const total = LAST_NAMES.reduce((sum, [, weight]) => sum + weight, 0);
    let at = random() * total;
    for (const [name, weight] of LAST_NAMES) {
        at -= weight;
        if (at < 0) return name;
    }
    return LAST_NAMES[0][0];
}

// 평균 650, 표준편차 150쯤의 성적. 300~990 사이 정수입니다.
function makeScore(random) {
    const z = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    return Math.round(Math.max(300, Math.min(990, 650 + z * 150)));
}

export function makeRoster({ classes, students }) {
    const random = makeRandom(classes * 1000 + students);

    // 반마다 인원을 고르게 나누고, 남는 학생은 앞 반부터 한 명씩 더합니다.
    const sizes = Array.from({ length: classes }, (_, i) => Math.floor(students / classes) + (i < students % classes ? 1 : 0));

    // 생활지도 값은 학년 전체에서 수를 정한 뒤 섞습니다. 반마다 몰리는 정도가 달라집니다.
    const behaviors = BEHAVIOR_SHARE.flatMap(([value, share]) => Array(Math.max(1, Math.round(students * share))).fill(value));
    while (behaviors.length < students) behaviors.push('해당없음');
    shuffle(behaviors, random);

    const used = new Set();
    const rows = [];
    sizes.forEach((size, classIndex) => {
        // 남학생 수는 반의 절반에서 한 명까지 차이 납니다.
        const half = classIndex % 2 === 0 ? Math.ceil(size / 2) : Math.floor(size / 2);
        const maleCount = half + Math.floor(random() * 3) - 1;
        const classRows = [];
        for (let i = 0; i < size; i++) {
            const gender = i < maleCount ? '남' : '여';
            const pool = gender === '남' ? MALE_NAMES : FEMALE_NAMES;
            let name;
            do {
                name = pickLastName(random) + pool[Math.floor(random() * pool.length)];
            } while (used.has(name));
            used.add(name);
            classRows.push({ name, gender, score: makeScore(random) });
        }
        // 번호는 이름 가나다순입니다.
        classRows.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        classRows.forEach((row, i) => {
            rows.push({ grade: 1, class: classIndex + 1, number: i + 1, ...row, behavior: behaviors[rows.length] });
        });
    });
    return rows;
}

// 앱의 양식 A(src/lib/excel.ts의 buildSampleWorkbook)와 같은 열, 같은 꾸밈입니다.
export function buildWorkbook(rows) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('학생명단');
    sheet.columns = [
        { header: '학년', key: 'grade', width: 10 },
        { header: '반', key: 'class', width: 10 },
        { header: '번호', key: 'number', width: 10 },
        { header: '이름', key: 'name', width: 15 },
        { header: '성별', key: 'gender', width: 10 },
        { header: '성적', key: 'score', width: 15 },
        { header: '생활지도', key: 'behavior', width: 20 },
    ];
    rows.forEach((row) => sheet.addRow(row));

    const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
            cell.border = border;
            cell.font = { name: 'Pretendard', size: 11, bold: rowNumber === 1 };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
            if (rowNumber === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        });
    });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const lastRow = rows.length + 1;
    const rule = (text, argb, priority) => ({
        type: 'expression',
        priority,
        formulae: [`ISNUMBER(SEARCH("${text}", $G2))`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } } },
    });
    sheet.addConditionalFormatting({
        ref: `A2:G${lastRow}`,
        rules: [
            rule('리더(+2)', 'FFBBF7D0', 1),
            rule('리더', 'FFDCFCE7', 2),
            rule('행동(-3)', 'FFFDBA74', 3),
            rule('행동(-2)', 'FFFED7AA', 4),
            rule('행동', 'FFFFEDD5', 5),
            rule('정서(-3)', 'FF93C5FD', 6),
            rule('정서(-2)', 'FFBFDBFE', 7),
            rule('정서', 'FFDBEAFE', 8),
        ],
    });
    for (let i = 2; i <= lastRow; i++) {
        sheet.getCell(`G${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"행동(-3),행동(-2),행동(-1),정서(-3),정서(-2),정서(-1),리더(+1),리더(+2),해당없음"'],
        };
    }

    sheet.getColumn(9).width = 60;
    sheet.getCell('I2').value = '가상 학생 예시 명단';
    sheet.getCell('I2').font = { name: 'Pretendard', size: 12, bold: true };
    ['이름, 성적, 생활지도는 모두 지어낸 값입니다.', '클래스즐을 미리 써 보는 데 쓰세요.'].forEach((text, i) => {
        sheet.getCell(`I${i + 4}`).value = text;
        sheet.getCell(`I${i + 4}`).font = { name: 'Pretendard', size: 10 };
    });
    return workbook;
}

export const fileNameOf = ({ classes, students }) => `classzle-example-${classes}-${students}.xlsx`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    mkdirSync(outDir, { recursive: true });
    for (const roster of ROSTERS) {
        const rows = makeRoster(roster);
        const file = path.join(outDir, fileNameOf(roster));
        await buildWorkbook(rows).xlsx.writeFile(file);
        const males = rows.filter((row) => row.gender === '남').length;
        const marked = rows.filter((row) => row.behavior !== '해당없음').length;
        console.log(`${fileNameOf(roster)}: ${roster.classes}반 ${rows.length}명 (남 ${males}, 여 ${rows.length - males}), 생활지도 ${marked}명`);
    }
    console.log(`만든 곳: ${outDir}`);
}
