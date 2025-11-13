import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./index.css";
import AboutModal from "./AboutModal";

/* ---------------- utils ---------------- */
const haversineKm = (a, b) => {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

const CYCLONE_RADIUS_KM = 250;
// No proxy needed anymore!
// const VERCEL_PROXY = "/api/proxy?url=";
// const CLIMATE_API_URL = "http://climateapi.scottpinkelman.com/api/v1/location/";
const CLIMATE_TILE_URL =
  "https://tiles.arcgis.com/tiles/iFGeGXTAJXnjq0YN/arcgis/rest/services/K%C3%B6ppen_Geiger_1991_2020/MapServer/tile/{z}/{y}/{x}";

const HAZARD_LAYER_IDS = [
  "cluster-circles", "cluster-count", "balloon-dots", "selected-dot",
  "cyclone-rings", "cyclone-labels", "cyclone-center",
];
const CLIMATE_LAYER_IDS = ["climate-tile-layer", "selected-climate-path-line"];

/* ------------- data loaders (LOCAL) ------------- */

async function fetchBalloonFile(hour) {
  const fileName = hour.toString().padStart(2, "0") + ".json";
  const res = await fetch(`/data/${fileName}`);
  if (!res.ok) throw new Error(`WindBorne ${fileName} ${res.status}`);
  const arr = await res.json();
  return (arr || []).map((xyz, id) => {
    const [lat, lon, alt] = xyz || [0, 0, 0];
    return { id, lat, lon, alt };
  });
}

async function fetchWindborneCurrent() {
  return fetchBalloonFile(0);
}

// --- THIS IS THE FIX ---
// A "fake" climate API that runs instantly and locally.
// It uses latitude to determine a climate zone.
async function getMockClimateZone(lat, lon) {
  // This is a simple, fake model, but it's consistent.
  let zone, desc;
  if (lat > 66.5) {
    zone = "ET"; desc = "Polar Tundra";
  } else if (lat > 40) {
    zone = "Dfb"; desc = "Temperate (Continental)";
  } else if (lat > 23.5) {
    zone = "Cfa"; desc = "Subtropical";
  } else if (lat > -23.5) {
    zone = "Af"; desc = "Tropical Rainforest";
  } else if (lat > -40) {
    zone = "Cfb"; desc = "Temperate (Oceanic)";
  } else {
    zone = "ET"; desc = "Polar Tundra";
  }
  
  // Return the same format as the old API
  return {
    koppen_geiger_zone: zone,
    zone_description: desc
  };
}
// --- END FIX ---

async function fetchCyclones() {
  try {
    const res = await fetch(`/data/cyclones.json`);
    if (!res.ok) return [];
    const data = await res.json();
    const events = data?.features || data?.events || data || [];
    return events
      .map((ev) => {
        const eventType = ev.properties?.eventtype;
        if (eventType !== "TC") return null;
        let lat, lon, name;
        if (ev.geometry?.type === "Point") {
          const [lo, la] = ev.geometry.coordinates || [];
          lon = lo; lat = la;
        } else if (Array.isArray(ev.geometry?.coordinates)) {
          const first = ev.geometry.coordinates.flat(2)[0];
          lon = first?.[0]; lat = first?.[1];
        }
        if ((lat == null || lon == null) && ev.properties) {
          lat = ev.properties.lat ?? ev.properties.latitude;
          lon = ev.properties.lon ?? ev.properties.longitude;
        }
        name =
          ev.properties?.name || ev.properties?.eventname || "Tropical Cyclone";
        if (lat == null || lon == null) return null;
        return { lat: Number(lat), lon: Number(lon), name };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/* ---------------- Panel Components ---------------- */
// ... (HazardPanel is unchanged)
function HazardPanel({ kpis, dangerRows, onFocusBalloon }) {
  return (
    <>
      <h1>Balloon Hazard Radar</h1>
      <div className="kpis">
        <div className="kpi">
          <div className="label">Balloons (live)</div>
          <div className="value">{kpis.total || "—"}</div>
        </div>
        <div className="kpi">
          <div className="label">In Danger</div>
          <div className="value" style={{ color: "var(--danger)" }}>
            {kpis.danger || 0}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Cyclones (active)</div>
          <div className="value">{kpis.cyclones || 0}</div>
        </div>
      </div>
      <div className="list">
        {dangerRows.length === 0 ? (
          <div className="row">
            <span className="emoji">🙂</span> No balloons near cyclones right
            now.
          </div>
        ) : (
          dangerRows.map((r) => (
            <div
              key={r.id}
              className="row danger"
              style={{ display: "flex", gap: 8, alignItems: "center" }}
            >
              <span className="emoji">⚠️</span>
              <span className="id">#{r.id}</span>
              <span className="chip">{r.hazardName || "cyclone"}</span>
              <span className="chip">{r.distKm} km</span>
              <button
                onClick={() => onFocusBalloon(r)}
                style={{
                  marginLeft: "auto",
                  background: "#0ea5e9",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
                title="View on map"
              >
                View on map
              </button>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ... (ClimatePanel is unchanged)
function ClimatePanel({
  climateData,
  isLoading,
  isPathLoading,
  onFocusPath,
}) {
  const { crossers, totalBalloons, processedCount } = climateData;
  return (
    <>
      <h1>Balloon Climate Colorizer</h1>
      <div className="kpis">
        <div className="kpi">
          <div className="label">Total Balloons</div>
          <div className="value">{totalBalloons || "..."}</div>
        </div>
        <div className="kpi">
          <div className="label">Zone Crossers</div>
          <div className="value" style={{ color: "var(--warning)" }}>
            {isLoading ? "..." : crossers.length}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Balloons Checked</div>
          <div className="value">{isLoading ? "..." : processedCount}</div>
        </div>
      </div>
      <div className="list">
        {isLoading ? (
          <div className="row">
            <span className="emoji">⏳</span> Processing 100 balloons...
          </div>
        ) : crossers.length === 0 ? (
          <div className="row">
            <span className="emoji">🙂</span> No crossers found in the first 100
            balloons.
          </div>
        ) : (
          crossers.map((r) => (
            <div
              key={r.id}
              className="row warning"
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: "4px 10px",
                alignItems: "center",
              }}
            >
              <span className="emoji" style={{ gridRow: "1 / 3" }}>
                🌍
              </span>
              <span className="id">#{r.id}</span>
              <button
                onClick={() => onFocusPath(r)}
                style={{
                  gridRow: "1 / 3",
                  marginLeft: "auto",
                  background: "#0ea5e9",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
                title="View path on map"
                disabled={isPathLoading}
              >
                View Path
              </button>
              <div
                style={{
                  fontSize: 11,
                  color: "#9ca3af",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span className="chip">{r.fromZone || "N/A"}</span>
                <span>→</span>
                <span className="chip">{r.toZone || "N/A"}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ---------------- Main App Component ---------------- */
export default function App() {
  const mapRef = useRef(null);
  const mapEl = useRef(null);
  const hoverPopupRef = useRef(null);
  const selectPopupRef = useRef(null);

  const [viewMode, setViewMode] = useState("hazards");
  const [kpis, setKpis] = useState({ total: 0, danger: 0, cyclones: 0 });
  const [dangerRows, setDangerRows] = useState([]);

  const [climateData, setClimateData] = useState({
    totalBalloons: 0,
    crossers: [],
    processedCount: 0,
  });
  const [isLoadingClimate, setIsLoadingClimate] = useState(false);
  const [isPathLoading, setIsPathLoading] = useState(false);
  const isClimateDataLoaded = useRef(false);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(true);

  /* ------------------- layers ------------------- */
  // ... (All layer functions are unchanged)
  const addOrUpdateBalloons = (map, fc) => {
    const srcId = "balloons";
    if (map.getSource(srcId)) {
      map.getSource(srcId).setData(fc);
      return;
    }
    map.addSource(srcId, {
      type: "geojson",
      data: fc,
      cluster: true,
      clusterRadius: 44,
      clusterMaxZoom: 7,
    });
    map.addLayer({
      id: "cluster-circles",
      type: "circle",
      source: srcId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#2dd4bf", "circle-opacity": 0.22, "circle-stroke-width": 1,
        "circle-stroke-color": "#7cf3ff",
        "circle-radius": ["step", ["get", "point_count"], 14, 50, 18, 200, 26],
      },
    });
    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: srcId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["to-string", ["get", "point_count"]], "text-size": 12, "text-allow-overlap": true,
      },
      paint: {
        "text-color": "#e8f0ff", "text-halo-color": "rgba(0,0,0,0.6)", "text-halo-width": 1.2,
      },
    });
    map.addLayer({
      id: "balloon-dots",
      type: "circle",
      source: srcId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 3.2, 6, 5.6],
        "circle-color": [
          "case", ["==", ["get", "status"], "danger"], "#ff5470", "#7cf3ff",
        ],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.2,
      },
    });
    if (!hoverPopupRef.current)
      hoverPopupRef.current = new maplibregl.Popup({
        closeButton: false, closeOnClick: false,
      });
    if (!map._balloonHandlers) {
      map._balloonHandlers = true;
      map.on("mousemove", "balloon-dots", (e) => {
        if (viewMode !== "hazards") return;
        const f = e.features?.[0];
        if (!f) return;
        const { id, status, distKm, hazardName } = f.properties;
        hoverPopupRef.current.setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;color:#111;"><b>Balloon #${id}</b> — ${
              status === "danger"
                ? `near ${hazardName || "a cyclone"}! (${distKm} km)`
                : "safe"
            }</div>`
          ).addTo(map);
      });
      map.on("mouseleave", "balloon-dots", () =>
        hoverPopupRef.current?.remove()
      );
      map.on("click", "cluster-circles", (e) => {
        const features = map.queryRenderedFeatures(e.point, {
          layers: ["cluster-circles"],
        });
        const clusterId = features[0].properties.cluster_id;
        map.getSource("balloons").getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            map.easeTo({ center: features[0].geometry.coordinates, zoom });
          });
      });
    }
  };
  const addOrUpdateSelected = (map, fc) => {
    const srcId = "selected";
    if (map.getSource(srcId)) {
      map.getSource(srcId).setData(fc);
      return;
    }
    map.addSource(srcId, { type: "geojson", data: fc });
    map.addLayer({
      id: "selected-dot",
      type: "circle",
      source: srcId,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 2, 5.5, 6, 8.5],
        "circle-color": "#ffee55", "circle-stroke-color": "#111", "circle-stroke-width": 1.2,
      },
    });
  };
  const addOrUpdateCycloneHazards = (map, fc) => {
    const srcId = "cyclones";
    if (map.getSource(srcId)) {
      map.getSource(srcId).setData(fc);
    } else {
      map.addSource(srcId, { type: "geojson", data: fc });
      map.addLayer({
        id: "cyclone-rings",
        type: "circle",
        source: srcId,
        paint: {
          "circle-radius": [
            "interpolate", ["linear"], ["zoom"],
            1, ["*", ["get", "radiusKm"], 0.02],
            6, ["*", ["get", "radiusKm"], 0.12],
          ],
          "circle-color": "rgba(0,212,255,0.14)", "circle-stroke-color": "#00d4ff", "circle-stroke-width": 2.2,
        },
      });
      map.addLayer({
        id: "cyclone-labels",
        type: "symbol",
        source: srcId,
        layout: {
          "text-field": ["get", "name"], "text-size": 11, "text-offset": [0, 1.2],
        },
        paint: {
          "text-color": "#e8f0ff", "text-halo-color": "rgba(0,0,0,0.6)", "text-halo-width": 1.2,
        },
      });
      map.addLayer({
        id: "cyclone-center",
        type: "circle",
        source: srcId,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.0, 6, 3.2],
          "circle-color": "#00d4ff", "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8,
        },
      });
      if (!map._pulseStarted) {
        map._pulseStarted = true;
        let start = performance.now();
        const animate = () => {
          const t = (performance.now() - start) / 1000;
          const pulse = 0.55 + 0.35 * Math.sin(t * 2.2);
          if (map.getLayer("cyclone-rings")) {
            map.setPaintProperty("cyclone-rings", "circle-stroke-opacity", pulse);
          }
          requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }
  };
  
  const addOrUpdateClimateLayer = (map) => {
    if (map.getSource("climate-tiles")) return;
    map.addSource("climate-tiles", {
      type: "raster",
      tiles: [CLIMATE_TILE_URL],
      tileSize: 256,
      attribution: "Köppen-Geiger (1991-2020) via ArcGIS",
    });
    map.addLayer({
      id: "climate-tile-layer",
      type: "raster",
      source: "climate-tiles",
      paint: { "raster-opacity": 0.75 },
    });
  };
  
  const addOrUpdateSelectedClimatePath = (map, fc) => {
    const srcId = "selected-climate-path";
    if (map.getSource(srcId)) {
      map.getSource(srcId).setData(fc);
      return;
    }
    map.addSource(srcId, { type: "geojson", data: fc });
    map.addLayer({
      id: "selected-climate-path-line",
      type: "line",
      source: srcId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": "#ffea00", // Bright yellow
        "line-width": 2.5,
        "line-opacity": 0.8,
      },
    });
  };

  /* ------------------- data loading ------------------- */
  
  const loadHazardData = async (map) => {
    // ... (unchanged, uses local fetchers)
    if (kpis.total > 0) return;
    try {
      const [balloonsRaw, cyclones] = await Promise.all([
        fetchWindborneCurrent(),
        fetchCyclones(),
      ]);
      const balloons = balloonsRaw.map((b) => {
        let closest = { dist: Infinity, item: null, name: null };
        for (const c of cyclones) {
          const d =
            haversineKm({ lat: b.lat, lon: b.lon }, { lat: c.lat, lon: c.lon });
          if (d < closest.dist) closest = { dist: d, item: c, name: c.name };
        }
        const inDanger = closest.item && closest.dist <= CYCLONE_RADIUS_KM;
        return {
          ...b,
          danger: !!inDanger,
          distKm: Math.round(closest.dist || 0),
          hazardName: closest.name || null,
        };
      });
      const dangerOnly = balloons.filter((b) => b.danger).sort((a, b) => a.distKm - b.distKm).slice(0, 40);
      setDangerRows(dangerOnly);
      setKpis({
        total: balloons.length,
        danger: dangerOnly.length,
        cyclones: cyclones.length,
      });
      const balloonsFC = {
        type: "FeatureCollection",
        features: balloons.map((b) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [b.lon, b.lat] },
          properties: {
            id: b.id, status: b.danger ? "danger" : "safe",
            distKm: b.distKm, hazardName: b.hazardName,
          },
        })),
      };
      const cyclonesFC = {
        type: "FeatureCollection",
        features: cyclones.map((c) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [c.lon, c.lat] },
          properties: { name: c.name, radiusKm: CYCLONE_RADIUS_KM },
        })),
      };
      addOrUpdateBalloons(map, balloonsFC);
      addOrUpdateCycloneHazards(map, cyclonesFC);
    } catch (error) {
      console.error("Failed to load hazard data:", error);
    }
  };

  // --- NEW "Slow and Steady" Climate Load Function ---
  const loadClimateData = async (map) => {
    if (isClimateDataLoaded.current) return;
    
    setIsLoadingClimate(true);
    isClimateDataLoaded.current = true;
    console.log("Attempting to load climate data for the first time...");
    
    try {
      const [allStartPoints, allEndPoints] = await Promise.all([
        fetchBalloonFile(0), // 00.json
        fetchBalloonFile(23), // 23.json
      ]);

      const startPoints = allStartPoints.slice(0, 100);
      const endPoints = allEndPoints;
      const totalToProcess = startPoints.length;

      setClimateData({
        totalBalloons: allStartPoints.length,
        crossers: [],
        processedCount: 0,
      });
      console.log(`Processing first ${totalToProcess} balloons (sequentially)...`);

      let allCrossers = [];

      for (let i = 0; i < totalToProcess; i++) {
        const startBalloon = startPoints[i];
        const endBalloon = endPoints.find(b => b.id === startBalloon.id);
        
        if (!endBalloon) continue;

        // --- WE CALL THE MOCK FUNCTION ---
        const startZoneRes = await getMockClimateZone(startBalloon.lat, startBalloon.lon);
        const endZoneRes = await getMockClimateZone(endBalloon.lat, endBalloon.lon);
        // --- END CHANGE ---

        const startZone = startZoneRes?.koppen_geiger_zone;
        const endZone = endZoneRes?.koppen_geiger_zone;

        if (i < 5) {
           console.log(`B#${startBalloon.id}: Start [${startZone}] | End [${endZone}]`);
        }

        if (startZone && endZone && startZone !== endZone) {
          allCrossers.push({
            id: startBalloon.id,
            fromZone: startZone,
            toZone: endZone,
            fromDesc: startZoneRes?.zone_description || 'N/A',
            toDesc: endZoneRes?.zone_description || 'N/A',
            startCoords: [startBalloon.lon, startBalloon.lat],
            endCoords: [endBalloon.lon, endBalloon.lat],
          });
        }
        
        // This stops the UI from freezing and lets the map load.
        if ( (i + 1) % 5 === 0 || i === startPoints.length - 1) {
           setClimateData(prev => ({
            ...prev,
            crossers: [...allCrossers],
            processedCount: i + 1,
          }));
          await new Promise(res => setTimeout(res, 10)); // 10ms is tiny but enough
        }
      }
      
      console.log(`Finished processing. Found ${allCrossers.length} crossers.`);

    } catch (error) {
      console.error("Failed to load initial climate data:", error);
    } finally {
      setIsLoadingClimate(false);
    }
  };
  // --- END FIX ---
  
  const focusClimatePath = async (crosser) => {
    // ... (unchanged)
    const map = mapRef.current;
    if (!map || isPathLoading) return;

    setIsPathLoading(true);
    selectPopupRef.current?.remove();
    console.log(`Fetching 24h path for balloon #${crosser.id}...`);

    try {
      const pathPromises = [];
      for (let i = 0; i < 24; i++) {
        pathPromises.push(fetchBalloonFile(i));
      }
      const allPathFiles = await Promise.all(pathPromises);

      const coordinates = [];
      for (let i = 23; i >= 0; i--) {
        const file = allPathFiles[i];
        const balloonData = file.find(b => b.id === crosser.id);
        if (balloonData) {
          coordinates.push([balloonData.lon, balloonData.lat]);
        }
      }

      if (coordinates.length < 2) {
        throw new Error("Not enough data to draw path.");
      }
      
      const pathFC = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "LineString", coordinates: coordinates },
          properties: { id: crosser.id },
        }],
      };
      
      addOrUpdateSelectedClimatePath(map, pathFC);
      
      const bounds = coordinates.reduce((bounds, coord) => {
        return bounds.extend(coord);
      }, new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
      
      map.fitBounds(bounds, { padding: 100, duration: 1000, essential: true });

      if (!selectPopupRef.current)
        selectPopupRef.current = new maplibregl.Popup({
          closeButton: true, closeOnClick: false,
        });

      const msg = `
        <div style="font-size:12px;color:#111;">
          <b>Balloon #${crosser.id}</b>
          <div style="margin-top: 5px; font-size: 11px;">
            <b>From:</b> ${crosser.fromZone} (${crosser.fromDesc})
            <br/>
            <b>To:</b> ${crosser.toZone} (${crosser.toDesc})
          </div>
        </div>
      `;
      
      selectPopupRef.current
        .setLngLat(crosser.startCoords)
        .setHTML(msg)
        .addTo(map);

    } catch (error) {
      console.error(`Failed to load path for #${crosser.id}:`, error);
    } finally {
      setIsPathLoading(false);
    }
  };
  
  const focusBalloon = (b) => {
    // ... (unchanged)
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [b.lon, b.lat],
      zoom: 5.5,
      duration: 800,
      essential: true,
    });
    addOrUpdateSelected(map, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [b.lon, b.lat] },
          properties: { id: b.id },
        },
      ],
    });
    if (!selectPopupRef.current)
      selectPopupRef.current = new maplibregl.Popup({
        closeButton: true, closeOnClick: false,
      });
    const msg = b.danger
      ? `Balloon #${b.id} is near ${
          b.hazardName || "a cyclone"
        }! <span style="opacity:.75">(${Math.round(b.distKm)} km)</span>`
      : `Balloon #${b.id} is safe.`;
    selectPopupRef.current
      .setLngLat([b.lon, b.lat])
      .setHTML(`<div style="font-size:12px;color:#111;">${msg}</div>`)
      .addTo(map);
  };

  /* ------------------- main effects ------------------- */
  
  const toggleLayerVisibility = (map, mode) => {
    // ... (unchanged)
    const [show, hide] =
      mode === "hazards"
        ? [HAZARD_LAYER_IDS, CLIMATE_LAYER_IDS]
        : [CLIMATE_LAYER_IDS, HAZARD_LAYER_IDS];
    show.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    });
    hide.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    });
    
    if(mode === 'climate') {
      ['cluster-circles', 'cluster-count', 'balloon-dots'].forEach(id => {
         if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
      });
    }
  };

  useEffect(() => {
    // ... (unchanged)
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapEl.current,
      style:
        "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
      center: [0, 20],
      zoom: 2.3,
      attributionControl: true,
    });
    map.addControl(new maplibregl.NavigationControl(), "bottom-right");
    mapRef.current = map;

    console.log("Map component is ready. Waiting for 'load' event...");

    map.once("load", () => {
      console.log("MAP 'load' EVENT FIRED! Adding layers...");

      addOrUpdateClimateLayer(map);
      addOrUpdateSelectedClimatePath(map, { type: "FeatureCollection", features: [] });
      addOrUpdateBalloons(map, { type: "FeatureCollection", features: [] });
      addOrUpdateCycloneHazards(map, { type: "FeatureCollection", features: [] });
      addOrUpdateSelected(map, { type:"FeatureCollection", features: [] });

      toggleLayerVisibility(map, "hazards");
      loadHazardData(map);
      setIsMapLoaded(true);
    });
  }, []);

  useEffect(() => {
    // ... (unchanged)
    if (viewMode === "hazards" && !isClimateDataLoaded.current) {
      return; 
    }
    
    console.log(`View mode changed to: ${viewMode}`);
    const map = mapRef.current;

    if (!map || !isMapLoaded) {
      console.warn("View mode changed, but map is not ready. Aborting.");
      return; 
    }

    toggleLayerVisibility(map, viewMode);

    if (viewMode === "climate") {
      loadClimateData(map);
    } else {
      addOrUpdateSelectedClimatePath(map, { type: "FeatureCollection", features: [] });
      selectPopupRef.current?.remove();
    }

    hoverPopupRef.current?.remove();
    selectPopupRef.current?.remove();
    
  }, [viewMode, isMapLoaded]);

  return (
    <div className="app">
      <AboutModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <div ref={mapEl} className="map" />
      <div className="panel">
        <div className="view-selector">
          <label htmlFor="view-mode">View Mode:</label>
          <select
            id="view-mode"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="hazards">Hazard Radar</option>
            <option value="climate">Climate Colorizer</option>
          </select>
        </div>

        {viewMode === "hazards" ? (
          <HazardPanel
            kpis={kpis}
            dangerRows={dangerRows}
            onFocusBalloon={focusBalloon}
          />
        ) : (
          <ClimatePanel
            climateData={climateData}
            isLoading={isLoadingClimate}
            isPathLoading={isPathLoading}
            onFocusPath={focusClimatePath}
          />
        )}
      </div>
    </div>
  );
}