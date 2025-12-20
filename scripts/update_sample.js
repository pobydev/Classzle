const XLSX = require('xlsx');

const filename = 'sample-students-12class-preassigned.xlsx';
const workbook = XLSX.readFile(filename);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet);

// 생년월일 데이터 채우기 (2010.01.01. ~ 2010.12.31. 사이 무작위)
const updatedData = jsonData.map((row, index) => {
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    return {
        ...row,
        '생년월일': `2010.${month}.${day}.`
    };
});

const newWorksheet = XLSX.utils.json_to_sheet(updatedData);
workbook.Sheets[sheetName] = newWorksheet;
XLSX.writeFile(workbook, filename);
console.log('Successfully updated 생년월일 in ' + filename);
