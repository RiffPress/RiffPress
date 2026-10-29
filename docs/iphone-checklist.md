# Real-iPhone checklist

Playwright runs the player in Chromium at an iPhone's size, and runs a smoke pass in desktop WebKit. Neither is iOS. Safari on a phone decides on its own about background audio, the lock screen, headphone buttons and AirPlay, and only a real phone shows what it does. Run this list before a release that touches `riff.js`, `riff.css` or the player template, and record the result in the release pull request.

Record each check as **pass**, **fail** or **unverified**, with the iPhone model, the iOS version and the Riff version. A check that wasn't run is unverified, not a pass.

Use the demo at https://next.riffpress.com/ or any post with at least two tracks, one of which has a video version.

## Playback

1. Tap a track. It plays, and the bar shows its title and artwork.
2. Tap the bar. Now Playing opens. Swipe it down. It closes and the music keeps playing.
3. Swipe the bar left and right. It skips to the next and previous track.

## Lock screen and headphones

4. Lock the phone while a track plays. The lock screen shows the title, artist and artwork, and play, pause, next and previous work from it.
5. Press play or pause on wired or Bluetooth headphones. Riff follows.
6. Let a track end with the phone locked. The next track starts.

## Background and foreground

7. Switch to another app for a minute, then come back. The music kept playing, and the bar shows the right track and position.
8. Pause, switch away for five minutes, come back and press play. It resumes where it paused.

## Song and Video

9. On a track with a video version, switch to Video in Now Playing. The video picks up at the same moment, and the sound doesn't skip.
10. Switch back to Song. The audio picks up where the video was.

## AirPlay

11. With an AirPlay device in reach, the AirPlay button appears in Now Playing. Pick the device. The music moves to it and the controls keep working. Without a device, mark this unverified.

## Listen block

12. Open a page with the Listen block, open an album and play a track. Go back to the library with Back. The music keeps playing.
13. Lock the phone on the library page. The lock-screen controls still work.
