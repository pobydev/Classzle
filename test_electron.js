console.log('Versions:', process.versions);
console.log('ExecPath:', process.execPath);
console.log('Type of electron match:', typeof require('electron'));
try {
    const electron = require('electron');
    if (typeof electron === 'object') {
        console.log('Success! Electron keys:', Object.keys(electron));
    } else {
        console.log('Fail: electron is', electron);
    }
} catch (e) {
    console.error(e);
}
