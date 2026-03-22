import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEP_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const ALLOWED_PREFIXES = ['workspace:', 'link:', 'file:', 'npm:'];
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function findPackageJsonFiles() {
  const files = ['package.json'];
  for (const group of ['apps', 'packages']) {
    const groupPath = path.join(ROOT, group);
    if (!fs.existsSync(groupPath)) {
      continue;
    }
    for (const entry of fs.readdirSync(groupPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const packagePath = path.join(group, entry.name, 'package.json');
      if (fs.existsSync(path.join(ROOT, packagePath))) {
        files.push(packagePath);
      }
    }
  }
  return files;
}

function isAllowedSpec(spec) {
  if (ALLOWED_PREFIXES.some((prefix) => spec.startsWith(prefix))) {
    return true;
  }
  return EXACT_SEMVER.test(spec);
}

const violations = [];
for (const relativeFile of findPackageJsonFiles()) {
  const fullPath = path.join(ROOT, relativeFile);
  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

  for (const field of DEP_FIELDS) {
    const deps = pkg[field] ?? {};
    for (const [name, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') {
        violations.push(`${relativeFile} -> ${field}.${name}: non-string spec`);
        continue;
      }
      if (!isAllowedSpec(spec)) {
        violations.push(`${relativeFile} -> ${field}.${name}: "${spec}" is not exact`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Dependency version policy failed: exact versions are required.');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Dependency version policy passed: all direct dependencies are exact.');
