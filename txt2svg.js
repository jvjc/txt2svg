const opentype = require('opentype.js');
const makerjs = require('makerjs');
const https = require('https');
const fs = require('fs');
const { RSA_NO_PADDING } = require('constants');

const pointValue = 2.8346456693;
const pixelValue = 3.7795275591;

const getValue = (arg, defaultValue = false) => {
    if(!arg || arg == 'false' || arg === true || arg < 0 || arg.toString().trim().length == 0) return defaultValue;
    return arg;
}

module.exports.getSVG = (t, f, w, h, fH, mP) => {
    if(!getValue(t, false)) {
        throw Error('text not defined');
    }
    
    const font = opentype.loadSync(`${__dirname}/fonts/${f}.ttf`);
    
    let cleaned = [];
    t.toString().trim().split('').forEach(char => {
        if(char.trim() && font.charToGlyphIndex(char) > 0 && /[a-zA-ZÀ-ú0-9 !?¿¡:)(;<=>]/gu.test(char)) {
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
    
    let originX = 0;
    let originY = 0;
    let maxY = 0;
    let maxWidth = getValue(w, Infinity) * pixelValue;

    cleaned.forEach((letter, i) => {
        let model = new makerjs.models.Text(font, letter, fontSize, getValue(mP, false));
        let measure = makerjs.measure.modelExtents(model);
        
        project.models[`model_${i}`] = model;

        maxY = measure.height > maxY ? measure.height : maxY;

        if(originX + measure.high[0] > maxWidth) {
            originY -= maxY;
            maxY = 0;
            originX = 0;
        }

        project.models[`model_${i}`].origin = [originX, originY];

        originX += measure.high[0];
        
        let width = measure.high[0];
        /*
        project.models[`model_${i}`] = currentModel;
        project.models[`model_${i}`].origin = [0, originY]; */
    
        /* let bounds = makerjs.measure.modelExtents(currentModel);
        originY += bounds.height + 5; */
    });

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
