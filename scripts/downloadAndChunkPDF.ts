import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pdf-parse 동적 임포트
async function loadPdfParse() {
  const pdfParse = await import('pdf-parse');
  return pdfParse.default;
}

// 텍스트를 chunk로 분할하는 함수
function createChunks(text: string, chunkSize: number = 1000, overlap: number = 200): Array<{content: string, index: number}> {
  const chunks: Array<{content: string, index: number}> = [];
  const lines = text.split('\n');
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // 현재 chunk에 라인 추가
    if (currentChunk.length + line.length < chunkSize) {
      currentChunk += line + '\n';
    } else {
      // chunk 크기를 초과하면 새로운 chunk 생성
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++
        });
      }
      
      // overlap을 위해 이전 chunk의 마지막 부분을 포함
      const overlapLines = currentChunk.split('\n').slice(-Math.floor(overlap / 50));
      currentChunk = overlapLines.join('\n') + '\n' + line + '\n';
    }
  }
  
  // 마지막 chunk 추가
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex
    });
  }
  
  return chunks;
}

async function downloadPDF(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  console.log(`PDF 다운로드 완료: ${outputPath}`);
}

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  try {
    const pdf = await loadPdfParse();
    const dataBuffer = await fs.readFile(pdfPath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    console.error('PDF 파싱 오류:', error);
    throw error;
  }
}

async function main() {
  try {
    // PDF URL
    const pdfUrl = 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269351&cbIdx=1129&streFileNm=4bcf0eb5-39ad-4f85-a442-a1926ada3c36.pdf';
    const pdfPath = path.join(__dirname, '../data/election_law_cases.pdf');
    const chunksPath = path.join(__dirname, '../data/chunks.json');
    const fullTextPath = path.join(__dirname, '../data/election_law_cases_full.txt');

    // 데이터 디렉토리 생성
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });

    // PDF 다운로드
    console.log('PDF 다운로드 중...');
    await downloadPDF(pdfUrl, pdfPath);

    // 텍스트 추출
    console.log('PDF에서 텍스트 추출 중...');
    const extractedText = await extractTextFromPDF(pdfPath);
    
    // 전체 텍스트 저장
    await fs.writeFile(fullTextPath, extractedText, 'utf-8');
    console.log(`전체 텍스트 저장 완료: ${fullTextPath}`);
    console.log(`추출된 텍스트 길이: ${extractedText.length} 문자`);

    // 텍스트를 chunk로 분할
    console.log('텍스트를 chunk로 분할 중...');
    const chunks = createChunks(extractedText, 1500, 300);
    console.log(`생성된 chunk 수: ${chunks.length}`);

    // chunks를 JSON으로 저장
    const chunksData = {
      metadata: {
        source: 'election_law_cases.pdf',
        title: '제21대 대통령선거 정치관계법 사례예시집',
        totalChunks: chunks.length,
        createdAt: new Date().toISOString()
      },
      chunks: chunks
    };

    await fs.writeFile(chunksPath, JSON.stringify(chunksData, null, 2), 'utf-8');
    console.log(`Chunks 저장 완료: ${chunksPath}`);

    // 샘플 chunk 출력
    console.log('\n=== 샘플 Chunk (첫 3개) ===');
    chunks.slice(0, 3).forEach((chunk, idx) => {
      console.log(`\nChunk ${idx}:`);
      console.log(chunk.content.substring(0, 200) + '...');
      console.log(`길이: ${chunk.content.length} 문자`);
    });

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

main();
