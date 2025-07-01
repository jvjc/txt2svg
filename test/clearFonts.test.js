const txt2svg = require('../txt2svg');

describe('txt2svg clearFonts', () => {
  test('should be a function', () => {
    expect(typeof txt2svg.clearFonts).toBe('function');
  });

  test('should not throw when called without parameters', () => {
    expect(() => {
      txt2svg.clearFonts();
    }).not.toThrow();
  });

  test('should not throw when called with name only', () => {
    expect(() => {
      txt2svg.clearFonts('testFont');
    }).not.toThrow();
  });

  test('should not throw when called with name and version', () => {
    expect(() => {
      txt2svg.clearFonts('testFont', '1');
    }).not.toThrow();
  });
});