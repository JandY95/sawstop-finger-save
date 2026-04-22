# OPEN_ISSUES

이 문서는 "지금 당장 코딩하면 위험한 미확정 사항"만 기록한다.
TODO 목록이 아니다.
추측으로 닫지 않고, 확인 후 `DECISIONS_LOCK.md` / `AGENTS.md` / `CODEX_ADMIN_HANDOFF.md` 또는 source 문서에 승격한다.

## 운영 잠금 재분류 2026-04-23

| ID | 운영 잠금 분류 | 상태 | 닫힌 근거 |
| --- | --- | --- | --- |
| OI-001 | live 확인 후 닫기 가능 | resolved | 사고 DB `상태` 옵션을 `접수 / 진행중 / 완료 / 반려`로 확인하고 D-08에 잠금 |
| OI-002 | live 확인 후 닫기 가능 | resolved | 첨부 DB `상태` 옵션을 `현재 / 휴지통 / 영구삭제`로 확인하고 D-09에 잠금 |
| OI-003 | live 확인 후 닫기 가능 | resolved | 첨부 DB `삭제 사유` property/type/options를 확인하고 D-10에 잠금 |
| OI-004 | live 확인 후 닫기 가능 | resolved | 실제 사고 페이지 본문 block 구조를 확인하고 D-11에 잠금 |
| OI-005 | 운영 결정 필요 | resolved | 관리자 인증 정책을 D-12에 잠금 |

### 운영 잠금 완료값

1. 사고 DB `상태`: `접수` / `진행중` / `완료` / `반려`
2. 첨부 DB `상태`: `현재` / `휴지통` / `영구삭제`
3. 첨부 DB `삭제 사유`: property 이름 `삭제 사유`, type `select`, 옵션 `화질 불량` / `기타` / `불필요` / `오업로드` / `중복`
4. 사고 페이지 본문 구조: `Report a Save (Known or Suspected Finger Contact)`부터 `Attachments`까지의 확인된 heading 순서와 마지막 `첨부(선택):` 후 빈 블록 1개
5. 관리자 인증 정책: Cloudflare Workers Secrets `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, 비밀번호 로그인, 서명된 세션 쿠키, 로그인 실패 잠금, 현재 Turnstile 미적용

## OI-001
- 제목: 사고 DB 상태 실제 live status 옵션 전체 목록 확인 필요
- 상태: resolved
- 닫힌 근거: 사고 DB `상태` status 옵션은 `접수 / 진행중 / 완료 / 반려`로 확인되어 `DECISIONS_LOCK.md` D-08과 `DB_SCHEMA_AND_MAPPING.md`에 반영했다.

## OI-002
- 제목: 첨부 DB 상태 실제 live status 옵션 전체 목록 확인 필요
- 상태: resolved
- 닫힌 근거: 첨부 DB `상태` status 옵션은 `현재 / 휴지통 / 영구삭제`로 확인되어 `DECISIONS_LOCK.md` D-09와 `DB_SCHEMA_AND_MAPPING.md`에 반영했다.

## OI-003
- 제목: 첨부 DB 삭제 사유 select 옵션 전체 목록 확인 필요
- 상태: resolved
- 닫힌 근거: 첨부 DB `삭제 사유`는 property 이름 `삭제 사유`, type `select`, 옵션 `화질 불량 / 기타 / 불필요 / 오업로드 / 중복`으로 확인되어 `DECISIONS_LOCK.md` D-10과 `DB_SCHEMA_AND_MAPPING.md`에 반영했다.

## OI-004
- 제목: 사고 페이지 본문 저장 형식의 구체 블록 구조 확정 필요
- 상태: resolved
- 닫힌 근거: 실제 사고 페이지 본문 block 구조가 확인되어 `DECISIONS_LOCK.md` D-11과 `DB_SCHEMA_AND_MAPPING.md`에 반영했다.

## OI-005
- 제목: 관리자 보완 업로드 라우트 인증 / 잠금 방식 확정 필요
- 상태: resolved
- 닫힌 근거: 관리자 인증 정책은 Cloudflare Workers Secrets `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, 비밀번호 로그인, 서명된 세션 쿠키, 로그인 실패 잠금, 현재 Turnstile 미적용으로 결정되어 `DECISIONS_LOCK.md` D-12와 `DB_SCHEMA_AND_MAPPING.md`에 반영했다.
