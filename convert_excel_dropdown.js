const ExcelJS = require('exceljs');

async function convertExcel() {
    const filename = 'sample-students-280.xlsx';
    const workbook = new ExcelJS.Workbook();

    try {
        console.log(`Loading ${filename}...`);
        await workbook.xlsx.readFile(filename);

        const sheet = workbook.getWorksheet(1); // 첫 번째 시트
        if (!sheet) {
            console.error('Sheet not found');
            return;
        }

        console.log('Applying data validation...');

        // 데이터가 있는 마지막 행 찾기 (또는 300행 정도로 넉넉하게 설정)
        // sample-students-280.xlsx 이름으로 보아 약 280명 예상. 
        // 넉넉하게 500행까지 적용
        const maxRows = 500;

        for (let i = 2; i <= maxRows; i++) {
            // G열 (생활지도)
            const cell = sheet.getCell(`G${i}`);
            cell.dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: ['"해당없음,리더(-2),리더(-1),행동(+1),행동(+2),행동(+3),정서(+1),정서(+2),정서(+3)"']
            };
        }

        console.log(`Saving to ${filename}...`);
        await workbook.xlsx.writeFile(filename);
        console.log('Conversion complete!');

    } catch (error) {
        console.error('Error converting file:', error);
    }
}

convertExcel();
