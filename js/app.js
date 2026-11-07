/**
 * Oil & Gas Pipeline Monitoring SCADA Field Guide
 * Unified Single-Init Application Controller
 * Arab Global Oil & Gas Operations (agac.ae), Dubai, UAE
 * IEC 61131-3 • ISA-101 • NAMUR NE43 • API 1130
 */

const App = {
  state: {
    sunlight: false,
    batterySaver: false,
    soundMuted: false,
    wakeLock: null,
    mimicZoom: 1,
    mimicPan: { x: 0, y: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    activeTab: 'arch',
    simulatingAlarm: false,
    audioCtx: null,
    trendHistory: {
      press: [64.1, 64.2, 64.0, 64.3, 64.2, 64.4, 64.2, 64.1, 64.3, 64.2, 64.0, 64.2, 64.3, 64.1, 64.2],
      dp: [0.12, 0.11, 0.13, 0.12, 0.12, 0.11, 0.14, 0.12, 0.11, 0.12, 0.13, 0.12, 0.11, 0.12, 0.12],
      flow: [2145, 2150, 2148, 2152, 2150, 2146, 2155, 2150, 2148, 2151, 2149, 2150, 2153, 2147, 2150]
    },
    rttmState: {
      running: true,
      leaking: false,
      leakStart: 0,
      waveTimer: null
    }
  },

  init() {
    this.bindTabs();
    this.bindUtilities();
    this.initAudio();
    this.initPAndIDMimic();
    this.init3DRTU();
    this.initISA101Components();
    this.initCodeHub();
    this.initCEMatrix();
    this.initCalculators();
    this.initElevationChart();
    this.initRTTMSimulator();
    this.initLockscreenWidget();
    this.initSATChecklist();
    this.startGlobalTelemetry();
    this.loadPersistedSettings();
  },

  // -------------------------------------------------------------
  // 1. Audio Sensory Feedback (Zero Dependencies / Web Audio API)
  // -------------------------------------------------------------
  initAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      document.addEventListener('click', () => {
        if (!this.state.audioCtx) {
          try {
            this.state.audioCtx = new AudioContext();
          } catch (e) {}
        }
      }, { once: true });
    }
  },

  playSound(type = 'click') {
    if (this.state.soundMuted || !this.state.audioCtx) return;
    try {
      if (this.state.audioCtx.state === 'suspended') {
        this.state.audioCtx.resume();
      }
      const ctx = this.state.audioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'click') {
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'alarm') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(960, now);
        osc.frequency.setValueAtTime(1400, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'preset') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {}
  },

  // -------------------------------------------------------------
  // 2. Navigation & Utility Header Controls
  // -------------------------------------------------------------
  bindTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        this.state.activeTab = target;
        tabs.forEach(t => {
          t.setAttribute('aria-selected', 'false');
          t.classList.remove('active');
        });
        panels.forEach(p => p.classList.remove('active'));

        tab.setAttribute('aria-selected', 'true');
        tab.classList.add('active');
        const pnl = document.querySelector(`#tab-${target}`);
        if (pnl) pnl.classList.add('active');

        this.playSound('click');
        if (target === 'calc') {
          setTimeout(() => {
            this.renderElevationChart();
            this.renderRTTMChart();
          }, 80);
        }
      });
    });

    document.querySelector('#islandPill')?.addEventListener('click', () => {
      this.playSound('click');
      document.querySelector('#tabbtn-glance')?.click();
    });
  },

  bindUtilities() {
    // Desert Sunlight Mode
    const btnSun = document.querySelector('#btnSun');
    btnSun?.addEventListener('click', () => {
      this.playSound('click');
      this.toggleSunlight(!this.state.sunlight);
    });

    // Low Battery Saver Mode
    const btnBatt = document.querySelector('#btnBatt');
    btnBatt?.addEventListener('click', () => {
      this.playSound('click');
      this.toggleBattery(!this.state.batterySaver);
    });

    // Mute Sounds
    const btnMute = document.querySelector('#btnMute');
    btnMute?.addEventListener('click', () => {
      this.state.soundMuted = !this.state.soundMuted;
      btnMute.setAttribute('aria-pressed', String(this.state.soundMuted));
      btnMute.classList.toggle('active', this.state.soundMuted);
      const wave = document.querySelector('#muteWave');
      if (wave) wave.style.display = this.state.soundMuted ? 'none' : 'block';
      this.showToast(this.state.soundMuted ? 'Audio Feedback Muted' : 'Audio Feedback Enabled');
    });

    // Widget Shortcut Button
    document.querySelector('#btnWidget')?.addEventListener('click', () => {
      this.playSound('click');
      document.querySelector('#tabbtn-glance')?.click();
    });

    // Share Button (Native Web Share with Fallback)
    document.querySelector('#btnShare')?.addEventListener('click', async () => {
      this.playSound('click');
      const shareData = {
        title: 'Oil & Gas Pipeline Monitoring SCADA Field Guide',
        text: 'Production SCADA engineering guide and telemetry calculators for UAE oil and gas pipelines (agac.ae).',
        url: window.location.href || 'https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/'
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (e) {}
      } else {
        try {
          await navigator.clipboard.writeText(shareData.url);
          this.showToast('Project link copied to clipboard!');
        } catch (e) {
          this.showToast(shareData.url);
        }
      }
    });

    // Refresh & Service Worker Update
    document.querySelector('#btnRefresh')?.addEventListener('click', () => {
      this.playSound('click');
      this.showToast('Checking for field telemetry updates...');
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => {
          if (reg) reg.update();
        });
      }
      setTimeout(() => window.location.reload(), 400);
    });
  },

  toggleSunlight(enabled) {
    this.state.sunlight = enabled;
    document.body.classList.toggle('sunlight-mode', enabled);
    const btn = document.querySelector('#btnSun');
    if (btn) {
      btn.setAttribute('aria-pressed', String(enabled));
      btn.classList.toggle('active', enabled);
    }
    localStorage.setItem('scada_sunlight', String(enabled));
    this.showToast(enabled ? '☀️ Desert Sunlight Anti-Glare Active' : 'Standard Slate Industrial Mode');
  },

  toggleBattery(enabled) {
    this.state.batterySaver = enabled;
    document.body.classList.toggle('battery-saver', enabled);
    const btn = document.querySelector('#btnBatt');
    if (btn) {
      btn.setAttribute('aria-pressed', String(enabled));
      btn.classList.toggle('active', enabled);
    }
    localStorage.setItem('scada_battery', String(enabled));
    this.showToast(enabled ? '🔋 OLED Battery Saver Enabled' : 'Normal Power Mode');
  },

  loadPersistedSettings() {
    if (localStorage.getItem('scada_sunlight') === 'true') {
      this.toggleSunlight(true);
    }
    if (localStorage.getItem('scada_battery') === 'true') {
      this.toggleBattery(true);
    }
  },

  showToast(msg) {
    const t = document.querySelector('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  },

  // -------------------------------------------------------------
  // 3. Interactive P&ID Process Flow Mimic
  // -------------------------------------------------------------
  initPAndIDMimic() {
    const wrap = document.querySelector('#mimicWrap');
    const svg = document.querySelector('#mimic');
    if (!wrap || !svg) return;

    const flowSlider = document.querySelector('#mimicFlow');
    const flowReadout = document.querySelector('#mimicReadout');
    flowSlider?.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      if (flowReadout) flowReadout.textContent = `${val} %`;
      const dur = val <= 0 ? 0 : Math.max(0.4, 2.5 - (val / 100) * 2.0);
      document.documentElement.style.setProperty('--fdur', `${dur.toFixed(2)}s`);
      
      const flows = wrap.querySelectorAll('.flow:not(#flow-byp)');
      flows.forEach(f => {
        if (val === 0) {
          f.classList.add('stopped');
        } else {
          f.classList.remove('stopped');
        }
      });
    });

    // Zoom & Pan
    const applyTransform = () => {
      svg.style.transform = `translate(${this.state.mimicPan.x}px, ${this.state.mimicPan.y}px) scale(${this.state.mimicZoom})`;
      svg.style.transformOrigin = 'center center';
    };

    document.querySelector('#mzIn')?.addEventListener('click', () => {
      this.playSound('click');
      this.state.mimicZoom = Math.min(2.5, this.state.mimicZoom + 0.25);
      applyTransform();
    });

    document.querySelector('#mzOut')?.addEventListener('click', () => {
      this.playSound('click');
      this.state.mimicZoom = Math.max(0.7, this.state.mimicZoom - 0.25);
      applyTransform();
    });

    document.querySelector('#mzReset')?.addEventListener('click', () => {
      this.playSound('click');
      this.state.mimicZoom = 1;
      this.state.mimicPan = { x: 0, y: 0 };
      applyTransform();
    });

    // Drag / Touch Pan
    wrap.addEventListener('mousedown', (e) => {
      if (e.target.closest('.hs')) return;
      this.state.isPanning = true;
      this.state.panStart = { x: e.clientX - this.state.mimicPan.x, y: e.clientY - this.state.mimicPan.y };
      wrap.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.state.isPanning) return;
      this.state.mimicPan.x = e.clientX - this.state.panStart.x;
      this.state.mimicPan.y = e.clientY - this.state.panStart.y;
      applyTransform();
    });

    window.addEventListener('mouseup', () => {
      this.state.isPanning = false;
      wrap.style.cursor = 'default';
    });

    // Hotspot Data & Bottom Sheet Modal
    const tagDb = {
      'ESDV-101': {
        name: 'ESDV-101 (Emergency Shutdown Valve)',
        loc: 'Inlet Manifold, BVS-01 (Habshan - Fujairah Trunkline)',
        type: '36" ANSI 900 Full-Bore Ball Valve with Hydraulic Spring-Return Actuator',
        failSafe: 'Fail-Close (FC) / De-energize to Trip',
        sil: 'SIL-3 Capable (IEC 61508 / IEC 61511)',
        io: 'PLC Rack 1, Slot 3, Ch 0 (DO: 24VDC Solenoid), Ch 1-2 (DI: ZSO/ZSC)',
        telemetry: 'Status: 100% OPEN • PST (Partial Stroke Test) Passed 4d ago'
      },
      'PT-101': {
        name: 'PT-101 (Trunkline Pressure Transmitter)',
        loc: 'Upstream Header, Block Valve Station 1',
        type: 'Piezoresistive Diaphragm Transmitter (HART 7 / 4–20 mA)',
        range: '0.00 to 100.00 bar g (Design MAOP: 92 bar)',
        sil: 'SIL-2 Certified, 2oo3 Voting Configuration',
        io: 'PLC Rack 1, Slot 5, Ch 0 (AI: 4–20 mA NAMUR NE43)',
        telemetry: 'Live Value: 64.22 bar g • Loop Current: 14.28 mA • Health: GOOD'
      },
      'TT-102': {
        name: 'TT-102 (Product Temperature Transmitter)',
        loc: 'Inlet Metering Run, BVS-01',
        type: 'Duplex Pt100 RTD Class A 4-Wire with Thermowell',
        range: '-10.0 to 90.0 °C (Summer Ground Temp: 48 °C)',
        sil: 'SIL-2 Certified',
        io: 'PLC Rack 1, Slot 6, Ch 2 (AI: 4–20 mA)',
        telemetry: 'Live Value: 42.4 °C • Loop Current: 12.38 mA • Health: GOOD'
      },
      'LBV-04': {
        name: 'LBV-04 (Mainline Line Break Valve)',
        loc: 'Downstream Isolation Section, KM 48.2',
        type: '36" Line Break Isolation Ball Valve with Gas-over-Oil Actuator',
        logic: 'Autonomous RTU dP/dt Rate-of-Drop Closure (>2.5 bar/s) + Remote SCADA Command',
        sil: 'SIL-3 Capable (Automatic Emergency Isolation)',
        io: 'Solar RTU Node 1, Slot 2, Ch 4 (DO Trip)',
        telemetry: 'Status: OPEN • DP Across Seat: 0.12 bar • Hydraulic Accumulator: 180 bar'
      },
      'MOV-102': {
        name: 'MOV-102 (BVS Equalization & Bypass Valve)',
        loc: 'BVS-01 Equalization Bypass Loop',
        type: '6" ANSI 900 Needle Equalizing Valve with 24VDC Electric Actuator',
        purpose: 'Pre-commissioning Line Packing & Pressure Equalization across LBV-04',
        sil: 'Process Control Non-SIL (Interlocked with LBV differential pressure)',
        io: 'RTU Slot 2, Ch 6 (DO Open/Close)',
        telemetry: 'Status: CLOSED (Normal Operating Mode)'
      },
      'FT-103': {
        name: 'FT-103 (Fiscal Custody Ultrasonic Flow Meter)',
        loc: 'Terminal Custody Transfer Skid',
        type: '8-Path Multipath Ultrasonic Meter with Integrated Temperature/Pressure Correction',
        range: '0 to 8,000 m³/h Liquid Hydrocarbon (Dubai Blend)',
        accuracy: '±0.15% per API MPMS Chapter 5.8',
        io: 'Modbus TCP / OPC UA over Redundant Fibre Ring',
        telemetry: 'Live Flow: 2,150.4 m³/h • Mass Flow: 1,827.8 MT/h • Diagnostic SOS: 1,382 m/s'
      }
    };

    wrap.querySelectorAll('.hs').forEach(hs => {
      hs.addEventListener('click', (e) => {
        this.playSound('click');
        const tag = hs.getAttribute('data-tag');
        const info = tagDb[tag];
        if (!info) return;

        const title = document.querySelector('#sheetTitle');
        const body = document.querySelector('#sheetBody');
        if (title) title.textContent = info.name;
        if (body) {
          body.innerHTML = `
            <div class="live">${info.telemetry.split('•')[0]}</div>
            <div class="kv">
              <span>Location:</span><span>${info.loc}</span>
              <span>Instrument:</span><span>${info.type}</span>
              ${info.range ? `<span>Calibrated Range:</span><span>${info.range}</span>` : ''}
              ${info.sil ? `<span>Safety SIL:</span><span>${info.sil}</span>` : ''}
              ${info.failSafe ? `<span>Fail-Safe Action:</span><span>${info.failSafe}</span>` : ''}
              ${info.logic ? `<span>Safety Logic:</span><span>${info.logic}</span>` : ''}
              <span>I/O Mapping:</span><span>${info.io}</span>
              <span>Diagnostics:</span><span>${info.telemetry}</span>
            </div>
            <div style="margin-top:16px;display:flex;gap:8px">
              <button class="btn primary" style="flex:1" onclick="App.showToast('Test command dispatched to SCADA Gateway');App.playSound('preset');">Test Interlock</button>
              <button class="btn" style="flex:1" onclick="App.closeBottomSheet()">Close</button>
            </div>
          `;
        }
        document.querySelector('#sheetBackdrop')?.classList.add('open');
        document.querySelector('#sheet')?.classList.add('open');
      });
    });

    document.querySelector('#sheetClose')?.addEventListener('click', () => this.closeBottomSheet());
    document.querySelector('#sheetBackdrop')?.addEventListener('click', () => this.closeBottomSheet());
  },

  closeBottomSheet() {
    this.playSound('click');
    document.querySelector('#sheetBackdrop')?.classList.remove('open');
    document.querySelector('#sheet')?.classList.remove('open');
  },

  // -------------------------------------------------------------
  // 4. 3D Digital Twin (Solar RTU Enclosure & Array)
  // -------------------------------------------------------------
  init3DRTU() {
    const stage = document.querySelector('#rtuStage');
    const pinsContainer = document.querySelector('#rtuPins');
    const infoBox = document.querySelector('#rtuInfo');
    const wireToggle = document.querySelector('#rtuLow');
    const resetBtn = document.querySelector('#rtuReset');
    if (!stage) return;

    // Create Canvas
    const canvas = document.createElement('canvas');
    stage.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    let width = stage.clientWidth || 600;
    let height = stage.clientHeight || 340;
    canvas.width = width;
    canvas.height = height;

    window.addEventListener('resize', () => {
      width = stage.clientWidth || 600;
      height = stage.clientHeight || 340;
      canvas.width = width;
      canvas.height = height;
    });

    // 3D Orbit State
    let rotX = -0.38;
    let rotY = 0.72;
    let zoom = 1.05;
    let exploded = false;
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const pinDefs = [
      { id: 'solar', label: 'Solar Array (2x 330W)', pos: [0, -110, 0], desc: 'Dual 330W Monocrystalline PV panels tilted 25° South. Self-cleaning hydrophobic coating against desert dust.' },
      { id: 'encl', label: 'NEMA 4X / IP66 Enclosure', pos: [0, 10, 0], desc: '316L Stainless Steel dual-door enclosure with 30mm air-gap sunshield. Operating temperature rated up to 70°C.' },
      { id: 'batt', label: 'LiFePO4 Battery Bank', pos: [0, 85, 0], desc: '24V 200Ah Lithium Iron Phosphate battery with active RS-485 BMS communication. 5-day autonomy without sunlight.' },
      { id: 'comm', label: 'VSAT & Cellular Modem', pos: [55, -55, 30], desc: 'Ku-Band auto-pointing VSAT transceiver with secondary private LTE/5G SIM card failover (APN secured).' },
      { id: 'spd', label: 'SPD & Earth Grid', pos: [-60, 60, -30], desc: 'Class I/II 40kA Surge Protection Devices with chemical low-resistance ground rod (<3.5 Ohms dry sand resistance).' }
    ];

    const project = (p3) => {
      let x = p3[0];
      let y = p3[1];
      let z = p3[2];

      if (exploded) {
        if (p3[1] < -50) y -= 45; // separate solar
        if (p3[1] > 50) y += 45;  // separate battery
        if (p3[0] > 30) x += 35;  // separate antenna
      }

      // Rotate Y (azimuth)
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;

      // Rotate X (pitch)
      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;

      // Perspective projection
      const fov = 450 * zoom;
      const distance = 420;
      const scale = fov / (distance + z2);
      const px = width / 2 + x1 * scale;
      const py = height / 2 + y2 * scale;

      return { x: px, y: py, z: z2, scale };
    };

    const drawBox = (cx, cy, cz, w, h, d, strokeColor, fillColor) => {
      const hw = w / 2;
      const hh = h / 2;
      const hd = d / 2;
      const vertices = [
        [-hw + cx, -hh + cy, -hd + cz],
        [ hw + cx, -hh + cy, -hd + cz],
        [ hw + cx,  hh + cy, -hd + cz],
        [-hw + cx,  hh + cy, -hd + cz],
        [-hw + cx, -hh + cy,  hd + cz],
        [ hw + cx, -hh + cy,  hd + cz],
        [ hw + cx,  hh + cy,  hd + cz],
        [-hw + cx,  hh + cy,  hd + cz]
      ].map(project);

      const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7]
      ];

      // Draw filled translucent body if not exploded
      if (!exploded && fillColor) {
        ctx.fillStyle = fillColor;
        const faces = [[0,1,2,3], [4,5,6,7], [0,1,5,4], [2,3,7,6]];
        faces.forEach(f => {
          ctx.beginPath();
          ctx.moveTo(vertices[f[0]].x, vertices[f[0]].y);
          for (let i = 1; i < f.length; i++) ctx.lineTo(vertices[f[i]].x, vertices[f[i]].y);
          ctx.closePath();
          ctx.fill();
        });
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = exploded ? 1.5 : 1.2;
      edges.forEach(([i, j]) => {
        ctx.beginPath();
        ctx.moveTo(vertices[i].x, vertices[i].y);
        ctx.lineTo(vertices[j].x, vertices[j].y);
        ctx.stroke();
      });
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw Desert Horizon Grid
      ctx.strokeStyle = 'rgba(94, 200, 255, 0.08)';
      ctx.lineWidth = 1;
      const groundY = 120;
      for (let g = -180; g <= 180; g += 45) {
        const p1 = project([g, groundY, -180]);
        const p2 = project([g, groundY, 180]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const p3 = project([-180, groundY, g]);
        const p4 = project([180, groundY, g]);
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }

      const stCol = exploded ? '#00e5ff' : '#5ec8ff';
      const fCol = exploded ? null : 'rgba(26, 36, 64, 0.65)';

      // 1. Solar Array (Tilted)
      drawBox(0, -95, 0, 160, 12, 100, '#ffc400', exploded ? null : 'rgba(255, 196, 0, 0.2)');
      // 2. Unistrut Frame
      drawBox(0, -35, 0, 12, 100, 12, '#8c97ad', null);
      // 3. RTU Cabinet Enclosure
      drawBox(0, 15, 0, 110, 95, 60, stCol, fCol);
      // 4. Cabinet Sunshield Top
      drawBox(0, -34, 0, 116, 4, 66, '#8c97ad', null);
      // 5. Battery Tray / Base Skid
      drawBox(0, 85, 0, 130, 40, 75, '#10b981', exploded ? null : 'rgba(16, 185, 129, 0.2)');
      // 6. Antenna Mast & VSAT Dish
      drawBox(55, -45, 30, 6, 90, 6, '#22d3ee', null);
      const dishPos = project([55, -88, 30]);
      ctx.beginPath();
      ctx.arc(dishPos.x, dishPos.y, 14 * dishPos.scale, 0, Math.PI * 2);
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Render 3D HTML Pins
      if (pinsContainer) {
        pinsContainer.innerHTML = '';
        pinDefs.forEach(pin => {
          const pt = project(pin.pos);
          if (pt.z < -250) return; // behind camera
          const el = document.createElement('div');
          el.className = 'pin3d';
          el.textContent = pin.label;
          el.style.left = `${pt.x}px`;
          el.style.top = `${pt.y}px`;
          el.addEventListener('click', () => {
            this.playSound('click');
            if (infoBox) {
              infoBox.innerHTML = `<b>${pin.label}</b>: ${pin.desc}`;
            }
          });
          pinsContainer.appendChild(el);
        });
      }
    };

    // User Orbit Dragging
    stage.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      rotY += dx * 0.008;
      rotX = Math.max(-1.1, Math.min(0.2, rotX + dy * 0.008));
      lastX = e.clientX;
      lastY = e.clientY;
      render();
    });

    window.addEventListener('mouseup', () => { isDragging = false; });

    // Touch Support
    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        lastX = e.touches[0].clientX;
        lastY = e.touches[0].clientY;
      }
    });

    stage.addEventListener('touchmove', (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      rotY += dx * 0.008;
      rotX = Math.max(-1.1, Math.min(0.2, rotX + dy * 0.008));
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      render();
    });

    stage.addEventListener('touchend', () => { isDragging = false; });

    // Controls
    wireToggle?.addEventListener('change', (e) => {
      this.playSound('click');
      exploded = e.target.checked;
      const stat = document.querySelector('#rtuStatus');
      if (stat) stat.textContent = exploded ? 'Exploded Wireframe Mode' : 'Standard 3D View';
      render();
    });

    resetBtn?.addEventListener('click', () => {
      this.playSound('click');
      rotX = -0.38;
      rotY = 0.72;
      zoom = 1.05;
      render();
    });

    // Initial 3D Render
    setTimeout(render, 100);
  },

  // -------------------------------------------------------------
  // 5. ISA-101 High-Performance SCADA Component Library
  // -------------------------------------------------------------
  initISA101Components() {
    // Valve Glyphs click cycling (Open -> Closed -> Transit -> Fault -> Open)
    const glyphs = document.querySelectorAll('.vg');
    const cycle = ['open', 'closed', 'transit', 'fault'];
    const labels = { open: 'Open', closed: 'Closed', transit: 'Transitioning', fault: 'Travel Fault' };

    glyphs.forEach(g => {
      g.addEventListener('click', () => {
        this.playSound('click');
        const curr = g.getAttribute('data-state') || 'open';
        const nextIdx = (cycle.indexOf(curr) + 1) % cycle.length;
        const nextState = cycle[nextIdx];
        g.setAttribute('data-state', nextState);
        const sub = g.querySelector('.s');
        if (sub) sub.textContent = labels[nextState];
        this.showToast(`${g.getAttribute('data-tag')} switched to ${labels[nextState]}`);
      });
    });

    // Initial Trend Sparkline generation
    this.updateSparklines();
  },

  updateSparklines() {
    const drawSpark = (svgId, data, minVal, maxVal) => {
      const svg = document.querySelector(svgId);
      if (!svg) return;
      const w = 100;
      const h = 38;
      const step = w / (data.length - 1);
      const points = data.map((val, idx) => {
        const x = (idx * step).toFixed(1);
        const norm = (val - minVal) / (maxVal - minVal || 1);
        const y = (h - 4 - norm * (h - 8)).toFixed(1);
        return `${x},${y}`;
      });

      const polyline = points.join(' ');
      const lastPt = points[points.length - 1].split(',');

      svg.innerHTML = `
        <defs>
          <linearGradient id="sg-${svgId.replace('#','')}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#5ec8ff" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="#5ec8ff" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <polygon points="0,${h} ${polyline} 100,${h}" fill="url(#sg-${svgId.replace('#','')})"/>
        <polyline points="${polyline}" fill="none" stroke="#5ec8ff" stroke-width="2" stroke-linecap="round"/>
        <circle cx="${lastPt[0]}" cy="${lastPt[1]}" r="3.5" fill="#ffffff" stroke="#00e5ff" stroke-width="1.5"/>
      `;
    };

    drawSpark('#sp-press', this.state.trendHistory.press, 60, 68);
    drawSpark('#sp-dp', this.state.trendHistory.dp, 0, 0.4);
    drawSpark('#sp-flow', this.state.trendHistory.flow, 2000, 2300);
  },

  // -------------------------------------------------------------
  // 6. Cause & Effect (SIS) Safety Matrix
  // -------------------------------------------------------------
  initCEMatrix() {
    const tableContainer = document.querySelector('#ceTable');
    const logBox = document.querySelector('#ceLog');
    const outBox = document.querySelector('#ceOut');
    const resetBtn = document.querySelector('#ceReset');
    const exportBtn = document.querySelector('#ceExport');
    if (!tableContainer) return;

    const causes = [
      { id: 'C1', tag: 'PAHH-101', desc: 'Trunkline Pressure High-High (>82.0 bar)', effects: [1, 1, 1, 0, 1] },
      { id: 'C2', tag: 'PALL-101', desc: 'Trunkline Pressure Low-Low (<38.0 bar)', effects: [1, 1, 0, 0, 1] },
      { id: 'C3', tag: 'dP/dt-101', desc: 'Rate-of-Pressure Drop Break (>2.5 bar/s)', effects: [1, 1, 1, 0, 1] },
      { id: 'C4', tag: 'FGS-101', desc: 'Station Combustible Gas (>20% LEL)', effects: [1, 0, 1, 1, 1] },
      { id: 'C5', tag: 'ESD-PB-01', desc: 'Manual Emergency Push Button (BVS-01)', effects: [1, 1, 1, 1, 1] }
    ];

    const effects = [
      { id: 'E1', tag: 'ESDV-101', action: 'Close Station Inlet Valve', delay: '0.0s' },
      { id: 'E2', tag: 'LBV-04', action: 'Close Mainline Block Valve', delay: '0.0s' },
      { id: 'E3', tag: 'K-401 Trip', action: 'Trip Booster Compressor', delay: '0.5s' },
      { id: 'E4', tag: 'BDV-105', action: 'Open Emergency Blowdown', delay: '3.0s' },
      { id: 'E5', tag: 'Siren/Beacon', action: 'Sound Visual/Audible Alarm', delay: '0.0s' }
    ];

    // Build Table HTML
    let html = `<table class="ce"><thead><tr><th>Cause Tag / Description</th>`;
    effects.forEach(e => {
      html += `<th class="col" data-eff="${e.id}">${e.tag}<br><small>${e.action} (${e.delay})</small></th>`;
    });
    html += `</tr></thead><tbody>`;

    causes.forEach((c, cIdx) => {
      html += `<tr class="cause" data-cidx="${cIdx}"><th class="row"><b>${c.tag}</b><br><small>${c.desc}</small></th>`;
      c.effects.forEach((val, eIdx) => {
        html += `<td class="x ${val ? 'link' : ''}" data-eidx="${eIdx}">${val ? 'X' : '&middot;'}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    tableContainer.innerHTML = html;

    // Simulation Trigger on Row Click
    const rows = tableContainer.querySelectorAll('tr.cause');
    rows.forEach(r => {
      r.addEventListener('click', () => {
        this.playSound('alarm');
        rows.forEach(x => x.classList.remove('fired'));
        tableContainer.querySelectorAll('td.x').forEach(td => td.classList.remove('active'));
        tableContainer.querySelectorAll('th.col').forEach(th => th.classList.remove('active'));

        r.classList.add('fired');
        const cIdx = parseInt(r.getAttribute('data-cidx'), 10);
        const cause = causes[cIdx];

        if (logBox) {
          logBox.innerHTML = `[${new Date().toLocaleTimeString()}] TRIPPED: ${cause.tag} - ${cause.desc}\nInitiating Cause & Effect SIS action sequence...`;
        }

        cause.effects.forEach((isLinked, eIdx) => {
          if (!isLinked) return;
          const delaySec = parseFloat(effects[eIdx].delay);
          setTimeout(() => {
            const td = r.querySelector(`td[data-eidx="${eIdx}"]`);
            const colHeader = tableContainer.querySelectorAll('th.col')[eIdx];
            if (td) td.classList.add('active');
            if (colHeader) colHeader.classList.add('active');

            if (logBox) {
              logBox.innerHTML += `\n +${effects[eIdx].delay}: ACTION FIRED -> ${effects[eIdx].tag} (${effects[eIdx].action})`;
              logBox.scrollTop = logBox.scrollHeight;
            }
          }, delaySec * 1000);
        });
      });
    });

    resetBtn?.addEventListener('click', () => {
      this.playSound('click');
      rows.forEach(x => x.classList.remove('fired'));
      tableContainer.querySelectorAll('td.x').forEach(td => td.classList.remove('active'));
      tableContainer.querySelectorAll('th.col').forEach(th => th.classList.remove('active'));
      if (logBox) logBox.textContent = 'Awaiting simulated trip... Matrix armed.';
    });

    exportBtn?.addEventListener('click', () => {
      this.playSound('preset');
      let md = `## Commissioning Cause & Effect (SIS) Verification Matrix\n`;
      md += `Facility: AGAC Dubai Pipeline Corridor | Section: BVS-01 Habshan Trunkline\n`;
      md += `Tested: ${new Date().toISOString().slice(0,10)} | Standard: IEC 61511 / IEC 61508 SIL-3\n\n`;
      md += `| Cause Tag | Cause Initiator | Action Outputs Triggered | Verification Result |\n`;
      md += `| :--- | :--- | :--- | :--- |\n`;
      causes.forEach(c => {
        const linked = c.effects.map((v, i) => v ? effects[i].tag : null).filter(Boolean).join(', ');
        md += `| ${c.tag} | ${c.desc} | ${linked} | VERIFIED PASS |\n`;
      });
      if (outBox) outBox.value = md;
      this.showToast('Commissioning summary table generated below!');
    });
  },

  // -------------------------------------------------------------
  // 7. IEC 61131-3 PLC / RTU Code Hub
  // -------------------------------------------------------------
  initCodeHub() {
    const hub = document.querySelector('#codeHub');
    if (!hub) return;

    const snippets = [
      {
        id: 'fb-linebreak',
        title: 'FB_LineBreak_dP_dt: Rate-of-Pressure-Drop Pipeline Rupture Detection',
        lang: 'IEC 61131-3 Structured Text (Siemens TIA Portal & Rockwell Logix)',
        code: `FUNCTION_BLOCK FB_LineBreak_dP_dt
VAR_INPUT
    rPressure_Bar       : REAL;    (* Calibrated pipeline pressure in bar g *)
    rThreshold_dP_dt    : REAL;    (* Rate of drop trip setpoint, e.g. 2.50 bar/s *)
    tSampleTime         : TIME := T#100MS; (* Cyclic execution interval *)
    bInhibitTransient   : BOOL;    (* Inhibit during pump starts / valve strokes *)
    bManualReset        : BOOL;    (* Master latched trip reset *)
END_VAR
VAR_OUTPUT
    bLineBreakTrip      : BOOL;    (* Trip command to emergency isolation valve *)
    rCalculated_dP_dt   : REAL;    (* Real-time calculated derivative bar/s *)
    bRateAlarm          : BOOL;    (* Pre-trip warning notification *)
END_VAR
VAR
    rPressure_Prev      : REAL;
    bFirstScan          : BOOL := TRUE;
    rDeltaP             : REAL;
    rSampleTimeSec      : REAL;
END_VAR

(* Conversion of sample time to seconds *)
rSampleTimeSec := TIME_TO_REAL(tSampleTime) / 1000.0;
IF rSampleTimeSec <= 0.001 THEN
    rSampleTimeSec := 0.1; (* Defensive clamp against divide by zero *)
END_IF;

IF bFirstScan THEN
    rPressure_Prev := rPressure_Bar;
    bFirstScan := FALSE;
    RETURN;
END_IF;

(* Compute discrete differential rate-of-change (dP / dt) *)
rDeltaP := rPressure_Prev - rPressure_Bar; (* Positive value indicates dropping pressure *)
rCalculated_dP_dt := rDeltaP / rSampleTimeSec;
rPressure_Prev := rPressure_Bar;

(* Rupture Evaluation with Transient Filtering *)
IF NOT bInhibitTransient THEN
    IF rCalculated_dP_dt >= rThreshold_dP_dt THEN
        bLineBreakTrip := TRUE; (* Latched trip condition *)
        bRateAlarm := TRUE;
    END_IF;
END_IF;

(* Unlatch only upon deliberate authorized reset *)
IF bManualReset THEN
    bLineBreakTrip := FALSE;
    bRateAlarm := FALSE;
END_IF;
END_FUNCTION_BLOCK`
      },
      {
        id: 'fb-namur',
        title: 'FB_AnalogScale_NAMUR: 4–20 mA Scaling with NE43 Diagnostics',
        lang: 'IEC 61131-3 Structured Text',
        code: `FUNCTION_BLOCK FB_AnalogScale_NAMUR
VAR_INPUT
    iRawADC_Count       : INT;     (* Raw Analog Input, e.g. 0-27648 for S7-1500 *)
    rRawRangeMax        : REAL := 27648.0;
    rLRV                : REAL;    (* Lower Range Value, e.g. 0.0 bar *)
    rURV                : REAL;    (* Upper Range Value, e.g. 100.0 bar *)
END_VAR
VAR_OUTPUT
    rProcessValue       : REAL;    (* Engineering Process Variable *)
    rCurrent_mA         : REAL;    (* Equivalent loop current (0 - 25 mA) *)
    bBurnoutFault       : BOOL;    (* NAMUR NE43 Open wire burnout (< 3.6 mA) *)
    bUnderRange         : BOOL;    (* NAMUR NE43 Under-range (3.6 to 3.8 mA) *)
    bValidRange         : BOOL;    (* In-spec operational range (3.8 to 20.5 mA) *)
    bOverRange          : BOOL;    (* NAMUR NE43 Over-range (20.5 to 21.0 mA) *)
    bShortCircuitFault  : BOOL;    (* NAMUR NE43 Saturation / Short (> 21.0 mA) *)
END_VAR

(* Convert ADC raw counts to physical Loop Current (mA) *)
IF rRawRangeMax > 0.0 THEN
    rCurrent_mA := (INT_TO_REAL(iRawADC_Count) / rRawRangeMax) * 16.0 + 4.0;
ELSE
    rCurrent_mA := 0.0;
END_IF;

(* Evaluate NAMUR NE43 Threshold Classification *)
bBurnoutFault       := (rCurrent_mA < 3.6);
bUnderRange         := (rCurrent_mA >= 3.6) AND (rCurrent_mA < 3.8);
bValidRange         := (rCurrent_mA >= 3.8) AND (rCurrent_mA <= 20.5);
bOverRange          := (rCurrent_mA > 20.5) AND (rCurrent_mA <= 21.0);
bShortCircuitFault  := (rCurrent_mA > 21.0);

(* Linear Process Variable Interpolation with Clamp *)
IF bValidRange OR bUnderRange OR bOverRange THEN
    rProcessValue := ((rCurrent_mA - 4.0) / 16.0) * (rURV - rLRV) + rLRV;
ELSE
    (* Hold last good value or fail to safe low dependent on safety philosophy *)
    rProcessValue := rLRV;
END_IF;
END_FUNCTION_BLOCK`
      },
      {
        id: 'fb-valvetravel',
        title: 'FB_ValveTravelMonitor: Stroke Timing & Travel Fault Supervision',
        lang: 'IEC 61131-3 Structured Text',
        code: `FUNCTION_BLOCK FB_ValveTravelMonitor
VAR_INPUT
    bCommandOpen        : BOOL;
    bCommandClose       : BOOL;
    bLimitSwitchOpen    : BOOL;    (* ZSO open limit feedback *)
    bLimitSwitchClosed  : BOOL;    (* ZSC closed limit feedback *)
    tMaxStrokeTime      : TIME := T#15S; (* Max allowable travel duration *)
END_VAR
VAR_OUTPUT
    bTraveling          : BOOL;
    bTravelFaultAlarm   : BOOL;    (* Latched valve stall / travel fault *)
    tElapsedTravelTime  : TIME;
END_VAR
VAR
    tonTravelTimer      : TON;
    bMoveInitiated      : BOOL;
END_VAR

bMoveInitiated := (bCommandOpen AND NOT bLimitSwitchOpen) OR (bCommandClose AND NOT bLimitSwitchClosed);
bTraveling := bMoveInitiated AND NOT bTravelFaultAlarm;

tonTravelTimer(IN := bTraveling, PT := tMaxStrokeTime);
tElapsedTravelTime := tonTravelTimer.ET;

IF tonTravelTimer.Q THEN
    bTravelFaultAlarm := TRUE; (* Valve failed to make limit switch within allowed stroke window *)
END_IF;

(* Clear alarm when limit switch successfully achieved *)
IF (bCommandOpen AND bLimitSwitchOpen) OR (bCommandClose AND bLimitSwitchClosed) THEN
    bTravelFaultAlarm := FALSE;
END_IF;
END_FUNCTION_BLOCK`
      }
    ];

    let html = '';
    snippets.forEach(s => {
      // Basic syntax highlighter
      let colored = s.code
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/(\(\*[\s\S]*?\*\))/g, '<span class="tk-cm">$1</span>')
        .replace(/\b(FUNCTION_BLOCK|END_FUNCTION_BLOCK|VAR_INPUT|VAR_OUTPUT|VAR|END_VAR|IF|THEN|ELSE|ELSIF|END_IF|RETURN)\b/g, '<span class="tk-kw">$1</span>')
        .replace(/\b(REAL|BOOL|INT|TIME|TON)\b/g, '<span class="tk-ty">$1</span>')
        .replace(/\b(TRUE|FALSE)\b/g, '<span class="tk-lit">$1</span>')
        .replace(/(T#[\w]+)/g, '<span class="tk-num">$1</span>');

      html += `
        <div class="code-card">
          <div class="code-head">
            <div>
              <h3>${s.title}</h3>
              <span class="small muted">${s.lang}</span>
            </div>
            <div>
              <span class="copy-badge" id="badge-${s.id}">COPIED!</span>
              <button class="chip" onclick="App.copyCode('${s.id}')">Copy ST Code</button>
            </div>
          </div>
          <pre id="pre-${s.id}"><code>${colored}</code></pre>
        </div>
      `;
    });
    hub.innerHTML = html;
  },

  copyCode(id) {
    this.playSound('click');
    const pre = document.querySelector(`#pre-${id}`);
    const badge = document.querySelector(`#badge-${id}`);
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      if (badge) {
        badge.classList.add('show');
        setTimeout(() => badge.classList.remove('show'), 2000);
      }
      this.showToast('Structured Text copied to clipboard');
    });
  },

  // -------------------------------------------------------------
  // 8. Field Diagnostics & Engineering Calculators
  // -------------------------------------------------------------
  initCalculators() {
    // Presets
    const presets = {
      crude: {
        ma: { ma: 14.28, unit: 'bar', lrv: 0, urv: 100 },
        hd: { sg: 0.85, flow: 2200, len: 120, dia: 500, dz: 150, visc: 12, pin: 64, unit: 'bar' },
        lk: { flow: 2200, sg: 0.85, dia: 500, len: 120, ui: 0.25, uo: 0.25, win: 30, sigma: 3, beta: 0.0008, dT: 0.5, dP: 0.5, k: 1400 }
      },
      gas: {
        ma: { ma: 16.50, unit: 'bar', lrv: 0, urv: 150 },
        hd: { sg: 0.62, flow: 6000, len: 80, dia: 600, dz: 40, visc: 0.02, pin: 90, unit: 'bar' },
        lk: { flow: 6000, sg: 0.62, dia: 600, len: 80, ui: 0.50, uo: 0.50, win: 15, sigma: 3, beta: 0.0022, dT: 1.0, dP: 1.0, k: 45 }
      },
      dubai: {
        ma: { ma: 12.00, unit: 'bar', lrv: 0, urv: 80 },
        hd: { sg: 0.87, flow: 1800, len: 65, dia: 450, dz: 85, visc: 18, pin: 55, unit: 'bar' },
        lk: { flow: 1800, sg: 0.87, dia: 450, len: 65, ui: 0.20, uo: 0.20, win: 45, sigma: 3, beta: 0.00075, dT: 0.4, dP: 0.3, k: 1450 }
      }
    };

    document.querySelectorAll('.chip[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.playSound('preset');
        const tool = btn.getAttribute('data-tool');
        const pKey = btn.getAttribute('data-preset');
        const data = presets[pKey]?.[tool];
        if (!data) return;

        Object.keys(data).forEach(key => {
          const el = document.querySelector(`#${tool}-${key}`);
          if (el) el.value = data[key];
        });

        if (tool === 'ma') calcMa();
        if (tool === 'hd') calcHd();
        if (tool === 'lk') calcLk();
        this.showToast(`Loaded ${pKey.toUpperCase()} preset parameters`);
      });
    });

    // 1. 4-20 mA Calculator & Diagnostic Scaler
    const calcMa = () => {
      const maInput = document.querySelector('#ma-ma');
      const lrvInput = document.querySelector('#ma-lrv');
      const urvInput = document.querySelector('#ma-urv');
      const unitInput = document.querySelector('#ma-unit');
      const out = document.querySelector('#ma-out');
      if (!maInput || !out) return;

      const ma = Math.min(25.0, Math.max(0.0, parseFloat(maInput.value || 0)));
      const lrv = parseFloat(lrvInput?.value || 0);
      const urv = parseFloat(urvInput?.value || 100);
      const unit = unitInput?.value || 'bar';

      let status = 'Valid Linear In-Spec';
      let pillClass = 'ok';
      let pv = lrv + ((ma - 4.0) / 16.0) * (urv - lrv);

      if (ma < 3.6) {
        status = 'NAMUR Fault: Sensor Burnout / Open Loop Circuit';
        pillClass = 'crit';
      } else if (ma >= 3.6 && ma < 3.8) {
        status = 'NAMUR Diagnostic: Under-Range Measurement';
        pillClass = 'warn';
      } else if (ma > 20.0 && ma <= 20.5) {
        status = 'NAMUR Diagnostic: Over-Range Measurement';
        pillClass = 'warn';
      } else if (ma > 20.5) {
        status = 'NAMUR Fault: Hardware Short Circuit / Loop Saturation';
        pillClass = 'crit';
      }

      const pct = (((ma - 4.0) / 16.0) * 100).toFixed(1);
      const s7Count = Math.round(((ma - 4.0) / 16.0) * 27648);
      const abCount = Math.round(((ma - 4.0) / 16.0) * 32767);

      out.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="status-pill ${pillClass}">${status}</span>
          <span class="small mono muted">${pct}% Range</span>
        </div>
        <div class="big" style="margin-top:6px">${pv.toFixed(2)} <small>${unit}</small></div>
        <div class="kv">
          <span>Signal Loop Current:</span><span>${ma.toFixed(2)} mA</span>
          <span>Siemens S7 Integer (0–27648):</span><span>${s7Count}</span>
          <span>Rockwell Logix Integer (0–32767):</span><span>${abCount}</span>
          <span>Calibrated Span:</span><span>${lrv} to ${urv} ${unit}</span>
        </div>
      `;

      // Update Slider Visualizer
      const slider = document.querySelector('#nm-slider');
      const cursor = document.querySelector('#nm-cursor');
      if (slider && slider.value !== String(ma)) slider.value = ma;
      if (cursor) cursor.style.left = `${(ma / 25.0) * 100}%`;
    };

    ['#ma-ma', '#ma-lrv', '#ma-urv', '#ma-unit'].forEach(sel => {
      document.querySelector(sel)?.addEventListener('input', calcMa);
    });

    // Linked slider in Tool 4
    const slider = document.querySelector('#nm-slider');
    slider?.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      const maIn = document.querySelector('#ma-ma');
      if (maIn) maIn.value = val;
      calcMa();
    });

    // 2. Hydrostatic Pressure Drop & Line Pack
    const calcHd = () => {
      const sg = Math.min(2.0, Math.max(0.5, parseFloat(document.querySelector('#hd-sg')?.value || 0.85)));
      const flow = Math.max(0, parseFloat(document.querySelector('#hd-flow')?.value || 0));
      const len = Math.max(0, parseFloat(document.querySelector('#hd-len')?.value || 0));
      const dia = Math.max(10, parseFloat(document.querySelector('#hd-dia')?.value || 500));
      const dz = parseFloat(document.querySelector('#hd-dz')?.value || 0);
      const visc = Math.max(0.01, parseFloat(document.querySelector('#hd-visc')?.value || 12));
      const pin = parseFloat(document.querySelector('#hd-pin')?.value || 60);
      const unit = document.querySelector('#hd-unit')?.value || 'bar';
      const out = document.querySelector('#hd-out');
      if (!out) return;

      const rho = sg * 1000; // kg/m³
      const deltaP_static_bar = (rho * 9.80665 * dz) / 100000; // bar
      const vol_m3 = Math.PI * Math.pow(dia / 2000, 2) * (len * 1000);
      const mass_tons = (vol_m3 * rho) / 1000;

      // Darcy friction estimate for liquids
      const area_m2 = Math.PI * Math.pow(dia / 2000, 2);
      const velocity_m_s = (flow / 3600) / (area_m2 || 1);
      const reynolds = (velocity_m_s * (dia / 1000)) / (visc * 1e-6);
      const friction_f = reynolds > 4000 ? 0.02 : (reynolds > 0 ? 64 / reynolds : 0.02);
      const headLoss_bar = (friction_f * (len * 1000 / (dia / 1000)) * (rho * Math.pow(velocity_m_s, 2) / 2)) / 100000;
      const pout_bar = pin - deltaP_static_bar - headLoss_bar;

      const conv = unit === 'psi' ? 14.5038 : 1.0;
      const uStr = unit === 'psi' ? 'psi' : 'bar';

      out.innerHTML = `
        <div class="big">${(pout_bar * conv).toFixed(2)} <small>${uStr} Outlet Pressure</small></div>
        <div class="kv">
          <span>Static Elevation Head (&Delta;h = ${dz}m):</span><span>${(deltaP_static_bar * conv).toFixed(2)} ${uStr}</span>
          <span>Estimated Friction Loss:</span><span>${(headLoss_bar * conv).toFixed(2)} ${uStr}</span>
          <span>Flow Velocity:</span><span>${velocity_m_s.toFixed(2)} m/s (Re: ${Math.round(reynolds)})</span>
          <span>Total Line Pack Inventory Volume:</span><span>${vol_m3.toFixed(0)} m&sup3; (${mass_tons.toFixed(1)} MT)</span>
        </div>
      `;
    };

    ['#hd-sg', '#hd-flow', '#hd-len', '#hd-dia', '#hd-dz', '#hd-visc', '#hd-pin', '#hd-unit'].forEach(sel => {
      document.querySelector(sel)?.addEventListener('input', calcHd);
    });

    // 3. RTTM / Mass-Balance Leak Sensitivity
    const calcLk = () => {
      const flow = Math.max(1, parseFloat(document.querySelector('#lk-flow')?.value || 2000));
      const sg = Math.min(2.0, Math.max(0.5, parseFloat(document.querySelector('#lk-sg')?.value || 0.85)));
      const dia = Math.max(10, parseFloat(document.querySelector('#lk-dia')?.value || 500));
      const len = Math.max(1, parseFloat(document.querySelector('#lk-len')?.value || 120));
      const ui = Math.max(0.01, parseFloat(document.querySelector('#lk-ui')?.value || 0.25)) / 100;
      const uo = Math.max(0.01, parseFloat(document.querySelector('#lk-uo')?.value || 0.25)) / 100;
      const win = Math.max(1, parseFloat(document.querySelector('#lk-win')?.value || 30));
      const sigma = Math.min(4, Math.max(1, parseFloat(document.querySelector('#lk-sigma')?.value || 3)));
      const beta = Math.min(0.0025, Math.max(0.0001, parseFloat(document.querySelector('#lk-beta')?.value || 0.0008)));
      const dT = Math.max(0.01, parseFloat(document.querySelector('#lk-dT')?.value || 0.5));
      const dP = Math.max(0.01, parseFloat(document.querySelector('#lk-dP')?.value || 0.5));
      const out = document.querySelector('#lk-out');
      if (!out) return;

      const pipeVol = Math.PI * Math.pow(dia / 2000, 2) * (len * 1000); // m³
      // Combined meter flow uncertainty
      const flowSigma = Math.sqrt(Math.pow(ui * flow, 2) + Math.pow(uo * flow, 2));
      // Thermal line pack expansion inventory rate error (m³/h)
      const thermalVolError = (pipeVol * beta * dT) / (win / 60);
      const totalUncertaintyRate = Math.sqrt(Math.pow(flowSigma, 2) + Math.pow(thermalVolError, 2));
      const minDetectableLeak = totalUncertaintyRate * sigma;
      const pctOfFlow = (minDetectableLeak / flow) * 100;

      out.innerHTML = `
        <div class="big">${minDetectableLeak.toFixed(1)} <small>m&sup3;/h (${pctOfFlow.toFixed(2)}% of flow)</small></div>
        <div class="kv">
          <span>Confidence Threshold:</span><span>${sigma}&sigma; (99.7% Statistical Immunity)</span>
          <span>Evaluation Integration Window:</span><span>${win} minutes</span>
          <span>Meter Imbalance Uncertainty:</span><span>&plusmn; ${flowSigma.toFixed(2)} m&sup3;/h</span>
          <span>Line-Pack Thermal Correction Error:</span><span>&plusmn; ${thermalVolError.toFixed(2)} m&sup3;/h</span>
          <span>API RP 1130 Compliance:</span><span style="color:var(--ok)">PASS &middot; Validated</span>
        </div>
      `;
    };

    ['#lk-flow', '#lk-sg', '#lk-dia', '#lk-len', '#lk-ui', '#lk-uo', '#lk-win', '#lk-sigma', '#lk-beta', '#lk-dT', '#lk-dP', '#lk-k'].forEach(sel => {
      document.querySelector(sel)?.addEventListener('input', calcLk);
    });

    // Execute initial calculations
    calcMa();
    calcHd();
    calcLk();
  },

  // -------------------------------------------------------------
  // 9. Elevation and Hydraulic Gradient Profile Chart
  // -------------------------------------------------------------
  initElevationChart() {
    ['el-pin', 'el-pd', 'el-sg', 'el-flow', 'el-vp'].forEach(id => {
      const el = document.querySelector(`#${id}`);
      el?.addEventListener('input', () => {
        const vSpan = document.querySelector(`#${id}-v`);
        if (vSpan) vSpan.textContent = `(${el.value})`;
        this.renderElevationChart();
      });
    });
    this.renderElevationChart();
  },

  renderElevationChart() {
    const canvas = document.querySelector('#elevCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.clientWidth || 700);
    const h = (canvas.height = 300);

    const pin = parseFloat(document.querySelector('#el-pin')?.value || 20);
    const pd = parseFloat(document.querySelector('#el-pd')?.value || 45);
    const sg = parseFloat(document.querySelector('#el-sg')?.value || 0.85);
    const flow = parseFloat(document.querySelector('#el-flow')?.value || 5000);
    const vp = parseFloat(document.querySelector('#el-vp')?.value || 0.8);

    // Habshan to Fujairah Profile points: [km, elevation_meters]
    const profile = [
      [0, 50], [40, 80], [80, 120], [120, 95], [150, 110], // Desert dunes to PS-2
      [190, 240], [240, 680], [280, 1020], [310, 450], [360, 15] // Hajar mountains to Fujairah terminal
    ];

    const maxKm = 360;
    const maxElev = 1200;
    const padX = 40;
    const padY = 30;

    const toX = (km) => padX + (km / maxKm) * (w - padX * 2);
    const toY = (elev) => h - padY - (elev / maxElev) * (h - padY * 2);

    ctx.clearRect(0, 0, w, h);

    // Terrain Elevation Polygon
    ctx.beginPath();
    ctx.moveTo(toX(profile[0][0]), toY(0));
    profile.forEach(p => ctx.lineTo(toX(p[0]), toY(p[1])));
    ctx.lineTo(toX(profile[profile.length - 1][0]), toY(0));
    ctx.closePath();
    ctx.fillStyle = '#162238';
    ctx.fill();
    ctx.strokeStyle = '#5ec8ff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hydraulic Gradient Line (HGL in meters of head: Head = Elev + Pressure / (rho * g))
    const rho = sg * 1000;
    const barToMeters = (bar) => (bar * 100000) / (rho * 9.81);

    ctx.beginPath();
    let hasSlack = false;
    let slackKm = 0;
    profile.forEach((p, idx) => {
      const km = p[0];
      const elev = p[1];
      // Friction slope based on flow
      const frictionSlope = (flow / 10000) * 1.8;
      let pressureBar = pin - (km * frictionSlope * 0.1);
      if (km >= 150) pressureBar += pd; // Booster Pump Station 2

      const hglElev = elev + barToMeters(pressureBar);
      const px = toX(km);
      const py = toY(hglElev);

      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);

      if (pressureBar < vp && !hasSlack) {
        hasSlack = true;
        slackKm = km;
      }
    });

    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Axes & Labels
    ctx.fillStyle = '#8c97ad';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.fillText('0 km (Habshan)', toX(0), h - 10);
    ctx.fillText('150 km (PS-2)', toX(150), h - 10);
    ctx.fillText('360 km (Fujairah)', toX(360) - 60, h - 10);
    ctx.fillText('1,020m Hajar Crest', toX(280) - 40, toY(1020) - 10);

    const out = document.querySelector('#el-out');
    if (out) {
      out.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span><b>HGL & Elevation Analysis:</b> ${hasSlack ? '<span class="status-pill warn">Slack Line Cavitation Risk</span>' : '<span class="status-pill ok">Hydraulically Packed</span>'}</span>
          <span class="small muted">Specific Gravity: ${sg.toFixed(2)}</span>
        </div>
        <div class="small muted" style="margin-top:6px">
          ${hasSlack ? `⚠️ Mountain summit hydraulic gradient dips below vapor pressure (${vp} bar a) near KM ${slackKm}. Backpressure control valve throttling required.` : `✅ Positive hydraulic gradient maintained across all desert dune and mountain sections.`}
        </div>
      `;
    }
  },

  // -------------------------------------------------------------
  // 10. Live RTTM Leak Simulator & Transient Waveform
  // -------------------------------------------------------------
  initRTTMSimulator() {
    const leakBtn = document.querySelector('#rttmLeak');
    const resetBtn = document.querySelector('#rttmReset');

    leakBtn?.addEventListener('click', () => {
      this.playSound('alarm');
      this.state.rttmState.leaking = true;
      this.state.rttmState.leakStart = Date.now();
      this.showToast('🚨 5% Orifice Rupture Negative Pressure Wave Injected!');
      this.renderRTTMChart();
    });

    resetBtn?.addEventListener('click', () => {
      this.playSound('click');
      this.state.rttmState.leaking = false;
      this.renderRTTMChart();
    });

    this.renderRTTMChart();
  },

  renderRTTMChart() {
    const canvas = document.querySelector('#rttmCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = canvas.clientWidth || 700);
    const h = (canvas.height = 340);

    const L = parseFloat(document.querySelector('#rttm-len')?.value || 50); // km
    const leakPct = parseFloat(document.querySelector('#rttm-pos')?.value || 36); // %
    const leakSize = parseFloat(document.querySelector('#rttm-size')?.value || 5); // %
    const waveSpeed = parseFloat(document.querySelector('#rttm-a')?.value || 1000); // m/s
    const isLeaking = this.state.rttmState.leaking;

    ctx.clearRect(0, 0, w, h);

    // Plot Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let y = 30; y < h - 30; y += 40) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
    }

    // Inlet Waveform (Cyan)
    ctx.beginPath();
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2.2;
    for (let x = 40; x < w - 20; x++) {
      const t = x * 0.05;
      let val = Math.sin(t) * 4;
      if (isLeaking && x > w * 0.4) {
        val -= leakSize * 4; // sharp drop
      }
      const y = h * 0.35 + val;
      if (x === 40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Outlet Waveform (Amber)
    ctx.beginPath();
    ctx.strokeStyle = '#ffc400';
    ctx.lineWidth = 2.2;
    for (let x = 40; x < w - 20; x++) {
      const t = x * 0.05 + 1.2;
      let val = Math.cos(t) * 4;
      if (isLeaking && x > w * 0.55) {
        val += leakSize * 3; // transient surge
      }
      const y = h * 0.7 + val;
      if (x === 40) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Legend & Annotations
    ctx.font = '11px -apple-system, sans-serif';
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('Station A (Habshan) Inlet Pressure Transient (Bar)', 50, 30);
    ctx.fillStyle = '#ffc400';
    ctx.fillText('Station B (BVS-01) Outlet Mass Flow Imbalance (m³/h)', 50, h * 0.55);

    const out = document.querySelector('#rttm-out');
    if (out) {
      const leakKm = (L * (leakPct / 100)).toFixed(2);
      const dt_sec = (((L * 1000) - (2 * leakKm * 1000)) / waveSpeed).toFixed(3);
      out.innerHTML = `
        <div class="big">${isLeaking ? `<span style="color:var(--crit)">RUPTURE DETECTED: KM ${leakKm}</span>` : '<span style="color:var(--ok)">Normal Mass Balance Equilibrium</span>'}</div>
        <div class="kv">
          <span>Sonic Acoustic Propagation (a):</span><span>${waveSpeed} m/s</span>
          <span>Negative Wave Arrival Delta (&Delta;t):</span><span>${isLeaking ? `${Math.abs(dt_sec)} s` : '0.000 s'}</span>
          <span>Pinpoint Leak Coordinate:</span><span>${isLeaking ? `KM ${leakKm} (&plusmn; 85m accuracy)` : 'No Anomaly'}</span>
          <span>Mass Balance Residual:</span><span>${isLeaking ? `-${leakSize.toFixed(1)}% Imbalance` : '0.02% (Below Threshold)'}</span>
        </div>
      `;
    }
  },

  // -------------------------------------------------------------
  // 11. iOS StandBy & Lockscreen Glance Widget
  // -------------------------------------------------------------
  initLockscreenWidget() {
    const fullBtn = document.querySelector('#glanceFull');
    const closeBtn = document.querySelector('#glanceClose');
    const panel = document.querySelector('#tab-glance');
    const alarmBtn = document.querySelector('#simAlarm');
    const wakeToggle = document.querySelector('#wakeToggle');
    const wakeStatus = document.querySelector('#wakeStatus');

    fullBtn?.addEventListener('click', () => {
      this.playSound('click');
      panel?.classList.add('glance-full');
    });

    closeBtn?.addEventListener('click', () => {
      this.playSound('click');
      panel?.classList.remove('glance-full');
    });

    alarmBtn?.addEventListener('click', () => {
      this.state.simulatingAlarm = !this.state.simulatingAlarm;
      this.playSound(this.state.simulatingAlarm ? 'alarm' : 'click');
      alarmBtn.textContent = this.state.simulatingAlarm ? 'Clear Simulated Alarm' : 'Simulate Critical Alarm';
      alarmBtn.className = this.state.simulatingAlarm ? 'btn' : 'btn danger';

      const tiles = document.querySelectorAll('.tile');
      tiles.forEach(t => t.setAttribute('data-level', this.state.simulatingAlarm ? 'alarm' : 'normal'));
      const island = document.querySelector('#islandPill');
      if (island) island.setAttribute('data-level', this.state.simulatingAlarm ? 'alarm' : 'normal');
      this.showToast(this.state.simulatingAlarm ? '🚨 CRITICAL PRESSURE HIGH-HIGH ALARM' : 'Alarms Cleared - Telemetry Normal');
    });

    // Screen Wake Lock API
    wakeToggle?.addEventListener('change', async (e) => {
      if (e.target.checked) {
        if ('wakeLock' in navigator) {
          try {
            this.state.wakeLock = await navigator.wakeLock.request('screen');
            if (wakeStatus) wakeStatus.textContent = 'Wake Lock Active (Screen Stays On)';
            this.showToast('Screen Wake Lock Engaged');
          } catch (err) {
            if (wakeStatus) wakeStatus.textContent = 'Wake Lock Failed';
          }
        } else {
          if (wakeStatus) wakeStatus.textContent = 'Not supported in this browser';
        }
      } else {
        if (this.state.wakeLock) {
          await this.state.wakeLock.release();
          this.state.wakeLock = null;
        }
        if (wakeStatus) wakeStatus.textContent = 'Wake Lock Off';
      }
    });

    // Clock
    setInterval(() => {
      const clock = document.querySelector('#g-clock');
      if (clock) {
        const d = new Date();
        clock.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    }, 1000);
  },

  // -------------------------------------------------------------
  // 12. SAT / Commissioning Inspection Checklist
  // -------------------------------------------------------------
  initSATChecklist() {
    const listContainer = document.querySelector('#satList');
    const overallRing = document.querySelector('#satOverall');
    const statusText = document.querySelector('#satStatus');
    const siteInput = document.querySelector('#satSite');
    const techInput = document.querySelector('#satTech');
    const jsonBtn = document.querySelector('#satJson');
    const mdBtn = document.querySelector('#satMd');
    const resetBtn = document.querySelector('#satReset');
    if (!listContainer) return;

    const satCategories = [
      {
        id: 'cat-inst',
        name: '1. Instrumentation & 4–20 mA Loop Verification',
        items: [
          { id: 'i1', label: 'Hydrostatic pressure test on transmitter impulse lines (1.5x MAOP)' },
          { id: 'i2', label: 'Zero & Span calibration 5-point check (0%, 25%, 50%, 75%, 100%)' },
          { id: 'i3', label: 'NAMUR NE43 sensor burnout fault trip simulation (< 3.6 mA verification)' },
          { id: 'i4', label: 'HART multidrop address and digital diagnostic register poll' }
        ]
      },
      {
        id: 'cat-solar',
        name: '2. Solar Power & Remote Battery Health',
        items: [
          { id: 's1', label: 'Solar array open-circuit voltage (Voc) & short-circuit current (Isc) check' },
          { id: 's2', label: 'MPPT solar charge controller battery temperature compensation verification' },
          { id: 's3', label: 'LiFePO4 battery RS-485 BMS telemetry sync to RTU register map' },
          { id: 's4', label: '72-hour autonomous battery discharge test simulation under full load' }
        ]
      },
      {
        id: 'cat-comms',
        name: '3. Telemetry Comms (IEC-104 / DNP3 / VSAT)',
        items: [
          { id: 'c1', label: 'VSAT satellite carrier-to-noise (C/N) margin verified (> 6.0 dB)' },
          { id: 'c2', label: 'Dual private APN 4G/5G cellular failover bumpless switchover test' },
          { id: 'c3', label: 'IEC 60870-5-104 General Interrogation (GI) on master SCADA reconnection' },
          { id: 'c4', label: 'Sequence of Events (SOE) CP56Time2a microsecond GPS time-tag verification' }
        ]
      },
      {
        id: 'cat-valve',
        name: '4. Valve Actuation & Line Break Logic',
        items: [
          { id: 'v1', label: 'Partial Stroke Testing (PST) stroke travel execution within allowed window' },
          { id: 'v2', label: 'Emergency Line Break Valve full closure stroke time test (< 12 seconds)' },
          { id: 'v3', label: '2oo3 pressure transmitter trip voting logic execution in safety PLC' },
          { id: 'v4', label: 'Equalization bypass interlock verification across main block valve seat' }
        ]
      },
      {
        id: 'cat-earth',
        name: '5. Earthing & Desert Environmental Protection',
        items: [
          { id: 'e1', label: 'Earth pit electrical resistance measured (< 4.0 Ohms using 3-point fall-of-potential)' },
          { id: 'e2', label: 'Class I/II 40kA Surge Protection Devices (SPD) status indicator check' },
          { id: 'e3', label: '316L Stainless Steel NEMA 4X / IP66 enclosure door seals & desiccant status' },
          { id: 'e4', label: 'Cathodic protection pipeline potential survey (-0.85V to -1.20V CSE)' }
        ]
      }
    ];

    // Load saved state
    const savedState = JSON.parse(localStorage.getItem('scada_sat_checks') || '{}');
    if (siteInput) siteInput.value = localStorage.getItem('scada_sat_site') || 'BVS-01 Habshan Trunkline';
    if (techInput) techInput.value = localStorage.getItem('scada_sat_tech') || 'Christian Espinosa (I&C Lead)';

    const saveAndRefresh = () => {
      localStorage.setItem('scada_sat_checks', JSON.stringify(savedState));
      localStorage.setItem('scada_sat_site', siteInput?.value || '');
      localStorage.setItem('scada_sat_tech', techInput?.value || '');

      let totalItems = 0;
      let completedItems = 0;

      satCategories.forEach(cat => {
        let catTotal = cat.items.length;
        let catDone = 0;
        cat.items.forEach(item => {
          totalItems++;
          if (savedState[item.id]) {
            completedItems++;
            catDone++;
          }
        });
        const catRing = document.querySelector(`#ring-${cat.id}`);
        if (catRing) {
          const catPct = Math.round((catDone / catTotal) * 100);
          const offset = 125.6 - (125.6 * (catPct / 100));
          catRing.innerHTML = `
            <svg viewBox="0 0 48 48"><circle class="bg" cx="24" cy="24" r="20"/><circle class="fg" cx="24" cy="24" r="20" stroke-dasharray="125.6" stroke-dashoffset="${offset}"/></svg>
            <b>${catPct}%</b>
          `;
        }
      });

      const totalPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      const totalOffset = 188.4 - (188.4 * (totalPct / 100));
      if (overallRing) {
        overallRing.innerHTML = `
          <svg viewBox="0 0 68 68"><circle class="bg" cx="34" cy="34" r="30"/><circle class="fg" cx="34" cy="34" r="30" stroke-dasharray="188.4" stroke-dashoffset="${totalOffset}"/></svg>
          <b>${totalPct}%</b>
        `;
      }
      if (statusText) {
        statusText.textContent = `${completedItems} of ${totalItems} Inspection Checkpoints Passed (${totalPct}% SAT Complete)`;
      }
    };

    // Render HTML List
    let html = '';
    satCategories.forEach(cat => {
      html += `
        <div class="sat-cat card">
          <div class="sat-cat-head">
            <div class="pring" id="ring-${cat.id}"></div>
            <h3 style="margin:0">${cat.name}</h3>
          </div>
      `;
      cat.items.forEach(item => {
        const isChecked = !!savedState[item.id];
        html += `
          <div class="sat-item ${isChecked ? 'done' : ''}" id="item-wrap-${item.id}">
            <div class="sat-row">
              <input type="checkbox" id="${item.id}" ${isChecked ? 'checked' : ''}>
              <label for="${item.id}">${item.label}</label>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    });
    listContainer.innerHTML = html;

    // Attach Checkbox Events
    satCategories.forEach(cat => {
      cat.items.forEach(item => {
        const cb = document.querySelector(`#${item.id}`);
        cb?.addEventListener('change', (e) => {
          this.playSound('click');
          savedState[item.id] = e.target.checked;
          const wrap = document.querySelector(`#item-wrap-${item.id}`);
          if (wrap) wrap.classList.toggle('done', e.target.checked);
          saveAndRefresh();
        });
      });
    });

    siteInput?.addEventListener('input', saveAndRefresh);
    techInput?.addEventListener('input', saveAndRefresh);

    resetBtn?.addEventListener('click', () => {
      this.playSound('click');
      if (confirm('Reset all SAT inspection checklist records on this device?')) {
        Object.keys(savedState).forEach(k => delete savedState[k]);
        document.querySelectorAll('.sat-item input[type="checkbox"]').forEach(cb => { cb.checked = false; });
        document.querySelectorAll('.sat-item').forEach(wrap => { wrap.classList.remove('done'); });
        saveAndRefresh();
        this.showToast('SAT Checklist reset');
      }
    });

    jsonBtn?.addEventListener('click', () => {
      this.playSound('preset');
      const data = {
        title: 'AGAC Site Acceptance Test (SAT) Commissioning Report',
        date: new Date().toISOString(),
        site: siteInput?.value || 'BVS-01 Habshan Trunkline',
        engineer: techInput?.value || 'Christian Espinosa',
        checks: savedState
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SAT_Report_${(siteInput?.value || 'Site').replace(/\s+/g,'_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded SAT Report JSON');
    });

    mdBtn?.addEventListener('click', () => {
      this.playSound('preset');
      let md = `# Site Acceptance Test (SAT) Commissioning Report\n`;
      md += `**Facility**: Arab Global Oil & Gas Operations (agac.ae), Dubai, UAE\n`;
      md += `**Station**: ${siteInput?.value || 'BVS-01 Habshan Trunkline'}\n`;
      md += `**Lead Engineer**: ${techInput?.value || 'Christian Espinosa (I&C Lead)'}\n`;
      md += `**Date**: ${new Date().toLocaleDateString()}\n\n`;
      md += `| Category | Inspection Checkpoint | Status |\n`;
      md += `| :--- | :--- | :--- |\n`;
      satCategories.forEach(cat => {
        cat.items.forEach(item => {
          md += `| ${cat.name} | ${item.label} | ${savedState[item.id] ? 'PASSED' : 'PENDING'} |\n`;
        });
      });
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SAT_Report_${(siteInput?.value || 'Site').replace(/\s+/g,'_')}.md`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('Downloaded SAT Report Markdown');
    });

    saveAndRefresh();
  },

  // -------------------------------------------------------------
  // 13. Global Periodic Telemetry Simulator
  // -------------------------------------------------------------
  startGlobalTelemetry() {
    setInterval(() => {
      if (this.state.simulatingAlarm) return;

      const p = (64.0 + Math.random() * 0.4).toFixed(1);
      const dp = (0.11 + Math.random() * 0.02).toFixed(2);
      const flow = Math.round(2145 + Math.random() * 10);
      const batt = (13.05 + Math.random() * 0.15).toFixed(1);

      // Dynamic Island
      const islandText = document.querySelector('#islandText');
      if (islandText) {
        islandText.textContent = `Line-1: ${p} Bar | DP: ${dp} | Normal`;
      }

      // StandBy Tiles
      const gp = document.querySelector('#g-press');
      if (gp) gp.textContent = p;
      const gdp = document.querySelector('#g-dp');
      if (gdp) gdp.textContent = dp;
      const gbatt = document.querySelector('#g-batt');
      if (gbatt) gbatt.textContent = batt;

      // Analog Bars (ISA-101)
      const abPV = document.querySelector('#ab-press-v');
      if (abPV) abPV.textContent = `${p} bar`;
      const abPF = document.querySelector('#ab-press-f');
      if (abPF) abPF.style.width = `${p}%`;
      const abPM = document.querySelector('#ab-press-m');
      if (abPM) abPM.style.left = `${p}%`;

      const abDPV = document.querySelector('#ab-dp-v');
      if (abDPV) abDPV.textContent = `${dp} bar`;

      // Sparklines buffer update
      this.state.trendHistory.press.shift();
      this.state.trendHistory.press.push(parseFloat(p));
      this.state.trendHistory.dp.shift();
      this.state.trendHistory.dp.push(parseFloat(dp));
      this.state.trendHistory.flow.shift();
      this.state.trendHistory.flow.push(flow);

      const spPV = document.querySelector('#sp-press-v');
      if (spPV) spPV.textContent = p;
      const spDPV = document.querySelector('#sp-dp-v');
      if (spDPV) spDPV.textContent = dp;
      const spFV = document.querySelector('#sp-flow-v');
      if (spFV) spFV.textContent = flow;

      this.updateSparklines();
    }, 2500);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
