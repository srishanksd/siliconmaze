# Multiverse Recon

## Description

Multiverse Recon is a five-round location guessing game. Inspect a real-world image, place one guess on the Leaflet world map, then compare it with the sealed anomaly coordinates.

## Features

- Ten-location anomaly dataset with no repeats in a session
- Leaflet zoomable/pannable world map with one draggable guess marker
- Haversine distance and deterministic distance-based scoring
- Five-round state machine, round results, final transmission summary
- Easy, Medium, and Hard timers
- First-time field guide stored in localStorage
- Responsive desktop/mobile layout and image fallbacks

## Tech Stack

React, Vite, JavaScript, Leaflet, OpenStreetMap tiles, Unsplash images.

## How to Run

```bash
npm install
npm run dev
```

## Haversine Distance Calculation

`calculateDistance` converts degree differences to radians and applies the haversine formula on a 6,371 km Earth radius. The returned value is the great-circle distance between the submitted guess and the hidden anomaly coordinate.

## Scoring System

Each round starts at 5,000 points and falls smoothly with distance using `5000 * (1 - distance / 5000)^1.35`. Scores are zero at or beyond 5,000 km. Hard mode applies a deterministic 0.9 multiplier.

## Data / Location Sources

Coordinates are curated for this project. Every location image is a real photographic image served from the Unsplash photo CDN; no generated artwork is used. The viewer labels these as `FIELD ARCHIVE / PHOTOGRAPH`. Map tiles use OpenStreetMap with attribution. Images include an alternate real-photo fallback if a request fails.

## Deployment

The Vite build is ready for GitHub Pages, Netlify, or Vercel. Run `npm run build` and deploy the generated `dist` directory.

## Known Limitations

Images and map tiles require an internet connection. The game does not use a backend leaderboard.
