const opentype = require('opentype.js');
const makerjs = require('makerjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const home = require('os').homedir();
const projectFolder = `${home}/.txt2svg`;
const fontsFolder = `${projectFolder}/fonts`;
const axiosRetry = require('axios-retry');
const axios = require('axios').default;

axiosRetry(axios, { retries: 3 });

const pointValue = 2.8346456693;

const cutAreaPadding = 5 * pointValue;
// Opciones por defecto para la fase de limpieza / merge.
// Se mantienen conservadoras para no alterar el comportamiento histórico.
const defaultPreprocessOptions = {
    snapGrid: 0.01,
    minArea: 0.05,
    minRadius: 0.01, // reservado para compatibilidad futura
    quality: 'best',
    maxComponentSize: 150
};

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

// Busca el máximo prefijo que cabe en maxWidth.
// Usa búsqueda binaria para reducir mediciones sin cambiar el contrato de salida.
const getLineModel = (font, fontSize, text, maxWidth) => {
    const initialModelInfo = getModelInfo(font, fontSize, text);
    let returnModel = initialModelInfo.model;
    let newLength = text.length;

    if (!Number.isFinite(maxWidth) || initialModelInfo.width <= maxWidth) {
        return {
            remaining: '',
            model: returnModel
        };
    }

    let bestLength = 0;
    let low = 1;
    let high = text.length;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const newText = text.substr(0, mid);
        const currentModelInfo = getModelInfo(font, fontSize, newText);

        if (currentModelInfo.width <= maxWidth) {
            bestLength = mid;
            returnModel = currentModelInfo.model;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    if (bestLength === 0) {
        bestLength = 1;
        returnModel = getModelInfo(font, fontSize, text.substr(0, 1)).model;
    }

    newLength = bestLength;

    return {
        remaining: text.substr(newLength),
        model: returnModel
    }
}

// Normaliza números a una rejilla para reducir micro-segmentos en operaciones booleanas.
const snapNumber = (value, grid) => {
    if (!grid || !Number.isFinite(value)) return value;
    return Math.round(value / grid) * grid;
}

const snapPoint = (point, grid) => {
    if (!Array.isArray(point)) return point;
    return [snapNumber(point[0], grid), snapNumber(point[1], grid)];
}

const cleanPath = (pathModel, options) => {
    if (!pathModel || typeof pathModel !== 'object') return pathModel;

    if (pathModel.origin) pathModel.origin = snapPoint(pathModel.origin, options.snapGrid);
    if (pathModel.end) pathModel.end = snapPoint(pathModel.end, options.snapGrid);
    if (pathModel.start) pathModel.start = snapPoint(pathModel.start, options.snapGrid);
    if (pathModel.middle) pathModel.middle = snapPoint(pathModel.middle, options.snapGrid);
    if (Number.isFinite(pathModel.radius)) pathModel.radius = snapNumber(pathModel.radius, options.snapGrid);
    if (Number.isFinite(pathModel.startAngle)) pathModel.startAngle = snapNumber(pathModel.startAngle, 0.01);
    if (Number.isFinite(pathModel.endAngle)) pathModel.endAngle = snapNumber(pathModel.endAngle, 0.01);

    if (Array.isArray(pathModel.controls)) {
        pathModel.controls = pathModel.controls.map(control => snapPoint(control, options.snapGrid));
    }

    return pathModel;
}

// Limpia recursivamente el modelo: snap de coordenadas y descarte de submodelos mínimos/rotos.
const preprocessModel = (model, options) => {
    if (!model) return;
    if (model.origin) {
        model.origin = snapPoint(model.origin, options.snapGrid);
    }

    if (model.paths) {
        Object.keys(model.paths).forEach(pathKey => {
            model.paths[pathKey] = cleanPath(model.paths[pathKey], options);
        });
    }

    if (model.models) {
        Object.keys(model.models).forEach(key => {
            const child = model.models[key];
            preprocessModel(child, options);

            try {
                const childMeasure = makerjs.measure.modelExtents(child);
                const area = Math.abs(childMeasure.width * childMeasure.height);
                if (!Number.isFinite(area) || area < options.minArea) {
                    delete model.models[key];
                }
            } catch (error) {
                delete model.models[key];
            }
        });
    }
}

const mergeComponentModels = (models) => {
    if (!models || !models.length) return null;
    if (models.length === 1) return models[0];

    const sorted = models.slice().sort((a, b) => {
        const aMeasure = makerjs.measure.modelExtents(a);
        const bMeasure = makerjs.measure.modelExtents(b);
        const aArea = Math.abs(aMeasure.width * aMeasure.height);
        const bArea = Math.abs(bMeasure.width * bMeasure.height);
        return aArea - bArea;
    });

    let merged = sorted[0];
    for (let i = 1; i < sorted.length; i += 1) {
        merged = makerjs.model.combine(merged, sorted[i], false, true, false, true, {
            trimDeadEnds: false,
        });
    }

    return merged;
}

// Construye componentes conectados por solape de bbox y combina por componente.
const mergeOverlappingModels = (lineModel, options) => {
    if (!lineModel || !lineModel.models) return;
    const keys = Object.keys(lineModel.models);
    if (keys.length < 2) return;

    const entries = keys.map(key => {
        const model = lineModel.models[key];
        return {
            key,
            model,
            measure: makerjs.measure.modelExtents(model)
        };
    });

    const adjacency = entries.map(() => new Set());
    for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
            if (makerjs.measure.isMeasurementOverlapping(entries[i].measure, entries[j].measure)) {
                adjacency[i].add(j);
                adjacency[j].add(i);
            }
        }
    }

    const visited = new Set();
    const components = [];

    for (let i = 0; i < entries.length; i += 1) {
        if (visited.has(i)) continue;
        const stack = [i];
        const component = [];

        while (stack.length) {
            const index = stack.pop();
            if (visited.has(index)) continue;
            visited.add(index);
            component.push(index);
            adjacency[index].forEach(nextIndex => {
                if (!visited.has(nextIndex)) stack.push(nextIndex);
            });
        }

        components.push(component);
    }

    const mergedModels = {};
    let mergedIndex = 0;
    components.forEach(component => {
        const componentModels = component.map(index => entries[index].model);
        const canMerge = component.length > 1
            && (options.quality === 'best' || (options.quality === 'balanced' && component.length <= options.maxComponentSize));

        if (canMerge) {
            mergedModels[`merged_${mergedIndex++}`] = mergeComponentModels(componentModels);
            return;
        }

        component.forEach(index => {
            const entry = entries[index];
            mergedModels[entry.key] = entry.model;
        });
    });

    lineModel.models = mergedModels;
}

module.exports.getSVG = (t, f, w, h, fH, ls, mP, aLB, aa, cap, nsb, oID, cbox, preprocessOptions = {}) => {
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

    // Normaliza opciones de preprocesado (sin requerir cambios en llamadas existentes).
    const processedOptions = {
        ...defaultPreprocessOptions,
        ...preprocessOptions,
        quality: (preprocessOptions.quality || defaultPreprocessOptions.quality).toString().toLowerCase()
    };

    // Preprocesado geométrico previo a merge para reducir carga de booleanas.
    Object.keys(project.models).forEach(key => {
        preprocessModel(project.models[key], processedOptions);
    });

    // Mantiene merge-path actual, con salida rápida opcional en quality=fast.
    if(getValue(mP, false) && processedOptions.quality !== 'fast') {
        Object.keys(project.models).forEach(key => {
            mergeOverlappingModels(project.models[key], processedOptions);
        });
    }

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
    downloadFile(path, url, (error) => {
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

const getChecksum = filePath => {
    const fileContent = fs.readFileSync(filePath);
    return crypto.createHash('sha1').update(fileContent).digest('hex');
}

const verifyChecksum = (verificationURL, file, cb) => {
    const checksum = getChecksum(file);

    axios.get(verificationURL, {responseType: 'text'}).then((response) => {
        if(checksum === response.data) {
            cb(true);
        } else {
            cb(false);
        }
    }).catch((err) => {
        cb(false);
    });
}

const downloadFile = (path, url, cb) => {
    const writer = fs.createWriteStream(path);

    axios({url, responseType: 'stream'}).then((response) => {
        return new Promise((resolve, reject) => {
            response.data.pipe(writer);

            let error = null;
            writer.on('error', err => {
                error = err;
                writer.close();
                reject(err);
            });

            writer.on('close', () => {
                if (!error) {
                    resolve(true);
                }
            });
        });
    }).then(() => {
        verifyChecksum(url.slice(0, -3) + 'sha1', path, (valid) => {
            if(!valid) {
                if(fs.existsSync(path)) {
                    fs.unlinkSync(path);
                }
            }
            cb(!valid);
        });
    }).catch((err) => {
        if(fs.existsSync(path)) {
            fs.unlinkSync(path);
        }
        cb(err);
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
