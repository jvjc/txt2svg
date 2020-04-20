#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2));
const localFonts = require('./package.json').localFonts;
const availableFonts = require('./fonts.json');
const TextToSVG = require('text-to-svg');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const mergedFonts = localFonts.concat(Object.keys(availableFonts));

if(argv['available-fonts']) {
    console.log(mergedFonts);
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

    const options = {
        x: 0,
        y: 0,
        fontSize: 100,
        anchor: 'top',
        attributes: attributes
    };
    const svg = textToSVG.getSVG(argv.text, options);
    const dom = new JSDOM(svg);
    const domSVG = dom.window.document.body.children[0];
    let width = domSVG.getAttribute('width');
    let height = domSVG.getAttribute('height');
    domSVG.setAttribute('viewbox', `0 0 ${width} ${height}`);
    domSVG.setAttribute('width', getValue(argv.size, 100));
    domSVG.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    domSVG.removeAttribute('height');
    domSVG.removeAttribute('vector-effect');
    console.log(domSVG.outerHTML);
});

function getValue(arg, defaultValue = false) {
    if(!arg || arg == 'false' || arg === true || arg < 0 || arg.toString().trim().length == 0) return defaultValue;
    return arg;
}