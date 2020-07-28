const opentype = require('opentype.js');
const makerjs = require('makerjs');
const https = require('https');
const fs = require('fs');

const pointValue = 2.8346456693;

const getValue = (arg, defaultValue = false) => {
    if(!arg || arg == 'false' || arg === true || arg < 0 || arg.toString().trim().length == 0) return defaultValue;
    return arg;
}

const getModelInfo = (font, fontSize, text, mergePaths) => {
    let model = new makerjs.models.Text(font, text, fontSize, mergePaths);
    let measure = makerjs.measure.modelExtents(model);
    let width = measure.low[0] < 0 ? measure.width : measure.high[0];
    return {
        model,
        measure,
        width
    }
}

const getLineModel = (font, fontSize, text, maxWidth, mergePaths) => {
    let initialModelInfo = getModelInfo(font, fontSize, text, mergePaths);
    let returnModel = initialModelInfo.model;

    let newLength = Math.floor(text.length * maxWidth / initialModelInfo.width);

    if (initialModelInfo.width > maxWidth) {
        let direction = 0;
        while(true) {
            if(newLength > text.length) break;
            newText = text.substr(0, newLength);
            
            let currentModelInfo = getModelInfo(font, fontSize, newText, mergePaths);
            
            if(direction == 0) {
                if(currentModelInfo.width < maxWidth) {
                    direction = 1;
                }
                if(currentModelInfo.width > maxWidth) {
                    direction = -1;
                }
            }

            if(direction == -1) {
                if(currentModelInfo.width < maxWidth) {
                    returnModel = currentModelInfo.model;
                    break;
                }
            } else {
                if(currentModelInfo.width > maxWidth) {
                    newLength--;
                    break;
                }
            }

            returnModel = currentModelInfo.model;
            newLength += direction;
        };
    }

    return {
        remaining: text.substr(newLength),
        model: returnModel
    }
}

module.exports.getSVG = (t, f, w, h, fH, mP) => {
    if(!getValue(t, false)) {
        throw Error('text not defined');
    }
    
    const font = opentype.loadSync(`${__dirname}/fonts/${f}.ttf`);
    
    let cleaned = [];
    t.toString().trim().split('').forEach(char => {
        if(font.charToGlyphIndex(char) > 0 && /[a-zA-ZÀ-ú0-9 !?¿¡:)(;<=>]/gu.test(char)) {
            cleaned.push(char);
        }
    });

    var project = {
        models: {}
    };

    if(cleaned.length == 0) {
        return makerjs.exporter.toSVG(project).replace(/vector-effect="non-scaling-stroke"/g, '');
    }

    let fontSize = fH * pointValue;

    let originY = 0;
    let maxWidth = (getValue(w, Infinity) - 0.5) * pointValue;

    let numLine = 0;
    var text = cleaned.join('');

    do {
        var lineModel = getLineModel(font, fontSize, text, maxWidth, getValue(mP, false));
        lineModel.model.origin = [0, originY];
        project.models[`model_${numLine++}`] = lineModel.model;
        text = lineModel.remaining.trim();

        let measure = makerjs.measure.modelExtents(lineModel.model);
        originY -= measure.height;
    } while (text.length > 0);
    
    return makerjs.exporter.toSVG(project).replace(/vector-effect="non-scaling-stroke"/g, '');
}

module.exports.availableFonts = () => {
    let contentFile = getMetadataContent();
    let fonts = {};
    Object.keys(contentFile).forEach(fontName => {
        fonts[fontName] = Object.keys(contentFile[fontName].versions);
    });

    return fonts;
}

module.exports.getFont = (url, name, version) => {
    let fontName;
    if(url) {
        fontName = url.split('/').pop();
    } else {
        let contentFile = getMetadataContent();
        if(contentFile[name] && contentFile[name].versions[version]) {
            fontName = contentFile[name].versions[version] + '.ttf';
        } else {
            throw Error('font not found');
        }
    }

    return new Promise((resolve, reject) => {
        if (!fs.existsSync(`${__dirname}/fonts`)){
            fs.mkdirSync(`${__dirname}/fonts`);
        }
        fs.exists(`${__dirname}/fonts/${fontName}`, exists => {
            const hash = fontName.slice(0, -4);
            if(exists) {
                saveFont(hash, name, version);
                resolve(hash);
            } else {
                const file = fs.createWriteStream(`${__dirname}/fonts/${fontName}`);
                if(url) {
                    https.get(url, response => {
                        response.pipe(file).on('finish', () => {
                            saveFont(hash, name, version);
                            resolve(hash);
                        });
                    });
                } else {
                    reject('url not provided');
                }
            }
        });
    });
}

const saveFont = (hash, name, version) => {
    let contentFile = getMetadataContent();
    if(!contentFile[name]) {
        contentFile[name] = {
            versions: {}
        };
    }

    contentFile[name].versions[version] = hash;

    fs.writeFileSync(`${__dirname}/fonts/metadata.json`, JSON.stringify(contentFile), 'utf-8');
}

const getMetadataContent = () => {
    let contentFile = {};
    if (fs.existsSync(`${__dirname}/fonts/metadata.json`)) {
        contentFile = require(`${__dirname}/fonts/metadata.json`);
    }
    return contentFile;
}
