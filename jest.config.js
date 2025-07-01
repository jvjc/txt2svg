module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'txt2svg.js',
    'bin.js'
  ],
  coverageDirectory: 'coverage',
  verbose: true
};