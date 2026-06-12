# No-Attachment Live Submit Smoke Approval Packet — SawStop Finger Save

Status: prepared-only / not executed
Date: 2026-06-10
Repo: `/srv/harness-lab/repos/sawstop-finger-save`
Target Worker: `https://sawstop-finger-save.chbjbj.workers.dev`
Target route: `POST /submit`

## Purpose

Prepare a narrow owner approval packet for exactly one live customer submit smoke with no attachments against the deployed Worker.

This packet does not approve or execute submit. Submit is a live-write action because it creates a TEST Notion accident page.

## Current prerequisite state

Already verified:

- Cloudflare auth/resource/secret-name readback: PASS
- Worker deploy: PASS
- GET/read-only post-deploy verification: PASS
- Public form GET `/`: 200
- `/admin` GET auth boundary: 200 with login/auth boundary

Evidence:

```text
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/cloudflare-auth-resource-secret-name-readback-corrected-retry-20260610T050155Z.json
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/deploy-and-readonly-postverify-20260610T051014Z.json
```

## Proposed live action

Execute exactly one customer submit with no attachment files.

Target:

```text
GET  https://sawstop-finger-save.chbjbj.workers.dev/
POST https://sawstop-finger-save.chbjbj.workers.dev/submit
```

Preferred execution method:

```text
Manual browser submit against the deployed public form.
```

Reason:

- The deployed form includes Cloudflare Turnstile.
- Live Turnstile tokens should be produced by the browser widget.
- Do not bypass or weaken Turnstile for this smoke.

## One-submit boundary

Allowed after explicit approval:

```text
one no-attachment customer submit
read-only verification of the resulting receipt/page
redacted evidence write to diagnostics
```

Forbidden even after this approval unless separately approved:

```text
second submit
attachment submit
admin upload
Queue smoke
cleanup / deletion
GitHub push / PR / merge / workflow dispatch
Core mutation / propagation
secret/token/password output
```

## Test data constraints

The submit must be clearly marked as TEST data.

Required form properties should use safe synthetic values only:

```text
business/school name: TEST SawStop Smoke — 2026-06-10
phone: synthetic valid Korean-format phone number
email: synthetic test email address
occurred date: current/recent test date
occurred time: either valid HH:mm or timeUnknown=true
body part contacted: TEST value
visible injury mark: one allowed UI option
incident description: clear TEST marker and no real personal data
saw serial number: valid pattern [IPC] + 9 digits
material type: TEST wood/material value
promotional consent: one allowed UI option
attachments: none
```

Do not use real personal data.

Do not print or store secret/token/password values.

## Expected side effect

```text
one TEST Notion accident page is created
```

Expected returned JSON shape:

```json
{
  "ok": true,
  "receiptNumber": "[REDACTED_RECEIPT]",
  "message": "[success message]"
}
```

## Expected non-side effects

Because this is no-attachment:

```text
no R2 attachment object
no Queue attachment processing
no attachment DB row
no admin upload
no cleanup
```

## Post-submit read-only verification

After the one submit, verify only by read-only operations:

1. Capture redacted response status and receipt number.
2. Confirm public response does not expose internal state.
3. Confirm Notion accident page exists for the receipt.
4. Confirm required basic properties are populated.
5. Confirm default accident page body exists.
6. Confirm no attachment evidence was created for this no-attachment submit, where read-only checks are available.
7. Write redacted evidence JSON under:

```text
/home/jun/.hermes/diagnostics/sawstop-group-f-queue-finalization-20260531/
```

Suggested evidence file name:

```text
no-attachment-live-submit-smoke-<UTC_TIMESTAMP>.json
```

## Stop conditions

Stop immediately if any of these happen:

```text
Turnstile cannot be completed normally
submit response is not HTTP 200
response body is not JSON success
more than one submit would be required
receipt number cannot be captured
Notion readback cannot identify the created TEST page
any secret/token/password would need to be printed
any cleanup or deletion becomes tempting during verification
```

If stopped, record a HOLD/FAIL evidence artifact and do not retry live submit without a new approval.

## Approval text required before execution

Use this exact narrow approval style:

```text
승인: deployed sawstop-finger-save Worker에서 no-attachment customer submit smoke를 정확히 1회 실행하고, 생성된 TEST Notion page/receipt만 redacted evidence로 기록해줘. admin upload/attachment submit/Queue smoke/cleanup/GitHub mutation/Core mutation은 금지.
```

## Current decision

Prepared only. Not executed.
