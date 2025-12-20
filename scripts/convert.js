const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function convert() {
    const inputPath = path.join(__dirname, '../sample-students-12class.xlsx');
    const outputPath = path.join(__dirname, '../sample-students-12class-preassigned.xlsx');

    console.log(`Reading from ${inputPath}`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(inputPath);
    const sheet = workbook.getWorksheet(1); // First sheet

    const students = [];

    // Header mapping (simple assumption based on standard format)
    // Row 1 is header
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        // Assume standard column order or check headers (but simple index based is risky if columns change)
        // Let's try to find columns by header names row
        const rowValues = row.values; // 1-based index usually
        // row.getCell(1)

        // Better: iterate columns of row 1 to map keys
        // But for now, let's assume standard indices if I fail to map.
        // Actually, let's just map manually:
        // A: Grade, B: Class, C: Number, D: Name, E: Gender, F: Score, G: Behavior
        // Or similar.
        // Let's read row 1 first.
    });

    // Let's re-read properly
    const headerRow = sheet.getRow(1);
    const headers = {};
    headerRow.eachCell((cell, colNumber) => {
        headers[cell.value] = colNumber;
    });

    console.log('Headers found:', headers);

    const getCol = (name) => {
        // Try various names
        if (headers[name]) return headers[name];
        if (name === '성명' && headers['이름']) return headers['이름'];
        if (name === '성적' && headers['기준성적']) return headers['기준성적'];
        if (name === '생활지도') {
            if (headers['생활지도']) return headers['생활지도'];
            if (headers['생활지도점수']) return headers['생활지도점수']; // Basic handling
        }
        return null;
    };

    const colMap = {
        grade: getCol('학년'),
        class: getCol('반'),
        number: getCol('번호'),
        name: getCol('성명') || getCol('이름'),
        gender: getCol('성별'),
        score: getCol('성적') || getCol('기준성적'),
        behavior: getCol('생활지도')
    };

    // Extra handling for separate behavior score/type if '생활지도' column doesn't exist?
    // User said "sample-students-12class.xlsx" is likely the one I made earlier or they made?
    // If I made it, it might have specific structure.
    // If user made it, I hope standard headers.

    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const getValue = (colIdx) => {
            if (!colIdx) return null;
            const val = row.getCell(colIdx).value;
            // Handle rich text or formulas if any? usually value is fine.
            if (val && typeof val === 'object' && val.result) return val.result;
            return val;
        };

        const s = {
            old_grade: getValue(colMap.grade),
            old_class: getValue(colMap.class),
            old_number: getValue(colMap.number),
            name: getValue(colMap.name),
            gender: getValue(colMap.gender), // '남', '여'
            score: getValue(colMap.score) || 0,
            behavior: getValue(colMap.behavior) || '해당없음' // string
        };
        students.push(s);
    });

    console.log(`Parsed ${students.length} students.`);

    // Sort for S-distribution: Gender specific?
    // Usually separate M/F, sort by score desc.
    const males = students.filter(s => s.gender === '남' || s.gender === 'M').sort((a, b) => b.score - a.score);
    const females = students.filter(s => s.gender === '여' || s.gender === 'F').sort((a, b) => b.score - a.score);

    console.log(`Males: ${males.length}, Females: ${females.length}`);

    const classCount = 12; // 12 classes
    const classes = Array.from({ length: classCount }, () => []);

    // S-distribution helper
    let currentClassIndex = 0;
    let direction = 1; // 1 or -1

    const distribute = (list) => {
        list.forEach(s => {
            classes[currentClassIndex].push(s);

            // Assign new info
            s.new_grade = 1; // Arbitrary new grade? The old grade is probably 1, so new is 2? Or just kept "1" and "2"? 
            // Usually if old is 3, new is 4. Let's assume input is previous grade.
            // Let's just say new grade is old_grade + 1.
            s.new_grade = (parseInt(s.old_grade) || 0) + 1;
            s.new_class = currentClassIndex + 1;
            // new_number will be assigned later based on sorting in class? Or just order of insertion?
            // Usually sorted by name in class.

            currentClassIndex += direction;
            if (currentClassIndex >= classCount) {
                currentClassIndex = classCount - 1;
                direction = -1;
            } else if (currentClassIndex < 0) {
                currentClassIndex = 0;
                direction = 1;
            }
        });
    };

    // Distribute Males
    // Reset for equality? No, continue S-curve usually or restart? 
    // Usually separate S-curves for M and F to balance each.
    currentClassIndex = 0; direction = 1;
    distribute(males);

    // Distribute Females (Reverse start to balance? Or same?)
    // To balance M+F totals, maybe reverse start? 
    // Simple S-curve for each is fine.
    currentClassIndex = classCount - 1; direction = -1; // Let's start from end for females to mix it up?
    distribute(females);

    // Assign numbers (sort by name within class)
    classes.forEach(cls => {
        cls.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        cls.forEach((s, idx) => {
            s.new_number = idx + 1;
        });
    });

    // Write output
    const outWorkbook = new ExcelJS.Workbook();
    const outSheet = outWorkbook.addWorksheet('기배정명단');

    outSheet.columns = [
        { header: '학년', key: 'new_grade', width: 10 },
        { header: '반', key: 'new_class', width: 10 },
        { header: '번호', key: 'new_number', width: 10 },
        { header: '성명', key: 'name', width: 15 },
        { header: '생년월일', key: 'birth', width: 15 },
        { header: '성별', key: 'gender', width: 10 },
        { header: '기준성적', key: 'score', width: 15 },
        { header: '생활지도', key: 'behavior', width: 20 },
        { header: '학년', key: 'old_grade', width: 10 }, // This will handle the duplicate header issue automatically?
        // ExcelJS by default doesn't support duplicate keys well if we use key-based row addition.
        // But we can just use array rows.
        { header: '반', key: 'old_class', width: 10 },
        { header: '번호', key: 'old_number', width: 10 },
    ];

    // We need to manually set headers to allow duplicates if we want exact string match '학년', '반', '번호' twice.
    // ExcelJS columns array sets headers.
    const headerValues = [
        '학년', '반', '번호',
        '성명', '생년월일', '성별', '기준성적', '생활지도',
        '학년', '반', '번호'
    ];
    outSheet.getRow(1).values = headerValues;

    // Styling
    const borderStyle = {
        top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
    };
    const headerFont = { name: 'Pretendard', size: 11, bold: true };
    const baseFont = { name: 'Pretendard', size: 11 };

    outSheet.getRow(1).eachCell((cell, colNum) => {
        cell.font = headerFont;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colNum >= 9 ? 'FFEEEEEE' : 'FFE0F2F1' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = borderStyle;
    });

    // Add data
    // We flatten the classes back to a list
    const allStudents = classes.flat();

    // Sort all by new class, then new number
    allStudents.sort((a, b) => {
        if (a.new_class !== b.new_class) return a.new_class - b.new_class;
        return a.new_number - b.new_number;
    });

    allStudents.forEach(s => {
        const rowValues = [
            s.new_grade, s.new_class, s.new_number,
            s.name, '', s.gender, s.score, s.behavior, // birth is empty
            s.old_grade, s.old_class, s.old_number
        ];
        const row = outSheet.addRow(rowValues);
        row.eachCell({ includeEmpty: false }, (cell) => {
            cell.border = borderStyle;
            cell.font = baseFont;
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });
    });

    await outWorkbook.xlsx.writeFile(outputPath);
    console.log(`Created ${outputPath}`);
}

convert().catch(err => console.error(err));
