# docs/web

문서를 «보여 주는 형태»로 굽는 자리. 내용의 단일 출처는 상위 폴더의 마크다운
(`USER_GUIDE.md` · `SERVICE_OVERVIEW.md` · `PARTNERSHIP_PROPOSAL.md`)이다.

| 여기 있는 것 | 무엇 |
|---|---|
| `*.html` | Artifact 발행용 원본 (`<!doctype>`·`<head>` 없음 — 발행 시 호스트가 씌운다) |
| `dist/*.html` | 남에게 보내는 완전한 HTML (`npm run docs:html`) |
| `dist/*.pptx` | 발표용 장표 (`npm run docs:pptx`) |

```bash
npm run docs:all      # 둘 다
```

`dist/` 는 .gitignore 대상이고 매번 통째로 다시 만든다 — **직접 수정하지 말 것.**

## 디자인

토큰은 `apps/web/app/globals.css` 의 VECTA 라이트 인디고를 따른다(웹은 라이트 전용).
네이비 패널은 기존 규칙대로 **기계가 낸 데이터**에만 쓴다. 장표는 네이비가 지배하고
(표지·구획·마무리) 내용 장표만 밝게 뒤집는 구조이며, 반복 모티프는 델타 삼각형이다.

## 함정 두 가지 (겪은 것)

1. **HTML 원본을 그대로 보내면 안 된다.** charset 선언이 없어 file:// 로 열면 한글이
   깨지고, viewport 가 없어 폰에서 축소된다. 그래서 `dist/` 를 따로 굽는다.
2. **음수 크기 도형이 있으면 PowerPoint 가 파일을 열지 않는다.** 본문 없는 강조
   박스에서 `높이 − 여백` 이 음수가 되어 실제로 겪었다. `validate.py` 도
   LibreOffice 도 통과시키는데 PowerPoint 만 거부해서 원인을 찾기 어렵다.
   지금은 `build-docs-pptx.mjs` 가 빌드 끝에 직접 검사해 막는다.
