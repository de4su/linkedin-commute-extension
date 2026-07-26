// LinkedIn's markup isn't public or versioned and changes without notice, so
// these selectors are a best effort. If badges stop appearing: right-click a
// job card (or the detail pane) → Inspect, find the element holding the
// location text, and update SELECTORS below.
const SELECTORS = {
  jobCard: "[data-occludable-job-id], li.scaffold-layout__list-item, div.job-card-container, [data-job-id], li.jobs-search-results__list-item, div.base-card, div.job-card-square, div.discovery-job-card",
  cardLocation: ".artdeco-entity-lockup__caption, .job-card-container__metadata-item, .base-search-card__metadata span, .job-card-square__text, .discovery-job-card__location",
  detailPane: ".jobs-search__job-details--container, .scaffold-layout__detail, .jobs-details__main-content, .job-view-layout",
  detailLocation:
    ".job-details-jobs-unified-top-card__primary-description-container span, .jobs-unified-top-card__bullet, .jobs-unified-top-card__subtitle-primary-grouping span",
};

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const STRIP_PATTERNS = [
  /\bhybrid\b/gi,
  /\bremote\b/gi,
  /\bon[- ]site\b/gi,
  /\bgreater\s+/gi,
  /\s+area\b/gi,
  /\([^)]*\)/g, // leftover parentheticals, e.g. "(Hybrid)"
];

function sanitizeLocation(raw) {
  let text = raw.replace(/[·|]/g, ",");
  for (const pattern of STRIP_PATTERNS) text = text.replace(pattern, " ");
  return text
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[,\s]+|[,\s]+$/g, "")
    .trim();
}

// Trailing debounce with a max wait, so a page under constant mutation
// (LinkedIn re-renders a lot) still gets processed at least every 2s
// instead of the timer resetting forever.
function debounceWithMaxWait(fn, wait, maxWait) {
  let timer = null;
  let lastRun = 0;
  return (...args) => {
    clearTimeout(timer);
    const now = Date.now();
    if (now - lastRun >= maxWait) {
      lastRun = now;
      fn(...args);
    } else {
      timer = setTimeout(() => {
        lastRun = Date.now();
        fn(...args);
      }, wait);
    }
  };
}



function log(msg) {
  console.log("[Commute Extension] " + msg);
}

function requestCommuteTimes(locations) {
  log(`Requesting times for ${locations.length} locations...`);
  return browserAPI.runtime.sendMessage({ type: "GET_COMMUTE_TIMES", locations });
}

function injectBadge(afterEl, timeText) {
  const badge = document.createElement("span");
  badge.className = "commute-badge";
  badge.textContent = `🚆 ${timeText}`;
  afterEl.insertAdjacentElement("afterend", badge);
}

function getJobCards() {
  const cards = [];
  
  // 1. Standard approach (legacy classes)
  document.querySelectorAll(SELECTORS.jobCard).forEach(card => {
    const locEl = card.querySelector(SELECTORS.cardLocation);
    if (locEl) cards.push({ container: card, locEl });
  });
  
  // 2. SDUI approach (heuristic: look for • or · separators)
  document.querySelectorAll("p, span").forEach(el => {
    const text = el.innerText?.trim();
    if (text === "•" || text === "·") {
      const nextEl = el.nextElementSibling;
      const prevEl = el.previousElementSibling;
      if (nextEl && prevEl) {
        // Assume prevEl is Company, nextEl is Location
        const container = el.closest('div[componentkey]') || el.closest('li, .job-card-container');
        if (container) cards.push({ container, locEl: nextEl });
      }
    }
  });
  
  // 3. Detail Pane
  const detailPane = document.querySelector(SELECTORS.detailPane);
  if (detailPane) {
    const locEl = detailPane.querySelector(SELECTORS.detailLocation);
    if (locEl) cards.push({ container: detailPane, locEl });
  }
  
  // Deduplicate by location element
  const unique = new Map();
  for (const c of cards) {
    if (!unique.has(c.locEl)) unique.set(c.locEl, c.container);
  }
  
  return Array.from(unique.entries()).map(([locEl, container]) => ({ locEl, container }));
}

async function processVisibleJobs() {
  const locations = new Map(); // sanitized location -> [{container, locEl}]

  const cards = getJobCards();
  
  for (const { container, locEl } of cards) {
    if (locEl.dataset.commuteBadge) continue; // already handled or pending
    const clean = sanitizeLocation(locEl.textContent || "");
    if (!clean) continue;
    if (!locations.has(clean)) locations.set(clean, []);
    locations.get(clean).push({ locEl, container });
    locEl.dataset.commuteBadge = "pending";
  }

  if (locations.size === 0) return;

  log(`Found ${locations.size} unique locations to process.`);
  const results = await requestCommuteTimes([...locations.keys()]);
  if (!results) {
    log("Received empty results from background.");
    return;
  }

  for (const [loc, entries] of locations) {
    const time = results[loc];
    if (!time) {
      // Clear pending state if no time found
      for (const { locEl } of entries) delete locEl.dataset.commuteBadge;
      continue;
    }
    for (const { locEl } of entries) {
      if (locEl.dataset.commuteBadge === "1") continue; // already injected
      injectBadge(locEl, time);
      locEl.dataset.commuteBadge = "1";
    }
  }
}

function updateJobColors() {
  const cards = getJobCards();
  cards.forEach(({ container }) => {
    const text = container.innerText || "";
    
    let color = "5, 118, 66"; // Green for not applied/seen
    if (text.includes("Applied")) {
      color = "217, 48, 37"; // Red for applied
    } else if (text.includes("Saved") || text.includes("Viewed")) {
      color = "251, 188, 4"; // Yellow for saved/viewed
    }
    container.style.setProperty("border-left", `4px solid rgba(${color}, 0.6)`, "important");
    container.style.setProperty("background", `linear-gradient(90deg, rgba(${color}, 0.15) 0%, rgba(${color}, 0.05) 60%, transparent 100%)`, "important");
  });
}

const scheduleProcess = debounceWithMaxWait(() => {
  processVisibleJobs();
  updateJobColors();
}, 500, 2000);

// LinkedIn's jobs page is a single-page app: pagination and clicking into a
// job both happen via history.pushState, not a full navigation, so a plain
// content script only ever sees the DOM once unless we watch for this too.
for (const method of ["pushState", "replaceState"]) {
  const original = history[method];
  history[method] = function (...args) {
    const result = original.apply(this, args);
    window.dispatchEvent(new Event("linkedin-locationchange"));
    return result;
  };
}
window.addEventListener("popstate", () => window.dispatchEvent(new Event("linkedin-locationchange")));
window.addEventListener("linkedin-locationchange", scheduleProcess);

new MutationObserver(scheduleProcess).observe(document.body, { childList: true, subtree: true });

scheduleProcess();
