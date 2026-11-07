Here is the complete **System Architecture** section formatted directly in Markdown so you can copy and paste it straight into your project's `README.md`.

---

```markdown
## 🏗️ System Architecture

The Oil & Gas Pipeline Monitoring PWA follows a zero-dependency, edge-first architecture engineered for field engineers operating in harsh, low-bandwidth, and remote desert environments (e.g., UAE pipeline corridors).


```

┌─────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (PWA Engine)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Responsive UI / DOM Controller (js/app.js)                               │
│  • Sunlight Anti-Glare Engine (Pure Black / OLED #000000 / Safety Yellow)   │
│  • Simulated Lockscreen / Dashboard Live Activities Mode                    │
│  • Native Web Share & Screen WakeLock Integration                           │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
│                               │
▼                               ▼
┌─────────────────────────────────────────┐  ┌────────────────────────────────┐
│      EDGE LOGIC & DIAGNOSTICS CORE      │  │    OFFLINE & STORAGE LAYER     │
├─────────────────────────────────────────┤  ├────────────────────────────────┤
│ • 4–20 mA NAMUR NE43 Signal Scaler      │  │ • Service Worker (sw.js)       │
│ • Hydrostatic Line-Pack & DP Estimator  │  │ • Cache-First Runtime Cache    │
│ • RTTM Mass-Balance Sensitivity Engine  │  │ • LocalStorage (Theme & State) │
│ • Physical Clamp Verification Matrix    │  │ • Fallback Screen (offline.html│
└─────────────────────────────────────────┘  └────────────────────────────────┘
▲
│ Reference & Standards
┌──────────────────────────────┴──────────────────────────────────────────────┐
│                    INDUSTRIAL SCADA INTERFACE & STANDARDS                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Protocols: Modbus TCP/RTU, DNP3, IEC 60870-5-104 over VSAT / Cellular     │
│ • Field Hardware: Redundant Hot-Standby PLC/RTU (Siemens S7 / Allen-Bradley)│
│ • Visualization Philosophy: ISA-101 Grayscale HMI + ISA-18.2 Alarm Priority │
│ • Safety Systems: IEC 61508 / 61511 SIS, SIL-2/3 Line Break Valves (LBV)    │
└─────────────────────────────────────────────────────────────────────────────┘

```

---

### 1. PWA Client & Presentation Layer
* **Architecture:** Vanilla Single-Page Application (SPA) with zero external runtime dependencies, ensuring high rendering speeds and long battery life.
* **Display Engine:** 
  * **Standard Dark Industrial:** Slate-based (`#0a0f1d`) low-fatigue interface.
  * **Desert Sunlight Mode:** High-luminescence monochrome contrast (OLED `#000000` + `#FFFF00` / `#00E5FF`) for readability under direct 45°C+ desert sunlight.
  * **OLED Battery Saver:** Suppresses transitions, lowers redraw rates, and disables non-critical timers to conserve device power at off-grid solar valve stations.
* **Mobile / iOS Native Features:**
  * Viewport-fit cover support for Dynamic Island and home indicator safe areas.
  * Standalone Lockscreen Widget view paired with the Screen Wake Lock API for vehicle dash mounts.
  * Native Web Share API integration with fallback clipboard export.

---

### 2. Service Worker & Caching Strategy (`sw.js`)
* **Strategy:** Cache-First with Network Fallback.
* **Lifecycle:**
  * **Install:** Pre-caches all essential assets (`index.html`, `css/styles.css`, `js/app.js`, `manifest.webmanifest`, SVG icons, and `offline.html`).
  * **Activate:** Purges stale cache stores upon detection of an incremented cache key (`CACHE_NAME = 'og-scada-pwa-v1.0.0'`).
  * **Fetch:** Serves local cache instantly; routes unexpected network errors directly to `offline.html`.

---

### 3. Edge Engineering & Math Processing Layer
All calculations run client-side with physical parameter bounds:
* **NAMUR NE43 Analog Scaler:**
  * `< 3.6 mA`: Sensor Burnout / Open Wire Fault
  * `3.8 – 4.0 mA`: Under-Range
  * `4.0 – 20.0 mA`: Nominal Linear Process Range ($PV = \frac{I - 4}{16} \times (URV - LRV) + LRV$)
  * `20.0 – 20.5 mA`: Over-Range
  * `> 21.0 mA`: Hardware Saturation / Short Circuit
* **Hydrostatic & Line-Pack Estimator:**
  * Clamps Specific Gravity strictly to $0.5 \le SG \le 2.0$.
  * Clamps Thermal Expansion strictly to $0.0001 \le \beta \le 0.0025 \text{ /}^\circ\text{C}$.
  * Computes static head loss ($\Delta P = \rho g \Delta h$) and line pack density.
* **RTTM Leak Detection Sensitivity Engine:**
  * Mass-balance imbalance monitoring ($M_{\text{in}} - M_{\text{out}} > \Delta M_{\text{threshold}}$).
  * Pressure wave transient locator using acoustic propagation velocity ($a \approx 1000\text{ m/s}$).

---

### 4. Industrial Protocol & Telemetry Reference Mapping
The application models standard UAE/GCC pipeline SCADA field architectures:
* **Level 0 (Field Instrumentation):** Dual-redundant Pressure Transmitters (PT), Temperature Transmitters (TT), Ultrasonic / Coriolis Flow Meters, Remote Valve Actuators.
* **Level 1 (Remote Control & RTUs):** Solar-powered Block Valve Station RTUs running IEC 61131-3 logic for automated Line-Break Detection ($dP/dt$ rate of drop).
* **Level 2 (SCADA / Master Station):** Dual Hot-Standby SCADA servers gathering field data via DNP3 or IEC 60870-5-104 over redundant satellite (VSAT) and private LTE/radio networks.

```

---
