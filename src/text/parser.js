export function parseTextCommand(content) {
  const text = String(content || "").trim();
  const match = text.match(/^bbtsl-([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  return { name: match[1].toLowerCase(), args: parseArgs(match[2] || "") };
}

export function parseArgs(input) {
  const args = { _: [] };
  const tokens = tokenize(input);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = tokens[index + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
      continue;
    }
    const separator = token.indexOf("=");
    if (separator > 0) {
      args[token.slice(0, separator)] = token.slice(separator + 1);
      continue;
    }
    args._.push(token);
  }
  return args;
}

function tokenize(input) {
  const out = [];
  let current = "";
  let quote = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quote) {
      if (char === quote) quote = "";
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        out.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) out.push(current);
  return out;
}
