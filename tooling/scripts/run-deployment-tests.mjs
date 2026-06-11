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

function buildScenarioUrl(baseUrl, scenarioPath) {
  if (/^https?:\/\//i.test(scenarioPath)) {
    return scenarioPath;
  }

  const base = new URL(baseUrl);
  if (scenarioPath.startsWith("/hc/")) {
    return `${base.origin}${scenarioPath}`;
  }

  const resolved = new URL(scenarioPath.replace(/^\//, ""), `${normalizeBaseUrl(baseUrl)}/`);
  return resolved.toString();
}

function buildRequestHeaders() {
  const headers = {};

  const cookieHeader = process.env.TEST_COOKIE_HEADER || "";
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

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

function sanitizeFilePart(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function parseCookiePairs(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return null;
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      if (!name) return null;
      return { name, value };
    })
    .filter(Boolean);
}

async function captureFailureScreenshot(page, screenshotDir, checkId) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${stamp}-${sanitizeFilePart(checkId)}.png`;
  const filePath = path.join(screenshotDir, fileName);
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

async function loadScenarios(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.scenarios) || parsed.scenarios.length === 0) {
    throw new Error("No scenarios found in scenarios file.");
  }
  return parsed.scenarios;
}

function evaluateStatus(status, scenario) {
  if (typeof scenario.expectedStatus === "number") {
    return status === scenario.expectedStatus;
  }
  if (Array.isArray(scenario.expectedStatusIn)) {
    return scenario.expectedStatusIn.includes(status);
  }
  if (Array.isArray(scenario.expectedStatusNotIn)) {
    return !scenario.expectedStatusNotIn.includes(status);
  }
  return status >= 200 && status < 400;
}

async function runScenarioWithFetch(baseUrl, scenario) {
  const startedAt = new Date().toISOString();
  const fullUrl = buildScenarioUrl(baseUrl, scenario.path);
  const method = scenario.method || "GET";
  let status = 0;
  let durationMs = 0;
  let body = "";
  let passed = false;
  let error = null;
  const headers = buildRequestHeaders();

  const timerStart = Date.now();
  try {
    const response = await fetch(fullUrl, { method, redirect: "follow", headers });
    status = response.status;
    body = await response.text();
    durationMs = Date.now() - timerStart;

    const statusOk = evaluateStatus(status, scenario);
    const includesOk = (scenario.bodyIncludes || []).every((snippet) => body.includes(snippet));
    const notIncludesOk = (scenario.bodyNotIncludes || []).every((snippet) => !body.includes(snippet));
    passed = statusOk && includesOk && notIncludesOk;

    if (!passed) {
      const reason = [];
      if (!statusOk) reason.push(`unexpected status ${status}`);
      if (!includesOk) reason.push("required content missing");
      if (!notIncludesOk) reason.push("unexpected content found");
      error = reason.join(", ");
    }
  } catch (err) {
    durationMs = Date.now() - timerStart;
    passed = false;
    error = err instanceof Error ? err.message : String(err);
  }

  return {
    ...scenario,
    url: fullUrl,
    method,
    status,
    durationMs,
    startedAt,
    passed,
    error,
  };
}

async function runScenariosWithPlaywright(baseUrl, scenarios, screenshotDir) {
  const results = [];
  const headers = buildRequestHeaders();
  const cookieHeader = process.env.TEST_COOKIE_HEADER || "";
  const headless = (process.env.PLAYWRIGHT_HEADLESS || "true").toLowerCase() !== "false";

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext();
    if (Object.keys(headers).length > 0) {
      await context.setExtraHTTPHeaders(headers);
    }

    const cookies = parseCookiePairs(cookieHeader).map((cookie) => ({
      ...cookie,
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: false,
      secure: true,
      sameSite: "Lax",
    }));
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const page = await context.newPage();

    for (const scenario of scenarios) {
      const startedAt = new Date().toISOString();
      const fullUrl = buildScenarioUrl(baseUrl, scenario.path);
      const method = scenario.method || "GET";
      let status = 0;
      let durationMs = 0;
      let body = "";
      let passed = false;
      let error = null;
      const timerStart = Date.now();

      try {
        if (method.toUpperCase() !== "GET") {
          // Fallback to fetch flow for non-GET methods.
          const fetchResult = await runScenarioWithFetch(baseUrl, scenario);
          results.push(fetchResult);
          continue;
        }

        const response = await page.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
        durationMs = Date.now() - timerStart;
        status = response ? response.status() : 0;
        body = await page.content();

        const statusOk = evaluateStatus(status, scenario);
        const includesOk = (scenario.bodyIncludes || []).every((snippet) => body.includes(snippet));
        const notIncludesOk = (scenario.bodyNotIncludes || []).every((snippet) => !body.includes(snippet));
        passed = statusOk && includesOk && notIncludesOk;

        if (!passed) {
          const reason = [];
          if (!statusOk) reason.push(`unexpected status ${status}`);
          if (!includesOk) reason.push("required content missing");
          if (!notIncludesOk) reason.push("unexpected content found");
          error = reason.join(", ");
        }
      } catch (err) {
        durationMs = Date.now() - timerStart;
        passed = false;
        error = err instanceof Error ? err.message : String(err);
      }

      const result = {
        ...scenario,
        url: fullUrl,
        method,
        status,
        durationMs,
        startedAt,
        passed,
        error,
      };

      if (!result.passed) {
        try {
          result.screenshotPath = await captureFailureScreenshot(page, screenshotDir, scenario.id || scenario.path);
        } catch {
          result.screenshotPath = null;
        }
      }

      results.push(result);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

function summarize(results) {
  const byType = {};
  for (const result of results) {
    const key = result.type || "untyped";
    if (!byType[key]) byType[key] = { total: 0, passed: 0, failed: 0 };
    byType[key].total += 1;
    if (result.passed) byType[key].passed += 1;
    else byType[key].failed += 1;
  }

  const total = results.length;
  const passed = results.filter((x) => x.passed).length;
  const failed = total - passed;

  return {
    total,
    passed,
    failed,
    passRate: total ? Number(((passed / total) * 100).toFixed(2)) : 0,
    byType,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const targetName = args["target-name"] || process.env.TEST_TARGET_NAME || "default";
  const baseUrl = normalizeBaseUrl(args["base-url"] || process.env.TEST_BASE_URL || "");
  const scenariosPath = args["scenarios-file"] || path.join(process.cwd(), "tooling/qa/scenarios.json");
  const outputPath = args.output || path.join(process.cwd(), "tooling/reports/deployment-tests.json");
  const runnerMode = (args.runner || process.env.DEPLOYMENT_TEST_RUNNER || "playwright").toLowerCase();
  const screenshotDir = args["screenshot-dir"] || process.env.TEST_SCREENSHOTS_DIR || path.join(path.dirname(outputPath), "screenshots", `${targetName}-deployment`);

  if (!baseUrl) {
    throw new Error("Missing base URL. Set --base-url or TEST_BASE_URL.");
  }

  const locale = detectHelpCenterLocale(baseUrl);
  const scenarios = (await loadScenarios(scenariosPath)).map((scenario) => ({
    ...scenario,
    path: localizeHelpCenterPath(scenario.path, locale),
  }));
  await fs.mkdir(screenshotDir, { recursive: true });

  const results = runnerMode === "fetch"
    ? await Promise.all(scenarios.map((scenario) => runScenarioWithFetch(baseUrl, scenario)))
    : await runScenariosWithPlaywright(baseUrl, scenarios, screenshotDir);

  const summary = summarize(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    targetName,
    baseUrl,
    locale,
    runnerMode,
    summary,
    results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Deployment tests complete for ${targetName}. Passed ${summary.passed}/${summary.total}.`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Deployment tests failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
