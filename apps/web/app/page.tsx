"use client";

import { useMemo, useState } from "react";

const stages = [
  {
    id: "intake",
    label: "접수",
    title: "고객 접수 화면",
    summary: "연락처, 사고 발생 시점, 신체 접촉 부위, 기계 정보, 설명, 동의를 한 흐름으로 확인합니다."
  },
  {
    id: "review",
    label: "검토",
    title: "운영자 1차 검토",
    summary: "Notion 사고건 기준으로 입력 누락, 첨부 확보, 카트리지 정보 확인 대상을 분리합니다."
  },
  {
    id: "attachments",
    label: "첨부",
    title: "첨부 정리",
    summary: "첨부 원본은 R2, 메타데이터는 첨부 DB, relation 쓰기는 첨부 DB 사고건 기준으로 유지합니다."
  },
  {
    id: "report",
    label: "리포트",
    title: "발송 준비",
    summary: "영문 검수, 첨부 최종 확인, 출력 확인을 분리해 본사 수동 전달 준비 상태를 확인합니다."
  }
] as const;

const formSections = [
  "연락받으실 정보",
  "사고가 발생한 때와 사람",
  "손가락과 상처 정보",
  "기계 및 카트리지 정보",
  "작업 당시 정보",
  "사고 설명",
  "사진 첨부 및 동의"
];

const tasks = [
  {
    stage: "intake",
    name: "필수 입력 차단",
    status: "준비됨",
    detail: "연락처, 이메일, 사고일, 접촉 부위, 시리얼, 사고 설명, 동의 누락을 화면에서 먼저 막습니다."
  },
  {
    stage: "intake",
    name: "시간 미상 흐름",
    status: "문서 잠금",
    detail: "체크 시 시간 입력을 비활성화하고 서버 저장은 12:00 Asia/Seoul 규칙을 따릅니다."
  },
  {
    stage: "review",
    name: "완료건 제외 검색",
    status: "유지",
    detail: "완료 상태 사고건은 운영자 검색 결과에서 제외한다는 현재 운영 기준을 노출합니다."
  },
  {
    stage: "review",
    name: "영문 초안 재진입",
    status: "검토 필요",
    detail: "영문 초안 작성 뒤에도 보완 업로드로 돌아갈 수 있어야 하는 흐름을 분리합니다."
  },
  {
    stage: "attachments",
    name: "첨부 유형 분류",
    status: "수동",
    detail: "고객 첨부는 유형을 묻지 않고 첨부 DB에서 운영자가 분류합니다."
  },
  {
    stage: "attachments",
    name: "손가락 사진 있음",
    status: "재계산",
    detail: "첨부 추가, 유형 변경, 휴지통, 복구, FIFO 뒤 write-back 상태를 다시 판단합니다."
  },
  {
    stage: "report",
    name: "발송 준비 체크",
    status: "수동 발송",
    detail: "영문 검수 완료, 첨부 최종 확인 완료, 출력 확인 완료 3개 체크를 분리해 봅니다."
  },
  {
    stage: "report",
    name: "고객 완료 화면",
    status: "보호",
    detail: "완료 화면에는 접수번호만 보여주고 내부 page_id, Queue 상태, 오류코드는 숨깁니다."
  }
] as const;

const boundaries = [
  "apps/web 화면 코드만 변경",
  "Root Worker, src, Wrangler 변경 없음",
  "Notion, R2, Queue, deploy 명령 없음",
  "root package, workflow, branch protection 변경 없음"
];

const sourceDocuments = [
  "docs/source/DB_SCHEMA_AND_MAPPING.md",
  "docs/source/WEBFORM_UI_SPEC.md",
  "docs/source/TRD.md",
  "docs/decisions/DECISIONS_LOCK.md"
];

type StageId = (typeof stages)[number]["id"];

export default function Home() {
  const [activeStage, setActiveStage] = useState<StageId>("intake");

  const active = stages.find((stage) => stage.id === activeStage) ?? stages[0];
  const visibleTasks = useMemo(
    () => tasks.filter((task) => task.stage === activeStage),
    [activeStage]
  );

  return (
    <main className="page-shell">
      <section className="workspace-header" aria-labelledby="workspace-title">
        <div className="header-copy">
          <p className="eyebrow">apps/web functional expansion</p>
          <h1 id="workspace-title">SAWSTOP Finger Save 운영 콘솔</h1>
          <p className="workspace-summary">
            고객 접수부터 본사 수동 전달 준비까지의 운영 단계를 Next.js 화면에서 나눠 확인합니다.
            live 서비스와 기존 Worker 경로는 건드리지 않습니다.
          </p>
        </div>
        <div className="runtime-panel" aria-label="runtime boundary">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>apps/web bounded</strong>
            <span>no Worker · no live writes · no deploy</span>
          </div>
        </div>
      </section>

      <section className="stage-switcher" aria-label="운영 단계 선택">
        {stages.map((stage) => (
          <button
            type="button"
            key={stage.id}
            className={stage.id === activeStage ? "stage-tab active" : "stage-tab"}
            aria-pressed={stage.id === activeStage}
            onClick={() => setActiveStage(stage.id)}
          >
            <span>{stage.label}</span>
          </button>
        ))}
      </section>

      <section className="overview-grid" aria-label="selected operation detail">
        <div className="panel active-panel">
          <div className="panel-heading">
            <p className="section-label">현재 단계</p>
            <h2>{active.title}</h2>
          </div>
          <p className="active-summary">{active.summary}</p>
          <div className="flow-track" aria-label="웹폼 구역 순서">
            {formSections.map((section, index) => (
              <div className="flow-step" key={section}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{section}</strong>
              </div>
            ))}
          </div>
        </div>

        <aside className="panel source-panel" aria-label="source of truth">
          <div className="panel-heading compact">
            <p className="section-label">Source of truth</p>
            <h2>판단 기준</h2>
          </div>
          <div className="source-list">
            {sourceDocuments.map((source) => (
              <code key={source}>{source}</code>
            ))}
          </div>
        </aside>
      </section>

      <section className="work-grid" aria-label="stage work board">
        <div className="panel task-panel">
          <div className="panel-heading">
            <p className="section-label">작업면</p>
            <h2>{active.label} 기준 확인 항목</h2>
          </div>
          <div className="task-list">
            {visibleTasks.map((task) => (
              <article className="task-row" key={task.name}>
                <div>
                  <strong>{task.name}</strong>
                  <p>{task.detail}</p>
                </div>
                <span>{task.status}</span>
              </article>
            ))}
          </div>
        </div>

        <div className="panel guard-panel">
          <div className="panel-heading compact">
            <p className="section-label">안전 경계</p>
            <h2>이번 변경 범위</h2>
          </div>
          <ul className="boundary-list">
            {boundaries.map((boundary) => (
              <li key={boundary}>{boundary}</li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
