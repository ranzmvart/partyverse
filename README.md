# PartyVerse / Ryuu Connect v1.3

Discord-inspired community app with original PartyVerse visual style.

## New in v1.3

- Cleaner Discord-like layout, but with different PartyVerse branding.
- Real server categories.
- Create text category / voice category.
- Create new text rooms and voice rooms inside categories.
- Voice rooms support one-click voice join.
- Share screen button joins voice automatically if needed.
- Live screen share docks into the channel page.
- Watch party/music player can be opened from voice stage.
- Removed visible shop/crate/inventory/leaderboard pages from UI.
- Better mobile layout for chat, voice, screen share, and channel list.

## Important note about mobile screen share

The code supports screen share on mobile when the browser supports `getDisplayMedia`. Android Chrome usually has the best chance. Some iPhone/iOS browsers may block screen sharing because of browser limitations.

## Deploy

Upload the contents of this folder to GitHub, then deploy to Railway.

Recommended Railway Volume mount path:

```txt
/app/data
```
