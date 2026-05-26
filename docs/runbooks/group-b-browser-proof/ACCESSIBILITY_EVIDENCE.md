# Group B Accessibility / DOM Evidence Addendum

Purpose: strengthen the prior screenshot-based Group B proof with machine-readable browser/DOM observations. This addendum remains local browser/read-only evidence only.

## Customer form DOM evidence

- URL: `http://127.0.0.1:8787/`
- Title: `SAWSTOP “Finger Save” 사례 접수`
- Major headings observed:
  - `SAWSTOP “Finger Save” 사례 접수`
  - `1. 연락받으실 정보`
  - `2. 사고가 발생한 때와 사람`
  - `3. 손가락과 상처 정보`
  - `4. 기계 및 카트리지 정보`
  - `5. 작업 당시 정보`
  - `6. 사고 설명`
  - `7. 사진 첨부 및 동의`
- Required controls observed by DOM query:
  - `phone`
  - `email`
  - `occurredDate`
  - `bodyPartContacted`
  - `visibleInjuryMark`
  - `sawSerialNumber`
  - `materialType`
  - `incidentDescription`
  - `promotionalConsent`
- Upload-area text observed: `0/4`, `이미지 파일, 각 10MB 이하`
- Submit button observed: `안심하고 접수하기`, `disabled=false`
- Caveat: the browser accessibility snapshot showed an iframe described as `Widget containing a Cloudflare security challenge`, but a simple DOM selector did not find a Turnstile iframe. Treat Turnstile visual/widget presence as screenshot/accessibility evidence, not a separate DOM-selector proof.

## Admin login DOM evidence

- URL: `http://127.0.0.1:8787/admin`
- Title: `SawStop Admin`
- Heading: `Admin Login`
- Password input observed:
  - `name=password`
  - `required=true`
  - `valueLength=0`
- Button observed: `로그인`, `disabled=false`
- Secret-like visible text scan: `false`
- Visible text states: `비밀번호 기반 관리자 인증과 로그인 잠금만 적용되어 있습니다. Turnstile은 아직 적용되지 않았습니다.`

## Authenticated admin static no-script DOM evidence

- URL: `file:///home/uandme/vibe/sawstop-finger-save/docs/runbooks/group-b-browser-proof/admin-static-noscript.html`
- Title: `SawStop Admin`
- Headings observed:
  - `Admin Upload`
  - `현재 첨부 목록`
  - `FIFO 실행`
- Script tags observed: `0`
- Search input present: `true`
- Attachment type options observed:
  - `선택`
  - `손가락 사진`
  - `브레이크 카트리지 사진`
  - `기타`
- Upload button observed: `업로드`, `disabled=true`
- Visible static text includes:
  - `아직 선택된 사고건이 없습니다.`
  - `선택된 파일 없음`
  - `사고건을 선택하면 첨부 목록을 불러옵니다.`
  - `휴지통 상태이며 영구삭제 예정 시각이 지난 첨부를 실제 처리합니다.`

## Boundary

No customer submit, admin upload, update/delete/trash/restore/FIFO execution, deploy, cleanup, propagation, OI movement, or Core mutation was performed while collecting this addendum.
