const opentype = require('opentype.js');
const makerjs = require('makerjs');
const https = require('https');
const fs = require('fs');

const pointValue = 2.8346456693;

const getValue = (arg, defaultValue = false) => {
    if(!arg || arg == 'false' || arg === true || arg < 0 || arg.toString().trim().length == 0) return defaultValue;
    return arg;
}

module.exports.getSVG = (t, f, w, h, mP) => {
    if(!getValue(t, false)) {
        throw Error('text not defined');
    }
    
    const emojis = opentype.loadSync(`${__dirname}/emojis/font.ttf`);
    const font = opentype.loadSync(`${__dirname}/fonts/${f}.ttf`);
    
    let cleaned = [];
    t.toString().trim().split('\n').forEach(line => {
        let arrLine = [];
        let text = '';
        for (const symbol of line) {
            if(symbol.length == 2) {
                let emoji = symbol;
                if(text) {
                    arrLine.push(text);
                }
                if(emojis.charToGlyphIndex(symbol) > 0) {
                    arrLine.push({ type: 'emoji', symbol });
                }
                text = '';
            } else {
                if(font.charToGlyphIndex(symbol) > 0) {
                    text += symbol.replace(/[^a-zA-ZÀ-ú0-9 !?¿¡:)(;<=>]\\/gu, '');
                }
            }
        }
        if(text) {
            arrLine.push(text);
        }
        if(arrLine.length > 0) {
            cleaned.push(arrLine);
        }
    });

    var project = {
        models: {}
    };
    
    let originY = 0;

    if(cleaned.length == 0) {
        return makerjs.exporter.toSVG(project).replace(/vector-effect="non-scaling-stroke"/g, '');
    }
    
    cleaned.reverse().forEach((line, i) => {
        let originX = 0;
        let currentModel = {
            models: {}
        };
        line.forEach((item, j) => {
            if(item.type == 'emoji') {
                currentModel.models[`model_${j}`] = new makerjs.models.Text(emojis, item.symbol, 80, getValue(mP, false));
            } else {
                currentModel.models[`model_${j}`] = new makerjs.models.Text(font, item, 80, getValue(mP, false));
            }
            currentModel.models[`model_${j}`].origin = [originX, 0];
            let width = makerjs.measure.modelExtents(currentModel.models[`model_${j}`]).width;
            originX += width + 6;
        });
        
        project.models[`model_${i}`] = currentModel;
        project.models[`model_${i}`].origin = [0, originY];
    
        let bounds = makerjs.measure.modelExtents(currentModel);
        originY += bounds.height + 5;
    });
    
    const size = makerjs.measure.modelExtents(project);
    if(getValue(w, false) || getValue(h, false)) {
        let scale = 1;
        if(getValue(w, false) && getValue(h, false)) {
            // Both boundaries
            if(size.width > size.height) {
                scale = w * pointValue / size.width;
            } else {
                scale = h * pointValue / size.height;
            }
        } else if(getValue(w, false)) {
            scale = w * pointValue / size.width;
            // width boundary
        } else {
            scale = h * pointValue / size.height;
            // height boundary
        }
        makerjs.model.scale(project, scale);
    }
    
    return makerjs.exporter.toSVG(project).replace(/vector-effect="non-scaling-stroke"/g, '');
}

module.exports.availableFonts = () => {
    return mergedFonts;
}

module.exports.getFont = (url) => {
    const fontName = url.split('/').pop();
    return new Promise((resolve, reject) => {
        if (!fs.existsSync('./fonts')){
            fs.mkdirSync('./fonts');
        }
        fs.exists(`./fonts/${fontName}`, exists => {
            const hash = fontName.slice(0, -4);
            if(exists) {
                resolve(hash);
            } else {
                const file = fs.createWriteStream(`./fonts/${fontName}`);
                https.get(url, response => {
                    response.pipe(file).on('finish', () => {
                        resolve(hash);
                    });
                });
            }
        });
    });
}
