import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./styles.css";

const locations = [
    {
        id: "lisbon",
        name: "Lisbon tram corridor",
        region: "Portugal",
        lat: 38.7139,
        lon: -9.1394,
        image: "/locations/lisbon.jpg",
    },
    {
        id: "kyoto",
        name: "Kyoto temple district",
        region: "Japan",
        lat: 35.0116,
        lon: 135.7681,
        image: "/locations/kyoto.jpg",
    },
    {
        id: "cape-town",
        name: "Cape Town waterfront",
        region: "South Africa",
        lat: -33.9249,
        lon: 18.4241,
        image: "/locations/cape-town.jpg",
    },
    {
        id: "reykjavik",
        name: "Reykjavik coast",
        region: "Iceland",
        lat: 64.1466,
        lon: -21.9426,
        image: "/locations/reykjavik.jpeg",
    },
    {
        id: "cusco",
        name: "Cusco highlands",
        region: "Peru",
        lat: -13.5319,
        lon: -71.9675,
        image: "/locations/cusco.jpg",
    },
    {
        id: "melbourne",
        name: "Melbourne laneways",
        region: "Australia",
        lat: -37.8136,
        lon: 144.9631,
        image: "/locations/melbourne.jpg",
    },
    {
        id: "new-york",
        name: "Lower Manhattan",
        region: "United States",
        lat: 40.7128,
        lon: -74.006,
        image: "/locations/new-york.jpg",
    },
    {
        id: "marrakesh",
        name: "Marrakesh medina",
        region: "Morocco",
        lat: 31.6295,
        lon: -7.9811,
        image: "/locations/marrakesh.webp",
    },
    {
        id: "queenstown",
        name: "Queenstown basin",
        region: "New Zealand",
        lat: -45.0312,
        lon: 168.6626,
        image: "/locations/queenstown.jpg",
    },
    {
        id: "istanbul",
        name: "Istanbul strait",
        region: "Türkiye",
        lat: 41.0082,
        lon: 28.9784,
        image: "/locations/istanbul.jpg",
    },
];
const MAX_SCORE = 5000,
    MAX_DISTANCE = 5000;
export function calculateDistance(lat1, lon1, lat2, lon2) {
    const r = Math.PI / 180,
        a =
            Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
            Math.cos(lat1 * r) *
                Math.cos(lat2 * r) *
                Math.sin(((lon2 - lon1) * r) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function scoreFor(distance) {
    return Math.max(
        0,
        Math.round(
            MAX_SCORE *
                Math.pow(Math.max(0, 1 - distance / MAX_DISTANCE), 1.35),
        ),
    );
}
function shuffled() {
    return [...locations].sort(() => Math.random() - 0.5);
}
function MapPanel({ actual, guess, onGuess, locked }) {
    const node = useRef(null),
        map = useRef(null),
        guessMarker = useRef(null),
        actualMarker = useRef(null),
        line = useRef(null);
    useEffect(() => {
        map.current = L.map(node.current, {
            worldCopyJump: true,
            minZoom: 2,
        }).setView([20, 0], 2);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
            language: "en",
        }).addTo(map.current);
        map.current.on("click", (e) => {
            if (!locked) onGuess([e.latlng.lat, e.latlng.lng]);
        });
        return () => map.current?.remove();
    }, []);
    useEffect(() => {
        if (!map.current) return;
        if (guess) {
            if (!guessMarker.current)
                guessMarker.current = L.marker(guess, {
                    draggable: !locked,
                    icon: L.divIcon({
                        className: "guess-pin",
                        html: "<span></span>",
                        iconSize: [20, 20],
                        iconAnchor: [10, 10],
                    }),
                })
                    .addTo(map.current)
                    .bindTooltip("YOUR GUESS");
            else guessMarker.current.setLatLng(guess);
            guessMarker.current.dragging?.enable();
            if (locked) guessMarker.current.dragging?.disable();
            guessMarker.current
                .off("dragend")
                .on("dragend", (e) =>
                    onGuess([
                        e.target.getLatLng().lat,
                        e.target.getLatLng().lng,
                    ]),
                );
        } else if (guessMarker.current) {
            map.current.removeLayer(guessMarker.current);
            guessMarker.current = null;
        }
        if (actual && guess) {
            if (!actualMarker.current)
                actualMarker.current = L.circleMarker(actual, {
                    radius: 8,
                    color: "#f1eee6",
                    fillColor: "#111719",
                    fillOpacity: 1,
                    weight: 2,
                })
                    .addTo(map.current)
                    .bindTooltip("ACTUAL LOCATION");
            else actualMarker.current.setLatLng(actual);
            if (!line.current)
                line.current = L.polyline([guess, actual], {
                    color: "#d9b86c",
                    weight: 2,
                    dashArray: "5 7",
                }).addTo(map.current);
            else line.current.setLatLngs([guess, actual]);
            const group = L.featureGroup([
                guessMarker.current,
                actualMarker.current,
            ]);
            map.current.fitBounds(group.getBounds().pad(0.45));
        }
    }, [guess, actual, locked]);
    return (
        <div className="map-frame">
            <div className="map-label">
                NEXUS MAP{" "}
                <span>
                    {guess ? "MARKER PLACED" : "CLICK TO PLACE YOUR GUESS"}
                </span>
            </div>
            <div ref={node} className="map" />
        </div>
    );
}
function App() {
    const [round, setRound] = useState(0),
        [pool, setPool] = useState(() => shuffled()),
        [guess, setGuess] = useState(null),
        [note, setNote] = useState(""),
        [result, setResult] = useState(null),
        [scores, setScores] = useState([]),
        [difficulty, setDifficulty] = useState("medium"),
        [showTour, setShowTour] = useState(
            () => !localStorage.getItem("multiverse-tour-done"),
        ),
        [started, setStarted] = useState(false);
    const current = pool[round];
    const total = scores.reduce((a, b) => a + b.score, 0);
    const timeLimit = { easy: 90, medium: 60, hard: 40 }[difficulty];
    const [time, setTime] = useState(timeLimit);
    useEffect(() => {
        setTime(timeLimit);
    }, [round, difficulty]);
    useEffect(() => {
        if (!started || result || showTour) return;
        const id = setInterval(
            () =>
                setTime((t) => {
                    if (t <= 1) {
                        clearInterval(id);
                        submit(true);
                        return 0;
                    }
                    return t - 1;
                }),
            1000,
        );
        return () => clearInterval(id);
    }, [started, result, showTour, round]);
    function submit(timedOut = false) {
        if ((!guess && !timedOut) || result) return;
        const chosen = guess || [0, 0];
        const distance = guess
            ? calculateDistance(current.lat, current.lon, chosen[0], chosen[1])
            : 20004;
        const score = guess
            ? scoreFor(distance) * (difficulty === "hard" ? 0.9 : 1)
            : 0;
        const item = {
            round: round + 1,
            location: current.name,
            region: current.region,
            distance,
            score: Math.round(score),
            guess: [...chosen],
            actual: [current.lat, current.lon],
            note: note.trim(),
            timedOut,
        };
        setResult(item);
        setScores((s) => [...s, item]);
    }
    function next() {
        if (round === 4) return;
        setRound((r) => r + 1);
        setGuess(null);
        setNote("");
        setResult(null);
    }
    function restart() {
        setPool(shuffled());
        setRound(0);
        setGuess(null);
        setNote("");
        setResult(null);
        setScores([]);
        setStarted(true);
        setTime(timeLimit);
    }
    if (!started)
        return (
            <main className="shell start-screen">
                <div className="brand">MULTIVERSE RECON</div>
                <p className="kicker">
                    GLOBAL ANOMALY RESPONSE / FIELD SYSTEM 01
                </p>
                <h1>
                    Find the signal.
                    <br />
                    <em>Stabilize the timeline.</em>
                </h1>
                <p className="intro">
                    Inspect a location anomaly, place your best coordinate on
                    the Nexus map, and measure how close your reconstruction is.
                </p>
                <div className="start-row">
                    <button
                        className="primary"
                        onClick={() => setStarted(true)}
                    >
                        Start recon
                    </button>
                    <label>
                        Difficulty{" "}
                        <select
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                        >
                            <option value="easy">Easy · 90s</option>
                            <option value="medium">Medium · 60s</option>
                            <option value="hard">Hard · 40s</option>
                        </select>
                    </label>
                </div>
                <p className="fine">
                    Five anomalies · distance-based scoring · no coordinates
                    revealed before submission
                </p>
            </main>
        );
    if (round === 5)
        return (
            <main className="shell results">
                <div className="topline">
                    <span className="brand">MULTIVERSE RECON</span>
                    <span>FINAL TRANSMISSION</span>
                </div>
                <h1>Timeline stabilized.</h1>
                <div className="total-score">
                    <span>TOTAL SCORE</span>
                    <strong>{total.toLocaleString()}</strong>
                    <small>out of {(MAX_SCORE * 5).toLocaleString()}</small>
                </div>
                <div className="summary">
                    {scores.map((s) => (
                        <div className="summary-row" key={s.round}>
                            <b>0{s.round}</b>
                            <span>
                                {s.location}
                                <small>{s.region}</small>
                            </span>
                            <span>{s.distance.toFixed(1)} km</span>
                            <strong>{s.score.toLocaleString()}</strong>
                        </div>
                    ))}
                </div>
                <button className="primary" onClick={restart}>
                    Play again
                </button>
            </main>
        );
    return (
        <main className="shell">
            <header className="header">
                <div>
                    <div className="brand">MULTIVERSE RECON</div>
                    <div className="status">
                        <i /> SIGNAL ACTIVE / OBSERVATION DECK
                    </div>
                </div>
                <div className="header-right">
                    <span>ROUND {round + 1} / 5</span>
                    <strong>{total.toLocaleString()} PTS</strong>
                </div>
            </header>
            <div className="progress">
                <i style={{ width: `${(round / 5) * 100}%` }} />
            </div>
            <section className="game-grid">
                <article className="viewer">
                    <div className="section-head">
                        <span>LOCATION SIGNAL</span>
                        <b>ANOMALY 0{round + 1}</b>
                    </div>
                    <div className="image-wrap">
                        <img
                            src={current.image}
                            alt="Real-world anomaly location"
                            onError={(e) => {
                                e.currentTarget.src =
                                    "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=85";
                            }}
                        />
                        <div className="image-meta">
                            <span>FIELD ARCHIVE / PHOTOGRAPH</span>
                            <span>{current.region.toUpperCase()}</span>
                        </div>
                    </div>
                    <p className="hint">
                        Study the visual clues, then place your coordinate on
                        the map. The actual location remains sealed until
                        submission.
                    </p>
                    <label className="evidence">
                        <span>
                            SIGNAL EVIDENCE LOG <small>optional</small>
                        </span>
                        <input
                            value={note}
                            maxLength={120}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What clue did you notice?"
                            disabled={!!result}
                        />
                    </label>
                </article>
                <article className="map-panel">
                    <div className="section-head">
                        <span>CONVERGENCE TARGET</span>
                        <b className="timer">
                            00:{String(time).padStart(2, "0")}
                        </b>
                    </div>
                    <MapPanel
                        actual={result?.actual}
                        guess={guess}
                        onGuess={setGuess}
                        locked={!!result}
                    />
                    <button
                        className="primary submit"
                        disabled={!guess || !!result}
                        onClick={submit}
                    >
                        {result ? "GUESS LOCKED" : "Submit guess"}
                    </button>
                    {result && (
                        <div className="result-card">
                            <div>
                                <span>DISTANCE</span>
                                <strong>{result.distance.toFixed(1)} km</strong>
                            </div>
                            <div>
                                <span>ROUND SCORE</span>
                                <strong>{result.score.toLocaleString()}</strong>
                            </div>
                            <p>
                                {result.note
                                    ? `Your note: “${result.note}”`
                                    : result.timedOut
                                      ? "Time expired — the signal was archived without a guess."
                                      : result.distance < 100
                                        ? "High convergence. Timeline nearly matched."
                                        : result.distance < 1000
                                          ? "Useful signal. Keep narrowing the gap."
                                          : "Signal drift detected. Read the landscape more closely."}
                            </p>
                            <button
                                className="secondary"
                                onClick={() =>
                                    round === 4 ? setRound(5) : next()
                                }
                            >
                                {round === 4
                                    ? "View final transmission"
                                    : "Next anomaly"}
                            </button>
                        </div>
                    )}
                </article>
            </section>
            <footer>
                <span>
                    Haversine convergence online · photographs from Unsplash ·
                    map © OpenStreetMap
                </span>
                <button
                    onClick={() => {
                        localStorage.setItem("multiverse-tour-done", "1");
                        setShowTour(true);
                    }}
                >
                    Field guide
                </button>
            </footer>
            {showTour && (
                <div className="tour">
                    <div className="tour-card">
                        <span className="kicker">FIELD GUIDE</span>
                        <h2>How to stabilize a round</h2>
                        <ol>
                            <li>
                                Inspect the location image for regional clues.
                            </li>
                            <li>Click the Nexus map to place your guess.</li>
                            <li>Drag the marker if you want to refine it.</li>
                            <li>
                                Submit to reveal the actual location and score.
                            </li>
                        </ol>
                        <button
                            className="primary"
                            onClick={() => {
                                localStorage.setItem(
                                    "multiverse-tour-done",
                                    "1",
                                );
                                setShowTour(false);
                            }}
                        >
                            Enter observation deck
                        </button>
                        <button
                            className="skip"
                            onClick={() => {
                                localStorage.setItem(
                                    "multiverse-tour-done",
                                    "1",
                                );
                                setShowTour(false);
                            }}
                        >
                            Skip guide
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
}
createRoot(document.getElementById("root")).render(<App />);
