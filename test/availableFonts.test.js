const txt2svg = require('../txt2svg');

describe('txt2svg exports', () => {
  test('should export getSVG function', () => {
    expect(typeof txt2svg.getSVG).toBe('function');
  });

  test('should export getFont function', () => {
    expect(typeof txt2svg.getFont).toBe('function');
  });

  test('should export availableFonts function', () => {
    expect(typeof txt2svg.availableFonts).toBe('function');
  });

  test('should export clearFonts function', () => {
    expect(typeof txt2svg.clearFonts).toBe('function');
  });
});

describe('txt2svg availableFonts', () => {
  test('availableFonts should return an object', () => {
    const result = txt2svg.availableFonts();
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  });
});