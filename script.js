/* ======================================================
   WILDGUARD AI — Dashboard JavaScript
   Plain vanilla JS — no frameworks
   Workflow: Camera → AI/Roboflow → Backend → handleDetection() → UI
   ====================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------
  // 1. CONFIGURATION
  // ------------------------------------------------------
  // ======================================================
  // >>> PASTE YOUR ROBOFLOW KEY HERE — ONE VARIABLE ONLY <<<
  // ======================================================
  // Get it from: https://app.roboflow.com -> Project -> API -> Private API Key
  // Example: "rf_ABC123xyz..."  or  "abcDEF123456..."
  const ROBOFLOW_API_KEY = 'AF55joE4CSTQ7Ypz0Ruz'; // <--- YOUR PRIVATE KEY (AF55...), correct for Workflow

  
  const CONFIG = {
    // Roboflow — Workflow wildguard-u4zlr — Base Workflow (2249 imgs, v2) + direct model fallback
    ROBOFLOW_API_KEY: ROBOFLOW_API_KEY, // uses the ONE variable above — load from env, never hardcode
    ROBOFLOW_WORKSPACE: 'sanjay-s-pmuqs',
    ROBOFLOW_WORKFLOW_ID: 'wildguard-vwildguard-u4zlr-2-yolo26n-t1-logic', // kept for reference — not used in Option A
    ROBOFLOW_WORKFLOW_URL: 'https://serverless.roboflow.com/sanjay-s-pmuqs/workflows/wildguard-vwildguard-u4zlr-2-yolo26n-t1-logic',
    ROBOFLOW_MODEL_ID: 'sanjay-s-pmuqs/wildguard-u4zlr-2-yolo26n-t1', // direct YOLO26 Nano v2 (2249 imgs) — currently NOT deployed as direct (405), so Workflow is primary
    ROBOFLOW_VERSION: 2, // v2
    ROBOFLOW_CONFIDENCE: 40,
    ROBOFLOW_OVERLAP: 30,
    ROBOFLOW_ENABLED: true,
    ROBOFLOW_USE_WORKFLOW: true, // Workflow is deployed (Published) — direct detect gives 405 until you deploy direct model
    DETECT_INTERVAL_MS: 200, // 5fps — as you wanted (was 1800)
    ALERT_COOLDOWN_MS: 30000, // 30s — only after an animal alert, not when nothing found

    DEMO_MODE: false, // set true to auto-simulate on load (demo/hackathon)
    DEMO_INTERVAL_MS: 12000,
    MAX_RECENT: 20,
    STORAGE_KEY: 'wildguard_prototype_v1',
    // PLACEHOLDER API ENDPOINTS — replace when FastAPI backend is ready
    API_BASE: 'http://localhost:8000', // FastAPI proxy — bypasses CORS for Workflow
    ENDPOINTS: {
      detections: '/api/detections', // GET
      camera: '/api/camera',         // GET
      alerts: '/api/alerts',         // GET
      detectionPost: '/api/detections' // POST for future ingestion
    },
    DEFAULT_ZONE: {
      id: 'zone-1',
      name: 'Zone 1',
      latitude: 21.4624,  // Similipal, Odisha — default for judges
      longitude: 86.7679
    },
    DEFAULT_CAMERA: {
      id: 'camera-01',
      name: 'Camera 01',
      zoneId: 'zone-1'
    },
    // Fallback map center — Similipal (when user clears Settings)
    FALLBACK_CENTER: { lat: 21.4624, lng: 86.7679 }, // Similipal, Odisha — matches DEFAULT_ZONE
    FALLBACK_ZOOM: 13
  };

  // ------------------------------------------------------
  // 2. STATE (session memory + optional localStorage)
  // ------------------------------------------------------
  const state = {
    detections: [], // newest first
    alerts: [],     // active alerts
    cameraStatus: 'ONLINE', // ONLINE | OFFLINE | CONNECTING
    systemStatus: 'ONLINE',
    lastSeen: null,
    lastAlertAt: 0, // timestamp of last alert — for 30s cooldown (only after animal found)
    zone: { ...CONFIG.DEFAULT_ZONE },
    camera: { ...CONFIG.DEFAULT_CAMERA },
    filter: 'all',
    demoTimer: null,
    maps: { main: null, large: null, markers: {} }
  };

  // ------------------------------------------------------
  // 3. DOM REFERENCES (cached — with graceful missing checks)
  // ------------------------------------------------------
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  // Helper to warn once if element missing
  function ref(id) {
    const el = document.getElementById(id);
    if (!el) console.warn('[WILDGUARD] Missing element #' + id + ' — add it to HTML for full functionality');
    return el;
  }

  const dom = {};

  function cacheDom() {
    dom.navLinks = $$('.nav-link[data-section]');
    dom.views = $$('.view[data-section]');
    dom.liveRegion = ref('live-region');

    // Summary cards
    dom.highRiskCount = ref('high-risk-count');
    dom.mediumRiskCount = ref('medium-risk-count');
    dom.eventsTodayCount = ref('events-today-count');
    dom.deviceStatusValue = ref('device-status-value');
    dom.deviceStatusDesc = ref('device-status-description');
    dom.notificationCount = ref('notification-count');
    dom.liveAlertsCount = ref('live-alerts-count');

    // Live alerts
    dom.liveAlertsList = ref('live-alerts-list');
    dom.liveAlertsEmpty = ref('live-alerts-empty');
    dom.alertsTableBody = ref('alerts-table-body');
    dom.alertsEmpty = ref('alerts-empty');
    dom.filterButtons = $$('.filter-button');
    dom.sendAlertButton = ref('button-send-alert');

    // Latest detection
    dom.latestCamera = ref('latest-camera');
    dom.latestZone = ref('latest-zone');
    dom.latestSpecies = ref('latest-species');
    dom.latestConfidence = ref('latest-confidence');
    dom.latestDirection = ref('latest-direction');
    dom.latestRisk = ref('latest-risk');
    dom.latestRiskScore = ref('latest-risk-score');
    dom.latestTimestamp = ref('latest-timestamp');
    dom.latestDetectionEmpty = ref('latest-detection-empty');

    // Map info
    dom.mapActiveZone = ref('map-active-zone');
    dom.mapActiveCamera = ref('map-active-camera');
    dom.mapZoneCoords = ref('map-zone-coordinates');
    dom.mapZoneLat = ref('map-zone-latitude');
    dom.mapZoneLng = ref('map-zone-longitude');
    dom.mapViewCoords = ref('map-view-coordinates');
    dom.mapViewLat = ref('map-view-latitude');
    dom.mapViewLng = ref('map-view-longitude');
    dom.mapViewDetection = ref('map-view-detection');
    dom.mapViewRisk = ref('map-view-risk');

    // Camera
    dom.cameraFeed = ref('camera-feed-01');
    dom.cameraStatus = ref('camera-01-status');
    dom.cameraEmpty = ref('camera-empty-state-01');
    dom.cameraOverlay = ref('camera-overlay-01');
    dom.deviceFieldStatus = ref('device-field-status');
    dom.deviceFieldCamera = ref('device-field-camera');
    dom.deviceFieldNetwork = ref('device-field-network');
    dom.deviceFieldHeartbeat = ref('device-field-heartbeat');
    dom.cameraSourceBadge = ref('camera-source-badge');
    dom.cameraSourceLabel = ref('camera-source-label');
    dom.dashboardSourceHint = ref('dashboard-source-hint');
    dom.cameraSourceHint = ref('camera-source-hint');
    // Extra camera labels that should toggle LIVE vs VIDEO
    dom.sidebarContextValue = document.querySelector('.sidebar-context-value');
    dom.dashboardSubtitle = document.querySelector('#view-dashboard .view-subtitle');
    dom.mapSubtitle = document.querySelector('#view-map .view-subtitle');
    dom.camerasSubtitle = document.querySelector('#view-cameras .view-subtitle');
    dom.cameraCardName = ref('camera-01-name');
    dom.cameraNote = document.querySelector('.camera-card-footer .camera-note');
    dom.mapPanelSubtitle = document.querySelector('.panel-map .panel-subtitle');
    dom.deviceStatusBadge = ref('device-status-badge');

    // Settings
    dom.settingZoneName = ref('setting-zone-name');
    dom.settingZoneLat = ref('setting-zone-latitude');
    dom.settingZoneLng = ref('setting-zones-longitude');
    dom.settingCameraName = ref('setting-camera-name');
    dom.settingAssignedZone = ref('setting-assigned-zone');
    dom.settingMonitoringStatus = ref('setting-monitoring-status');
    dom.settingsSaveButton = ref('settings-save-button');
    dom.settingsSummaryLat = ref('settings-summary-lat');
    dom.settingsSummaryLng = ref('settings-summary-lng');
    dom.cameraZoneLat = ref('camera-01-zone-lat');
    dom.cameraZoneLng = ref('camera-01-zone-lng');
    dom.headerActiveZone = ref('header-active-zone');
    dom.headerActiveCamera = ref('header-active-camera');

    // Alert detail panel
    dom.alertDetailPanel = ref('alert-detail-panel');
    dom.alertDetailClose = ref('alert-detail-close');
    dom.detailSeverity = ref('detail-severity');
    dom.detailSpecies = ref('detail-species');
    dom.detailConfidence = ref('detail-confidence');
    dom.detailZone = ref('detail-zone');
    dom.detailCamera = ref('detail-camera');
    dom.detailTimestamp = ref('detail-timestamp');
    dom.detailDirection = ref('detail-direction');
    dom.detailRiskScore = ref('detail-risk-score');
    dom.buttonAcknowledge = ref('button-acknowledge-alert');
    dom.buttonCloseAlert = ref('button-close-alert');

    // Analytics
    dom.analyticsDetectionCount = ref('analytics-detection-count-value');
    dom.analyticsSpecies = ref('analytics-species-value');
    dom.analyticsRisk = ref('analytics-risk-value');
    dom.analyticsZone = ref('analytics-zone-value');
    dom.analyticsTime = ref('analytics-time-value');
    dom.analyticsResponse = ref('analytics-response-value');

    // System status
    dom.systemStatus = ref('system-status');
    dom.statusLabel = document.querySelector('#system-status .status-label');
    dom.statusIndicator = document.querySelector('#system-status .status-indicator');
  }

  // ------------------------------------------------------
  // 4. INITIALIZATION
  // ------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    try {
      cacheDom();
      initNavigation();
      initSettings();
      initCamera();
      initMap();
      initAlerts();
      initManualAlert();
      initAnalyticsFilters();
      loadPersistedState();
      updateDashboard();
      setSystemStatus('ONLINE');
      setCameraStatus(state.cameraStatus);
      // Source badge: offline until user picks VIDEO or LIVE
      setCameraSource('offline');
      // If we start with ONLINE status but no actual stream, show OFFLINE status for honesty
      if (!dom.cameraFeed || (!dom.cameraFeed.srcObject && !dom.cameraFeed.src)) {
        setCameraStatus('OFFLINE');
        setCameraSource('offline');
      }
      // Optionally fetch from backend if available
      fetchCameraStatus();
      if (CONFIG.DEMO_MODE) startDemoMode();
      announce('WILDGUARD AI dashboard initialized. One camera monitoring Zone 1.');
      console.info('[WILDGUARD] Initialized. DEMO_MODE=' + CONFIG.DEMO_MODE + '. Call WILDGUARD.simulateDetection() to test.');
    } catch (e) {
      console.error('[WILDGUARD] Init failed', e);
      announce('Dashboard initialization encountered an error. See console.');
    }
  }

  // ------------------------------------------------------
  // 5. NAVIGATION
  // ------------------------------------------------------
  function initNavigation() {
    if (!dom.navLinks.length) {
      console.warn('[WILDGUARD] No .nav-link[data-section] found');
      return;
    }
    dom.navLinks.forEach(btn => {
      btn.addEventListener('click', () => switchView(btn.dataset.section));
    });
    // Notification bell goes to Alerts
    const notif = document.getElementById('notification-indicator');
    if (notif) notif.addEventListener('click', () => switchView('alerts'));
  }

  function switchView(section) {
    if (!section) return;
    dom.views.forEach(v => {
      const isTarget = v.dataset.section === section;
      if (isTarget) {
        v.hidden = false;
        v.classList.add('is-active');
      } else {
        v.hidden = true;
        v.classList.remove('is-active');
      }
    });
    dom.navLinks.forEach(b => {
      const active = b.dataset.section === section;
      b.classList.toggle('active', active);
      if (active) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    // Resize maps when shown
    if (state.maps.main) setTimeout(() => state.maps.main.invalidateSize(), 120);
    if (state.maps.large) setTimeout(() => state.maps.large.invalidateSize(), 120);
  }

  // ------------------------------------------------------
  // 6. CAMERA STATUS + getUserMedia
  // ------------------------------------------------------
  function initCamera() {
    if (!dom.cameraFeed) return;
    // Handle video stream events to toggle empty state
    dom.cameraFeed.addEventListener('loadedmetadata', () => {
      if (dom.cameraEmpty) dom.cameraEmpty.hidden = true;
    });
    dom.cameraFeed.addEventListener('error', () => setCameraStatus('OFFLINE'));

    // Bind ALL webcam buttons (dashboard + cameras view) — do not auto-request
    const startBtns = document.querySelectorAll('[data-action="start-camera"]');
    if (startBtns.length) {
      startBtns.forEach(btn => btn.addEventListener('click', () => {
        // Stop video-file detection loop and clear file src before switching to webcam
        const vb = document.querySelector('#camera-overlay-01 [data-overlay="bbox"]');
        if (vb) vb.hidden = true;
        // clear objectUrl if playing file
        if (dom.cameraFeed && dom.cameraFeed.dataset.objectUrl) {
          URL.revokeObjectURL(dom.cameraFeed.dataset.objectUrl);
          delete dom.cameraFeed.dataset.objectUrl;
          dom.cameraFeed.removeAttribute('src');
          dom.cameraFeed.src = '';
          dom.cameraFeed.controls = false;
        }
        // stop file detection loop if running
        if (typeof stopVideoDetectionLoop === 'function') {
          try { stopVideoDetectionLoop(); } catch {}
        }
        startCamera();
      }));
    } else {
      const fallback = document.getElementById('button-start-camera');
      if (fallback) fallback.addEventListener('click', startCamera);
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[WILDGUARD] getUserMedia not supported in this browser');
      announce('Camera not supported in this browser.');
      setCameraStatus('OFFLINE');
      return;
    }
    if (!dom.cameraFeed) {
      console.warn('[WILDGUARD] Missing #camera-feed-01 video element');
      return;
    }
    try {
      setCameraStatus('CONNECTING');
      setCameraSource('live');
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      dom.cameraFeed.srcObject = stream;
      if (dom.cameraFeed) dom.cameraFeed.dataset.fileName = '';
      dom.cameraFeed.controls = false;
      dom.cameraFeed.muted = true;
      await dom.cameraFeed.play().catch(() => {});
      if (dom.cameraEmpty) dom.cameraEmpty.hidden = true;
      setCameraStatus('ONLINE');
      setCameraSource('live');
      state.lastSeen = new Date().toISOString();
      updateDeviceHeartbeat();
      // Start Roboflow (or simulation) for LIVE feed as well — same as VIDEO
      announce(isRoboflowConfigured() ? 'LIVE — Roboflow detecting' : 'LIVE — simulating detection');
      stopVideoDetectionLoop();
      startVideoDetectionLoop();
      // Keep detecting while LIVE is playing
      dom.cameraFeed.onplay = () => { if (!videoDetectionTimer) startVideoDetectionLoop(); };
      dom.cameraFeed.onpause = () => { /* keep loop paused via runOneDetectionCycle check */ };
      // Stop tracks when page unloads
      window.addEventListener('beforeunload', () => stream.getTracks().forEach(t => t.stop()), { once: true });
    } catch (err) {
      console.warn('[WILDGUARD] Camera permission denied / error', err.message);
      setCameraStatus('OFFLINE');
      if (dom.cameraEmpty) dom.cameraEmpty.hidden = false;
      announce('Camera permission denied: ' + err.message);
    }
  }

  function stopCamera() {
    stopVideoDetectionLoop();
    if (dom.cameraFeed && dom.cameraFeed.srcObject) {
      dom.cameraFeed.srcObject.getTracks().forEach(t => t.stop());
      dom.cameraFeed.srcObject = null;
    }
    if (dom.cameraEmpty) dom.cameraEmpty.hidden = false;
    setCameraStatus('OFFLINE');
    setCameraSource('offline');
  }

  function setCameraSource(source) {
    // source: 'live' | 'video' | 'offline'
    const s = String(source || 'offline').toLowerCase();
    const badge = dom.cameraSourceBadge;
    const label = dom.cameraSourceLabel;
    if (badge) {
      if (s === 'live') {
        badge.textContent = '● LIVE';
        badge.style.background = 'rgba(224,58,62,0.14)';
        badge.style.color = '#e03a3e';
        badge.style.borderColor = 'rgba(224,58,62,0.32)';
      } else if (s === 'video') {
        badge.textContent = '▶ VIDEO';
        badge.style.background = 'rgba(31,122,58,0.16)';
        badge.style.color = '#2eb872';
        badge.style.borderColor = 'rgba(31,122,58,0.32)';
      } else {
        badge.textContent = '○ OFFLINE';
        badge.style.background = 'var(--bg-input)';
        badge.style.color = 'var(--text-muted)';
        badge.style.borderColor = 'var(--border-subtle)';
      }
    }
    if (label) {
      if (s === 'live') label.textContent = 'LIVE — Webcam';
      else if (s === 'video') {
        const f = dom.cameraFeed && dom.cameraFeed.dataset.fileName ? dom.cameraFeed.dataset.fileName : 'Video file';
        label.textContent = 'VIDEO — ' + f;
      } else label.textContent = 'No source';
      label.setAttribute('data-source', s);
    }
    // Keep Latest Detection header in sync
    const panelStatus = document.querySelector('.panel-detection .panel-status');
    if (panelStatus) {
      if (s === 'live') panelStatus.textContent = 'LIVE → Zone 1';
      else if (s === 'video') panelStatus.textContent = 'VIDEO → Zone 1';
      else panelStatus.textContent = 'Camera 01 → Zone 1';
    }
    // Highlight active source button (Video vs Live)
    const videoBtns = document.querySelectorAll('[data-action="select-video"]');
    const liveBtns = document.querySelectorAll('[data-action="start-camera"]');
    videoBtns.forEach(b => {
      b.style.opacity = s === 'video' ? '1' : s === 'offline' ? '1' : '0.7';
      b.style.boxShadow = s === 'video' ? '0 0 0 2px rgba(31,122,58,0.35)' : 'none';
    });
    liveBtns.forEach(b => {
      b.style.opacity = s === 'live' ? '1' : s === 'offline' ? '1' : '0.7';
      b.style.boxShadow = s === 'live' ? '0 0 0 2px rgba(224,58,62,0.35)' : 'none';
    });
    // Hint text
    if (dom.dashboardSourceHint) {
      if (s === 'live') dom.dashboardSourceHint.textContent = '● LIVE active — webcam streaming to Camera 01';
      else if (s === 'video') dom.dashboardSourceHint.textContent = '▶ VIDEO active — file playing in Camera 01';
      else dom.dashboardSourceHint.textContent = 'Select VIDEO file or start LIVE webcam — both play in Camera 01';
    }
    if (dom.cameraSourceHint) {
      if (s === 'live') dom.cameraSourceHint.textContent = '● LIVE active';
      else if (s === 'video') dom.cameraSourceHint.textContent = '▶ VIDEO active — ' + (dom.cameraFeed && dom.cameraFeed.dataset.fileName ? dom.cameraFeed.dataset.fileName : 'file');
      else dom.cameraSourceHint.textContent = 'VIDEO = file · LIVE = webcam · drag & drop supported';
    }

    // === Global label switching: CAMERA only when LIVE, VIDEO otherwise ===
    const camLabel = s === 'live' ? 'Camera 01' : s === 'video' ? 'Video' : 'No source';
    const camDescLive = 'Camera 01 is monitoring Zone 1 — live risk, location, and alerts at a glance.';
    const camDescVideo = 'Video file is playing in Zone 1 — detections + alerts at a glance.';
    const camDescOff = 'No source active — start LIVE webcam or play a VIDEO file to monitor Zone 1.';

    // Header active camera
    if (dom.headerActiveCamera) {
      dom.headerActiveCamera.textContent = s === 'live' ? 'Camera 01' : s === 'video' ? 'Video' : '—';
      dom.headerActiveCamera.setAttribute('data-camera-id', s === 'video' ? 'video-file' : 'camera-01');
      dom.headerActiveCamera.setAttribute('data-source', s);
    }
    // Sidebar
    if (dom.sidebarContextValue) {
      dom.sidebarContextValue.textContent = s === 'live' ? 'Camera 01 → Zone 1' : s === 'video' ? 'Video → Zone 1' : 'No source → Zone 1';
      dom.sidebarContextValue.setAttribute('data-source', s);
    }
    // Dashboard subtitle
    if (dom.dashboardSubtitle) {
      dom.dashboardSubtitle.textContent = s === 'live' ? camDescLive : s === 'video' ? camDescVideo : camDescOff;
    }
    // Map subtitles
    if (dom.mapPanelSubtitle) {
      dom.mapPanelSubtitle.textContent = s === 'live' ? 'Live feed from Camera 01 is placed at Zone 1 coordinates (not camera GPS).' : s === 'video' ? 'Detections from Video file are placed at Zone 1 coordinates.' : 'No source — start LIVE or VIDEO to see detections on map.';
    }
    if (dom.mapSubtitle) {
      dom.mapSubtitle.textContent = s === 'live' ? 'Geographic context for Zone 1 — live detections are placed at zone coordinates.' : s === 'video' ? 'Geographic context for Zone 1 — video detections are placed at zone coordinates.' : 'Geographic context for Zone 1 — start a source to see detections.';
    }
    if (dom.camerasSubtitle) {
      dom.camerasSubtitle.textContent = s === 'live' ? 'Live view: Camera 01 is streaming to Zone 1.' : s === 'video' ? 'Video view: file is playing as Zone 1 source.' : 'Prototype scope: one source — LIVE webcam or VIDEO file assigned to Zone 1.';
    }
    // Map info cameras
    if (dom.mapActiveCamera) {
      dom.mapActiveCamera.textContent = camLabel;
      dom.mapActiveCamera.setAttribute('data-source', s);
    }
    const mapViewCam = document.getElementById('map-view-camera');
    if (mapViewCam) { mapViewCam.textContent = camLabel; mapViewCam.setAttribute('data-source', s); }
    // Latest detection camera field
    if (dom.latestCamera) dom.latestCamera.textContent = camLabel;
    // Camera card name — keep "Camera 01" only for LIVE
    if (dom.cameraCardName) {
      // preserve badge inside h3, so update text node only
      const badge = dom.cameraSourceBadge;
      if (s === 'live') {
        dom.cameraCardName.childNodes[0].textContent = 'Camera 01 ';
      } else if (s === 'video') {
        dom.cameraCardName.childNodes[0].textContent = 'Video Source ';
      } else {
        dom.cameraCardName.childNodes[0].textContent = 'No Source ';
      }
      // re-append badge if it got detached
      if (badge && !dom.cameraCardName.contains(badge)) dom.cameraCardName.appendChild(badge);
    }
    // Camera note footer
    if (dom.cameraNote) {
      dom.cameraNote.textContent = s === 'live' ? 'Workflow: LIVE Camera 01 captures → AI detects → detection tagged with Zone 1 → map shows at Zone 1.' : s === 'video' ? 'Workflow: VIDEO file plays → AI detects → detection tagged with Zone 1 → map shows at Zone 1.' : 'Workflow: Start LIVE or VIDEO → AI detects → detection tagged with Zone 1 → map shows at Zone 1.';
    }
    // Devices / detail panel camera references
    const devCam = document.getElementById('device-field-camera');
    // keep devCam as health, not name — no change
    const detailCam = dom.detailCamera;
    if (detailCam && detailCam.textContent !== '—') {
      // only update if panel is showing a detection source
      detailCam.textContent = camLabel;
    }
  }

  function setCameraStatus(status) {
    const s = String(status || 'OFFLINE').toUpperCase();
    state.cameraStatus = s;
    const isOnline = s === 'ONLINE';
    const isConnecting = s === 'CONNECTING';
    const label = isConnecting ? 'CONNECTING' : isOnline ? 'ONLINE' : 'OFFLINE';
    if (dom.cameraStatus) dom.cameraStatus.textContent = label;
    if (dom.deviceFieldStatus) dom.deviceFieldStatus.textContent = label;
    if (dom.deviceStatusBadge) {
      dom.deviceStatusBadge.textContent = label;
      dom.deviceStatusBadge.style.background = isOnline ? 'var(--risk-low-bg)' : isConnecting ? 'var(--risk-medium-bg)' : 'var(--risk-high-bg)';
      dom.deviceStatusBadge.style.color = isOnline ? 'var(--risk-low)' : isConnecting ? 'var(--risk-medium)' : 'var(--risk-high)';
      dom.deviceStatusBadge.style.borderColor = isOnline ? 'rgba(46,184,114,0.28)' : isConnecting ? 'rgba(230,154,44,0.30)' : 'rgba(224,58,62,0.32)';
    }
    if (dom.deviceStatusValue) dom.deviceStatusValue.textContent = isOnline ? '1 / 1 Online' : '0 / 1 Online';
    if (dom.deviceStatusDesc) {
      const src = dom.cameraSourceLabel ? dom.cameraSourceLabel.getAttribute('data-source') : 'offline';
      if (isOnline && src === 'live') dom.deviceStatusDesc.textContent = 'LIVE — Webcam · Zone 1';
      else if (isOnline && src === 'video') dom.deviceStatusDesc.textContent = 'VIDEO — File · Zone 1';
      else if (isOnline) dom.deviceStatusDesc.textContent = 'Camera 01 — Online · Zone 1';
      else dom.deviceStatusDesc.textContent = 'Camera 01 — Offline · Zone 1';
    }
    if (dom.deviceFieldCamera) dom.deviceFieldCamera.textContent = isOnline ? 'Good' : 'No signal';
    if (dom.deviceFieldNetwork) dom.deviceFieldNetwork.textContent = isOnline ? 'Good' : 'Offline';
    if (dom.statusLabel) dom.statusLabel.textContent = 'SYSTEM ' + (isOnline ? 'ONLINE' : s);
    if (dom.statusIndicator) {
      dom.statusIndicator.style.background = isOnline ? 'var(--accent)' : isConnecting ? 'var(--risk-medium)' : 'var(--risk-high)';
      dom.statusIndicator.style.animation = isOnline ? '' : 'none';
    }
    if (dom.cameraFeed) dom.cameraFeed.setAttribute('aria-label', 'Camera 01 — ' + label);
    // If going offline and no source, reflect in source badge
    if (!isOnline && !isConnecting) {
      const src = dom.cameraSourceLabel ? dom.cameraSourceLabel.getAttribute('data-source') : null;
      if (src === 'offline' || !src) setCameraSource('offline');
    }
  }

  function updateDeviceHeartbeat() {
    if (!dom.deviceFieldHeartbeat) return;
    if (state.lastSeen) {
      const d = new Date(state.lastSeen);
      dom.deviceFieldHeartbeat.textContent = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
      dom.deviceFieldHeartbeat.setAttribute('datetime', state.lastSeen);
    } else {
      dom.deviceFieldHeartbeat.textContent = 'Waiting for backend';
    }
  }

  // ------------------------------------------------------
  // 7. SETTINGS — Zone ↔ Camera relationship
  // ------------------------------------------------------
  function initSettings() {
    // Restore from inputs if user typed earlier
    syncZoneFromInputs();
    const inputs = [dom.settingZoneName, dom.settingZoneLat, dom.settingZoneLng, dom.settingCameraName];
    inputs.forEach(el => { if (el) el.addEventListener('input', syncZoneFromInputs); });
    if (dom.settingAssignedZone) dom.settingAssignedZone.addEventListener('change', syncZoneFromInputs);
    if (dom.settingMonitoringStatus) dom.settingMonitoringStatus.addEventListener('change', () => {
      const v = dom.settingMonitoringStatus.value;
      if (v === 'paused' || v === 'maintenance') setSystemStatus('PAUSED'); else setSystemStatus('ONLINE');
    });
    if (dom.settingsSaveButton) {
      dom.settingsSaveButton.addEventListener('click', () => {
        syncZoneFromInputs();
        persistState();
        updateMapZoneMarker();
        announce('Configuration saved for ' + state.zone.name);
        // visual feedback
        const btn = dom.settingsSaveButton;
        const prev = btn.textContent;
        btn.textContent = 'Saved ✓';
        setTimeout(() => btn.textContent = prev, 1400);
      });
    }
    // Reset button — clears recent detections & alerts only
    const resetBtn = document.getElementById('button-reset-detections');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const count = state.detections.length + state.alerts.length;
        if (count === 0) {
          announce('No detections to reset');
          resetBtn.textContent = 'Nothing to reset';
          setTimeout(() => resetBtn.textContent = '↺ Reset', 1200);
          return;
        }
        if (!confirm('Reset all recent detections & alerts? (' + count + ' items) This does not reset zone settings.')) return;
        // Use existing helper — clears state + localStorage + re-renders
        clearPersistedState();
        // Also clear Latest Detection UI back to empty
        if (dom.latestSpecies) dom.latestSpecies.textContent = 'No detection yet';
        if (dom.latestConfidence) dom.latestConfidence.textContent = '—';
        if (dom.latestDirection) dom.latestDirection.textContent = '—';
        if (dom.latestRisk) { dom.latestRisk.textContent = '—'; dom.latestRisk.removeAttribute('data-risk-level'); }
        if (dom.latestRiskScore) dom.latestRiskScore.textContent = '—';
        if (dom.latestTimestamp) dom.latestTimestamp.innerHTML = '<time datetime="">—</time>';
        if (dom.latestCamera) dom.latestCamera.textContent = dom.cameraSourceLabel ? (dom.cameraSourceLabel.getAttribute('data-source') === 'live' ? 'Camera 01' : dom.cameraSourceLabel.getAttribute('data-source') === 'video' ? 'Video' : '—') : '—';
        if (dom.latestZone) dom.latestZone.textContent = state.zone.name;
        if (dom.latestDetectionEmpty) dom.latestDetectionEmpty.hidden = false;
        // Clear map detection markers / popups
        try {
          if (state.maps.markers.detection && state.maps.main) {
            state.maps.markers.detection.setOpacity(0);
            state.maps.markers.detection.closePopup();
          }
          if (state.maps.markers.detectionLarge && state.maps.large) {
            state.maps.large.removeLayer(state.maps.markers.detectionLarge);
            state.maps.markers.detectionLarge = null;
          }
        } catch {}
        // Clear bbox overlay
        const bbox = document.querySelector('#camera-overlay-01 [data-overlay="bbox"]');
        const olabel = document.querySelector('#camera-overlay-01 [data-overlay="label"]');
        if (bbox) bbox.hidden = true;
        if (olabel) olabel.hidden = true;
        // Map side panel
        if (dom.mapViewDetection) dom.mapViewDetection.textContent = 'None — waiting for data';
        if (dom.mapViewRisk) { dom.mapViewRisk.textContent = 'None'; dom.mapViewRisk.removeAttribute('data-risk-level'); }
        announce('Recent detections & alerts reset (' + count + ' cleared)');
        const prev = resetBtn.textContent;
        resetBtn.textContent = 'Reset ✓';
        setTimeout(() => resetBtn.textContent = '↺ Reset', 1400);
      });
    }
  }

  function syncZoneFromInputs() {
    const name = (dom.settingZoneName && dom.settingZoneName.value.trim()) || 'Zone 1';
    const latRaw = dom.settingZoneLat ? dom.settingZoneLat.value.trim() : '';
    const lngRaw = dom.settingZoneLng ? dom.settingZoneLng.value.trim() : '';
    const camName = (dom.settingCameraName && dom.settingCameraName.value.trim()) || 'Camera 01';
    const lat = parseFloat(latRaw);
    const lng = parseFloat(lngRaw);
    state.zone.name = name;
    state.zone.id = 'zone-1'; // prototype single zone
    state.zone.latitude = Number.isFinite(lat) ? lat : null;
    state.zone.longitude = Number.isFinite(lng) ? lng : null;
    state.camera.name = camName;

    // Update all mirrored labels
    const latText = state.zone.latitude !== null ? String(state.zone.latitude) : 'Not configured';
    const lngText = state.zone.longitude !== null ? String(state.zone.longitude) : 'Not configured';
    const coordText = (state.zone.latitude !== null && state.zone.longitude !== null)
      ? state.zone.latitude.toFixed(4) + ', ' + state.zone.longitude.toFixed(4)
      : 'Not configured — set in Settings';

    [dom.mapZoneLat, dom.mapViewLat, dom.cameraZoneLat, dom.settingsSummaryLat].forEach(el => { if (el) el.textContent = latText; });
    [dom.mapZoneLng, dom.mapViewLng, dom.cameraZoneLng, dom.settingsSummaryLng].forEach(el => { if (el) el.textContent = lngText; });
    if (dom.mapZoneCoords) dom.mapZoneCoords.textContent = coordText;
    if (dom.mapViewCoords) dom.mapViewCoords.textContent = coordText;
    if (dom.headerActiveZone) dom.headerActiveZone.textContent = name;
    if (dom.headerActiveCamera) dom.headerActiveCamera.textContent = camName;
    if (dom.mapActiveZone) dom.mapActiveZone.textContent = name;
    if (dom.mapActiveCamera) dom.mapActiveCamera.textContent = camName;
  }

  function setSystemStatus(s) {
    state.systemStatus = s;
    if (dom.statusLabel) dom.statusLabel.textContent = s === 'PAUSED' ? 'SYSTEM PAUSED' : 'SYSTEM ONLINE';
  }

  function getZoneLatLng() {
    if (state.zone.latitude !== null && state.zone.longitude !== null) {
      return { lat: state.zone.latitude, lng: state.zone.longitude };
    }
    return { ...CONFIG.FALLBACK_CENTER };
  }

  // ------------------------------------------------------
  // 8. VALIDATION & RISK (DEMO ONLY)
  // ------------------------------------------------------
  function validateDetection(d) {
    if (!d || typeof d !== 'object') return { valid: false, reason: 'Not an object' };
    if (!d.species || typeof d.species !== 'string') return { valid: false, reason: 'Missing species' };
    if (d.confidence !== undefined) {
      const c = Number(d.confidence);
      if (Number.isNaN(c) || c < 0 || c > 100) {
        // accept 0-1 range too
        const c2 = c <= 1 && c >= 0 ? c * 100 : c;
        if (Number.isNaN(c2) || c2 < 0 || c2 > 100) return { valid: false, reason: 'Invalid confidence' };
      }
    }
    // riskLevel must be HIGH/MEDIUM/LOW if provided
    if (d.riskLevel && !['HIGH','MEDIUM','LOW'].includes(String(d.riskLevel).toUpperCase())) {
      return { valid: false, reason: 'Invalid riskLevel' };
    }
    return { valid: true };
  }

  function normalizeConfidence(c) {
    if (c === undefined || c === null) return 0;
    let n = Number(c);
    if (n <= 1 && n > 0) n = n * 100;
    return Math.round(Math.max(0, Math.min(100, n)));
  }

  // DEMO ONLY — clearly labeled. Backend should provide riskLevel & riskScore.
  function calculateDemoRisk(species, confidence, direction) {
    const s = String(species).toLowerCase();
    let base = 40;
    if (['tiger','leopard','elephant','bear'].some(k => s.includes(k))) base = 85;
    else if (['wild boar','boar'].some(k => s.includes(k))) base = 65;
    else if (['deer'].some(k => s.includes(k))) base = 30;
    else base = 25;
    const conf = normalizeConfidence(confidence);
    let score = Math.round(base * 0.7 + conf * 0.3);
    if (direction && /towards|northeast|east|south/i.test(direction)) score += 5;
    score = Math.max(0, Math.min(100, score));
    let level = 'LOW';
    if (score >= 75) level = 'HIGH';
    else if (score >= 50) level = 'MEDIUM';
    return { score, level };
  }

  // ------------------------------------------------------
  // 9. CENTRAL DETECTION PIPELINE
  // ------------------------------------------------------
  function handleDetection(raw) {
    const v = validateDetection(raw);
    if (!v.valid) {
      console.warn('[WILDGUARD] Invalid detection dropped:', v.reason, raw);
      return null;
    }
    // Normalize fields — treat backend as untrusted
    const now = new Date().toISOString();
    const species = String(raw.species).trim();
    const confidence = normalizeConfidence(raw.confidence);
    let riskLevel = raw.riskLevel ? String(raw.riskLevel).toUpperCase() : null;
    let riskScore = raw.riskScore !== undefined ? Math.round(Number(raw.riskScore)) : null;
    const zone = raw.zone ? String(raw.zone) : state.zone.name;
    const zoneId = raw.zone_id || raw.zoneId || state.zone.id;
    const cameraId = raw.camera_id || raw.cameraId || state.camera.id;
    const direction = raw.movementDirection || raw.direction || raw.movement_direction || 'Unknown';
    const lat = raw.latitude !== undefined ? Number(raw.latitude) : null;
    const lng = raw.longitude !== undefined ? Number(raw.longitude) : null;
    const timestamp = raw.timestamp ? new Date(raw.timestamp).toISOString() : now;
    const id = raw.id ? String(raw.id) : 'det-' + Date.now() + '-' + Math.random().toString(36).slice(2,6);

    // Demo risk fallback if backend didn't send one
    if (!riskLevel || riskScore === null || Number.isNaN(riskScore)) {
      const demo = calculateDemoRisk(species, confidence, direction);
      riskLevel = riskLevel || demo.level;
      riskScore = riskScore === null || Number.isNaN(riskScore) ? demo.score : riskScore;
    }

    const detection = {
      id, species, confidence, riskLevel, riskScore,
      zone, zoneId, cameraId, direction,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      timestamp
    };

    // Update state — newest first
    state.detections.unshift(detection);
    if (state.detections.length > CONFIG.MAX_RECENT) state.detections.length = CONFIG.MAX_RECENT;
    state.lastSeen = timestamp;

    // Side effects
    updateLatestDetectionUI(detection);
    updateMapWithDetection(detection);
    updateDeviceHeartbeat();
    if (riskLevel === 'HIGH' || riskLevel === 'MEDIUM') {
      createAlertFromDetection(detection);
    }
    updateDashboard();
    persistState();

    console.info('[WILDGUARD] Detection handled:', detection);
    return detection;
  }

  // ------------------------------------------------------
  // 10. UI UPDATERS
  // ------------------------------------------------------
  function updateLatestDetectionUI(d) {
    if (!d) return;
    if (dom.latestCamera) dom.latestCamera.textContent = (d.cameraId === 'camera-01' ? 'Camera 01' : d.cameraId);
    if (dom.latestZone) dom.latestZone.textContent = d.zone;
    if (dom.latestSpecies) dom.latestSpecies.textContent = d.species + ' detected';
    if (dom.latestConfidence) dom.latestConfidence.textContent = d.confidence + '% confidence';
    if (dom.latestDirection) dom.latestDirection.textContent = d.direction;
    if (dom.latestRisk) {
      dom.latestRisk.textContent = d.riskLevel;
      dom.latestRisk.setAttribute('data-risk-level', d.riskLevel);
    }
    if (dom.latestRiskScore) dom.latestRiskScore.textContent = d.riskScore + ' / 100';
    if (dom.latestTimestamp) {
      const t = new Date(d.timestamp);
      dom.latestTimestamp.innerHTML = '<time datetime="' + d.timestamp + '">' + t.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST</time>';
    }
    if (dom.latestDetectionEmpty) dom.latestDetectionEmpty.hidden = true;
    // map view side panel
    if (dom.mapViewDetection) dom.mapViewDetection.textContent = d.species + ' (' + d.confidence + '%)';
    if (dom.mapViewRisk) { dom.mapViewRisk.textContent = d.riskLevel + ' ' + d.riskScore + '/100'; dom.mapViewRisk.setAttribute('data-risk-level', d.riskLevel); }
    // camera overlay demo
    const ovSpecies = document.getElementById('overlay-species');
    const ovConf = document.getElementById('overlay-confidence');
    const ovRisk = document.getElementById('overlay-risk');
    const overlayLabel = document.querySelector('#camera-overlay-01 [data-overlay="label"]');
    if (ovSpecies) ovSpecies.textContent = d.species;
    if (ovConf) ovConf.textContent = d.confidence + '%';
    if (ovRisk) { ovRisk.textContent = d.riskLevel; ovRisk.setAttribute('data-risk-level', d.riskLevel); }
    if (overlayLabel) overlayLabel.hidden = false;
  }

  function createAlertFromDetection(d) {
    // 30s cooldown — only after an animal was found, not when nothing
    const now = Date.now();
    if (state.lastAlertAt && (now - state.lastAlertAt) < CONFIG.ALERT_COOLDOWN_MS) {
      console.info('[WILDGUARD] Alert cooldown — skipping (', Math.round((CONFIG.ALERT_COOLDOWN_MS - (now - state.lastAlertAt))/1000) + 's left) — still updating Latest/Map');
      return;
    }
    const alertId = 'alert-' + d.id;
    // Avoid duplicates
    if (state.alerts.some(a => a.id === alertId)) return;
    const alert = {
      id: alertId,
      detectionId: d.id,
      species: d.species,
      zone: d.zone,
      zoneId: d.zoneId,
      cameraId: d.cameraId,
      riskLevel: d.riskLevel,
      riskScore: d.riskScore,
      confidence: d.confidence,
      direction: d.direction,
      timestamp: d.timestamp,
      status: 'Active'
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > CONFIG.MAX_RECENT) state.alerts.length = CONFIG.MAX_RECENT;
    state.lastAlertAt = Date.now(); // start 30s cooldown only now that an animal was found
    renderLiveAlerts();
    renderAlertsTable();
    announce('Alert: ' + alert.species + ' ' + alert.riskLevel + ' in ' + alert.zone);
    // Highlight + optional sound (only if user enabled — default muted)
  }

  function renderLiveAlerts() {
    if (!dom.liveAlertsList) return;
    dom.liveAlertsList.innerHTML = '';
    if (state.alerts.length === 0) {
      if (dom.liveAlertsEmpty) dom.liveAlertsEmpty.hidden = false;
      if (dom.liveAlertsCount) dom.liveAlertsCount.textContent = '0 active';
      if (dom.notificationCount) dom.notificationCount.textContent = '0';
      return;
    }
    if (dom.liveAlertsEmpty) dom.liveAlertsEmpty.hidden = true;
    if (dom.liveAlertsCount) dom.liveAlertsCount.textContent = state.alerts.length + ' active';
    if (dom.notificationCount) dom.notificationCount.textContent = String(Math.min(state.alerts.length, 99));
    state.alerts.slice(0, 6).forEach(a => {
      const el = document.createElement('article');
      el.className = 'alert-item alert-item--' + a.riskLevel.toLowerCase();
      el.dataset.alertId = a.id;
      el.dataset.zoneId = a.zoneId;
      el.dataset.cameraId = a.cameraId;
      el.dataset.riskLevel = a.riskLevel;
      const t = new Date(a.timestamp);
      const dateStr = t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const timeStrHeader = t.toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST';
      const timeStrMeta = t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
      el.innerHTML =
        '<header class="alert-item-header">' +
          '<span class="alert-severity">' + escapeHtml(a.riskLevel) + ' RISK</span>' +
          '<time class="alert-time" datetime="' + escapeAttr(a.timestamp) + '" style="color:var(--text-primary);font-weight:700;white-space:nowrap">' + escapeHtml(timeStrHeader) + '</time>' +
        '</header>' +
        '<h4 class="alert-species">' + escapeHtml(a.species) + '</h4>' +
        '<dl class="alert-meta">' +
          '<div class="meta-row"><dt>Zone:</dt><dd>' + escapeHtml(a.zone) + '</dd></div>' +
          '<div class="meta-row"><dt>Confidence:</dt><dd>' + a.confidence + '%</dd></div>' +
          '<div class="meta-row"><dt>Risk Score:</dt><dd>' + a.riskScore + ' / 100</dd></div>' +
          '<div class="meta-row"><dt>Date:</dt><dd>' + escapeHtml(dateStr) + '</dd></div>' +
          '<div class="meta-row"><dt>Time:</dt><dd>' + escapeHtml(timeStrMeta) + '</dd></div>' +
        '</dl>' +
        '<button class="button button--small" type="button" data-alert-id="' + escapeAttr(a.id) + '" aria-label="View details for ' + escapeAttr(a.species) + ' alert">View Details</button>';
      dom.liveAlertsList.appendChild(el);
    });
    // bind view buttons
    $$('.alert-item button[data-alert-id]', dom.liveAlertsList).forEach(b => {
      b.addEventListener('click', () => openAlertDetail(b.dataset.alertId));
    });
  }

  function renderAlertsTable() {
    if (!dom.alertsTableBody) return;
    dom.alertsTableBody.innerHTML = '';
    if (state.alerts.length === 0) {
      if (dom.alertsEmpty) dom.alertsEmpty.hidden = false;
      return;
    }
    if (dom.alertsEmpty) dom.alertsEmpty.hidden = true;
    const filter = state.filter;
    const rows = state.alerts.filter(a => {
      if (filter === 'all' || filter === 'active') return a.status === 'Active';
      if (filter === 'resolved') return a.status !== 'Active';
      return a.riskLevel.toLowerCase() === filter;
    });
    rows.forEach(a => {
      const tr = document.createElement('tr');
      tr.dataset.alertId = a.id;
      tr.dataset.zoneId = a.zoneId;
      tr.dataset.riskLevel = a.riskLevel;
      const t = new Date(a.timestamp);
      const timeStr = t.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) + ' IST';
      tr.innerHTML =
        '<td><time datetime="' + escapeAttr(a.timestamp) + '">' + escapeHtml(timeStr) + '</time></td>' +
        '<td>' + escapeHtml(a.species) + '</td>' +
        '<td>' + escapeHtml(a.zone) + '</td>' +
        '<td><span class="risk-badge risk-badge--' + a.riskLevel.toLowerCase() + '">' + escapeHtml(a.riskLevel) + '</span></td>' +
        '<td>' + a.confidence + '%</td>' +
        '<td>' + escapeHtml(a.status) + '</td>' +
        '<td><button type="button" data-alert-id="' + escapeAttr(a.id) + '">View</button></td>';
      dom.alertsTableBody.appendChild(tr);
    });
    $$('button[data-alert-id]', dom.alertsTableBody).forEach(b => b.addEventListener('click', () => openAlertDetail(b.dataset.alertId)));
  }

  function initAnalyticsFilters() {
    if (!dom.filterButtons.length) return;
    dom.filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        dom.filterButtons.forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        state.filter = btn.dataset.filter || 'all';
        renderAlertsTable();
      });
    });
  }

  function updateDashboard() {
    // Summary cards
    const high = state.alerts.filter(a => a.riskLevel === 'HIGH' && a.status === 'Active').length;
    const medium = state.alerts.filter(a => a.riskLevel === 'MEDIUM' && a.status === 'Active').length;
    const today = state.detections.filter(d => isToday(d.timestamp)).length;
    if (dom.highRiskCount) dom.highRiskCount.textContent = String(high);
    if (dom.mediumRiskCount) dom.mediumRiskCount.textContent = String(medium);
    if (dom.eventsTodayCount) dom.eventsTodayCount.textContent = String(today || state.detections.length);
    updateAnalytics();
  }

  function updateAnalytics() {
    const total = state.detections.length;
    const high = state.detections.filter(d => d.riskLevel === 'HIGH').length;
    const medium = state.detections.filter(d => d.riskLevel === 'MEDIUM').length;
    const low = state.detections.filter(d => d.riskLevel === 'LOW').length;
    const zoneCount = state.detections.filter(d => d.zoneId === state.zone.id).length;

    if (dom.analyticsDetectionCount) dom.analyticsDetectionCount.textContent = total ? total + ' events' : 'No data available';
    if (dom.analyticsRisk) dom.analyticsRisk.textContent = total ? 'HIGH ' + high + ' · MEDIUM ' + medium + ' · LOW ' + low : 'No data available';
    if (dom.analyticsZone) dom.analyticsZone.textContent = state.zone.name + ': ' + zoneCount + ' events';

    // Species distribution
    if (dom.analyticsSpecies) {
      if (!total) dom.analyticsSpecies.textContent = 'No data available';
      else {
        const counts = {};
        state.detections.forEach(d => counts[d.species] = (counts[d.species] || 0) + 1);
        const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v])=> k + ' ' + v).join(' · ');
        dom.analyticsSpecies.textContent = top || 'No data';
      }
    }
    if (dom.analyticsTime) {
      if (!total) dom.analyticsTime.textContent = 'No data available';
      else {
        const hours = {};
        state.detections.forEach(d => { const h = new Date(d.timestamp).getHours(); hours[h]=(hours[h]||0)+1; });
        const peak = Object.entries(hours).sort((a,b)=>b[1]-a[1])[0];
        dom.analyticsTime.textContent = peak ? 'Peak: ' + String(peak[0]).padStart(2,'0') + ':00 IST' : 'No data';
      }
    }
    if (dom.analyticsResponse) {
      const resolved = state.alerts.filter(a => a.status !== 'Active').length;
      dom.analyticsResponse.textContent = total ? resolved + ' acknowledged / ' + state.alerts.length + ' total' : 'No data available';
    }
    renderSamplePatterns();
  }

  // ------------------------------------------------------
  // 10b. PATTERN ANALYSIS — SAMPLE data for demo + live hook
  // Sample cards live in #pattern-list (index.html). When the
  // backend exposes GET /api/patterns the live rows replace
  // the samples. SAMPLE badges stay until live data arrives.
  // ------------------------------------------------------
  const SAMPLE_PATTERNS = [
    { id: 'pat-dec-paddy', title: 'Zone 1 + Dec + Paddy + Night → Elephant HIGH', detail: '8 of last 10 Dec nights · conf 80%', kind: 'famous', status: 'Suggested' },
    { id: 'pat-pressure-moon', title: 'Pressure drop + dark moon + 2-night streak → Boar raid', detail: 'Novel rule mined by system · conf 65%', kind: 'novel', status: 'Suggested' },
    { id: 'pat-prey-tiger', title: 'Deer within 2h → Tiger follows same trail', detail: '5 of 6 sequences · conf 83% · Official', kind: 'co-occurrence', status: 'Official' }
  ];

  async function fetchLivePatterns() {
    if (!CONFIG.API_BASE) return null;
    try {
      const res = await fetch(CONFIG.API_BASE + '/api/patterns', { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return Array.isArray(data) ? data : (Array.isArray(data.patterns) ? data.patterns : null);
    } catch (e) {
      return null; // backend not ready — keep samples
    }
  }

  async function renderSamplePatterns() {
    const list = document.getElementById('pattern-list');
    if (!list) return;
    // Live data wins when backend is up; samples stay as clearly-labeled fallback.
    const live = await fetchLivePatterns();
    if (live && live.length) {
      list.querySelectorAll('[data-pattern-id]').forEach(card => {
        const badge = card.querySelector('.risk-badge');
        if (badge) { badge.textContent = 'LIVE'; badge.className = 'risk-badge risk-badge--low'; }
      });
      const note = document.getElementById('pattern-analysis-note');
      if (note) note.textContent = 'Live patterns from GET /api/patterns — officer confirms Yes/No in Alert Details.';
      return;
    }
    // Samples already in HTML — stamp values from one source of truth + log for judges.
    SAMPLE_PATTERNS.forEach(p => {
      const card = list.querySelector('[data-pattern-id="' + p.id + '"]');
      if (!card) return;
      card.setAttribute('data-pattern-status', p.status);
      const val = card.querySelector('.analytics-value');
      if (val) val.textContent = p.detail;
    });
    console.info('[WILDGUARD] Pattern Analysis showing SAMPLE data (3 example rules). Connect backend /api/patterns for live.');
  }

  function isToday(iso) {
    try {
      const d = new Date(iso);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    } catch { return false; }
  }


  // ------------------------------------------------------
// MANUAL SMS + WHATSAPP ALERT BUTTON
// ------------------------------------------------------
function initManualAlert() {
  const button = dom.sendAlertButton;

  if (!button) return;

  button.addEventListener('click', async () => {
    const originalText = button.innerHTML;

    button.disabled = true;
    button.innerHTML = '⏳ Sending...';

    try {
      const response = await fetch(`${CONFIG.API_BASE}/send-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      if (data.success) {
        alert('✅ Alert sent successfully!');

        if (typeof announce === 'function') {
          announce('Manual wildlife alert sent.');
        }
      } else {
        alert(
          '❌ Alert failed: ' +
          (data.message || 'Unknown error')
        );
      }

    } catch (error) {
      console.error('[WILDGUARD] Alert error:', error);

      alert(
        '❌ Cannot send alert. Make sure the FastAPI backend is running.'
      );

    } finally {
      button.disabled = false;
      button.innerHTML = originalText;
    }
  });
}



  // ------------------------------------------------------
  // 11. ALERT DETAIL PANEL
  // ------------------------------------------------------
  function initAlerts() {
    // Delegation for any View buttons in live list or table that existed on load
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-alert-id]');
      if (!btn) return;
      // Only handle if inside alerts areas
      if (btn.closest('#live-alerts-list') || btn.closest('#alerts-table-body')) {
        const id = btn.dataset.alertId;
        // Prevent double handling if already bound directly
        if (dom.alertDetailPanel && !dom.alertDetailPanel.hidden && dom.alertDetailPanel.dataset.alertId === id) return;
        // let renderLiveAlerts direct listeners handle live list; this is fallback for table
      }
    });
    if (dom.alertDetailClose) dom.alertDetailClose.addEventListener('click', closeAlertDetail);
    if (dom.buttonCloseAlert) dom.buttonCloseAlert.addEventListener('click', closeAlertDetail);
    if (dom.buttonAcknowledge) dom.buttonAcknowledge.addEventListener('click', acknowledgeCurrentAlert);
    if (dom.alertDetailPanel) {
      dom.alertDetailPanel.addEventListener('click', (e) => {
        if (e.target === dom.alertDetailPanel) closeAlertDetail();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.alertDetailPanel && !dom.alertDetailPanel.hidden) closeAlertDetail();
    });
    // Bind static demo buttons (tiger / boar)
    $$('.alert-item button[data-alert-id]').forEach(b => b.addEventListener('click', () => openAlertDetail(b.dataset.alertId)));
    $$('#alerts-table-body button[data-alert-id]').forEach(b => b.addEventListener('click', () => openAlertDetail(b.dataset.alertId)));
  }

  function openAlertDetail(alertId) {
    const alert = state.alerts.find(a => a.id === alertId);
    // Fallback: if state doesn't have it (static HTML demo), synthesize from DOM
    let data = alert;
    if (!data) {
      const el = document.getElementById(alertId);
      if (el) {
        data = {
          id: alertId,
          species: (el.querySelector('.alert-species') || {}).textContent || 'Unknown',
          zone: state.zone.name,
          zoneId: el.dataset.zoneId || state.zone.id,
          cameraId: el.dataset.cameraId || state.camera.id,
          riskLevel: el.dataset.riskLevel || 'HIGH',
          riskScore: 85,
          confidence: 94,
          direction: 'Northeast',
          timestamp: el.querySelector('time') ? el.querySelector('time').getAttribute('datetime') : new Date().toISOString(),
          status: 'Active'
        };
      } else {
        console.warn('[WILDGUARD] Alert not found:', alertId);
        return;
      }
    }
    if (!dom.alertDetailPanel) return;
    dom.alertDetailPanel.dataset.alertId = data.id;
    if (dom.detailSeverity) { dom.detailSeverity.textContent = data.riskLevel + ' RISK'; dom.detailSeverity.setAttribute('data-risk-level', data.riskLevel); }
    if (dom.detailSpecies) dom.detailSpecies.textContent = data.species;
    if (dom.detailConfidence) dom.detailConfidence.textContent = data.confidence + '% confidence';
    if (dom.detailZone) dom.detailZone.textContent = data.zone;
    if (dom.detailCamera) dom.detailCamera.textContent = data.cameraId === 'camera-01' ? 'Camera 01' : data.cameraId;
    if (dom.detailTimestamp) {
      const t = new Date(data.timestamp);
      dom.detailTimestamp.innerHTML = '<time datetime="' + escapeAttr(data.timestamp) + '">' + t.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) + ' IST</time>';
    }
    if (dom.detailDirection) dom.detailDirection.textContent = data.direction;
    if (dom.detailRiskScore) dom.detailRiskScore.textContent = data.riskScore + ' / 100';
    dom.alertDetailPanel.hidden = false;
    document.body.style.overflow = 'hidden';
    // Focus trap simple
    if (dom.alertDetailClose) dom.alertDetailClose.focus();
  }

  function closeAlertDetail() {
    if (!dom.alertDetailPanel) return;
    dom.alertDetailPanel.hidden = true;
    dom.alertDetailPanel.dataset.alertId = '';
    document.body.style.overflow = '';
  }

  function acknowledgeCurrentAlert() {
    const id = dom.alertDetailPanel ? dom.alertDetailPanel.dataset.alertId : null;
    if (!id) return;
    const a = state.alerts.find(x => x.id === id);
    if (a) {
      a.status = 'Acknowledged';
      renderLiveAlerts();
      renderAlertsTable();
      updateDashboard();
      persistState();
      announce('Alert acknowledged: ' + a.species + ' in ' + a.zone);
    }
    closeAlertDetail();
  }

  // ------------------------------------------------------
  // 12. MAP — Leaflet with graceful fallback
  // ------------------------------------------------------
  function initMap() {
    const mapEl = document.getElementById('map');
    const largeEl = document.getElementById('map-large');
    if (typeof window.L === 'undefined') {
      console.warn('[WILDGUARD] Leaflet not found. Add to HTML <head>:\n' +
        '<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />\n' +
        '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>');
      if (mapEl) mapEl.setAttribute('data-leaflet', 'missing');
      if (largeEl) largeEl.setAttribute('data-leaflet', 'missing');
      return;
    }
    try {
      const center = getZoneLatLng();
      if (mapEl) {
        const m = L.map('map', { zoomControl: false, attributionControl: true }).setView([center.lat, center.lng], CONFIG.FALLBACK_ZOOM);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(m);
        // Hide placeholder
        const ph = mapEl.querySelector('.map-placeholder');
        if (ph) ph.style.display = 'none';
        const zoneMarker = L.circleMarker([center.lat, center.lng], {
          radius: 9, color: '#1f7a3a', fillColor: '#1f7a3a', fillOpacity: 0.9, weight: 2
        }).addTo(m).bindPopup('<b>' + escapeHtml(state.zone.name) + '</b><br>Camera 01 coverage');
        const detectionMarker = L.marker([center.lat, center.lng], { opacity: 0 });
        state.maps.main = m;
        state.maps.markers.zone = zoneMarker;
        state.maps.markers.detection = detectionMarker;
        updateMapZoneMarker();
      }
      if (largeEl) {
        const m2 = L.map('map-large', { zoomControl: true }).setView([center.lat, center.lng], CONFIG.FALLBACK_ZOOM);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap'
        }).addTo(m2);
        const ph2 = largeEl.querySelector('.map-placeholder');
        if (ph2) ph2.style.display = 'none';
        const z2 = L.circleMarker([center.lat, center.lng], {
          radius: 10, color: '#1f7a3a', fillColor: '#1f7a3a', fillOpacity: 0.9, weight: 2
        }).addTo(m2);
        state.maps.large = m2;
        state.maps.markers.zoneLarge = z2;
      }
    } catch (e) {
      console.error('[WILDGUARD] Map init failed', e);
    }
  }

  function updateMapZoneMarker() {
    const c = getZoneLatLng();
    const isConfigured = state.zone.latitude !== null && state.zone.longitude !== null;
    const latlng = [c.lat, c.lng];
    if (state.maps.markers.zone) {
      state.maps.markers.zone.setLatLng(latlng);
      if (state.maps.main) state.maps.main.setView(latlng, state.maps.main.getZoom());
    }
    if (state.maps.markers.zoneLarge) {
      state.maps.markers.zoneLarge.setLatLng(latlng);
      if (state.maps.large) state.maps.large.setView(latlng, state.maps.large.getZoom());
    }
    // Update popup to reflect configured vs fallback
    if (!isConfigured) {
      console.info('[WILDGUARD] Zone coordinates not configured — map using fallback center. Set in Settings.');
    }
  }

  function updateMapWithDetection(d) {
    // Coordinates: use detection lat/lng if present, else zone center (camera → zone association)
    let lat = d.latitude;
    let lng = d.longitude;
    if (lat === null || lng === null) {
      const c = getZoneLatLng();
      lat = c.lat; lng = c.lng;
    }
    const latlng = [lat, lng];
    const popupHtml =
      '<div style="min-width:160px">' +
      '<b>' + escapeHtml(d.species) + '</b> <span style="float:right">' + d.confidence + '%</span><br>' +
      '<span style="display:inline-block;margin:4px 0;padding:2px 6px;border-radius:999px;font-size:11px;font-weight:800;' +
      (d.riskLevel==='HIGH'?'background:rgba(224,58,62,0.14);color:#e03a3e;border:1px solid rgba(224,58,62,0.32)': d.riskLevel==='MEDIUM'?'background:rgba(230,154,44,0.13);color:#c98515;border:1px solid rgba(230,154,44,0.30)':'background:rgba(46,184,114,0.12);color:#2eb872;border:1px solid rgba(46,184,114,0.28)') +
      '">' + escapeHtml(d.riskLevel) + ' · ' + d.riskScore + '/100</span><br>' +
      escapeHtml(d.zone) + ' · ' + escapeHtml(d.direction) + '<br>' +
      '<small>' + new Date(d.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST</small>' +
      '</div>';
    try {
      if (state.maps.markers.detection && state.maps.main) {
        state.maps.markers.detection.setLatLng(latlng).setOpacity(1)
          .bindPopup(popupHtml).openPopup();
        state.maps.main.setView(latlng, state.maps.main.getZoom());
      }
      // Also show on large map as a separate marker
      if (state.maps.large) {
        if (!state.maps.markers.detectionLarge) {
          state.maps.markers.detectionLarge = L.marker(latlng).addTo(state.maps.large).bindPopup(popupHtml);
        } else {
          state.maps.markers.detectionLarge.setLatLng(latlng).setPopupContent(popupHtml).openPopup();
        }
        state.maps.large.setView(latlng, state.maps.large.getZoom());
      }
    } catch (e) {
      // Map may not be initialized (Leaflet missing) — not fatal
      console.warn('[WILDGUARD] updateMap skipped — map not ready', e.message);
    }
  }

  // ------------------------------------------------------
  // 13. BACKEND INTEGRATION (placeholders)
  // ------------------------------------------------------
  async function fetchDetections() {
    if (!CONFIG.API_BASE) {
      console.info('[WILDGUARD] API_BASE not set — skipping fetchDetections (using demo/local data)');
      return [];
    }
    try {
      const url = CONFIG.API_BASE + CONFIG.ENDPOINTS.detections;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Expected array');
      data.forEach(handleDetection);
      return data;
    } catch (e) {
      console.warn('[WILDGUARD] fetchDetections failed — backend unavailable:', e.message);
      announce('Backend unavailable for detections.');
      return [];
    }
  }

  async function fetchCameraStatus() {
    if (!CONFIG.API_BASE) return null;
    try {
      const url = CONFIG.API_BASE + CONFIG.ENDPOINTS.camera;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.status) setCameraStatus(data.status);
      if (data && data.lastSeen) { state.lastSeen = data.lastSeen; updateDeviceHeartbeat(); }
      return data;
    } catch (e) {
      console.warn('[WILDGUARD] fetchCameraStatus failed:', e.message);
      return null;
    }
  }

  async function fetchAlerts() {
    if (!CONFIG.API_BASE) return [];
    try {
      const url = CONFIG.API_BASE + CONFIG.ENDPOINTS.alerts;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      return data;
    } catch (e) {
      console.warn('[WILDGUARD] fetchAlerts failed:', e.message);
      return [];
    }
  }

  // For polling — call fetchDetections every N seconds when backend is configured
  let pollTimer = null;
  function startPolling(intervalMs = 5000) {
    if (!CONFIG.API_BASE) { console.warn('[WILDGUARD] Cannot poll — API_BASE not configured'); return; }
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchDetections, intervalMs);
  }
  function stopPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }

  // ------------------------------------------------------
  // 14. DEMO / SIMULATION MODE
  // ------------------------------------------------------
  const DEMO_SPECIES = [
    { species: 'Wild Boar', baseRisk: 'MEDIUM' },
    { species: 'Elephant', baseRisk: 'HIGH' },
    { species: 'Deer', baseRisk: 'LOW' },
    { species: 'Leopard', baseRisk: 'HIGH' },
    { species: 'Tiger', baseRisk: 'HIGH' }
  ];
  const DEMO_DIRECTIONS = ['Towards settlement', 'Towards forest', 'Northeast', 'East', 'North', 'Southwest', 'Along water channel'];

  function simulateDetection(overrides) {
    const pick = DEMO_SPECIES[Math.floor(Math.random() * DEMO_SPECIES.length)];
    const dir = DEMO_DIRECTIONS[Math.floor(Math.random() * DEMO_DIRECTIONS.length)];
    const confidence = 68 + Math.floor(Math.random() * 29); // 68-96
    const demoRisk = calculateDemoRisk(pick.species, confidence, dir);
    // Small jitter around zone center if configured
    const base = getZoneLatLng();
    const jitter = 0.004;
    const lat = base.lat + (Math.random() - 0.5) * jitter;
    const lng = base.lng + (Math.random() - 0.5) * jitter;
    const payload = {
      id: 'demo-' + Date.now(),
      species: pick.species,
      confidence: confidence,
      riskLevel: demoRisk.level,
      riskScore: demoRisk.score,
      zone: state.zone.name,
      zone_id: state.zone.id,
      camera_id: state.camera.id,
      movementDirection: dir,
      direction: dir,
      timestamp: new Date().toISOString(),
      latitude: lat,
      longitude: lng,
      ...overrides
    };
    return handleDetection(payload);
  }

  function startDemoMode() {
    if (state.demoTimer) return;
    console.info('[WILDGUARD] Demo mode started — interval ' + CONFIG.DEMO_INTERVAL_MS + 'ms');
    simulateDetection(); // immediate
    state.demoTimer = setInterval(simulateDetection, CONFIG.DEMO_INTERVAL_MS);
    announce('Demo mode active.');
  }
  function stopDemoMode() {
    if (state.demoTimer) clearInterval(state.demoTimer);
    state.demoTimer = null;
    announce('Demo mode stopped.');
  }

  // ------------------------------------------------------
  // 15. PERSISTENCE
  // ------------------------------------------------------
  function persistState() {
    try {
      const toSave = {
        detections: state.detections.slice(0, 30),
        alerts: state.alerts.slice(0, 30),
        zone: state.zone,
        camera: state.camera,
        cameraStatus: state.cameraStatus
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) { console.warn('[WILDGUARD] persist failed', e.message); }
  }
  function loadPersistedState() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) {
        // No saved state — start clean (0 alerts)
        renderLiveAlerts();
        renderAlertsTable();
        updateDashboard();
        return;
      }
      const parsed = JSON.parse(raw);
      // One-time cleanup: remove old hard-coded demo alerts (alert-001/002) that user removed from HTML
      if (parsed.alerts && Array.isArray(parsed.alerts) && parsed.alerts.some(a => a.id === 'alert-001' || a.id === 'alert-002')) {
        localStorage.removeItem(CONFIG.STORAGE_KEY);
        state.alerts = [];
        state.detections = [];
        renderLiveAlerts();
        renderAlertsTable();
        updateDashboard();
        console.info('[WILDGUARD] Cleared old demo alerts (alert-001/002) from localStorage — starting clean');
        return;
      }
      if (parsed.zone) {
        const pz = parsed.zone;
        if (pz.name) state.zone.name = pz.name;
        if (pz.id) state.zone.id = pz.id;
        if (typeof pz.latitude === 'number' && Number.isFinite(pz.latitude)) state.zone.latitude = pz.latitude;
        if (typeof pz.longitude === 'number' && Number.isFinite(pz.longitude)) state.zone.longitude = pz.longitude;
        // Fix old bug: saved 21.4624,null for Similipal — patch to 86.7679
        if (state.zone.latitude === 21.4624 && state.zone.longitude === null) {
          state.zone.longitude = 86.7679;
          console.info('[WILDGUARD] Patched old Similipal longitude null → 86.7679');
        }
        // If still null but input shows a value, use input
        if (state.zone.longitude === null && dom.settingZoneLng && dom.settingZoneLng.value) {
          const v = parseFloat(String(dom.settingZoneLng.value).replace(/[^0-9.\-]/g,''));
          if (Number.isFinite(v)) state.zone.longitude = v;
        }
      } else {
        // No parsed zone — ensure defaults are Similipal
        state.zone.latitude = 21.4624;
        state.zone.longitude = 86.7679;
      }
      if (parsed.camera) state.camera = { ...state.camera, ...parsed.camera };
      if (parsed.cameraStatus) state.cameraStatus = parsed.cameraStatus;
      if (Array.isArray(parsed.detections) && parsed.detections.length) {
        state.detections = parsed.detections;
        // show latest
        if (state.detections[0]) updateLatestDetectionUI(state.detections[0]);
      }
      if (Array.isArray(parsed.alerts) && parsed.alerts.length) {
        state.alerts = parsed.alerts;
        renderLiveAlerts();
        renderAlertsTable();
      }
      // Reflect zone into inputs + labels — don't re-parse from inputs (avoids clearing if DOM not ready)
      if (dom.settingZoneName) dom.settingZoneName.value = state.zone.name;
      if (dom.settingZoneLat && state.zone.latitude !== null) dom.settingZoneLat.value = String(state.zone.latitude);
      if (dom.settingZoneLng && state.zone.longitude !== null) dom.settingZoneLng.value = String(state.zone.longitude);
      if (dom.settingCameraName) dom.settingCameraName.value = state.camera.name;
      // Directly update labels from state (instead of re-reading inputs which could be empty)
      const latText = state.zone.latitude !== null ? String(state.zone.latitude) : 'Not configured';
      const lngText = state.zone.longitude !== null ? String(state.zone.longitude) : 'Not configured';
      const coordText = (state.zone.latitude !== null && state.zone.longitude !== null) ? state.zone.latitude.toFixed(4) + ', ' + state.zone.longitude.toFixed(4) : 'Not configured — set in Settings';
      [dom.mapZoneLat, dom.mapViewLat, dom.cameraZoneLat, dom.settingsSummaryLat].forEach(el => { if (el) el.textContent = latText; });
      [dom.mapZoneLng, dom.mapViewLng, dom.cameraZoneLng, dom.settingsSummaryLng].forEach(el => { if (el) el.textContent = lngText; });
      if (dom.mapZoneCoords) dom.mapZoneCoords.textContent = coordText;
      if (dom.mapViewCoords) dom.mapViewCoords.textContent = coordText;
      if (dom.headerActiveZone) dom.headerActiveZone.textContent = state.zone.name;
      if (dom.mapActiveZone) dom.mapActiveZone.textContent = state.zone.name;
      updateMapZoneMarker();
    } catch (e) { console.warn('[WILDGUARD] loadPersistedState failed', e.message); }
  }
  function clearPersistedState() {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    state.detections = [];
    state.alerts = [];
    renderLiveAlerts();
    renderAlertsTable();
    updateDashboard();
    announce('Session data cleared.');
  }

  // ------------------------------------------------------
  // 16. UTILITIES
  // ------------------------------------------------------
  function announce(msg) {
    if (dom.liveRegion) dom.liveRegion.textContent = msg;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g,'&quot;'); }

  // ------------------------------------------------------
  // 17. EXPOSE PUBLIC API (for console, backend integration, and demo button)
  // ------------------------------------------------------
  window.WILDGUARD = {
    CONFIG,
    state,
    handleDetection,
    simulateDetection,
    startDemoMode,
    stopDemoMode,
    startCamera,
    stopCamera,
    setCameraStatus,
    setCameraSource,
    handleVideoFileSelected,
    // Roboflow Workflow — Base Workflow (sanjay-s-pmuqs/wildguard-u4zlr, image)
    runWildguardWorkflow,
    extractPredictions,
    sendFrameToWorkflow,
    sendFrameToWorkflowOrModel,
    fetchWithRetry,
    // Roboflow direct model + debug — use in console: WILDGUARD.testWorkflow(), WILDGUARD.getRoboflowUrl()
    testRoboflow,
    testWorkflow,
    getRoboflowUrl,
    isRoboflowConfigured,
    sendFrameToRoboflow,
    captureFrameAsBase64,
    setSystemStatus,
    fetchDetections,
    fetchCameraStatus,
    fetchAlerts,
    startPolling,
    stopPolling,
    clearPersistedState,
    // Demo risk helper — clearly labeled DEMO
    calculateDemoRisk
  };

  // ======================================================
  // ROBOFLOW INTEGRATION — uses ONE variable ROBOFLOW_API_KEY
  // yolo26n model — requires correct MODEL_ID + VERSION from friend
  // Fallback to simulateDetection() only if DEMO_MODE=true
  // ======================================================
  function isRoboflowConfigured() {
    const k = (CONFIG.ROBOFLOW_API_KEY || ROBOFLOW_API_KEY || '').trim();
    // Also allow ROBOFLOW_API_KEY = '' temporary while testing — but warn
    return CONFIG.ROBOFLOW_ENABLED && k && k !== 'YOUR_ROBOFLOW_API_KEY_HERE' && k.length > 10;
  }

  // Debug helper — call in console: WILDGUARD.testRoboflow() or WILDGUARD.testWorkflow()
  async function testRoboflow() { return testWorkflow(); }
  async function testWorkflow() {
    console.log('[WILDGUARD] Testing Workflow:', CONFIG.ROBOFLOW_WORKSPACE + '/workflows/' + CONFIG.ROBOFLOW_WORKFLOW_ID);
    console.log('  Key set:', isRoboflowConfigured() ? 'YES (' + (CONFIG.ROBOFLOW_API_KEY||ROBOFLOW_API_KEY).slice(0,6) + '...)' : 'NO — paste at line 17');
    console.log('  Workflow:', CONFIG.ROBOFLOW_WORKSPACE + '/workflows/' + CONFIG.ROBOFLOW_WORKFLOW_ID, '→', CONFIG.ROBOFLOW_WORKFLOW_URL);
    console.log('  Fallback model:', CONFIG.ROBOFLOW_MODEL_ID, 'v' + CONFIG.ROBOFLOW_VERSION, '(2249 imgs)');
    console.log('  DEMO_MODE:', CONFIG.DEMO_MODE);
    if (!isRoboflowConfigured()) {
      announce('Test: No key — paste ROBOFLOW_API_KEY at line 17');
      return { ok:false, reason:'no_key' };
    }
    const b64 = captureFrameAsBase64();
    if (!b64) {
      console.warn('  No video frame — start LIVE or play VIDEO first, then test again');
      announce('Test: Start Live or Video first to capture a frame');
      return { ok:false, reason:'no_frame' };
    }
    console.log('  Frame captured:', (b64.length/1024).toFixed(1),'KB — sending to Workflow...');
    const data = await sendFrameToWorkflowOrModel(b64);
    console.log('  Response:', data);
    if (!data) { announce('Test: Workflow no response — check API key / workflow deployed'); return { ok:false, data:null }; }
    const preds = extractPredictions(data);
    console.log('  Predictions:', preds.length, preds.slice(0,2));
    announce('Test: ' + (preds.length ? preds.length + ' prediction(s): ' + preds[0].class : '0 predictions — try a frame with Tiger'));
    return data;
  }

  function getRoboflowUrl() {
    const k = (CONFIG.ROBOFLOW_API_KEY || ROBOFLOW_API_KEY || '').trim();
    // Supports both formats: "workspace/model" or just "model" — version appended
    // Docs: https://docs.roboflow.com/inference/hosted-api
    const modelPath = String(CONFIG.ROBOFLOW_MODEL_ID || '').replace(/^\//,'').replace(/\/$/,'');
    const ver = CONFIG.ROBOFLOW_VERSION || 1;
    const conf = CONFIG.ROBOFLOW_CONFIDENCE || 40;
    const overlap = CONFIG.ROBOFLOW_OVERLAP || 30;
    // Use detect.roboflow.com (works for most); switch to serverless.roboflow.com if your model requires it
    return 'https://detect.roboflow.com/' + modelPath + '/' + ver + '?api_key=' + encodeURIComponent(k) + '&confidence=' + conf + '&overlap=' + overlap;
  }

  // Capture current video frame as base64 JPEG for Roboflow
  function captureFrameAsBase64() {
    const vid = dom.cameraFeed;
    if (!vid || vid.videoWidth === 0 || vid.videoHeight === 0) return null;
    // Hidden canvas — reuse if exists
    let canvas = document.getElementById('roboflow-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'roboflow-canvas';
      canvas.style.display = 'none';
      document.body.appendChild(canvas);
    }
    const w = 640; // downscale for speed/cost
    const h = Math.round((vid.videoHeight / vid.videoWidth) * w);
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(vid, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    // Roboflow expects raw base64 without data:image prefix when POSTing as binary
    return dataUrl.split(',')[1];
  }

  // Draw Roboflow bbox on overlay (x,y are center coords, width/height normalized to 640xH then mapped to %)
  function drawRoboflowBox(pred) {
    const bbox = document.querySelector('#camera-overlay-01 [data-overlay="bbox"]');
    const label = document.querySelector('#camera-overlay-01 [data-overlay="label"]');
    if (!bbox || !pred) return;
    // pred: {x, y, width, height, class, confidence}
    const vid = dom.cameraFeed;
    const scaleX = 100 / (vid ? vid.videoWidth || 640 : 640);
    const scaleY = 100 / (vid ? vid.videoHeight || 360 : 360);
    // Convert center+size to left/top/width/height in %
    // Roboflow coords are in pixels of the submitted image (640xH), so convert to % of video element
    const canvasW = 640;
    const canvasH = vid ? Math.round((vid.videoHeight / vid.videoWidth) * 640) : 360;
    const leftPct = ((pred.x - pred.width/2) / canvasW) * 100;
    const topPct = ((pred.y - pred.height/2) / canvasH) * 100;
    const widthPct = (pred.width / canvasW) * 100;
    const heightPct = (pred.height / canvasH) * 100;
    const isHigh = (()=>{ const r=document.getElementById('overlay-risk'); return r && r.getAttribute('data-risk-level')==='HIGH'; })();
    // Set bbox color based on risk (HIGH=red, MEDIUM=yellow, LOW=green) — risk already set in label above, but check again
    const riskForBox = document.getElementById('overlay-risk')?.getAttribute('data-risk-level') || 'HIGH';
    const boxColor = riskForBox==='HIGH' ? '#e03a3e' : riskForBox==='MEDIUM' ? '#e69a2c' : '#2eb872';
    bbox.hidden = false;
    bbox.style.cssText = 'position:absolute;left:' + leftPct.toFixed(1) + '%;top:' + topPct.toFixed(1) + '%;width:' + widthPct.toFixed(1) + '%;height:' + heightPct.toFixed(1) + '%;border:2px solid ' + boxColor + ';box-shadow:0 0 0 1px rgba(0,0,0,0.5);border-radius:4px;pointer-events:none;';
    if (label) {
      label.hidden = false;
      const sp = document.getElementById('overlay-species');
      const cf = document.getElementById('overlay-confidence');
      const rk = document.getElementById('overlay-risk');
      if (sp) sp.textContent = pred.class;
      if (cf) cf.textContent = Math.round(pred.confidence * 100) + '%';
      if (rk) {
        const demo = calculateDemoRisk(pred.class, pred.confidence * 100, '');
        rk.textContent = demo.level;
        rk.setAttribute('data-risk-level', demo.level);
      }
    }
    // KEEP box/label visible while animal is in frame — only hide when no animal (handled in runOneDetectionCycle)
  }

  // ======================================================
  // WORKFLOW CLIENT — wildguard-u4zlr — Base Workflow (2249 imgs, v2)
  // Input: image (image) — Output: list[dict] keyed by workflow output names
  // REST: POST https://serverless.roboflow.com/sanjay-s-pmuqs/workflows/wildguard-u4zlr
  // Body: { api_key, inputs: { image: {type:"url"|"base64", value} } }
  // Grounded in task spec + real project: WildGuard (person/dog/Tiger) 640x640
  // ======================================================
  let lastRoboflowError = null;

  // Helper: fetch with timeout + 2 retries
  async function fetchWithRetry(url, opts, timeoutMs = 15000, retries = 2) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...opts, signal: ctrl.signal });
        clearTimeout(t);
        return res;
      } catch (e) {
        clearTimeout(t);
        lastErr = e;
        if (attempt < retries) {
          const backoff = 400 * Math.pow(2, attempt); // 400, 800
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr;
  }

  // Run the Base Workflow — single well-named function, defensive parsing
  async function runWildguardWorkflow({ imageUrl, imageBase64, parameters = {} } = {}) {
    if (!isRoboflowConfigured()) throw Object.assign(new Error('ROBOFLOW_API_KEY not set — set env or script.js:17'), { code: 'NO_KEY' });
    const apiKey = (CONFIG.ROBOFLOW_API_KEY || ROBOFLOW_API_KEY || '').trim();
    if (!imageUrl && !imageBase64) throw Object.assign(new Error('imageUrl or imageBase64 required'), { code: 'NO_INPUT' });
    if (imageUrl && !imageUrl.startsWith('https://')) throw Object.assign(new Error('Workflow image URL must be https:// — http:// is rejected'), { code: 'BAD_URL' });
    // Prefer local FastAPI proxy (no CORS) if running, else direct + corsproxy fallback
    const rawUrl = CONFIG.ROBOFLOW_WORKFLOW_URL;
    const useLocalProxy = CONFIG.API_BASE && CONFIG.API_BASE != '';
    const url = useLocalProxy ? (CONFIG.API_BASE + '/workflow-infer') : ((typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) ? 'https://corsproxy.io/?' + encodeURIComponent(rawUrl) : rawUrl);
    const isLocalProxy = url.includes('/workflow-infer');
    const payload = isLocalProxy ? { image: imageUrl ? { type: 'url', value: imageUrl } : { type: 'base64', value: imageBase64 } } : {
      api_key: apiKey,
      inputs: {
        image: imageUrl ? { type: 'url', value: imageUrl } : { type: 'base64', value: imageBase64 }
      }
    };
    // Merge workflow parameters exactly as declared (if any)
    if (parameters && Object.keys(parameters).length) payload.inputs = { ...payload.inputs, ...parameters };
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 15000, 2);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      const err = new Error(`Workflow failed ${res.status}: ${txt.slice(0,300)}`);
      err.code = 'WORKFLOW_HTTP_' + res.status;
      err.status = res.status;
      err.body = txt;
      throw err;
    }
    const data = await res.json(); // list[dict] or dict
    return data;
  }

  // Defensive extraction — workflow REST returns {outputs:[{predictions:{predictions:[...]}}]} ; MCP returns list[dict]
  function extractPredictions(workflowData) {
    if (!workflowData) return [];
    // Handle REST: {outputs:[...], profiler_trace:[]} or MCP: list[dict]
    let entry = null;
    if (Array.isArray(workflowData)) entry = workflowData[0];
    else if (workflowData.outputs && Array.isArray(workflowData.outputs)) entry = workflowData.outputs[0];
    else entry = workflowData;
    if (!entry || typeof entry !== 'object') return [];
    // Try common output keys — do NOT hard-code one name; handle nested {image, predictions}
    const candidates = ['predictions', 'output', 'result', 'detections', 'inference', 'model_predictions', 'tiger_predictions'];
    for (const k of candidates) {
      const val = entry[k];
      if (Array.isArray(val)) return val;
      if (val && typeof val === 'object' && Array.isArray(val.predictions)) return val.predictions;
      if (val && typeof val === 'object' && val.image && Array.isArray(val.predictions)) return val.predictions;
    }
    // Search any value that looks like predictions
    for (const v of Object.values(entry)) {
      if (Array.isArray(v) && v.length && v[0] && typeof v[0].class !== 'undefined') return v;
      if (v && typeof v === 'object' && Array.isArray(v.predictions)) return v.predictions;
      if (v && typeof v === 'object' && v.image && Array.isArray(v.predictions)) return v.predictions;
      // Base64 image outputs — skip (output_image, etc., >50KB)
      if (typeof v === 'string' && v.length > 50000) continue;
      if (v && typeof v === 'object' && v.type==='base64' && v.value && v.value.length>50000) continue;
    }
    return [];
  }

  async function sendFrameToWorkflow(b64) {
    // b64 is raw base64 JPEG (no data: prefix)
    try {
      const data = await runWildguardWorkflow({ imageBase64: b64 });
      return data;
    } catch (e) {
      lastRoboflowError = { status: e.status || e.code || 'WORKFLOW_ERR', body: e.message + (e.body ? ' | ' + e.body.slice(0,300) : ''), url: CONFIG.ROBOFLOW_WORKFLOW_URL };
      console.warn('[WILDGUARD] Workflow error', e.status, e.message);
      return null;
    }
  }

  let lastWorkflowError = null;
  async function sendFrameToRoboflow() {
    const vid = dom.cameraFeed;
    if (!vid || vid.paused || vid.ended || vid.readyState < 2) return null;
    if (!isRoboflowConfigured()) return null;
    const b64 = captureFrameAsBase64();
    if (!b64) return null;
    const url = getRoboflowUrl();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: b64
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        lastRoboflowError = { status: res.status, body: txt.slice(0,500), url: url.replace(/api_key=[^&]+/,'api_key=***') };
        console.warn('[WILDGUARD] Roboflow error', res.status, txt.slice(0,300), 'URL:', lastRoboflowError.url);
        if (res.status === 401) announce('Roboflow API key invalid — check ROBOFLOW_API_KEY');
        if (res.status === 404) announce('Roboflow Model not found — check MODEL_ID/VERSION: ' + CONFIG.ROBOFLOW_MODEL_ID + ' v' + CONFIG.ROBOFLOW_VERSION);
        // Try serverless fallback for 404 on detect host (some workflows use serverless)
        if (res.status === 404 && url.includes('detect.roboflow.com')) {
          const altUrl = url.replace('detect.roboflow.com','serverless.roboflow.com');
          console.info('[WILDGUARD] Retrying with serverless host:', altUrl.replace(/api_key=[^&]+/,'api_key=***'));
          try {
            const res2 = await fetch(altUrl, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:b64 });
            if (res2.ok) { const d2 = await res2.json(); lastRoboflowError = null; return d2; }
            const txt2 = await res2.text().catch(()=> '');
            lastRoboflowError = { status: res2.status, body: txt2.slice(0,500), url: altUrl.replace(/api_key=[^&]+/,'api_key=***') };
            console.warn('[WILDGUARD] Serverless retry also failed', res2.status, txt2.slice(0,200));
          } catch(e2) { console.warn('[WILDGUARD] Serverless retry failed', e2.message); }
        }
        return null;
      }
      lastRoboflowError = null;
      const data = await res.json();
      return data; // { predictions: [...] }
    } catch (e) {
      lastRoboflowError = { status: 'CORS/NETWORK', body: e.message, url: url.replace(/api_key=[^&]+/,'api_key=***') };
      console.warn('[WILDGUARD] Roboflow fetch failed (offline/CORS?) —', e.message, 'URL:', lastRoboflowError.url);
      return null;
    }
  }

  // Unified loop — LIVE webcam AND VIDEO file both use this now
  // If Roboflow configured: real detections; else: simulateDetection()
  let videoDetectionTimer = null;
  let isDetecting = false; // prevent overlapping requests

  // Shim for smoke test — keeps payloads small, skips polygon points
  function sanitizePredictions(preds) {
    if (!Array.isArray(preds)) return [];
    return preds.map(p => ({ class: p.class, confidence: p.confidence, x: p.x, y: p.y, width: p.width, height: p.height, class_id: p.class_id }));
  }

  // Unified send — Workflow first (if enabled), fallback to direct model
  async function sendFrameToWorkflowOrModel(b64) {
    if (!isRoboflowConfigured()) return null;
    if (CONFIG.ROBOFLOW_USE_WORKFLOW) {
      const wfData = await sendFrameToWorkflow(b64);
      if (wfData) {
        const wfPreds = extractPredictions(wfData);
        if (wfPreds.length || (wfData && !lastRoboflowError)) return { predictions: sanitizePredictions(wfPreds), _raw: wfData, _source: 'workflow' };
        // Workflow returned 0 preds or empty — still valid, don't fallback yet
        if (wfPreds.length === 0 && wfData) return { predictions: [], _raw: wfData, _source: 'workflow' };
      }
      // Workflow failed (401/404) — fallback to direct model if enabled
      console.info('[WILDGUARD] Workflow returned no data or error, falling back to direct model', CONFIG.ROBOFLOW_MODEL_ID);
    }
    // Direct model fallback
    const mData = await sendFrameToRoboflow();
    if (mData && Array.isArray(mData.predictions)) return { predictions: sanitizePredictions(mData.predictions), _raw: mData, _source: 'model' };
    return mData;
  }

  async function runOneDetectionCycle() {
    if (isDetecting) return;
    const vid = dom.cameraFeed;
    if (!vid || vid.paused || vid.ended || (!vid.src && !vid.srcObject)) return;
    isDetecting = true;
    try {
      if (isRoboflowConfigured()) {
        const data = await sendFrameToWorkflowOrModel(captureFrameAsBase64());
        if (data && Array.isArray(data.predictions) && data.predictions.length) {
          // Take highest-confidence prediction
          data.predictions.sort((a,b)=> b.confidence - a.confidence);
          const top = data.predictions[0];
          // Map Roboflow prediction → WILDGUARD detection
          const species = String(top.class).trim();
          const confidence = Math.round(top.confidence * 100);
          const demo = calculateDemoRisk(species, confidence, '');
          const base = getZoneLatLng();
          const jitter = 0.003;
          handleDetection({
            species: species,
            confidence: confidence,
            riskLevel: demo.level,
            riskScore: demo.score,
            zone: state.zone.name,
            zone_id: state.zone.id,
            camera_id: state.camera.id,
            movementDirection: 'Detected',
            direction: 'Detected',
            timestamp: new Date().toISOString(),
            latitude: base.lat + (Math.random()-0.5)*jitter,
            longitude: base.lng + (Math.random()-0.5)*jitter
          });
          drawRoboflowBox(top);
          announce('Detected: ' + species + ' ' + confidence + '%');
        } else if (data && Array.isArray(data.predictions) && data.predictions.length === 0) {
          // No animal in this frame — animal gone, reset 30s cooldown so next animal alerts immediately
          state.lastAlertAt = 0;
          const bbox = document.querySelector('#camera-overlay-01 [data-overlay="bbox"]');
          if (bbox) bbox.hidden = true;
          const lbl = document.querySelector('#camera-overlay-01 [data-overlay="label"]');
          if (lbl) lbl.hidden = true;
        } else {
          // API failed — surface it so you know why "nothing happens"
          const url = getRoboflowUrl();
          console.warn('[WILDGUARD] Roboflow request failed — URL:', url);
          if (CONFIG.DEMO_MODE) {
            console.warn('[WILDGUARD] DEMO_MODE true — falling back to simulation');
            simulateDetection();
          } else {
            announce('Roboflow failed — check Model ID/Version or key. See console (F12) for URL. Set DEMO_MODE=true to test without API.');
          }
        }
      } else {
        // No key configured — respect DEMO_MODE=false (no fake alerts)
        if (CONFIG.DEMO_MODE) {
          simulateDetection();
          const bbox = document.querySelector('#camera-overlay-01 [data-overlay="bbox"]');
          if (bbox) {
            bbox.hidden = false;
            bbox.style.cssText = 'position:absolute;left:' + (18+Math.random()*42) + '%;top:' + (18+Math.random()*38) + '%;width:' + (22+Math.random()*18) + '%;height:' + (32+Math.random()*20) + '%;border:2px solid #e69a2c;box-shadow:0 0 0 1px rgba(0,0,0,0.4);border-radius:4px;';
            setTimeout(() => { bbox.hidden = true; }, 1200);
          }
        } else {
          // Single log to avoid spam — user will see announce from startVideoDetectionLoop
          if (!window._wildguardNoKeyWarned) {
            console.warn('[WILDGUARD] No Roboflow key — DEMO_MODE=false so no fake detections. Paste key at line 17 or set DEMO_MODE=true');
            window._wildguardNoKeyWarned = true;
          }
        }
      }
    } finally {
      isDetecting = false;
    }
  }

  function startVideoDetectionLoop() {
    stopVideoDetectionLoop();
    if (!isRoboflowConfigured()) {
      if (CONFIG.DEMO_MODE) {
        console.info('[WILDGUARD] Roboflow not configured — DEMO_MODE=true, using simulation');
      } else {
        console.info('[WILDGUARD] Roboflow not configured and DEMO_MODE=false — NO fake detections. Paste key at script.js:17 ROBOFLOW_API_KEY or set DEMO_MODE=true to simulate');
        announce('No API key set — detections paused until you paste Roboflow key');
        // Still start loop but it will do nothing until key is set (respect DEMO_MODE=false)
      }
    } else {
      console.info('[WILDGUARD] Roboflow detection active — model:', CONFIG.ROBOFLOW_MODEL_ID, 'v' + CONFIG.ROBOFLOW_VERSION);
    }
    setTimeout(runOneDetectionCycle, 1200);
    videoDetectionTimer = setInterval(runOneDetectionCycle, CONFIG.DETECT_INTERVAL_MS || 1800);
  }

  function stopVideoDetectionLoop() {
    if (videoDetectionTimer) clearInterval(videoDetectionTimer);
    videoDetectionTimer = null;
    isDetecting = false;
    const bbox = document.querySelector('#camera-overlay-01 [data-overlay="bbox"]');
    if (bbox) bbox.hidden = true;
    const lbl = document.querySelector('#camera-overlay-01 [data-overlay="label"]');
    if (lbl) lbl.hidden = true;
  }

  function handleVideoFileSelected(file) {
    if (!file || !dom.cameraFeed) return;
    // Stop any live camera stream if active
    stopCamera();
    stopVideoDetectionLoop();
    // Revoke previous object URL if any
    if (dom.cameraFeed.dataset.objectUrl) {
      URL.revokeObjectURL(dom.cameraFeed.dataset.objectUrl);
    }
    const url = URL.createObjectURL(file);
    dom.cameraFeed.dataset.objectUrl = url;
    dom.cameraFeed.dataset.fileName = file.name;
    setCameraSource('video');
    dom.cameraFeed.srcObject = null;
    dom.cameraFeed.removeAttribute('srcObject');
    dom.cameraFeed.src = url;
    dom.cameraFeed.muted = false;
    dom.cameraFeed.controls = true;
    dom.cameraFeed.loop = true; // loop until you switch to Live or pick another file
    if (dom.cameraEmpty) dom.cameraEmpty.hidden = true;
    setCameraStatus('ONLINE');
    setCameraSource('video');
    dom.cameraFeed.play().then(() => {
      announce('Playing selected video: ' + file.name + (isRoboflowConfigured() ? ' — Roboflow detecting' : ' — simulating detection'));
      startVideoDetectionLoop();
    }).catch(err => {
      console.warn('[WILDGUARD] Video play failed', err.message);
      announce('Selected video ready — press play');
      // still start detection loop when user presses play
      startVideoDetectionLoop();
    });
    // Handle pause / ended — with loop=true, don't stop on ended, just continue
    dom.cameraFeed.onpause = () => {
      if (dom.cameraFeed.ended && !dom.cameraFeed.loop) {
        stopVideoDetectionLoop();
        announce('Video ended');
      }
    };
    dom.cameraFeed.onended = () => {
      if (dom.cameraFeed.loop) {
        // Looping — keep detecting, don't stop
        announce('Video looped — continuing detection');
        if (!videoDetectionTimer) startVideoDetectionLoop();
      } else {
        stopVideoDetectionLoop();
        announce('Video playback ended');
      }
    };
    dom.cameraFeed.onplay = () => {
      if (!videoDetectionTimer) startVideoDetectionLoop();
    };
  }

  function initVideoFileInput() {
    const fileInput = document.getElementById('video-file-input');
    const selectBtns = document.querySelectorAll('#button-select-video, [data-action="select-video"]');
    if (!fileInput) return;
    selectBtns.forEach(btn => {
      btn.addEventListener('click', () => fileInput.click());
    });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleVideoFileSelected(file);
    });
    // Also allow drag & drop on video wrapper
    const wrapper = document.querySelector('.camera-feed-wrapper');
    if (wrapper) {
      wrapper.addEventListener('dragover', e => { e.preventDefault(); wrapper.style.outline = '2px dashed var(--accent)'; });
      wrapper.addEventListener('dragleave', () => { wrapper.style.outline = ''; });
      wrapper.addEventListener('drop', e => {
        e.preventDefault();
        wrapper.style.outline = '';
        const file = e.dataTransfer.files && e.dataTransfer.files[0];
        if (file && file.type.startsWith('video/')) handleVideoFileSelected(file);
        else announce('Please drop a video file');
      });
    }
  }

  // Wire video file input after DOM ready
  document.addEventListener('DOMContentLoaded', initVideoFileInput);

})();
