const GetGoogleFonts = require('get-google-fonts');
const availableFonts = require('./fonts.json');

let ggf = new GetGoogleFonts({
    userAgent: 'Wget/1.18',
    template: '{_family}.{ext}'
});

async function getFonts() {
    await ggf.download([
        availableFonts
    ]).then(() => {
        
    }).catch((err) => {
        console.error('Error al obtener las fuentes', err);
    });
}

getFonts();