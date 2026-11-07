# 🛢️ Oil & Gas Pipeline Monitoring: SCADA Engineering Field Guide

<div align="center">

![Project Banner](assets/og-image.svg)

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-10b981?style=for-the-badge&logo=pwa&logoColor=white)](https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/)
[![Platform](https://img.shields.io/badge/Platform-iOS%20%7C%20Android%20%7C%20Desktop-3b82f6?style=for-the-badge&logo=apple&logoColor=white)](https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/)
[![Standard](https://img.shields.io/badge/Standards-ISA--101%20%7C%20NAMUR%20NE43-f59e0b?style=for-the-badge)](https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/)
[![Location](https://img.shields.io/badge/Facility-AGAC.ae%20%7C%20Dubai%20UAE-ef4444?style=for-the-badge&logo=google-maps&logoColor=white)](https://agac.ae)
[![License](https://img.shields.io/badge/License-MIT-6366f1?style=for-the-badge)](LICENSE)

**A high-reliability Progressive Web App engineered for SCADA, Instrumentation, and Automation Engineers operating remote oil and gas pipeline valve stations, compressor hubs, and terminal facilities.**

[Explore Live Demo](https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/) • [Architecture](#-system-architecture) • [Features](#-key-features) • [Installation](#-installation--deployment)

</div>

---

## 📋 Table of Contents
1. [Overview](#-overview)
2. [Visual Assets & Badges](#-visual-assets--branding)
3. [System Architecture](#-system-architecture)
4. [Key Features](#-key-features)
5. [Standards & Engineering Foundations](#-standards--engineering-foundations)
6. [Repository Structure](#-repository-structure)
7. [Installation & Deployment](#-installation--deployment)
8. [Offline & PWA Specification](#-offline--pwa-specification)
9. [License & Credits](#-license--credits)

---

## 🔭 Overview

Field operations across UAE pipeline corridors (such as high-pressure gas trunklines and crude export networks) require immediate, zero-latency access to telemetry calculations, loop diagnostics, and emergency control philosophies under harsh environmental conditions (extreme heat, direct noon sunlight, and off-grid remote valve stations).

This Progressive Web App (PWA) operates with **zero external runtime dependencies**, functions completely **offline**, and adheres to industrial control system design paradigms:

* **Site Context:** Arab Global Oil & Gas Operations (`agac.ae`), Dubai, UAE.
* **Target Audience:** Field Automation Engineers, SCADA Systems Integrators, and I&C Maintenance Teams.
* **Core Philosophy:** High-Performance ISA-101 grayscale visuals, strict physical parameter validation, and robust field accessibility.

---

## 🎨 Visual Assets & Branding

### Official Vector Emblem (`icons/icon-512.svg`)

<div align="center">

```xml
<svg xmlns="[http://www.w3.org/2000/svg](http://www.w3.org/2000/svg)" viewBox="0 0 512 512" width="128" height="128">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b132b"/>
      <stop offset="100%" stop-color="#1c2541"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f6d365"/>
      <stop offset="100%" stop-color="#fda085"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)"/>
  <circle cx="256" cy="256" r="180" stroke="rgba(255,255,255,0.08)" stroke-width="12" fill="none"/>
  <!-- Pipeline Path -->
  <path d="M96 320 H200 V220 H312 V320 H416" stroke="url(#goldGrad)" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <!-- Telemetry Sensor Node -->
  <circle cx="256" cy="220" r="32" fill="#00e5ff" stroke="#ffffff" stroke-width="6"/>
  <!-- Pressure Pulse Indicator -->
  <path d="M224 140 Q256 100 288 140" stroke="#00e5ff" stroke-width="8" stroke-linecap="round" fill="none"/>
  <path d="M208 116 Q256 64 304 116" stroke="rgba(0,229,255,0.4)" stroke-width="6" stroke-linecap="round" fill="none"/>
</svg>

```

---

## 🏗️ System Architecture

The application is structured into four decoupled operational tiers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          1. CLIENT / INTERACTION LAYER                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  • Single-Page Reactive DOM Engine (js/app.js)                              │
│  • Desert Noon Anti-Glare Engine (OLED #000000 + Ultra-High Contrast Neon)   │
│  • Lockscreen Live Telemetry Mode (Full-Viewport Screen WakeLock Active)    │
│  • Native Web Share API + Clipboard Fallback Hub                            │
└──────────────────────┬───────────────────────────────┬──────────────────────┘
                       │                               │
                       ▼                               ▼
┌─────────────────────────────────────────┐  ┌────────────────────────────────┐
│     2. EDGE ENGINEERING DIAGNOSTICS     │  │   3. RESILIENT STORAGE & PWA   │
├─────────────────────────────────────────┤  ├────────────────────────────────┤
│ • 4–20 mA NAMUR NE43 Error Classifier   │  │ • Service Worker Engine (sw.js)│
│ • Hydrostatic Line-Pack Estimator       │  │ • Cache-First Runtime Storage  │
│ • Acoustic Wave RTTM Leak Locator       │  │ • Versioned Invalidation Cache │
│ • Defensive Math Boundary Clamps        │  │ • Standalone Offline Fallback  │
└─────────────────────────────────────────┘  └────────────────────────────────┘
                               ▲
                               │ Physical & Protocol Modeling
┌──────────────────────────────┴──────────────────────────────────────────────┐
│                    4. INDUSTRIAL SCADA ARCHITECTURE MAPPING                 │
├─────────────────────────────────────────────────────────────────────────────┤
│ • Level 0 (Process): Redundant PT/TT transmitters, MOV/LBV line actuators   │
│ • Level 1 (Control): Solar-powered Remote RTUs running IEC 61131-3 ST logic │
│ • Level 2 (Supervisory): Dual Redundant Master SCADA via VSAT / IEC 60870   │
└─────────────────────────────────────────────────────────────────────────────┘

```

### Edge Processing & Physical Guardrails

| Module | Range / Clamps | Verification & Physical Rules |
| --- | --- | --- |
| **NAMUR NE43 Scaler** | `0.0 mA` to `25.0 mA` | Categorizes signal integrity (`<3.6 mA` Burnout, `3.8-4.0` Under-range, `4.0-20.0` Valid, `>21.0 mA` Short circuit). |
| **Specific Gravity ($SG$)** | `0.50` to `2.00` | Limits calculations strictly to liquid hydrocarbons and production slurries. |
| **Thermal Expansion ($\beta$)** | `0.0001` to `0.0025` $1/^\circ\text{C}$ | Prevents unrealistic thermal relief overpressurization numbers. |
| **Transient Wave Speed ($a$)** | $900$ to $1250\text{ m/s}$ | Accounts for sonic acoustic propagation in pressurized liquid steel pipes. |

---

## ⚡ Key Features

### 1. Environmental Adaptability

* **☀️ Desert Noon Sunlight Mode:** Inverts the visual palette to stark monochrome yellow and cyan on true OLED black (`#000000`) with bold `3px` bounding borders to ensure zero-glare readability under direct midday UAE sunlight ($>45^\circ\text{C}$).
* **🔋 Battery Saver Engine:** Shuts down non-critical CSS animations, suspends periodic background redraw loops, and sets rendering to OLED-off levels to conserve battery life in remote off-grid locations.
* **📱 iOS Lockscreen / StandBy Mode:** Provides an ultra-glanceable dashboard displaying Trunkline Pressure, Differential Pressure across block valves, and RTU battery health. Engages the Screen Wake Lock API to prevent screen timeout when vehicle-mounted.

### 2. Operational SCADA Calculators

* **NAMUR NE43 Analog Loop Debugger:** Converts mA signals into calibrated Process Variables (Bar, ${}^\circ\text{C}$, $\text{m}^3/\text{h}$) alongside PLC integer counts (0–27648 for Siemens S7 / 0–32767 for Rockwell ControlLogix).
* **Line-Pack & Pressure Drop Engine:** Calculates hydrostatic head loss across desert dunes and rugged terrain elevations ($\Delta P = \rho g \Delta h$).
* **Acoustic Wave Leak Localization:** Uses negative pressure wave arrival differential times ($\Delta t$) at adjacent RTU stations to pinpoint pipeline breach coordinates:

$$X = \frac{L + a \cdot \Delta t}{2}$$



---

## 📜 Standards & Engineering Foundations

The guide provides reference implementations aligned with major oil & gas engineering standards:

* **ISA-101.01:** Human-Machine Interfaces for Process Automation Systems (neutral gray base palettes, color strictly reserved for unacknowledged alarms).
* **ISA-18.2 / IEC 62682:** Management of Alarm Systems for the Process Industries.
* **NAMUR NE43:** Standardization of the Signal Level for the Failure Information of Digital Transmitters.
* **IEC 60870-5-104 & DNP3:** Telecontrol communication protocols over satellite (VSAT) and private radio networks.
* **API 1130:** Computational Pipeline Monitoring for Liquids (algorithmic leak detection guidance).

---

## 📁 Repository Structure

```
OilandGas-Pipeline-Monitoring/
├── index.html                  # Core application entry & responsive UI shell
├── manifest.webmanifest        # PWA metadata & iOS/Android install criteria
├── sw.js                       # Service worker with cache-first strategy
├── offline.html                # Isolated emergency offline fallback screen
├── favicon.ico                 # Standard browser tab icon
├── favicon.svg                 # Scalable modern browser icon
├── apple-touch-icon.png        # iOS Home Screen asset (180x180)
├── assets/
│   └── og-image.svg            # 1200x630 social card & metadata preview
├── icons/
│   ├── icon-192.svg            # Android standard launcher asset
│   ├── icon-512.svg            # Splash screen & store icon
│   └── icon-maskable.svg       # Adaptive icon for modern mobile OS
├── css/
│   └── styles.css              # Desert-optimized styles & safe-area rules
└── js/
    └── app.js                  # Single-init application logic & edge math

```

---

## 🚀 Installation & Deployment

### Quick Deployment to GitHub Pages

1. **Clone the repository:**
```bash
git clone [https://github.com/githubbest729/OilandGas-Pipeline-Monitoring.git](https://github.com/githubbest729/OilandGas-Pipeline-Monitoring.git)
cd OilandGas-Pipeline-Monitoring

```


2. **Verify static asset links:**
Ensure all relative links in `index.html` match the base repository path `/OilandGas-Pipeline-Monitoring/`.
3. **Deploy:**
Commit and push your files to the `main` branch:
```bash
git add .
git commit -m "feat: deploy production PWA SCADA field guide v1.0.0"
git push origin main

```


4. **Activate GitHub Pages:**
* Open **Settings** > **Pages** in your GitHub repository.
* Under **Branch**, select `main` and root directory `/(root)`.
* Click **Save**. The PWA will be live at:
```
[https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/](https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/)

```





---

## 📶 Offline & PWA Specification

* **Storage Scheme:** Cache-First with runtime fallbacks.
* **Cache Key:** `og-scada-pwa-v1.0.0` (increment on deployment to purge client-side cache).
* **iOS Safari Installation:**
1. Open the URL in Safari on an iPhone.
2. Tap the **Share** button in the Safari navigation bar.
3. Scroll down and select **"Add to Home Screen"**.
4. The app launches in standalone fullscreen mode without browser navigation chrome.



---

## 📄 License & Credits

Developed for field personnel and automation engineers supporting oil and gas pipeline transportation networks.

Distributed under the **MIT License**. See `LICENSE` for details.

*Maintained by Arab Global Oil & Gas Operations (`agac.ae`) Engineering Community.*

```

```
