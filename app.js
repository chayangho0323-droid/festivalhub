// app.js — festivals.json을 읽어서 화면에 카드로 그리는 코드

// 화면 요소들을 미리 잡아둔다
const listEl = document.getElementById("festival-list");
const searchEl = document.getElementById("search-input");
const regionEl = document.getElementById("region-filter");
const sortEl = document.getElementById("sort-order");
const countEl = document.getElementById("result-count");
const hideLongEl = document.getElementById("hide-long");
const onlyFavEl = document.getElementById("only-fav");

// ── 찜하기: 브라우저 저장소(localStorage)에 contentid 목록으로 보관 ──
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem("favorites")) || [];
  } catch {
    return [];
  }
}

function toggleFavorite(id) {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  localStorage.setItem("favorites", JSON.stringify(favs));
}

let allFestivals = []; // 전체 데이터 보관용

// ─── 도우미 함수들 ──────────────────────────────────────────

// "20260729" → "2026.07.29"
function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return "";
  return `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}`;
}

// 오늘 날짜를 "20260810" 형태로
function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

// 주소 맨 앞부분을 보고 표준 지역명으로 통일한다.
// 원본 데이터에 "충청남도"와 "충남", "강원특별자치도"와 "강원", "서울특별"(오타)처럼
// 같은 지역이 여러 표기로 섞여 있어서, 앞글자 매칭으로 정규화한다.
// ※ 긴 접두어("전남광주")를 짧은 것("전남")보다 먼저 검사해야 함
const REGION_PREFIXES = [
  ["전남광주", "전남·광주"],
  ["서울", "서울"],
  ["부산", "부산"],
  ["대구", "대구"],
  ["인천", "인천"],
  ["광주", "광주"],
  ["대전", "대전"],
  ["울산", "울산"],
  ["세종", "세종"],
  ["경기", "경기"],
  ["강원", "강원"],
  ["충청북", "충북"],
  ["충북", "충북"],
  ["충청남", "충남"],
  ["충남", "충남"],
  ["전라북", "전북"],
  ["전북", "전북"],
  ["전라남", "전남"],
  ["전남", "전남"],
  ["경상북", "경북"],
  ["경북", "경북"],
  ["경상남", "경남"],
  ["경남", "경남"],
  ["제주", "제주"],
];

function getRegion(address) {
  if (!address) return "기타";
  for (const [prefix, name] of REGION_PREFIXES) {
    if (address.startsWith(prefix)) return name;
  }
  return "기타";
}

// 축제 기간이 90일 이상이면 "상설·장기"로 분류
// (수문장 교대의식, 상설 드론쇼처럼 연중 내내 하는 행사를 구분하기 위함)
function isLongRunning(f) {
  const toDate = (s) =>
    new Date(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  const days = (toDate(f.endDate) - toDate(f.startDate)) / (1000 * 60 * 60 * 24);
  return days >= 90;
}

// 시작일까지 며칠 남았는지 계산 (진행중이면 null 반환 안 하고 배지에서 처리)
function daysUntil(yyyymmdd) {
  const y = Number(yyyymmdd.slice(0, 4));
  const m = Number(yyyymmdd.slice(4, 6)) - 1;
  const d = Number(yyyymmdd.slice(6, 8));
  const target = new Date(y, m, d);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

// ─── 카드 그리기 ────────────────────────────────────────────

function render() {
  const keyword = searchEl.value.trim().toLowerCase();
  const region = regionEl.value;
  const today = todayStr();

  // 1) 검색어와 지역으로 거르기
  const favorites = getFavorites();

  let shown = allFestivals.filter((f) => {
    const matchKeyword = !keyword || f.name.toLowerCase().includes(keyword);
    const matchRegion = !region || getRegion(f.address) === region;
    const matchLong = !hideLongEl.checked || !isLongRunning(f);
    const matchFav = !onlyFavEl.checked || favorites.includes(f.contentid);
    return matchKeyword && matchRegion && matchLong && matchFav;
  });

  // 2) 정렬
  if (sortEl.value === "date") {
    shown.sort((a, b) => a.startDate.localeCompare(b.startDate));
  } else {
    shown.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  countEl.textContent = `${shown.length}개의 축제`;

  // 3) 카드 HTML 만들기
  listEl.innerHTML = shown
    .map((f) => {
      const ongoing = f.startDate <= today && today <= f.endDate;
      const dday = daysUntil(f.startDate);
      // 상설·장기 행사는 회색 배지, 나머지는 진행중/디데이 배지
      const badge = isLongRunning(f)
        ? `<span class="badge long">상설·장기</span>`
        : ongoing
          ? `<span class="badge ongoing">진행중</span>`
          : `<span class="badge upcoming">D-${dday}</span>`;

      const img = f.image
        ? `<img src="${f.image}" alt="${f.name}" loading="lazy" />`
        : `<div class="no-image">🎪</div>`;

      const faved = favorites.includes(f.contentid);

      // 카드 전체를 <a>로 감싸서 클릭하면 상세 페이지로 이동.
      // 하트 버튼은 카드 위에 겹쳐 놓고, 클릭 시 페이지 이동을 막는다 (아래 이벤트 처리 참고)
      return `
        <a class="card-link" href="festival/${f.contentid}.html">
          <article class="card">
            <button class="fav-heart${faved ? " faved" : ""}" data-id="${f.contentid}" aria-label="찜하기">${faved ? "❤️" : "🤍"}</button>
            ${img}
            <div class="card-body">
              ${badge}
              <h2>${f.name}</h2>
              <p class="period">📅 ${formatDate(f.startDate)} ~ ${formatDate(f.endDate)}</p>
              <p class="address">📍 ${f.address || "주소 정보 없음"}</p>
            </div>
          </article>
        </a>`;
    })
    .join("");
}

// ─── 지역 드롭다운 채우기 ───────────────────────────────────

function fillRegionOptions() {
  // Set을 쓰면 중복이 자동 제거됨
  const regions = [...new Set(allFestivals.map((f) => getRegion(f.address)))];
  regions.sort((a, b) => a.localeCompare(b, "ko"));
  for (const r of regions) {
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    regionEl.appendChild(opt);
  }
}

// ─── 시작: 데이터 불러오기 ──────────────────────────────────

async function init() {
  try {
    const res = await fetch("festivals.json");
    if (!res.ok) throw new Error(`festivals.json 로드 실패 (${res.status})`);
    allFestivals = await res.json();

    fillRegionOptions();
    render();
  } catch (err) {
    listEl.innerHTML = `<p style="text-align:center; grid-column: 1 / -1;">
      ⚠️ 데이터를 불러오지 못했습니다: ${err.message}<br>
      node fetch-festivals.js 를 먼저 실행했는지, serve.js로 접속했는지 확인하세요.
    </p>`;
  }
}

// 검색/필터/정렬이 바뀔 때마다 다시 그린다
searchEl.addEventListener("input", render);
regionEl.addEventListener("change", render);
sortEl.addEventListener("change", render);
hideLongEl.addEventListener("change", render);
onlyFavEl.addEventListener("change", render);

// 하트 클릭 처리: 카드가 새로 그려져도 동작하도록 목록 전체에 이벤트를 하나만 건다
// (하트는 <a> 안에 있어서 preventDefault로 페이지 이동을 막아야 함)
listEl.addEventListener("click", (e) => {
  const heart = e.target.closest(".fav-heart");
  if (!heart) return;
  e.preventDefault();
  toggleFavorite(heart.dataset.id);
  render();
});

init();
