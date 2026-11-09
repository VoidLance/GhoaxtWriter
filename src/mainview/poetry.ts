export function insertPoetryParagraph(lines: string[], current: number, start: number, end: number) {
  const line = lines[current];
  const before = line.slice(0, start);
  const after = line.slice(end);
  let inPoetry = false;
  let inFence = false;
  for (let i = 0; i < current; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("```")) inFence = !inFence;
    else if (!inFence && trimmed === "::: poetry") inPoetry = true;
    else if (!inFence && trimmed === ":::") inPoetry = false;
  }
  if (inFence || line.trim().startsWith("```")) return null;
  const next = [...lines];
  if (line.trim() === "::: poetry" && !inPoetry) {
    next.splice(current + 1, 0, "");
    return { lines: next, line: current + 1 };
  }
  if (line.trim() === ":::" && inPoetry) {
    next.splice(current + 1, 0, "::: poetry", "", ":::");
    return { lines: next, line: current + 2 };
  }
  if (inPoetry) {
    next.splice(current, 1, before, after);
    return { lines: next, line: current + 1 };
  }
  next.splice(current, 1, before, "::: poetry", after, ":::");
  return { lines: next, line: current + 2 };
}
