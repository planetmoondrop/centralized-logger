/**
 * Returns a stack string with dependency and runtime frames removed so logs
 * only show application code (controllers, services, local modules, etc.).
 */
export function filterUserStackTrace(stack: string | undefined): string | undefined {
  if (!stack?.trim()) return undefined;

  const lines = stack.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return undefined;

  const out: string[] = [lines[i]];

  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j];
    if (isDependencyOrRuntimeFrame(line)) continue;
    out.push(line);
  }

  return out.join('\n');
}

function isDependencyOrRuntimeFrame(line: string): boolean {
  if (/node_modules/i.test(line)) return true;
  if (/\(node:[^)]+\)/.test(line) || /\bat node:/.test(line)) return true;
  if (/\(internal\/[^)]*\)/.test(line)) return true;
  if (/\beval at\b/i.test(line)) return true;
  return false;
}
