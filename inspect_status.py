from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()
    page.goto('https://www.linkedin.com/jobs/search/?keywords=IT%20Support&location=Netherlands')
    page.wait_for_selector('.job-card-container', timeout=10000)
    
    # Get HTML of the first few job cards
    cards = page.query_selector_all('.job-card-container')
    for i, card in enumerate(cards[:3]):
        with open(f"card_{i}.html", "w") as f:
            f.write(card.inner_html())
            
    browser.close()
