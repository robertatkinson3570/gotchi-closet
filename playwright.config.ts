import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  // Default run is the deterministic, network-stubbed suite. The live/ specs
  // assert against real subgraph/RPC data + visual flashes and are opt-in via
  // `pnpm test:e2e:live` (they are inherently flaky in CI by design).
  testIgnore: ['**/live/**'],
  timeout: 30000,
  expect: { timeout: 10000 },
  use: {
    baseURL: 'http://localhost:5000',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
