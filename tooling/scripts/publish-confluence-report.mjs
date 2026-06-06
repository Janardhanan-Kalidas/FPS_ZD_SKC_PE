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

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildStatusTableRows(quality) {
  const byType = quality?.deployment?.summary?.byType || {};
  const knownTypes = ["sanity", "functional", "positive", "negative"];
  return knownTypes
    .map((type) => {
      const entry = byType[type] || { total: 0, passed: 0, failed: 0 };
      const status = entry.failed > 0 ? "FAILED" : "PASSED";
      return `<tr><td>${type}</td><td>${entry.total}</td><td>${entry.passed}</td><td>${entry.failed}</td><td>${status}</td></tr>`;
    })
    .join("");
}

function buildFunctionalCoverageRows(quality) {
  const summary = quality?.functional?.summary || {};
  const routeCoverage = summary.routeCoverage || { total: 0, passed: 0, failed: 0 };
  const toggleCoverage = summary.toggleCoverage || { total: 0, passed: 0, failed: 0 };

  return [
    `<tr><td>Route coverage</td><td>${routeCoverage.total}</td><td>${routeCoverage.passed}</td><td>${routeCoverage.failed}</td></tr>`,
    `<tr><td>Toggle checks (sign in / submit request)</td><td>${toggleCoverage.total}</td><td>${toggleCoverage.passed}</td><td>${toggleCoverage.failed}</td></tr>`,
  ].join("");
}

function buildPerformanceRows(quality) {
  const pages = quality?.performance?.pageResults || [];
  return pages
    .map((page) => {
      const status = page.passed ? "PASSED" : "FAILED";
      const m = page.metrics || {};
      return `<tr><td>${htmlEscape(page.pagePath || "")}</td><td>${status}</td><td>${htmlEscape(m.performanceScore ?? "n/a")}</td><td>${htmlEscape(m.lcpMs ?? "n/a")}</td><td>${htmlEscape(m.cls ?? "n/a")}</td><td>${htmlEscape(m.tbtMs ?? "n/a")}</td></tr>`;
    })
    .join("");
}

function buildDefectPlaceholderSection(report, jiraBaseUrl, jiraProjectKey) {
  if (!report.failed) return "";
  const jiraProjectUrl = `${jiraBaseUrl.replace(/\/$/, "")}/browse/${jiraProjectKey}`;
  return `
    <h2>Defect Required Placeholder</h2>
    <p>At least one deployment quality gate failed. Create a Jira defect in project <strong>${htmlEscape(jiraProjectKey)}</strong>.</p>
    <table>
      <tbody>
        <tr><th>Summary</th><td>[Placeholder] Failed deployment tests for ${htmlEscape(report.targetName)} - ${htmlEscape(report.environmentName)}</td></tr>
        <tr><th>Severity</th><td>[Placeholder] Major</td></tr>
        <tr><th>Environment</th><td>${htmlEscape(report.environmentName)}</td></tr>
        <tr><th>Repro Steps</th><td>[Placeholder] Add exact repro steps from pipeline logs and Confluence tables.</td></tr>
        <tr><th>Expected</th><td>[Placeholder] All quality checks pass before deployment.</td></tr>
        <tr><th>Actual</th><td>[Placeholder] One or more checks failed.</td></tr>
        <tr><th>Evidence Links</th><td>[Placeholder] Add pipeline URL and test artifact links.</td></tr>
      </tbody>
    </table>
    <p><a href="${htmlEscape(jiraProjectUrl)}">Open Jira project (${htmlEscape(jiraProjectKey)})</a></p>
  `;
}

function buildCommonMetaTable(report) {
  const metaRows = `
    <tr><th>Environment</th><td>${htmlEscape(report.environmentName)}</td></tr>
    <tr><th>Target Name</th><td>${htmlEscape(report.targetName)}</td></tr>
    <tr><th>Base URL</th><td>${htmlEscape(report.baseUrl)}</td></tr>
    <tr><th>Branch</th><td>${htmlEscape(report.branch || "unknown")}</td></tr>
    <tr><th>Commit</th><td>${htmlEscape(report.commit || "unknown")}</td></tr>
    <tr><th>Pipeline</th><td>${htmlEscape(report.pipelineUrl || "n/a")}</td></tr>
    <tr><th>Generated At</th><td>${htmlEscape(report.generatedAt)}</td></tr>
    <tr><th>Overall Status</th><td>${report.failed ? "FAILED" : "PASSED"}</td></tr>
  `;

  return `<h2>Metadata</h2><table><tbody>${metaRows}</tbody></table>`;
}

function buildFunctionalPageBody(report, jiraBaseUrl, jiraProjectKey) {
  const journeyRows = (report.quality?.functional?.journeyChecks || [])
    .map((check) => `<tr><td>${htmlEscape(check.id || "")}</td><td>${check.passed ? "PASSED" : "FAILED"}</td><td>${htmlEscape(check.expected || "")}</td><td>${htmlEscape(check.actual || "")}</td></tr>`)
    .join("");

  return `
    <h1>Functional Test Results: ${htmlEscape(report.environmentName)}</h1>
    ${buildCommonMetaTable(report)}

    <h2>HTTP Scenario Summary</h2>
    <table>
      <thead><tr><th>Type</th><th>Total</th><th>Passed</th><th>Failed</th><th>Status</th></tr></thead>
      <tbody>${buildStatusTableRows(report.quality)}</tbody>
    </table>

    <h2>Functional Coverage (Playwright)</h2>
    <table>
      <thead><tr><th>Scope</th><th>Total</th><th>Passed</th><th>Failed</th></tr></thead>
      <tbody>${buildFunctionalCoverageRows(report.quality)}</tbody>
    </table>

    <h2>End-To-End User Journeys</h2>
    <table>
      <thead><tr><th>Journey</th><th>Status</th><th>Expected</th><th>Actual</th></tr></thead>
      <tbody>${journeyRows || "<tr><td colspan='4'>No journey checks configured.</td></tr>"}</tbody>
    </table>

    ${buildDefectPlaceholderSection(report, jiraBaseUrl, jiraProjectKey)}
  `;
}

function buildPerformancePageBody(report, jiraBaseUrl, jiraProjectKey) {
  return `
    <h1>Performance Test Results: ${htmlEscape(report.environmentName)}</h1>
    ${buildCommonMetaTable(report)}

    <h2>Performance Summary</h2>
    <table>
      <thead><tr><th>Page</th><th>Status</th><th>Perf Score</th><th>LCP (ms)</th><th>CLS</th><th>TBT (ms)</th></tr></thead>
      <tbody>${buildPerformanceRows(report.quality)}</tbody>
    </table>

    ${buildDefectPlaceholderSection(report, jiraBaseUrl, jiraProjectKey)}
  `;
}

async function createConfluencePage({ baseUrl, email, apiToken, spaceKey, parentPageId, title, bodyHtml }) {
  const endpoint = `${baseUrl.replace(/\/$/, "")}/wiki/rest/api/content`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString("base64");

  const payload = {
    type: "page",
    title,
    ancestors: [{ id: String(parentPageId) }],
    space: { key: spaceKey },
    body: {
      storage: {
        value: bodyHtml,
        representation: "storage",
      },
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Confluence page creation failed (${response.status}): ${text}`);
  }

  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(process.argv);
  const reportPath = args["report-file"] || path.join(process.cwd(), "tooling/reports/quality-gate-report.json");
  const outputPath = args.output || path.join(process.cwd(), "tooling/reports/confluence-publish-result.json");

  const baseUrl = process.env.ATLASSIAN_BASE_URL || "";
  const email = process.env.ATLASSIAN_USER_EMAIL || "";
  const apiToken = process.env.ATLASSIAN_API_TOKEN || "";
  const spaceKey = process.env.CONFLUENCE_SPACE_KEY || "";
  const parentPageId = process.env.CONFLUENCE_PARENT_PAGE_ID || "";
  const jiraBaseUrl = process.env.JIRA_BASE_URL || baseUrl;
  const jiraProjectKey = process.env.JIRA_PROJECT_KEY || "FPSKB";
  const requirePublish = (process.env.REQUIRE_CONFLUENCE_REPORT || "true").toLowerCase() === "true";

  if (!baseUrl || !email || !apiToken || !spaceKey || !parentPageId) {
    const message = "Missing Confluence publishing env vars. Required: ATLASSIAN_BASE_URL, ATLASSIAN_USER_EMAIL, ATLASSIAN_API_TOKEN, CONFLUENCE_SPACE_KEY, CONFLUENCE_PARENT_PAGE_ID.";
    if (requirePublish) {
      throw new Error(message);
    }
    console.warn(message);
    return;
  }

  const reportRaw = await fs.readFile(reportPath, "utf8");
  const report = JSON.parse(reportRaw);
  const timeKey = new Date().toISOString().replace(/[:.]/g, "-");
  const functionalTitle = `[${report.environmentName}] Functional Test Results - ${report.branch || "unknown"} - ${timeKey}`;
  const performanceTitle = `[${report.environmentName}] Performance Test Results - ${report.branch || "unknown"} - ${timeKey}`;

  const functionalBodyHtml = buildFunctionalPageBody(report, jiraBaseUrl, jiraProjectKey);
  const performanceBodyHtml = buildPerformancePageBody(report, jiraBaseUrl, jiraProjectKey);

  const functionalPage = await createConfluencePage({
    baseUrl,
    email,
    apiToken,
    spaceKey,
    parentPageId,
    title: functionalTitle,
    bodyHtml: functionalBodyHtml,
  });

  const performancePage = await createConfluencePage({
    baseUrl,
    email,
    apiToken,
    spaceKey,
    parentPageId,
    title: performanceTitle,
    bodyHtml: performanceBodyHtml,
  });

  const functionalPageUrl = `${baseUrl.replace(/\/$/, "")}/wiki/spaces/${spaceKey}/pages/${functionalPage.id}`;
  const performancePageUrl = `${baseUrl.replace(/\/$/, "")}/wiki/spaces/${spaceKey}/pages/${performancePage.id}`;
  const result = {
    createdAt: new Date().toISOString(),
    functionalPage: {
      pageId: functionalPage.id,
      title: functionalTitle,
      pageUrl: functionalPageUrl,
    },
    performancePage: {
      pageId: performancePage.id,
      title: performanceTitle,
      pageUrl: performancePageUrl,
    },
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Confluence functional page created: ${functionalPageUrl}`);
  console.log(`Confluence performance page created: ${performancePageUrl}`);
}

main().catch((error) => {
  console.error(`Confluence publish failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
