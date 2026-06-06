#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

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

function buildPageUrl(baseUrl, pagePath) {
  if (/^https?:\/\//i.test(pagePath)) {
    return pagePath;
  }

  const base = new URL(baseUrl);
  if (pagePath.startsWith("/hc/")) {
    return `${base.origin}${pagePath}`;
  }

  return new URL(pagePath.replace(/^\//, ""), `${normalizeBaseUrl(baseUrl)}/`).toString();
}

function runCommand(command, args, cwd, timeoutMs = 180000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
  });
}

function metricValue(lhr, key) {
  const val = lhr?.audits?.[key]?.numericValue;
  return typeof val === "number" ? Number(val.toFixed(2)) : null;
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

async function detectAccessChallengeUrl(url) {
  try {
    const headers = buildRequestHeaders();
    const response = await fetch(url, { method: "GET", redirect: "follow", headers });
    const text = await response.text();
    const lower = text.toLowerCase();
    const challengeDetected =
      lower.includes("just a moment") ||
      lower.includes("attention required") ||
      lower.includes("verify you are human") ||
      response.status === 403;
    return {
      challengeDetected,
      status: response.status,
    };
  } catch {
    return {
      challengeDetected: false,
      status: 0,
    };
  }
}

function evaluateThresholds(metrics, thresholds) {
  const checks = [
    { name: "performanceScore", value: metrics.performanceScore, limit: thresholds.performanceScore, comparator: "gte" },
    { name: "fcpMs", value: metrics.fcpMs, limit: thresholds.fcpMs, comparator: "lte" },
    { name: "lcpMs", value: metrics.lcpMs, limit: thresholds.lcpMs, comparator: "lte" },
    { name: "cls", value: metrics.cls, limit: thresholds.cls, comparator: "lte" },
    { name: "tbtMs", value: metrics.tbtMs, limit: thresholds.tbtMs, comparator: "lte" },
    { name: "siMs", value: metrics.siMs, limit: thresholds.siMs, comparator: "lte" },
  ];

  return checks.map((check) => {
    if (typeof check.limit !== "number" || typeof check.value !== "number") {
      return { ...check, passed: false, reason: "missing metric or threshold" };
    }
    const passed = check.comparator === "gte" ? check.value >= check.limit : check.value <= check.limit;
    return {
      ...check,
      passed,
      reason: passed ? "ok" : `value ${check.value} violates ${check.comparator} ${check.limit}`,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const targetName = args["target-name"] || process.env.TEST_TARGET_NAME || "default";
  const baseUrl = normalizeBaseUrl(args["base-url"] || process.env.TEST_BASE_URL || "");
  const thresholdsPath = args["thresholds-file"] || path.join(process.cwd(), "tooling/qa/performance-thresholds.json");
  const outputPath = args.output || path.join(process.cwd(), "tooling/reports/performance-tests.json");
  const lighthouseTimeoutMs = Number(args["lighthouse-timeout-ms"] || process.env.LIGHTHOUSE_TIMEOUT_MS || 180000);

  if (!baseUrl) {
    throw new Error("Missing base URL. Set --base-url or TEST_BASE_URL.");
  }

  const raw = await fs.readFile(thresholdsPath, "utf8");
  const config = JSON.parse(raw);
  const pages = Array.isArray(config.pages) ? config.pages : [];
  const thresholds = config.thresholds || {};

  if (pages.length === 0) {
    throw new Error("No pages configured for performance testing.");
  }

  const workDir = path.dirname(outputPath);
  await fs.mkdir(workDir, { recursive: true });

  const pageResults = [];
  for (const pagePath of pages) {
    const safeName = pagePath.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "root";
    const reportFile = path.join(workDir, `lighthouse-${targetName}-${safeName}.json`);
    const url = buildPageUrl(baseUrl, pagePath);

    const challengeProbe = await detectAccessChallengeUrl(url);
    if (challengeProbe.challengeDetected) {
      pageResults.push({
        pagePath,
        url,
        passed: false,
        skippedMetrics: true,
        error: `challenge page detected (status ${challengeProbe.status}); skipping Lighthouse threshold assertions`,
        checks: [
          {
            name: "accessChallenge",
            value: challengeProbe.status,
            limit: "no challenge",
            comparator: "neq",
            passed: false,
            reason: "WAF/bot challenge blocks representative performance measurement",
          },
        ],
      });
      continue;
    }

    const commandArgs = [
      "--yes",
      "lighthouse",
      url,
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
      "--only-categories=performance",
      "--output=json",
      `--output-path=${reportFile}`,
      "--emulated-form-factor=mobile",
      "--throttling-method=simulate",
    ];

    const cmd = await runCommand("npx", commandArgs, process.cwd(), lighthouseTimeoutMs);
    if (cmd.code !== 0) {
      pageResults.push({
        pagePath,
        url,
        passed: false,
        command: `npx ${commandArgs.join(" ")}`,
        error: cmd.timedOut
          ? `lighthouse timeout after ${lighthouseTimeoutMs}ms`
          : cmd.stderr || cmd.stdout || "lighthouse command failed",
      });
      continue;
    }

    const lhrRaw = await fs.readFile(reportFile, "utf8");
    const lhr = JSON.parse(lhrRaw);
    const metrics = {
      performanceScore: Number(((lhr?.categories?.performance?.score || 0) * 100).toFixed(2)),
      fcpMs: metricValue(lhr, "first-contentful-paint"),
      lcpMs: metricValue(lhr, "largest-contentful-paint"),
      cls: metricValue(lhr, "cumulative-layout-shift"),
      tbtMs: metricValue(lhr, "total-blocking-time"),
      siMs: metricValue(lhr, "speed-index"),
    };

    const checks = evaluateThresholds(metrics, thresholds);
    const passed = checks.every((item) => item.passed);

    pageResults.push({
      pagePath,
      url,
      reportFile,
      passed,
      metrics,
      checks,
    });
  }

  const summary = {
    total: pageResults.length,
    passed: pageResults.filter((x) => x.passed).length,
    failed: pageResults.filter((x) => !x.passed).length,
    profile: config.profile || "custom",
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    targetName,
    baseUrl,
    thresholds,
    summary,
    pageResults,
  };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Performance tests complete for ${targetName}. Passed ${summary.passed}/${summary.total}.`);

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Performance tests failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
