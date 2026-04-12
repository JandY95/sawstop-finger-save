# CURRENT_PLAN

## 현재 상태
- workflow_dispatch 배포 성공
- `/admin` 접속 성공
- 관리자 검색/업로드 확인
- Notion 첨부 row 생성 확인
- Cloudflare R2 저장 확인

## 이번 배치 완료
- Step 1 문서/상수/대상 점검 완료
- Step 2 완료건 제외 검색 완료
- Step 3 새 첨부 시 `첨부 최종 확인 완료=false` reset 완료
- Step 4 관련 테스트 보강 완료
- 휴지통 이동 시 false reset + 손가락 사진 재계산 완료
- 복구 시 false reset + 손가락 사진 재계산 완료
- 관리자 UI에서 휴지통 이동/복구 가능
- FIFO dry-run 스크립트 추가 완료

## 이번 배치 보류
- 업로드 출처 대상은 첨부 DB `출처`가 후보 속성이라 보류
- 현재 후보 0건으로 실제 영구삭제 로직은 보류

## 다음 배치 후보
1. 출처 속성 live 확정 후 런타임 연결
2. 유형 변경/삭제/복구/FIFO 이벤트 false reset 확장 정리
3. 운영 상태 전환/버튼 경계 점검
4. FIFO 후보 발생 시 실제 삭제 기준 잠금
5. 휴지통 이동 시각 / 영구삭제 예정 시각 write-back 검토
