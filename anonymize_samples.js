const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const file1 = 'c:/antigravity workspace/Classzle/샘플1 가상 학급.xlsx';
const file2 = 'c:/antigravity workspace/Classzle/샘플2 가상 학급.xlsx';

const outputDir = 'c:/antigravity workspace/Classzle/classzle-docs/public/samples';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 3글자 이름 데이터베이스 (성 + 두글자 이름)
const characters = [
    // 슬램덩크
    '강백호', '서태웅', '채치수', '정대만', '송태섭', '권준호', '안한수', '이한나', '채소연', '윤대협', '변덕규', '황태산', '김수겸', '성현준', '이정환', '전호장', '신준섭', '홍익현', '고민구', '장권혁',
    // 짱구/도라에몽/코난/지브리/귀멸 (3글자만)
    '신짱구', '김철수', '한유리', '이훈이', '나미리', '채성아', '노진구', '신이슬', '만퉁퉁', '왕비실', '박영민',
    '남도일', '유미란', '유명한', '홍장미', '고뭉치', '박세모', '한아름', '하인성', '서가영', '이상윤', '안기준', '정보라',
    '하쿠나', '치히로', '소스케', '토토로', // 지브리는 3글자 만들기 애매해서 일부 제외하거나 각색
    '탄지로', '네즈코', '젠이츠', '이노스케', '기유', '시노부', '렌고쿠', '무이치로', '사네미', // 귀멸 한국식 독음
    // 고전 소설 / 전래동화 / 역사
    '홍길동', '성춘향', '이몽룡', '변학도', '심청이', '박흥부', '박놀부', '임꺽정', '장장화', '장홍련', '김선달', '황진이', '논개', '신사임', '이순신', '세종대', '장영실', '정약용', '김정호', '한석봉', '김구', '안중근', '윤봉길', '유관순',
    // 무한도전/예능/가수/배우/유명인
    '유재석', '박명수', '정준하', '하동훈', '노홍철', '정형돈', '길성준', '황광희', '조세호', '양세형', '이광수', '김종국', '송지효',
    '강호동', '이수근', '은지원', '안재현', '조규현', '송민호', '표지훈', '김희철', '민경훈', '서장훈', '이상민',
    '아이유', '박효신', '나얼', '김범수', '이선희', '임재범', '박정현', '이승기',
    '차은우', '김태리', '한소희', '송강', '박보영', '조정석', '전미도', '유연석', '정경호', '김대명',
    '손흥민', '이강인', '김민재', '황희찬', '조규성', '황인범', '이승우', '박지성', '이영표', '안정환', '차두리', '류현진', '추신수', '이정후', '김연아', '손연재', '장미란', '박태환',
    // 해리포터/마블 (한국식 3글자 변형 or 독음)
    '해리포', '론위즐', '헤르미', '말포이', '해그리', '덤블도', '스네이',
    '토니박', '스티브', '토르김', '배너박', '나타샤', '바튼조', '피터팬',
    // 일반적인 한국 이름 (부족할 경우 대비)
    '김민수', '이서준', '박지훈', '최예준', '정현우', '강시우', '조도현', '윤건우', '장준우', '임지호',
    '한서윤', '오서연', '서지우', '신하은', '권도은', '황수아', '안지아', '송서현', '전하윤', '홍민서',
    '김서준', '이도현', '박하준', '최은우', '정시우', '강지호', '조예준', '윤민준', '장유준', '임주원',
    '한이안', '오준우', '서건우', '신로운', '권우주', '황선우', '안서진', '송연우', '전정우', '홍승우',
    '김지아', '이하윤', '박서아', '최아윤', '정지유', '강서윤', '조서연', '윤아린', '장하은', '임아은',
    '한수아', '오지우', '서채원', '신예린', '권소윤', '황유나', '안지안', '송서율', '전시아', '홍다은'
];

// fallback: 부족할 경우 생성할 성씨와 이름들
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍', '유', '고', '문', '양', '손', '배', '조', '백', '허', '남'];
const firstNames = ['민', '서', '준', '현', '우', '지', '윤', '아', '은', '진', '호', '영', '수', '빈', '재', '하', '도', '연', '시', '규', '나', '다', '라', '마', '바', '사', '자', '차', '카', '타'];

function generateName(index) {
    if (index < characters.length) {
        // 이미 3글자인지 확인하고 반환
        const name = characters[index];
        if (name.length === 3) return name;
        // 3글자가 아니면(그럴리 없겠지만) 잘라서 반환
        return name.substring(0, 3);
    }

    // 리스트 소진 시 랜덤 조합 (재현 가능하도록 index 기반)
    const l = lastNames[index % lastNames.length];
    const f1 = firstNames[(index * 7) % firstNames.length];
    const f2 = firstNames[(index * 13) % firstNames.length];
    return l + f1 + f2;
}

function processFile(inputFile, outputName) {
    console.log(`Processing ${inputFile}...`);
    const workbook = XLSX.readFile(inputFile);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    // Header 찾기
    const header = data[0];
    let nameIdx = -1;
    header.forEach((col, i) => {
        if (typeof col === 'string' && (col === '이름' || col === '성명')) {
            nameIdx = i;
        }
    });

    if (nameIdx === -1) {
        console.error('Name column not found!');
        return;
    }

    // 이름 변경
    for (let i = 1; i < data.length; i++) {
        if (data[i][nameIdx]) {
            data[i][nameIdx] = generateName(i - 1);
        }
    }

    // 새 파일 저장
    const newWorkSheet = XLSX.utils.aoa_to_sheet(data);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorkSheet, sheetName);

    const outputPath = path.join(outputDir, outputName); // 경로 수정됨
    XLSX.writeFile(newWorkbook, outputPath);
    console.log(`Saved to ${outputPath}`);
}

processFile(file1, 'sample_data_basic.xlsx');
processFile(file2, 'sample_data_preassigned.xlsx');
