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
    
    // 3. Fuzzy match (e.g. "noordwijk-binnen" matches "noordwijk")
    if (!hit) {
      for (const dbKey in activeDb) {
        if (clean.includes(dbKey) || dbKey.includes(clean)) {
          hit = activeDb[dbKey];
          break;
        }
      }
    }
    
    if (hit) results[loc] = hit;
  }

  return results;
}

browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_COMMUTE_TIMES") return;
  handleGetCommuteTimes(message)
    .then(sendResponse)
    .catch((err) => {
      console.error("[commute-ext] lookup failed:", err.message);
      sendResponse({});
    });
  return true; // keep the message channel open for the async response
});


