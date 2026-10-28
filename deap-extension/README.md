# BER Survey DEAP Fill (Chrome extension)

Fills the DEAP screen you have open at deap.seai.ie with the values from a BER Survey. It only types into fields. It never presses Save, Next or anything else in DEAP, so you check each screen and save it yourself.

## Install (once, on the laptop)

1. Download https://greenfieldspaces.github.io/BER-Survey/deap-extension.zip and unzip it. Keep the unzipped folder somewhere it will stay, such as Documents.
2. In Chrome go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the unzipped `deap-extension` folder.
5. Click the puzzle piece in the toolbar and pin **BER Survey DEAP Fill**.

To update later, unzip the new version over the same folder and press the reload arrow on the extension's card in `chrome://extensions`.

## Use it

1. On the iPad, open the survey, go to **Enter in DEAP**, open **Fill DEAP from Chrome on your laptop** and tap **Share transfer file**. AirDrop, Mail or iCloud Drive it to the laptop.
2. On the laptop, log in to DEAP and open the assessment.
3. Click the extension icon. The side panel opens. Drop in the transfer file (or paste the transfer text).
4. Go to a DEAP screen. The panel switches to the same screen from your survey (or tap the screen name).
5. Press **Fill this DEAP screen**.
   - Green outline in DEAP and a green dot in the panel: filled.
   - Amber: DEAP already had a different value, so it was kept. Tick **Replace values already in DEAP** to overwrite.
   - Red: not found, or DEAP has no matching option. Tap the value to copy it and enter it by hand.
6. Check the screen and save it in DEAP.

DEAP adds walls, windows and other list items one at a time in a dialog. For those, press ADD WALL (or open an existing one) in DEAP, then press **Fill** on that row in the panel. Check it and save it in DEAP, then do the next row. Age bands are picked from the wall's year, or the dwelling's year if the wall has none.

## Transfer whole survey

With the survey loaded and the assessment open in DEAP, press **Start** under **Transfer whole survey**. It goes through Survey details, Floors, Roofs, Walls, Doors, Windows, Global factors, Ventilation and the heating screens:

- On ordinary screens it fills the values. DEAP saves those itself.
- For floors, roofs, walls, doors and windows it presses ADD, fills the dialog and presses SAVE, one at a time.
- Doors and windows need a DEAP library item first. The panel says **Your turn**: pick the library item and press ADD in DEAP, and the transfer carries on. **Skip this one** leaves that item out.
- If DEAP refuses to save a dialog, it waits for you to fix it and press SAVE.
- When it finishes, it lists what is left to do by hand.

It never presses Publish, Submit, Delete or Download. Untick any section that is already in DEAP so it is not added twice. **Stop** halts it at any point.

## Teaching it DEAP's fields

The first version matches DEAP fields by their labels, using best guesses from the SEAI DEAP Survey Guide. When a value is not found or lands in the wrong field:

1. Press **Pick** next to that value in the panel.
2. Click the right field in DEAP.

It remembers that field for every survey on this laptop. For a table column, press **Pick** under the column heading and click that column's field in any row.

Under **Setup and troubleshooting**:

- **List fields on this DEAP page** shows every field the extension can see, with its label. **Copy list** and send it to Claude to improve the built-in matching.
- **Export taught fields** saves what you have taught as a file, to back it up, move it to another laptop, or send to Claude so it can be built in.

## Files

- `manifest.json`: Chrome extension settings. It only runs on https://deap.seai.ie.
- `sidepanel.*`: the panel.
- `content.js`: runs in the DEAP page. Finds fields, fills them, outlines them.
- `mapping.json`: built-in guesses at DEAP's label for each survey value. `labels` are label texts to look for, `selector` pins an exact field, `values` maps a survey answer to DEAP's wording, `skip` leaves a value out.
