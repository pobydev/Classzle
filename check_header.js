const XLSX = require('xlsx');
const workbook = XLSX.readFile('sample-students-280.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
console.log('Headers:', jsonData[0]);
console.log('First Row:', jsonData[1]);
