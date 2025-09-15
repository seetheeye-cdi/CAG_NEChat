import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// PDF 링크 정보
const PDF_INFO = {
  fileName: '제21대 대통령선거 정치관계법 사례예시집',
  url: 'https://www.nec.go.kr/common/board/Download.do?bcIdx=269351&cbIdx=1129&streFileNm=4bcf0eb5-39ad-4f85-a442-a1926ada3c36.pdf'
};

// 샘플 정치관계법 사례 데이터
// 주의: 이것은 샘플 데이터입니다. 실제 PDF의 정확한 페이지 번호는 PDF를 직접 확인해야 합니다.
const sampleCases = [
  {
    category: "선거운동",
    title: "SNS를 이용한 선거운동",
    caseNumber: "사례 1",
    content: `
【사례 1】 SNS를 통한 선거운동의 허용 범위

질문: 예비후보자가 페이스북, 인스타그램, 유튜브 등을 통해 선거운동을 할 수 있나요?

답변: 예, 가능합니다. 「공직선거법」 제59조에 따라 선거운동은 법에서 금지하거나 제한하는 경우를 제외하고는 자유롭게 할 수 있습니다. SNS를 통한 선거운동은 특별히 금지되어 있지 않으므로 가능합니다.

다만, 다음 사항에 유의해야 합니다:
1. 허위사실 공표 금지 (제250조)
2. 후보자 비방 금지 (제251조)
3. 선거운동기간 준수 (예비후보자는 등록 후부터 가능)
4. 선거일 투표마감시각까지 선거운동 가능

관련 법조문: 공직선거법 제59조(선거운동의 자유), 제82조의4(정보통신망을 이용한 선거운동)
    `
  },
  {
    category: "선거운동",
    title: "문자메시지 발송",
    caseNumber: "사례 2",
    content: `
【사례 2】 문자메시지를 이용한 선거운동

질문: 예비후보자가 유권자에게 직접 문자메시지를 보낼 수 있나요?

답변: 예비후보자는 직접 문자메시지를 전송할 수 있으나, 다음의 제한사항이 있습니다:

1. 자동동보통신 방법 사용 제한
   - 예비후보자는 컴퓨터 프로그램을 이용한 자동 문자 발송 금지
   - 직접 수동으로 발송하는 것은 가능

2. 전송 시간 제한
   - 오후 11시부터 다음날 오전 8시까지는 전송 금지

3. 수신거부 의사표시
   - 수신자가 수신거부 의사를 표시한 경우 재전송 금지

위반 시 처벌: 3년 이하의 징역 또는 600만원 이하의 벌금

관련 법조문: 공직선거법 제82조의5(전화를 이용한 선거운동)
    `
  },
  {
    category: "정치자금",
    title: "후원금 모금 한도",
    caseNumber: "사례 3",
    content: `
【사례 3】 예비후보자 후원금 모금

질문: 예비후보자가 받을 수 있는 후원금의 한도는 얼마인가요?

답변: 예비후보자 후원회가 모금할 수 있는 후원금 한도는 다음과 같습니다:

1. 개인 후원 한도
   - 1인당 연간 2,000만원 이내
   - 1회 500만원 이내

2. 후원회 모금 한도
   - 대통령선거 예비후보자: 5억원

3. 익명 후원 제한
   - 1회 10만원, 연간 120만원 초과 익명기부 금지

4. 법인・단체 후원 금지
   - 국내외 법인 또는 단체는 후원 불가

주의사항: 
- 모든 후원금은 선거관리위원회에 신고된 후원회 계좌로만 입금
- 현금 직접 수수 금지

관련 법조문: 정치자금법 제11조(후원금의 모금한도), 제12조(후원금 기부의 제한)
    `
  },
  {
    category: "선거법 위반",
    title: "기부행위 제한",
    caseNumber: "사례 4",
    content: `
【사례 4】 예비후보자의 기부행위 제한

질문: 예비후보자가 지역 행사에 찬조금을 낼 수 있나요?

답변: 원칙적으로 금지됩니다. 예비후보자는 기부행위가 엄격히 제한됩니다.

금지되는 기부행위:
1. 금전, 물품, 음식물 제공
2. 각종 행사 찬조・후원
3. 경조사비 제공 (일부 예외 있음)
4. 동창회비, 향우회비 등 각종 회비 납부

예외적으로 허용되는 경우:
1. 평소 친분이 있는 자의 경조사비
   - 결혼: 5만원 이내
   - 장례: 5만원 이내 (화환・화분 포함 10만원)

2. 통상적인 정당활동 관련 회비

위반 시 처벌: 5년 이하의 징역 또는 3천만원 이하의 벌금

관련 법조문: 공직선거법 제113조(기부행위의 제한)
    `
  },
  {
    category: "선거사무소",
    title: "선거사무소 설치",
    caseNumber: "사례 5",
    content: `
【사례 5】 예비후보자 선거사무소 설치

질문: 예비후보자는 선거사무소를 몇 개까지 설치할 수 있나요?

답변: 예비후보자는 선거사무소를 1개만 설치할 수 있습니다.

설치 요건 및 제한:
1. 설치 수: 1개소
2. 설치 시기: 예비후보자 등록 후
3. 설치 장소: 제한 없음 (단, 군사시설 등 특정 장소 제외)

신고 절차:
1. 설치 후 3일 이내에 관할 선거관리위원회에 신고
2. 신고 사항: 소재지, 책임자 성명, 연락처 등

선거사무소 표시:
- "○○○ 예비후보자 선거사무소" 간판 설치 가능
- 현수막 1개 게시 가능

주의사항:
- 선거사무소 외의 유사기관 설치 금지
- 위반 시 2년 이하의 징역 또는 400만원 이하의 벌금

관련 법조문: 공직선거법 제61조(선거사무소의 설치)
    `
  },
  {
    category: "홍보물",
    title: "예비후보자 홍보물",
    caseNumber: "사례 6",
    content: `
【사례 6】 예비후보자 홍보물 제작・배부

질문: 예비후보자가 제작・배부할 수 있는 홍보물은 무엇인가요?

답변: 예비후보자가 사용할 수 있는 홍보물은 다음과 같습니다:

1. 명함
   - 규격: 9cm × 5cm 이내
   - 수량: 제한 없음
   - 배부 방법: 직접 대면하여 배부

2. 선거사무소 현판・현수막
   - 선거사무소에 현판 1개
   - 현수막 1개 (가로 9m × 세로 0.5m 이내)

3. 예비후보자 홍보물 (선관위 확인 필요)
   - 1종 제작 가능
   - 우편발송 또는 신문 삽입 가능

제한사항:
- 선전벽보, 선거공보 등은 후보자 등록 후 가능
- 어깨띠, 표찰 등 착용 금지
- 차량 부착 홍보물 금지

관련 법조문: 공직선거법 제60조의3(예비후보자 홍보물)
    `
  },
  {
    category: "공무원 관련",
    title: "공무원의 선거관여 금지",
    caseNumber: "사례 7",
    content: `
【사례 7】 공무원의 선거 중립 의무

질문: 공무원이 예비후보자를 위해 할 수 있는 활동이 있나요?

답변: 공무원은 선거에서 엄격한 중립 의무가 있어 예비후보자를 위한 활동이 매우 제한됩니다.

금지되는 행위:
1. 선거운동 일체 (SNS 활동 포함)
2. 특정 후보 지지・반대 의사 표시
3. 선거 관련 금품・향응 제공
4. 직권을 이용한 선거 개입
5. 선거 관련 집회・모임 참가

허용되는 행위:
1. 선거권 행사 (투표)
2. 개인적 의견 표명 (단, 공개적 지지 표명 금지)

처벌:
- 선거운동 금지 위반: 3년 이하 징역 또는 600만원 이하 벌금
- 공무원의 지위 이용: 5년 이하 징역
- 징계: 파면, 해임 등

관련 법조문: 공직선거법 제85조(공무원 등의 선거관여 금지), 제86조(선거운동 금지)
    `
  },
  {
    category: "집회・행사",
    title: "선거 관련 집회 개최",
    caseNumber: "사례 8",
    content: `
【사례 8】 예비후보자의 집회・행사 개최

질문: 예비후보자가 유권자를 대상으로 정책설명회를 개최할 수 있나요?

답변: 가능하지만 다음의 제한사항을 준수해야 합니다:

허용되는 집회:
1. 옥내 정책토론회
2. 좌담회, 토론회
3. 정당 주최 집회 참석

금지되는 집회:
1. 5인 이상의 옥외 집회
2. 가두 연설
3. 서명・날인 운동
4. 개인 연설회 (후보자 등록 후 가능)

주의사항:
- 집회 장소에서 음식물 제공 금지
- 교통편의 제공 금지 (정당 제공 차량 예외)
- 금품 제공 절대 금지

위반 시: 2년 이하 징역 또는 400만원 이하 벌금

관련 법조문: 공직선거법 제103조(집회 제한), 제105조(행렬・인사 금지)
    `
  }
];

// 텍스트를 chunk로 분할하는 함수
function createChunksFromCases(cases: typeof sampleCases): Array<{content: string, metadata: any, index: number}> {
  const chunks: Array<{content: string, metadata: any, index: number}> = [];
  let chunkIndex = 0;

  cases.forEach((caseItem) => {
    // 각 사례를 하나의 chunk로 생성
    chunks.push({
      content: caseItem.content.trim(),
      metadata: {
        category: caseItem.category,
        title: caseItem.title,
        type: 'case_study',
        caseNumber: caseItem.caseNumber,
        fileName: PDF_INFO.fileName,
        pdfUrl: PDF_INFO.url,
        note: '샘플 데이터 - 정확한 페이지 번호는 실제 PDF를 확인하세요'
      },
      index: chunkIndex++
    });
  });

  // 카테고리별 요약 chunk 생성
  const categories = [...new Set(cases.map(c => c.category))];
  categories.forEach(category => {
    const categoryCases = cases.filter(c => c.category === category);
    const summaryContent = `
【${category} 관련 주요 사례】

${categoryCases.map(c => `- ${c.title} (${c.caseNumber})`).join('\n')}

이 카테고리에서는 ${category}과 관련된 ${categoryCases.length}개의 주요 사례를 다룹니다.
각 사례는 실제 선거 과정에서 자주 발생하는 상황과 그에 대한 법적 해석을 제공합니다.
    `;

    chunks.push({
      content: summaryContent.trim(),
      metadata: {
        category: category,
        type: 'category_summary',
        fileName: PDF_INFO.fileName,
        pdfUrl: PDF_INFO.url
      },
      index: chunkIndex++
    });
  });

  return chunks;
}

async function main() {
  try {
    const chunksPath = path.join(__dirname, '../data/chunks.json');
    
    // 데이터 디렉토리 생성
    await fs.mkdir(path.dirname(chunksPath), { recursive: true });

    // chunks 생성
    console.log('정치관계법 사례 chunks 생성 중...');
    const chunks = createChunksFromCases(sampleCases);
    console.log(`생성된 chunk 수: ${chunks.length}`);

    // chunks를 JSON으로 저장
    const chunksData = {
      metadata: {
        source: 'sample_election_law_cases',
        title: '제21대 대통령선거 정치관계법 사례예시집 (샘플)',
        totalChunks: chunks.length,
        createdAt: new Date().toISOString(),
        pdfUrl: PDF_INFO.url,
        disclaimer: '이것은 샘플 데이터입니다. 정확한 페이지 번호와 내용은 실제 PDF를 참조하세요.'
      },
      chunks: chunks
    };

    await fs.writeFile(chunksPath, JSON.stringify(chunksData, null, 2), 'utf-8');
    console.log(`Chunks 저장 완료: ${chunksPath}`);

    // 샘플 chunk 출력
    console.log('\n=== 샘플 Chunks ===');
    chunks.slice(0, 3).forEach((chunk) => {
      console.log(`\nChunk ${chunk.index} (${chunk.metadata.type}):`);
      console.log(`카테고리: ${chunk.metadata.category}`);
      if (chunk.metadata.title) console.log(`제목: ${chunk.metadata.title}`);
      if (chunk.metadata.caseNumber) console.log(`사례 번호: ${chunk.metadata.caseNumber}`);
      console.log(`내용 미리보기: ${chunk.content.substring(0, 100)}...`);
      console.log(`길이: ${chunk.content.length} 문자`);
    });

    console.log('\n⚠️  주의: 이것은 샘플 데이터입니다. 정확한 페이지 번호는 실제 PDF를 확인해야 합니다.');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

main();