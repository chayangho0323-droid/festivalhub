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
  </script>`;

// 쿠팡 파트너스 링크 목록 — 상품을 늘리려면 여기에 한 줄씩 추가하면 된다.
// (파트너스 링크로 구매가 일어나면 수수료 발생. 고지 문구는 표시 의무사항)
const COUPANG_ITEMS = [
  { name: "🪑 캠핑의자", url: "https://link.coupang.com/a/f7LuGkEJMq" },
  { name: "🧺 돗자리", url: "https://link.coupang.com/a/f7MlAxqn7s" },
  { name: "🌀 휴대용 선풍기", url: "https://link.coupang.com/a/f7Mn8WrdpA" },
];

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
function footerHtml(prefix = "") {
  return `
  <footer class="site-footer">
    <p>축제 정보 출처: 한국관광공사 TourAPI (공공데이터) · 매일 새벽 자동 갱신</p>
    <p><a href="${prefix}about.html">사이트 소개</a> · <a href="${prefix}index.html">전체 축제</a> · <a href="${prefix}weekend.html">이번 주말 축제</a></p>
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

  const homepage = f.homepage
    ? `<a href="${esc(f.homepage)}" target="_blank" rel="noopener">${esc(f.homepage)}</a>`
    : "";

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
  ${GA_SNIPPET}
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
  const img = f.image
    ? `<img src="${esc(f.image)}" alt="${esc(f.name)}" loading="lazy" />`
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
        </div>
      </article>
    </a>`;
}

// 주말/지역 같은 목록형 페이지 한 장을 통째로 만든다
function buildListPage({ filename, title, heading, subtitle, description, items, today }) {
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
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>${esc(heading)}</h1>
    <p class="subtitle">${esc(subtitle)}</p>
    <p class="home-link"><a href="index.html">← 전체 축제 보기</a></p>
  </header>
  ${SITE_NAV}
  <p class="result-count">${items.length}개의 축제</p>
  <main class="festival-grid">${cards || `<p style="grid-column:1/-1;text-align:center;color:#888;">해당하는 축제가 없습니다.</p>`}</main>
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
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
  fs.writeFileSync(path.join(outDir, `${f.contentid}.html`), buildPage(f, festivals), "utf-8");
}
console.log(`✅ festival/*.html ${festivals.length}개 생성`);

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
    ${fs.existsSync(path.join(__dirname, "events.json")) ? `<a class="chip chip-events" href="events.html">🎭 공연·행사</a>` : ""}
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
const monthFiles = [];
for (let i = 0; i < 4; i++) {
  const md = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
  const y = md.getUTCFullYear();
  const m = md.getUTCMonth() + 1;
  const mm = String(m).padStart(2, "0");
  // 축제 기간이 그 달과 하루라도 겹치면 포함 ("31"은 문자열 비교용 상한)
  const items = festivals
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
    const regionNames = Object.keys(byRegion).sort((a, b) => byRegion[b].length - byRegion[a].length);

    // 상단 지역 점프 칩 (해당 섹션으로 스크롤)
    const jumpChips = regionNames
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

    const sections = regionNames
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
  ${GA_SNIPPET}
</head>
<body>
  <header class="site-header">
    <h1>🎭 우리 동네 공연·행사</h1>
    <p class="subtitle">문예회관·지자체 공연과 행사 ${events.length}건 — 지역별·날짜순 (공공데이터 기준)</p>
    <p class="home-link"><a href="index.html">← 전체 축제 보기</a></p>
  </header>
  <!-- 지역 칩 줄은 스크롤해도 화면 상단에 고정됨 (sticky-nav) -->
  <nav class="quick-links sticky-nav">${jumpChips}</nav>
  <main class="events-container">${sections}</main>
  <!-- 우측 하단 맨 위로 버튼 -->
  <a class="to-top" href="#" aria-label="맨 위로">↑</a>
  ${footerHtml("")}
  <script src="track-clicks.js"></script>
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

// ── sitemap.xml: 검색엔진에게 "우리 사이트에 이런 페이지들이 있어요" 알려주는 지도 ──
const today = kstNow().toISOString().slice(0, 10); // 한국시간 기준 날짜
const urls = [
  `${SITE_URL}/`,
  `${SITE_URL}/about.html`,
  `${SITE_URL}/weekend.html`,
  ...(hasEventsPage ? [`${SITE_URL}/events.html`] : []),
  ...monthFiles.map((mf) => `${SITE_URL}/${mf}`),
  ...themeFiles.map((tf) => `${SITE_URL}/${tf}`),
  ...regionFiles.map((rf) => `${SITE_URL}/${rf}`),
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
