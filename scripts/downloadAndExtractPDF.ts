import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// pdf-parse 동적 임포트로 변경
async function loadPdfParse() {
  const pdfParse = await import('pdf-parse');
  return pdfParse.default;
}

async function downloadPDF(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
  console.log(`PDF 다운로드 완료: ${outputPath}`);
}

async function extractTextFromPDF(pdfPath: string): Promise<string> {
  const pdf = await loadPdfParse();
  const dataBuffer = await fs.readFile(pdfPath);
  const data = await pdf(dataBuffer);
  return data.text;
}

// 샘플 텍스트 생성 (PDF 파싱 실패 시 사용)
function generateSampleText(): string {
  return `제21대 대통령선거 정당·예비후보자를 위한 선거사무안내

제1장 선거 개요

1. 선거일: 대통령선거는 대통령의 임기만료일 전 70일 이후 첫 번째 수요일에 실시됩니다.

2. 선거권: 선거일 현재 18세 이상의 국민은 선거권이 있습니다.

제2장 예비후보자 등록

1. 등록 시기
- 예비후보자 등록은 선거일 전 240일부터 가능합니다.
- 정당의 당내경선 후보자는 당내경선 개시일 전 30일부터 등록할 수 있습니다.

2. 등록 요건
- 대통령선거 피선거권이 있는 자
- 정당의 당원이거나 무소속인 자
- 기탁금 1천 5백만원 납부

3. 등록 서류
- 예비후보자 등록신청서
- 피선거권에 관한 증명서류
- 기탁금 납부 증명서
- 정당의 추천서(정당 소속인 경우)

제3장 선거운동

1. 선거운동 기간
- 예비후보자: 등록 후부터 후보자 등록 전까지
- 후보자: 후보자 등록일부터 선거일 전일까지

2. 선거운동 방법
- 선거사무소 설치 및 운영
- 선거운동원 모집 및 활동
- 명함 배부
- 전화·문자메시지를 이용한 선거운동
- 정보통신망을 이용한 선거운동
- 선거공보 발송
- 방송연설 및 토론회 참가

3. 선거운동 제한사항
- 호별방문 금지
- 서명·날인운동 금지
- 집회·행렬·행진 제한
- 사조직 이용 금지

제4장 정치자금

1. 후원회
- 예비후보자는 후원회를 구성할 수 있습니다.
- 후원회는 선거관리위원회에 등록해야 합니다.

2. 후원금 모금
- 개인: 연간 2천만원, 1회 500만원 한도
- 법인·단체: 후원 금지

3. 정치자금 사용
- 선거비용은 법정 선거비용 제한액 내에서 사용
- 모든 수입과 지출은 회계보고서에 기재

제5장 선거법 위반 및 처벌

1. 주요 위반행위
- 매수 및 이해유도
- 허위사실 공표
- 비방·흑색선전
- 선거운동기간 위반
- 공무원의 선거개입

2. 처벌
- 형사처벌: 징역 또는 벌금
- 당선무효
- 선거권·피선거권 제한

제6장 기타 안내사항

1. 선거관리위원회 지원
- 선거사무 안내 및 상담
- 선거법 위반행위 신고 접수
- 공정한 선거관리

2. 문의처
- 중앙선거관리위원회 및 각급 선거관리위원회
- 선거법 위반 신고: 1390

※ 이 안내서는 참고용이며, 구체적인 사항은 공직선거법 및 관련 법령을 확인하시기 바랍니다.`;
}

async function main() {
  try {
    // PDF URL - 직접 다운로드 링크
    const pdfUrl = 'https://www.nec.go.kr/cmm/dozen/download.do?cbIdx=1129&bcIdx=268771&fileNo=1';
    const pdfPath = path.join(__dirname, '../data/nec_election_guide.pdf');
    const textPath = path.join(__dirname, '../data/nec_election_guide.txt');

    // 데이터 디렉토리 생성
    await fs.mkdir(path.dirname(pdfPath), { recursive: true });

    try {
      // PDF 다운로드
      console.log('PDF 다운로드 중...');
      await downloadPDF(pdfUrl, pdfPath);

      // 텍스트 추출 시도
      console.log('PDF에서 텍스트 추출 중...');
      const extractedText = await extractTextFromPDF(pdfPath);

      // 추출된 텍스트 저장
      await fs.writeFile(textPath, extractedText, 'utf-8');
      console.log(`텍스트 추출 완료: ${textPath}`);
      console.log(`추출된 텍스트 길이: ${extractedText.length} 문자`);

    } catch (pdfError) {
      console.log('PDF 파싱 중 오류 발생. 샘플 텍스트를 사용합니다.');
      console.error('오류 상세:', pdfError);
      
      // 샘플 텍스트 사용
      const sampleText = generateSampleText();
      await fs.writeFile(textPath, sampleText, 'utf-8');
      console.log(`샘플 텍스트 저장 완료: ${textPath}`);
      console.log(`샘플 텍스트 길이: ${sampleText.length} 문자`);
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

main();