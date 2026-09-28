# Earth landing page

A single full-screen scene, ready for the company logo. There is no visible copy, navigation, or placeholder branding.

## GitHub Pages

GitHub Actions publishes `dist/` after each push to `main`. Set the repository's Pages source to **GitHub Actions**. All runtime paths are relative, so the scene also works under a repository subpath.

## Run locally

From this directory:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:4173. All runtime files are self-hosted; no external service calls, fonts, analytics, or installation are required.

## Add the logo

Place the logo file in `dist/assets/`. Add an image with the company name as its alt text inside `#brand` in `dist/index.html`, then remove the `hidden` attribute. Adjust its placement in `dist/style.css`. Update the page title, description, and favicon once the brand is supplied.

## Animation

### Interactive gold shield

Click or tap Earth to deploy a gold satellite carrying a broad curved honeycomb patch, approximately 100 degrees across. The satellite stays at the patch's center and the actual mesh rotates rigidly with it. Clicks snap to the nearest available polar, equatorial, or crossed diagonal plane. Each plane holds four evenly spaced satellites, up to sixteen total. Shield coverage moves with the satellites; no stationary bands or permanent protected cells are left behind.

The canvas supports keyboard control: **Enter** deploys a satellite near the visible center, **R** clears the gold shield and restores the red satellites, and **Space** pauses or resumes all motion. Clicks on the background do not deploy satellites. Shield state lasts for the current page session and resets on refresh. Screen readers receive deployment updates without visible text or counters on the page.

The Earth completes one revolution in approximately 3.3 minutes. Seventeen blue satellite points follow eight circular orbits: equatorial, polar, and prograde/retrograde inclined paths, taking approximately 67–116 seconds per orbit. Their radii range from 1.116 to 1.5996 Earth radii. An unseen sun completes a stylized orbital lighting cycle approximately every 6.5 minutes, moving the day/night boundary around the visible globe while maintaining a half-lit view. No sun or flare is drawn. City lights and the atmosphere respond to the moving light direction. Orbit paths and satellites are occluded by Earth when behind it. The full scene stays inside both portrait and landscape viewports.

Forty-eight red hostile satellites follow varied elliptical paths that cross the shield altitude. Contact with a revealed cell of a moving honeycomb patch triggers a short warm flash, followed by disappearance. Collisions test the red satellite trajectory against the moving patch geometry over the elapsed frame, so distant satellites and former patch locations remain unprotected. Destroyed satellites stay gone until reset or refresh. Flashing follows pause and reduced-motion settings.

The backdrop adds an original blue/violet/amber nebula texture with slow drifting cloud motion and a layered star field with subtle twinkling and parallax. Background motion follows the same pause and reduced-motion settings as the globe.

The Space key pauses/resumes motion. The page respects the device's reduced-motion preference, suspends animation in background tabs, caps pixel density, and displays a still image when WebGL is unavailable.

NASA imagery depicts composite historical datasets, not live conditions. Attribution and original source URLs are in `ASSET-SOURCES.md`. Three.js 0.180.0 is bundled with its MIT license in `dist/vendor/`.
