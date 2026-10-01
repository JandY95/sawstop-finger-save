import { renderAdminReportHtml } from "../src/admin/report.ts";
import { buildBrowserRunPdfOptions } from "../src/admin/report-pdf.ts";
import {
  ACCIDENT_REPORT_DRAFT_MARKER,
  ATTACHMENT_TYPE_OPTIONS
} from "../src/constants.ts";
import { CANONICAL_REPORT_SECTIONS } from "../src/report-draft.ts";
import type {
  AccidentPageBodyBlockSummary,
  AccidentReportAttachmentSummary
} from "../src/types.ts";

interface FixtureBrowserBinding {
  quickAction(action: "pdf", options: unknown): Promise<Response>;
}

interface FixtureEnv {
  BROWSER: FixtureBrowserBinding;
}

export const T42_FIXTURE_ENGLISH_TEXT =
  "English glyph check ABC xyz 0123.";
export const T42_FIXTURE_KOREAN_TEXT =
  "개인정보 없는 한글 글꼴 확인 문장";
export const T42_FIXTURE_SECTION_HEADINGS = CANONICAL_REPORT_SECTIONS.map(
  ({ heading }) => heading
);

const fixturePageId = "t42-pii-free-fixture-page";
const fixtureColors = ["#dc2626", "#2563eb", "#16a34a", "#7c3aed"];
const fixtureAttachments = [
  {
    attachmentPageId: "t42-pii-free-attachment-01",
    attachmentType: ATTACHMENT_TYPE_OPTIONS[0],
    displayOrder: 1
  },
  {
    attachmentPageId: "t42-pii-free-attachment-02",
    attachmentType: ATTACHMENT_TYPE_OPTIONS[1],
    displayOrder: 2
  },
  {
    attachmentPageId: "t42-pii-free-attachment-03",
    attachmentType: ATTACHMENT_TYPE_OPTIONS[2],
    displayOrder: 3
  },
  {
    attachmentPageId: "t42-pii-free-attachment-04",
    attachmentType: ATTACHMENT_TYPE_OPTIONS[2],
    displayOrder: 4
  }
] satisfies AccidentReportAttachmentSummary[];

export const T42_FIXTURE_ATTACHMENT_CAPTIONS = fixtureAttachments.map(
  ({ attachmentType }, index) =>
    `Attachment ${index + 1} — ${attachmentType}`
);

const fixtureBlocks: AccidentPageBodyBlockSummary[] = [
  {
    id: "t42-fixture-report-title",
    type: "paragraph",
    text: ACCIDENT_REPORT_DRAFT_MARKER
  },
  ...CANONICAL_REPORT_SECTIONS.flatMap((section, sectionIndex) => [
    {
      id: `t42-fixture-section-${sectionIndex + 1}`,
      type: "heading_2" as const,
      text: section.heading
    },
    ...section.fields.flatMap((field, fieldIndex) => [
      {
        id: `t42-fixture-label-${sectionIndex + 1}-${fieldIndex + 1}`,
        type: "paragraph" as const,
        text: field.label
      },
      {
        id: `t42-fixture-value-${sectionIndex + 1}-${fieldIndex + 1}`,
        type: "paragraph" as const,
        text:
          field.rule === "attachment_placeholder"
            ? ""
            : sectionIndex === 0 && fieldIndex === 0
              ? `${T42_FIXTURE_ENGLISH_TEXT} ${T42_FIXTURE_KOREAN_TEXT}`
              : `PII-free fixture value ${sectionIndex + 1}.${fieldIndex + 1}`
      }
    ])
  ])
];

function fixtureImageDataUrl(index: number) {
  const number = String(index + 1).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="${fixtureColors[index]}"/>
    <text x="320" y="165" text-anchor="middle" font-family="sans-serif" font-size="64" font-weight="700" fill="white">FIXTURE ${number}</text>
    <text x="320" y="235" text-anchor="middle" font-family="sans-serif" font-size="32" fill="white">NO CUSTOMER DATA</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildT42BrowserRunFixtureHtml(request: Request) {
  const rendererRequest = new Request(
    new URL(`/admin/report?pageId=${fixturePageId}`, request.url)
  );
  const canonicalHtml = renderAdminReportHtml(
    rendererRequest,
    fixturePageId,
    fixtureBlocks,
    fixtureAttachments
  );
  let imageIndex = 0;
  const inlinedHtml = canonicalHtml.replace(
    /(<img class="report-attachment-image" src=")[^"]+("[^>]*>)/g,
    (_match, prefix: string, suffix: string) => {
      const dataUrl = fixtureImageDataUrl(imageIndex);
      imageIndex += 1;
      return `${prefix}${dataUrl}${suffix}`;
    }
  );

  if (imageIndex !== fixtureAttachments.length || imageIndex !== 4) {
    throw new Error("T42 fixture must contain exactly four canonical attachments");
  }

  return inlinedHtml;
}

export default {
  async fetch(request: Request, env: FixtureEnv) {
    const url = new URL(request.url);
    if (request.method !== "GET" || url.pathname !== "/fixture.pdf") {
      return new Response("Not found", { status: 404 });
    }

    const fixtureHtml = buildT42BrowserRunFixtureHtml(request);
    return env.BROWSER.quickAction(
      "pdf",
      buildBrowserRunPdfOptions(fixtureHtml, [])
    );
  }
};
