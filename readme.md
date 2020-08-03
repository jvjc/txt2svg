### Instalación
Después de instalar las dependencias se ejecutará automáticamente la obtención de las fuentes que están en el archivo **fonts.json**

- Si se requieren otras fuentes solo basta con agregarlas al archivo **fonts.json** y ejecutar:
```bash
npm run update-fonts
```

### Uso
- Ejecutar:
```bash
node bin.js --width 305 --height 305 --text $'Feliz\ncumpleaños\nmamá' --font-url https://dlu1537hrr98t.cloudfront.net/ProductCustomizableTextForVinylCuttingFont/5f076ee7-7208-48d2-89fa-0530ac1e0036.ttf
or
txt2svg --width 305 --height 305 --text $'Feliz\ncumpleaños\nmamá' --font-url https://dlu1537hrr98t.cloudfront.net/ProductCustomizableTextForVinylCuttingFont/5f076ee7-7208-48d2-89fa-0530ac1e0036.ttf
```
- Cada salto de línea será una línea como tal en el svg

### Argumentos

Argumento | Default | Opciones
-- | -- | --
text | **Requerido**
font-name | **Requerido**
font-version | **Requerido**
font-url | -
output | svg | svg \| object
width | -
height | -
font-height | 50
line-spacing | 2
merge-path | false | true \| false
allow-line-break | presente o no
auto-adjust | true | true \| false
cut-area-preview | false | true \| false
