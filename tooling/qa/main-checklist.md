# Zendesk Deployment Testing Master Checklist

This checklist defines the minimum deployment quality gates used by CI and Confluence reporting.

## Environments

- Production
- Default branch preview or staging equivalent
- Feature branch preview
- Manual on-demand execution

## Sanity Checks

- Homepage responds with HTTP 200
- Core runtime asset path is reachable
- Help Center shell renders valid HTML

## Functional Checks

- Search results page opens and returns expected content
- New request page opens without server-side errors
- Primary navigation and article links can be loaded
- Playwright route coverage scans required routes plus crawled Help Center routes
- Environment profiles control strictness (`production`, `default-preview`, `feature-preview`, `manual-on-demand`)
- Production and default-preview run with strict optional-route enforcement
- Functional gate validates minimum crawl coverage per profile
- Sign in toggle behavior must match `hide_sign_in_link` setting
- Submit a request toggle behavior must match `show_submit_a_request_link` setting

## End-To-End User Journeys

- User opens Help Center home and can use search
- User searches from home and reaches search results route
- User browses category -> section -> article path
- User can reach sign-in route as an end user path
- User can reach submit-request route as an end user path
- Access challenge pages (for example bot/WAF challenge) are detected and fail the functional gate
- When challenge is detected, journey and crawl assertions are flagged as blocked/skipped to avoid false UX conclusions

## Positive Checks

- Default locale path resolves
- Expected canonical routes return successful responses

## Negative Checks

- Invalid path returns 404
- Malformed query does not return 5xx
- Known error pages keep theme shell and support links

## Performance Checks (Zendesk Baseline + Lighthouse Mobile)

- Performance score >= 70
- FCP <= 3000 ms
- LCP <= 4000 ms
- CLS <= 0.10
- TBT <= 300 ms
- Speed Index <= 5800 ms
- If access challenge is detected, performance metrics for that URL are marked non-representative and failed with explicit challenge reason

## Failure Handling

- Any failed quality gate blocks deployment
- Confluence run page includes a Jira defect placeholder section
- Defect placeholders target Jira project key FPSKB

## Optional Auth Inputs (When Environment Is Protected)

- `PLAYWRIGHT_STORAGE_STATE_PATH` to reuse an authenticated browser session
- `TEST_COOKIE_HEADER` to pass session cookies for HTTP probes
- `TEST_EXTRA_HEADERS_JSON` to pass custom headers (for gateways/access)
- `TEST_HC_LOCALE` to override locale path mapping (for example `en-gb` instead of `en-us`)

## Test Traceability Matrix

| Test ID | Test Objective | Test Type | Source | Execution Script | Evidence Artifact | Auth Needed | Pass Criteria |
|---|---|---|---|---|---|---|---|
| TM-DEP-001 | Validate homepage availability and HTML shell | Sanity | `tooling/qa/scenarios.json` (`sanity-homepage-up`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | HTTP 200 and HTML markers found |
| TM-DEP-002 | Validate core runtime asset is reachable | Sanity | `tooling/qa/scenarios.json` (`sanity-core-assets`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | Asset route returns expected status |
| TM-FUNC-001 | Validate search page availability | Functional | `tooling/qa/scenarios.json` (`functional-search-page`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | Route returns expected status/content |
| TM-FUNC-002 | Validate request creation page availability | Functional | `tooling/qa/scenarios.json` (`functional-request-page`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | Route returns expected status |
| TM-POS-001 | Validate default locale entrypoint | Positive | `tooling/qa/scenarios.json` (`positive-locale-default`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | Locale route resolves successfully |
| TM-NEG-001 | Validate invalid route handling | Negative | `tooling/qa/scenarios.json` (`negative-not-found`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | Invalid route returns expected non-success |
| TM-NEG-002 | Validate malformed query resilience | Negative | `tooling/qa/scenarios.json` (`negative-invalid-query`) | `tooling/scripts/run-deployment-tests.mjs` | `<target>-deployment.json` | Required only if endpoint is protected | No 5xx regression for malformed query |
| TM-PW-001 | Validate required Help Center routes | Functional E2E | `tooling/qa/playwright-scenarios.json` (`requiredRoutes`) | `tooling/scripts/run-playwright-functional-tests.mjs` | `<target>-functional-playwright.json` | Required for protected environments | Required route coverage passes |
| TM-PW-002 | Validate optional route profile strictness | Functional E2E | `tooling/qa/playwright-scenarios.json` (`optionalRoutes`, `strictOptionalRoutes`) | `tooling/scripts/run-playwright-functional-tests.mjs` | `<target>-functional-playwright.json` | Required for protected environments | Optional routes meet selected profile rules |
| TM-PW-003 | Validate crawl discovery minimum | Functional E2E | `tooling/qa/playwright-scenarios.json` (`minCrawledRoutes`) | `tooling/scripts/run-playwright-functional-tests.mjs` | `<target>-functional-playwright.json` | Required for protected environments | Discovered routes >= profile minimum |
| TM-PW-004 | Validate sign in / submit request toggle behavior | Functional E2E | Theme settings + Playwright toggle checks | `tooling/scripts/run-playwright-functional-tests.mjs` | `<target>-functional-playwright.json` | Usually not required on public pages; required if gated by auth/WAF | Toggle expectation matches rendered UI |
| TM-PW-005 | Validate user journey flows (search, browse, sign-in route, request route) | Functional E2E | `tooling/qa/playwright-scenarios.json` (`journeyChecks`) | `tooling/scripts/run-playwright-functional-tests.mjs` | `<target>-functional-playwright.json` | Required for protected environments | Journey checks pass without challenge block |
| TM-PW-006 | Detect bot/WAF access challenge | Functional E2E Gate | `tooling/qa/playwright-scenarios.json` (`challengeTitlePatterns`) | `tooling/scripts/run-playwright-functional-tests.mjs` | `<target>-functional-playwright.json` | Not required for detection itself | No challenge page detected |
| TM-PERF-001 | Validate Lighthouse performance score threshold | Performance | `tooling/qa/performance-thresholds.json` | `tooling/scripts/run-performance-tests.mjs` | `<target>-performance.json` | Required for protected environments | Score >= configured threshold |
| TM-PERF-002 | Validate Web Vitals / lab metrics thresholds (FCP/LCP/CLS/TBT/SI) | Performance | `tooling/qa/performance-thresholds.json` | `tooling/scripts/run-performance-tests.mjs` | `<target>-performance.json` | Required for protected environments | All configured metrics meet limits |
| TM-PERF-003 | Validate representative performance context | Performance Gate | Access challenge probe in performance runner | `tooling/scripts/run-performance-tests.mjs` | `<target>-performance.json` | Not required for detection itself | No access challenge before Lighthouse assertions |

## Authentication Requirement Model

- Public preview/production URL without bot challenge: run tests without auth inputs.
- Protected URL (WAF, SSO, gateway, Cloudflare challenge): auth is mandatory for valid functional and performance outcomes.
- Deployment HTTP checks and performance challenge probes use `fetch`; provide either `TEST_COOKIE_HEADER`, `TEST_EXTRA_HEADERS_JSON`, or both.
- Playwright functional and journey checks should use `PLAYWRIGHT_STORAGE_STATE_PATH`; optional headers can be added with `TEST_EXTRA_HEADERS_JSON`.
- If challenge is still detected after auth inputs, treat result as environment-access failure, not theme regression.

## Authentication Inputs by Test Suite

| Suite | Primary Auth Mechanism | Secondary Mechanism | Why |
|---|---|---|---|
| Deployment HTTP checks | `TEST_COOKIE_HEADER` | `TEST_EXTRA_HEADERS_JSON` | Runner uses direct HTTP fetch; browser session is not used |
| Playwright functional and E2E | `PLAYWRIGHT_STORAGE_STATE_PATH` | `TEST_EXTRA_HEADERS_JSON`, `TEST_COOKIE_HEADER` | Browser context needs a valid authenticated state to reach real pages |
| Performance checks | `TEST_COOKIE_HEADER` | `TEST_EXTRA_HEADERS_JSON` | Pre-check fetch must clear access challenge before Lighthouse metrics |

## Reporting

- Two Confluence child pages are created per deployment run under the checklist parent:
  - Functional Test Results page
  - Performance Test Results page
- Functional page includes metadata, HTTP summary, Playwright route/toggle coverage, and E2E journey results
- Performance page includes metadata and per-page Lighthouse metrics
- Pipeline artifact links are attached in the run page
