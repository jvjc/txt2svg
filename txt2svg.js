const opentype = require('opentype.js');
const makerjs = require('makerjs');
const https = require('https');
const fs = require('fs');
const { point } = require('makerjs');
const home = require('os').homedir();
const projectFolder = `${home}/.txt2svg`;
const fontsFolder = `${projectFolder}/fonts`;

const pointValue = 2.8346456693;

const cutAreaPadding = 5 * pointValue;

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

module.exports.getSVG = (t, f, w, h, fH, ls, mP, aLB, aa, cap) => {
    if(!getValue(t, false)) {
        throw Error('text not defined');
    }
    
    const font = opentype.loadSync(`${fontsFolder}/${f}.ttf`);
    
    let cleaned = [];
    t = t.toString().trim();
    if(aa) {
        if(!aLB) {
            t = t.replace(/\n/g, ' ');
        }
        t = t.replace(/ +/g, ' ');
    }
    t.split('').forEach(char => {
        if((font.charToGlyphIndex(char) > 0 && /[a-zA-ZÀ-ú0-9 !?¿¡:)\-(;<=>\\]/gu.test(char)) || char === '\n') {
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
    let originHigh;
    let originLow = Infinity;
    let maxLow = Infinity;
    let maxHigh = -Infinity;
    let maxWidth = (getValue(w, Infinity) - 0.5) * pointValue;
    let maxHeight = (getValue(h, Infinity) - 0.5) * pointValue;

    let numLine = 0;

    cleaned.join('').split('\n').forEach(text => {
        do {
            var lineModel = getLineModel(font, fontSize, text, aa ? maxWidth : Infinity, getValue(mP, false));
            lineModel.model.origin = [0, originY];
            project.models[`model_${numLine++}`] = lineModel.model;
            let measure = makerjs.measure.modelExtents(lineModel.model);
            if(!originHigh) {
                originHigh = measure.high[1];
            }
            if(measure.low[0] < originLow) {
                originLow = measure.low[0];
            }

            if(measure.low[1] < maxLow) {
                maxLow = measure.low[1];
            }

            let width = measure.low[0] < 0 ? measure.width : measure.high[0];
            if(width > maxHigh) {
                maxHigh = width;
            }

            text = lineModel.remaining.trim();
            originY -= (measure.height + ls * pointValue);
        } while (text.length > 0);
    });

    let outOfBox = (maxLow < -maxHeight + originHigh || maxHigh > maxWidth) && w && h;

    if(outOfBox || cap) {
        let cutAreaWidth = getValue(w) * pointValue;
        let cutAreaHeight = -getValue(h) * pointValue;
        project.models['boundaries'] = new makerjs.models.Rectangle(cutAreaWidth + cutAreaPadding * 2, cutAreaHeight - cutAreaPadding * 2);
        project.models['boundaries'].layer = 'boundaries';
        project.models['boundaries'].origin = [originLow - cutAreaPadding, originHigh + cutAreaPadding];
    }
    
    return makerjs.exporter.toSVG(project, {
        layerOptions: {
            boundaries: {
                stroke: outOfBox ? 'red' : 'blue',
                strokeWidth: 4
            }
        }
    }).replace(/vector-effect="non-scaling-stroke"/g, '');
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
        if (!fs.existsSync(projectFolder)){
            fs.mkdirSync(projectFolder);
        }
        if (!fs.existsSync(fontsFolder)){
            fs.mkdirSync(fontsFolder);
        }
        fs.exists(`${fontsFolder}/${fontName}`, exists => {
            const hash = fontName.slice(0, -4);
            if(exists) {
                saveFont(hash, name, version);
                resolve(hash);
            } else {
                const file = fs.createWriteStream(`${fontsFolder}/${fontName}`);
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

    fs.writeFileSync(`${fontsFolder}/metadata.json`, JSON.stringify(contentFile), 'utf-8');
}

const getMetadataContent = () => {
    let contentFile = {};
    if (fs.existsSync(`${fontsFolder}/metadata.json`)) {
        contentFile = require(`${fontsFolder}/metadata.json`);
    }
    return contentFile;
}
