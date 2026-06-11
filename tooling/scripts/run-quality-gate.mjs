#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

function parseTargets() {
  if (process.env.TEST_TARGETS_JSON) {
    const parsed = JSON.parse(process.env.TEST_TARGETS_JSON);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("TEST_TARGETS_JSON must be a non-empty array.");
    }
    return parsed;
  }

  const baseUrl = process.env.TEST_BASE_URL;
  if (!baseUrl) {
    throw new Error("Missing TEST_BASE_URL or TEST_TARGETS_JSON for quality gate.");
  }
  return [{ name: process.env.TEST_TARGET_NAME || "default", baseUrl }];
}

function runNodeScript(scriptPath, args = [], env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const targets = parseTargets();
  const runId = process.env.CI_PIPELINE_ID || new Date().toISOString().replace(/[:.]/g, "-");
  const reportRoot = path.join(process.cwd(), "tooling/reports", String(runId));
  await fs.mkdir(reportRoot, { recursive: true });

  const allReports = [];
  let overallFailed = false;

  for (const target of targets) {
    const targetName = target.name;
    const baseUrl = target.baseUrl;
    const envName = target.environment || targetName;
    const profileName = target.playwrightProfile || envName;

    const deploymentReportPath = path.join(reportRoot, `${targetName}-deployment.json`);
    const functionalReportPath = path.join(reportRoot, `${targetName}-functional-playwright.json`);
    const performanceReportPath = path.join(reportRoot, `${targetName}-performance.json`);
    const qualityReportPath = path.join(reportRoot, `${targetName}-quality-gate.json`);

    const deploymentRun = await runNodeScript(path.join(process.cwd(), "tooling/scripts/run-deployment-tests.mjs"), [
      "--target-name", targetName,
      "--base-url", baseUrl,
      "--output", deploymentReportPath,
    ]);

    const performanceRun = await runNodeScript(path.join(process.cwd(), "tooling/scripts/run-performance-tests.mjs"), [
      "--target-name", targetName,
      "--base-url", baseUrl,
      "--output", performanceReportPath,
    ]);

    const functionalRun = await runNodeScript(path.join(process.cwd(), "tooling/scripts/run-playwright-functional-tests.mjs"), [
      "--target-name", targetName,
      "--base-url", baseUrl,
      "--profile", profileName,
      "--output", functionalReportPath,
    ]);

    const deployment = await readJson(deploymentReportPath);
    const functional = await readJson(functionalReportPath);
    const performance = await readJson(performanceReportPath);

    const failed =
      deployment.summary.failed > 0 ||
      functional.summary.failed > 0 ||
      performance.summary.failed > 0 ||
      deploymentRun.code !== 0 ||
      functionalRun.code !== 0 ||
      performanceRun.code !== 0;
    if (failed) overallFailed = true;

    const quality = {
      generatedAt: new Date().toISOString(),
      environmentName: envName,
      targetName,
      baseUrl,
      branch: process.env.CI_COMMIT_BRANCH || process.env.GIT_BRANCH || "local",
      commit: process.env.CI_COMMIT_SHA || "local",
      pipelineUrl: process.env.CI_PIPELINE_URL || "",
      failed,
      quality: {
        deployment,
        functional,
        performance,
      },
      logs: {
        deployment: {
          code: deploymentRun.code,
          stdout: deploymentRun.stdout,
          stderr: deploymentRun.stderr,
        },
        functional: {
          code: functionalRun.code,
          stdout: functionalRun.stdout,
          stderr: functionalRun.stderr,
        },
        performance: {
          code: performanceRun.code,
          stdout: performanceRun.stdout,
          stderr: performanceRun.stderr,
        },
      },
    };

    await fs.writeFile(qualityReportPath, `${JSON.stringify(quality, null, 2)}\n`, "utf8");

    const publishRun = await runNodeScript(path.join(process.cwd(), "tooling/scripts/publish-confluence-report.mjs"), [
      "--report-file", qualityReportPath,
      "--output", path.join(reportRoot, `${targetName}-confluence-result.json`),
    ]);

    if (publishRun.code !== 0) {
      overallFailed = true;
      quality.failed = true;
      quality.confluencePublish = {
        code: publishRun.code,
        stdout: publishRun.stdout,
        stderr: publishRun.stderr,
      };
      await fs.writeFile(qualityReportPath, `${JSON.stringify(quality, null, 2)}\n`, "utf8");
    }

    allReports.push(quality);
  }

  const aggregatedPath = path.join(reportRoot, "quality-gate-aggregate.json");
  await fs.writeFile(
    aggregatedPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), reports: allReports, overallFailed }, null, 2)}\n`,
    "utf8",
  );

  console.log(`Quality gate completed. Reports in: ${reportRoot}`);
  if (overallFailed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Quality gate execution failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
