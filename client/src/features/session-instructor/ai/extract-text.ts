import { AI_LIMITS } from '@getit/shared';

// Reads slides / notes in the instructor's browser. Files never reach our server; only the text the
// instructor then sends for drafts does (MVP: "Upload slides or notes (PDF, PowerPoint, Word, HTML, text)").

export const ACCEPT = '.pdf,.pptx,.docx,.html,.htm,.txt,.md';
export const ACCEPT_LABEL = 'PDF, PowerPoint, Word, HTML, text · max 60 MB';

export class ExtractError extends Error {}

const INVALID = 'Choose a valid, unprotected PDF, .pptx, .docx, .html, .txt or .md file.';
const OLD_OFFICE = 'Old .doc/.ppt files are not supported. Save as .docx/.pptx or PDF first.';
const EMPTY =
  'No readable text found — these slides may be images. Upload the original .pptx, or export the PDF from PowerPoint with text.';

const ext = (name: string) => name.toLowerCase().split('.').pop() ?? '';

/** Plain text of one file, tidied (one line per paragraph / slide line). */
export async function extractText(file: File): Promise<string> {
  if (file.size > AI_LIMITS.fileSizeMaxMb * 1024 * 1024)
    throw new ExtractError(`Choose a file no larger than ${AI_LIMITS.fileSizeMaxMb} MB.`);
  const e = ext(file.name);
  let text: string;
  try {
    if (e === 'doc' || e === 'ppt') throw new ExtractError(OLD_OFFICE);
    if (e === 'pdf') text = await pdfText(file);
    else if (e === 'pptx') text = await pptxText(file);
    else if (e === 'docx') text = await docxText(file);
    else if (e === 'html' || e === 'htm') text = htmlText(await file.text());
    else if (e === 'txt' || e === 'md') text = await file.text();
    else throw new ExtractError(INVALID);
  } catch (err) {
    if (err instanceof ExtractError) throw err;
    throw new ExtractError(INVALID);
  }
  const tidy = text
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  if (tidy.replace(/\s/g, '').length < 20) throw new ExtractError(EMPTY);
  return tidy;
}

async function pdfText(file: File): Promise<string> {
  // Loaded only when a PDF is chosen (instructor screen only; phones never download it).
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    const lines: string[] = [];
    let line = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      } else line += ' ';
    }
    lines.push(line);
    pages.push(lines.join('\n'));
  }
  await task.destroy();
  return pages.join('\n\n');
}

/** Paragraph texts of an Office XML part (<a:p>/<w:p> containing <a:t>/<w:t>). */
function xmlParagraphs(xml: string, para: string, run: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagName(para)).map((p) =>
    Array.from(p.getElementsByTagName(run))
      .map((t) => t.textContent ?? '')
      .join(''),
  );
}

async function zip(file: File) {
  const { default: JSZip } = await import('jszip');
  return JSZip.loadAsync(await file.arrayBuffer());
}

const slideNumber = (path: string) => Number(/(\d+)\.xml$/.exec(path)?.[1] ?? 0);

type Zip = Awaited<ReturnType<typeof zip>>;

/** Relationship id → target path (resolved against `dir`) from an Office .rels part. */
async function relations(z: Zip, relsPath: string, dir: string): Promise<Map<string, string>> {
  const rels = z.file(relsPath);
  const map = new Map<string, string>();
  if (!rels) return map;
  const doc = new DOMParser().parseFromString(await rels.async('string'), 'application/xml');
  for (const r of Array.from(doc.getElementsByTagName('Relationship'))) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (id && target) map.set(id, resolvePath(dir, target));
  }
  return map;
}

/** "ppt/slides" + "../notesSlides/notesSlide3.xml" → "ppt/notesSlides/notesSlide3.xml". */
function resolvePath(dir: string, target: string) {
  const parts = target.startsWith('/') ? [] : dir.split('/');
  for (const seg of target.replace(/^\//, '').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * Slides in presentation order (presentation.xml), each with its own speaker notes (found through the
 * slide's relationships — notes file numbers don't follow slide numbers after slides are reordered).
 */
async function pptxText(file: File): Promise<string> {
  const z = await zip(file);
  let slides: string[] = [];
  const pres = z.file('ppt/presentation.xml');
  if (pres) {
    const rels = await relations(z, 'ppt/_rels/presentation.xml.rels', 'ppt');
    const doc = new DOMParser().parseFromString(await pres.async('string'), 'application/xml');
    slides = Array.from(doc.getElementsByTagName('p:sldId'))
      .map((el) => rels.get(el.getAttribute('r:id') ?? ''))
      .filter((p): p is string => !!p && !!z.file(p));
  }
  if (slides.length === 0)
    // No usable presentation.xml: fall back to file names.
    slides = Object.keys(z.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => slideNumber(a) - slideNumber(b));
  if (slides.length === 0) throw new ExtractError(INVALID);

  const out: string[] = [];
  let hasText = false;
  for (const [i, p] of slides.entries()) {
    const body = xmlParagraphs(await z.file(p)!.async('string'), 'a:p', 'a:t');
    const name = p.split('/').pop()!;
    const rels = await relations(z, `ppt/slides/_rels/${name}.rels`, 'ppt/slides');
    const notesPath = [...rels.values()].find((t) => t.startsWith('ppt/notesSlides/'));
    const notesFile = notesPath ? z.file(notesPath) : null;
    // Speaker notes often hold the explanation; the slide-number placeholder is noise.
    const note = notesFile
      ? xmlParagraphs(await notesFile.async('string'), 'a:p', 'a:t').filter(
          (t) => t.trim() && !/^\d+$/.test(t.trim()),
        )
      : [];
    if ([...body, ...note].some((t) => t.trim())) hasText = true;
    out.push([`Slide ${i + 1}`, ...body, ...(note.length ? ['Notes:', ...note] : [])].join('\n'));
  }
  // Only "Slide N" labels = the slides are pictures.
  if (!hasText) throw new ExtractError(EMPTY);
  return out.join('\n\n');
}

async function docxText(file: File): Promise<string> {
  const z = await zip(file);
  const main = z.file('word/document.xml');
  if (!main) throw new ExtractError(INVALID);
  return xmlParagraphs(await main.async('string'), 'w:p', 'w:t').join('\n');
}

function htmlText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style, noscript, template').forEach((n) => n.remove());
  // Keep block boundaries as line breaks.
  doc
    .querySelectorAll('p, div, li, br, h1, h2, h3, h4, h5, h6, tr, section, article')
    .forEach((n) => n.append('\n'));
  return doc.body?.textContent ?? '';
}
