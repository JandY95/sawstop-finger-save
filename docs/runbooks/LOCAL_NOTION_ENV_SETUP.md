# LOCAL_NOTION_ENV_SETUP

## 목적

`cleanup:fifo-trash:dry-run`을 로컬에서 실행할 때 필요한 Notion 환경변수 기준을 고정한다.

이 문서는 로컬 운영 편의용 runbook이다.

- live cleanup을 허용하지 않는다.
- execute mode를 허용하지 않는다.
- scheduled Worker/Cron cleanup을 허용하지 않는다.
- source-of-truth movement를 수행하지 않는다.
- `NOTION_TOKEN` 값은 문서, Git, 채팅 로그에 남기지 않는다.

## 적용 대상

- 로컬 PowerShell 세션
- 수동 operator dry-run
- 명령: `npm run cleanup:fifo-trash:dry-run`

## 필요한 환경변수

아래 DB ID는 로컬 세션에 넣어도 된다.

~~~powershell
$env:NOTION_SETTINGS_DB_ID = "a432f5acc8554f7db141f9ab2dc86f35"
$env:NOTION_ATTACHMENT_DB_ID = "3376eb7f574c803b894af22a97ff4b30"
$env:NOTION_ACCIDENT_DB_ID = "2a26eb7f574c80d09962eecfe7868117"
~~~

`NOTION_TOKEN`은 비밀값이다.

토큰은 Notion integration에서 직접 복사한 뒤, 터미널 세션에만 넣는다.

~~~powershell
$env:NOTION_TOKEN = "<paste-token-in-terminal-only>"
~~~

주의:

- 실제 토큰 값을 문서에 적지 않는다.
- 실제 토큰 값을 Git에 commit하지 않는다.
- 실제 토큰 값을 채팅창에 붙여넣지 않는다.
- 토큰을 영구 환경변수로 저장하지 않는다.

## 권장 실행 순서

PowerShell에서 먼저 현재 로컬 clone 위치로 이동한 뒤, repo root를 확인하고 실행한다.

저장소 경로는 회사, 집, 다른 PC마다 달라질 수 있으므로 이 runbook은 특정 절대 경로를 기준으로 하지 않는다.

~~~powershell
# 먼저 본인이 받은 sawstop-finger-save 폴더로 이동한다.
# 예: cd "D:\work\sawstop-finger-save"

$repoRoot = (git rev-parse --show-toplevel).Trim()
$repoName = Split-Path $repoRoot -Leaf

if ($repoName -ne "sawstop-finger-save") {
  throw "wrong repo: expected sawstop-finger-save, got $repoName"
}

Set-Location $repoRoot

$env:NOTION_SETTINGS_DB_ID = "a432f5acc8554f7db141f9ab2dc86f35"
$env:NOTION_ATTACHMENT_DB_ID = "3376eb7f574c803b894af22a97ff4b30"
$env:NOTION_ACCIDENT_DB_ID = "2a26eb7f574c80d09962eecfe7868117"

$env:NOTION_TOKEN = "<paste-token-in-terminal-only>"

npm run cleanup:fifo-trash:dry-run
~~~

## 의도적으로 live-read를 생략할 때

Notion 후보 조회 없이 wrapper의 safety boundary만 확인하려면 아래 명령을 사용한다.

~~~powershell
npm run cleanup:fifo-trash:dry-run -- --skip-live-read
~~~

이 모드는 실제 후보 조회가 아니다.

## 정상 기준

`npm run cleanup:fifo-trash:dry-run`은 실제 Notion live-read 후보 조회 명령이다.

따라서 아래 값이 없으면 실패하는 것이 정상이다.

- `NOTION_TOKEN`
- `NOTION_ATTACHMENT_DB_ID`

이 실패를 cleanup 실패로 오해하지 않는다.
필요한 live-read 환경이 없는 상태로 실행한 것이다.

## 금지 기준

아래 작업은 별도 명시 승인 전까지 금지한다.

- FIFO cleanup live execution
- execute mode
- scheduled Worker/Cron cleanup
- 5GB storage measurement basis selection
- source-of-truth movement
- SawStop 전용 Notion/R2/FIFO 규칙의 core 자동 승격

## 확인 명령

~~~powershell
npm run cleanup:fifo-trash:dry-run -- --help
npm run cleanup:fifo-trash:dry-run -- --skip-live-read
~~~

실제 후보 조회가 필요할 때만 `NOTION_TOKEN`을 세션에 넣고 아래 명령을 실행한다.

~~~powershell
npm run cleanup:fifo-trash:dry-run
~~~
