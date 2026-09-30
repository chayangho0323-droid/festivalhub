// apply-overrides.js — 주최 측·방문자가 알려준 정정 사항(festival-overrides.json)을 축제 데이터 위에 덮어쓴다.
// 공공데이터는 매일 다시 받아오므로 원본 파일을 고치면 하루 만에 되돌아간다 → fetch-festivals.js(festivals.json 저장 직전)와
// build-pages.js(아카이브 로드 뒤)에서 매번 호출한다. 랜딩(app.js)은 festivals.json을 직접 읽으므로 수집 단계 적용이 필수.
//
// festival-overrides.json 형식:
//   [{ "key": "광주펫크닉", "note": "2026-09-29 광주관광공사 요청", "set": { "startDate": "20261017", "tel": "..." } }]
//   key = 정규화한 축제 이름(공백·회차·연도·괄호 제거, 소문자)에 포함되는 문자열
//
// 단독 실행(node apply-overrides.js)하면 festivals.json을 제자리에서 고친다 (정정 요청이 온 날 바로 반영용).

const fs = require("fs");

const normName = (n) => String(n || "").replace(/제\s*\d+\s*회|\d{4}년?|\s|[()\[\]<>〈〉·:,\-]/g, "").toLowerCase();

function loadOverrides(file = "festival-overrides.json") {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return []; }
}

// list의 항목을 제자리에서 수정하고 적용 건수를 돌려준다
function applyOverrides(list, overrides = loadOverrides()) {
  let n = 0;
  for (const f of list) {
    const key = normName(f.name);
    for (const o of overrides) {
      if (!o.key || !key.includes(o.key.toLowerCase())) continue;
      Object.assign(f, o.set || {});
      f.corrected = o.note || "주최 측 정정 반영";
      n++;
    }
  }
  return n;
}

module.exports = { applyOverrides, loadOverrides };

if (require.main === module) {
  const list = JSON.parse(fs.readFileSync("festivals.json", "utf-8"));
  const n = applyOverrides(list);
  fs.writeFileSync("festivals.json", JSON.stringify(list, null, 2), "utf-8");
  console.log(`✏️ festivals.json 정정 덧쓰기 ${n}건 적용`);
}
