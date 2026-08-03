const browserAPI = typeof browser !== "undefined" ? browser : chrome;

let preloadedDb = null;
async function getPreloadedDb() {
  if (preloadedDb !== null) return preloadedDb;
  try {
    const res = await fetch(browserAPI.runtime.getURL("db.json"));
    preloadedDb = await res.json();
  } catch (e) {
    preloadedDb = {};
  }
  return preloadedDb;
}
async function handleGetCommuteTimes({ locations }) {
  if (!locations?.length) return {};

  const preloaded = await getPreloadedDb();
  const { customDb = {}, homeCity } = await browserAPI.storage.local.get(["customDb", "homeCity"]);
  
  // Merge custom over preloaded
  const activeDb = { ...preloaded, ...customDb };

  const results = {};
  
  const aliases = {
    "the-hague": "den-haag",
    "s-gravenhage": "den-haag",
  };
  
  let currentHome = homeCity;
  if (!currentHome) currentHome = "Rotterdam";
  
  currentHome = currentHome.toLowerCase().replace(/netherlands/g, '').replace(/on-site/g, '').trim();
  currentHome = currentHome.split(',')[0].trim().replace(/\s+/g, '-');
  
  aliases[currentHome] = "0m";

  for (const loc of locations) {
    let clean = loc.toLowerCase().replace(/netherlands/g, '').replace(/on-site/g, '').trim();
    clean = clean.split(',')[0].trim().replace(/\s+/g, '-');
    
    // 1. Direct hit
    let hit = activeDb[clean] || activeDb[loc];
    
    // 2. Alias hit (if activeDb has it, or if it's hardcoded like 0m)
    if (!hit && aliases[clean]) {
      hit = activeDb[aliases[clean]] || aliases[clean];
    }
    
    // 3. Fuzzy match
    if (!hit) {
      for (const dbKey in activeDb) {
        // Only allow substring match if it's a full word match (using spaces/hyphens as boundaries)
        const escapedDbKey = dbKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?:^|[- ])${escapedDbKey}(?:[- ]|$)`, 'i');
        if (regex.test(clean) || (clean.length > 4 && dbKey.includes(clean))) {
          hit = activeDb[dbKey];
          break;
        }
      }
    }
    
    if (hit) results[loc] = hit;
  }

  return results;
}

// ── Application Tracker ──────────────────────────────────────────────

async function handleTrackJobStatus({ jobKey, title, company, location, status }) {
  if (!jobKey) return;
  const { jobTracker = {} } = await browserAPI.storage.local.get("jobTracker");
  const existing = jobTracker[jobKey] || { title, company, location };
  
  // Always keep the latest title/company/location
  existing.title = title || existing.title;
  existing.company = company || existing.company;
  existing.location = location || existing.location;
  
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  // Only set the date the FIRST time we see a status (don't overwrite)
  if (status === "Applied" && !existing.appliedDate) {
    existing.appliedDate = today;
  } else if (status === "Viewed" && !existing.viewedDate) {
    existing.viewedDate = today;
  } else if (status === "Saved" && !existing.savedDate) {
    existing.savedDate = today;
  }
  
  jobTracker[jobKey] = existing;
  await browserAPI.storage.local.set({ jobTracker });
  return existing;
}

async function handleGetJobTracker() {
  const { jobTracker = {} } = await browserAPI.storage.local.get("jobTracker");
  return jobTracker;
}

// ── Message Router ───────────────────────────────────────────────────

browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_COMMUTE_TIMES") {
    handleGetCommuteTimes(message)
      .then(sendResponse)
      .catch((err) => {
        console.error("[commute-ext] lookup failed:", err.message);
        sendResponse({});
      });
    return true;
  }
  
  if (message?.type === "TRACK_JOB_STATUS") {
    handleTrackJobStatus(message)
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }
  
  if (message?.type === "GET_JOB_TRACKER") {
    handleGetJobTracker()
      .then(sendResponse)
      .catch(() => sendResponse({}));
    return true;
  }
});


