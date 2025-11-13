// src/AboutModal.jsx

import { useEffect, useRef } from "react";
export default function AboutModal({ isOpen, onClose }) {
  const dialogRef = useRef(null);

  // Handle opening and closing the dialog
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  // Prevent closing dialog by clicking backdrop or pressing Escape
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const preventCancel = (e) => {
      e.preventDefault();
    };
    dialog.addEventListener("cancel", preventCancel);
    return () => dialog.removeEventListener("cancel", preventCancel);
  }, []);

  return (
    <dialog ref={dialogRef} className="about-modal">
      <div className="modal-content">
        <h2>Welcome to the Balloon Radar!</h2>
        <p>
          This app visualizes global balloon telemetry data in two modes,
          selectable from the dropdown menu.
        </p>

        <h3>Mode 1: Hazard Radar (Default)</h3>
        <p>
          This mode shows 1,000+ tracked balloons against active tropical
          cyclones.
        </p>
        <ul>
          <li>
            Balloons in safe areas are shown as aqua dots or green clusters.
          </li>

          <li>
            Note that u may see clusters of balloons represented by a single green
            circle with a number. This indicates multiple balloons in close
            proximity, since displaying all individual dots would clutter the map :)
          </li>

          <li>
            <strong>Red dots</strong> are balloons within 250km of a cyclone.
          </li>
          <li>The sidebar lists all balloons currently in danger.</li>
          <li>
            <strong>Try it:</strong> Click "View on map" to zoom to any
            endangered balloon.
          </li>
        </ul>

        <h3>Mode 2: Climate Colorizer</h3>
        <p>
          This mode identifies balloons that have traveled across different
          climate zones in the last 24 hours, plotted over a Köppen-Geiger
          climate map.
        </p>
        <ul>
          <li>
            The app processes balloons in batches to remain fast.
          </li>
          <li>
            <strong>Try it:</strong> Click "Check 100 More" to process the fleet
            and find "Zone Crossers."
          </li>
          <li>
            If any are found, click "View Path" to fetch and display that
            specific balloon's 24-hour flight path.
          </li>
        </ul>

        <div className="modal-note modal-note-danger">
  <strong>A Note on Live Data (You are on the Live Version):</strong>
  <p style={{ margin: '8px 0 0 0' }}>
    This version of the app pulls from <strong> live APIs</strong>. The balloon data server, however, is unstable and may be blocking this deployment.
  </p>
  <p style={{ margin: '8px 0 0 0' }}>
    If you see `404` errors or the app data fails to load for a while, **please use the 100% reliable static version instead:**
  </p>

  {/* --- IMPORTANT: PASTE YOUR STABLE LINK HERE --- */}
  <a 
    href="https://balloon-radar-live-git-stati-f4f209-shreekars-projects-8dfdfda9.vercel.app/" 
    target="_blank" 
    rel="noopener noreferrer" 
    className="modal-button-link"
  >
    Go to Stable (Static Data) Version
  </a>
</div>
        
        <button onClick={onClose} className="modal-button">
          Got it, Start Exploring
        </button>
      </div>
    </dialog>
  );
}
