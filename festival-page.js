// festival-page.js — festival/*.html (정적 상세 페이지)의 동작 담당.
// 페이지 내용은 build-pages.js가 미리 만들어두고,
// 여기서는 "움직여야 하는 것"만 처리한다: 찜하기, 캘린더, 링크 복사, 사진 교체, 지도.
// 축제 정보는 각 페이지에 심어둔 window.FESTIVAL에서 읽는다.

const f = window.FESTIVAL;

// ── 찜하기 (index의 app.js와 같은 localStorage 방식) ──
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
  return idx < 0;
}

const favBtn = document.getElementById("fav-btn");
function paintFavBtn(faved) {
  favBtn.textContent = faved ? "❤️ 찜 해제" : "🤍 찜하기";
  favBtn.classList.toggle("faved", faved);
}
paintFavBtn(getFavorites().includes(f.contentid));
favBtn.addEventListener("click", () => paintFavBtn(toggleFavorite(f.contentid)));

// ── 캘린더 링크 (종료일은 하루 뒤로 줘야 마지막 날까지 표시됨) ──
function addOneDay(yyyymmdd) {
  const d = new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)) + 1
  );
  return (
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

document.getElementById("cal-btn").href =
  `https://calendar.google.com/calendar/render?action=TEMPLATE` +
  `&text=${encodeURIComponent(f.name)}` +
  `&dates=${f.startDate}/${addOneDay(f.endDate)}` +
  `&location=${encodeURIComponent(f.address || "")}` +
  `&details=${encodeURIComponent((f.homepage || "") + "\n(FestivalHub)")}`;

// ── 링크 복사 ──
const shareBtn = document.getElementById("share-btn");
shareBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    shareBtn.textContent = "✅ 복사됨!";
  } catch {
    shareBtn.textContent = "⚠️ 복사 실패";
  }
  setTimeout(() => (shareBtn.textContent = "🔗 링크 복사"), 2000);
});

// ── 썸네일 클릭 → 큰 사진 교체 ──
const heroImg = document.getElementById("hero-img");
document.querySelectorAll(".thumb").forEach((t) => {
  t.addEventListener("click", () => {
    heroImg.src = t.dataset.url;
    document.querySelectorAll(".thumb").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
  });
});

// ── 지도 (Leaflet + OpenStreetMap) ──
if (f.lat && f.lng && document.getElementById("map")) {
  const lat = Number(f.lat);
  const lng = Number(f.lng);
  const map = L.map("map").setView([lat, lng], 15);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  L.marker([lat, lng]).addTo(map).bindPopup(f.name).openPopup();
}
