import path from 'node:path';

// Windows cmd caps a command line at ~8 KB, so large commits must be split
// into several prettier invocations with short relative paths.
const MAX_CHARS = 6000;

function chunk(files) {
  const groups = [];
  let current = [];
  let length = 0;
  for (const file of files) {
    const arg = JSON.stringify(path.relative(process.cwd(), file));
    if (current.length > 0 && length + arg.length + 1 > MAX_CHARS) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(arg);
    length += arg.length + 1;
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

export default {
  '*.{ts,tsx,js,mjs,cjs,json,md,yml,yaml,css}': (files) =>
    chunk(files).map((group) => `prettier --write --ignore-unknown ${group.join(' ')}`),
};
