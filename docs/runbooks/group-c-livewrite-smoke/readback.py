from pathlib import Path
from urllib import request, parse
import json
import re
import http.cookiejar
import urllib.error

ROOT = Path('/home/uandme/vibe/sawstop-finger-save')
OUT = ROOT / 'docs/runbooks/group-c-livewrite-smoke'
SUBMIT = json.loads((OUT / 'submit-response.json').read_text())
RESPONSE = json.loads(SUBMIT['submitResponse'])
RECEIPT = RESPONSE['receiptNumber']
MARKER = SUBMIT['marker']


def load_dev_vars():
    vals = {}
    for raw in (ROOT / '.dev.vars').read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        vals[key.strip()] = value.strip().strip('"').strip("'")
    return vals


def notion_json(path, payload=None):
    vals = load_dev_vars()
    data = json.dumps(payload or {}).encode('utf-8') if payload is not None else None
    req = request.Request(
        'https://api.notion.com/v1' + path,
        data=data,
        method='POST' if payload is not None else 'GET',
        headers={
            'Authorization': 'Bearer ' + vals['NOTION_TOKEN'],
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json',
        },
    )
    with request.urlopen(req, timeout=30) as resp:
        return resp.status, json.loads(resp.read().decode('utf-8'))


def prop_value(prop):
    t = prop.get('type')
    if t == 'title':
        return ''.join(x.get('plain_text', '') for x in prop.get('title', []))
    if t == 'rich_text':
        return ''.join(x.get('plain_text', '') for x in prop.get('rich_text', []))
    if t == 'phone_number':
        return prop.get('phone_number')
    if t == 'email':
        return prop.get('email')
    if t == 'status':
        v = prop.get('status')
        return v.get('name') if v else None
    if t == 'select':
        v = prop.get('select')
        return v.get('name') if v else None
    if t == 'multi_select':
        return [x.get('name') for x in prop.get('multi_select', [])]
    if t == 'date':
        v = prop.get('date')
        return v.get('start') if v else None
    if t == 'checkbox':
        return prop.get('checkbox')
    if t == 'number':
        return prop.get('number')
    if t == 'relation':
        return [x.get('id') for x in prop.get('relation', [])]
    if t == 'url':
        return prop.get('url')
    return None

vals = load_dev_vars()
# Query accident by receipt.
status, data = notion_json('/databases/' + vals['NOTION_ACCIDENT_DB_ID'] + '/query', {
    'filter': {'property': '접수번호', 'title': {'equals': RECEIPT}},
    'page_size': 5,
})
results = data.get('results', [])
if len(results) != 1:
    raise SystemExit(f'expected exactly one accident page for receipt, got {len(results)}')
page = results[0]
page_id = page['id']
props = page.get('properties', {})
selected = {name: prop_value(prop) for name, prop in props.items()}

# Query attachment DB relation for no-attachment boundary.
att_status, att_data = notion_json('/databases/' + vals['NOTION_ATTACHMENT_DB_ID'] + '/query', {
    'filter': {'property': '사고건', 'relation': {'contains': page_id}},
    'page_size': 10,
})
attachment_count = len(att_data.get('results', []))

# Authenticated report fetch from local worker.
cj = http.cookiejar.CookieJar()
opener = request.build_opener(request.HTTPCookieProcessor(cj))
login_body = parse.urlencode({'password': vals['ADMIN_PASSWORD']}).encode()
login_req = request.Request(
    'http://127.0.0.1:8787/admin/login',
    data=login_body,
    method='POST',
    headers={'Content-Type': 'application/x-www-form-urlencoded'},
)
opener.open(login_req, timeout=10).read()
report_url = 'http://127.0.0.1:8787/admin/report?' + parse.urlencode({'pageId': page_id})
report_resp = opener.open(request.Request(report_url, method='GET'), timeout=30)
report_html = report_resp.read().decode('utf-8', 'replace')

# Redact local HTML artifact.
redacted = report_html
for value in [
    selected.get('Phone'),
    selected.get('Email'),
    selected.get('Business or School Name (NA if Not Applicable)'),
    selected.get('Operator Name'),
    selected.get('Name of Person Who Touched the Blade'),
]:
    if isinstance(value, str) and value:
        redacted = redacted.replace(value, '[REDACTED]')
redacted = redacted.replace(page_id, '<redacted-page-id>')
(OUT / 'report-raw.html').write_text(report_html)
(OUT / 'report-redacted.html').write_text(redacted)

representative = {
    'receipt': selected.get('접수번호'),
    'status': selected.get('상태'),
    'bodyPartContainsMarker': MARKER in str(selected.get('Body Part Contacted (right or left hand, finger, thumb, etc.)')),
    'incidentDescriptionContainsMarker': MARKER in str(selected.get('To the best of your ability, please describe the circumstances of how the accident happened')),
    'materialContainsMarker': MARKER in str(selected.get('Type of Material Being Cut?')),
    'sawSerialNumber': selected.get('Saw Serial Number'),
    'attachmentUploadStatus': selected.get('첨부 업로드 상태'),
    'promotionalConsent': selected.get('Consent for Promotional Use'),
}
summary = {
    'scope': 'Group C minimal no-attachment customer submit live-write smoke',
    'marker': MARKER,
    'receiptNumber': RECEIPT,
    'pageIdSuffix': page_id.replace('-', '')[-6:],
    'submitStatus': SUBMIT['submitStatus'],
    'submitOk': RESPONSE.get('ok') is True,
    'notionAccidentQueryStatus': status,
    'matchingAccidentPages': len(results),
    'representativeProperties': representative,
    'attachmentRelationQueryStatus': att_status,
    'attachmentRowsForPage': attachment_count,
    'reportStatus': report_resp.status,
    'reportContainsPopulatedReportValues': 'Populated Report Values' in report_html,
    'reportContainsReceipt': RECEIPT in report_html,
    'reportContainsMarker': MARKER in report_html,
    'reportContainsFailureMessage': '접수가 완료되지 않았습니다' in report_html,
    'files': {
        'reportRaw': str(OUT / 'report-raw.html'),
        'reportRedacted': str(OUT / 'report-redacted.html'),
    },
    'nonApprovals': [
        'admin upload', 'attachment update/type/trash/restore/FIFO POST', 'deploy',
        'cleanup execution', 'propagation', 'OI/Core mutation', 'destructive commands'
    ],
}
(OUT / 'livewrite-readback-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps(summary, ensure_ascii=False))
