module.exports = {
  projects: [
    // ── Backend (Node.js) ─────────────────────────────────────────────────────
    {
      displayName: 'backend',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'js'],
      transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
      },
    },

    // ── Frontend / React (jsdom) ──────────────────────────────────────────────
    {
      displayName: 'frontend',
      testEnvironment: 'jest-environment-jsdom',
      roots: ['<rootDir>/frontend/src'],
      testMatch: ['**/__tests__/**/*.test.tsx', '**/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['tsx', 'ts', 'js'],
      transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/frontend/tsconfig.json' }],
      },
      moduleNameMapper: {
        '^react$': '<rootDir>/frontend/node_modules/react',
        '^react/jsx-runtime$': '<rootDir>/frontend/node_modules/react/jsx-runtime',
        '^react-dom$': '<rootDir>/frontend/node_modules/react-dom',
        '^react-dom/client$': '<rootDir>/frontend/node_modules/react-dom/client',
        '\\.(css|less|scss|sass)$': '<rootDir>/scripts/__mocks__/styleMock.cjs',
      },
    },
  ],

  // Coverage collected across both projects via `npm run test:coverage`
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'frontend/src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!frontend/src/main.tsx',
  ],
  coverageThreshold: {
    global: {
      branches: 5,
      functions: 10,
      lines: 10,
      statements: 10,
    },
  },
};
