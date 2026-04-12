export const ACCIDENT_DB_PROPERTY_NAMES = {
  receiptNumber: "접수번호",
  status: "상태",
  occurredAt: "Date of Occurence",
  businessOrSchoolName: "Business or School Name (NA if Not Applicable)",
  operatorName: "Operator Name",
  touchedPersonName: "Name of Person Who Touched the Blade",
  phone: "Phone",
  email: "Email",
  promotionalConsent: "Consent for Promotional Use",
  bodyPartContacted: "Body Part Contacted (right or left hand, finger, thumb, etc.)",
  visibleInjuryMark: "Was There A Visible Injury Mark?",
  woundTreatmentMethods: "Wound treatment methods",
  estimatedInjuryWithoutSawStop:
    "Estimate of the injury if it were to have occured while using a non-SawStop saw",
  incidentCause: "Cause of the Incident (Customer Feedback)",
  incidentDescription:
    "To the best of your ability, please describe the circumstances of how the accident happened",
  sawSerialNumber: "Saw Serial Number",
  brakeCartridgeSerialNumber: "Brake Cartridge Serial Number",
  bladeType: "Type of blade being used",
  bladeDetails: "Saw Blade Details",
  materialType: "Type of Material Being Cut?",
  workpieceSizeAndCutType: "Workpiece Size & Cut Type",
  safetyDeviceStatus:
    "Was a Blade Guard, Riving Knife or Splitter in Place? (please specify which, if any)",
  otherDevicesUsed: "Were There Other Devices Being Used When the Cut was Made?",
  wearingGloves: "Was the saw operator wearing gloves at the time?",
  approximateFeedRate:
    "What was the approximate feed rate of the material when the accident occured (inches per second)?",
  attachmentUploadStatus: "첨부 업로드 상태"
} as const;

export const ATTACHMENT_DB_PROPERTY_NAMES = {
  attachmentId: "첨부 ID",
  accidentRelation: "사고건",
  fileName: "파일명",
  r2Key: "R2 Key",
  previewUrl: "미리보기 링크",
  thumbnailUrl: "썸네일",
  attachmentType: "첨부 유형",
  uploadSource: "업로드 출처",
  status: "상태",
  displayOrder: "표시 순서"
} as const;

export const ACCIDENT_DB_PREPARED_PROPERTY_NAMES = {
  attachmentFinalCheck: "첨부 최종 확인 완료"
} as const;

export const ASIA_SEOUL_TIMEZONE = "Asia/Seoul";
export const UNKNOWN_OCCURRENCE_TIME = "12:00:00";
export const DEFAULT_BUSINESS_OR_SCHOOL_NAME = "NA";
export const INITIAL_ACCIDENT_STATUS = "접수";

export const ATTACHMENT_UPLOAD_STATUS = {
  processing: "처리중",
  complete: "완료",
  partialFailure: "일부 실패",
  failure: "실패"
} as const;

export const ATTACHMENT_DB_STATUS = {
  current: "현재",
  trash: "휴지통",
  permanentlyDeleted: "영구 삭제"
} as const;

export const ATTACHMENT_TYPE_OPTIONS = [
  "손가락 사진",
  "브레이크 카트리지 사진",
  "기타"
] as const;

export const ATTACHMENT_SOURCE_OPTIONS = ["customer", "admin"] as const;

export const PROMOTIONAL_CONSENT_OPTIONS = ["동의 (YES)", "미동의 (NO)"] as const;
export const VISIBLE_INJURY_MARK_OPTIONS = ["예 (YES)", "아니요 (NO)"] as const;
export const BLADE_TYPE_OPTIONS = ['10" Standard', '8" Dado'] as const;
export const GLOVES_OPTIONS = ["예 (YES)", "아니요 (NO)"] as const;
export const FEED_RATE_OPTIONS = [
  "아주 느림 (Very slow)",
  "느림 (Slow)",
  "보통 (Normal)",
  "빠름 (Fast)",
  "매우 빠름 (Very fast)"
] as const;
export const OTHER_DEVICE_OPTIONS = [
  "푸시스틱 (Push Stick)",
  "페더보드 (Feather Board)",
  "마이터 게이지 (Miter Gauge)",
  "기타 보조장치 (Other)",
  "사용하지 않음 (None)"
] as const;

export const NOTION_API_BASE_URL = "https://api.notion.com/v1";
export const NOTION_API_VERSION = "2022-06-28";
export const SUBMIT_ROUTE = "/submit";
export const ADMIN_ACCIDENT_SEARCH_ROUTE = "/admin/accidents/search";
export const ADMIN_ATTACHMENT_LIST_ROUTE = "/admin/attachments/list";
export const ADMIN_UPLOAD_ROUTE = "/admin/upload";
export const ADMIN_ATTACHMENT_TYPE_UPDATE_ROUTE = "/admin/attachments/type";
// TODO(open issue): 관리자 보완 업로드의 "업로드 출처" 속성명과 허용값은
// 라이브 첨부 DB 스키마 확정 전까지 runtime write 대상으로 사용하지 않는다.
export const ADMIN_PAGE_ROUTE = "/admin";
export const ADMIN_LOGIN_ROUTE = "/admin/login";
export const ADMIN_LOGOUT_ROUTE = "/admin/logout";
export const ADMIN_SESSION_COOKIE_NAME = "__Host-sawstop-admin-session";
export const ADMIN_LOGIN_STATE_COOKIE_NAME = "__Host-sawstop-admin-login-state";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 8;
export const ADMIN_LOGIN_FAILURE_LIMIT = 5;
export const ADMIN_LOGIN_LOCK_SECONDS = 60 * 15;
export const CUSTOMER_ATTACHMENT_FIELD_NAME = "attachments";
export const R2_TMP_PREFIX = "tmp";
export const R2_ATTACHMENTS_PREFIX = "attachments";
export const ATTACHMENT_PROCESSING_QUEUE_NAME = "sawstop-attachment-processing";
export const CUSTOMER_SUCCESS_MESSAGE = "접수가 완료되었습니다.";
export const CUSTOMER_FAILURE_MESSAGE =
  "접수가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.";
