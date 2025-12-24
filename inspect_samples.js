const XLSX = require('xlsx');
const fs = require('fs');

const file1 = 'c:/antigravity workspace/Classzle/샘플1 가상 학급.xlsx';
const file2 = 'c:/antigravity workspace/Classzle/샘플2 가상 학급.xlsx';

function inspectFile(filePath) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    console.log(`\n=== File: ${filePath} ===`);
    console.log(`Sheet Name: ${sheetName}`);
    console.log(`Row count: ${data.length}`);
    console.log('Header:', data[0]);
    console.log('First 3 rows:', data.slice(1, 4));
}

inspectFile(file1);
inspectFile(file2);
