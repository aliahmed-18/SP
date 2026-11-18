export type SourceFile = { id: number; name: string; text: string | null; error: string | null };

/** All the material the AI reads: every readable file, then anything pasted. */
export function sourceText(files: SourceFile[], pasted: string) {
  return [...files.filter((f) => f.text).map((f) => `--- ${f.name} ---\n${f.text}`), pasted.trim()]
    .filter(Boolean)
    .join('\n\n');
}
