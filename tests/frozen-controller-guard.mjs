import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const { parse } = createRequire(import.meta.url)('@babel/parser');

// Syntactic guard, not alias/data-flow analysis: detect direct Object.freeze(this)
// calls (including bracket notation), ignoring comments and string literals.
export function freezesThis(source, filename) {
  const ast = parse(source, { sourceType: 'unambiguous', sourceFilename: filename, plugins: ['typescript', 'jsx'] });
  let found = false;
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (['CallExpression', 'OptionalCallExpression'].includes(node.type)) {
      const callee = node.callee;
      if (['MemberExpression', 'OptionalMemberExpression'].includes(callee?.type)
        && callee.object.type === 'Identifier' && callee.object.name === 'Object'
        && (callee.computed ? callee.property.type === 'StringLiteral' && callee.property.value === 'freeze'
          : callee.property.type === 'Identifier' && callee.property.name === 'freeze')
        && node.arguments[0]?.type === 'ThisExpression') found = true;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  }
  visit(ast);
  return found;
}

export function frozenControllerFiles(directory) {
  const found = [];
  function scan(current, prefix) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = join(current, entry.name);
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) scan(filename, relative);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)
        && freezesThis(readFileSync(filename, 'utf8'), filename)) found.push(relative);
    }
  }
  scan(directory, '');
  return found.sort();
}
