import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const contractPath = path.join(root, "documentation", "api-contract.json");
const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
const errors = [];

function routeFile(routePath) {
  const segments = routePath.replace(/^\/api\/v1\//, "").split("/");
  return path.join(root, "src", "app", "api", "v1", ...segments.map((segment) => {
    if (segment.startsWith("{")) return `[${segment.slice(1, -1)}]`;
    return segment;
  }), "route.ts");
}

function collectRoutes(node, found = []) {
  if (!node || typeof node !== "object") return found;
  if (node.method && node.path) found.push(node);
  for (const value of Object.values(node)) collectRoutes(value, found);
  return found;
}

const expectedRoutes = collectRoutes(contract.resources);
for (const route of expectedRoutes) {
  const file = routeFile(route.path);
  if (!fs.existsSync(file)) {
    errors.push(`Missing route file for ${route.method} ${route.path}: ${path.relative(root, file)}`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const method = route.method.toUpperCase();
  if (!new RegExp(`export async function ${method}\\b`).test(source)) {
    errors.push(`Route ${route.method} ${route.path} is missing export async function ${method} in ${path.relative(root, file)}`);
  }
}

const wikiPath = path.join(root, "documentation", "obsidian", "wiki", "architecture.md");
const wiki = fs.readFileSync(wikiPath, "utf8");
if (!wiki.includes("../../api-contract.json")) errors.push("Obsidian architecture page must link the API contract.");
if (!wiki.includes("> Status: Current")) errors.push("Obsidian architecture page must declare its status.");
const rawBriefPath = path.join(root, "documentation", "obsidian", "raw", "product-requirements.md");
const rawBrief = fs.readFileSync(rawBriefPath, "utf8");
for (const requiredPhrase of ["unique five-character plan code", "current month", "24 one-hour boxes", "real-time", "intersection of all members"]) {
  if (!rawBrief.includes(requiredPhrase)) errors.push(`Obsidian raw brief is missing required product phrase: ${requiredPhrase}`);
}
const monitoredLine = wiki.match(/^> Monitored: (.+)$/m)?.[1] ?? "";
for (const monitoredPath of monitoredLine.split(",").map((item) => item.trim()).filter(Boolean)) {
  if (!fs.existsSync(path.join(root, monitoredPath))) errors.push(`Obsidian architecture monitors a missing path: ${monitoredPath}`);
}

const routeRoot = path.join(root, "src", "app", "api", "v1");
function routeFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(full) : entry.name === "route.ts" ? [full] : [];
  });
}
for (const file of routeFiles(routeRoot)) {
  const relative = path.relative(root, file);
  const covered = expectedRoutes.some((route) => path.relative(root, routeFile(route.path)) === relative);
  if (!covered) errors.push(`Route file is not declared in documentation/api-contract.json: ${relative}`);
}

if (errors.length) {
  console.error("Architecture check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Architecture check passed: ${expectedRoutes.length} documented API operations and Obsidian ground truth are aligned.`);
