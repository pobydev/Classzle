const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function generateTestData() {
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

    // 한국어 이름 생성용 데이터
    const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전'];
    const firstNames = ['민준', '서준', '도윤', '예준', '시우', '하준', '지호', '주원', '지우', '이안', '서연', '서윤', '지우', '서현', '하은', '지유', '윤서', '민서', '지민', '채원'];

    // 랜덤 이름 생성 함수
    const generateName = () => {
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        return `${lastName}${firstName}`;
    };

    // 생활지도 유형 생성 (확률 분포: 일반 80%, 리더 5%, 행동 10%, 정서 5%)
    // 점수 체계: 리더(+, 양수), 행동/정서(-, 음수)
    const generateBehavior = () => {
        const rand = Math.random();
        if (rand < 0.8) return '해당없음'; // 80%
        if (rand < 0.85) { // 5% 리더 (양수)
            return Math.random() < 0.7 ? '리더(+1)' : '리더(+2)';
        }
        if (rand < 0.95) { // 10% 행동 (음수)
            const r = Math.random();
            if (r < 0.5) return '행동(-1)';
            if (r < 0.8) return '행동(-2)';
            return '행동(-3)';
        }
        // 5% 정서 (음수)
        const r = Math.random();
        if (r < 0.5) return '정서(-1)';
        if (r < 0.8) return '정서(-2)';
        return '정서(-3)';
    };

    const allStudents = [];

    // 10개 반 생성 (각 반 27 ~ 28명)
    for (let classNum = 1; classNum <= 10; classNum++) {
        // 반별 학생 수 결정 (27 또는 28)
        const studentCount = Math.floor(Math.random() * 2) + 27;

        const classStudents = [];
        for (let i = 0; i < studentCount; i++) {
            classStudents.push({
                name: generateName(),
                gender: Math.random() < 0.5 ? '남' : '여',
                score: Math.floor(Math.random() * 501) + 500, // 500 ~ 1000점 (가상의 성적)
                behavior: generateBehavior()
            });
        }

        // 이름순 정렬
        classStudents.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

        // 번호 부여 및 전체 명단에 추가
        classStudents.forEach((student, index) => {
            allStudents.push({
                grade: 2, // 2학년 고정
                class: classNum,
                number: index + 1,
                name: student.name,
                gender: student.gender,
                score: student.score,
                behavior: student.behavior
            });
        });
    }

    // 엑셀 시트에 데이터 추가
    allStudents.forEach(row => {
        sheet.addRow(row);
    });

    // 드롭다운 옵션 (생활지도 - G열)
    // 데이터가 있는 행부터 500행까지 적용
    for (let i = 2; i <= 500; i++) {
        sheet.getCell(`G${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: ['"해당없음,리더(+2),리더(+1),행동(-1),행동(-2),행동(-3),정서(-1),정서(-2),정서(-3)"']
        };
    }

    // 파일 저장
    await workbook.xlsx.writeFile('root_test_data_large.xlsx');
    console.log('root_test_data_large.xlsx generated successfully');
}

generateTestData();
