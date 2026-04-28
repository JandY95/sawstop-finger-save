# DEV_TEST

## 목적
- 로컬 개발 모드와 원격 검증 모드를 혼동하지 않도록 실행 기준을 고정한다.
- 관리자 업로드 경로의 실검증 절차를 한 번에 재현할 수 있게 한다.

## 실행 모드

### 로컬 개발
- 명령: `npm run dev:local`
- 현재 `wrangler.toml`에서 `ATTACHMENT_BUCKET`은 `remote = true`다.
- 의미:
  - Worker 코드는 로컬 `wrangler dev`
  - R2는 실제 원격 `sawstop-attachments`
  - Queue는 local binding
- 관리자 업로드 실검증은 이 모드를 기본으로 사용한다.

### 원격 검증
- 명령: `npm run dev:remote`
- 의미:
  - Worker preview 자체를 원격으로 실행
  - 현재 Wrangler 경고 기준으로 Queue는 완전 지원 대상이 아니다
- 주의:
  - customer `/submit` + queue + consumer 전체 검증 모드로 간주하지 않는다
  - 관리자 multipart 업로드는 preview 재시작/503 이슈가 있을 수 있으므로 보조 확인용으로만 사용한다

## 원격 R2 확인 명령 예시
Windows PowerShell example uses `npx.cmd`.

- `npx.cmd wrangler r2 object get "sawstop-attachments/attachments/202604121252-5678/0001_1775980881697_finger1.jpg" --remote --file <temp-file-path>`

## 관리자 업로드 실검증 절차 예시
1. `npm run dev:local`
2. 브라우저에서 `http://127.0.0.1:8787/admin` 접속
3. 관리자 로그인
   - 필수 env: `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
4. 검색창에 접수번호 또는 전화번호 일부 입력
5. 결과에서 사고건 선택
6. `attachmentType` 선택
7. 파일 선택 후 업로드
8. 확인 항목
   - 응답 메시지 success
   - Notion 첨부 DB row 생성
   - 사고건 relation 연결
   - 표시 순서 증가
   - `손가락 사진 있음` 재계산
   - 사고건 `첨부 업로드 상태` 갱신
9. 필요 시 원격 R2 객체 직접 확인
   - Windows PowerShell example: `npx.cmd wrangler r2 object get "sawstop-attachments/<R2 Key>" --remote --file <temp-file-path>`

## 기본 검증 명령
- `npm test`
- `npm run smoke:submit`
- `npm run smoke:admin-search`
- `npm run smoke:admin-upload`

## Known Boundaries
- Turnstile is still not wired to admin login and remains open.
- Completed-record exclusion search now follows D-08: use the current admin search path that excludes completed records.
- `dev:remote` multipart preview stability remains pending verification.
