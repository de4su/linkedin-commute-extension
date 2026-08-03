const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const els = {
  csvFile: document.getElementById("csvFile"),
  clearData: document.getElementById("clearData"),
  status: document.getElementById("status"),
  homeCity: document.getElementById("homeCity"),
  saveHomeCity: document.getElementById("saveHomeCity"),
};

// Check if there is a custom CSV uploaded and display status
async function checkCustomData() {
  const { customDb, homeCity } = await browserAPI.storage.local.get(["customDb", "homeCity"]);
  
  if (homeCity) {
    els.homeCity.value = homeCity;
  } else {
    els.homeCity.value = "Rotterdam";
  }
  
  if (customDb) {
    els.status.textContent = `Loaded custom data: ${Object.keys(customDb).length} locations.`;
    els.status.style.color = "#057642";
  } else {
    els.status.textContent = "Using default database.";
    els.status.style.color = "#5e5e5e";
  }
}
checkCustomData();

els.saveHomeCity.addEventListener("click", async () => {
  await browserAPI.storage.local.set({ homeCity: els.homeCity.value.trim() });
  els.status.textContent = "Home city saved!";
  els.status.style.color = "#057642";
  setTimeout(() => checkCustomData(), 2000);
});

els.clearData.addEventListener("click", async () => {
  await browserAPI.storage.local.remove(["customDb"]);
  els.status.textContent = "Custom data cleared.";
  els.status.style.color = "#5e5e5e";
  els.csvFile.value = "";
  checkCustomData();
});

els.csvFile.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  els.status.textContent = "Parsing CSV...";
  els.status.style.color = "#0a66c2";
  
  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const text = evt.target.result;
      const lines = text.split('\n');
      if (lines.length === 0) throw new Error("Empty file");
      
      const headers = lines[0].split(',').map(h => h.trim());
      const destIdx = headers.indexOf("Destination");
      const timeIdx = headers.indexOf("Travel_Time");
      
      if (destIdx === -1 || timeIdx === -1) {
        throw new Error("CSV must contain 'Destination' and 'Travel_Time' columns.");
      }
      
      const db = {};
      let autoOrigin = null;
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = [];
        let cur = '', inQuote = false;
        for (let c = 0; c < line.length; c++) {
          if (line[c] === '"') inQuote = !inQuote;
          else if (line[c] === ',' && !inQuote) { values.push(cur); cur = ''; }
          else cur += line[c];
        }
        values.push(cur);
        
        let originIdx = headers.indexOf("Origin");
        if (originIdx !== -1 && values.length > originIdx && !autoOrigin) {
            let oStr = values[originIdx];
            oStr = oStr.toLowerCase().replace(/netherlands/g, '').replace(/on-site/g, '').trim();
            oStr = oStr.split(",")[0].trim().replace(/\s+/g, '-');
            autoOrigin = oStr;
        }

        if (values.length > Math.max(destIdx, timeIdx)) {
          let dest = values[destIdx];
          let time_str = values[timeIdx];
          
          if (time_str && time_str !== "N/A" && time_str !== "No Results" && time_str.trim() !== "") {
            dest = dest.toLowerCase().replace(/netherlands/g, '').replace(/on-site/g, '').trim();
            dest = dest.split(",")[0].trim().replace(/\s+/g, '-');
            if (dest) db[dest] = time_str;
          }
        }
      }
      
      
      const entryCount = Object.keys(db).length;
      if (entryCount === 0) throw new Error("No valid data found in CSV.");
      
      const toSet = { customDb: db };
      if (autoOrigin) {
          toSet.homeCity = autoOrigin;
          els.homeCity.value = autoOrigin;
      }
      
      await browserAPI.storage.local.set(toSet);
      els.status.textContent = `Success! Loaded ${entryCount} locations.`;
      els.status.style.color = "#057642";
    } catch (err) {
      els.status.textContent = `Error: ${err.message}`;
      els.status.style.color = "#d93025";
    }
  };
  reader.readAsText(file);
});

// -- Application Tracker UI --

const trackerStatusEl = document.getElementById("trackerStatus");
const exportBtn = document.getElementById("exportTracker");
const clearTrackerBtn = document.getElementById("clearTracker");

async function updateTrackerStatus() {
  const { jobTracker = {} } = await browserAPI.storage.local.get("jobTracker");
  const count = Object.keys(jobTracker).length;
  const applied = Object.values(jobTracker).filter(e => e.appliedDate).length;
  const viewed = Object.values(jobTracker).filter(e => e.viewedDate && !e.appliedDate).length;
  if (count === 0) {
    trackerStatusEl.textContent = "No jobs tracked yet.";
  } else {
    trackerStatusEl.textContent = `${count} jobs tracked (${applied} applied, ${viewed} viewed only).`;
  }
}
updateTrackerStatus();

exportBtn.addEventListener("click", async () => {
  const { jobTracker = {} } = await browserAPI.storage.local.get("jobTracker");
  const entries = Object.values(jobTracker);
  if (entries.length === 0) {
    trackerStatusEl.textContent = "Nothing to export.";
    return;
  }
  
  const csvRows = ["Title,Company,Applied Date,Viewed Date,Saved Date"];
  for (const e of entries) {
    const escape = (s) => `"${(s || "").replace(/"/g, '""')}"`;
    csvRows.push([escape(e.title), escape(e.company), e.appliedDate || "", e.viewedDate || "", e.savedDate || ""].join(","));
  }
  
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "linkedin_applications.csv";
  a.click();
  URL.revokeObjectURL(url);
  trackerStatusEl.textContent = "Exported!";
  trackerStatusEl.style.color = "#057642";
});

clearTrackerBtn.addEventListener("click", async () => {
  if (!confirm("Clear all tracked application dates? This cannot be undone.")) return;
  await browserAPI.storage.local.remove("jobTracker");
  trackerStatusEl.textContent = "History cleared.";
  trackerStatusEl.style.color = "#5e5e5e";
});
