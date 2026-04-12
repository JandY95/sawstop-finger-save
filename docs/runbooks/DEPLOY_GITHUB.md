# DEPLOY_GITHUB

## 목적
- 운영 배포는 로컬 `wrangler deploy`가 아니라 GitHub Actions 기준으로 진행한다.
- 현재 배포 기준은 `workflow_dispatch` 수동 실행이다.
- Actions 안에서 `npm run ci` 실행 후 `npm run deploy:ci`를 실행한다.

## 현재 배포 기준
1. 변경사항을 commit 후 GitHub에 push한다.
2. GitHub Actions에서 `Deploy Cloudflare Worker` workflow를 수동 실행한다.
3. workflow 안에서 `npm ci` -> `npm run ci` -> `npm run deploy:ci` 순서로 진행한다.

## 필요 GitHub Secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NOTION_TOKEN`
- `NOTION_ACCIDENT_DB_ID`
- `NOTION_ATTACHMENT_DB_ID`
- `NOTION_SETTINGS_DB_ID`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

## 배포 후 확인 항목
- GitHub Actions workflow가 성공 상태인지 확인
- Worker 기본 URL 응답 확인
- `/admin` 접속 확인
- 관리자 검색에서 완료건 제외가 반영되는지 확인
- 관리자 업로드 후 Notion 첨부 row 생성 여부 확인
- 관리자 업로드 후 `첨부 최종 확인 완료=false` reset 반영 확인
- 휴지통 이동 후 `첨부 최종 확인 완료=false` reset 반영 확인
- 복구 후 `첨부 최종 확인 완료=false` reset 반영 확인
- consumer 처리 후 `첨부 최종 확인 완료=false` reset 반영 확인
- 관리자 업로드 후 Cloudflare R2 객체 생성 여부 확인

## 비고
- `wrangler.toml` 실제 값은 이번 단계에서 변경하지 않는다.
- 자동 배포(`push` 트리거)는 아직 활성화하지 않는다.
