# docs/web

Artifact(웹 페이지)로 발행하는 문서의 HTML 원본.

- 내용의 단일 출처는 상위 폴더의 마크다운(`USER_GUIDE.md` 등)이다 — 내용을 고치면 둘 다 고친다.
- 디자인 토큰은 `apps/web/app/globals.css` 의 VECTA 라이트 인디고를 따른다(라이트 전용).
- 네이비 패널은 기존 규칙대로 **기계가 낸 데이터**에만 쓴다.

## dist/ — 남에게 보내는 파일

이 폴더의 원본에는 `<!doctype>`·`<head>` 가 없다(Artifact 가 발행할 때 껍데기를 씌운다).
그대로 보내면 file:// 로 열었을 때 **한글이 깨지고**(charset 없음) **폰에서 축소된다**(viewport 없음).

그래서 보내는 파일은 따로 만든다:

```bash
npm run docs:html      # docs/web/*.html → docs/web/dist/*.html
```

`dist/` 는 매번 통째로 다시 만든다 — **직접 수정하지 말 것.** 고칠 것은 이 폴더의 원본이다.
생성물에는 문서 간 이동 띠와 인쇄(PDF) 규칙이 더해진다.
