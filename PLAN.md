# Pratilipi Upload Experience — Scope / Plan

## Status
PLANNED — awaiting approval before implementation.

## Goal
Create one consistent, polished upload journey for file selection, drag-and-drop, and copy/paste.

## Flow

### 1. Input
All three entry methods feed the same review stage:
- Select files
- Drag & drop files
- Copy/paste files

No upload starts automatically.

### 2. Review stage
After files are supplied:
- Show every selected file when multiple files are present.
- Show file name, type, size and file count.
- Keep the files local/pending.
- Provide a single primary Upload files button.
- Provide Cancel / remove capability without uploading.

### 3. Upload transition
When Upload files is clicked:
- Review UI transitions into a dedicated upload scene.
- Hide normal upload controls to keep focus on progress.
- Show a large stylized प्रतिलिपि wordmark/logo.
- Use the logo itself as the visual progress surface.
- A luminous gradient fill travels through the Devanagari letters according to real aggregate upload progress.
- Add subtle wormhole/particle/ring motion around the logo.
- Per-file progress can remain available as secondary detail, but the main visual is the filling logo.
- Cancel remains available during upload.
- Cancellation must trigger the existing Cloudinary cleanup flow.

### 4. Completion
When all uploads finish:
- Complete the logo fill with a final glow/pulse.
- Transition to Your Pratilipi Created / equivalent completion message.
- Brief success animation.
- Then transition to the existing share/result view containing share link, QR, preview/open/download controls and expiry information.

### 5. Error / cancellation
- Upload errors must not falsely show completion.
- Cancelled uploads show a cancelled state and use Cloudinary cleanup.
- Partial/failed uploads must not expose download controls as if the Drop were complete.

## Animation direction
Primary concept: Living Pratilipi
1. Empty logo appears.
2. A moving gradient/glow begins at the bottom/leading edge.
3. Fill level increases from 0–100% using actual uploaded bytes across all files.
4. Gradient has a slow spectral shift while filling.
5. Background warp/particles subtly accelerate during transfer.
6. At 100%, logo flashes/glows, then settles.
7. Completion text fades/scales in.
8. Result/share view follows smoothly.

## Logo candidates for approval

### A — Devanagari Wordmark
प्रतिलिपि
- Thin futuristic Devanagari geometry.
- Wide tracking and custom glow.
- Best match for the requested large upload-progress logo.

### B — Monogram + Wordmark
✦  प्रतिलिपि
- A small wormhole/star mark beside the wordmark.
- Mark rotates slowly while the wordmark fills.
- More brand-like, but slightly less minimal.

### C — Wormhole Wordmark
◉ प्रतिलिपि
- Circular wormhole core integrated before the wordmark.
- Rings orbit the logo while the letters fill.
- Stronger sci-fi direction.

### D — Pure Outline Logo
प्रतिलिपि
- Large outlined Devanagari letters.
- Gradient fills only the interior as upload progresses.
- Most directly communicates empty → filling.

## Recommended implementation
Use D as the base mechanism, with subtle elements from A/C:
- outline-first logo
- real progress fill clipped inside the glyphs
- restrained wormhole rings/particles
- no fake percentage animation
- CSS/SVG where possible for smooth performance

## Acceptance criteria
- No upload begins before the explicit Upload button.
- All three input methods produce the same review UI.
- Multiple files are clearly listed before upload.
- Main upload progress reflects aggregate bytes uploaded.
- The large प्रतिलिपि logo fills dynamically from 0–100%.
- Completion animation appears only after all uploads/registering finish.
- Existing public share links and authenticated dashboard behavior remain unchanged.
- Existing cancellation and Cloudinary cleanup remain functional.
- Responsive on mobile and desktop.
