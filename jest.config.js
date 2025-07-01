module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'txt2svg.js',
    'bin.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: ['**/test/**/*.test.js']
};