from pathlib import Path
from urllib import request
import json
import uuid
import urllib.error
import datetime

root = Path('/home/uandme/vibe/sawstop-finger-save')
out = root / 'docs/runbooks/group-c-livewrite-smoke'
out.mkdir(parents=True, exist_ok=True)
marker = 'HERMES-GROUP-C-' + datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S') + '-' + uuid.uuid4().hex[:6]
phone_suffix = datetime.datetime.utcnow().strftime('%M%S')
fields = {
    'businessOrSchoolName': 'Hermes Group C Test Lab',
    'phone': '010-7777-' + phone_suffix,
    'email': 'hermes.groupc+' + marker.lower() + '@example.com',
    'occurredDate': '2026-05-25',
    'timeUnknown': 'on',
    'operatorName': 'Hermes Test Operator',
    'touchedPersonName': 'Hermes Test Subject',
    'bodyPartContacted': '오른손 검지 ' + marker,
    'visibleInjuryMark': '아니요 (NO)',
    'woundTreatmentMethods': 'TEST no treatment ' + marker,
    'estimatedInjuryWithoutSawStop': 'TEST estimated injury ' + marker,
    'incidentCause': 'TEST live-write smoke cause ' + marker,
    'incidentDescription': 'TEST live-write smoke no-attachment submit created by Hermes. Marker ' + marker,
    'sawSerialNumber': 'C123456789',
    'brakeCartridgeSerialNumber': 'BC-' + marker[-6:],
    'bladeType': '10" Standard',
    'bladeDetails': 'TEST 40T blade ' + marker,
    'materialType': '테스트 원목 ' + marker,
    'workpieceSizeAndCutType': 'TEST 100mm rip cut ' + marker,
    'safetyDeviceStatus': 'TEST riving knife present ' + marker,
    'otherDevicesUsed': '사용하지 않음 (None)',
    'wearingGloves': '아니요 (NO)',
    'approximateFeedRate': '보통 (Normal)',
    'promotionalConsent': '미동의 (NO)',
    'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX',
}

boundary = '----HermesBoundary' + uuid.uuid4().hex
body = bytearray()
for key, value in fields.items():
    body.extend(f'--{boundary}\r\n'.encode())
    body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
    body.extend(str(value).encode('utf-8'))
    body.extend(b'\r\n')
body.extend(f'--{boundary}--\r\n'.encode())

req = request.Request(
    'http://127.0.0.1:8787/submit',
    data=bytes(body),
    method='POST',
    headers={'Content-Type': f'multipart/form-data; boundary={boundary}'},
)
try:
    resp = request.urlopen(req, timeout=30)
    status = resp.status
    text = resp.read().decode('utf-8', 'replace')
except urllib.error.HTTPError as exc:
    status = exc.code
    text = exc.read().decode('utf-8', 'replace')

summary = {
    'marker': marker,
    'submitStatus': status,
    'submitResponse': text,
    'payloadSummary': {
        'noAttachments': True,
        'phoneSuffix': fields['phone'][-4:],
        'emailDomain': 'example.com',
        'sawSerialNumber': fields['sawSerialNumber'],
        'materialMarkerPresent': marker in fields['materialType'],
        'descriptionMarkerPresent': marker in fields['incidentDescription'],
    },
}
(out / 'submit-response.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2))
print(json.dumps(summary, ensure_ascii=False))
