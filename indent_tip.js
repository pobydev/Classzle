const fs = require('fs');

const guidePath = 'C:/antigravity workspace/Classzle/classzle-docs/src/app/guide/page.tsx';
let content = fs.readFileSync(guidePath, 'utf8');

// 1. 메인 섹션 - 들여쓰기 적용 (pl-6 = padding-left)
const oldMain = `💡 팁: 더 이상 변경이 없을 때까지 여러 번 클릭하세요!`;

const newMain = `<span className="flex"><span>💡&nbsp;</span><span>팁: 더 이상 변경이 없을 때까지 [현재 배정 수정] 버튼을 여러 번 클릭하세요!</span></span>`;

if (content.includes(oldMain)) {
    content = content.replace(oldMain, newMain);
    console.log('1. Fixed main section with proper indentation');
}

// 2. FAQ 섹션도 동일하게
if (content.includes(oldMain)) {
    content = content.replace(oldMain, newMain);
    console.log('2. Fixed FAQ section with proper indentation');
}

fs.writeFileSync(guidePath, content, 'utf8');
console.log('\nDone!');
