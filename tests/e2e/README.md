# E2E Tests

Run with:

- `npm run test:e2e`

API-backed happy-path test:

- Set `E2E_API_BASE_URL` (for example `http://localhost:3001`) to enable the flow.
- Without that env var, the test is skipped by design.
- The existing happy-path spec is a pre-pilot smoke check only; it does not replace the manual field-test pack in `docs/operations/field_test_plan.md`.
