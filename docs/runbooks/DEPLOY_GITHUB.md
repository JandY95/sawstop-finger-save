# DEPLOY_GITHUB

## 목적
- 운영 배포 경로를 `로컬 wrangler deploy`가 아니라 `Git commit/push -> GitHub Actions -> Cloudflare Workers deploy`로 고정한다.
- 로컬 개발과 운영 배포를 분리한다.
- 이번 단계에서는 수동 배포(`workflow_dispatch`)만 연다.

## 현재 원칙
- 로컬 개발은 `npm run dev:local` 기준으로 유지한다.
- 로컬 검증은 `npm test`와 smoke 스크립트 기준으로 유지한다.
- 운영 배포는 GitHub Actions에서만 수행한다.
- 개발자가 로컬에서 직접 운영 배포를 실행하는 것을 기본 경로로 소개하지 않는다.

## 필요한 GitHub Secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NOTION_TOKEN`
- `NOTION_ACCIDENT_DB_ID`
- `NOTION_ATTACHMENT_DB_ID`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`

## 최초 설정 순서
1. GitHub에 원격 저장소를 만든다.
2. 로컬 저장소에 remote를 연결한다.
3. 기본 브랜치 정책을 정한다.
4. GitHub repository secrets에 필요한 값을 등록한다.
5. `.github/workflows/deploy.yml`이 포함된 커밋을 push한다.
6. GitHub Actions에서 `Deploy Cloudflare Worker` workflow를 수동 실행한다.

## 수동 배포 절차
1. 로컬에서 수정한다.
2. `npm test`로 기본 검증을 통과시킨다.
3. commit 후 GitHub에 push한다.
4. GitHub repository의 Actions 탭으로 이동한다.
5. `Deploy Cloudflare Worker` workflow를 선택한다.
6. `Run workflow`로 수동 실행한다.
7. `npm ci`, `npm run ci`, `npm run deploy:ci`가 모두 성공하는지 확인한다.

## workflow 내용
- checkout
- Node 22 설치
- `npm ci`
- `npm run ci`
- `npm run deploy:ci`

## 로컬 개발과 배포 검증의 차이

### 로컬 개발
- 명령: `npm run dev:local`
- 목적: 기능 개발, 로컬 브라우저 확인, Notion/R2 연동 검증
- 주의: 운영 배포를 대신하지 않는다.

### 원격 preview 확인
- 명령: `npm run dev:remote`
- 목적: 보조 확인
- 주의: Queue 제약과 multipart preview 불안정성 때문에 기본 검증 루트가 아니다.

### 운영 배포
- 실행 주체: GitHub Actions
- 기준: workflow 수동 실행 성공
- 로컬에서 직접 `wrangler deploy`를 운영 경로로 사용하지 않는다.

## 추후 main push 자동 배포 전환 방법
1. `workflow_dispatch` 검증을 충분히 마친다.
2. 배포 브랜치를 `main`으로 잠근다.
3. `deploy.yml`의 `on:`에 `push` 트리거를 추가한다.
4. 필요하면 environment protection rule을 건다.
5. production 승인 절차가 필요하면 GitHub Environment를 사용한다.

## TODO / OPEN ISSUE
- 추가 production env가 필요한지 아직 잠금되지 않았다.
- `main` push 자동 배포 전환 시점은 아직 결정되지 않았다.
- rollback 전략은 아직 문서화되지 않았다.
