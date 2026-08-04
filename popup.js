const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const els = {
  csvFile: document.getElementById("csvFile"),
  clearData: document.getElementById("clearData"),
  status: document.getElementById("status"),
  homeCity: document.getElementById("homeCity"),
  saveHomeCity: document.getElementById("saveHomeCity"),
  uploadZone: document.getElementById("uploadZone"),
};

// -- Status helpers --
function setStatus(msg, type) {
  els.status.textContent = msg;
  els.status.className = "status-text" + (type ? " " + type : "");
}

// -- Check if there is a custom CSV uploaded and display status --
async function checkCustomData() {
  const { customDb, homeCity } = await browserAPI.storage.local.get(["customDb", "homeCity"]);
  
  els.homeCity.value = homeCity || "Rotterdam";
  
  if (customDb) {
    setStatus("Custom data loaded: " + Object.keys(customDb).length + " locations.", "success");
  } else {
    setStatus("Using default database.", "");
  }
}
checkCustomData();

// -- Drag and drop --
const uploadZone = els.uploadZone;
uploadZone.addEventListener("dragover", (e) => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".csv")) {
    handleCSVFile(file);
  } else {
    setStatus("Please drop a .csv file.", "error");
  }
});

// -- Home city --
els.saveHomeCity.addEventListener("click", async () => {
  const city = els.homeCity.value.trim();
  if (!city) { setStatus("Enter a city name.", "error"); return; }
  await browserAPI.storage.local.set({ homeCity: city });
  setStatus("Home city saved!", "success");
  setTimeout(() => checkCustomData(), 2000);
});

// -- Clear data --
els.clearData.addEventListener("click", async () => {
  await browserAPI.storage.local.remove(["customDb"]);
  els.csvFile.value = "";
  setStatus("Custom data cleared.", "");
  checkCustomData();
});

// -- CSV parsing --
function handleCSVFile(file) {
  setStatus("Parsing CSV...", "");
  
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
        throw new Error("CSV must have 'Destination' and 'Travel_Time' columns. Click the ? icon for the expected format.");
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
      setStatus("Loaded " + entryCount + " locations.", "success");
    } catch (err) {
      setStatus(err.message, "error");
    }
  };
  reader.readAsText(file);
}

els.csvFile.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleCSVFile(file);
});

// -- Application Tracker UI --

const statTotal = document.getElementById("statTotal");
const statApplied = document.getElementById("statApplied");
const statViewed = document.getElementById("statViewed");
const exportBtn = document.getElementById("exportTracker");
const clearTrackerBtn = document.getElementById("clearTracker");

async function updateTrackerStatus() {
  const { jobTracker = {} } = await browserAPI.storage.local.get("jobTracker");
  const entries = Object.values(jobTracker);
  const total = entries.length;
  const applied = entries.filter(e => e.appliedDate).length;
  const viewed = entries.filter(e => e.viewedDate && !e.appliedDate).length;
  
  statTotal.textContent = total;
  statApplied.textContent = applied;
  statViewed.textContent = viewed;
}
updateTrackerStatus();

exportBtn.addEventListener("click", async () => {
  const { jobTracker = {} } = await browserAPI.storage.local.get("jobTracker");
  const entries = Object.values(jobTracker);
  if (entries.length === 0) {
    setStatus("Nothing to export.", "");
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
  setStatus("Exported!", "success");
});

clearTrackerBtn.addEventListener("click", async () => {
  if (!confirm("Clear all tracked application dates? This cannot be undone.")) return;
  await browserAPI.storage.local.remove("jobTracker");
  setStatus("History cleared.", "");
  updateTrackerStatus();
});
