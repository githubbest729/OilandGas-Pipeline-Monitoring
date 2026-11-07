/**
 * Oil & Gas Pipeline Monitoring SCADA Field Guide
 * Unified Single-Init Application Controller
 */

const App = {
  state: {
    sunlight: false,
    batterySaver: false,
    soundMuted: false,
    wakeLock: null
  },

  init() {
    this.bindTabs();
    this.bindUtilities();
    this.initCalculators();
    this.initTelemetrySimulation();
    this.loadPersistedSettings();
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
    setTimeout(() => t.classList.remove('show'), 2500);
  },

  bindTabs() {
    const tabs = document.querySelectorAll('.tab');
    const panels = document.querySelectorAll('.panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        tabs.forEach(t => {
          t.setAttribute('aria-selected', 'false');
          t.classList.remove('active');
        });
        panels.forEach(p => p.classList.remove('active'));

        tab.setAttribute('aria-selected', 'true');
        tab.classList.add('active');
        document.querySelector(`#tab-${target}`)?.classList.add('active');
      });
    });

    document.querySelector('#islandPill')?.addEventListener('click', () => {
      document.querySelector('#tabbtn-glance')?.click();
    });
  },

  bindUtilities() {
    // Desert Sunlight Mode
    const btnSun = document.querySelector('#btnSun');
    btnSun?.addEventListener('click', () => {
      this.toggleSunlight(!this.state.sunlight);
    });

    // Battery Saver Mode
    const btnBatt = document.querySelector('#btnBatt');
    btnBatt?.addEventListener('click', () => {
      this.toggleBattery(!this.state.batterySaver);
    });

    // Widget Shortcut
    document.querySelector('#btnWidget')?.addEventListener('click', () => {
      document.querySelector('#tabbtn-glance')?.click();
    });

    // Share button
    document.querySelector('#btnShare')?.addEventListener('click', async () => {
      const shareData = {
        title: 'Oil & Gas Pipeline Monitoring SCADA Field Guide',
        text: 'SCADA Engineering Field Guide for UAE Oil & Gas Pipelines',
        url: 'https://githubbest729.github.io/OilandGas-Pipeline-Monitoring/'
      };
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (e) {
          /* user cancelled */
        }
      } else {
        await navigator.clipboard.writeText(shareData.url);
        this.showToast('Link copied to clipboard!');
      }
    });

    // Refresh
    document.querySelector('#btnRefresh')?.addEventListener('click', () => {
      window.location.reload();
    });
  },

  toggleSunlight(enabled) {
    this.state.sunlight = enabled;
    document.body.classList.toggle('sunlight-mode', enabled);
    document.querySelector('#btnSun')?.classList.toggle('active', enabled);
    localStorage.setItem('scada_sunlight', enabled);
  },

  toggleBattery(enabled) {
    this.state.batterySaver = enabled;
    document.body.classList.toggle('battery-saver', enabled);
    document.querySelector('#btnBatt')?.classList.toggle('active', enabled);
    localStorage.setItem('scada_battery', enabled);
  },

  initCalculators() {
    // 1. 4-20 mA NAMUR NE43
    const calcMa = () => {
      const ma = Math.min(25, Math.max(0, parseFloat(document.querySelector('#ma-ma')?.value || 0)));
      const lrv = parseFloat(document.querySelector('#ma-lrv')?.value || 0);
      const urv = parseFloat(document.querySelector('#ma-urv')?.value || 100);
      const unit = document.querySelector('#ma-unit')?.value || 'bar';

      let status = 'Valid Range';
      let statusColor = '#10B981';
      let pv = lrv + ((ma - 4.0) / 16.0) * (urv - lrv);

      if (ma < 3.6) {
        status = 'NAMUR Fault: Sensor Burnout / Open Loop Wire';
        statusColor = '#FF3366';
      } else if (ma >= 3.6 && ma < 3.8) {
        status = 'NAMUR Under-Range Measurement';
        statusColor = '#FFC400';
      } else if (ma > 20.0 && ma <= 20.5) {
        status = 'NAMUR Over-Range Measurement';
        statusColor = '#FFC400';
      } else if (ma > 20.5) {
        status = 'NAMUR Fault: Hardware Short Circuit / Saturation';
        statusColor = '#FF3366';
      }

      const out = document.querySelector('#ma-out');
      if (out) {
        out.innerHTML = `
          <div style="font-weight:700;color:${statusColor}">${status}</div>
          <div style="font-size:1.2rem;margin-top:6px">PV: <b>${pv.toFixed(2)} ${unit}</b> (Signal: ${ma.toFixed(2)} mA)</div>
          <div style="color:var(--text-muted);font-size:0.8rem;margin-top:4px">Siemens S7 Count: ${Math.round((ma - 4) / 16 * 27648)} | AB Count: ${Math.round((ma - 4) / 16 * 32767)}</div>
        `;
      }
    };

    ['#ma-ma', '#ma-lrv', '#ma-urv', '#ma-unit'].forEach(sel => {
      document.querySelector(sel)?.addEventListener('input', calcMa);
    });
    calcMa();

    // 2. Hydrostatic / Line pack
    const calcHd = () => {
      const sg = Math.min(2.0, Math.max(0.5, parseFloat(document.querySelector('#hd-sg')?.value || 0.85)));
      const flow = Math.max(0, parseFloat(document.querySelector('#hd-flow')?.value || 0));
      const len = Math.max(0, parseFloat(document.querySelector('#hd-len')?.value || 0));
      const dia = Math.max(1, parseFloat(document.querySelector('#hd-dia')?.value || 500));
      const dz = parseFloat(document.querySelector('#hd-dz')?.value || 0);

      const rho = sg * 1000; // kg/m3
      const deltaP_static_bar = (rho * 9.81 * dz) / 100000;
      const volume_m3 = Math.PI * Math.pow(dia / 2000, 2) * (len * 1000);
      const inventory_tons = (volume_m3 * rho) / 1000;

      const out = document.querySelector('#hd-out');
      if (out) {
        out.innerHTML = `
          <div>Static Elevation Head Delta: <b>${deltaP_static_bar.toFixed(2)} bar</b></div>
          <div>Total Pipeline Inventory Volume: <b>${volume_m3.toFixed(0)} m&sup3;</b> (${inventory_tons.toFixed(1)} MT)</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px">Calculated with clamped liquid SG: ${sg.toFixed(2)}</div>
        `;
      }
    };

    ['#hd-sg', '#hd-flow', '#hd-len', '#hd-dia', '#hd-dz'].forEach(sel => {
      document.querySelector(sel)?.addEventListener('input', calcHd);
    });
    calcHd();
  },

  initTelemetrySimulation() {
    setInterval(() => {
      const p = (64.0 + Math.random() * 0.4).toFixed(1);
      const dp = (0.11 + Math.random() * 0.02).toFixed(2);
      const islandText = document.querySelector('#islandText');
      if (islandText) {
        islandText.textContent = `Line-1: ${p} Bar | DP: ${dp} | Normal`;
      }
      const gp = document.querySelector('#g-press');
      if (gp) gp.textContent = p;
      const gdp = document.querySelector('#g-dp');
      if (gdp) gdp.textContent = dp;
    }, 3000);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
