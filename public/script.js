// DOM 요소
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

// 대화 기록
let chatHistory = [];

// 출처 HTML 생성
function createSourcesHTML(sources) {
    if (!sources || sources.length === 0) return '';
    
    let html = '<div class="sources">';
    html += '<div class="sources-header">📚 참조 자료</div>';
    html += '<div class="sources-list">';
    
    // 동일 링크 중복 제거 + 제목 특수문자 제거
    const seen = new Set();
    sources.forEach((source, idx) => {
        const key = source.pdfUrl || `${source.fileName || ''}-${source.page || ''}-${idx}`;
        if (seen.has(key)) return;
        seen.add(key);
        const caseInfo = source.caseNumber ? `, ${source.caseNumber}` : '';
        const pageInfo = source.page ? `, p.${source.page}` : '';
        const fileInfo = source.fileName || '문서';
        const cleanTitle = (source.page ? `p.${source.page}` : (source.caseNumber || `참조 ${idx + 1}`));
        
        html += `
            <div class="source-item">
                <div class="source-number">[참조 ${idx + 1}]</div>
                <div class="source-content">
                    <div class="source-title">
                        ${source.pdfUrl ? 
                            `<a href="${source.pdfUrl}" target="_blank" class="source-link">
                                ${cleanTitle}
                                <span class="source-info">${fileInfo}${caseInfo}${pageInfo}</span>
                                <span class="source-icon">🔗</span>
                            </a>` : 
                            `${cleanTitle} <span class="source-info">${fileInfo}${caseInfo}${pageInfo}</span>`
                        }
                    </div>
                    <div class="source-category">카테고리: ${source.category}</div>
                    <div class="source-preview">${(source.preview || '').replace(/[\uE000-\uF8FF]/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '')}</div>
                    ${source.note ? `<div class="source-note">⚠️ ${source.note}</div>` : ''}
                </div>
            </div>
        `;
    });
    
    html += '</div></div>';
    return html;
}

// 메시지 추가 함수
function addMessage(content, isUser = false, sources = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'bot'}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // 답변 내용에서 참조 표시를 클릭 가능한 링크로 변환 (동일 출처는 1회만 표시, 나머지는 제거)
    if (!isUser && sources && sources.length > 0) {
        // 전역 특수문자 정리 (PUA, zero-width)
        let processedContent = (content || '').replace(/[\uE000-\uF8FF]/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
        const usedByKey = new Set();
        sources.forEach((source, idx) => {
            if (!source) return;
            const key = source.pdfUrl || `${source.fileName || ''}-${source.page || ''}-${idx}`;
            const caseInfo = source.caseNumber ? `, ${source.caseNumber}` : '';
            const pageInfo = source.page ? `, p.${source.page}` : '';
            const link = source.pdfUrl ? `<a href="${source.pdfUrl}" target="_blank" class="inline-ref">[참조 ${idx + 1} - ${source.fileName || '문서'}${caseInfo || pageInfo}]</a>` : `[참조 ${idx + 1} - ${source.fileName || '문서'}${caseInfo || pageInfo}]`;
            const pattern = new RegExp(`\\[참조 ${idx + 1}[^\\]]*\\]`, 'g');
            let firstDone = false;
            processedContent = processedContent.replace(pattern, () => {
                if (!usedByKey.has(key) && !firstDone) {
                    usedByKey.add(key);
                    firstDone = true;
                    return link;
                }
                // 동일 출처의 추가 표기는 제거
                return '';
            });
        });
        contentDiv.innerHTML = processedContent;
    } else {
        contentDiv.innerHTML = (content || '').replace(/[\uE000-\uF8FF]/g, '').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
    }
    
    // 출처 정보 추가 (봇 메시지에만)
    if (!isUser && sources) {
        contentDiv.innerHTML += createSourcesHTML(sources);
    }
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // 스크롤을 아래로
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 로딩 메시지 표시
function showLoading() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.id = 'loading-message';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = '답변을 생성하고 있습니다<span class="loading"></span>';
    
    loadingDiv.appendChild(contentDiv);
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 로딩 메시지 제거
function hideLoading() {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

// 메시지 전송 함수
async function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;
    
    // 사용자 메시지 추가
    addMessage(message, true);
    
    // 대화 기록에 추가
    chatHistory.push({
        role: 'user',
        parts: [{ text: message }]
    });
    
    // 입력 필드 초기화 및 버튼 비활성화
    userInput.value = '';
    sendButton.disabled = true;
    
    // 로딩 표시
    showLoading();
    
    try {
        // API 호출
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message,
                history: chatHistory
            })
        });
        
        const data = await response.json();
        
        // 로딩 제거
        hideLoading();
        
        if (response.ok) {
            // 봇 응답 추가 (출처 정보 포함)
            addMessage(data.response, false, data.sources);
            
            // 대화 기록에 추가
            chatHistory.push({
                role: 'model',
                parts: [{ text: data.response }]
            });
        } else {
            // 에러 메시지 표시
            addMessage(`오류: ${data.error || '알 수 없는 오류가 발생했습니다.'}`, false);
        }
        
    } catch (error) {
        // 로딩 제거
        hideLoading();
        
        // 에러 메시지 표시
        addMessage(`연결 오류: ${error.message}`, false);
    } finally {
        // 버튼 다시 활성화
        sendButton.disabled = false;
        userInput.focus();
    }
}

// 엔터 키로 전송
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// 전송 버튼 클릭
sendButton.addEventListener('click', sendMessage);

// 페이지 로드 시 입력 필드에 포커스
window.addEventListener('load', () => {
    userInput.focus();
});

// 예제 질문 추가
const exampleQuestions = [
    "SNS로 선거운동을 할 수 있나요?",
    "예비후보자가 받을 수 있는 후원금 한도는?",
    "선거사무소는 몇 개까지 설치할 수 있나요?",
    "공무원도 선거운동을 할 수 있나요?",
    "예비후보자가 할 수 있는 홍보활동은?",
    "선거 관련 집회를 개최할 수 있나요?"
];

// 초기 메시지에 예제 질문 버튼 추가
function addExampleButtons() {
    const examplesDiv = document.createElement('div');
    examplesDiv.style.marginTop = '15px';
    examplesDiv.innerHTML = '<strong>예시 질문:</strong><br>';
    
    exampleQuestions.forEach(question => {
        const button = document.createElement('button');
        button.textContent = question;
        button.style.cssText = `
            margin: 5px;
            padding: 8px 12px;
            background: #f0f0f0;
            border: 1px solid #ddd;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
        `;
        button.onmouseover = () => button.style.background = '#e0e0e0';
        button.onmouseout = () => button.style.background = '#f0f0f0';
        button.onclick = () => {
            userInput.value = question;
            sendMessage();
        };
        examplesDiv.appendChild(button);
    });
    
    const firstBotMessage = document.querySelector('.message.bot .message-content');
    if (firstBotMessage) {
        firstBotMessage.appendChild(examplesDiv);
    }
}

// 페이지 로드 시 예제 버튼 추가
window.addEventListener('load', () => {
    addExampleButtons();
    // 샘플 데이터 안내 제거 (정확한 페이지 인용으로 대체)
});