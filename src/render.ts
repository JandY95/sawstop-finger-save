import {
  BLADE_TYPE_OPTIONS,
  CUSTOMER_ATTACHMENT_FIELD_NAME,
  FEED_RATE_OPTIONS,
  GLOVES_OPTIONS,
  OTHER_DEVICE_OPTIONS,
  PROMOTIONAL_CONSENT_OPTIONS,
  SUBMIT_ROUTE,
  VISIBLE_INJURY_MARK_OPTIONS
} from "./constants";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildRadioGroup(name: string, options: readonly string[]) {
  return options
    .map(
      (option, index) => `
        <label class="choice-item" for="${name}-${index}">
          <input id="${name}-${index}" type="radio" name="${name}" value="${escapeHtml(option)}" />
          <span>${escapeHtml(option)}</span>
        </label>
      `
    )
    .join("");
}

function buildCheckboxGroup(name: string, options: readonly string[]) {
  return options
    .map(
      (option, index) => `
        <label class="choice-item" for="${name}-${index}">
          <input id="${name}-${index}" type="checkbox" name="${name}" value="${escapeHtml(option)}" />
          <span>${escapeHtml(option)}</span>
        </label>
      `
    )
    .join("");
}

export function renderCustomerPage() {
  const visibleInjuryOptions = buildRadioGroup(
    "visibleInjuryMark",
    VISIBLE_INJURY_MARK_OPTIONS
  );
  const otherDeviceOptions = buildCheckboxGroup(
    "otherDevicesUsed",
    OTHER_DEVICE_OPTIONS
  );
  const glovesOptions = buildRadioGroup("wearingGloves", GLOVES_OPTIONS);
  const promotionalConsentOptions = buildRadioGroup(
    "promotionalConsent",
    PROMOTIONAL_CONSENT_OPTIONS
  );

  return new Response(
    `<!doctype html>
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>SAWSTOP “Finger Save” 사례 접수</title>
        <style>
          :root {
            --bg: #f6f2ea;
            --panel: #fffdf9;
            --surface: #ffffff;
            --ink: #1f1a16;
            --muted: #6a6259;
            --line: #d9d0c3;
            --accent: #21558c;
            --accent-soft: #eef4fb;
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: "Segoe UI", "Noto Sans KR", sans-serif;
            color: var(--ink);
            background:
              radial-gradient(circle at top left, #efe5d6 0, transparent 28%),
              linear-gradient(180deg, #fbf8f3 0%, var(--bg) 100%);
          }
          .page {
            width: min(920px, calc(100% - 24px));
            margin: 24px auto 40px;
          }
          .hero {
            padding: 24px;
            border: 1px solid var(--line);
            border-radius: 20px;
            background: var(--panel);
            box-shadow: 0 18px 40px rgba(0, 0, 0, 0.06);
          }
          .hero h1 {
            margin: 0 0 10px;
            font-size: clamp(30px, 5vw, 40px);
            line-height: 1.2;
          }
          .hero p {
            margin: 0;
            color: var(--muted);
            line-height: 1.7;
            font-size: 16px;
          }
          .hero .helper {
            margin-top: 14px;
            padding: 14px 16px;
            border-radius: 14px;
            background: var(--accent-soft);
            color: var(--ink);
          }
          form {
            display: grid;
            gap: 18px;
            margin-top: 20px;
          }
          .section {
            display: grid;
            gap: 14px;
            padding: 22px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: var(--surface);
            box-shadow: 0 10px 24px rgba(0, 0, 0, 0.03);
          }
          .section h2 {
            margin: 0;
            font-size: 22px;
            line-height: 1.3;
          }
          .section p {
            margin: 0;
            color: var(--muted);
            line-height: 1.6;
          }
          .field-grid {
            display: grid;
            gap: 14px;
          }
          .field-grid.two-up {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
          }
          .contact-row .field {
            grid-template-rows: auto 52px 0 22px;
            align-content: start;
          }
          .contact-row .field-meta {
            min-height: 0;
          }
          .field {
            display: grid;
            gap: 8px;
          }
          .field label,
          .checkbox {
            font-weight: 700;
            font-size: 16px;
          }
          .field input,
          .field select,
          .field textarea {
            width: 100%;
            padding: 14px 16px;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: #fff;
            color: var(--ink);
            font: inherit;
          }
          .date-input-shell {
            position: relative;
          }
          .date-input-native {
            display: none;
          }
          .date-display-button {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 14px 16px;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: #fff;
            color: var(--ink);
            font: inherit;
            text-align: left;
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
          }
          .date-display-button:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
          }
          .date-display-value.is-placeholder {
            color: var(--muted);
          }
          .date-display-icon {
            flex: 0 0 auto;
            color: var(--muted);
            line-height: 1;
          }
          .date-picker-panel {
            position: absolute;
            top: calc(100% + 8px);
            left: 0;
            z-index: 20;
            width: min(320px, 100%);
            padding: 14px;
            border: 1px solid var(--line);
            border-radius: 16px;
            background: #fffdf9;
            box-shadow: 0 18px 40px rgba(32, 27, 16, 0.12);
          }
          .date-picker-panel[hidden] {
            display: none;
          }
          .date-picker-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
          }
          .date-picker-nav {
            width: 34px;
            height: 34px;
            border: 1px solid var(--line);
            border-radius: 10px;
            background: #fff;
            color: var(--ink);
            font: inherit;
            cursor: pointer;
          }
          .date-picker-month-label {
            font-weight: 700;
            font-size: 15px;
          }
          .date-picker-weekdays,
          .date-picker-grid {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 6px;
          }
          .date-picker-weekdays {
            margin-bottom: 6px;
          }
          .date-picker-weekday {
            text-align: center;
            font-size: 12px;
            color: var(--muted);
          }
          .date-picker-day,
          .date-picker-day-empty {
            min-height: 34px;
          }
          .date-picker-day {
            border: 1px solid transparent;
            border-radius: 10px;
            background: transparent;
            color: var(--ink);
            font: inherit;
            cursor: pointer;
          }
          .date-picker-day:hover {
            border-color: var(--line);
            background: #f7f2ea;
          }
          .date-picker-day.is-selected {
            background: var(--accent);
            color: #fff;
          }
          .date-picker-day.is-today:not(.is-selected) {
            border-color: var(--accent);
            color: var(--accent);
          }
          .field textarea {
            min-height: 132px;
            resize: vertical;
          }
          .time-grid {
            display: grid;
            grid-template-columns: 120px 1fr 1fr;
            gap: 10px;
            align-items: end;
          }
          .time-part {
            display: grid;
            gap: 6px;
          }
          .time-helper-row {
            display: grid;
            gap: 6px;
            justify-items: start;
            margin-top: 2px;
          }
          .time-helper-row .hint {
            margin: 0;
          }
          .time-unknown-inline {
            margin: 0;
            font-size: 14px;
            font-weight: 600;
            color: var(--muted);
            white-space: nowrap;
          }
          .field input.invalid,
          .field textarea.invalid,
          .field select.invalid {
            border-color: #b84032;
            background: #fff8f7;
          }
          .field-error {
            min-height: 20px;
            color: #b84032;
            font-size: 13px;
            line-height: 1.5;
          }
          .field-meta {
            min-height: 22px;
          }
          .choice-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding: 2px 0 0;
            border: 0;
            border-radius: 0;
            background: transparent;
            align-items: stretch;
          }
          .choice-group.compact {
            gap: 6px;
          }
          .choice-group.two-two-one {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }
          .choice-group.two-two-one .choice-item:last-child {
            grid-column: 1;
          }
          .choice-group.duo .choice-item {
            flex: 1 1 calc(50% - 4px);
          }
          .choice-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 11px;
            border: 1px solid #ddd3c5;
            border-radius: 12px;
            background: #f7f2ea;
            font-weight: 600;
            line-height: 1.4;
            cursor: pointer;
            min-width: 0;
            flex: 0 1 180px;
            max-width: 100%;
            min-height: 42px;
          }
          .choice-item input {
            width: 16px;
            height: 16px;
            margin: 0;
            flex: 0 0 auto;
          }
          .choice-item span {
            min-width: 0;
            word-break: keep-all;
            overflow-wrap: anywhere;
            font-size: 14px;
          }
          .hint {
            color: var(--muted);
            font-size: 14px;
            line-height: 1.6;
          }
          .checkbox-row {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
          }
          .checkbox-row input {
            width: 18px;
            height: 18px;
          }
          .attachment-upload-zone {
            display: grid;
            gap: 10px;
            padding: 16px;
            border: 1px dashed var(--line);
            border-radius: 16px;
            background: #fcfaf6;
            cursor: pointer;
            transition: border-color 0.15s ease, background 0.15s ease;
          }
          .attachment-upload-zone.drag-over {
            border-color: var(--accent);
            background: #eef4fb;
          }
          .attachment-upload-input {
            display: none;
          }
          .attachment-upload-copy {
            display: grid;
            gap: 6px;
          }
          .attachment-upload-title {
            font-weight: 700;
          }
          .attachment-upload-meta {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            flex-wrap: wrap;
            color: var(--muted);
            font-size: 14px;
          }
          .attachment-preview-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            align-items: start;
          }
          .attachment-preview-card {
            display: grid;
            gap: 8px;
            padding: 10px;
            border: 1px solid var(--line);
            border-radius: 14px;
            background: #fff;
            align-content: start;
          }
          .attachment-preview-card img {
            width: 100%;
            aspect-ratio: 1 / 1;
            object-fit: cover;
            border-radius: 10px;
            background: #f3efe6;
          }
          .attachment-preview-name {
            font-size: 13px;
            line-height: 1.4;
            word-break: break-word;
            min-height: 36px;
          }
          .attachment-preview-remove {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid var(--line);
            border-radius: 12px;
            background: #f5eee3;
            color: var(--ink);
            font: inherit;
            font-weight: 700;
            cursor: pointer;
          }
          .submit-bar {
            display: grid;
            gap: 12px;
            padding: 22px;
            border: 1px solid var(--line);
            border-radius: 18px;
            background: var(--panel);
          }
          .submit-bar button {
            width: 100%;
            padding: 16px 18px;
            border: 0;
            border-radius: 16px;
            background: var(--accent);
            color: #fff;
            font: inherit;
            font-weight: 700;
            cursor: pointer;
          }
          .submit-error {
            min-height: 22px;
            color: #b84032;
            font-size: 14px;
            line-height: 1.6;
          }
          .success-view {
            display: grid;
            gap: 14px;
            padding: 24px;
            border: 1px solid var(--line);
            border-radius: 20px;
            background: var(--panel);
            box-shadow: 0 18px 40px rgba(32, 27, 16, 0.08);
          }
          .success-view h2 {
            margin: 0;
            font-size: 28px;
          }
          .success-receipt {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 12px 14px;
            border-radius: 14px;
            background: #f4efe7;
            border: 1px solid var(--line);
            font-weight: 800;
            color: var(--ink);
          }
          .success-view[hidden] {
            display: none !important;
          }
          @media (max-width: 760px) {
            .page {
              width: min(100%, calc(100% - 16px));
              margin: 16px auto 28px;
            }
            .hero,
            .section,
            .submit-bar {
              padding: 18px;
              border-radius: 16px;
            }
            .field-grid.two-up {
              grid-template-columns: 1fr;
            }
            .time-grid {
              grid-template-columns: 1fr;
            }
            .time-unknown-inline {
              white-space: normal;
            }
            .choice-item {
              flex: 1 1 100%;
              border-radius: 14px;
            }
            .contact-row .field {
              grid-template-rows: auto 52px 0 22px;
            }
            .choice-group.duo .choice-item,
            .choice-group.two-two-one .choice-item {
              flex-basis: 100%;
            }
            .choice-group.two-two-one {
              grid-template-columns: 1fr;
            }
            .attachment-preview-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }
          @media (max-width: 520px) {
            .attachment-preview-grid {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <main class="page">
          <section class="hero">
            <h1>SAWSTOP “Finger Save” 사례 접수</h1>
            <p>본 양식은 SAWSTOP 사고 보고 및 확인을 위한 접수 양식입니다.</p>
            <p>제출하신 내용은 내부 검토를 위해 저장되며, 개인정보와 식별 정보는 기밀로 관리됩니다.</p>
            <p class="helper">* 표시는 필수 입력 항목입니다.</p>
          </section>

          <form method="post" action="${SUBMIT_ROUTE}" enctype="multipart/form-data" novalidate>
            <section class="section">
              <h2>1. 연락받으실 정보</h2>
              <p>연락 가능한 정보를 남겨 주세요.</p>
              <div class="field-grid">
                <div class="field">
                  <label for="business-or-school-name">회사 또는 학교명</label>
                  <input id="business-or-school-name" name="businessOrSchoolName" type="text" placeholder="예: OO학교 / OO목공방" />
                </div>
                <div class="field-grid two-up contact-row">
                  <div class="field">
                    <label for="phone">연락처 *</label>
                    <input id="phone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" placeholder="010-1234-5678" pattern="^(?:01(?:0|1|6|7|8|9)-\\d{3,4}-\\d{4}|02-\\d{3,4}-\\d{4}|0\\d{2}-\\d{3}-\\d{4})$" required />
                    <div class="hint field-meta"></div>
                    <div id="phone-error" class="field-error"></div>
                  </div>
                  <div class="field">
                    <label for="email">이메일 *</label>
                    <input id="email" name="email" type="email" autocomplete="email" placeholder="name@example.com" required />
                    <div class="hint field-meta"></div>
                    <div id="email-error" class="field-error"></div>
                  </div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>2. 사고가 발생한 때와 사람</h2>
              <p>사고가 언제 일어났는지와 관련된 사람 정보를 적어 주세요.</p>
              <div class="field-grid">
                <div class="field-grid two-up">
                  <div class="field">
                    <label for="occurred-date">사고 발생일 *</label>
                    <div class="date-input-shell">
                      <input id="occurred-date" class="date-input-native" name="occurredDate" type="date" required tabindex="-1" aria-hidden="true" />
                      <button id="occurred-date-display" class="date-display-button" type="button" aria-haspopup="dialog" aria-expanded="false">
                        <span id="occurred-date-display-value" class="date-display-value is-placeholder">YYYY-MM-DD</span>
                        <span class="date-display-icon" aria-hidden="true">📅</span>
                      </button>
                      <div id="occurred-date-picker" class="date-picker-panel" hidden>
                        <div class="date-picker-header">
                          <button id="occurred-date-prev-month" class="date-picker-nav" type="button" aria-label="이전 달">‹</button>
                          <div id="occurred-date-month-label" class="date-picker-month-label"></div>
                          <button id="occurred-date-next-month" class="date-picker-nav" type="button" aria-label="다음 달">›</button>
                        </div>
                        <div class="date-picker-weekdays">
                          <div class="date-picker-weekday">일</div>
                          <div class="date-picker-weekday">월</div>
                          <div class="date-picker-weekday">화</div>
                          <div class="date-picker-weekday">수</div>
                          <div class="date-picker-weekday">목</div>
                          <div class="date-picker-weekday">금</div>
                          <div class="date-picker-weekday">토</div>
                        </div>
                        <div id="occurred-date-picker-grid" class="date-picker-grid"></div>
                      </div>
                    </div>
                  </div>
                  <div class="field">
                    <label for="occurred-time-meridiem">발생 시간 *</label>
                    <input id="occurred-time" name="occurredTime" type="hidden" />
                    <div class="time-grid">
                      <div class="time-part">
                        <select id="occurred-time-meridiem">
                          <option value="">오전/오후</option>
                          <option value="AM">오전</option>
                          <option value="PM">오후</option>
                        </select>
                      </div>
                      <div class="time-part">
                        <select id="occurred-time-hour">
                          <option value="">시간</option>
                          <option value="01">01</option>
                          <option value="02">02</option>
                          <option value="03">03</option>
                          <option value="04">04</option>
                          <option value="05">05</option>
                          <option value="06">06</option>
                          <option value="07">07</option>
                          <option value="08">08</option>
                          <option value="09">09</option>
                          <option value="10">10</option>
                          <option value="11">11</option>
                          <option value="12">12</option>
                        </select>
                      </div>
                      <div class="time-part">
                        <select id="occurred-time-minute">
                          <option value="">분</option>
                          <option value="00">00</option>
                          <option value="05">05</option>
                          <option value="10">10</option>
                          <option value="15">15</option>
                          <option value="20">20</option>
                          <option value="25">25</option>
                          <option value="30">30</option>
                          <option value="35">35</option>
                          <option value="40">40</option>
                          <option value="45">45</option>
                          <option value="50">50</option>
                          <option value="55">55</option>
                        </select>
                      </div>
                    </div>
                    <div class="time-helper-row">
                      <div class="hint">정확하지 않으면 대략적인 시간대만 입력하셔도 됩니다.</div>
                      <label class="checkbox-row checkbox time-unknown-inline" for="time-unknown">
                        <input id="time-unknown" name="timeUnknown" type="checkbox" />
                        정확한 시간을 잘 모르겠습니다.
                      </label>
                    </div>
                    <div id="occurred-time-error" class="field-error"></div>
                  </div>
                </div>
                <div class="field-grid two-up">
                  <div class="field">
                    <label for="operator-name">작업자 이름</label>
                    <input id="operator-name" name="operatorName" type="text" />
                  </div>
                  <div class="field">
                    <label for="touched-person-name">접촉된 사람(피해자)</label>
                    <input id="touched-person-name" name="touchedPersonName" type="text" />
                  </div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>3. 손가락과 상처 정보</h2>
              <p>어느 부위가 톱날에 닿았는지와 상처 상태를 적어 주세요.</p>
              <div class="field-grid">
                <div class="field">
                  <label for="body-part-contacted">어느 부위가 톱날에 닿았나요? *</label>
                  <input id="body-part-contacted" name="bodyPartContacted" type="text" required />
                  <div class="hint">예: 오른손 검지, 왼손 엄지</div>
                </div>
                <div class="field">
                  <label for="visible-injury-mark">상처가 보였나요? *</label>
                  <div id="visible-injury-mark" class="choice-group duo compact">
                    ${visibleInjuryOptions}
                  </div>
                </div>
                <div class="field">
                  <label for="wound-treatment-methods">상처 치료 방법</label>
                  <input id="wound-treatment-methods" name="woundTreatmentMethods" type="text" placeholder="예: 소독 / 밴드 / 병원 방문" />
                </div>
                <div class="field">
                  <label for="estimated-injury-without-sawstop">SAWSTOP이 없었다면 어느 정도의 상처였을까요?</label>
                  <textarea id="estimated-injury-without-sawstop" name="estimatedInjuryWithoutSawStop"></textarea>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>4. 기계 및 카트리지 정보</h2>
              <p>기계와 카트리지에 적힌 정보를 가능한 범위에서 적어 주세요.</p>
              <div class="field-grid">
                <div class="field">
                  <label for="saw-serial-number">기계 시리얼 번호 *</label>
                  <input id="saw-serial-number" name="sawSerialNumber" type="text" placeholder="예: C123456789" pattern="^[CPI]\\d{9}$" required />
                  <div class="hint">영문 C, P, I 중 하나로 시작하는 시리얼 번호를 입력해 주세요. 예: C123456789 / P123456789 / I123456789</div>
                  <div id="saw-serial-number-error" class="field-error"></div>
                </div>
                <div class="field">
                  <label for="brake-cartridge-serial-number">브레이크 카트리지 시리얼 번호</label>
                  <input id="brake-cartridge-serial-number" name="brakeCartridgeSerialNumber" type="text" placeholder="사진으로 나중에 보완하셔도 됩니다." />
                  <div class="hint">잘 모르시면 카트리지 전체 사진과 시리얼 번호가 보이는 사진을 <strong>"7. 사진 첨부 및 동의"</strong> 항목에서 함께 첨부해 주셔도 됩니다.</div>
                </div>
                <div class="field">
                  <label for="blade-type-0">장착 날(블레이드) 종류</label>
                  <div id="blade-type" class="choice-group duo compact">
                    ${buildRadioGroup("bladeType", BLADE_TYPE_OPTIONS)}
                  </div>
                </div>
                <div class="field">
                  <label for="blade-details">톱날 상세 정보</label>
                  <input id="blade-details" name="bladeDetails" type="text" placeholder="예: 40T, kerf 3.2mm" />
                </div>
              </div>
            </section>

            <section class="section">
              <h2>5. 작업 당시 정보</h2>
              <p>절단 당시의 재료와 보조 장치 사용 정보를 적어 주세요.</p>
              <div class="field-grid">
                <div class="field">
                  <label for="material-type">절단한 재료 *</label>
                  <input id="material-type" name="materialType" type="text" placeholder="예: 원목 / 합판 / MDF" required />
                </div>
                <div class="field">
                  <label for="workpiece-size-and-cut-type">재료 크기와 절단 방식</label>
                  <input id="workpiece-size-and-cut-type" name="workpieceSizeAndCutType" type="text" placeholder="예: 폭 100mm 정도의 원목을 길이 방향으로 절단" />
                  <div class="hint">작업물 크기와 그때 하고 있던 작업을 적어 주세요.</div>
                </div>
                <div class="field">
                  <label for="safety-device-status">안전 장치 상태</label>
                  <input id="safety-device-status" name="safetyDeviceStatus" type="text" placeholder="예: 블레이드 가드 사용 / 라이빙나이프만 장착 / 없음" />
                </div>
                <div class="field">
                  <label for="other-devices-used-0">사고 당시 사용한 보조장치가 있었나요?</label>
                  <div class="choice-group two-two-one compact">
                    ${otherDeviceOptions}
                  </div>
                </div>
                <div class="field">
                  <label for="approximate-feed-rate">재료 이송 속도</label>
                  <div id="approximate-feed-rate" class="choice-group two-two-one compact">
                    ${buildRadioGroup("approximateFeedRate", FEED_RATE_OPTIONS)}
                  </div>
                </div>
                <div class="field">
                  <label for="wearing-gloves">장갑 착용 여부</label>
                  <div id="wearing-gloves" class="choice-group duo compact">
                    ${glovesOptions}
                  </div>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>6. 사고 설명</h2>
              <p>사고가 어떻게 일어났는지 가능한 범위에서 적어 주세요.</p>
              <div class="field-grid">
                <div class="field">
                  <label for="incident-cause">사고 원인</label>
                  <input id="incident-cause" name="incidentCause" type="text" placeholder="예: 재료가 밀리면서 손이 함께 들어간 것 같습니다." />
                </div>
                <div class="field">
                  <label for="incident-description">사고 설명 *</label>
                  <textarea id="incident-description" name="incidentDescription" placeholder="예: 재료를 밀면서 작업하던 중 재료가 흔들렸고, 손이 앞으로 나가 톱날에 닿았습니다. 이후 기계가 바로 멈췄습니다." required></textarea>
                </div>
              </div>
            </section>

            <section class="section">
              <h2>7. 사진 첨부 및 동의</h2>
              <div class="field-grid">
                <div class="field attachment-upload-field">
                  <label for="customer-attachments">손가락 사진이나 브레이크 카트리지 사진을 첨부하시겠어요?</label>
                  <div id="customer-attachment-upload-zone" class="attachment-upload-zone">
                    <div class="attachment-upload-copy">
                      <div class="attachment-upload-title">사진을 추가하려면 이 영역을 눌러 주세요.</div>
                      <div class="hint">손가락 사진이나 브레이크 카트리지 사진이 있으시면 첨부해 주세요. 사진이 없어도 접수는 가능합니다.</div>
                    </div>
                    <div class="attachment-upload-meta">
                      <span id="customer-attachment-count">0/4</span>
                      <span>이미지 파일, 각 10MB 이하</span>
                    </div>
                    <input
                      id="customer-attachments"
                      class="attachment-upload-input customer-attachment-input"
                      name="${CUSTOMER_ATTACHMENT_FIELD_NAME}"
                      type="file"
                      multiple
                      accept="image/*"
                    />
                  </div>
                  <div id="customer-attachment-error" class="field-error"></div>
                  <div id="customer-attachment-preview" class="attachment-preview-grid"></div>
                </div>
                <div class="field">
                  <label for="promotional-consent-0">홍보 활용 동의 *</label>
                  <div class="hint">SAWSTOP이 고객님의 사용 후기 또는 “Finger Save” 사례를 외부 홍보 또는 마케팅 자료로 활용하는 데 동의해 주시겠습니까?</div>
                  <div id="promotional-consent" class="choice-group duo compact">
                    ${promotionalConsentOptions}
                  </div>
                </div>
              </div>
            </section>

            <section class="submit-bar">
              <div class="hint">접수 후 접수번호를 바로 확인하실 수 있습니다. 사진이 없어도 먼저 접수하실 수 있습니다.</div>
              <div id="customer-submit-error" class="submit-error"></div>
              <button type="submit">안심하고 접수하기</button>
            </section>
          </form>
          <section id="customer-success-view" class="success-view" hidden>
            <h2>접수가 완료되었습니다.</h2>
            <p>입력하신 내용은 내부 검토 후 확인됩니다.</p>
            <div class="success-receipt">접수번호: <span id="customer-success-receipt-number"></span></div>
          </section>
        </main>
        <script>
          const form = document.querySelector("form");
          const phoneInput = document.getElementById("phone");
          const sawSerialNumberInput = document.getElementById("saw-serial-number");
          const emailInput = document.getElementById("email");
          const occurredDateInput = document.getElementById("occurred-date");
          const occurredDateDisplayButton = document.getElementById("occurred-date-display");
          const occurredDateDisplayValue = document.getElementById("occurred-date-display-value");
          const occurredDatePicker = document.getElementById("occurred-date-picker");
          const occurredDateMonthLabel = document.getElementById("occurred-date-month-label");
          const occurredDatePickerGrid = document.getElementById("occurred-date-picker-grid");
          const occurredDatePrevMonthButton = document.getElementById("occurred-date-prev-month");
          const occurredDateNextMonthButton = document.getElementById("occurred-date-next-month");
          const occurredTimeInput = document.getElementById("occurred-time");
          const occurredTimeMeridiem = document.getElementById("occurred-time-meridiem");
          const occurredTimeHour = document.getElementById("occurred-time-hour");
          const occurredTimeMinute = document.getElementById("occurred-time-minute");
          const timeUnknownInput = document.getElementById("time-unknown");
          const attachmentInput = document.getElementById("customer-attachments");
          const attachmentZone = document.getElementById("customer-attachment-upload-zone");
          const attachmentCount = document.getElementById("customer-attachment-count");
          const attachmentPreview = document.getElementById("customer-attachment-preview");
          const attachmentError = document.getElementById("customer-attachment-error");
          const submitError = document.getElementById("customer-submit-error");
          const successView = document.getElementById("customer-success-view");
          const successReceiptNumber = document.getElementById("customer-success-receipt-number");
          const phoneError = document.getElementById("phone-error");
          const emailError = document.getElementById("email-error");
          const sawSerialNumberError = document.getElementById("saw-serial-number-error");
          const occurredTimeError = document.getElementById("occurred-time-error");
          const selectedFiles = [];
          const phonePattern = /^(?:01(?:0|1|6|7|8|9)-\\d{3,4}-\\d{4}|02-\\d{3,4}-\\d{4}|0\\d{2}-\\d{3}-\\d{4})$/;
          const emailPattern = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
          const sawSerialPattern = /^[CPI]\\d{9}$/;
          const maxAttachmentCount = 4;
          const maxAttachmentBytes = 10 * 1024 * 1024;
          const firstSawSerialCharacterMap = {
            "\\u314a": "C",
            "\\u3154": "P",
            "\\u3151": "I"
          };
          let occurredDatePickerOpen = false;
          let occurredDateViewYear = 0;
          let occurredDateViewMonth = 0;
          let sawSerialLastStableValue = "";
          let sawSerialImeActive = false;
          let sawSerialCompositionBaseValue = "";

          function setFieldError(input, errorNode, message) {
            if (!input || !errorNode) {
              return;
            }

            errorNode.textContent = message;
            input.classList.toggle("invalid", Boolean(message));
            input.setAttribute("aria-invalid", message ? "true" : "false");
          }

          function setSubmitError(message) {
            if (submitError) {
              submitError.textContent = message;
            }
          }

          function setOccurredTimeError(message) {
            if (!occurredTimeError) {
              return;
            }

            occurredTimeError.textContent = message;
            [occurredTimeMeridiem, occurredTimeHour, occurredTimeMinute].forEach((input) => {
              if (!input) {
                return;
              }

              input.classList.toggle("invalid", Boolean(message));
              input.setAttribute("aria-invalid", message ? "true" : "false");
            });
          }

          function syncAttachmentInputFiles() {
            if (!attachmentInput) {
              return;
            }

            const transfer = new DataTransfer();
            selectedFiles.forEach((file) => transfer.items.add(file));
            attachmentInput.files = transfer.files;
          }

          function normalizeSawSerialFirstCharacter(character) {
            const upperCharacter = character.toUpperCase();
            return firstSawSerialCharacterMap[character] || upperCharacter;
          }

          function isSawSerialControlKey(event) {
            return (
              event.ctrlKey ||
              event.metaKey ||
              event.altKey ||
              event.key === "Backspace" ||
              event.key === "Delete" ||
              event.key === "Tab" ||
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "ArrowUp" ||
              event.key === "ArrowDown" ||
              event.key === "Home" ||
              event.key === "End" ||
              event.key === "Enter"
            );
          }

          function normalizeSawSerialNumberValue(rawValue) {
            if (!rawValue) {
              return "";
            }

            let normalized = "";

            Array.from(rawValue).forEach((character) => {
              if (normalized.length === 0) {
                const normalizedCharacter = normalizeSawSerialFirstCharacter(character);
                if (/[CPI]/.test(normalizedCharacter)) {
                  normalized = normalizedCharacter;
                }
                return;
              }

              if (/\\d/.test(character) && normalized.length < 10) {
                normalized += character;
              }
            });

            return normalized;
          }

          function restoreSawSerialStableValue() {
            if (!sawSerialNumberInput) {
              return;
            }

            sawSerialNumberInput.value = sawSerialLastStableValue;
            const cursor = sawSerialLastStableValue.length;
            sawSerialNumberInput.setSelectionRange(cursor, cursor);
            validateSawSerialNumber();
          }

          function commitSawSerialStableValue(nextValue) {
            sawSerialLastStableValue = nextValue;
          }

          function replaceSawSerialSelection(input, insertedText) {
            const selectionStart = input.selectionStart ?? input.value.length;
            const selectionEnd = input.selectionEnd ?? selectionStart;
            const currentValue = input.value;
            const nextRawValue =
              currentValue.slice(0, selectionStart) +
              insertedText +
              currentValue.slice(selectionEnd);
            const nextValue = normalizeSawSerialNumberValue(nextRawValue);
            const nextCursor = Math.min(selectionStart + insertedText.length, nextValue.length);

            input.value = nextValue;
            input.setSelectionRange(nextCursor, nextCursor);
            commitSawSerialStableValue(nextValue);
            validateSawSerialNumber();
          }

          function updateAttachmentCount() {
            if (attachmentCount) {
              attachmentCount.textContent = selectedFiles.length + "/" + maxAttachmentCount;
            }
          }

          function renderAttachmentPreview() {
            if (!attachmentPreview) {
              return;
            }

            attachmentPreview.innerHTML = "";
            selectedFiles.forEach((file, index) => {
              const card = document.createElement("div");
              card.className = "attachment-preview-card";

              const image = document.createElement("img");
              image.alt = file.name;
              image.src = URL.createObjectURL(file);
              image.addEventListener("load", () => URL.revokeObjectURL(image.src), {
                once: true
              });

              const name = document.createElement("div");
              name.className = "attachment-preview-name";
              name.textContent = file.name;

              const removeButton = document.createElement("button");
              removeButton.type = "button";
              removeButton.className = "attachment-preview-remove";
              removeButton.textContent = "삭제";
              removeButton.addEventListener("click", () => {
                selectedFiles.splice(index, 1);
                syncAttachmentInputFiles();
                updateAttachmentCount();
                renderAttachmentPreview();
              });

              card.appendChild(image);
              card.appendChild(name);
              card.appendChild(removeButton);
              attachmentPreview.appendChild(card);
            });
          }

          function addFiles(fileList) {
            const rejectedMessages = [];
            const incomingFiles = Array.from(fileList || []);

            incomingFiles.forEach((file) => {
              if (!file.type.startsWith("image/")) {
                rejectedMessages.push(file.name + ": 이미지 파일만 추가할 수 있습니다.");
                return;
              }

              if (file.size > maxAttachmentBytes) {
                rejectedMessages.push(file.name + ": 10MB 이하 파일만 추가할 수 있습니다.");
                return;
              }

              if (selectedFiles.length >= maxAttachmentCount) {
                rejectedMessages.push(file.name + ": 최대 4장까지만 선택할 수 있습니다.");
                return;
              }

              selectedFiles.push(file);
            });

            if (attachmentError) {
              attachmentError.textContent = rejectedMessages.join(" ");
            }

            syncAttachmentInputFiles();
            updateAttachmentCount();
            renderAttachmentPreview();
          }

          function validatePhone() {
            const normalized = phoneInput ? phoneInput.value.trim() : "";
            const valid = phonePattern.test(normalized);
            setFieldError(
              phoneInput,
              phoneError,
              valid ? "" : "연락처를 확인해 주세요."
            );
            return valid;
          }

          function validateEmail() {
            const normalized = emailInput ? emailInput.value.trim() : "";
            const valid = emailPattern.test(normalized);
            setFieldError(
              emailInput,
              emailError,
              valid ? "" : "이메일 형식을 확인해 주세요."
            );
            return valid;
          }

          function syncOccurredTimeValue() {
            if (!occurredTimeInput || !occurredTimeMeridiem || !occurredTimeHour || !occurredTimeMinute) {
              return "";
            }

            if (timeUnknownInput?.checked) {
              occurredTimeInput.value = "";
              return "";
            }

            const meridiem = occurredTimeMeridiem.value;
            const hour = occurredTimeHour.value;
            const minute = occurredTimeMinute.value;

            if (!meridiem || !hour || !minute) {
              occurredTimeInput.value = "";
              return "";
            }

            const hourNumber = Number(hour);
            const convertedHour = meridiem === "PM"
              ? (hourNumber % 12) + 12
              : hourNumber % 12;

            occurredTimeInput.value = String(convertedHour).padStart(2, "0") + ":" + minute;
            return occurredTimeInput.value;
          }

          function updateOccurredTimeState() {
            const disabled = Boolean(timeUnknownInput?.checked);
            [occurredTimeMeridiem, occurredTimeHour, occurredTimeMinute].forEach((input) => {
              if (input) {
                input.disabled = disabled;
              }
            });

            if (disabled) {
              setOccurredTimeError("");
            }

            syncOccurredTimeValue();
          }

          function validateOccurredTime() {
            if (timeUnknownInput?.checked) {
              setOccurredTimeError("");
              syncOccurredTimeValue();
              return true;
            }

            const value = syncOccurredTimeValue();
            const valid = Boolean(value);
            setOccurredTimeError(valid ? "" : "발생 시간을 입력해 주세요.");
            return valid;
          }

          function validateSawSerialNumber() {
            const normalized = sawSerialNumberInput ? sawSerialNumberInput.value.trim() : "";
            const valid = sawSerialPattern.test(normalized);
            const message = valid ? "" : "기계 시리얼 번호 형식을 확인해 주세요.";

            setFieldError(sawSerialNumberInput, sawSerialNumberError, message);
            if (sawSerialNumberInput) {
              sawSerialNumberInput.setCustomValidity(message);
            }
            return valid;
          }

          function clearFormErrors() {
            setSubmitError("");
            setFieldError(phoneInput, phoneError, "");
            setFieldError(emailInput, emailError, "");
            setFieldError(sawSerialNumberInput, sawSerialNumberError, "");
            setOccurredTimeError("");
          }

          function formatPhoneDigits(rawDigits) {
            const digits = rawDigits.replace(/\\D/g, "");
            if (!digits) {
              return "";
            }

            if (digits.startsWith("02")) {
              const rest = digits.slice(2, 10);
              if (rest.length === 0) {
                return "02";
              }
              if (rest.length <= 4) {
                return "02-" + rest;
              }
              return "02-" + rest.slice(0, rest.length - 4) + "-" + rest.slice(-4);
            }

            if (/^01(?:0|1|6|7|8|9)/.test(digits)) {
              const area = digits.slice(0, 3);
              const rest = digits.slice(3, 11);

              if (rest.length === 0) {
                return area;
              }
              if (rest.length <= 4) {
                return area + "-" + rest;
              }
              return area + "-" + rest.slice(0, 4) + "-" + rest.slice(4, 8);
            }

            const area = digits.slice(0, 3);
            const rest = digits.slice(3, 10);

            if (rest.length === 0) {
              return area;
            }
            if (rest.length <= 3) {
              return area + "-" + rest;
            }
            return area + "-" + rest.slice(0, 3) + "-" + rest.slice(3, 7);
          }

          function syncOccurredDateDisplay() {
            if (!occurredDateDisplayValue || !occurredDateInput) {
              return;
            }

            const hasValue = Boolean(occurredDateInput.value);
            occurredDateDisplayValue.textContent = hasValue
              ? occurredDateInput.value
              : "YYYY-MM-DD";
            occurredDateDisplayValue.classList.toggle("is-placeholder", !hasValue);
          }

          function formatOccurredDateParts(year, month, day) {
            return [
              String(year).padStart(4, "0"),
              String(month).padStart(2, "0"),
              String(day).padStart(2, "0")
            ].join("-");
          }

          function parseOccurredDateValue(value) {
            const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(value);
            if (!match) {
              return null;
            }

            return {
              year: Number(match[1]),
              month: Number(match[2]),
              day: Number(match[3])
            };
          }

          function getOccurredDateTodayParts() {
            const today = new Date();
            return {
              year: today.getFullYear(),
              month: today.getMonth() + 1,
              day: today.getDate()
            };
          }

          function syncOccurredDateViewToValue() {
            const parsed = parseOccurredDateValue(occurredDateInput?.value ?? "");
            const base = parsed ?? getOccurredDateTodayParts();
            occurredDateViewYear = base.year;
            occurredDateViewMonth = base.month;
          }

          function closeOccurredDatePicker() {
            occurredDatePickerOpen = false;
            occurredDatePicker?.setAttribute("hidden", "hidden");
            occurredDateDisplayButton?.setAttribute("aria-expanded", "false");
          }

          function setOccurredDateValue(value) {
            if (!occurredDateInput) {
              return;
            }

            occurredDateInput.value = value;
            syncOccurredDateDisplay();
          }

          function renderOccurredDatePicker() {
            if (!occurredDateMonthLabel || !occurredDatePickerGrid) {
              return;
            }

            const firstDay = new Date(occurredDateViewYear, occurredDateViewMonth - 1, 1);
            const daysInMonth = new Date(occurredDateViewYear, occurredDateViewMonth, 0).getDate();
            const monthLabel =
              String(occurredDateViewYear) +
              "." +
              String(occurredDateViewMonth).padStart(2, "0");
            const selectedValue = occurredDateInput?.value ?? "";
            const today = getOccurredDateTodayParts();
            const todayValue = formatOccurredDateParts(today.year, today.month, today.day);

            occurredDateMonthLabel.textContent = monthLabel;
            occurredDatePickerGrid.innerHTML = "";

            for (let i = 0; i < firstDay.getDay(); i += 1) {
              const emptyCell = document.createElement("div");
              emptyCell.className = "date-picker-day-empty";
              occurredDatePickerGrid.appendChild(emptyCell);
            }

            for (let day = 1; day <= daysInMonth; day += 1) {
              const dayValue = formatOccurredDateParts(
                occurredDateViewYear,
                occurredDateViewMonth,
                day
              );
              const dayButton = document.createElement("button");
              dayButton.type = "button";
              dayButton.className = "date-picker-day";
              dayButton.textContent = String(day);

              if (dayValue === selectedValue) {
                dayButton.classList.add("is-selected");
              }

              if (dayValue === todayValue) {
                dayButton.classList.add("is-today");
              }

              dayButton.addEventListener("click", () => {
                setOccurredDateValue(dayValue);
                closeOccurredDatePicker();
              });

              occurredDatePickerGrid.appendChild(dayButton);
            }
          }

          function openOccurredDatePicker() {
            syncOccurredDateViewToValue();
            renderOccurredDatePicker();
            occurredDatePickerOpen = true;
            occurredDatePicker?.removeAttribute("hidden");
            occurredDateDisplayButton?.setAttribute("aria-expanded", "true");
          }

          function resetCustomerFormState() {
            form?.reset();
            clearFormErrors();
            selectedFiles.length = 0;
            syncAttachmentInputFiles();
            updateAttachmentCount();
            renderAttachmentPreview();
            if (attachmentError) {
              attachmentError.textContent = "";
            }
            if (phoneInput) {
              phoneInput.value = "";
            }
            if (emailInput) {
              emailInput.value = "";
            }
            if (sawSerialNumberInput) {
              sawSerialNumberInput.value = "";
              sawSerialNumberInput.setCustomValidity("");
            }
            syncOccurredDateDisplay();
            updateOccurredTimeState();
          }

          function showSuccessView(receiptNumber) {
            if (successReceiptNumber) {
              successReceiptNumber.textContent = receiptNumber;
            }
            form?.setAttribute("hidden", "hidden");
            successView?.removeAttribute("hidden");
            window.history.replaceState(
              { customerSubmitComplete: true, receiptNumber },
              document.title,
              window.location.pathname
            );
          }

          if (phoneInput) {
            phoneInput.addEventListener("input", () => {
              const digits = phoneInput.value
                .replace(/\\D/g, "")
                .replace(/^[1-9]+/, "")
                .slice(0, 11);

              phoneInput.value = formatPhoneDigits(digits);
            });
            phoneInput.addEventListener("blur", validatePhone);
          }

          if (emailInput) {
            emailInput.addEventListener("blur", validateEmail);
          }

          if (sawSerialNumberInput) {
            sawSerialNumberInput.addEventListener("keydown", (event) => {
              if (event.isComposing || isSawSerialControlKey(event) || event.key.length !== 1) {
                return;
              }

              const selectionStart =
                sawSerialNumberInput.selectionStart ?? sawSerialNumberInput.value.length;
              const isEditingFirstCharacter = selectionStart === 0;
              const normalizedKey = isEditingFirstCharacter
                ? normalizeSawSerialFirstCharacter(event.key)
                : event.key;
              const isValidKey = isEditingFirstCharacter
                ? /[CPI]/.test(normalizedKey)
                : /^\\d$/.test(event.key);

              if (!isValidKey) {
                event.preventDefault();
              }
            });
            sawSerialNumberInput.addEventListener("compositionstart", () => {
              sawSerialImeActive = true;
              sawSerialCompositionBaseValue = sawSerialLastStableValue;
              commitSawSerialStableValue(sawSerialNumberInput.value);
            });
            sawSerialNumberInput.addEventListener("compositionupdate", (event) => {
              if (sawSerialCompositionBaseValue.length > 0) {
                restoreSawSerialStableValue();
                return;
              }

              const compositionData = event.data ?? "";
              if (
                compositionData &&
                !/[CPI]/.test(normalizeSawSerialFirstCharacter(compositionData))
              ) {
                restoreSawSerialStableValue();
                return;
              }

              const normalized = normalizeSawSerialNumberValue(sawSerialNumberInput.value);
              if (normalized !== sawSerialNumberInput.value) {
                restoreSawSerialStableValue();
              }
            });
            sawSerialNumberInput.addEventListener("compositionend", (event) => {
              sawSerialImeActive = false;

              if (sawSerialCompositionBaseValue.length > 0) {
                restoreSawSerialStableValue();
                sawSerialCompositionBaseValue = "";
                return;
              }

               if (!sawSerialNumberInput.value && event.data) {
                const normalizedCompositionCharacter =
                  normalizeSawSerialFirstCharacter(event.data);
                if (/[CPI]/.test(normalizedCompositionCharacter)) {
                  sawSerialNumberInput.value = normalizedCompositionCharacter;
                  sawSerialNumberInput.setSelectionRange(1, 1);
                }
              }

              const normalized = normalizeSawSerialNumberValue(sawSerialNumberInput.value);

              if (normalized !== sawSerialNumberInput.value) {
                restoreSawSerialStableValue();
                sawSerialCompositionBaseValue = "";
                return;
              }

              commitSawSerialStableValue(normalized);
              sawSerialCompositionBaseValue = "";
              validateSawSerialNumber();
            });
            sawSerialNumberInput.addEventListener("beforeinput", (event) => {
              if (
                !(event instanceof InputEvent) ||
                event.inputType.startsWith("delete") ||
                event.inputType === "historyUndo" ||
                event.inputType === "historyRedo"
              ) {
                return;
              }

              if (
                event.inputType === "insertText" ||
                event.inputType === "insertCompositionText"
              ) {
                const insertedText = event.data ?? "";
                if (!insertedText) {
                  event.preventDefault();
                  return;
                }

                const selectionStart =
                  sawSerialNumberInput.selectionStart ?? sawSerialNumberInput.value.length;
                const isEditingFirstCharacter = selectionStart === 0;
                const normalizedInsertedText = isEditingFirstCharacter
                  ? normalizeSawSerialFirstCharacter(insertedText)
                  : insertedText;

                if (
                  (isEditingFirstCharacter && !/[CPI]/.test(normalizedInsertedText)) ||
                  (!isEditingFirstCharacter && !/^\\d+$/.test(insertedText))
                ) {
                  event.preventDefault();
                  return;
                }

                if (event.isComposing || event.inputType === "insertCompositionText") {
                  event.preventDefault();
                  replaceSawSerialSelection(sawSerialNumberInput, normalizedInsertedText);
                  return;
                }

                event.preventDefault();
                replaceSawSerialSelection(sawSerialNumberInput, normalizedInsertedText);
                return;
              }

              if (event.inputType === "insertFromPaste") {
                event.preventDefault();
                const pastedText =
                  event.data ??
                  event.dataTransfer?.getData("text/plain") ??
                  "";
                replaceSawSerialSelection(sawSerialNumberInput, pastedText);
                return;
              }

              event.preventDefault();
            });
            sawSerialNumberInput.addEventListener("input", () => {
              const normalized = normalizeSawSerialNumberValue(sawSerialNumberInput.value);
              if (sawSerialImeActive) {
                if (
                  sawSerialCompositionBaseValue.length > 0 &&
                  sawSerialNumberInput.value !== sawSerialCompositionBaseValue
                ) {
                  restoreSawSerialStableValue();
                  return;
                }

                if (normalized !== sawSerialNumberInput.value) {
                  restoreSawSerialStableValue();
                  return;
                }

                commitSawSerialStableValue(normalized);
                validateSawSerialNumber();
                return;
              }

              if (sawSerialNumberInput.value !== normalized) {
                restoreSawSerialStableValue();
                return;
              }

              commitSawSerialStableValue(normalized);
              validateSawSerialNumber();
            });
            sawSerialNumberInput.addEventListener("blur", validateSawSerialNumber);
          }

          if (occurredDateInput && occurredDateDisplayButton && occurredDatePicker) {
            occurredDateDisplayButton.addEventListener("click", () => {
              if (occurredDatePickerOpen) {
                closeOccurredDatePicker();
                return;
              }

              openOccurredDatePicker();
            });

            occurredDatePrevMonthButton?.addEventListener("click", () => {
              occurredDateViewMonth -= 1;
              if (occurredDateViewMonth < 1) {
                occurredDateViewMonth = 12;
                occurredDateViewYear -= 1;
              }
              renderOccurredDatePicker();
            });

            occurredDateNextMonthButton?.addEventListener("click", () => {
              occurredDateViewMonth += 1;
              if (occurredDateViewMonth > 12) {
                occurredDateViewMonth = 1;
                occurredDateViewYear += 1;
              }
              renderOccurredDatePicker();
            });

            occurredDateInput.addEventListener("change", syncOccurredDateDisplay);

            document.addEventListener("pointerdown", (event) => {
              if (
                occurredDatePickerOpen &&
                !occurredDatePicker.contains(event.target) &&
                !occurredDateDisplayButton.contains(event.target)
              ) {
                closeOccurredDatePicker();
              }
            });

            document.addEventListener("keydown", (event) => {
              if (event.key === "Escape" && occurredDatePickerOpen) {
                closeOccurredDatePicker();
              }
            });

            syncOccurredDateDisplay();
          }

          [occurredTimeMeridiem, occurredTimeHour, occurredTimeMinute].forEach((input) => {
            input?.addEventListener("change", validateOccurredTime);
          });

          if (timeUnknownInput) {
            timeUnknownInput.addEventListener("change", updateOccurredTimeState);
          }

          updateOccurredTimeState();

          if (attachmentZone && attachmentInput) {
            attachmentZone.addEventListener("click", () => attachmentInput.click());
            attachmentZone.addEventListener("keydown", (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                attachmentInput.click();
              }
            });
            attachmentZone.setAttribute("tabindex", "0");
            attachmentZone.setAttribute("role", "button");

            attachmentZone.addEventListener("dragover", (event) => {
              event.preventDefault();
              attachmentZone.classList.add("drag-over");
            });
            attachmentZone.addEventListener("dragleave", () => {
              attachmentZone.classList.remove("drag-over");
            });
            attachmentZone.addEventListener("drop", (event) => {
              event.preventDefault();
              attachmentZone.classList.remove("drag-over");
              addFiles(event.dataTransfer?.files);
            });

            attachmentInput.addEventListener("change", () => {
              addFiles(attachmentInput.files);
            });
          }

          if (form) {
            form.addEventListener("submit", async (event) => {
              const phoneValid = validatePhone();
              const emailValid = validateEmail();
              const occurredTimeValid = validateOccurredTime();
              const sawSerialValid = validateSawSerialNumber();

              event.preventDefault();
              setSubmitError("");

              if (phoneValid && emailValid && occurredTimeValid && sawSerialValid) {
                try {
                  syncAttachmentInputFiles();
                  const response = await fetch(form.action, {
                    method: "POST",
                    body: new FormData(form)
                  });
                  const result = await response.json().catch(() => null);

                  if (response.ok && result?.ok && typeof result.receiptNumber === "string") {
                    resetCustomerFormState();
                    showSuccessView(result.receiptNumber);
                    return;
                  }

                  setSubmitError(result?.message || "접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
                } catch {
                  setSubmitError("접수 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
                }
                return;
              }

              if (!phoneValid && phoneInput) {
                phoneInput.focus();
                return;
              }

              if (!emailValid && emailInput) {
                emailInput.focus();
                return;
              }

              if (!occurredTimeValid && occurredTimeMeridiem) {
                occurredTimeMeridiem.focus();
                return;
              }

              if (!sawSerialValid && sawSerialNumberInput) {
                sawSerialNumberInput.focus();
              }
            });
          }
        </script>
      </body>
    </html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
