from bs4 import BeautifulSoup

with open("page_dump.html", "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f, "html.parser")

# Find the sign in gate or job cards
if soup.find("h1", string=lambda t: t and "Sign in" in t):
    print("WARNING: Hit a login wall!")

# Look for typical job card elements or anything with 'job'
print("Found <li> elements with 'job' in class:")
for li in soup.find_all("li"):
    cls = li.get("class", [])
    if any("job" in c.lower() for c in cls):
        print(cls)
        # print first few text elements
        print(li.get_text(strip=True)[:100])
        print("---")
        
