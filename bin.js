#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2));
const txt2svg = require('./txt2svg');

if(argv['available-fonts']) {
    console.log(JSON.stringify(txt2svg.availableFonts()));
} else if(argv['update-fonts']) {
    txt2svg.updateFonts();
} else {
    let rs = txt2svg.getSVG(argv.text, argv.font, argv.width, argv.height);
    console.log(rs);
}
