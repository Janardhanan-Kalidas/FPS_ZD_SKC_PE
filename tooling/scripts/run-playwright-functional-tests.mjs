#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key.startsWith("--")) {
      args[key.slice(2)] = next && !next.startsWith("--") ? next : "true";
      if (next && !next.startsWith("--")) i += 1;
    }
  }
  return args;
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function detectHelpCenterLocale(baseUrl) {
  const envLocale = (process.env.TEST_HC_LOCALE || "").trim().toLowerCase();
  if (/^[a-z]{2}-[a-z]{2}$/.test(envLocale)) {
    return envLocale;
  }

  try {
    const parsed = new URL(baseUrl);
    const match = parsed.pathname.match(/\/hc\/([a-z]{2}-[a-z]{2})(?:\/|$)/i);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  } catch {
    // Ignore URL parse errors and fall back.
  }

  return "en-us";
}

function localizeHelpCenterPath(rawPath, locale) {
  if (typeof rawPath !== "string" || !rawPath.startsWith("/hc/")) {
    return rawPath;
  }
  return rawPath.replace(/^\/hc\/[a-z]{2}-[a-z]{2}(?=\/|$)/i, `/hc/${locale}`);
}

function getProfileConfig(scenarios, profileName) {
  if (scenarios?.profiles && typeof scenarios.profiles === "object") {
    const selected = scenarios.profiles[profileName];
    if (selected) {
      return { selectedProfile: profileName, config: selected };
    }

    const fallbackName = scenarios.defaultProfile;
    if (fallbackName && scenarios.profiles[fallbackName]) {
      return { selectedProfile: fallbackName, config: scenarios.profiles[fallbackName] };
    }

    const first = Object.entries(scenarios.profiles)[0];
    if (first) {
      return { selectedProfile: first[0], config: first[1] };
    }
  }

  return { selectedProfile: profileName || "legacy", config: scenarios || {} };
}

function parseFingerprint(content) {
  const result = {};
  if (!content) return result;
  for (const pair of content.split(";")) {
    const [key, rawValue] = pair.split("=");
    if (!key) continue;
    result[key.trim()] = (rawValue || "").trim();
  }
  return result;
}

function makeAbsolute(baseUrl, route) {
  if (/^https?:\/\//i.test(route)) {
    return route;
  }

  const base = new URL(baseUrl);
  if (route.startsWith("/hc/")) {
    return `${base.origin}${route}`;
  }

  return new URL(route.replace(/^\//, ""), `${normalizeBaseUrl(baseUrl)}/`).toString();
}

function classifyStatus(status) {
  if (status >= 200 && status < 400) return "passed";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status >= 500) return "failed";
  return "warning";
}

function isAuthLikeStatus(status) {
  return status === 401 || status === 403;
}

function sanitizeFilePart(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

async function captureFailureScreenshot(page, screenshotDir, checkId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${stamp}-${sanitizeFilePart(checkId)}.png`;
  const filePath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

function buildExtraHttpHeaders() {
  const headers = {};
  const extraHeadersJson = process.env.TEST_EXTRA_HEADERS_JSON || "";
  if (extraHeadersJson) {
    try {
      const parsed = JSON.parse(extraHeadersJson);
      if (parsed && typeof parsed === "object") {
        Object.assign(headers, parsed);
      }
    } catch (error) {
      throw new Error(`Invalid TEST_EXTRA_HEADERS_JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return headers;
}

async function detectAccessChallenge(page, titlePatterns = []) {
  const title = await page.title();
  const lowerTitle = (title || "").toLowerCase();
  const bodyText = await page.locator("body").innerText().catch(() => "");
  const lowerBody = (bodyText || "").toLowerCase();

  const patterns = Array.isArray(titlePatterns) && titlePatterns.length > 0
    ? titlePatterns
    : ["just a moment", "attention required", "verify you are human"];

  const matched = patterns.some((pattern) => {
    const normalized = String(pattern).toLowerCase();
    return lowerTitle.includes(normalized) || lowerBody.includes(normalized);
  });

  return {
    title,
    challengeDetected: matched,
    matchedPatterns: patterns.filter((pattern) => {
      const normalized = String(pattern).toLowerCase();
      return lowerTitle.includes(normalized) || lowerBody.includes(normalized);
    }),
  };
}

async function runRouteCheck(page, baseUrl, route, required, screenshotDir) {
  const url = makeAbsolute(baseUrl, route);
  const startedAt = new Date().toISOString();
  const t0 = Date.now();

  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const durationMs = Date.now() - t0;
    const status = response ? response.status() : 0;
    const outcome = classifyStatus(status);

    const title = await page.title();
    const hasBody = await page.locator("body").count().then((c) => c > 0);

    let passed = false;
    if (required) {
      passed = outcome === "passed" || outcome === "auth";
    } else {
      passed = outcome === "passed" || outcome === "auth" || outcome === "not_found";
    }

    const result = {
      route,
      required,
      url,
      status,
      outcome,
      passed,
      title,
      hasBody,
      startedAt,
      durationMs,
      error: null,
    };

    if (!result.passed) {
      try {
        result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, `route-${route}`);
      } catch {
        result.screenshotPath = null;
      }
    }

    return result;
  } catch (error) {
    const result = {
      route,
      required,
      url,
      status: 0,
      outcome: "failed",
      passed: false,
      title: "",
      hasBody: false,
      startedAt,
      durationMs: Date.now() - t0,
      error: error instanceof Error ? error.message : String(error),
    };

    try {
      result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, `route-${route}`);
    } catch {
      result.screenshotPath = null;
    }

    return result;
  }
}

async function collectCrawlRoutes(page, baseUrl, prefix, maxPages, startRoute) {
  const discovered = new Set();
  const queue = [startRoute];

  while (queue.length > 0 && discovered.size < maxPages) {
    const route = queue.shift();
    if (!route || discovered.has(route)) continue;
    discovered.add(route);

    const url = makeAbsolute(baseUrl, route);
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const status = response ? response.status() : 0;
      if (status >= 400) continue;

      const links = await page.$$eval("a[href]", (anchors) =>
        anchors
          .map((a) => a.getAttribute("href") || "")
          .filter((href) => href.startsWith("/") && !href.startsWith("//"))
      );

      for (const href of links) {
        if (!href.startsWith(prefix)) continue;
        if (href.includes("#")) continue;
        if (!discovered.has(href) && !queue.includes(href) && discovered.size + queue.length < maxPages) {
          queue.push(href);
        }
      }
    } catch {
      // Ignore crawl failures and continue with discovered routes.
    }
  }

  return Array.from(discovered);
}

async function evaluateToggleChecks(page, baseUrl, screenshotDir, locale) {
  const homeUrl = makeAbsolute(baseUrl, `/hc/${locale}`);
  await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

  const fingerprintRaw = await page
    .locator('meta[name="theme-settings-fingerprint"]')
    .first()
    .getAttribute("content")
    .catch(() => "");

  const fingerprint = parseFingerprint(fingerprintRaw || "");
  const signInLinks = page.locator('a[href*="/signin"], a[href*="/access/login"]');
  const submitRequestLinks = page.locator('a[href*="/requests/new"]');

  const signInCount = await signInLinks.count();
  const submitCount = await submitRequestLinks.count();

  const hideSignIn = fingerprint.hide_sign_in_link === "1";
  const showSubmit = fingerprint.show_submit_a_request_link === "1";

  const signInPassed = hideSignIn ? signInCount === 0 : signInCount > 0;
  const submitPassed = showSubmit ? submitCount > 0 : submitCount === 0;

  const checks = [
    {
      id: "toggle-hide-sign-in-link",
      expected: hideSignIn ? "sign-in hidden" : "sign-in visible",
      actual: signInCount > 0 ? "sign-in visible" : "sign-in hidden",
      passed: signInPassed,
    },
    {
      id: "toggle-show-submit-request-link",
      expected: showSubmit ? "submit-request visible" : "submit-request hidden",
      actual: submitCount > 0 ? "submit-request visible" : "submit-request hidden",
      passed: submitPassed,
    },
  ];

  if (checks.some((check) => !check.passed)) {
    let screenshotPath = null;
    try {
      screenshotPath = await captureFailureScreenshot(page, screenshotDir, "toggle-checks");
    } catch {
      screenshotPath = null;
    }

    for (const check of checks) {
      if (!check.passed) {
        check.screenshotPath = screenshotPath;
      }
    }
  }

  return {
    fingerprint,
    checks,
  };
}

async function runSearchJourney(page, baseUrl, searchFlow, screenshotDir, locale) {
  const selector = searchFlow.searchInputSelector || "input[type='search'], input[name='query'], .search input";
  const resultsPathContains = searchFlow.resultsPathContains || "/search";
  const homeUrl = makeAbsolute(baseUrl, `/hc/${locale}`);

  try {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    const input = page.locator(selector).first();
    await input.waitFor({ state: "visible", timeout: 5000 });
    await input.fill("help center test");
    await input.press("Enter");
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const currentUrl = page.url();
    const passed = currentUrl.includes(resultsPathContains);
    const result = {
      id: "journey-search-flow",
      expected: `URL contains ${resultsPathContains}`,
      actual: currentUrl,
      passed,
    };

    if (!result.passed) {
      try {
        result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, result.id);
      } catch {
        result.screenshotPath = null;
      }
    }

    return result;
  } catch (error) {
    const result = {
      id: "journey-search-flow",
      expected: `URL contains ${resultsPathContains}`,
      actual: error instanceof Error ? error.message : String(error),
      passed: false,
    };

    try {
      result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, result.id);
    } catch {
      result.screenshotPath = null;
    }

    return result;
  }
}

async function runBrowseJourney(page, baseUrl, browseFlow, screenshotDir, locale) {
  const categorySelector = browseFlow.categoryLinkSelector || "a[href*='/categories/'], a[href*='/sections/']";
  const sectionSelector = browseFlow.sectionLinkSelector || "a[href*='/sections/']";
  const articleSelector = browseFlow.articleLinkSelector || "a[href*='/articles/']";
  const homeUrl = makeAbsolute(baseUrl, `/hc/${locale}`);

  try {
    await page.goto(homeUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    const category = page.locator(categorySelector).first();
    await category.waitFor({ state: "visible", timeout: 7000 });
    await category.click();
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 });

    const section = page.locator(sectionSelector).first();
    if (await section.count()) {
      await section.first().click();
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
    }

    const article = page.locator(articleSelector).first();
    if (await article.count()) {
      await article.first().click();
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 });
    }

    const currentUrl = page.url();
    const passed = /\/hc\/[a-z]{2}-[a-z]{2}\/(categories|sections|articles)\//i.test(currentUrl);
    const result = {
      id: "journey-browse-category-section-article",
      expected: "navigate to category/section/article route",
      actual: currentUrl,
      passed,
    };

    if (!result.passed) {
      try {
        result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, result.id);
      } catch {
        result.screenshotPath = null;
      }
    }

    return result;
  } catch (error) {
    const result = {
      id: "journey-browse-category-section-article",
      expected: "navigate to category/section/article route",
      actual: error instanceof Error ? error.message : String(error),
      passed: false,
    };

    try {
      result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, result.id);
    } catch {
      result.screenshotPath = null;
    }

    return result;
  }
}

async function runPathJourney(page, baseUrl, journeyId, targetPath, screenshotDir) {
  const url = makeAbsolute(baseUrl, targetPath);
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    const status = response ? response.status() : 0;
    const currentUrl = page.url();
    const passed = (status >= 200 && status < 400) || isAuthLikeStatus(status);
    const result = {
      id: journeyId,
      expected: `reachable path ${targetPath}`,
      actual: `${status} ${currentUrl}`,
      passed,
    };

    if (!result.passed) {
      try {
        result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, result.id);
      } catch {
        result.screenshotPath = null;
      }
    }

    return result;
  } catch (error) {
    const result = {
      id: journeyId,
      expected: `reachable path ${targetPath}`,
      actual: error instanceof Error ? error.message : String(error),
      passed: false,
    };

    try {
      result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, result.id);
    } catch {
      result.screenshotPath = null;
    }

    return result;
  }
}

async function runJourneyChecks(page, baseUrl, journeys = {}, screenshotDir, locale) {
  const checks = [];

  if (journeys.searchFlow?.enabled) {
    checks.push(await runSearchJourney(page, baseUrl, journeys.searchFlow, screenshotDir, locale));
  }

  if (journeys.browseFlow?.enabled) {
    checks.push(await runBrowseJourney(page, baseUrl, journeys.browseFlow, screenshotDir, locale));
  }

  if (journeys.signInFlow?.enabled) {
    const signInPath = localizeHelpCenterPath(journeys.signInFlow.signInPath || "/hc/en-us/signin", locale);
    checks.push(await runPathJourney(page, baseUrl, "journey-sign-in-route", signInPath, screenshotDir));
  }

  if (journeys.submitRequestFlow?.enabled) {
    const submitPath = localizeHelpCenterPath(journeys.submitRequestFlow.submitRequestPath || "/hc/en-us/requests/new", locale);
    checks.push(await runPathJourney(page, baseUrl, "journey-submit-request-route", submitPath, screenshotDir));
  }

  return checks;
}

function summarize(routeChecks, toggleChecks, journeyChecks) {
  const totalRoutes = routeChecks.length;
  const passedRoutes = routeChecks.filter((x) => x.passed).length;
  const failedRoutes = totalRoutes - passedRoutes;

  const totalToggle = toggleChecks.length;
  const passedToggle = toggleChecks.filter((x) => x.passed).length;
  const failedToggle = totalToggle - passedToggle;

  const totalJourney = journeyChecks.length;
  const passedJourney = journeyChecks.filter((x) => x.passed).length;
  const failedJourney = totalJourney - passedJourney;

  return {
    total: totalRoutes + totalToggle + totalJourney,
    passed: passedRoutes + passedToggle + passedJourney,
    failed: failedRoutes + failedToggle + failedJourney,
    routeCoverage: {
      total: totalRoutes,
      passed: passedRoutes,
      failed: failedRoutes,
    },
    toggleCoverage: {
      total: totalToggle,
      passed: passedToggle,
      failed: failedToggle,
    },
    journeyCoverage: {
      total: totalJourney,
      passed: passedJourney,
      failed: failedJourney,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const targetName = args["target-name"] || process.env.TEST_TARGET_NAME || "default";
  const profileName = args.profile || process.env.TEST_PROFILE || "default-preview";
  const baseUrl = normalizeBaseUrl(args["base-url"] || process.env.TEST_BASE_URL || "");
  const scenariosPath = args["scenarios-file"] || path.join(process.cwd(), "tooling/qa/playwright-scenarios.json");
  const outputPath = args.output || path.join(process.cwd(), "tooling/reports/playwright-functional-tests.json");
  const screenshotDir = args["screenshot-dir"] || process.env.TEST_SCREENSHOTS_DIR || path.join(path.dirname(outputPath), "screenshots", `${targetName}-functional`);

  if (!baseUrl) {
    throw new Error("Missing base URL. Set --base-url or TEST_BASE_URL.");
  }

  const locale = detectHelpCenterLocale(baseUrl);

  const scenarios = JSON.parse(await fs.readFile(scenariosPath, "utf8"));
  const { selectedProfile, config } = getProfileConfig(scenarios, profileName);
  const requiredRoutes = Array.isArray(config.requiredRoutes)
    ? config.requiredRoutes.map((route) => localizeHelpCenterPath(route, locale))
    : [];
  const optionalRoutes = Array.isArray(config.optionalRoutes)
    ? config.optionalRoutes.map((route) => localizeHelpCenterPath(route, locale))
    : [];
  const strictOptionalRoutes = Boolean(config.strictOptionalRoutes);
  const detectChallenge = Boolean(config.detectAccessChallenge);
  const failOnChallenge = config.failOnChallenge !== false;
  const challengeTitlePatterns = Array.isArray(config.challengeTitlePatterns) ? config.challengeTitlePatterns : [];
  const journeys = config.e2eJourneys || {};
  const maxCrawlPages = Number(config.maxCrawlPages || 40);
  const minCrawledRoutes = Number(config.minCrawledRoutes || 0);
  const crawlPathPrefix = localizeHelpCenterPath(config.crawlPathPrefix || "/hc/", locale);
  const headless = (process.env.PLAYWRIGHT_HEADLESS || "true").toLowerCase() !== "false";

  if (requiredRoutes.length === 0) {
    throw new Error("No requiredRoutes configured for Playwright functional tests.");
  }

  await fs.mkdir(screenshotDir, { recursive: true });

  const browser = await chromium.launch({ headless });
  const storageStatePath = process.env.PLAYWRIGHT_STORAGE_STATE_PATH || "";
  const contextOptions = {};
  if (storageStatePath) {
    contextOptions.storageState = storageStatePath;
  }
  const context = await browser.newContext(contextOptions);
  const extraHeaders = buildExtraHttpHeaders();
  if (Object.keys(extraHeaders).length > 0) {
    await context.setExtraHTTPHeaders(extraHeaders);
  }

  const cookieHeader = process.env.TEST_COOKIE_HEADER || "";
  if (cookieHeader) {
    const cookies = cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((pair) => {
        const idx = pair.indexOf("=");
        if (idx === -1) return null;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (!name) return null;
        return {
          name,
          value,
          domain: new URL(baseUrl).hostname,
          path: "/",
          httpOnly: false,
          secure: true,
          sameSite: "Lax",
        };
      })
      .filter(Boolean);
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }
  }
  const page = await context.newPage();

  let initialChallenge = null;
  if (detectChallenge) {
    await page.goto(makeAbsolute(baseUrl, `/hc/${locale}`), { waitUntil: "domcontentloaded", timeout: 30000 });
    initialChallenge = await detectAccessChallenge(page, challengeTitlePatterns);
  }

  const routeChecks = [];

  for (const route of requiredRoutes) {
    routeChecks.push(await runRouteCheck(page, baseUrl, route, true, screenshotDir));
  }

  for (const route of optionalRoutes) {
    routeChecks.push(await runRouteCheck(page, baseUrl, route, strictOptionalRoutes, screenshotDir));
  }

  let crawledRoutes = [];
  let toggle = { fingerprint: {}, checks: [] };
  let journeyChecks = [];

  const blockedByChallenge = Boolean(initialChallenge?.challengeDetected && failOnChallenge);
  if (!blockedByChallenge) {
    crawledRoutes = await collectCrawlRoutes(page, baseUrl, crawlPathPrefix, maxCrawlPages, `/hc/${locale}`);
    const seen = new Set(routeChecks.map((r) => r.route));
    for (const route of crawledRoutes) {
      if (seen.has(route)) continue;
      routeChecks.push(await runRouteCheck(page, baseUrl, route, false, screenshotDir));
    }

    toggle = await evaluateToggleChecks(page, baseUrl, screenshotDir, locale);
    journeyChecks = await runJourneyChecks(page, baseUrl, journeys, screenshotDir, locale);
  } else {
    let challengeScreenshotPath = null;
    try {
      challengeScreenshotPath = await captureFailureScreenshot(page, screenshotDir, "blocked-by-challenge");
    } catch {
      challengeScreenshotPath = null;
    }
    journeyChecks = [
      {
        id: "journey-checks-skipped-due-to-challenge",
        expected: "real user flows executable",
        actual: "skipped due to WAF/bot challenge page",
        passed: false,
        screenshotPath: challengeScreenshotPath,
      },
    ];
  }

  let accessChallengeCheck = null;
  if (detectChallenge) {
    const challenge = initialChallenge || (await detectAccessChallenge(page, challengeTitlePatterns));
    accessChallengeCheck = {
      id: "access-challenge-detection",
      expected: "no WAF/bot challenge page",
      actual: challenge.challengeDetected
        ? `challenge detected (${challenge.matchedPatterns.join(", ") || challenge.title})`
        : "no challenge detected",
      passed: !challenge.challengeDetected,
    };
    if (challenge.challengeDetected) {
      try {
        accessChallengeCheck.screenshotPath = await captureFailureScreenshot(page, screenshotDir, accessChallengeCheck.id);
      } catch {
        accessChallengeCheck.screenshotPath = null;
      }
    }
  }
  await browser.close();

  const crawlCoveragePassed = minCrawledRoutes <= 0 || crawledRoutes.length >= minCrawledRoutes;
  const crawlCoverageCheck = {
    id: "crawl-coverage-minimum",
    expected: `at least ${minCrawledRoutes} crawled routes`,
    actual: blockedByChallenge ? "skipped due to challenge" : `${crawledRoutes.length} crawled routes`,
    passed: blockedByChallenge ? false : crawlCoveragePassed,
  };

  const toggleChecks = [...toggle.checks, crawlCoverageCheck];
  if (accessChallengeCheck) {
    toggleChecks.push(accessChallengeCheck);
  }
  const summary = summarize(routeChecks, toggleChecks, journeyChecks);
  const payload = {
    generatedAt: new Date().toISOString(),
    targetName,
    profile: selectedProfile,
    baseUrl,
    locale,
    blockedByChallenge,
    summary,
    fingerprint: toggle.fingerprint,
    toggleChecks,
    journeyChecks,
    routeChecks,
    crawlSummary: {
      strictOptionalRoutes,
      maxCrawlPages,
      minCrawledRoutes,
      discoveredRoutes: crawledRoutes.length,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Playwright functional tests complete for ${targetName}. Passed ${summary.passed}/${summary.total}.`);
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Playwright functional tests failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
