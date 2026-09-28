# Earth texture assets

All downloaded directly from NASA on 2026-09-27. Images are standard equirectangular, north at top, longitude -180 at left and +180 at right; day and night coastlines visually align. No geographic reprojection or image generation was used.

Recommended runtime set: day 4096 + night grayscale 3600 + clouds 2048, approximately 1.56 MiB total. Color night is an optional alternative. Original 5400 day is retained for higher-quality derivatives.

## Day surface
- File: earth-day-topography-4096.jpg
- Dimensions: 4096 x 2048; 427 KiB
- Download: https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg?w=4096&h=2048&fit=clip
- Original (also saved as earth-day-topography-5400.jpg): https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography/july/world.topo.200407.3x5400x2700.jpg
- Source page: https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/base-topography/
- Dataset: Blue Marble Next Generation, July 2004, with shaded topography.
- Credit: NASA Earth Observatory. Produced by Reto Stockli, NASA Goddard Space Flight Center.

## Night lights (recommended emissive mask)
- File: earth-night-lights-3600.jpg
- Dimensions: 3600 x 1800; 357 KiB
- Download: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144897/BlackMarble_2016_01deg_gray.jpg
- Source page: https://science.nasa.gov/earth/earth-observatory/earth-at-night/maps/
- Dataset: Black Marble 2016 grayscale, global 0.1 degree composite.
- Credit: NASA Earth Observatory images by Joshua Stevens, using Suomi NPP VIIRS data from Miguel Roman, NASA GSFC.

## Night color (optional alternate)
- File: earth-night-color-3600.jpg
- Dimensions: 3600 x 1800; 761 KiB
- Download: https://assets.science.nasa.gov/content/dam/science/esd/eo/images/imagerecords/144000/144898/BlackMarble_2016_01deg.jpg
- Same dataset and credit as night grayscale, with dark blue shaded terrain and warm city lights.

## Cloud mask
- File: earth-clouds-2048.jpg
- Dimensions: 2048 x 1024; 810 KiB
- Download: https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg
- Historic source page: https://visibleearth.nasa.gov/images/57747/blue-marble-clouds
- Dataset: Blue Marble cloud composite, published February 11, 2002. This is a historical composite, not current weather.
- Credit: NASA Goddard Space Flight Center. Image by Reto Stockli.
- Background on source and reuse: https://science.nasa.gov/blogs/earth-matters/2011/10/06/crafting-the-blue-marble/

## Reuse and attribution
NASA's media guidelines say NASA content including texture maps generally is not subject to copyright in the United States. Acknowledge NASA as the source and do not imply NASA endorsement. These maps contain no NASA logo or identifiable person. Blue Marble's own source page specifically requests credit to "NASA Earth Observatory." See https://www.nasa.gov/nasa-brand-center/images-and-media/ and https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ .
Suggested compact credit: "Earth imagery: NASA Earth Observatory."

## Rendering advice
Use grayscale night lights as emissive intensity rather than multiplying the color night texture (which would tint the ocean too). Its black background isolates actual light clusters. Start with a warm vector approximately (1.0, 0.62, 0.22), multiply by mask intensity, and tune strength around 2-4 in a linear/HDR shader; a softer (1.0, 0.72, 0.40) keeps strong lights less orange. Set proper color-space treatment: day and color night are sRGB, grayscale mask is data unless using it as an sRGB emissive map. Do not double-convert.
Keep day texture intentionally dim and slightly desaturated via shader; do not flatten it into the emissive layer. If simulating a sun, fade night emission with 1 - smoothstep(-0.12, 0.15, dot(normal, sunDirection)). For a mostly-night startup hero, retaining faint emission on the twilight side can support the intended visual without a hard cut.
Clouds are a grayscale alpha/luminance mask; use on a shell at radius approximately 1.005-1.012 with low opacity and matching UV orientation. They should obscure lights slightly, rather than remain uniformly bright on the dark hemisphere. A thin, restrained blue atmospheric rim does more for realism than high cloud opacity.

## Original nebula background

- Asset: `dist/assets/nebula.png` (1672 × 941).
- Created 2026-09-28 using the built-in `image_gen` tool. Original stylized artwork, not a photograph of a named astronomical object.
- Prompt: Original photographic astrophotography nebula-only texture, wide 16:9, asymmetrical intricate soft gas/dust at left/right edges and corners, blue/teal and violet/plum with muted copper wisps; central 35% near-black and low-detail; predominantly deep black space; no planets, Earth, sun, stars, bright central objects, lens flare, satellites, paths, text, logos, borders, or UI.
- The website adds procedural star points and animates the texture in a WebGL shader.
