const XLSX = require('xlsx');

// 한글 이름 데이터 (동명이인 방지를 위해 충분한 양)
const lastNames = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '전', '홍', '고', '문', '양', '손', '배', '백', '허', '유', '남', '심', '노', '하', '곽', '성', '차', '주', '우', '구', '민', '진', '나', '기', '표', '라', '마', '사', '여', '태', '추'];
const maleNames = ['민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '지훈', '준서', '준우', '현우', '도현', '지우', '건우', '우진', '승현', '준혁', '재윤', '윤호', '시현', '정우', '승우', '유준', '현준', '태현', '지환', '민재', '동현', '민성', '규민', '수현', '연우', '서진', '수호', '현성', '승민', '성민', '재현', '태윤', '예성', '세준', '은호', '민호', '성준', '재원', '현석', '동우', '경민', '민혁', '원준', '지성', '준영', '은우', '민규', '성현', '승호', '기현', '준호', '병준', '현빈', '승준', '찬우', '용준', '세현', '호준', '진우', '한결', '윤성', '태민', '지원', '준수', '재훈', '선우', '지안', '우혁', '형준', '영민', '준기', '희준', '태원', '성훈', '정현', '진혁', '은성', '윤재', '시원', '동훈', '우빈', '민수', '태양', '세훈', '지민', '채민', '경호', '상현', '동민', '현수'];
const femaleNames = ['서연', '서윤', '지우', '서현', '민서', '하은', '하윤', '윤서', '지유', '채원', '수아', '다은', '예은', '지민', '수빈', '소율', '예린', '지아', '시은', '하린', '아린', '다인', '지원', '소은', '채은', '서영', '나은', '예지', '하영', '승아', '지연', '정은', '수민', '유진', '은서', '채린', '서아', '지현', '미래', '예원', '민지', '은채', '유나', '윤아', '하나', '다연', '소연', '민주', '혜원', '수연', '소영', '지수', '예나', '채윤', '시아', '주아', '유빈', '소희', '나윤', '채아', '세아', '다현', '수현', '슬기', '수정', '서희', '은비', '은지', '예서', '가은', '시현', '다영', '주연', '보람', '세은', '현주', '미소', '민정', '지영', '윤지', '수진', '혜린', '소정', '나연', '아영', '미연', '세영', '보영', '혜정', '채영', '나영', '효진', '세희', '다솜', '해인', '은영', '정민', '서율', '민아'];

// 사용된 이름을 추적하여 중복 방지
const usedNames = new Set();
const duplicateNamesAllowed = []; // 동명이인 허용 목록

// 유니크한 이름 생성
function generateUniqueName(gender, allowDuplicate = false) {
    const firstNamePool = gender === 'M' ? maleNames : femaleNames;
    let attempts = 0;
    while (attempts < 1000) {
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const firstName = firstNamePool[Math.floor(Math.random() * firstNamePool.length)];
        const fullName = lastName + firstName;

        if (!usedNames.has(fullName) || (allowDuplicate && duplicateNamesAllowed.includes(fullName))) {
            if (!allowDuplicate) {
                usedNames.add(fullName);
            }
            return fullName;
        }
        attempts++;
    }
    // 실패 시 번호 붙이기
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const firstName = firstNamePool[Math.floor(Math.random() * firstNamePool.length)];
    return lastName + firstName + (Math.floor(Math.random() * 100));
}

// 학생 데이터 생성
const students = [];
const classCount = 12;
const studentsPerClass = [28, 27, 28, 27, 28, 27, 28, 27, 28, 27, 28, 27]; // 12반, 약 27.5명 평균

// 행동 유형 배정 계획
// -3점: 행동형 2명, 정서형 1명 (전교에 3명, 각각 다른 반)
// -2점: 반별 2~3명 (행동+정서)
// -1점: 반별 3~4명 (행동+정서)
// +1점 리더형: 반별 2~3명
// +2점 리더형: 전교에 7명 (각각 다른 반)

// -3점 배정 (3명, 서로 다른 반)
const minus3Classes = [0, 4, 9]; // 1반, 5반, 10반
const minus3Types = ['행동(-3)', '행동(-3)', '정서(-3)'];

// +2점 리더 배정 (7명, 서로 다른 반)
const plus2Classes = [0, 2, 4, 6, 8, 10, 11]; // 1, 3, 5, 7, 9, 11, 12반

// 성적 분포 생성 (각 반 평균이 비슷하도록)
function generateScoresForClass(count) {
    const scores = [];
    const targetAvg = 650; // 목표 평균
    const variance = 200; // 분산

    for (let i = 0; i < count; i++) {
        // 정규분포 근사
        const u1 = Math.random();
        const u2 = Math.random();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        let score = targetAvg + z * variance;
        score = Math.max(300, Math.min(990, score));
        score = Math.round(score * 10) / 10; // 소수점 1자리
        scores.push(score);
    }

    // 평균 조정
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const adjustment = targetAvg - avg;
    for (let i = 0; i < scores.length; i++) {
        scores[i] = Math.max(300, Math.min(990, Math.round((scores[i] + adjustment) * 10) / 10));
    }

    return scores;
}

// 동명이인 2쌍 선택
const duplicateName1Gender = 'M';
const duplicateName1 = generateUniqueName(duplicateName1Gender);
duplicateNamesAllowed.push(duplicateName1);
usedNames.delete(duplicateName1); // 다시 사용 가능하게

const duplicateName2Gender = 'F';
const duplicateName2 = generateUniqueName(duplicateName2Gender);
duplicateNamesAllowed.push(duplicateName2);
usedNames.delete(duplicateName2);

// 동명이인 배정할 반 (서로 다른 반)
const duplicate1Classes = [1, 7]; // 2반, 8반
const duplicate2Classes = [3, 10]; // 4반, 11반

for (let classIdx = 0; classIdx < classCount; classIdx++) {
    const classNum = classIdx + 1;
    const studentCount = studentsPerClass[classIdx];

    // 남녀 비율 (14:13 또는 15:12 등)
    const maleCount = classIdx % 2 === 0 ? 14 : 15;
    const femaleCount = studentCount - maleCount;

    // 성적 생성
    const scores = generateScoresForClass(studentCount);

    // 학생 생성
    const classStudents = [];

    // 행동 유형 배정 계획
    let behaviorAssignments = [];

    // -3점 체크
    if (minus3Classes.includes(classIdx)) {
        const idx = minus3Classes.indexOf(classIdx);
        behaviorAssignments.push(minus3Types[idx]);
    }

    // +2점 리더 체크
    if (plus2Classes.includes(classIdx)) {
        behaviorAssignments.push('리더(+2)');
    }

    // -2점: 2~3명
    const minus2Count = 2 + (classIdx % 2);
    for (let i = 0; i < minus2Count; i++) {
        behaviorAssignments.push(i % 2 === 0 ? '행동(-2)' : '정서(-2)');
    }

    // -1점: 3~4명
    const minus1Count = 3 + (classIdx % 2);
    for (let i = 0; i < minus1Count; i++) {
        behaviorAssignments.push(i % 2 === 0 ? '행동(-1)' : '정서(-1)');
    }

    // +1점 리더: 2~3명
    const plus1Count = 2 + ((classIdx + 1) % 2);
    for (let i = 0; i < plus1Count; i++) {
        behaviorAssignments.push('리더(+1)');
    }

    // 나머지는 해당없음
    while (behaviorAssignments.length < studentCount) {
        behaviorAssignments.push('해당없음');
    }

    // 셔플
    for (let i = behaviorAssignments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [behaviorAssignments[i], behaviorAssignments[j]] = [behaviorAssignments[j], behaviorAssignments[i]];
    }

    // 학생 생성
    let malesGenerated = 0;
    let femalesGenerated = 0;

    for (let i = 0; i < studentCount; i++) {
        let gender;
        if (malesGenerated >= maleCount) {
            gender = 'F';
        } else if (femalesGenerated >= femaleCount) {
            gender = 'M';
        } else {
            gender = Math.random() < 0.5 ? 'M' : 'F';
        }

        if (gender === 'M') malesGenerated++;
        else femalesGenerated++;

        // 이름 생성 (동명이인 체크)
        let name;
        if (duplicate1Classes.includes(classIdx) && duplicate1Classes.indexOf(classIdx) === duplicate1Classes.indexOf(classIdx) && i === 0 && gender === duplicateName1Gender) {
            name = duplicateName1;
        } else if (duplicate2Classes.includes(classIdx) && duplicate2Classes.indexOf(classIdx) === duplicate2Classes.indexOf(classIdx) && i === 1 && gender === duplicateName2Gender) {
            name = duplicateName2;
        } else {
            name = generateUniqueName(gender);
        }

        classStudents.push({
            grade: 2,
            class: classNum,
            number: 0, // 나중에 할당
            name: name,
            gender: gender === 'M' ? '남' : '여',
            score: scores[i],
            behavior: behaviorAssignments[i]
        });
    }

    // 가나다 순 정렬 후 번호 부여
    classStudents.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    classStudents.forEach((s, idx) => {
        s.number = idx + 1;
    });

    students.push(...classStudents);
}

// 동명이인 강제 추가 (기존에 없을 경우)
// 2반에 동명이인1 추가
const dup1Exists1 = students.some(s => s.class === 2 && s.name === duplicateName1);
const dup1Exists2 = students.some(s => s.class === 8 && s.name === duplicateName1);
if (!dup1Exists1) {
    const target = students.find(s => s.class === 2 && s.gender === (duplicateName1Gender === 'M' ? '남' : '여'));
    if (target) target.name = duplicateName1;
}
if (!dup1Exists2) {
    const target = students.find(s => s.class === 8 && s.gender === (duplicateName1Gender === 'M' ? '남' : '여') && s.name !== duplicateName1);
    if (target) target.name = duplicateName1;
}

const dup2Exists1 = students.some(s => s.class === 4 && s.name === duplicateName2);
const dup2Exists2 = students.some(s => s.class === 11 && s.name === duplicateName2);
if (!dup2Exists1) {
    const target = students.find(s => s.class === 4 && s.gender === (duplicateName2Gender === 'M' ? '남' : '여'));
    if (target) target.name = duplicateName2;
}
if (!dup2Exists2) {
    const target = students.find(s => s.class === 11 && s.gender === (duplicateName2Gender === 'M' ? '남' : '여') && s.name !== duplicateName2);
    if (target) target.name = duplicateName2;
}

// 반 내 재정렬 (이름 변경 후)
const sortedStudents = [];
for (let c = 1; c <= 12; c++) {
    const classStudents = students.filter(s => s.class === c).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    classStudents.forEach((s, idx) => {
        s.number = idx + 1;
    });
    sortedStudents.push(...classStudents);
}

// 엑셀 데이터 생성
const wsData = [['학년', '반', '번호', '이름', '성별', '성적', '생활지도']];
sortedStudents.forEach(s => {
    wsData.push([s.grade, s.class, s.number, s.name, s.gender, s.score, s.behavior]);
});

// 엑셀 파일 생성
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(wsData);

// 열 너비 설정
ws['!cols'] = [
    { wch: 6 },  // 학년
    { wch: 6 },  // 반
    { wch: 6 },  // 번호
    { wch: 12 }, // 이름
    { wch: 6 },  // 성별
    { wch: 8 },  // 성적
    { wch: 12 }, // 생활지도
];

XLSX.utils.book_append_sheet(wb, ws, '학생명단');
XLSX.writeFile(wb, 'sample-students-12class.xlsx');

console.log('생성 완료! sample-students-12class.xlsx');
console.log('총 학생 수:', sortedStudents.length);

// 통계 출력
const stats = {};
for (let c = 1; c <= 12; c++) {
    const classStudents = sortedStudents.filter(s => s.class === c);
    const males = classStudents.filter(s => s.gender === '남').length;
    const females = classStudents.filter(s => s.gender === '여').length;
    const avgScore = classStudents.reduce((sum, s) => sum + s.score, 0) / classStudents.length;
    console.log(`${c}반: ${classStudents.length}명 (남${males}/여${females}), 평균 ${avgScore.toFixed(1)}`);
}
