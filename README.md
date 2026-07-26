# Commute Time for LinkedIn 🚆

Ever scrolling through LinkedIn Jobs and wondering, "How long is the commute, really?" Instead of opening Google Maps for every single job, this Chrome Extension automatically calculates the public transport travel time and adds a neat little badge (e.g. `🚆 1h 5m`) directly onto the job card. 

I built this so you can instantly see if a job is worth applying to based on the commute.

## Features
- **Zero wait time:** It uses a local database of commute times, so the badges appear instantly as you scroll.
- **BYOD (Bring Your Own Data):** Out of the box, it comes pre-loaded with a dataset. If you want to use your own travel times, you can just upload a simple `.csv` file in the extension popup.
- **Smart matching:** Job postings often have messy locations like "Noordwijk-Binnen, South Holland". The extension handles this gracefully and matches it to your data.
- **Home City Auto-detect:** When you upload your own dataset, the extension figures out your starting city automatically and marks it as a `0m` commute.

## How to Install it
Since it's not on the Chrome Web Store yet, you can install it in Developer Mode:

1. Download the `linkedin_commute_extension.zip` file from the releases page and extract the folder.
2. Open Chrome and go to `chrome://extensions/`.
3. Turn on **Developer mode** (the switch is in the top right corner).
4. Click **Load unpacked** and select the folder you just extracted.
5. That's it! Open LinkedIn Jobs and you'll see the train badges appear.

## Customizing Your Travel Data
If you have your own commute times you want to use, create a CSV file with these three headers: `Origin,Destination,Travel_Time`.

It should look something like this:
```csv
Origin,Destination,Travel_Time
"Amsterdam",Rotterdam,45m
"Amsterdam",Utrecht,30m
```
Then, click the extension icon in your Chrome toolbar and upload the file. It will automatically detect that "Amsterdam" is your home base!

## Contributing
If you have ideas to make this better, feel free to open an issue or submit a pull request!
