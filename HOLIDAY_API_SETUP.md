# 공휴일 자동 조회 설정

공휴일 자동 조회는 Cloudflare Pages Function이 공공데이터포털의 한국천문연구원 특일정보 API를 호출하는 방식입니다.

1. 공공데이터포털에서 `한국천문연구원_특일 정보` 활용신청
2. Cloudflare Pages의 환경변수 또는 Secret에 `HOLIDAY_API_KEY` 등록
3. 배포 후 일정 예외 설정에서 연도를 선택하고 `자동 불러오기` 클릭

API 키는 브라우저 코드에 포함되지 않습니다. 로컬에서 Function까지 확인하려면 `wrangler pages dev dist`를 사용하고 Wrangler 로컬 환경변수 설정 방식으로 키를 주입합니다.
