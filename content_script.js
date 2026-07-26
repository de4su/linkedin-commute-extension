// LinkedIn's markup isn't public or versioned and changes without notice, so
// these selectors are a best effort. If badges stop appearing: right-click a
// job card (or the detail pane) → Inspect, find the element holding the
// location text, and update SELECTORS below.
const SELECTORS = {
  jobCard: "[data-occludable-job-id], li.scaffold-layout__list-item, div.job-card-container, [data-job-id], li.jobs-search-results__list-item, div.base-card",
  cardLocation: ".artdeco-entity-lockup__caption, .job-card-container__metadata-item, .base-search-card__metadata span",
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

async function processVisibleJobs() {

  const locations = new Map(); // sanitized location -> [{container, locEl}]

  const queue = (container, locationSelector) => {
    const locEl = container.querySelector(locationSelector);
    if (!locEl) return;
    if (locEl.dataset.commuteBadge) return; // already handled or pending
    const clean = sanitizeLocation(locEl.textContent || "");
    if (!clean) return;
    if (!locations.has(clean)) locations.set(clean, []);
    locations.get(clean).push({ locEl });
    locEl.dataset.commuteBadge = "pending";
  };

  document.querySelectorAll(SELECTORS.jobCard).forEach((card) => queue(card, SELECTORS.cardLocation));

  const detailPane = document.querySelector(SELECTORS.detailPane);
  if (detailPane) queue(detailPane, SELECTORS.detailLocation);

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
      // Clear pending state if no time found so we don't block future retries if settings change
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
  document.querySelectorAll(".job-card-container, .base-card").forEach(card => {
    const text = card.innerText || "";
    
    let color = "#057642"; // Green for not applied/seen
    if (text.includes("Applied")) {
      color = "#d93025"; // Red for applied
    } else if (text.includes("Saved") || text.includes("Viewed")) {
      color = "#fbbc04"; // Yellow for saved/viewed
    }
    
    card.style.borderLeft = `4px solid ${color}`;
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
