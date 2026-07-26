const https = require('https');

const url = 'https://www.google.com/maps/dir/Rotterdam/Amsterdam/data=!4m2!4m1!3e3';

https.get(url, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    // Look for times like "45 min" or "1 hr 10 min" in the HTML
    // Google maps embeds state in window.APP_INITIALIZATION_STATE
    console.log("Response length:", data.length);
    const fs = require('fs');
    fs.writeFileSync('gmaps.html', data);
    console.log("Saved to gmaps.html");
  });
}).on('error', (e) => {
  console.error(e);
});
