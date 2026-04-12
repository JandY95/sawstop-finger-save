# CURRENT_PLAN

## 현재 완료 상태
- 고객 접수, 본문 저장, 첨부 tmp 업로드, queue, consumer 흐름이 동작한다.
- 첨부 DB row 생성, 사고건 relation 연결, 표시 순서 증가, `손가락 사진 있음` 재계산이 동작한다.
- 관리자 검색 API와 관리자 업로드 API가 동작한다.
- 관리자 업로드 후 R2 final 저장, 첨부 DB row 생성, `첨부 업로드 상태` write-back, `손가락 사진 있음` 재계산이 동작한다.
- 관리자 인증과 최소 브라우저 UI가 추가되어 있다.

## 현재 배포 구조 상태
- 배포 구조는 GitHub-first 전환 중이다.
- 로컬 개발 기본 루트는 `npm run dev:local`이다.
- `dev:remote`는 Queue 제약과 preview 불안정성 때문에 기본 검증 루트가 아니다.
- 배포 루트는 앞으로 GitHub Actions 수동 배포를 기준으로 유지한다.

## 이번 배치 반영 내용
- GitHub Actions 기반 Cloudflare Workers 수동 배포 워크플로를 추가한다.
- `package.json`에 CI/배포 스크립트를 정리한다.
- GitHub-first 배포 runbook을 추가한다.

## 다음 배치 후보
- GitHub repository remote 연결 및 첫 커밋 정리
- GitHub Secrets 실제 주입
- `workflow_dispatch` 검증 후 `main` push 자동 배포 전환 여부 결정
- 관리자 로그인 방어선 보강
