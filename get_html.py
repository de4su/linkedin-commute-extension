from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://www.linkedin.com/jobs/collections/top-applicant/?currentJobId=4429959465')
    
    # Wait a bit for JS to load
    time.sleep(3)
    
    # Get HTML
    with open("page_dump.html", "w", encoding="utf-8") as f:
        f.write(page.content())
        
    browser.close()
