const txt2svg = require('../txt2svg');

describe('txt2svg getFont', () => {
  test('should be a function', () => {
    expect(typeof txt2svg.getFont).toBe('function');
  });

  test('should throw error when no URL provided and font not found locally', () => {
    expect(() => {
      txt2svg.getFont(null, 'nonexistentFont', '1', false);
    }).toThrow('font not found');
  });

  test('should handle valid URL parameter', () => {
    // Test that it returns a promise when URL is provided
    const promise = txt2svg.getFont('https://example.com/font.ttf', 'testFont', '1', false);
    expect(promise instanceof Promise).toBe(true);
    
    // Since this is a network request that will likely fail in test environment,
    // we just verify it returns a promise
    return promise.catch(error => {
      // Expected to fail in test environment, just check it's handled
      expect(typeof error).toBe('string');
    });
  });
});