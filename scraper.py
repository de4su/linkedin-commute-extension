import json
import os
import sys
import subprocess
import time
import argparse

try:
    from playwright.sync_api import sync_playwright, TimeoutError
except ImportError:
    print("Playwright is not installed. Installing it now...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
    from playwright.sync_api import sync_playwright, TimeoutError

def format_loc(loc):
    clean = loc.lower().replace('netherlands', '').replace('on-site', '').strip()
    clean = clean.split(',')[0].strip().replace(' ', '-')
    return clean

def scrape_all():
    parser = argparse.ArgumentParser(description="Scrape 9292 commute times.")
    parser.add_argument("--home", required=True, help="Your home location (e.g., Rotterdam)")
    parser.add_argument("--mode", default="transit", choices=["transit", "driving"], help="Commute mode")
    args = parser.parse_args()

    base_location = args.home
    mode = args.mode
    print(f"Scraping for mode: {mode}")

    with open('municipalities.json', 'r') as f:
        cities = json.load(f)

    # Clean and deduplicate city names
    destinations = list(set([format_loc(c) for c in cities]))
    destinations.sort()
    if 'amsterdam' in destinations:
        destinations.remove('amsterdam')
        destinations.insert(0, 'amsterdam')
    if 'rotterdam' in destinations:
        destinations.remove('rotterdam')
        destinations.insert(1, 'rotterdam')

    
    print(f"Loaded {len(destinations)} unique destinations.")

    db_file = "db.json"
    cache = {}
    
    if os.path.exists(db_file):
        print("Existing db.json found. Extracting existing data to resume...")
        with open(db_file, 'r') as f:
            try:
                cache = json.load(f)
                print(f"Resumed with {len(cache)} existing entries.")
            except Exception as e:
                print("Could not parse existing db.json, starting fresh.")

    # Filter out already scraped destinations
    destinations = [d for d in destinations if d not in cache and d != format_loc(base_location)]
    
    if not destinations:
        print("All destinations have already been scraped!")
        return

    print(f"Starting scrape for {len(destinations)} remaining destinations...")

    def save_db():
        with open(db_file, 'w') as f:
            json.dump(cache, f, indent=2)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        # Handle cookies once at the start
        print("Opening 9292.nl to handle cookies (please accept them manually if needed)...")
        page.goto("https://9292.nl/en")
        try:
            page.wait_for_timeout(3000)
            page.evaluate('''() => {
                const root = document.querySelector("#usercentrics-root");
                if (root && root.shadowRoot) {
                    const btn = root.shadowRoot.querySelector('button[data-testid="uc-accept-all-button"]');
                    if (btn) btn.click();
                }
            }''')
        except:
            pass
        page.wait_for_timeout(3000)

        for idx, dest in enumerate(destinations):
            print(f"[{idx+1}/{len(destinations)}] Checking {base_location} -> {dest}...")
            
            try:
                page.goto("https://9292.nl/en", wait_until="domcontentloaded")
                
                # Wait for the inputs to appear
                page.wait_for_selector("input[type='text']", timeout=10000)
                
                # Fill the forms
                page.locator("input[type='text']").nth(0).focus()
                page.locator("input[type='text']").nth(0).fill("")
                page.locator("input[type='text']").nth(0).press_sequentially(base_location, delay=50)
                page.wait_for_timeout(1000)
                page.keyboard.press("Enter")
                page.wait_for_timeout(500)

                page.locator("input[type='text']").nth(1).focus()
                page.locator("input[type='text']").nth(1).fill("")
                page.locator("input[type='text']").nth(1).press_sequentially(dest, delay=50)
                page.wait_for_timeout(1000)
                page.keyboard.press("Enter")
                page.wait_for_timeout(500)
                
                # Submit form
                page.keyboard.press("Enter")
                
                try:
                    page.wait_for_url("**/planner/**", timeout=10000)
                    page.wait_for_timeout(3000)
                    
                    text = page.evaluate('document.body.innerText')
                    import re
                    m = re.search(r'(\d+h \d+m|\d+m)', text)
                    if m:
                        cache[dest] = m.group(1)
                        print(f"  => {cache[dest]}")
                    else:
                        cache[dest] = "N/A"
                        print("  => N/A (could not parse)")
                except Exception as e:
                    cache[dest] = "N/A"
                    print("  => N/A (no route found or timeout)")
                
                # Save progress every 10 items
                if idx % 10 == 0:
                    save_db()
                    
            except Exception as e:
                print(f"  => Error: {str(e)}")
            
            time.sleep(1.5)

        save_db()
        browser.close()
    
    print("Scraping complete! Data saved to db.json.")

if __name__ == "__main__":
    scrape_all()
