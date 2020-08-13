const opentype = require('opentype.js');
const makerjs = require('makerjs');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

module.exports.getSVG = (t, f, w, h, fH, ls, mP, aLB, aa, cap, nsb, fC) => {
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
        if((font.charToGlyphIndex(char) > 0 && /[a-zA-ZÀ-ÿ0-9 !?¿¡:)\.@#\-,(;<=>\\]/gu.test(char)) || char === '\n') {
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
    let SVGoptions;

    if(!nsb) {
        if(outOfBox || cap) {
            let cutAreaWidth = getValue(w) * pointValue;
            let cutAreaHeight = -getValue(h) * pointValue;
            project.models['boundaries'] = new makerjs.models.Rectangle(cutAreaWidth + cutAreaPadding * 2, cutAreaHeight - cutAreaPadding * 2);
            project.models['boundaries'].layer = 'boundaries';
            project.models['boundaries'].origin = [originLow - cutAreaPadding, originHigh + cutAreaPadding];

            SVGoptions = {
                layerOptions: {
                    boundaries: {
                        stroke: outOfBox ? 'red' : 'blue',
                        strokeWidth: 4
                    }
                }
            };
        }
    }
    
    return makerjs.exporter.toSVG(project, SVGoptions).replace(/vector-effect="non-scaling-stroke"/g, '');
}

module.exports.availableFonts = () => {
    let contentFile = getMetadataContent();
    let fonts = {};
    Object.keys(contentFile).forEach(fontName => {
        fonts[fontName] = Object.keys(contentFile[fontName].versions);
    });

    return fonts;
}

module.exports.clearFonts = (name, version) => {
    let contentFile = getMetadataContent();
    if(name && version) {
        if(contentFile[name] && contentFile[name].versions[version]) {
            if(fs.existsSync(`${fontsFolder}/${contentFile[name].versions[version]}.ttf`)) {
                fs.unlinkSync(`${fontsFolder}/${contentFile[name].versions[version]}.ttf`);
            }
            delete contentFile[name].versions[version];
            if(Object.keys(contentFile[name].versions).length === 0) {
                delete contentFile[name];
            }
        }
    } else if (name) {
        if(contentFile[name]) {
            Object.keys(contentFile[name].versions).forEach(function (version) {
                if(fs.existsSync(`${fontsFolder}/${contentFile[name].versions[version]}.ttf`)) {
                    fs.unlinkSync(`${fontsFolder}/${contentFile[name].versions[version]}.ttf`);
                }
                delete contentFile[name].versions[version];
            });
            delete contentFile[name];
        }
    } else {
        contentFile = {};
        fs.readdir(fontsFolder, (err, files) => {
            if (err) throw err;
            for (const file of files) {
                if(file !== 'metadata.json') {
                    fs.unlinkSync(path.join(fontsFolder, file));
                }
            }
        });
    }
    fs.writeFileSync(`${fontsFolder}/metadata.json`, JSON.stringify(contentFile), 'utf-8');
}

module.exports.getFont = (url, name, version, cache) => {
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
            if(exists && cache) {
                updateMetadata(hash, name, version);
                resolve(hash);
            } else {
                if(url) {
                    downloadFont(`${fontsFolder}/${fontName}`, url, (error) => {
                        if(error) {
                            reject('failed to download font');
                        } else {
                            updateMetadata(hash, name, version);
                            resolve(hash);
                        }
                    });
                } else {
                    reject('url not provided');
                }
            }
        });
    });
}

var maxTries = 0;
const downloadFont = (fontPath, url, cb) => {
    if(maxTries++ < 3) {
        downloadFile(fontPath, url, error => {
            if(error) {
                downloadFont(fontPath, url, cb);
            } else {
                cb();
            }
        });
    } else {
        cb(true);
    }
}

const getChecksum = filePath => {
    const fileContent = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(fileContent).digest('hex');
}

const verifyChecksum = (verificationURL, file, cb) => {
    const checksum = getChecksum(file);
    https.get(verificationURL, response => {
        let data = '';
        response.on('data', chunk => {
            data += chunk;
        });

        response.on('end', () => {
            if(checksum === data.trim()) {
                cb(true);
            } else {
                cb(false);
            }
        })
    });
}

const downloadFile = (path, url, cb) => {
    const file = fs.createWriteStream(path);
    https.get(url, response => {
        response.pipe(file).on('finish', () => {
            verifyChecksum(url.slice(0, -3) + 'sha1', path, valid => {
                if(!valid) {
                    if(fs.existsSync(path)) {
                        fs.unlinkSync(path);
                    }
                }
                cb(!valid);
            });
        });
    });
}

const updateMetadata = (hash, name, version) => {
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
