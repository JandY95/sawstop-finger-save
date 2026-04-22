# Handoff
## Current Status

- 기준 판단: 기준 유지
- 편입 절차: 종료
- 현재 실작업 방향: `sawstop-finger-save` parity hardening / 운영 안정화
- 현재 확인된 정합성 상태:
  - `project.profile.json`의 `currentStage`는 `stage-3-project-pack-bootstrap`
  - 로컬 `.project-state.json`에서 `currentStage`는 stage 3로 조정됐지만, `stage-6-parity-harness` 참조는 아직 남아 있음
  - `docs/harness/parity/PARITY_STATUS.md`는 제목만 있는 상태
  - `docs/harness/handoff/latest.md`는 제목만 있는 상태에서 복원 시작

## Locked

- `harness-os-core`는 상위 OS/코어 repo
- `sawstop-finger-save`는 실작업 repo
- 기존 프로젝트는 신규 생성보다 adopt + bridge + sync 우선
- 코어 repo와 프로젝트 repo는 분리 운영
- 평소 작업은 프로젝트 repo에서 끝내고, 코어는 sync / overlay / 승격 / parity 시에만 수정

## Current Finding

- `.project-state.json` 파일은 존재하지만 Git 추적 대상이 아니며 `.gitignore`에서 제외되고 있음
- `.project-state.json` 안의 stage / script 기준과 현재 repo 실제 파일 구성이 일치하지 않을 가능성이 있음
- 따라서 현재 우선순위는 parity 실작업에 들어가기 전, handoff / parity 문서의 최소 기준을 먼저 복원하는 것임

## Next One Task

- `docs/harness/handoff/latest.md`에 현재 기준 복원용 최소 handoff 기록을 먼저 남긴다.