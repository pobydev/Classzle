const fs = require('fs');

const guidePath = 'C:/antigravity workspace/Classzle/classzle-docs/src/app/guide/page.tsx';
let content = fs.readFileSync(guidePath, 'utf8');

// 1. 엑셀 입력 - shrink-0 추가하여 줄바꿈 방지
const oldExcel = `<li className="flex gap-1"><span><strong>엑셀 입력:</strong></span><span>양식에서 셀을 클릭해 드롭다운으로 항목(예: 리더형, 요주의 등)을 선택하여 일괄 입력할 수 있습니다.</span></li>`;

const newExcel = `<li className="flex gap-1"><span className="shrink-0"><strong>엑셀 입력:</strong></span><span>양식에서 셀을 클릭해 드롭다운으로 항목(예: 리더형, 요주의 등)을 선택하여 일괄 입력할 수 있습니다.</span></li>`;

if (content.includes(oldExcel)) {
    content = content.replace(oldExcel, newExcel);
    console.log('1. Fixed 엑셀 입력 with shrink-0');
} else {
    console.log('1. 엑셀 입력 not found');
}

// 2. 직접 수정 - shrink-0 추가하여 줄바꿈 방지
const oldDirect = `<li className="flex gap-1"><span><strong>직접 수정:</strong></span><span>[1. 기초 자료 설정] 탭의 학생 명단에서 <strong>[수정]</strong> 버튼을 눌러 개별적으로 점수나 유형을 추가/변경할 수 있습니다.</span></li>`;

const newDirect = `<li className="flex gap-1"><span className="shrink-0"><strong>직접 수정:</strong></span><span>[1. 기초 자료 설정] 탭의 학생 명단에서 <strong>[수정]</strong> 버튼을 눌러 개별적으로 점수나 유형을 추가/변경할 수 있습니다.</span></li>`;

if (content.includes(oldDirect)) {
    content = content.replace(oldDirect, newDirect);
    console.log('2. Fixed 직접 수정 with shrink-0');
} else {
    console.log('2. 직접 수정 not found');
}

fs.writeFileSync(guidePath, content, 'utf8');
console.log('\nDone!');
