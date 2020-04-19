#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2));
const availableFonts = require('./fonts.json');
const TextToSVG = require('text-to-svg');

if(!getValue(argv.text, false)) {
    console.error('text not defined');
    return false;
}

const font = Object.keys(availableFonts)[getValue(argv.font, 0)];
if(!font) {
    console.error('not available font');
    return false;
}

TextToSVG.load(`./fonts/${font.replace(/ /g, '_')}.ttf`, function(err, textToSVG) {
    if(err) {
        console.error(err);
        return false;
    }
    const attributes = {
      fill: getValue(argv.fill, 'none'),
      stroke: getValue(argv.stroke, 'black')
    };
    const options = {
      x: 0,
      y: 0,
      fontSize: getValue(argv.size, 100),
      anchor: 'top',
      attributes: attributes
    };
    const svg = textToSVG.getSVG(argv.text, options);
    console.log(svg.replace(/vector-effect="non-scaling-stroke"/g, ''));
});

function getValue(arg, defaultValue) {
    if(!arg || arg === true || arg < 0 || arg.toString().trim().length == 0) return defaultValue;
    return arg;
}