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

const getModelInfo = (font, fontSize, text) => {
    const model = new makerjs.models.Text(font, text, fontSize);
    const measure = makerjs.measure.modelExtents(model);
    const width = measure.low[0] < 0 ? measure.width : measure.high[0];
    return {
        model,
        measure,
        width
    }
}

const getLineModel = (font, fontSize, text, maxWidth) => {
    const initialModelInfo = getModelInfo(font, fontSize, text);
    let returnModel = initialModelInfo.model;

    let newLength = Math.floor(text.length * maxWidth / initialModelInfo.width);

    if (initialModelInfo.width > maxWidth) {
        let direction = 0;
        while(true) {
            if(newLength > text.length) break;
            newText = text.substr(0, newLength);
            
            const currentModelInfo = getModelInfo(font, fontSize, newText);
            
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

module.exports.getSVG = (t, f, w, h, fH, ls, mP, aLB, aa, cap, nsb, oID, cbox) => {
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
        if(font.charToGlyphIndex(char) > 0 || char === '\n') {
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
            var lineModel = getLineModel(font, fontSize, text, aa ? maxWidth : Infinity);
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

    if(oID) {
        const fontNumber = opentype.loadSync(`${__dirname}/Nova.ttf`);
        const orderNumberModelInfo = getModelInfo(fontNumber, 10 * pointValue, oID.toString());
        project.models[`model_order`] = orderNumberModelInfo.model;
        project.models['model_order'].origin = [0, originHigh];
        let measureNumber = makerjs.measure.modelExtents(orderNumberModelInfo.model);
        originHigh = measureNumber.high[1];
    }

    if(cbox) {
        project.models['model_cut_area'] = new makerjs.models.Rectangle(maxHigh + cutAreaPadding * 2, - originHigh + maxLow - cutAreaPadding * 2);
        project.models['model_cut_area'].origin = [-cutAreaPadding, originHigh + cutAreaPadding];
    }

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
                },
            };
        }
    }

    if(getValue(mP, false)) {
        Object.keys(project.models).forEach(key => {
            const keys = Object.keys(project.models[key].models);

            for(let i = 0; i < keys.length; i += 1) {
                if (keys[i + 1]) {
                    const a = project.models[key].models[keys[i]];
                    const b = project.models[key].models[keys[i + 1]];

                    if (a && (a.models || a.path) && b && (b.models || b.path)) {
                        const aMeasure = makerjs.measure.modelExtents(a);
                        const bMeasure = makerjs.measure.modelExtents(b);
            
                        if (makerjs.measure.isMeasurementOverlapping(aMeasure, bMeasure)) {
                            const z = makerjs.model.combine(a, b, false, true, false, true, {
                                trimDeadEnds: false,
                            });
                            delete project.models[key].models[keys[i]];
                            project.models[key].models[keys[i + 1]] = z;
                        }
                    }
                }
            }
        });
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

const downloadFontAndUpdateMetadata = (path, url, hash, name, version, resolve, reject) => {
    downloadFont(path, url, (error) => {
        if(error) {
            reject('failed to download font');
        } else {
            updateMetadata(hash, name, version);
            resolve(hash);
        }
    });
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

    return new Promise(async (resolve, reject) => {
        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder);
        }
        if (!fs.existsSync(fontsFolder)) {
            fs.mkdirSync(fontsFolder);
        }
        const path = `${fontsFolder}/${fontName}`;
        fs.stat(path, (error, stats) => {
            const hash = fontName.slice(0, -4);
            if(stats && cache) {
                verifyChecksum(url.slice(0, -3) + 'sha1', path, valid => {
                    if(!valid) {
                        if(fs.existsSync(path)) {
                            fs.unlinkSync(path);
                        }
                        downloadFontAndUpdateMetadata(path, url, hash, name, version, resolve, reject);
                    } else {
                        updateMetadata(hash, name, version);
                        resolve(hash);
                    }
                });
            } else {
                if(url) {
                    downloadFontAndUpdateMetadata(path, url, hash, name, version, resolve, reject);
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
    }).on('error', (e) => {
        if(fs.existsSync(path)) {
            fs.unlinkSync(path);
        }
        cb(true);
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
