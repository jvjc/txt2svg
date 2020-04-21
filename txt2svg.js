#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2));
const localFonts = require('./package.json').localFonts;
const GetGoogleFonts = require('get-google-fonts');
const availableFonts = require('./fonts.json');
const TextToSVG = require('text-to-svg');
const makerjs = require('makerjs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

var fs = require('fs'),
    PDFDocument = require('pdfkit'),
    SVGtoPDF = require('svg-to-pdfkit');

const mergedFonts = localFonts.concat(Object.keys(availableFonts));

if(argv['available-fonts']) {
    console.log(JSON.stringify(mergedFonts));
    return;
}

if(argv['update-fonts']) {
    let ggf = new GetGoogleFonts({
        userAgent: 'Wget/1.18',
        template: '{_family}.{ext}'
    });
    ggf.download([
        availableFonts
    ]).then(() => {
        console.log('Fuentes obtenidas');
    }).catch((err) => {
        console.error('Error al obtener las fuentes', err);
    });
    return;
}

if(!getValue(argv.text, false)) {
    console.error('text not defined');
    return false;
}

const font = mergedFonts[getValue(argv.font, 0)];
if(!font) {
    console.error('not available font');
    return false;
}
TextToSVG.load(`${__dirname}/fonts/${font.replace(/ /g, '_')}.ttf`, function(err, textToSVG) {
    if(err) {
        console.error(err);
        return false;
    }
    const attributes = {};

    if(getValue(argv.fill)) {
        attributes.fill = getValue(argv.fill, 'none');
    }
    if(getValue(argv.stroke)) {
        attributes.stroke = getValue(argv.stroke, 'none');
    }

    if(argv['get-metrics']) {
        const options = {
            x: 0,
            y: 0,
            fontSize: getValue(argv.size, 100),
            anchor: 'top',
            attributes: attributes
        };
        console.log(textToSVG.getMetrics(argv.text, options));
        return;
    }

    var textModel = new makerjs.models.Text(textToSVG.font, argv.text, getValue(argv.size, 100), true, false, undefined);
    const svg = makerjs.exporter.toSVG(textModel);

    const dom = new JSDOM(svg);
    const domSVG = dom.window.document.body.children[0];
    if(getValue(argv.width, false) || getValue(argv.height, false)) {
        let width = domSVG.getAttribute('width');
        let height = domSVG.getAttribute('height');

        if(getValue(argv.width, false) && getValue(argv.height, false)) {
            domSVG.setAttribute('width', argv.width * 2.83464565);
            domSVG.setAttribute('height', argv.height * 2.83464565);
            domSVG.setAttribute('preserveAspectRatio', 'none');
        } else if(getValue(argv.width, false)) {
            domSVG.setAttribute('width', argv.width * 2.83464565);
            domSVG.setAttribute('height', (height * argv.width / width) * 2.83464565);
        } else {
            domSVG.setAttribute('width', (width * argv.height / height) * 2.83464565);
            domSVG.setAttribute('height', argv.height * 2.83464565);
        }
    }
    console.log(domSVG.outerHTML.replace(/vector-effect="non-scaling-stroke"/g, ''));
});

function getValue(arg, defaultValue = false) {
    if(!arg || arg == 'false' || arg === true || arg < 0 || arg.toString().trim().length == 0) return defaultValue;
    return arg;
}
