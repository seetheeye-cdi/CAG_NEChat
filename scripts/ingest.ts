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

// 처리 대상 문서 목록 (다운로드 URL은 텍스트 추출용, pdfUrl은 클릭용으로 #page 앵커를 붙여 사용)
const SOURCES: Array<{
  title: string;
  downloadUrl: string; // 실제 PDF 바이너리 URL (Download.do)
  pdfUrlBase: string;  // 클릭용 기본 URL (대부분 Download.do를 사용하고 #page=를 붙임)
}> = [
  {
    title: '제21대 대통령선거 정치관계법 사례예시집',
    downloadUrl: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269351&cbIdx=1129&streFileNm=4bcf0eb5-39ad-4f85-a442-a1926ada3c36.pdf',
    pdfUrlBase: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269351&cbIdx=1129&streFileNm=4bcf0eb5-39ad-4f85-a442-a1926ada3c36.pdf#page='
  },
  {
    title: '제21대 대통령선거 재외선거 위반사례예시집',
    downloadUrl: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269343&cbIdx=1129&streFileNm=b2d27eab-e922-4742-b2d6-f24d54625d40.pdf',
    pdfUrlBase: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269343&cbIdx=1129&streFileNm=b2d27eab-e922-4742-b2d6-f24d54625d40.pdf#page='
  },
  {
    title: '제22대 국회의원선거 학생 등의 선거운동·정당활동 관련 정치관계법 사례 안내',
    downloadUrl: 'https://img.nec.go.kr/common/board/Download.do?bcIdx=226669&cbIdx=1129&streFileNm=0de0f3ad-e2b1-4a8b-b617-0fb4cf41d1de.pdf',
    pdfUrlBase: 'https://img.nec.go.kr/common/board/Download.do?bcIdx=226669&cbIdx=1129&streFileNm=0de0f3ad-e2b1-4a8b-b617-0fb4cf41d1de.pdf#page='
  },
  {
    title: '제21대 대통령선거 정당·(예비)후보자 및 그 후원회의 정치자금 회계실무',
    downloadUrl: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=268777&cbIdx=1129&streFileNm=6cde5cfa-d057-457e-bfbe-655321cb31ac.pdf',
    pdfUrlBase: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=268777&cbIdx=1129&streFileNm=6cde5cfa-d057-457e-bfbe-655321cb31ac.pdf#page='
  }
];

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

async function buildChunksFromSources(): Promise<any> {
  const pdfjs = await loadPdfJs();
  const chunks: Array<{ content: string; metadata: any; index: number }> = [];

  let index = 0;
  for (const src of SOURCES) {
    console.log(`다운로드 중: ${src.title}`);
    const data = await downloadPdfToBuffer(src.downloadUrl);
    const loadingTask = await pdfjs.getDocument({ data });
    const pdfDoc = await loadingTask.promise;

    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const text = await extractPageText(pdfDoc, p);
      if (!text || text.length < 20) continue;
      const firstLine = (text.split('\n').find(l => l.trim().length > 0) || '').slice(0, 60);
      const title = firstLine || `페이지 ${p}`;

      chunks.push({
        content: text,
        metadata: {
          category: '본문',
          title,
          type: 'page',
          page: p,
          fileName: src.title,
          pdfUrl: `${src.pdfUrlBase}${p}`
        },
        index: index++
      });
    }
  }

  const chunksData = {
    metadata: {
      source: 'nec_multi_pdf_pages',
      title: 'NEC 자료 (다중 PDF, 페이지 단위)',
      sources: SOURCES.map(s => ({ title: s.title, pdfUrlBase: s.pdfUrlBase.replace(/#page=$/, '') })),
      totalChunks: chunks.length,
      createdAt: new Date().toISOString(),
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

    console.log('NEC 다중 PDF를 페이지 단위로 처리 중...');
    const chunksData = await buildChunksFromSources();
    await fs.writeFile(outPath, JSON.stringify(chunksData, null, 2), 'utf-8');
    console.log(`완료: ${outPath} (chunks: ${chunksData.chunks.length})`);
  } catch (err) {
    console.error('ingest 실패:', err);
    process.exitCode = 1;
  }
}

main();


