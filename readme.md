### Instalación
Después de instalar las dependencias se ejecutará automáticamente la obtención de las fuentes que están en el archivo **fonts.json**

- Si se requieren otras fuentes solo basta con agregarlas al archivo **fonts.json** y ejecutar:
```bash
npm run update-fonts
```

### Uso
- Basta con ejecutar
```bash
node txt2svg.js --text "Texto ejemplo"
```

### Argumentos

Argumento | Default
-- | --
text | **Requerido**
font | Roboto
size | 100
fill | none
stroke | black
