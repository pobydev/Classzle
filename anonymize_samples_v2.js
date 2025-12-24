const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const file1 = 'c:/antigravity workspace/Classzle/샘플1 가상 학급.xlsx';
const file2 = 'c:/antigravity workspace/Classzle/샘플2 가상 학급.xlsx';

const outputDir = 'c:/antigravity workspace/Classzle/classzle-docs/public/samples';

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// 400+개의 3글자 이름 데이터베이스
// 출처: 애니메이션, 드라마, 예능, 아이돌, 스포츠스타, 위인 등
const nameDatabase = [
    // 1. 슬램덩크 (북산, 능남, 해남, 상양, 풍전, 산왕)
    '강백호', '서태웅', '채치수', '정대만', '송태섭', '권준호', '안한수', '이한나', '채소연', '양호열', '김대남', '이용팔',
    '윤대협', '변덕규', '황태산', '안영수', '백정태', '유명호',
    '이정환', '전호장', '신준섭', '홍익현', '고민구', '김동식', '남진모',
    '김수겸', '성현준', '장권혁', '오창석',
    '남훈', '강동준',
    '이명헌', '신현철', '정우성', '최동오', '김낙수', '정성구', '도진우',

    // 2. 응답하라 1988 / 슬기로운 의사생활 / 드라마
    '성덕선', '최택', '성선우', '김정환', '류동룡', '성보라', '성노을', '김정봉',
    '이익준', '안정원', '김준완', '양석형', '채송화', '장겨울', '추민하', '도재학', '천명태',
    '성기훈', '조상우', '강새벽', '오일남', '장덕수', '황준호', // 오징어게임
    '문동은', '박연진', '전재준', '이사라', '최혜정', '손명오', '주여정', '하도영', // 더글로리
    '유시진', '강모연', '서대영', '윤명주', // 태양의후예
    '천송이', '도민준', '이휘경', '유세미', // 별그대
    '김신', '지은탁', '저승이', '써니', '유덕화', // 도깨비 (3글자화 필요) -> 김신은 2글자라 제외하거나 '김신혁' 등으로 대체? -> '김도깨', '왕여'
    '구씨', '염미정', '염창희', '염기정', // 해방일지
    '이상우', '우영우', '최수연', '권민우', '정명석', '동그라', // 우영우 ('동그라미'는 4글자.. '동그라'로)

    // 3. 예능 레전드 (무한도전, 런닝맨, 1박2일, 신서유기)
    '유재석', '박명수', '정준하', '하동훈', '노홍철', '정형돈', '길성준', '황광희', '조세호', '양세형',
    '김종국', '송지효', '이광수', '지석진', '전소민', '양세찬',
    '강호동', '이수근', '은지원', '안재현', '조규현', '송민호', '표지훈',
    '김희철', '민경훈', '서장훈', '이상민', '김영철',
    '이효리', '이상순', '아이유', '윤아', // 효리네민박

    // 4. K-POP 아이돌 본명 (3글자 위주)
    // BTS
    '김남준', '김석진', '민윤기', '정호석', '박지민', '김태형', '전정국',
    // 뉴진스
    '김민지', '강해린', '이혜인', '다니엘', '팜하니', // 다니엘, 팜하니는 이질적일 수 있으나 포함
    // 아이브
    '안유진', '김가을', '장원영', '김지원', '이현서',
    // 에스파
    '유지민', '김민정',
    // 르세라핌
    '김채원', '허윤진', '홍은채',
    // 세븐틴 (일부)
    '최승철', '윤정한', '홍지수', '문준휘', '권순영', '전원우', '이지훈', '서명호', '김민규', '이석민', '부승관', '최한솔', '이찬',
    // 엑소 (일부)
    '김민석', '김준면', '변백현', '김종대', '박찬열', '도경수', '김종인', '오세훈',
    // NCT (일부)
    '이태용', '문태일', '서영호', '김도영', '정재현', '김정우', '이마크', '이동혁', '이제노', '나재민', '박지성',

    // 5. 스포츠 스타
    '손흥민', '김민재', '이강인', '황희찬', '황인범', '조규성', '김승규', '이재성', '김영권', '김진수',
    '박지성', '이영표', '안정환', '설기현', '김남일', '송종국', '차두리', '이운재', '최진철', '김태영',
    '류현진', '추신수', '김하성', '이정후', '박찬호', '이승엽', '박병호', '김광현', '양현종',
    '김연아', '손연재', '이상화', '박태환', '장미란', '윤성빈', '김연경', '안산', '김제덕', '신유빈', '황선우',

    // 6. 위인 / 역사 인물
    '이순신', '세종대', '정약용', '장영실', '김정호', '한석봉', '김홍도', '신윤복', '정몽주', '정도전',
    '을지문', '강감찬', '김유신', '계백', '안중근', '윤봉길', '유관순', '김구', '안창호', '방정환',
    '이황', '이이', '신사임', '황희', '맹사성', '서희', '최무선', '박지원',

    // 7. 애니메이션 (한국 이름 로컬라이징)
    // 짱구
    '신짱구', '김철수', '한유리', '이훈이', '맹구', '신형만', '봉미선', '신짱아', '나미리', '채성아', '권지옹',
    // 코난
    '남도일', '유미란', '유명한', '홍장미', '고뭉치', '박세모', '한아름', '하인성', '서가영', '이상윤', '안기준',
    // 카드캡터체리
    '유체리', '신지수', '이샤오', '오청명', '유도진', '권문아', '문현아',
    // 디지몬
    '신태일', '한소라', '매일석', '장한솔', '이미나', '정석', '신나리', '최산해', '홍예지', '이재하',
    // 둘리
    '고길동', '희동이', '도우너', '또치', '마이콜',
    // 신비아파트
    '구하리', '구두리', '최강림', '이가은', '김현우', '리온',

    // 8. 고전 소설
    '홍길동', '임꺽정', '전우치', '성춘향', '이몽룡', '변학도', '심청이', '심봉사', '뺑덕이',
    '박흥부', '박놀부', '장장화', '장홍련', '콩쥐', '팥쥐',

    // 9. 추가 유명 배우
    '최민식', '송강호', '설경구', '김윤석', '하정우', '황정민', '이병헌', '정우성', '이정재',
    '전지현', '송혜교', '김태희', '손예진', '한효주', '공효진', '김고은', '박보영',
    '현빈', '공유', '소지섭', '강동원', '조인성', '김수현', '송중기', '유아인', '박서준'
];

// 데이터 섞기 (Fisher-Yates Shuffle)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// 셔플된 이름 목록 생성
let shuffledNames = shuffleArray([...nameDatabase]);
let nameIndex = 0;

function getName() {
    if (nameIndex >= shuffledNames.length) {
        // 혹시 모자라면 다시 섞어서 사용 (그럴 일 없게 많이 넣었지만)
        console.warn('Name database exhausted! Reshuffling...');
        shuffledNames = shuffleArray([...nameDatabase]);
        nameIndex = 0;
    }
    return shuffledNames[nameIndex++];
}

function processFile(inputFile, outputName) {
    console.log(`Processing ${inputFile}...`);

    // 파일마다 독립적으로 섞어서 다른 순서로 나오게 함 (선택사항, 여기선 전역 리스트를 계속 소모하여 중복 최소화)
    // 사용자가 '두 파일'을 모두 다운받을 수 있으므로, 두 파일 간에도 이름이 겹치지 않는 게 더 리얼함.
    // 따라서 nameIndex를 초기화하지 않고 계속 씀.

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
        // 데이터 행이고 이름 컬럼이 비어있지 않으면
        if (data[i] && (data[i][nameIdx] !== undefined)) {
            // 엑셀 읽을 때 빈 행이 있을 수 있으니 체크
            // 또한 이름이 실제 텍스트인 경우만 교체
            data[i][nameIdx] = getName();
        }
    }

    // 새 파일 저장
    const newWorkSheet = XLSX.utils.aoa_to_sheet(data);
    const newWorkbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWorkbook, newWorkSheet, sheetName);

    const outputPath = path.join(outputDir, outputName); // 경로 수정됨
    XLSX.writeFile(newWorkbook, outputPath);
    console.log(`Saved to ${outputPath} (Used ${nameIndex} names so far)`);
}

// 메인 실행
console.log(`Total names in database: ${nameDatabase.length}`);
processFile(file1, 'sample_data_basic.xlsx');
processFile(file2, 'sample_data_preassigned.xlsx');
console.log('Done!');
