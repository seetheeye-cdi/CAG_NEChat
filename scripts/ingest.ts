import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// pdfjs-dist (textContent extraction)
// We use dynamic import to avoid ESM/TS bundling quirks when not installed.
async function loadPdfJs() {
  const pdfjsLib = await import('pdfjs-dist');
  // Set workerSrc only if needed (pdfjs 4 doesn't require worker for textContent in Node)
  return (pdfjsLib as any).default || (pdfjsLib as any);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NEC PDF info (제21대 대통령선거 정치관계법 사례예시집 최종)
const PDF_TITLE = '제21대 대통령선거 정치관계법 사례예시집';
const PDF_URL = 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269351&cbIdx=1129&streFileNm=4bcf0eb5-39ad-4f85-a442-a1926ada3c36.pdf';

async function downloadPdfToBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download PDF: ${res.status} ${res.statusText}`);
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  return arr;
}

function normalizeWhitespace(text: string): string {
  // Collapse multiple spaces, normalize line breaks
  return text
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

async function extractPageText(doc: any, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const strings: string[] = [];
  for (const item of content.items as any[]) {
    if (typeof item.str === 'string') {
      strings.push(item.str);
    }
  }
  // Join with line breaks; heuristics: insert newline on big gaps isn't available from textContent items easily.
  const merged = strings.join('\n');
  return normalizeWhitespace(merged);
}

async function buildChunksFromPdf(): Promise<any> {
  const pdfjs = await loadPdfJs();
  const data = await downloadPdfToBuffer(PDF_URL);
  const loadingTask = await pdfjs.getDocument({ data });
  const pdfDoc = await loadingTask.promise;

  const chunks: Array<{ content: string; metadata: any; index: number }> = [];

  // Per-page chunk with accurate clickable link using #page= query
  // Use NEC viewer-independent link: most PDF viewers honor #page=
  const pageLinkBase = `${PDF_URL}#page=`;

  let index = 0;
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const text = await extractPageText(pdfDoc, p);
    // Skip empty pages
    if (!text || text.length < 20) {
      continue;
    }
    // Title heuristic: first non-empty line, else generic
    const firstLine = (text.split('\n').find(l => l.trim().length > 0) || '').slice(0, 60);
    const title = firstLine || `페이지 ${p}`;

    chunks.push({
      content: text,
      metadata: {
        category: '본문',
        title,
        type: 'page',
        page: p,
        fileName: PDF_TITLE,
        pdfUrl: `${pageLinkBase}${p}`
      },
      index: index++
    });
  }

  const chunksData = {
    metadata: {
      source: 'nec_pdf_pages',
      title: `${PDF_TITLE} (페이지 단위)`,
      totalChunks: chunks.length,
      createdAt: new Date().toISOString(),
      pdfUrl: PDF_URL,
      disclaimer: '페이지 단위 추출 텍스트입니다. 도표/이미지는 누락될 수 있습니다.'
    },
    chunks
  };

  return chunksData;
}

async function main() {
  try {
    const outDir = path.join(__dirname, '../data');
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, 'chunks.json');

    console.log('NEC PDF를 페이지 단위로 처리 중...');
    const chunksData = await buildChunksFromPdf();
    await fs.writeFile(outPath, JSON.stringify(chunksData, null, 2), 'utf-8');
    console.log(`완료: ${outPath} (chunks: ${chunksData.chunks.length})`);
  } catch (err) {
    console.error('ingest 실패:', err);
    process.exitCode = 1;
  }
}

main();


