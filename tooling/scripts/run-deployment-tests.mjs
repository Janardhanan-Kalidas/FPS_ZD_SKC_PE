#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

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

async function runScenario(baseUrl, scenario) {
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

  if (!baseUrl) {
    throw new Error("Missing base URL. Set --base-url or TEST_BASE_URL.");
  }

  const scenarios = await loadScenarios(scenariosPath);
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(baseUrl, scenario));
  }

  const summary = summarize(results);
  const payload = {
    generatedAt: new Date().toISOString(),
    targetName,
    baseUrl,
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
