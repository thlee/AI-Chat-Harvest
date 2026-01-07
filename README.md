# AI Chat Archiver - Chrome Extension

Gemini와 ChatGPT 대화를 HTML/JSON 형식으로 아카이빙하는 크롬 확장 프로그램입니다.

## 🎯 주요 기능

- ✅ **다중 플랫폼 지원**: Gemini, ChatGPT
- ✅ **HTML/JSON 다운로드**: 대화 내용을 두 가지 형식으로 저장
- ✅ **간편한 추출**: HTML 파일 내에 포함된 JSON 데이터를 쉽게 추출 가능
- ✅ **한글 지원**: 유니코드 파일명 및 내용 완벽 지원
- ✅ **설정 가능**: 소스 페이지 표시, 자동 파일 열기 등 사용자 옵션 제공

## 📦 설치 방법

1. Chrome에서 `chrome://extensions/` 열기
2. 우측 상단 "개발자 모드" 활성화
3. "압축해제된 확장 프로그램을 로드합니다" 버튼 클릭
4. `gemini_archiver` 폴더 선택

## 🚀 사용 방법

1. **대화 저장하기**:
   - Gemini (`gemini.google.com`) 또는 ChatGPT (`chatgpt.com`) 대화 페이지로 이동
   - 브라우저 우측 상단의 확장 프로그램 아이콘 클릭
   - "Archive this page" 버튼 클릭
   - HTML 파일이 자동으로 다운로드됩니다.

2. **JSON 데이터 얻기**:
   - **방법 1 (간편)**: 다운로드된 HTML 파일을 열고 상단의 "Download JSON" 버튼 클릭
   - **방법 2 (개발자)**: HTML 소스 내 `<script id="conversation-data" type="application/json">` 태그 안에 원본 데이터가 들어있습니다.

## 📁 파일 구조

```
gemini_archiver/
├── background.js       # 백그라운드 서비스 워커 (HTML 생성 및 다운로드 처리)
├── content.js          # 웹페이지 스크래핑 로직 (Gemini/ChatGPT DOM 파싱)
├── popup.html/js       # 확장 프로그램 팝업 UI
├── options.html/js     # 사용자 설정 페이지
├── manifest.json       # 확장 프로그램 메타데이터 및 권한 설정
├── style.css           # 공통 스타일시트
├── icon.png            # 아이콘 파일
└── README.md           # 프로젝트 문서
```

## 🔧 기술적 특징

- **안전한 HTML 생성**: Unicode Escaping을 통해 원본 HTML 태그와 스크립트가 깨지지 않고 안전하게 보존됩니다.
- **순수 텍스트 JSON**: 복잡한 인코딩 없이 표준 JSON 방식을 사용하여 데이터 호환성이 뛰어납니다.
- **독립 실행(Standalone)**: 생성된 HTML 파일은 별도의 CSS/JS 파일 없이 그 자체로 완벽하게 동작합니다.

## 📄 라이센스

MIT License
