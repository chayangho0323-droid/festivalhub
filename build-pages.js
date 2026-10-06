// build-pages.js — festivals.json을 읽어서 축제마다 완성된 HTML 페이지를 생성한다.
// 실행: node build-pages.js  (fetch-festivals.js 실행 후에 돌리면 됨)
//
// 왜 필요한가?
//   기존 detail.html은 자바스크립트가 데이터를 받아와 화면을 그리는 방식이라
//   검색엔진(특히 네이버)이 내용을 거의 읽지 못한다.
//   미리 완성된 HTML을 만들어두면 "김제지평선축제 2026" 검색에 잡힐 수 있다.
//
// 생성물: festival/<contentid>.html (208개), sitemap.xml, robots.txt

const fs = require("fs");
const path = require("path");

// 배포 주소 (festivalhub.kr 도메인 — 2026-08 구입)
const SITE_URL = "https://festivalhub.kr";
// 정적 파일 캐시 무력화 — report.css/report.js에 빌드 날짜가 붙어 고친 날 바로 반영됨 (GitHub Pages 캐시 10분)
const BUILD_VER = (() => { const d = new Date(Date.now() + 9 * 3600 * 1000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`; })();

// ─── 방문자 사진 제보 (공통 모듈 visitor-photos.js — 세 사이트 동일) ───
// 받은 사진: photos/ 폴더 + photos.json({ "<contentid>": [{image, credit, caption}] }) → 상세 "📸 방문자 사진" 갤러리.
// 공식 사진이 없는 축제는 첫 제보 사진이 대표 사진이 된다.
const VP = require("./visitor-photos");
const REPORT_EMAIL = "chayangho0323@gmail.com";
const visitorPhotos = VP.loadVisitorPhotos(SITE_URL);
const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jua&display=swap" />`;
function reportMailto(f) {
  return VP.reportMailto(f
    ? { email: REPORT_EMAIL, siteName: "FestivalHub", name: f.name, where: (f.address || "").split(" ").slice(0, 2).join(" "), pageUrl: `${SITE_URL}/festival/${f.contentid}.html` }
    : { email: REPORT_EMAIL, siteName: "FestivalHub" });
}
function photoCallHtml(f) {
  const text = f
    ? "이 축제에 다녀오셨나요? 가족·친구와 찍은 사진, 자랑하고 싶은 현장 사진을 보내주세요 — <strong>닉네임과 함께</strong> 이 페이지에 올려드려요."
    : "가족·친구와 찍은 축제 사진, 자랑하고 싶은 현장 사진을 보내주세요! <strong>닉네임과 함께</strong> 축제 페이지에 올려드려요.";
  return VP.photoCallHtml({ title: "축제 사진 자랑해 주세요!", text, href: reportMailto(f) });
}

// 구글 애널리틱스(GA4) 방문자 통계 코드 — 모든 생성 페이지의 <head>에 들어간다.
// 측정 ID를 바꾸려면 아래 G-... 두 군데를 수정.
const GA_SNIPPET = `
  <!-- Google Analytics (방문자 통계) -->
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-Q3T5H6HSQQ"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', 'G-Q3T5H6HSQQ');
  </script>
  <!-- Google AdSense (사이트 소유 확인 + 광고 게재) -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5951913667078413" crossorigin="anonymous"></script>`;

// 쿠팡 파트너스 링크 목록 — 상품을 늘리려면 여기에 한 줄씩 추가하면 된다.
// (파트너스 링크로 구매가 일어나면 수수료 발생. 고지 문구는 표시 의무사항)
// (2026-09-14 애드센스 1차 심사 동안 비웠다가 2026-09-28 복구. 제휴 링크는 애드센스 정책상 허용됨)
const COUPANG_ITEMS = [
  { name: "🪑 캠핑의자", url: "https://link.coupang.com/a/f7LuGkEJMq" },
  { name: "🧺 돗자리", url: "https://link.coupang.com/a/f7MlAxqn7s" },
  { name: "🧣 캠핑 담요", url: "https://link.coupang.com/a/gP8GvQyG2S" },
  { name: "🔥 핫팩", url: "https://link.coupang.com/a/gP8J1IrVsW" },
];

// 카카오 애드핏 (2026-09-28 매체 등록, 애드센스 재심사와 병행) — 상세 페이지 소개글 아래 1개
// 광고단위 "festival-본문" 300x250. 스크립트는 광고 위치마다 한 번씩 넣어도 됨(async 로더).
const ADFIT_UNIT_BODY = "DAN-68NeQPCsAqEEiW25";
const adfitBlock = (unit, w, h) => `
      <div class="adfit" aria-label="광고">
        <ins class="kakao_ad_area" style="display:none;" data-ad-unit="${unit}" data-ad-width="${w}" data-ad-height="${h}"></ins>
        <script type="text/javascript" src="//t1.kakaocdn.net/kas/static/ba.min.js" async></script>
      </div>`;
const ADFIT_BODY = adfitBlock(ADFIT_UNIT_BODY, 300, 250);

const festivals = JSON.parse(fs.readFileSync("festivals.json", "utf-8"));

// ─── 정정 덧쓰기 (festival-overrides.json) ───
// 주최 측·방문자가 알려준 수정 사항을 공공데이터 위에 덮어쓴다. 공공데이터는 매일 다시 받아오므로
// 원본 파일을 고치면 하루 만에 되돌아간다 → 빌드 때마다 여기서 다시 적용. key는 정규화한 축제 이름에 포함되는 문자열.
//   [{ "key": "광주펫크닉", "note": "누가 언제 요청", "set": { "startDate": "20261017", "tel": "..." } }]
const { applyOverrides } = require("./apply-overrides"); // fetch-festivals.js와 같은 모듈 (festivals.json엔 이미 적용돼 있어도 안전)
const overrideCount = applyOverrides(festivals);
if (overrideCount) console.log(`✏️ 정정 덧쓰기 ${overrideCount}건 적용 (festival-overrides.json)`);

// ── 형제 사이트(캠핑허브) 데이터: 상세 페이지 "근처 캠핑장" 섹션용 ──
// 라이브 사이트의 공개 JSON을 가져온다. 실패해도 빌드는 계속 (섹션만 생략)
const { execSync } = require("child_process");
let crossCampings = [];
try {
  crossCampings = JSON.parse(
    execSync("curl -s -m 30 https://campinghub.kr/campings-list.json", { maxBuffer: 20 * 1024 * 1024 }).toString("utf8")
  ).filter((c) => c.lat && c.lng);
  console.log(`🏕️ 캠핑허브 데이터 ${crossCampings.length}곳 로드 (근처 캠핑장 섹션용)`);
} catch (e) {
  console.log("⚠️ 캠핑허브 데이터를 가져오지 못해 이번 빌드는 근처 캠핑장 섹션을 생략합니다");
}

// ── 아고다 제휴 (Site ID = 파트너센터의 추적 번호) ──
// agoda-cities.json: 시군구 → [아고다 도시 ID, 호텔 수] 매핑 (2026-08-31 수집)
// 호텔이 충분한 지역(100개 이상)만 아고다로 보내고, 재고가 빈약한 소도시는
// 네이버 지도 숙박 검색 유지 (빈 결과 페이지를 보여주는 것보다 낫다)
const AGODA_CID = "1972966";
let AGODA = { cities: {}, metros: {} };
try {
  AGODA = JSON.parse(fs.readFileSync("agoda-cities.json", "utf-8"));
} catch {}

function agodaCityFor(address) {
  const t = (address || "").split(" ");
  if (!t[1]) return null;
  const sido = t[0].replace(/(특별자치도|특별자치시|특별시|광역시|도)$/, "");
  const key = t[1].endsWith("구") ? `${sido} ${t[1]}` : t[1];
  const hit = AGODA.cities[key] || AGODA.metros[sido];
  return hit && hit[1] >= 100 ? hit[0] : null;
}

// 두 지점 사이 거리(km) — 하버사인 공식
function distKm(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// ─── 도우미 함수 ────────────────────────────────────────────

// HTML 속성/제목에 들어갈 글자를 안전하게 (태그·따옴표가 코드로 해석되는 것 방지)
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// HTML 태그를 제거하고 순수 텍스트만 (메타 설명용)
function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// "20260729" → "2026.07.29"
function formatDate(d) {
  if (!d || d.length !== 8) return "";
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
}

// "20260729" → "2026-07-29" (검색엔진용 국제 표준 형식)
function isoDate(d) {
  if (!d || d.length !== 8) return "";
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

// 한국 시간 기준 현재 시각 — GitHub 자동 갱신 서버(UTC)에서 돌아도 날짜가 안 어긋나게 +9시간 보정
function kstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function todayStr() {
  const d = kstNow();
  return (
    d.getUTCFullYear() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

// 정보가 있을 때만 한 줄(라벨 + 내용) 생성
function infoRow(icon, label, value) {
  if (!value) return "";
  return `<div class="info-item"><span class="info-label">${icon} ${label}</span><div class="info-value">${value}</div></div>`;
}

// 모든 페이지 하단에 붙는 공통 푸터 (출처 표기는 공공데이터 이용 시 의무사항)
// prefix: 페이지 위치에 따른 경로 보정 ("" = 루트, "../" = festival/ 폴더 안)
// 축제 가이드 바로가기 — 푸터만으론 안 보여서(2026-10-01) 메인·목록은 칩 줄, 상세는 홈페이지 버튼 아래 한 줄로 노출
const GUIDE_LINKS = [
  ["picks-2026-10.html", "🍂 10월 추천 15선", "chip chip-hot"],
  ["guide-checklist.html", "🎒 준비물"],
  ["guide-rain.html", "🌧️ 비 올 때"],
  ["guide-parking.html", "🚗 주차·셔틀"],
  ["guide-kids.html", "👨‍👩‍👧 아이와 함께"],
];
function guideChips(prefix = "") {
  return `<nav class="quick-links guide-row" aria-label="축제 가이드"><span class="guide-row-label">📚 축제 가이드</span>${GUIDE_LINKS.map(([h, t, c]) => `<a class="${c || "chip"}" href="${prefix}${h}">${t}</a>`).join("")}</nav>`;
}
function guideInline(prefix = "") {
  return `<p class="guide-inline">📚 가기 전에 — ${GUIDE_LINKS.slice(1).map(([h, t]) => `<a href="${prefix}${h}">${t.replace(/^\S+\s/, "")}</a>`).join(" · ")} · <a href="${prefix}${GUIDE_LINKS[0][0]}">10월 추천 축제</a></p>`;
}

function footerHtml(prefix = "") {
  return `
  <footer class="site-footer">
    <p>축제 정보 출처: 한국관광공사 TourAPI (공공데이터) · 매일 새벽 자동 갱신</p>
    <p><a href="${prefix}about.html">사이트 소개</a> · <a href="${prefix}privacy.html">개인정보처리방침</a> · <a href="${prefix}index.html">전체 축제</a> · <a href="${prefix}weekend.html">이번 주말 축제</a></p>
    <p>📚 축제 가이드: <a href="${prefix}picks-2026-10.html">10월 추천 15선</a> · <a href="${prefix}guide-checklist.html">준비물</a> · <a href="${prefix}guide-rain.html">비 올 때</a> · <a href="${prefix}guide-parking.html">주차·셔틀</a> · <a href="${prefix}guide-kids.html">아이와 함께</a></p>
    <p><a class="cross-link" href="https://campinghub.kr" target="_blank" rel="noopener">🏕️ 전국 캠핑장이 궁금하다면 — 캠핑허브</a></p>
  </footer>`;
}

// 상세 페이지 하단의 추천용 작은 카드들 (festival/ 폴더 안에서 쓰므로 경로가 같은 폴더)
function miniCards(list) {
  return list
    .map(
      (o) => `
      <a class="nearby-card nearby-link" href="${o.contentid}.html">
        ${o.image ? `<img src="${esc(o.image)}" alt="${esc(o.name)}" loading="lazy" />` : `<div class="nearby-noimg">🎪</div>`}
        <div class="nearby-name">${esc(o.name)}</div>
        <div class="nearby-dist">${formatDate(o.startDate)} ~</div>
      </a>`
    )
    .join("");
}

// ─── 직접 쓴 축제 이야기 (festival-notes.json) ───────────────
// 표준데이터 축제는 소개글이 20~30자뿐이고 사진도 없어서 이탈률이 60~90%였다 (2026-09-21 점검).
// 검색이 몰리는 빈약한 페이지에 유래·볼거리·팁을 직접 써서 붙인다.
// 표준데이터 ID는 날짜가 바뀌면 같이 바뀌므로 ID가 아니라 "정규화한 축제 이름에 key가 포함되는지"로 찾는다.
let festivalNotes = [];
try {
  festivalNotes = JSON.parse(fs.readFileSync("festival-notes.json", "utf-8"));
} catch {}
function findFestivalNote(f) {
  // 2026-09-30부터 소개글 길이와 무관하게 붙인다 — 축제 이야기는 유래·볼거리·방문 팁이라 공식 소개와 역할이 다르고,
  // 노출 큰 대형 축제(지상군·포은문화제 등)에도 원본 콘텐츠가 필요하다 (애드센스 재심사 대비)
  const n = normFestName(f.name);
  return festivalNotes.find((x) => x.key && n.includes(x.key.toLowerCase())) || null;
}

// ─── 얇은 페이지 보강: 데이터로 만드는 "한눈에 보기" 문단 ─────────────
// 공공데이터 소개글이 200자 미만이고 직접 쓴 축제 이야기도 없는 축제에, 장소·기간·시간·요금·주최·주변 관광지
// 필드를 자연스러운 문장으로 엮어 붙인다. 있는 사실만 쓰고 없는 필드는 문장을 통째로 뺀다.
const FEST_MONTH_RANGE = { first: "202608" }; // 월별 페이지가 존재하는 첫 달 (FIRST_MONTH와 동일)
function eun(word) { // 은/는 조사
  const c = String(word || "").trim().slice(-1);
  const code = c.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "은(는)";
  return (code - 0xac00) % 28 === 0 ? "는" : "은";
}
function kindOf(name) {
  const n = String(name || "");
  if (/박람회|엑스포|페어|EXPO/i.test(n)) return "박람회";
  if (/문화제|문화축전|예술제/.test(n)) return "문화 축제";
  if (/페스티벌|페스타|festival/i.test(n)) return "페스티벌";
  if (/음악회|콘서트|공연|연주회|음악제/.test(n)) return "공연 행사";
  if (/전시|특별전|비엔날레/.test(n)) return "전시";
  if (/축제/.test(n)) return "축제";
  if (/대회|런|마라톤|걷기/.test(n)) return "참여형 행사";
  return "지역 행사";
}
function autoIntroHtml(f) {
  const name = f.name;
  const kind = kindOf(name);
  const region = String(f.address || "").split(" ").slice(0, 2).join(" ").trim();
  const place = String(f.eventplace || "").trim();
  const oneDay = f.startDate === f.endDate;
  const when = oneDay ? `${formatDate(f.startDate)} 하루 동안` : `${formatDate(f.startDate)}부터 ${formatDate(f.endDate)}까지`;
  const where = place && region ? `${region}의 ${place}` : place || region || "";
  const s = [];
  s.push(`${name}${eun(name)} ${when} ${where ? where + "에서 " : ""}열리는 ${kind}입니다.`);
  const playtime = String(f.playtime || "").trim();
  const usefee = String(f.usefee || "").trim();
  if (playtime && usefee) s.push(`운영 시간은 ${playtime}이고, ${/무료/.test(usefee) ? "입장은 무료입니다" : `요금은 ${usefee}입니다`}.`);
  else if (playtime) s.push(`운영 시간은 ${playtime}입니다.`);
  else if (usefee) s.push(/무료/.test(usefee) ? "입장은 무료입니다." : `요금은 ${usefee}입니다.`);
  const sponsor = String(f.sponsor || "").trim();
  const tel = String(f.tel || "").replace(/^-\s*/, "").trim();
  if (sponsor && tel) s.push(`${sponsor}가 주최하며, 자세한 프로그램은 ${tel}로 문의할 수 있습니다.`);
  else if (sponsor) s.push(`${sponsor}가 주최합니다.`);
  else if (tel) s.push(`자세한 프로그램은 ${tel}로 문의할 수 있습니다.`);
  const spots = (f.nearbySpots || []).map((x) => x.name).filter(Boolean).slice(0, 2);
  if (spots.length) s.push(`행사장 주변에는 ${spots.join(", ")} 같은 관광지가 있어 함께 둘러보기 좋습니다.`);
  const ym = String(f.startDate || "").slice(0, 6);
  if (ym >= FEST_MONTH_RANGE.first) {
    const m = Number(ym.slice(4, 6));
    s.push(`같은 달에 열리는 다른 축제는 <a href="../month-${ym.slice(0, 4)}-${ym.slice(4, 6)}.html">${m}월 축제 일정</a>에서 볼 수 있습니다.`);
  }
  return `<section class="overview auto-intro"><h2>한눈에 보기</h2><p>${s.join(" ")}</p></section>`;
}
// 정말 빈 페이지 판정: 사진·소개·홈페이지·좌표가 모두 없으면 검색 색인에서 제외 (noindex, 사이트맵에서도 뺌)
function isBarePage(f) {
  return !f.image && stripHtml(f.overview || "").length < 30 && stripHtml(f.tourOverview || "").length < 30 && !f.homepage && !(f.lat && f.lng) && !findFestivalNote(f);
}

// ─── 축제 한 건 → HTML 페이지 ──────────────────────────────

function buildPage(f, all) {
  const today = todayStr();
  const ongoing = f.startDate <= today && today <= f.endDate;
  const badge = f.endDate < today
    ? `<span class="badge long">종료</span>`
    : ongoing
      ? `<span class="badge ongoing">진행중</span>`
      : `<span class="badge upcoming">예정</span>`;

  const period = `${formatDate(f.startDate)} ~ ${formatDate(f.endDate)}`;

  // 직접 쓴 축제 이야기 (festival-notes.json) — 공공데이터 소개글이 빈약한 축제에만 붙인다
  const note = findFestivalNote(f);
  const noteSection = note
    ? `<section class="overview fest-note">
        <h2>📖 축제 이야기</h2>
        ${note.intro.map((p) => `<p>${esc(p)}</p>`).join("\n        ")}
        ${note.highlights && note.highlights.length ? `<h3>✨ 이런 걸 볼 수 있어요</h3><ul>${note.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        ${note.tips && note.tips.length ? `<h3>🎒 가기 전에 알아두면 좋은 팁</h3><ul>${note.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
        <p class="coupang-notice">※ 축제의 유래와 즐기는 법을 FestivalHub가 정리한 글입니다. 세부 프로그램과 시간은 해마다 달라지니 방문 전 공식 안내를 확인해 주세요.</p>
      </section>`
    : "";

  // 소개가 얇으면(200자 미만, 축제 이야기도 없음) 데이터로 만든 "한눈에 보기" 문단을 붙인다
  const thin = !note && stripHtml(f.overview || "").length < 200 && stripHtml(f.tourOverview || "").length < 200;
  const autoIntro = thin ? autoIntroHtml(f) : "";
  const autoIntroText = thin ? stripHtml(autoIntro).replace(/^한눈에 보기/, "").trim() : "";

  // 검색 결과에 보일 설명문: 직접 쓴 글 > 공공데이터 소개(100자 이상) > 자동 소개 > 기본
  const ovText = stripHtml(f.overview);
  const description = ((note && note.intro[0]) || (ovText.length >= 100 ? ovText : "") || autoIntroText || ovText || `${f.name} — ${period}, ${f.address}`).slice(0, 150);
  const bare = isBarePage(f);

  // ── 사진 갤러리 ──
  const photos = [...new Set([f.image, ...(f.images || [])])].filter(Boolean);
  const vph = visitorPhotos[String(f.contentid)];
  if (!photos.length && vph && VP.firstImage(vph)) photos.push(VP.firstImage(vph));
  // 축제 사진이 하나도 없으면 행사장 300m 안 관광지 사진을 "주변 풍경"으로 보여준다 (fetch-festivals.js venuePhoto)
  const useVenue = !photos.length && f.venuePhoto && f.venuePhoto.image;
  if (useVenue) photos.push(f.venuePhoto.image);
  const venueNote = useVenue
    ? `<p class="venue-photo-note">📍 축제 사진이 아직 없어 행사장 주변 관광지 <strong>${esc(f.venuePhoto.name)}</strong>(${f.venuePhoto.dist}m)의 모습을 보여드려요 · 사진: 한국관광공사</p>`
    : "";
  const gallery = photos.length
    ? `<img class="hero" id="hero-img" src="${esc(photos[0])}" alt="${esc(useVenue ? `${f.name} 행사장 주변 ${f.venuePhoto.name}` : f.name)}" />` + venueNote +
      (photos.length > 1
        ? `<div class="thumbs">${photos
            .map(
              (url, i) =>
                `<img src="${esc(url)}" alt="${esc(f.name)} 사진 ${i + 1}" class="thumb${i === 0 ? " active" : ""}" data-url="${esc(url)}" loading="lazy" />`
            )
            .join("")}</div>`
        : "")
    : "";

  // ── 길찾기 + 숙소 버튼 ──
  const hasCoords = f.lat && f.lng;
  // 숙소 검색은 축제가 열리는 시·군 기준으로 (예: "충청남도 계룡시 숙박")
  // Booking.com은 한글 지역명을 도시로 인식하지 못해 이름이 비슷한 엉뚱한 숙소를 보여줬고
  // ("충청남도 계룡시" → 공주 계룡산 글램핑), 중구·서구처럼 여러 도시에 겹치는 이름도 많아
  // 한국 주소를 정확히 처리하는 네이버 지도 숙박 검색으로 연결한다. (펜션·민박까지 나옴)
  const stayQuery = (f.address || f.name).split(" ").slice(0, 2).join(" ") + " 숙박";
  const directions = `
    <div class="dir-buttons">
      ${hasCoords ? `<a class="dir-btn kakao" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}">🚗 카카오맵 길찾기</a>` : ""}
      <a class="dir-btn naver" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(f.address || f.name)}">🧭 네이버지도에서 보기</a>
      ${(() => {
        // 아고다 재고가 충분한 지역은 제휴 링크(예약 시 수수료), 아니면 네이버 지도
        const agodaId = agodaCityFor(f.address);
        return agodaId
          ? `<a class="dir-btn hotel" target="_blank" rel="noopener sponsored" href="https://www.agoda.com/partners/partnersearch.aspx?cid=${AGODA_CID}&city=${agodaId}">🏨 근처 숙소 보기</a>`
          : `<a class="dir-btn hotel" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(stayQuery)}">🏨 근처 숙소 보기</a>`;
      })()}
    </div>`;

  // ── 소개/행사내용 섹션 (중복 제거) ──
  const normalize = (s) => String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, "");
  const overview = f.overview
    ? `<section class="overview"><h2>소개</h2><p>${f.overview}</p></section>`
    : "";
  const extraSections = (f.extraInfo || [])
    .filter((info) => normalize(info.text) !== normalize(f.overview))
    .map((info) => `<section class="overview"><h2>${esc(info.name)}</h2><p>${info.text}</p></section>`)
    .join("");

  // ── 주변 관광지/맛집 ──
  // 카드를 클릭하면 네이버지도에서 그 장소를 검색한 화면이 새 탭으로 열린다.
  // 검색어는 "지역(주소 앞 두 단어) + 장소명"으로 만들어 동명의 다른 지역 가게와 안 헷갈리게 함
  const nearbyCards = (list) =>
    (list || [])
      .map((p) => {
        const query = `${(p.addr || "").split(" ").slice(0, 2).join(" ")} ${p.name}`.trim();
        return `
        <a class="nearby-card nearby-link" target="_blank" rel="noopener"
           href="https://map.naver.com/p/search/${encodeURIComponent(query)}" title="네이버지도에서 보기">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="nearby-noimg">📷</div>`}
          <div class="nearby-name">${esc(p.name)}</div>
          <div class="nearby-dist">📍 ${p.dist >= 1000 ? (p.dist / 1000).toFixed(1) + "km" : p.dist + "m"} · 지도 보기</div>
        </a>`;
      })
      .join("");
  const nearbySection = (title, icon, list) =>
    list && list.length
      ? `<section class="nearby-section"><h2>${icon} ${title}</h2><div class="nearby-row">${nearbyCards(list)}</div></section>`
      : "";

  // ── 형제 사이트 연결: 근처 캠핑장 (캠핑허브) ──
  // "축제 가는 김에 근처에서 캠핑" — 두 사이트가 방문자를 주고받는 다리
  const nearCamps = hasCoords
    ? crossCampings
        .map((c) => ({ ...c, dist: distKm(Number(f.lat), Number(f.lng), c.lat, c.lng) }))
        .filter((c) => c.dist <= 40)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 4)
    : [];
  const campSection = nearCamps.length
    ? `<section class="nearby-section"><h2>🏕️ 근처 캠핑장</h2><div class="nearby-row">${nearCamps
        .map(
          (c) => `
        <a class="nearby-card nearby-link cross-link" target="_blank" rel="noopener"
           href="https://campinghub.kr/camping/${c.contentId}.html" title="캠핑허브에서 보기">
          ${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy" />` : `<div class="nearby-noimg">🏕️</div>`}
          <div class="nearby-name">${esc(c.name)}</div>
          <div class="nearby-dist">📍 ${c.dist < 10 ? c.dist.toFixed(1) : Math.round(c.dist)}km · 캠핑허브 ↗</div>
        </a>`
        )
        .join("")}</div></section>`
    : "";

  const homepage = f.homepage
    ? `<a href="${esc(f.homepage)}" target="_blank" rel="noopener">${esc(f.homepage)}</a>`
    : "";
  // 방문자 20%가 누르는 1등 기능 → 정보표 안 작은 링크 대신 눈에 띄는 큰 버튼 (GA: click_homepage / click_homepage_search)
  const festYear = String(f.startDate || "").slice(0, 4);
  const isMusic = /페스티벌|음악|재즈|락|뮤직|콘서트|jazz|rock|music/i.test(f.name);
  const homepageButton = f.homepage
    ? `<a class="dir-btn homepage-btn" target="_blank" rel="noopener" href="${esc(f.homepage)}">🔗 공식 홈페이지에서 ${isMusic ? "라인업·프로그램" : "프로그램·일정"} 보기</a>`
    : `<a class="dir-btn homepage-search" target="_blank" rel="noopener" href="https://search.naver.com/search.naver?query=${encodeURIComponent(`${f.name.replace(/\d{4}년?/g, "").trim()} ${festYear} 공식`)}">🔎 네이버에서 공식 정보·${isMusic ? "라인업" : "프로그램"} 찾기</a>`;
  // 검색 결과 제목: 사람들이 찾는 말(일정·장소·입장료·라인업)을 제목에 (네이버 CTR 0.5% 개선용, 2026-09-28)
  const nameNoYear = f.name.replace(/\s*\d{4}년?\s*/g, " ").replace(/\s+/g, " ").trim();
  const seoTitle = `${nameNoYear} ${festYear} 일정·장소·입장료${isMusic ? "·라인업" : ""}`;

  // ── 내부 연결: 이 지역의 다른 축제 + 비슷한 시기 축제 (각 4개) ──
  // 방문자가 더 둘러보게 하고, 페이지끼리 연결돼 검색엔진 평가에도 좋다
  const region = getRegion(f.address);
  const toD = (s) => new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const byDateCloseness = (a, b) =>
    Math.abs(toD(a.startDate) - toD(f.startDate)) - Math.abs(toD(b.startDate) - toD(f.startDate));
  const others = all.filter((o) => o.contentid !== f.contentid);
  const sameRegion = others
    .filter((o) => getRegion(o.address) === region)
    .sort(byDateCloseness)
    .slice(0, 4);
  const shownIds = new Set(sameRegion.map((o) => o.contentid));
  const similarTime = others
    .filter((o) => !shownIds.has(o.contentid) && !isLongRunning(o))
    .sort(byDateCloseness)
    .slice(0, 4);
  const relatedSection = (title, icon, list) =>
    list.length
      ? `<section class="nearby-section"><h2>${icon} ${title}</h2><div class="nearby-row">${miniCards(list)}</div></section>`
      : "";

  // ── 검색엔진용 구조화 데이터 (구글이 행사로 인식해 리치 결과 노출 가능) ──
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Festival",
    name: f.name,
    startDate: isoDate(f.startDate),
    endDate: isoDate(f.endDate),
    description: description,
    image: photos,
    url: `${SITE_URL}/festival/${f.contentid}.html`,
    location: {
      "@type": "Place",
      name: f.eventplace || f.address,
      address: f.address,
      ...(hasCoords
        ? { geo: { "@type": "GeoCoordinates", latitude: Number(f.lat), longitude: Number(f.lng) } }
        : {}),
    },
  };

  // ── 페이지 전체 조립 ──
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(seoTitle)} | FestivalHub</title>
  <meta name="description" content="${esc(description)}" />
  ${bare ? `<meta name="robots" content="noindex,follow" />` : ""}
  <link rel="canonical" href="${SITE_URL}/festival/${f.contentid}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(seoTitle)}" />
  <meta property="og:description" content="${esc(description)}" />
  ${photos[0] ? `<meta property="og:image" content="${esc(photos[0])}" />` : ""}
  <meta property="og:url" content="${SITE_URL}/festival/${f.contentid}.html" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="../style.css" />
  ${FONT_LINK}
  <link rel="stylesheet" href="../report.css?v=${BUILD_VER}" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${GA_SNIPPET}
</head>
<body>
  <main class="detail-container">
    <a class="back-link" href="../index.html">← 전국 축제 목록으로</a>
    ${gallery}
    <div class="detail-body">
      ${badge}
      <h1>${esc(f.name)}</h1>
      ${f._archived && f.endDate >= today ? `<p class="coupang-notice">ℹ️ 이 축제는 한국관광공사 공식 목록에서 내려갔거나 일정이 변경된 상태일 수 있어요. 방문 전 주최 측에 일정을 꼭 확인해 주세요.</p>` : ""}
      <div class="actions">
        <button id="fav-btn" class="action-btn">🤍 찜하기</button>
        <a class="action-btn" id="cal-btn" href="#" target="_blank" rel="noopener">📆 캘린더에 추가</a>
        <button id="share-btn" class="action-btn">🔗 링크 복사</button>
      </div>
      <div class="info-grid">
        ${infoRow("📅", "기간", period)}
        ${infoRow("📍", "주소", esc(f.address))}
        ${infoRow("🎪", "행사 장소", esc(f.eventplace))}
        ${infoRow("⏰", "운영 시간", f.playtime)}
        ${infoRow("💰", "이용 요금", f.usefee)}
        ${infoRow("🏛️", "주최", esc(f.sponsor))}
        ${infoRow("📞", "문의", esc(f.tel))}
        ${infoRow("🔗", "홈페이지", homepage)}
      </div>
      ${f.corrected ? `<p class="coupang-notice">✏️ 주최 측 요청으로 정보를 정정했습니다 (${esc(String(f.corrected).slice(0, 10))}). 공공데이터와 다를 수 있으며, 이 페이지가 최신입니다.</p>` : ""}
      ${noteSection}
      ${autoIntro}
      ${ADFIT_BODY}
      <div class="dir-buttons homepage-row">${homepageButton}</div>
      ${guideInline("../")}
      ${VP.galleryHtml(vph, { name: f.name, href: reportMailto(f) })}
      ${photoCallHtml(f)}
      ${overview}
      ${extraSections}
      <section class="map-section"><h2>오시는 길</h2>${hasCoords ? `<div id="map"></div>` : ""}${directions}</section>
      ${nearbySection("주변 관광지", "🏞️", f.nearbySpots)}
      ${nearbySection("주변 맛집", "🍜", f.nearbyFood)}
      ${campSection}
      ${relatedSection(`${region} 지역의 다른 축제`, "🗺️", sameRegion)}
      ${relatedSection("비슷한 시기에 열리는 축제", "🗓️", similarTime)}
      ${
        COUPANG_ITEMS.length
          ? `<section class="nearby-section coupang-section">
        <h2>🎒 축제 준비물</h2>
        <div class="dir-buttons">
          ${COUPANG_ITEMS.map(
            (item) =>
              `<a class="dir-btn coupang" target="_blank" rel="noopener sponsored" href="${esc(item.url)}">${esc(item.name)}</a>`
          ).join("")}
        </div>
        <p class="coupang-notice">이 섹션은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.</p>
      </section>`
          : ""
      }
    </div>
  </main>
  ${footerHtml("../")}

  <!-- 찜/공유/갤러리/지도 등 동작에 필요한 최소 정보만 심어둔다 -->
  <script>
    window.FESTIVAL = ${JSON.stringify({
      contentid: f.contentid,
      name: f.name,
      startDate: f.startDate,
      endDate: f.endDate,
      address: f.address,
      lat: f.lat,
      lng: f.lng,
      homepage: f.homepage,
    })};
  </script>
  <script src="../festival-page.js"></script>
  <script src="../track-clicks.js"></script>
  <script src="../report.js?v=${BUILD_VER}"></script>
</body>
</html>`;
}

// ─── 큐레이션 페이지(주말/지역)용 도우미 ────────────────────

// 주소 → 표준 지역명 (app.js와 같은 규칙. 수정하면 양쪽 다 고칠 것!)
const REGION_PREFIXES = [
  // 2026년 통합으로 옛 광주광역시·전라남도 주소도 전남·광주로 합침
  ["전남광주", "전남·광주"],
  ["서울", "서울"], ["부산", "부산"], ["대구", "대구"], ["인천", "인천"],
  ["광주", "전남·광주"], ["대전", "대전"], ["울산", "울산"], ["세종", "세종"],
  ["경기", "경기"], ["강원", "강원"],
  ["충청북", "충북"], ["충북", "충북"], ["충청남", "충남"], ["충남", "충남"],
  ["전라북", "전북"], ["전북", "전북"], ["전라남", "전남·광주"], ["전남", "전남·광주"],
  ["경상북", "경북"], ["경북", "경북"], ["경상남", "경남"], ["경남", "경남"],
  ["제주", "제주"],
];

function getRegion(address) {
  if (!address) return "기타";
  for (const [prefix, name] of REGION_PREFIXES) {
    if (address.startsWith(prefix)) return name;
  }
  return "기타";
}

// 지역명 → 파일명용 영문 슬러그 (한글 파일명은 주소창에서 깨져 보여서)
const REGION_SLUGS = {
  서울: "seoul", 부산: "busan", 대구: "daegu", 인천: "incheon",
  광주: "gwangju", 대전: "daejeon", 울산: "ulsan", 세종: "sejong",
  경기: "gyeonggi", 강원: "gangwon", 충북: "chungbuk", 충남: "chungnam",
  전북: "jeonbuk", 전남: "jeonnam", "전남·광주": "jeonnam-gwangju",
  경북: "gyeongbuk", 경남: "gyeongnam", 제주: "jeju", 기타: "etc",
};

// 테마 정의: 축제 이름 키워드로 자동 분류. chip은 홈/내비 칩에 쓰는 짧은 이름
const THEMES = [
  { slug: "flower", name: "꽃 축제", chip: "꽃", icon: "🌸",
    keywords: ["꽃", "연꽃", "장미", "벚꽃", "유채", "국화", "구절초", "상사화", "코스모스", "맥문동", "해바라기", "수국"] },
  { slug: "light", name: "불꽃·빛 축제", chip: "불꽃·빛", icon: "🎆",
    keywords: ["불꽃", "드론", "빛", "미디어아트", "유등", "등불", "야경", "별빛", "루미나리에", "야간"] },
  { slug: "food", name: "먹거리 축제", chip: "먹거리", icon: "🍜",
    keywords: ["먹거리", "음식", "맥주", "커피", "와인", "김밥", "라면", "전어", "꽃게", "한우", "숯불", "인삼", "홍삼", "산삼", "김치", "치즈", "사과", "포도", "토마토", "대추", "고추", "구기자", "약초", "장류", "오곡", "막국수", "닭갈비", "송이", "수산", "푸드"] },
  { slug: "heritage", name: "문화유산 야행", chip: "문화유산 야행", icon: "🏯",
    keywords: ["국가유산", "야행", "문화재", "읍성", "궁", "전통", "민속", "한옥"] },
  { slug: "kids", name: "아이랑 가기 좋은 축제", chip: "아이랑", icon: "👨‍👩‍👧",
    keywords: ["어린이", "아이", "키즈", "가족", "인형", "동화", "만화", "공룡", "반딧불", "곤충", "동물", "나비", "황새", "체험", "청소년", "캐릭터", "장난감"] },
];

// 목록 페이지들(주말/월별/테마/지역) 상단에 공통으로 붙는 칩 내비게이션.
// 실행부에서 데이터를 보고 채워지며, buildListPage가 페이지에 삽입한다
let SITE_NAV = "";

// 90일 이상은 상설·장기 행사로 분류 (큐레이션에서 제외용)
function isLongRunning(f) {
  const toDate = (s) =>
    new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  return (toDate(f.endDate) - toDate(f.startDate)) / (1000 * 60 * 60 * 24) >= 90;
}

// 목록 페이지에 들어갈 축제 카드 한 장 (app.js의 카드와 같은 모양)
function listCard(f, today) {
  const ongoing = f.startDate <= today && today <= f.endDate;
  const dday = Math.round(
    (new Date(Number(f.startDate.slice(0, 4)), Number(f.startDate.slice(4, 6)) - 1, Number(f.startDate.slice(6, 8))) -
      new Date(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)))) /
      (1000 * 60 * 60 * 24)
  );
  // 배지 우선순위: 종료 > 상설·장기 > 진행중 > D-day
  // (끝난 축제는 다음 갱신 때 목록에서 빠지지만, 그 사이에도 "D--3" 같은 깨진 표시가 안 나오게)
  const badge = f.endDate < today
    ? `<span class="badge long">종료</span>`
    : isLongRunning(f)
      ? `<span class="badge long">상설·장기</span>`
      : ongoing
        ? `<span class="badge ongoing">진행중</span>`
        : `<span class="badge upcoming">D-${dday}</span>`;
  const venueImg = !f.image && f.venuePhoto && f.venuePhoto.image;
  const img = f.image
    ? `<img src="${esc(f.image)}" alt="${esc(f.name)}" loading="lazy" />`
    : venueImg
      ? `<img src="${esc(venueImg)}" alt="${esc(f.name)} 행사장 주변 ${esc(f.venuePhoto.name)}" loading="lazy" /><span class="venue-tag">📍 행사장 주변 풍경</span>`
      : `<div class="no-image">🎪</div>`;

  return `
    <a class="card-link" href="festival/${f.contentid}.html">
      <article class="card">
        ${img}
        <div class="card-body">
          ${badge}
          <h2>${esc(f.name)}</h2>
          <p class="period">📅 ${formatDate(f.startDate)} ~ ${formatDate(f.endDate)}</p>
          <p class="address">📍 ${esc(f.address) || "주소 정보 없음"}</p>
          <button class="review-link" data-query="${esc(`${(f.address || "").split(" ")[1] || ""} ${f.name}`.trim())}"
            onclick="event.preventDefault();window.open('https://map.naver.com/p/search/'+encodeURIComponent(this.dataset.query)+'?placePath=%2Freview','_blank','noopener');">📝 네이버 후기 보기</button>
        </div>
      </article>
    </a>`;
}

// 주말/지역 같은 목록형 페이지 한 장을 통째로 만든다
const FEST_GUIDES = require("./festival-guides.js");
function buildListPage({ filename, title, heading, subtitle, description, items, today }) {
  // 월별 페이지에 그 달의 "에디터 추천" 페이지가 있으면 상단에 안내 띠 (월별 페이지 체류 1분+ → 추천으로 연결)
  const monthMatch = filename.match(/^month-(\d{4})-(\d{2})\.html$/);
  const pick = monthMatch ? FEST_GUIDES.PICKS.find((p) => p.slug === `picks-${monthMatch[1]}-${monthMatch[2]}`) : null;
  const pickBanner = pick
    ? `<div class="photo-call pick-banner"><span class="photo-call-icon">🍂</span><div class="photo-call-text"><span class="photo-call-title">${esc(pick.title)}</span> ${Number(monthMatch[2])}월 축제 ${items.length}곳 중 FestivalHub가 직접 고른 곳만, 왜 가볼 만한지 한 줄씩.</div><a class="photo-call-btn" href="${pick.slug}.html">추천 보기 →</a></div>`
    : "";
  // 이미 끝난 축제는 목록 맨 뒤로 (월별 페이지처럼 지난 축제가 섞일 수 있는 곳 대비)
  const sorted = [...items.filter((f) => f.endDate >= today), ...items.filter((f) => f.endDate < today)];
  const cards = sorted.map((f) => listCard(f, today)).join("");
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/${filename}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${SITE_URL}/${filename}" />
  <link rel="stylesheet" href="style.css" />
  ${FONT_LINK}
  <link rel="stylesheet" href="report.css?v=${BUILD_VER}" />
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${esc(heading)}</h1>
    <p class="subtitle">${esc(subtitle)}</p>
    <p class="home-link"><a href="index.html">← 전체 축제 보기</a></p>
  </header>
  ${SITE_NAV}
  ${pickBanner}
  ${photoCallHtml(null)}
  ${guideChips("")}
  <p class="result-count">${items.length}개의 축제</p>
  <main class="festival-grid">${cards || `<p style="grid-column:1/-1;text-align:center;color:#888;">해당하는 축제가 없습니다.</p>`}</main>
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
  <script src="report.js?v=${BUILD_VER}"></script>
</body>
</html>`;
}

// ─── 실행 ──────────────────────────────────────────────────

const outDir = path.join(__dirname, "festival");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// 종료 축제 아카이브: 페이지를 지우지 않고 "종료" 배지를 단 채 보존한다.
// 지우면 구글 색인이 함께 사라져 검색 노출이 리셋되기 때문 (2026-08-31 교훈).
// 목록·랜딩에는 안 나오므로(현재 축제만 사용) 방문자 경험은 그대로.
let archivedFestivals = [];
try {
  archivedFestivals = JSON.parse(fs.readFileSync("festivals-archive.json", "utf-8"));
  applyOverrides(archivedFestivals);
} catch {}

// 같은 축제가 새 ID로 현재 목록에 있으면(표준데이터 임시 ID → 관광공사 정식 ID 등)
// 보존 페이지 대신 "옛 주소 → 새 주소" 이동 페이지를 만든다. (중복 페이지 방지 + 옛 주소 404 방지)
const normFestName = (n) => String(n || "").replace(/제\s*\d+\s*회|\d{4}년?|\s|[()\[\]<>〈〉·:,\-]/g, "").toLowerCase();
const festRedirects = [];
archivedFestivals = archivedFestivals.filter((a) => {
  const an = normFestName(a.name);
  if (an.length < 3) return true;
  const m = festivals.find((f) => {
    const fn = normFestName(f.name);
    const sameName = fn === an || (fn.length >= 4 && an.length >= 4 && (fn.includes(an) || an.includes(fn)));
    return sameName && getRegion(f.address) === getRegion(a.address) && String(f.startDate).slice(0, 4) === String(a.startDate).slice(0, 4);
  });
  if (!m) return true;
  festRedirects.push({ from: a.contentid, to: m.contentid, name: m.name });
  return false;
});
// 중복 합치기로 사라진 ID(festival-merges.json) → 남는 축제로 이동 페이지. 아카이브에 남아 있으면 제거.
try {
  const merges = JSON.parse(fs.readFileSync("festival-merges.json", "utf-8"));
  const liveIds = new Set([...festivals, ...archivedFestivals].map((f) => f.contentid));
  const fromIds = new Set(merges.map((m) => m.from));
  archivedFestivals = archivedFestivals.filter((a) => !fromIds.has(a.contentid));
  for (const m of merges) {
    // 남는 쪽(to)이 살아 있고, 사라지는 쪽(from)이 현재 실제 페이지가 아닐 때만 (데이터가 바뀌어 역방향 기록이 생겨도 실제 페이지를 덮지 않게)
    if (!liveIds.has(m.to) || m.from === m.to || liveIds.has(m.from)) continue;
    if (!festRedirects.some((r) => r.from === m.from)) festRedirects.push({ from: m.from, to: m.to, name: m.name });
  }
} catch {}
for (const a of archivedFestivals) a._archived = true; // 상세 페이지 안내문용

// 이전 빌드 결과를 지우고 (현재 + 아카이브 전체를 다시 생성하므로 죽은 파일은 안 남음)
for (const old of fs.readdirSync(outDir)) {
  if (old.endsWith(".html")) fs.unlinkSync(path.join(outDir, old));
}

for (const f of [...festivals, ...archivedFestivals]) {
  fs.writeFileSync(path.join(outDir, `${f.contentid}.html`), buildPage(f, festivals), "utf-8");
}
for (const r of festRedirects) {
  const to = `${SITE_URL}/festival/${r.to}.html`;
  fs.writeFileSync(path.join(outDir, `${r.from}.html`), `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${esc(r.name)} — FestivalHub</title>
  <link rel="canonical" href="${to}" />
  <meta http-equiv="refresh" content="0; url=${r.to}.html" />
  <meta name="robots" content="noindex, follow" />
</head>
<body>
  <p>이 축제 페이지의 주소가 바뀌었습니다. <a href="${r.to}.html">${esc(r.name)} 페이지로 이동하기</a></p>
</body>
</html>`, "utf-8");
}
console.log(`✅ festival/*.html ${festivals.length + archivedFestivals.length}개 생성 (진행·예정 ${festivals.length} + 보존 ${archivedFestivals.length}) + 주소 이동 ${festRedirects.length}개`);

// 예전 빌드의 월별/테마/지역 파일 정리 (죽은 페이지가 남지 않게 — 아래에서 다시 생성됨)
for (const old of fs.readdirSync(__dirname)) {
  if (/^(month-\d{4}-\d{2}|theme-[a-z]+|region-[a-z-]+)\.html$/.test(old)) {
    fs.unlinkSync(path.join(__dirname, old));
  }
}

// ── 큐레이션 페이지 생성 ──
const todayYmd = todayStr();

// 목록 페이지 공통 칩 내비게이션 만들기 (홈 화면과 같은 구성)
// 아래에서 생성될 파일들과 링크가 일치하도록 같은 규칙으로 미리 계산한다
{
  const navNow = kstNow(); // 한국시간 기준
  const navMonths = Array.from({ length: 4 }, (_, i) => {
    const md = new Date(Date.UTC(navNow.getUTCFullYear(), navNow.getUTCMonth() + i, 1));
    return { y: md.getUTCFullYear(), m: md.getUTCMonth() + 1, mm: String(md.getUTCMonth() + 1).padStart(2, "0") };
  });
  const navRegions = [...new Set(festivals.map((f) => getRegion(f.address)))]
    .filter((r) => r !== "기타")
    .sort((a, b) => a.localeCompare(b, "ko"));
  const navThemes = THEMES.filter(
    (t) => festivals.filter((f) => t.keywords.some((k) => f.name.includes(k))).length >= 3
  );
  SITE_NAV = `
  <nav class="quick-links sticky-desktop">
    <a class="chip chip-hot" href="weekend.html">🔥 이번 주말</a>
    ${fs.existsSync(path.join(__dirname, "performances.json")) ? `<a class="chip chip-events" href="shows.html">🎭 공연</a>` : fs.existsSync(path.join(__dirname, "events.json")) ? `<a class="chip chip-events" href="events.html">🎭 공연·행사</a>` : ""}
    ${navMonths.map((d) => `<a class="chip" href="month-${d.y}-${d.mm}.html">${d.m}월</a>`).join("")}
    ${navThemes.map((t) => `<a class="chip" href="theme-${t.slug}.html">${t.icon} ${t.chip}</a>`).join("")}
    ${navRegions.map((r) => `<a class="chip" href="region-${REGION_SLUGS[r] || "etc"}.html">${esc(r)}</a>`).join("")}
  </nav>`;
}

// 이번 주말(토·일) 날짜 계산 — 한국시간 기준. 일요일이라면 "이번 주말"은 어제~오늘
const now = kstNow();
const day = now.getUTCDay(); // 0=일 ... 6=토
const sat = new Date(now);
sat.setUTCDate(now.getUTCDate() + (day === 0 ? -1 : 6 - day));
const sun = new Date(sat);
sun.setUTCDate(sat.getUTCDate() + 1);
const fmt = (d) =>
  d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
const satStr = fmt(sat);
const sunStr = fmt(sun);

// 주말과 기간이 겹치는 축제 (상설·장기는 제외해서 진짜 축제만)
const weekendFestivals = festivals
  .filter((f) => f.startDate <= sunStr && f.endDate >= satStr && !isLongRunning(f))
  .sort((a, b) => a.startDate.localeCompare(b.startDate));

const satLabel = `${sat.getUTCMonth() + 1}.${sat.getUTCDate()}`;
const sunLabel = `${sun.getUTCMonth() + 1}.${sun.getUTCDate()}`;
fs.writeFileSync(
  "weekend.html",
  buildListPage({
    filename: "weekend.html",
    title: `이번 주말 축제 (${satLabel}~${sunLabel}) 전국 ${weekendFestivals.length}곳 — FestivalHub`,
    heading: `🔥 이번 주말 축제`,
    subtitle: `${satLabel}(토) ~ ${sunLabel}(일) 전국에서 열리는 축제 ${weekendFestivals.length}곳 (상설 행사 제외)`,
    description: `이번 주말(${satLabel}~${sunLabel}) 가볼만한 전국 축제 ${weekendFestivals.length}곳 총정리. ${weekendFestivals.slice(0, 5).map((f) => f.name).join(", ")} 등 일정·위치·사진 정보.`,
    items: weekendFestivals,
    today: todayYmd,
  }),
  "utf-8"
);
console.log(`✅ weekend.html 생성 (주말 축제 ${weekendFestivals.length}건)`);

// 지역별 페이지: 데이터에 있는 지역마다 한 장씩
const regions = [...new Set(festivals.map((f) => getRegion(f.address)))].filter((r) => r !== "기타");
const regionFiles = [];
for (const region of regions) {
  const slug = REGION_SLUGS[region] || "etc";
  const filename = `region-${slug}.html`;
  const items = festivals
    .filter((f) => getRegion(f.address) === region)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  fs.writeFileSync(
    filename,
    buildListPage({
      filename,
      title: `${region} 축제 일정 총정리 (${items.length}곳) — FestivalHub`,
      heading: `📍 ${region} 축제`,
      subtitle: `${region}에서 열리는 축제 ${items.length}곳 — 날짜순 정리`,
      description: `${region} 축제 일정 모음. ${items.slice(0, 5).map((f) => f.name).join(", ")} 등 ${items.length}곳의 기간·장소·사진 정보를 한눈에.`,
      items,
      today: todayYmd,
    }),
    "utf-8"
  );
  regionFiles.push(filename);
}
console.log(`✅ 지역별 페이지 ${regionFiles.length}개 생성 (${regions.join(", ")})`);

// ── 월별 페이지: 이번 달부터 4개월치 ──
// 지난 달 페이지도 지우지 않고 보존한다 (사이트 오픈 2026-08부터) — 지우면 검색엔진에 "접근 불가"로 남음
const monthFiles = [];
const FIRST_MONTH = Date.UTC(2026, 7, 1);
const monthOffsets = [];
for (let i = -24; i < 4; i++) {
  if (Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1) >= FIRST_MONTH) monthOffsets.push(i);
}
for (const i of monthOffsets) {
  const md = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
  const y = md.getUTCFullYear();
  const m = md.getUTCMonth() + 1;
  const mm = String(m).padStart(2, "0");
  // 축제 기간이 그 달과 하루라도 겹치면 포함 ("31"은 문자열 비교용 상한)
  const items = [...festivals, ...archivedFestivals]
    .filter((f) => f.startDate <= `${y}${mm}31` && f.endDate >= `${y}${mm}01` && !isLongRunning(f))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const filename = `month-${y}-${mm}.html`;
  fs.writeFileSync(
    filename,
    buildListPage({
      filename,
      title: `${y}년 ${m}월 축제 일정 총정리 (${items.length}곳) — FestivalHub`,
      heading: `🗓️ ${y}년 ${m}월 축제`,
      subtitle: `${m}월에 열리는 전국 축제 ${items.length}곳 — 날짜순 정리 (상설 행사 제외)`,
      description: `${y}년 ${m}월 전국 축제 일정 모음. ${items.slice(0, 5).map((f) => f.name).join(", ")} 등 ${items.length}곳의 기간·장소·사진 정보.`,
      items,
      today: todayYmd,
    }),
    "utf-8"
  );
  monthFiles.push(filename);
}
console.log(`✅ 월별 페이지 ${monthFiles.length}개 생성 (${monthFiles.join(", ")})`);

// ── 테마별 페이지: 축제 이름에서 키워드로 자동 분류 (THEMES는 파일 상단에 정의) ──
const themeFiles = [];
for (const theme of THEMES) {
  const items = festivals
    .filter((f) => theme.keywords.some((k) => f.name.includes(k)))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (items.length < 3) continue; // 너무 적으면 페이지 가치가 없어서 건너뜀
  const filename = `theme-${theme.slug}.html`;
  fs.writeFileSync(
    filename,
    buildListPage({
      filename,
      title: `전국 ${theme.name} 총정리 (${items.length}곳) — FestivalHub`,
      heading: `${theme.icon} ${theme.name}`,
      subtitle: `전국에서 열리는 ${theme.name} ${items.length}곳 — 날짜순 정리`,
      description: `전국 ${theme.name} 모음. ${items.slice(0, 5).map((f) => f.name).join(", ")} 등 ${items.length}곳의 일정·장소·사진 정보를 한눈에.`,
      items,
      today: todayYmd,
    }),
    "utf-8"
  );
  themeFiles.push(filename);
  console.log(`✅ ${filename} 생성 (${theme.name} ${items.length}건)`);
}

// ── 우리 동네 공연·행사 페이지 (events.json → events.html 한 장) ──
// 공연은 사진이 없고 정보가 단순해서 카드 대신 줄 목록으로, 지역별 섹션 + 날짜순
let hasEventsPage = false;
try {
  const events = JSON.parse(fs.readFileSync("events.json", "utf-8"));
  if (events.length >= 3) {
    // 지역별로 묶기
    const byRegion = {};
    for (const ev of events) {
      const region = getRegion(ev.address);
      (byRegion[region] = byRegion[region] || []).push(ev);
    }
    // 지역 순서는 가나다순으로 고정 (건수순은 갱신마다 순서가 바뀌어 헷갈림)
    const regionNames = Object.keys(byRegion).sort((a, b) => a.localeCompare(b, "ko"));

    // 앞으로 7일 안에 열리는 공연 — 맨 위에 따로 모아 보여준다 (가장 급한 정보)
    const weekLater = (() => {
      const d = kstNow();
      d.setUTCDate(d.getUTCDate() + 7);
      return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
    })();
    // 상설 전시(90일 이상 이어지는 것)는 "이번 주 공연"의 취지와 달라 제외
    const toD = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
    const soonEvents = events
      .filter(
        (ev) =>
          ev.startDate <= weekLater &&
          ev.endDate >= todayYmd &&
          (toD(ev.endDate) - toD(ev.startDate)) / 86400000 < 90
      )
      // 이미 시작한 공연은 오늘 기준으로 취급해 정렬 (몇 달 전 시작한 것이 맨 앞에 오지 않게)
      .sort((a, b) => {
        const ea = a.startDate < todayYmd ? todayYmd : a.startDate;
        const eb = b.startDate < todayYmd ? todayYmd : b.startDate;
        return ea.localeCompare(eb) || a.startDate.localeCompare(b.startDate);
      });

    // 상단 지역 점프 칩 (해당 섹션으로 스크롤). 맨 앞에 "이번 주" 바로가기
    const jumpChips =
      (soonEvents.length ? `<a class="chip chip-hot" href="#ev-soon">🔥 이번 주 ${soonEvents.length}</a>` : "") +
      regionNames
        .map((r) => `<a class="chip" href="#ev-${REGION_SLUGS[r] || "etc"}">${esc(r)} ${byRegion[r].length}</a>`)
        .join("");

    // 공연 이름/내용에서 장르를 추측해 아이콘 부여 (데이터에 이미지가 없어서 시각 구분용)
    // 순서 중요: "뮤지컬"이 "음악"보다 먼저 검사되어야 함
    const eventIcon = (ev) => {
      const t = (ev.name || "") + (ev.desc || "");
      if (/뮤지컬/.test(t)) return "🎶";
      if (/연극|인형극|아동극|넌버벌/.test(t)) return "🎭";
      if (/국악|판소리|민요|풍물|사물놀이|가야금|해금/.test(t)) return "🥁";
      if (/무용|발레|춤|댄스/.test(t)) return "💃";
      if (/마술|매직|서커스/.test(t)) return "🪄"; // "아트"보다 먼저 검사 (사이버매직쇼 같은 경우)
      if (/전시|미술|사진전|아트/.test(t)) return "🖼️";
      if (/영화|시네마/.test(t)) return "🎬";
      if (/클래식|연주회|오케스트라|앙상블|피아노|바이올린|첼로|콘서트|음악회|합창|성악|재즈|밴드/.test(t)) return "🎻";
      return "🎪";
    };

    // 공연 한 건 → 줄 하나. 장소를 클릭하면 네이버지도 검색
    const eventRow = (ev) => {
      const mapQuery = `${(ev.address || "").split(" ").slice(0, 2).join(" ")} ${ev.place || ev.name}`.trim();
      const period =
        ev.startDate === ev.endDate
          ? formatDate(ev.startDate)
          : `${formatDate(ev.startDate)} ~ ${formatDate(ev.endDate)}`;
      const chargeBadge = ev.charge
        ? `<span class="badge ${ev.charge.includes("무료") ? "ongoing" : "upcoming"}">${esc(ev.charge)}</span>`
        : "";
      // 공연명 클릭 목적지 정하기:
      // 등록된 홈페이지가 "그 공연의 상세 페이지"로 보이면(쿼리스트링이 있거나 경로가 깊으면) 직행,
      // 공연장 대표 주소뿐이면 네이버 검색이 정확한 안내를 더 잘 찾아주므로 검색으로 보낸다
      const isDeepLink = ev.homepage && (ev.homepage.includes("?") || ev.homepage.split("/").length > 5);
      const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(`${ev.name} ${ev.place || ""}`.trim())}`;
      const nameLink = isDeepLink
        ? `<a class="event-name-link" target="_blank" rel="noopener" href="${esc(ev.homepage)}">${esc(ev.name)} ↗</a>`
        : `<a class="event-name-link" target="_blank" rel="noopener" href="${searchUrl}">${esc(ev.name)} 🔍</a>`;
      // 대표 주소만 있는 경우엔 아래 정보 줄에 공연장 홈페이지 링크를 따로 달아준다
      const venueHomeLink =
        ev.homepage && !isDeepLink
          ? ` · <a target="_blank" rel="noopener" href="${esc(ev.homepage)}">🏛️ 공연장 홈페이지</a>`
          : "";
      return `
      <div class="event-row">
        <div class="event-date">${period}${ev.time ? `<br><span class="event-time">${esc(ev.time)}</span>` : ""}</div>
        <div class="event-main">
          <div class="event-name"><span class="event-icon">${eventIcon(ev)}</span> ${nameLink} ${chargeBadge}</div>
          ${ev.desc ? `<div class="event-desc">${esc(ev.desc)}</div>` : ""}
          <div class="event-meta">
            ${ev.place ? `<a target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(mapQuery)}">📍 ${esc(ev.place)}</a>` : ""}
            ${ev.tel ? ` · 📞 ${esc(ev.tel)}` : ""}${venueHomeLink}
          </div>
        </div>
      </div>`;
    };

    // 이번 주 섹션을 맨 위에 (지역 구분 없이 날짜순 — 가장 급한 공연부터)
    const soonSection = soonEvents.length
      ? `
      <section class="event-region" id="ev-soon">
        <h2>🔥 이번 주 공연 <span class="event-count">${soonEvents.length}건 · 앞으로 7일</span></h2>
        ${soonEvents.map(eventRow).join("")}
      </section>`
      : "";

    const sections =
      soonSection +
      regionNames
        .map(
          (r) => `
      <section class="event-region" id="ev-${REGION_SLUGS[r] || "etc"}">
        <h2>📍 ${esc(r)} <span class="event-count">${byRegion[r].length}건</span></h2>
        ${byRegion[r].map(eventRow).join("")}
      </section>`
        )
        .join("");

    fs.writeFileSync(
      "events.html",
      `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>우리 동네 공연·행사 일정 (${events.length}건) — FestivalHub</title>
  <meta name="description" content="전국 문예회관·지자체의 공연, 연주회, 연극 등 동네 공연·행사 ${events.length}건을 지역별로 정리했습니다. 매일 업데이트." />
  <link rel="canonical" href="${SITE_URL}/events.html" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="우리 동네 공연·행사 일정 — FestivalHub" />
  <meta property="og:description" content="전국 동네 공연·연주회·연극 ${events.length}건 지역별 정리" />
  <meta property="og:url" content="${SITE_URL}/events.html" />
  <link rel="stylesheet" href="style.css" />
  ${FONT_LINK}
  <link rel="stylesheet" href="report.css?v=${BUILD_VER}" />
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>🎭 우리 동네 공연·행사</h1>
    <p class="subtitle">문예회관·지자체 공연과 행사 ${events.length}건 — <br class="mobile-br" />이번 주 공연 먼저, 그다음 지역별·날짜순</p>
    <p class="home-link"><a href="index.html">← 전체 축제 보기</a></p>
  </header>
  <!-- 지역 칩 줄은 스크롤해도 화면 상단에 고정됨 (sticky-nav) -->
  <nav class="quick-links sticky-nav">${jumpChips}</nav>
  <main class="events-container">${sections}</main>
  <!-- 우측 하단 맨 위로 버튼 -->
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
  <script src="report.js?v=${BUILD_VER}"></script>
</body>
</html>`,
      "utf-8"
    );
    hasEventsPage = true;
    console.log(`✅ events.html 생성 (공연·행사 ${events.length}건, ${regionNames.length}개 지역)`);
  }
} catch (err) {
  if (err.code === "ENOENT") {
    console.log("ℹ️ events.json이 없어 공연·행사 페이지는 건너뜀 (fetch-festivals.js 실행 필요)");
  } else {
    // 파일이 있는데 실패한 것은 코드 문제이므로 숨기지 말고 그대로 알린다
    throw err;
  }
}

// ── KOPIS 공연 페이지 (performances.json → shows.html + show/<id>.html) ──
// 출처 표기 의무: (재)예술경영지원센터 공연예술통합전산망(www.kopis.or.kr). 포스터는 KOPIS가 제공하는 경로를 그대로 링크.
const KOPIS_CREDIT = `공연 정보·포스터 출처: <a href="https://www.kopis.or.kr" target="_blank" rel="noopener">(재)예술경영지원센터 공연예술통합전산망(KOPIS)</a>`;
let shows = [];
try { shows = JSON.parse(fs.readFileSync("performances.json", "utf-8")).filter((s) => s.endDate >= todayStr()); } catch {}
const showFiles = [];
if (shows.length >= 10) {
  const showDir = path.join(__dirname, "show");
  if (!fs.existsSync(showDir)) fs.mkdirSync(showDir);
  for (const old of fs.readdirSync(showDir)) if (old.endsWith(".html")) fs.unlinkSync(path.join(showDir, old));

  // 공연 사진 제보 메일 링크 (축제 reportMailto와 같은 모듈, 페이지 주소만 show/)
  const showReportMailto = (s) => VP.reportMailto(s
    ? { email: REPORT_EMAIL, siteName: "FestivalHub", name: s.name, where: s.venue, pageUrl: `${SITE_URL}/show/${s.id}.html` }
    : { email: REPORT_EMAIL, siteName: "FestivalHub 공연" });
  const GENRE_ICON = { 뮤지컬: "🎼", 연극: "🎭", "서양음악(클래식)": "🎻", "한국음악(국악)": "🥁", 대중음악: "🎤", "무용(서양/한국무용)": "🩰", 대중무용: "💃", "서커스/마술": "🎪", 복합: "✨" };
  const gIcon = (g) => GENRE_ICON[g] || "🎫";
  const regionOf = (s) => getRegion(s.address || s.area || "");
  const showCard = (s, prefix = "") => `
      <a class="card-link" href="${prefix}show/${s.id}.html">
        <article class="card show-card">
          ${s.poster ? `<img src="${esc(s.poster)}" alt="${esc(s.name)} 포스터" loading="lazy" />` : `<div class="no-image">${gIcon(s.genre)}</div>`}
          <div class="card-body">
            <span class="badge ${s.state === "공연중" ? "ongoing" : "upcoming"}">${esc(s.state)}</span>
            <span class="badge long">${gIcon(s.genre)} ${esc(s.genre)}</span>
            <h2>${esc(s.name)}</h2>
            <p class="period">📅 ${formatDate(s.startDate)} ~ ${formatDate(s.endDate)}</p>
            <p class="address">📍 ${esc(s.venue)}</p>
          </div>
        </article>
      </a>`;

  // 상세 페이지
  for (const s of shows) {
    const d = s.detail || {};
    const region = regionOf(s);
    const hasCoords = s.lat && s.lng;
    const tickets = (d.tickets || []).length
      ? `<section class="overview"><h2>🎟️ 예매하기</h2><div class="dir-buttons">${d.tickets.map((t) => `<a class="dir-btn ticket" target="_blank" rel="noopener nofollow" href="${esc(t.url)}">${esc(t.name || "예매처")} 예매</a>`).join("")}</div></section>`
      : "";
    const story = d.story ? `<section class="overview"><h2>소개</h2><p>${esc(d.story).replace(/\n+/g, "<br />")}</p></section>` : "";
    const gallery = (d.images || []).length ? `<div class="thumbs">${d.images.slice(0, 6).map((u, i) => `<img src="${esc(u)}" alt="${esc(s.name)} 소개 이미지 ${i + 1}" class="thumb" loading="lazy" />`).join("")}</div>` : "";
    const same = shows.filter((o) => o.id !== s.id && regionOf(o) === region && o.genre === s.genre).slice(0, 6);
    const sameSection = same.length ? `<section class="nearby-section"><h2>🎭 ${esc(region)}의 다른 ${esc(s.genre)}</h2><div class="festival-grid">${same.map((o) => showCard(o, "../")).join("")}</div></section>` : "";
    const description = (d.story || `${s.name} — ${formatDate(s.startDate)}~${formatDate(s.endDate)}, ${s.venue}. ${s.genre}${d.price ? `, ${d.price}` : ""}`).slice(0, 150);
    const jsonLd = { "@context": "https://schema.org", "@type": "Event", name: s.name, startDate: `${s.startDate.slice(0, 4)}-${s.startDate.slice(4, 6)}-${s.startDate.slice(6, 8)}`, endDate: `${s.endDate.slice(0, 4)}-${s.endDate.slice(4, 6)}-${s.endDate.slice(6, 8)}`, eventStatus: "https://schema.org/EventScheduled", location: { "@type": "Place", name: s.venue, address: s.address || s.area }, ...(s.poster ? { image: [s.poster] } : {}), ...(d.producer ? { organizer: { "@type": "Organization", name: d.producer } } : {}) };
    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(s.name)} — ${esc(s.venue)} ${esc(s.genre)} 일정·예매 | FestivalHub</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/show/${s.id}.html" />
  ${s.detail ? "" : `<meta name="robots" content="noindex,follow" />`}
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(s.name)} — ${esc(s.venue)}" />
  <meta property="og:description" content="${esc(description)}" />
  ${s.poster ? `<meta property="og:image" content="${esc(s.poster)}" />` : ""}
  <meta property="og:url" content="${SITE_URL}/show/${s.id}.html" />
  <link rel="stylesheet" href="../style.css" />
  ${FONT_LINK}
  <link rel="stylesheet" href="../report.css?v=${BUILD_VER}" />
  ${hasCoords ? `<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" /><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>` : ""}
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  ${GA_SNIPPET}
</head>
<body>
  <main class="detail-container">
    <a class="back-link" href="../shows.html">← 전국 공연 일정으로</a>
    ${s.poster ? `<img class="hero show-poster" src="${esc(s.poster)}" alt="${esc(s.name)} 포스터" />` : ""}
    <div class="detail-body">
      <div class="badges"><span class="badge ${s.state === "공연중" ? "ongoing" : "upcoming"}">${esc(s.state)}</span> <span class="badge long">${gIcon(s.genre)} ${esc(s.genre)}</span>${d.kids ? ` <span class="badge upcoming">👶 아동 공연</span>` : ""}${s.openrun ? ` <span class="badge long">오픈런</span>` : ""}</div>
      <h1>${esc(s.name)}</h1>
      <div class="info-grid">
        ${infoRow("📅", "공연 기간", `${formatDate(s.startDate)} ~ ${formatDate(s.endDate)}`)}
        ${infoRow("🏛️", "공연장", esc(s.venue) + (s.address ? `<br /><span style="color:#777">${esc(s.address)}</span>` : ""))}
        ${infoRow("⏰", "공연 시간", esc(d.schedule))}
        ${infoRow("⌛", "러닝타임", esc(d.runtime))}
        ${infoRow("🔞", "관람 연령", esc(d.age))}
        ${infoRow("💰", "티켓 가격", esc(d.price))}
        ${infoRow("🎭", "출연", esc(d.cast))}
        ${infoRow("🎬", "제작진", esc(d.crew))}
        ${infoRow("🏢", "제작·기획", esc(d.producer))}
        ${infoRow("📞", "공연장 문의", esc(s.venueTel))}
      </div>
      ${tickets}
      ${VP.galleryHtml(visitorPhotos[String(s.id)], { name: s.name, href: showReportMailto(s) })}
      ${VP.photoCallHtml({ title: "공연 사진 자랑해 주세요!", text: "이 공연 보고 오셨나요? 커튼콜·공연장 앞 인증샷·포스터 사진을 보내주세요 — <strong>닉네임과 함께</strong> 이 페이지에 올려드려요. (공연 중 촬영은 공연장 규정을 따라 주세요)", href: showReportMailto(s) })}
      ${story}
      ${gallery}
      ${ADFIT_BODY}
      <section class="map-section"><h2>오시는 길</h2>${hasCoords ? `<div id="map"></div>` : ""}
        <div class="dir-buttons">
          ${hasCoords ? `<a class="dir-btn kakao" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${encodeURIComponent(s.venue)},${s.lat},${s.lng}">🚗 카카오맵 길찾기</a>` : ""}
          <a class="dir-btn naver" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(s.address || s.venue)}">🧭 네이버지도에서 보기</a>
        </div>
      </section>
      ${sameSection}
      <p class="coupang-notice">※ ${KOPIS_CREDIT}. 공연 일정·가격은 변경될 수 있으니 예매처에서 다시 확인해 주세요.</p>
    </div>
  </main>
  ${footerHtml("../")}
  ${hasCoords ? `<script>
    const map = L.map("map", { scrollWheelZoom: false }).setView([${s.lat}, ${s.lng}], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "&copy; OpenStreetMap" }).addTo(map);
    L.marker([${s.lat}, ${s.lng}]).addTo(map).bindPopup(${JSON.stringify(s.venue)}).openPopup();
  </script>` : ""}
  <script src="../track-clicks.js"></script>
  <script src="../report.js?v=${BUILD_VER}"></script>
</body>
</html>`;
    fs.writeFileSync(path.join(showDir, `${s.id}.html`), html, "utf-8");
    if (s.detail) showFiles.push(`show/${s.id}.html`); // 상세가 채워진 공연만 사이트맵에 (나머지는 noindex, 매일 400건씩 채워짐)
  }

  // 목록 페이지 shows.html — 이번 주 시작 / 장르 칩 / 지역별
  const soon = shows.filter((s) => s.startDate >= todayStr() && s.startDate <= ymdAfter(7)).slice(0, 12);
  const genres = [...new Set(shows.map((s) => s.genre))].sort((a, b) => shows.filter((s) => s.genre === b).length - shows.filter((s) => s.genre === a).length);
  const byRegion = {};
  for (const s of shows) (byRegion[regionOf(s)] = byRegion[regionOf(s)] || []).push(s);
  const regionNames = Object.keys(byRegion).sort((a, b) => byRegion[b].length - byRegion[a].length);
  fs.writeFileSync("shows.html", `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>전국 공연 일정 ${shows.length}건 — 뮤지컬·연극·콘서트·클래식 | FestivalHub</title>
  <meta name="description" content="앞으로 3개월 안에 열리는 전국 뮤지컬, 연극, 콘서트, 클래식, 국악, 무용 공연 ${shows.length}건. 포스터·공연장·가격·예매처를 한눈에. KOPIS 공연예술통합전산망 데이터 기반, 매일 갱신." />
  <link rel="canonical" href="${SITE_URL}/shows.html" />
  <meta property="og:title" content="전국 공연 일정 — FestivalHub" />
  <meta property="og:description" content="뮤지컬·연극·콘서트·클래식 ${shows.length}건, 매일 갱신" />
  <meta property="og:url" content="${SITE_URL}/shows.html" />
  <link rel="stylesheet" href="style.css" />
  ${FONT_LINK}
  <link rel="stylesheet" href="report.css?v=${BUILD_VER}" />
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>🎭 전국 공연 일정</h1>
    <p class="subtitle">앞으로 3개월 안에 열리는 뮤지컬·연극·콘서트·클래식 ${shows.length}건</p>
    <p class="home-link"><a href="index.html">← 전체 축제 보기</a> · <a href="events.html">지자체 소규모 행사 보기</a></p>
  </header>
  <nav class="quick-links sticky-desktop">
    ${genres.map((g) => `<a class="chip" href="#genre-${encodeURIComponent(g)}">${gIcon(g)} ${esc(g)} ${shows.filter((s) => s.genre === g).length}</a>`).join("")}
  </nav>
  <nav class="quick-links">
    ${regionNames.map((r) => `<a class="chip" href="#region-${REGION_SLUGS[r] || "etc"}">${esc(r)} ${byRegion[r].length}</a>`).join("")}
  </nav>
  <div style="max-width:1200px;margin:0 auto;padding:0 16px">${VP.photoCallHtml({ title: "공연 사진 자랑해 주세요!", text: "공연 보고 오셨나요? 커튼콜·공연장 앞 인증샷·포스터 사진을 보내주세요 — <strong>닉네임과 함께</strong> 공연 페이지에 올려드려요.", href: showReportMailto(null) })}</div>
  ${soon.length ? `<section class="event-region" style="max-width:1200px;margin:0 auto;padding:0 16px"><h2>🆕 이번 주 시작하는 공연</h2></section><main class="festival-grid">${soon.map((s) => showCard(s)).join("")}</main>` : ""}
  ${genres.map((g) => `<section class="event-region" id="genre-${encodeURIComponent(g)}" style="max-width:1200px;margin:0 auto;padding:0 16px"><h2>${gIcon(g)} ${esc(g)} <span class="event-count">${shows.filter((s) => s.genre === g).length}건</span></h2></section><main class="festival-grid">${shows.filter((s) => s.genre === g).slice(0, 24).map((s) => showCard(s)).join("")}</main>`).join("")}
  ${regionNames.map((r) => `<section class="event-region" id="region-${REGION_SLUGS[r] || "etc"}" style="max-width:1200px;margin:0 auto;padding:0 16px"><h2>📍 ${esc(r)} <span class="event-count">${byRegion[r].length}건</span></h2></section><main class="festival-grid">${byRegion[r].slice(0, 24).map((s) => showCard(s)).join("")}</main>`).join("")}
  <p class="coupang-notice" style="max-width:1200px;margin:0 auto;padding:0 16px">※ ${KOPIS_CREDIT} · 매일 새벽 자동 갱신</p>
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
  <script src="report.js?v=${BUILD_VER}"></script>
</body>
</html>`, "utf-8");
  showFiles.push("shows.html");
  console.log(`✅ 공연 페이지 ${showFiles.length - 1}개 + shows.html (KOPIS ${shows.length}건)`);
} else if (shows.length) {
  console.log(`ℹ️ 공연 데이터가 ${shows.length}건뿐이라 공연 페이지 생성 건너뜀`);
}
function ymdAfter(n) { const d = kstNow(); d.setUTCDate(d.getUTCDate() + n); return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0"); }

// ── 축제 가이드 글 + 에디터 추천 페이지 (festival-guides.js — 운영자가 직접 쓴 콘텐츠) ──
const { GUIDE_PAGES, PICKS } = require("./festival-guides.js");
function articlePage({ filename, title, desc, icon, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} — FestivalHub</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${SITE_URL}/${filename}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)} — FestivalHub" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${SITE_URL}/${filename}" />
  <link rel="stylesheet" href="style.css" />
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${icon} ${esc(title)}</h1>
    <p class="home-link"><a href="index.html">← 전체 축제 보기</a></p>
  </header>
  <main class="detail-container">
    <div class="detail-body guide-body">
      ${bodyHtml}
      <p class="coupang-notice">※ 이 글은 FestivalHub 운영자가 직접 쓴 가이드입니다. 축제 운영 방식은 해마다 달라질 수 있으니 방문 전 공식 안내를 함께 확인해 주세요.</p>
    </div>
  </main>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
</body>
</html>`;
}
const guideFiles = [];
for (const g of GUIDE_PAGES) {
  const filename = `${g.slug}.html`;
  fs.writeFileSync(filename, articlePage({ filename, title: g.title, desc: g.desc, icon: g.icon, bodyHtml: g.body }), "utf-8");
  guideFiles.push(filename);
}
// 에디터 추천: 키로 현재 데이터에서 축제를 찾아 카드로 (종료·미수집 축제는 건너뜀)
const pickToday = todayStr();
for (const pk of PICKS) {
  const filename = `${pk.slug}.html`;
  const cards = pk.items
    .map((it) => {
      const f = festivals
        .filter((x) => x.endDate >= pickToday && normFestName(x.name).includes(it.key.toLowerCase()))
        .sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0))[0];
      if (!f) return "";
      const pickImg = f.image || (f.venuePhoto && f.venuePhoto.image);
      const img = pickImg
        ? `<img src="${esc(pickImg)}" alt="${esc(f.name)}" loading="lazy" />`
        : `<div class="pick-noimg">🎪</div>`;
      return `
      <a class="pick-card" href="festival/${f.contentid}.html">
        ${img}
        <div class="pick-body">
          <span class="badge upcoming">${esc(it.tag)}</span>
          <h3>${esc(f.name)}</h3>
          <p class="period">📅 ${formatDate(f.startDate)} ~ ${formatDate(f.endDate)} · 📍 ${esc(String(f.address || "").split(" ").slice(0, 2).join(" "))}</p>
          <p class="pick-why">${esc(it.why)}</p>
        </div>
      </a>`;
    })
    .filter(Boolean);
  const pkMonth = pk.slug.match(/picks-(\d{4})-(\d{2})/);
  const bodyHtml = `
      <section class="overview"><p>${pk.intro}</p>${pkMonth ? `<p class="guide-tip">🗓️ 15곳 말고 전부 보고 싶다면 <a href="month-${pkMonth[1]}-${pkMonth[2]}.html">${Number(pkMonth[2])}월 축제 전체 일정</a>으로.</p>` : ""}</section>
      <div class="pick-list">${cards.join("")}</div>
      <p class="guide-tip">💡 가기 전에 <a href="guide-checklist.html">준비물 체크리스트</a>와 <a href="guide-parking.html">주차·셔틀 요령</a>도 함께 보세요. 비 예보가 있으면 <a href="guide-rain.html">우천 확인법</a>을.</p>`;
  fs.writeFileSync(filename, articlePage({ filename, title: pk.title, desc: pk.desc, icon: "🍂", bodyHtml }), "utf-8");
  guideFiles.push(filename);
  console.log(`✅ ${filename} (추천 ${cards.length}/${pk.items.length}곳 매칭)`);
}
console.log(`✅ 가이드·추천 페이지 ${guideFiles.length}개`);

// ── sitemap.xml: 검색엔진에게 "우리 사이트에 이런 페이지들이 있어요" 알려주는 지도 ──
const today = kstNow().toISOString().slice(0, 10); // 한국시간 기준 날짜
const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/about.html`,
  `${SITE_URL}/privacy.html`,
  `${SITE_URL}/weekend.html`,
  ...guideFiles.map((gf) => `${SITE_URL}/${gf}`),
  ...showFiles.map((sf) => `${SITE_URL}/${sf}`),
  ...(hasEventsPage ? [`${SITE_URL}/events.html`] : []),
  ...monthFiles.map((mf) => `${SITE_URL}/${mf}`),
  ...themeFiles.map((tf) => `${SITE_URL}/${tf}`),
  ...regionFiles.map((rf) => `${SITE_URL}/${rf}`),
  // 정말 빈 페이지(noindex)는 사이트맵에서도 제외
  ...festivals.filter((f) => !isBarePage(f)).map((f) => `${SITE_URL}/festival/${f.contentid}.html`),
  // 종료 축제도 사이트맵에 유지 — 색인을 지키고 내년 검색까지 잡는 자산
  ...archivedFestivals.filter((f) => !isBarePage(f)).map((f) => `${SITE_URL}/festival/${f.contentid}.html`),
];
console.log(`ℹ️ noindex(빈 페이지) ${[...festivals, ...archivedFestivals].filter(isBarePage).length}개`);
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
  `\n</urlset>\n`;
fs.writeFileSync("sitemap.xml", sitemap, "utf-8");
console.log(`✅ sitemap.xml 생성 (${urls.length}개 주소)`);

// ── pinned.json: 최근 PIN_DAYS 안에 방문자 사진·영상이 올라온 축제 → 랜딩 맨 위 고정 (app.js가 읽음) ──
// 축제에 다녀온 사람이 사진을 보내는 시점엔 축제가 이미 끝난 경우가 많아서, 끝난 축제도 며칠은 맨 위에 보여준다.
{
  const pins = VP.pinnedMap(visitorPhotos, todayYmd);
  const byId = Object.fromEntries([...festivals, ...archivedFestivals].map((f) => [String(f.contentid), f]));
  const pinned = Object.entries(pins)
    .map(([id, p]) => {
      const f = byId[id];
      if (!f) return null;
      return {
        contentid: f.contentid, name: f.name, startDate: f.startDate, endDate: f.endDate,
        address: f.address, lat: f.lat, lng: f.lng,
        image: p.image || f.image || "", photoCount: p.count, hasVideo: p.hasVideo, pinnedUntil: p.until,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pinnedUntil.localeCompare(a.pinnedUntil));
  fs.writeFileSync("pinned.json", JSON.stringify(pinned), "utf-8");
  console.log(`📌 방문자 사진 고정 ${pinned.length}건 (pinned.json, ${VP.PIN_DAYS}일 고정)`);
}

// ── robots.txt: 검색봇에게 "다 읽어가도 좋고, 지도는 여기 있어요" ──
fs.writeFileSync(
  "robots.txt",
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  "utf-8"
);
console.log("✅ robots.txt 생성");
