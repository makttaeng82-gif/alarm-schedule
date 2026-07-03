# Alarm Schedule

사용자 지정 주간 스케줄표와 브라우저 알람을 제공하는 프론트엔드 앱입니다.

## 실행

```bash
npm install
npm run dev
```

브라우저 주소:

```text
http://127.0.0.1:5173
```

## Cloudflare Pages 배포

Cloudflare Pages 설정값:

```text
Framework preset: React
Production branch: main
Build command: npm run build
Build output directory: dist
```

Cloudflare Pages는 빌드 시 `CF_PAGES=1` 환경 변수를 자동으로 주입합니다. 이 프로젝트는 해당 값이 있으면 Vite `base`를 `/`로 사용합니다.

## 기능

- 요일, 시작 시간, 종료 시간, 일정명 직접 설정
- 일정별 알람 시간, 소리, 색상, 메모 설정
- 주간표와 알람 목록 표시
- 초 단위 현재 시각 표시
- 라이트/다크모드 전환
- 브라우저 알림 권한 요청
- 브라우저 localStorage 저장

## 제한

브라우저가 닫히거나 PC가 절전/종료되면 알람은 보장되지 않습니다.
