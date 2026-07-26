from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://9292.nl/en')
    page.wait_for_timeout(2000)
    
    # Dump all input IDs
    inputs = page.evaluate('''() => {
        return Array.from(document.querySelectorAll("input")).map(i => i.id || i.name || i.className);
    }''')
    print("Inputs:", inputs)
    
    # Dump buttons
    buttons = page.evaluate('''() => {
        return Array.from(document.querySelectorAll("button")).map(b => b.innerText + " (" + (b.id||b.className) + ")");
    }''')
    print("Buttons:", buttons)
    browser.close()
