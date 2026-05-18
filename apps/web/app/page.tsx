const intakeSteps = [
  {
    label: "사고 접수",
    detail: "고객 사고 정보와 필수 동의 항목을 수집하는 공개 접수 흐름"
  },
  {
    label: "자료 확인",
    detail: "운영자가 사진, 연락처, 제품 정보, 사고 설명을 검토하는 대기열"
  },
  {
    label: "첨부 정리",
    detail: "R2 첨부 파일과 Notion 사고 페이지의 매핑 상태를 확인하는 작업"
  },
  {
    label: "리포트 준비",
    detail: "영문 사고 리포트와 발송 가능 상태를 최종 확인하는 단계"
  }
];

const reviewRows = [
  ["접수 상태", "검토 대기", "새 사고 접수 후 운영자 확인 전"],
  ["첨부 상태", "분리 보관", "사진과 문서는 기존 Worker/R2 흐름이 소유"],
  ["운영 기록", "Notion 기준", "문서화된 schema와 decision lock을 유지"],
  ["자동화", "비활성", "이 shell은 live write 명령을 실행하지 않음"]
];

const safetyBoundaries = [
  "Root Worker, Wrangler, smoke, parity script는 변경하지 않음",
  "Notion, R2, Queue, Cloudflare write 경로를 호출하지 않음",
  "docs/source 및 docs/decisions를 source-of-truth로 유지",
  "GitHub required check, branch protection, hard block 설정과 분리"
];

const sourceLinks = [
  "docs/source/PRD.md",
  "docs/source/TRD.md",
  "docs/source/WEBFORM_UI_SPEC.md",
  "docs/decisions/DECISIONS_LOCK.md"
];

export default function Home() {
  return (
    <main className="page-shell">
      <section className="workspace-header" aria-labelledby="workspace-title">
        <div>
          <p className="eyebrow">Next.js Core Adoption Shell</p>
          <h1 id="workspace-title">SAWSTOP Finger Save</h1>
          <p className="workspace-summary">
            기존 Cloudflare Worker 운영 흐름을 보호하면서 접수, 검토, 첨부, 리포트
            단계를 Next.js 화면 구조로 분리해 검증합니다.
          </p>
        </div>
        <div className="runtime-panel" aria-label="runtime boundary">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Worker runtime protected</strong>
            <span>apps/web only · no live service writes</span>
          </div>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="operations overview">
        <div className="panel intake-panel">
          <div className="panel-heading">
            <p className="section-label">접수 흐름</p>
            <h2>운영 단계</h2>
          </div>
          <ol className="step-list">
            {intakeSteps.map((step, index) => (
              <li key={step.label}>
                <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{step.label}</strong>
                  <p>{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel review-panel">
          <div className="panel-heading">
            <p className="section-label">운영 검토</p>
            <h2>현재 작업면</h2>
          </div>
          <div className="review-table" role="table" aria-label="review status">
            {reviewRows.map(([item, state, detail]) => (
              <div className="review-row" role="row" key={item}>
                <span role="cell">{item}</span>
                <strong role="cell">{state}</strong>
                <p role="cell">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel boundary-panel">
          <div className="panel-heading">
            <p className="section-label">안전 경계</p>
            <h2>이번 PR 범위</h2>
          </div>
          <ul className="boundary-list">
            {safetyBoundaries.map((boundary) => (
              <li key={boundary}>{boundary}</li>
            ))}
          </ul>
        </div>

        <div className="panel source-panel">
          <div className="panel-heading">
            <p className="section-label">Source of truth</p>
            <h2>참조 문서</h2>
          </div>
          <div className="source-list">
            {sourceLinks.map((source) => (
              <code key={source}>{source}</code>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
