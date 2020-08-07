### Uso
- Ejecutar:
```bash
node bin.js --width 305 --height 305 --text $'Feliz\ncumpleaños\nmamá' --font-url https://dlu1537hrr98t.cloudfront.net/ProductCustomizableTextForVinylCuttingFont/5f076ee7-7208-48d2-89fa-0530ac1e0036.ttf --font-name Pacifico --font-version 3
// or
txt2svg --width 305 --height 305 --text $'Feliz\ncumpleaños\nmamá' --font-url https://dlu1537hrr98t.cloudfront.net/ProductCustomizableTextForVinylCuttingFont/5f076ee7-7208-48d2-89fa-0530ac1e0036.ttf --font-name Pacifico --font-version 3
```

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
auto-adjust | false | true \| false
cut-area-preview | false | true \| false
hide-surrounding-box | false | true \| false
font-caching | false | true \| false

### Otros métodos
- Ver fuentes y versiones disponibles:
```bash
txt2svg --available-fonts
```

- Eliminar fuentes o versiones de fuentes
```bash
// Eliminar una versión específica de una fuente
txt2svg --clear-fonts --font-name Pacifico font-version 1

// Eliminar todas las versiones de una fuente en específico
txt2svg --clear-fonts --font-name Pacifico

// Eliminar todas las fuentes
txt2svg --clear-fonts
```