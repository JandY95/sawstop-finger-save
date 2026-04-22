# Handoff
## Current Status

- 기준 판단: 기준 유지
- 편입 절차: 종료
- 현재 실작업 방향: `sawstop-finger-save` parity hardening / 운영 안정화
- 현재 확인된 정합성 상태:
  - `project.profile.json`의 `currentStage`는 `stage-3-project-pack-bootstrap`
  - 로컬 `.project-state.json`의 `currentStage`와 `derivedOperatingStage`는 stage 3 기준으로 정리됨
  - 로컬 `.project-state.json`에는 `stage-6-parity-harness` 참조와 legacy parity runner 스크립트 부재 관련 blocker가 남아 있음
  - `docs/harness/handoff/latest.md`, `docs/harness/parity/PARITY_STATUS.md`, `docs/harness/parity/scenario-index.yaml` 최소 baseline 복원 완료

## Locked

- `harness-os-core`는 상위 OS/코어 repo
- `sawstop-finger-save`는 실작업 repo
- 기존 프로젝트는 신규 생성보다 adopt + bridge + sync 우선
- 코어 repo와 프로젝트 repo는 분리 운영
- 평소 작업은 프로젝트 repo에서 끝내고, 코어는 sync / overlay / 승격 / parity 시에만 수정

## Current Finding

- `.project-state.json`은 로컬 전용 ignored 파일이며 Git 추적 대상이 아님
- tracked 문서 기준으로는 parity 관련 최소 baseline 복원이 완료됨
- 실제 repo에는 예전 state가 참조하던 `post-incident.js`, `promote-lesson.js`, `sync-project.js`, `run-harness-scenarios.js`, `compare-harness-results.js`가 없음
- 따라서 현재 parity는 runnable harness 단계가 아니라 문서 기준 정리 및 후속 판단 단계로 본다

## Next One Task

- stage-6 parity를 실제 구현 대상으로 유지할지, 문서 기준 보류 상태로 둘지 판단한다.
