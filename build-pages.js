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

const festivals = JSON.parse(fs.readFileSync("festivals.json", "utf-8"));

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

function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

// 정보가 있을 때만 한 줄(라벨 + 내용) 생성
function infoRow(icon, label, value) {
  if (!value) return "";
  return `<div class="info-item"><span class="info-label">${icon} ${label}</span><div class="info-value">${value}</div></div>`;
}

// ─── 축제 한 건 → HTML 페이지 ──────────────────────────────

function buildPage(f) {
  const today = todayStr();
  const ongoing = f.startDate <= today && today <= f.endDate;
  const badge = ongoing
    ? `<span class="badge ongoing">진행중</span>`
    : `<span class="badge upcoming">예정</span>`;

  const period = `${formatDate(f.startDate)} ~ ${formatDate(f.endDate)}`;

  // 검색 결과에 보일 설명문: 소개글 앞부분 150자
  const description = (stripHtml(f.overview) || `${f.name} — ${period}, ${f.address}`).slice(0, 150);

  // ── 사진 갤러리 ──
  const photos = [...new Set([f.image, ...(f.images || [])])].filter(Boolean);
  const gallery = photos.length
    ? `<img class="hero" id="hero-img" src="${esc(photos[0])}" alt="${esc(f.name)}" />` +
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
  // 주소 앞 두 단어(예: "전북특별자치도 진안군")로 숙소 검색
  const stayQuery = (f.address || f.name).split(" ").slice(0, 2).join(" ");
  const directions = `
    <div class="dir-buttons">
      ${hasCoords ? `<a class="dir-btn kakao" target="_blank" rel="noopener" href="https://map.kakao.com/link/to/${encodeURIComponent(f.name)},${f.lat},${f.lng}">🚗 카카오맵 길찾기</a>` : ""}
      <a class="dir-btn naver" target="_blank" rel="noopener" href="https://map.naver.com/p/search/${encodeURIComponent(f.address || f.name)}">🧭 네이버지도에서 보기</a>
      <a class="dir-btn hotel" target="_blank" rel="noopener" href="https://www.booking.com/searchresults.ko.html?ss=${encodeURIComponent(stayQuery)}">🏨 근처 숙소 보기</a>
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
  const nearbyCards = (list) =>
    (list || [])
      .map(
        (p) => `
        <div class="nearby-card">
          ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />` : `<div class="nearby-noimg">📷</div>`}
          <div class="nearby-name">${esc(p.name)}</div>
          <div class="nearby-dist">${p.dist >= 1000 ? (p.dist / 1000).toFixed(1) + "km" : p.dist + "m"}</div>
        </div>`
      )
      .join("");
  const nearbySection = (title, icon, list) =>
    list && list.length
      ? `<section class="nearby-section"><h2>${icon} ${title}</h2><div class="nearby-row">${nearbyCards(list)}</div></section>`
      : "";

  const homepage = f.homepage
    ? `<a href="${esc(f.homepage)}" target="_blank" rel="noopener">${esc(f.homepage)}</a>`
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
  <title>${esc(f.name)} (${period}) — FestivalHub</title>
  <meta name="description" content="${esc(description)}" />
  <link rel="canonical" href="${SITE_URL}/festival/${f.contentid}.html" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(f.name)} (${period})" />
  <meta property="og:description" content="${esc(description)}" />
  ${f.image ? `<meta property="og:image" content="${esc(f.image)}" />` : ""}
  <meta property="og:url" content="${SITE_URL}/festival/${f.contentid}.html" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="../style.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
  <main class="detail-container">
    <a class="back-link" href="../index.html">← 전국 축제 목록으로</a>
    ${gallery}
    <div class="detail-body">
      ${badge}
      <h1>${esc(f.name)}</h1>
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
      ${overview}
      ${extraSections}
      <section class="map-section"><h2>오시는 길</h2>${hasCoords ? `<div id="map"></div>` : ""}${directions}</section>
      ${nearbySection("주변 관광지", "🏞️", f.nearbySpots)}
      ${nearbySection("주변 맛집", "🍜", f.nearbyFood)}
    </div>
  </main>

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
</body>
</html>`;
}

// ─── 실행 ──────────────────────────────────────────────────

const outDir = path.join(__dirname, "festival");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

// 이전 빌드 결과를 지워서, 끝난 축제 페이지가 남아있지 않게 한다
for (const old of fs.readdirSync(outDir)) {
  if (old.endsWith(".html")) fs.unlinkSync(path.join(outDir, old));
}

for (const f of festivals) {
  fs.writeFileSync(path.join(outDir, `${f.contentid}.html`), buildPage(f), "utf-8");
}
console.log(`✅ festival/*.html ${festivals.length}개 생성`);

// ── sitemap.xml: 검색엔진에게 "우리 사이트에 이런 페이지들이 있어요" 알려주는 지도 ──
const today = new Date().toISOString().slice(0, 10);
const urls = [
  `${SITE_URL}/`,
  ...festivals.map((f) => `${SITE_URL}/festival/${f.contentid}.html`),
];
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join("\n") +
  `\n</urlset>\n`;
fs.writeFileSync("sitemap.xml", sitemap, "utf-8");
console.log(`✅ sitemap.xml 생성 (${urls.length}개 주소)`);

// ── robots.txt: 검색봇에게 "다 읽어가도 좋고, 지도는 여기 있어요" ──
fs.writeFileSync(
  "robots.txt",
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  "utf-8"
);
console.log("✅ robots.txt 생성");
