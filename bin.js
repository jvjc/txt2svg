#!/usr/bin/env node
const argv = require('minimist')(process.argv.slice(2));
const txt2svg = require('./txt2svg');
const parseBoolean = (value) => value == 'true' || value == 1 || value === true;
const parseNumber = (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
if(argv['clear-fonts']) {
    txt2svg.clearFonts(argv['font-name'], argv['font-version']);
} else if(argv['available-fonts']) {
    console.log(JSON.stringify(txt2svg.availableFonts()));
} else {
    if(argv['font-name'] && argv['font-version']) {
        txt2svg.getFont(argv['font-url'], argv['font-name'], argv['font-version'], argv['font-caching'] == 'true' || argv['font-caching'] == 1).then(fontHash => {
            const preprocessOptions = {
                quality: argv['quality'],
                snapGrid: parseNumber(argv['snap-grid']),
                minArea: parseNumber(argv['min-area']),
                maxComponentSize: parseNumber(argv['max-component-size']),
                svgPrecision: parseNumber(argv['svg-precision']),
                compactSVG: argv['compact-svg'] === undefined ? undefined : parseBoolean(argv['compact-svg'])
            };

            let rs = txt2svg.getSVG(
                argv.text,
                fontHash,
                argv.width,
                argv.height,
                argv['font-height'] || 50,
                argv['line-spacing'] || 2,
                argv['merge-path'],
                parseBoolean(argv['allow-line-break']),
                parseBoolean(argv['auto-adjust']),
                parseBoolean(argv['cut-area-preview']),
                parseBoolean(argv['hide-surrounding-box']),
                argv['order-id'],
                parseBoolean(argv['cut-box']),
                preprocessOptions
            );
            if(argv.output === 'object') {
                console.log(JSON.stringify({
                    svg: rs,
                    font: {
                        name: argv['font-name'],
                        version: argv['font-version'],
                        url: argv['font-url']
                    }
                }));
            } else {
                console.log(rs);
            }
        }).catch(error => {
            console.error(error);
        });
    } else {
        console.error('font-name or font-versión not defined');
    }
}
