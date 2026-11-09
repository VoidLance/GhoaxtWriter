export type EnterSequence = { value: string; line: number; stage: 1 | 2 };

export function insideSpecialBlock(lines: string[], current: number) {
  let fence = false;
  let poetry = false;
  for (let i = 0; i <= current; i++) {
    const text = lines[i].trim();
    if (text.startsWith("```")) fence = !fence;
    else if (!fence && text === "::: poetry") poetry = true;
    else if (!fence && text === ":::") poetry = false;
    if (i === current && (text.startsWith("```") || text === "::: poetry" || text === ":::")) return true;
  }
  return fence || poetry;
}

export function multiEnter(value: string, line: number, start: number, end: number, sequence: EnterSequence | null) {
  const lines = value.split("\n");
  if (sequence?.value === value && sequence.line === line && start === 0 && end === 0) {
    if (sequence.stage === 1) {
      lines.splice(line, 0, "***");
      const next = lines.join("\n");
      return { kind: "edit" as const, value: next, line: line + 1, sequence: { value: next, line: line + 1, stage: 2 as const } };
    }
    return { kind: "split" as const, before: lines.slice(0, line - 1).join("\n"), after: lines.slice(line).join("\n") };
  }
  const text = lines[line];
  lines.splice(line, 1, text.slice(0, start), text.slice(end));
  const next = lines.join("\n");
  return { kind: "edit" as const, value: next, line: line + 1, sequence: { value: next, line: line + 1, stage: 1 as const } };
}
