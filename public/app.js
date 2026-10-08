// ==========================================================================
// CertifyPro - Client Application Engine (v3 - Robust Rewrite)
// ==========================================================================

// Global State
const state = {
  templateInfo: {
    filename: 'Certificate-Master.pdf',
    width: 841.89,
    height: 595.276
  },
  displayZoom: 1.0,
  activeFieldKey: 'name',
  recipients: [],
  fields: {
    name: {
      enabled: true,
      locked: false,
      key: 'name',
      label: 'Recipient Name',
      sampleText: 'Dr. Elizabeth Montgomery',
      fontId: 'PlayfairDisplay',
      fontSize: 30,
      color: '#800020',
      align: 'center',
      x: 421,
      y: 280
    },
    course: {
      enabled: false,
      locked: false,
      key: 'course',
      label: 'Course / Title',
      sampleText: 'Advanced Machine Learning & AI',
      fontId: 'Montserrat',
      fontSize: 18,
      color: '#0f2b59',
      align: 'center',
      x: 421,
      y: 235
    },
    date: {
      enabled: false,
      locked: false,
      key: 'date',
      label: 'Date',
      sampleText: 'October 24, 2026',
      fontId: 'PlayfairDisplay',
      fontSize: 14,
      color: '#1a202c',
      align: 'center',
      x: 230,
      y: 155
    },
    certId: {
      enabled: false,
      locked: false,
      key: 'certId',
      label: 'Certificate ID',
      sampleText: 'CERT-2026-9841',
      fontId: 'Cinzel',
      fontSize: 12,
      color: '#64748b',
      align: 'center',
      x: 610,
      y: 155
    }
  }
};

// Safe element getter - never crashes
function el(id) {
  return document.getElementById(id);
}

// Initialize Application
document.addEventListener('DOMContentLoaded', function() {
  try {
    if (window.lucide) lucide.createIcons();
    setupTabs();
    setupEventListeners();
    setupDragAndDropOverlays();
    loadTemplateAndRender();
    loadSampleRecipients();
    refreshOutputFolderStatus();
  } catch (e) {
    console.error('Init error:', e);
  }
});

// ================= TEMPLATE & CANVAS RENDERING =================

async function loadTemplateAndRender() {
  const loader = el('canvasLoader');
  const imgEl = el('pdfCanvas');
  const container = el('canvasContainer');

  if (!imgEl || !container) {
    console.error('Canvas elements not found in DOM');
    return;
  }

  if (loader) loader.style.display = 'flex';

  try {
    // Step 1: Load template metadata (cache-busted)
    const res = await fetch('/api/template-info?t=' + Date.now());
    const data = await res.json();
    if (data.success) {
      state.templateInfo = data;
      const nameEl = el('currentTemplateName');
      if (nameEl) nameEl.textContent = data.filename;
      const dimEl = el('canvasDimensions');
      if (dimEl) {
        const orient = data.width >= data.height ? 'Landscape' : 'Portrait';
        dimEl.textContent = `${Math.round(data.width)} × ${Math.round(data.height)} pt (${orient})`;
      }

      // Auto-position fields proportionally if template dimensions changed
      if (!state._lastTemplateDim || state._lastTemplateDim.w !== data.width || state._lastTemplateDim.h !== data.height) {
        state._lastTemplateDim = { w: data.width, h: data.height };
        Object.values(state.fields).forEach(f => {
          f.x = Math.round(data.width / 2);
        });
        state.fields.name.y = Math.round(data.height * 0.47);
        state.fields.course.y = Math.round(data.height * 0.395);
        state.fields.date.x = Math.round(data.width * 0.27);
        state.fields.date.y = Math.round(data.height * 0.26);
        state.fields.certId.x = Math.round(data.width * 0.73);
        state.fields.certId.y = Math.round(data.height * 0.26);
      }
    }
  } catch (e) {
    console.warn('Template metadata fetch failed, using defaults:', e.message);
  }

  // Display at 100% native provided size by default (1 pt = 1 px, exact as provided)
  if (state.displayZoom === undefined || state.displayZoom === null) {
    state.displayZoom = 1.0;
  }
  updateZoomDisplay();

  // Step 3: Load the template image
  const displayW = Math.round(state.templateInfo.width * state.displayZoom);
  const displayH = Math.round(state.templateInfo.height * state.displayZoom);

  container.style.width  = displayW + 'px';
  container.style.height = displayH + 'px';

  imgEl.style.width  = displayW + 'px';
  imgEl.style.height = displayH + 'px';

  imgEl.onload = function() {
    if (loader) loader.style.display = 'none';
    updateAllOverlays();
    initCanvasHistory();
    console.log('✅ Certificate template loaded successfully');
  };
  imgEl.onerror = function() {
    if (loader) loader.style.display = 'none';
    console.error('❌ Failed to load template image');
    showToast('Could not load template image from server', 'error');
  };
  imgEl.src = '/api/template-image?t=' + Date.now();
}

function updateZoomDisplay() {
  const zt = el('zoomLevelText');
  if (zt) zt.textContent = Math.round(state.displayZoom * 100) + '%';
}

// Update all overlay bounding boxes to match state coordinates
function updateAllOverlays() {
  const container = el('canvasContainer');
  if (!container) return;

  const containerWidth  = container.offsetWidth  || (state.templateInfo.width  * state.displayZoom);
  const containerHeight = container.offsetHeight || (state.templateInfo.height * state.displayZoom);

  const scaleX = containerWidth  / state.templateInfo.width;
  const scaleY = containerHeight / state.templateInfo.height;

  const showAll = (el('showAllFieldsCheck') || {}).checked !== false;

  Object.keys(state.fields).forEach(key => {
    const field = state.fields[key];
    const box = el('overlayBox-' + key);
    const textEl = el('overlayText-' + key);
    if (!box || !textEl) return;

    if (!field.enabled) {
      box.style.display = 'none';
      return;
    }

    box.style.display = (showAll || key === state.activeFieldKey) ? 'flex' : 'none';

    textEl.textContent  = field.sampleText || field.label;
    textEl.style.fontFamily = field.fontId;
    textEl.style.fontSize   = (field.fontSize * scaleX) + 'px';
    textEl.style.color      = field.color;
    textEl.style.textAlign  = field.align;

    box.classList.toggle('active', key === state.activeFieldKey);
    box.classList.toggle('locked', !!field.locked);

    const labelEl = box.querySelector('.field-box-label');
    if (labelEl) {
      const iconName = key === 'name' ? 'user' : key === 'course' ? 'award' : key === 'date' ? 'calendar' : 'hash';
      labelEl.innerHTML = field.locked
        ? `<i data-lucide="lock"></i> ${field.label} (Locked)`
        : `<i data-lucide="${iconName}"></i> ${field.label}`;
    }

    // Position: PDF (0,0) = bottom-left; DOM (0,0) = top-left
    const domY = containerHeight - (field.y * scaleY);
    const domX = field.x * scaleX;
    box.style.left = domX + 'px';
    box.style.top  = domY + 'px';

    if (field.align === 'center') {
      box.style.transform = 'translate(-50%, -50%)';
    } else if (field.align === 'right') {
      box.style.transform = 'translate(-100%, -50%)';
    } else {
      box.style.transform = 'translate(0%, -50%)';
    }
  });

  // Update active coord readout
  const activeF = state.fields[state.activeFieldKey];
  if (activeF) {
    const an = el('activeFieldName');
    const ac = el('activeFieldCoords');
    if (an) an.textContent = activeF.label;
    if (ac) ac.textContent = 'X: ' + Math.round(activeF.x) + ' pt, Y: ' + Math.round(activeF.y) + ' pt';
  }

  if (window.lucide) lucide.createIcons();
}

// ================= DRAG & DROP OVERLAY INTERACTIONS =================

function setupDragAndDropOverlays() {
  const container = el('canvasContainer');
  if (!container) return;

  let isDragging = false;
  let dragFieldKey = null;
  let startMouseX = 0, startMouseY = 0;
  let startFieldX = 0, startFieldY = 0;

  // Attach mousedown to each overlay box
  Object.keys(state.fields).forEach(key => {
    const box = el('overlayBox-' + key);
    if (!box) return;
    box.addEventListener('mousedown', function(e) {
      e.preventDefault();
      e.stopPropagation();

      // Select this field
      state.activeFieldKey = key;
      updateActiveFieldUI();

      if (state.fields[key].locked) {
        showToast('🔒 ' + state.fields[key].label + ' is locked. Click "Unlocked" to move.', 'info');
        return;
      }

      isDragging = true;
      dragFieldKey = key;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      startFieldX = state.fields[key].x;
      startFieldY = state.fields[key].y;
      document.body.style.cursor = 'move';
    });
  });

  window.addEventListener('mousemove', function(e) {
    if (!isDragging || !dragFieldKey) return;

    const cw = container.offsetWidth;
    const ch = container.offsetHeight;
    const scaleX = cw / state.templateInfo.width;
    const scaleY = ch / state.templateInfo.height;

    const dPxX = e.clientX - startMouseX;
    const dPxY = e.clientY - startMouseY;

    let newX = Math.round(startFieldX + dPxX / scaleX);
    let newY = Math.round(startFieldY - dPxY / scaleY); // invert Y

    newX = Math.max(10, Math.min(state.templateInfo.width - 10, newX));
    newY = Math.max(10, Math.min(state.templateInfo.height - 10, newY));

    state.fields[dragFieldKey].x = newX;
    state.fields[dragFieldKey].y = newY;

    if (dragFieldKey === state.activeFieldKey) {
      const cx = el('coordX'); if (cx) cx.value = newX;
      const cy = el('coordY'); if (cy) cy.value = newY;
    }
    updateAllOverlays();
  });

  window.addEventListener('mouseup', function() {
    if (isDragging) {
      if (dragFieldKey && (state.fields[dragFieldKey].x !== startFieldX || state.fields[dragFieldKey].y !== startFieldY)) {
        commitCanvasState();
      }
      isDragging = false;
      dragFieldKey = null;
      document.body.style.cursor = 'default';
    }
  });
}

// ================= CANVAS UNDO / REDO HISTORY =================

const canvasHistory = {
  undoStack: [],
  redoStack: [],
  maxDepth: 50,
  isApplying: false,
  debounceTimer: null
};

function createHistorySnapshot() {
  return {
    activeFieldKey: state.activeFieldKey,
    fields: JSON.parse(JSON.stringify(state.fields))
  };
}

function initCanvasHistory() {
  canvasHistory.undoStack = [createHistorySnapshot()];
  canvasHistory.redoStack = [];
  updateUndoRedoUI();
}

function commitCanvasState() {
  if (canvasHistory.isApplying) return;
  const snapshot = createHistorySnapshot();
  const snapStr = JSON.stringify(snapshot.fields);

  if (canvasHistory.undoStack.length > 0) {
    const lastSnapStr = JSON.stringify(canvasHistory.undoStack[canvasHistory.undoStack.length - 1].fields);
    if (lastSnapStr === snapStr) return; // No change in field configurations
  }

  canvasHistory.undoStack.push(snapshot);
  if (canvasHistory.undoStack.length > canvasHistory.maxDepth) {
    canvasHistory.undoStack.shift();
  }
  canvasHistory.redoStack = []; // Clear redo stack on new action
  updateUndoRedoUI();
}

function commitCanvasStateDebounced(delay = 250) {
  clearTimeout(canvasHistory.debounceTimer);
  canvasHistory.debounceTimer = setTimeout(() => {
    commitCanvasState();
  }, delay);
}

function undoCanvas() {
  if (canvasHistory.undoStack.length <= 1) return;
  canvasHistory.isApplying = true;
  try {
    const current = canvasHistory.undoStack.pop();
    canvasHistory.redoStack.push(current);
    const target = canvasHistory.undoStack[canvasHistory.undoStack.length - 1];
    applyHistorySnapshot(target);
    showToast('↩️ Canvas: Undone', 'info');
  } finally {
    canvasHistory.isApplying = false;
    updateUndoRedoUI();
  }
}

function redoCanvas() {
  if (canvasHistory.redoStack.length === 0) return;
  canvasHistory.isApplying = true;
  try {
    const target = canvasHistory.redoStack.pop();
    canvasHistory.undoStack.push(target);
    applyHistorySnapshot(target);
    showToast('↪️ Canvas: Redone', 'info');
  } finally {
    canvasHistory.isApplying = false;
    updateUndoRedoUI();
  }
}

function applyHistorySnapshot(snapshot) {
  if (!snapshot || !snapshot.fields) return;
  state.fields = JSON.parse(JSON.stringify(snapshot.fields));
  if (snapshot.activeFieldKey && state.fields[snapshot.activeFieldKey]) {
    state.activeFieldKey = snapshot.activeFieldKey;
  }
  // Synchronize field selector chips
  document.querySelectorAll('.field-selector-chips .chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.field === state.activeFieldKey);
  });
  updateActiveFieldUI();
  updateAllOverlays();
}

function updateUndoRedoUI() {
  const btnUndo = el('btnUndo');
  const btnRedo = el('btnRedo');
  const canUndo = canvasHistory.undoStack.length > 1;
  const canRedo = canvasHistory.redoStack.length > 0;
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (btnUndo) {
    btnUndo.disabled = !canUndo;
    btnUndo.title = canUndo 
      ? `Undo (${isMac ? '⌘Z' : 'Ctrl+Z'})` 
      : 'Nothing to undo';
  }
  if (btnRedo) {
    btnRedo.disabled = !canRedo;
    btnRedo.title = canRedo 
      ? `Redo (${isMac ? '⌘⇧Z' : 'Ctrl+Y'})` 
      : 'Nothing to redo';
  }
}


// ================= FIELD CONFIGURATION UI =================

function selectActiveField(key) {
  state.activeFieldKey = key;
  document.querySelectorAll('.field-selector-chips .chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.field === key);
  });
  updateActiveFieldUI();
  updateAllOverlays();
}

function updateActiveFieldUI() {
  const field = state.fields[state.activeFieldKey];
  if (!field) return;

  const fec = el('fieldEnabledCheck'); if (fec) fec.checked = field.enabled;
  const fst = el('fieldSampleText');   if (fst) fst.value   = field.sampleText;
  const fff = el('fieldFontFamily');   if (fff) fff.value   = field.fontId;
  const ffs = el('fieldFontSize');     if (ffs) ffs.value   = field.fontSize;
  const fsd = el('fontSizeDisplay');   if (fsd) fsd.textContent = field.fontSize + ' pt';
  const fcp = el('fieldColorPicker');  if (fcp) fcp.value   = field.color;
  const cht = el('colorHexText');      if (cht) cht.textContent = field.color;
  const cx  = el('coordX');            if (cx)  cx.value    = field.x;
  const cy  = el('coordY');            if (cy)  cy.value    = field.y;

  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.align === field.align);
  });

  const btnLock = el('btnLockField');
  const lockIcon = el('lockIcon');
  const lockText = el('lockText');
  const btnCenter = el('btnCenterField');
  const coordX = el('coordX');
  const coordY = el('coordY');

  if (btnLock) {
    if (field.locked) {
      btnLock.classList.add('locked');
      if (lockText) lockText.textContent = 'Locked';
      if (lockIcon) lockIcon.setAttribute('data-lucide', 'lock');
      if (coordX)  coordX.disabled = true;
      if (coordY)  coordY.disabled = true;
      if (btnCenter) btnCenter.disabled = true;
    } else {
      btnLock.classList.remove('locked');
      if (lockText) lockText.textContent = 'Unlocked';
      if (lockIcon) lockIcon.setAttribute('data-lucide', 'unlock');
      if (coordX)  coordX.disabled = false;
      if (coordY)  coordY.disabled = false;
      if (btnCenter) btnCenter.disabled = false;
    }
    if (window.lucide) lucide.createIcons();
  }
}

// ================= TABS =================

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

// ================= DATA LOADING =================

function parsePastedNames() {
  const textarea = el('rawNamesInput');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) {
    state.recipients = [];
  } else {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    state.recipients = lines.map((line, idx) => {
      const parts = line.split(',').map(p => p.trim());
      return {
        name:   parts[0] || ('Recipient ' + (idx + 1)),
        course: parts[1] || state.fields.course.sampleText,
        date:   parts[2] || state.fields.date.sampleText,
        certId: parts[3] || ('CERT-2026-' + (1000 + idx + 1))
      };
    });
  }
  updateRecipientsTable();
}

function updateRecipientsTable() {
  const tbody = el('recipientsTableBody');
  const count = state.recipients.length;

  const rc = el('recipientCount');    if (rc) rc.textContent = count;
  const dc = el('dataCountBadge');    if (dc) dc.textContent = count;

  if (!tbody) return;
  if (count === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No recipient data loaded yet.</td></tr>';
    return;
  }

  const activeIdx = state.previewRecipientIndex || 0;
  tbody.innerHTML = state.recipients.map((rec, i) => `
    <tr class="recipient-row ${i === activeIdx ? 'selected-preview' : ''}" data-index="${i}" title="Click to preview on certificate canvas">
      <td><span class="value-badge">${i + 1}</span></td>
      <td><strong>${escapeHtml(rec.name)}</strong></td>
      <td style="color: var(--text-muted); font-size: 0.74rem;">${escapeHtml(rec.course || rec.date || '')}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.recipient-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.index, 10);
      updatePreviewRecipient(idx);
    });
  });
}

function updatePreviewRecipient(index) {
  if (!state.recipients || state.recipients.length === 0) return;
  state.previewRecipientIndex = Math.max(0, Math.min(index, state.recipients.length - 1));
  const rec = state.recipients[state.previewRecipientIndex];
  if (!rec) return;

  if (rec.name) {
    state.fields.name.sampleText = rec.name;
    const fst = el('fieldSampleText');
    if (fst && state.activeFieldKey === 'name') fst.value = rec.name;
  }
  if (rec.course) {
    state.fields.course.sampleText = rec.course;
    const fst = el('fieldSampleText');
    if (fst && state.activeFieldKey === 'course') fst.value = rec.course;
  }
  if (rec.date) {
    state.fields.date.sampleText = rec.date;
    const fst = el('fieldSampleText');
    if (fst && state.activeFieldKey === 'date') fst.value = rec.date;
  }
  if (rec.certId) {
    state.fields.certId.sampleText = rec.certId;
    const fst = el('fieldSampleText');
    if (fst && state.activeFieldKey === 'certId') fst.value = rec.certId;
  }

  // Update live canvas overlay boxes immediately
  updateAllOverlays();

  // Highlight selected table row
  const tbody = el('recipientsTableBody');
  if (tbody) {
    tbody.querySelectorAll('.recipient-row').forEach((row, i) => {
      row.classList.toggle('selected-preview', i === state.previewRecipientIndex);
    });
  }
}

function loadSampleRecipients() {
  const sampleData = [
    { name: "Dr. Elizabeth Montgomery",  course: "Advanced Machine Learning & AI",       date: "October 24, 2026", certId: "CERT-2026-9841" },
    { name: "Alexander James Sterling",  course: "Full-Stack Cloud Architecture",          date: "October 24, 2026", certId: "CERT-2026-9842" },
    { name: "Sophia Mei-Ling Chen",       course: "Data Science & Quantum Analytics",      date: "October 24, 2026", certId: "CERT-2026-9843" },
    { name: "Marcus Aurelius Thorne",     course: "Executive AI Leadership & Strategy",    date: "October 24, 2026", certId: "CERT-2026-9844" },
    { name: "Elena Rostova",              course: "Cybersecurity & Cryptography",           date: "October 24, 2026", certId: "CERT-2026-9845" },
    { name: "Kavita Sharma",              course: "Distributed Systems Engineering",        date: "October 24, 2026", certId: "CERT-2026-9846" },
    { name: "Liam O'Connor",              course: "Modern DevOps & Site Reliability",       date: "October 24, 2026", certId: "CERT-2026-9847" },
    { name: "Fatima Al-Zahra",            course: "Computer Vision & Deep Learning",        date: "October 24, 2026", certId: "CERT-2026-9848" }
  ];

  const textarea = el('rawNamesInput');
  if (textarea) textarea.value = sampleData.map(d => `${d.name}, ${d.course}, ${d.date}, ${d.certId}`).join('\n');
  state.recipients = sampleData;
  updateRecipientsTable();
  updatePreviewRecipient(0);
  showToast('8 sample recipients loaded!', 'success');
}

// ================= SMART COLUMN MAPPING & FILE UPLOAD =================

const NAME_KEYWORDS = [
  'fullname', 'full name', 'candidatename', 'candidate name',
  'studentname', 'student name', 'recipientname', 'recipient name',
  'participantname', 'participant name', 'attendeename', 'attendee name',
  'person name', 'member name', 'name', 'candidate', 'student', 'recipient', 'participant', 'attendee'
];

const COURSE_KEYWORDS = [
  'coursename', 'course name', 'coursetitle', 'course title', 'course',
  'program', 'workshop', 'title', 'event', 'topic', 'track', 'subject', 'department'
];

const DATE_KEYWORDS = [
  'issuedate', 'issue date', 'completiondate', 'completion date',
  'certificatedate', 'certificate date', 'eventdate', 'event date',
  'date', 'dated', 'timestamp'
];

const CERT_ID_KEYWORDS = [
  'certificateid', 'certificate id', 'certid', 'cert id', 'cert_id',
  'registrationno', 'registration no', 'regno', 'reg no', 'rollno', 'roll no',
  'id', 'serial', 'code', 'number'
];

function findSmartColumn(headers, keywords) {
  // Pass 1: exact normalized match (alphanumeric only)
  for (const kw of keywords) {
    const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = headers.findIndex(h => String(h).toLowerCase().replace(/[^a-z0-9]/g, '') === cleanKw);
    if (idx !== -1) return idx;
  }
  // Pass 2: includes match (e.g. "Candidate Full Name" contains "fullname")
  for (const kw of keywords) {
    const cleanKw = kw.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = headers.findIndex(h => {
      const cleanH = String(h).toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanH.includes(cleanKw);
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

function handleFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      if (!rows || rows.length === 0) {
        showToast('The uploaded file appears to be empty.', 'error');
        return;
      }

      // Find first non-empty header row
      let headerRowIdx = 0;
      while (headerRowIdx < rows.length && (!rows[headerRowIdx] || rows[headerRowIdx].filter(c => c !== undefined && c !== null && String(c).trim() !== '').length === 0)) {
        headerRowIdx++;
      }

      if (headerRowIdx >= rows.length) {
        showToast('No tabular data found in the file.', 'error');
        return;
      }

      const rawHeaderRow = rows[headerRowIdx] || [];
      const rawHeaders = rawHeaderRow.map((h, i) => {
        const str = String(h ?? '').trim();
        return str ? str : ('Column ' + (i + 1));
      });

      // Save into state for dynamic re-mapping
      state.uploadedFile = {
        name: file.name,
        rawHeaders,
        rows,
        dataStartRow: headerRowIdx + 1
      };

      // Populate column mapping dropdowns
      populateColumnMapperDropdowns(rawHeaders);

      // Smart detection for each field
      const smartNameIdx   = findSmartColumn(rawHeaders, NAME_KEYWORDS);
      const smartCourseIdx = findSmartColumn(rawHeaders, COURSE_KEYWORDS);
      const smartDateIdx   = findSmartColumn(rawHeaders, DATE_KEYWORDS);
      const smartCertIdx   = findSmartColumn(rawHeaders, CERT_ID_KEYWORDS);

      const selName   = el('mapColName');
      const selCourse = el('mapColCourse');
      const selDate   = el('mapColDate');
      const selCertId = el('mapColCertId');

      if (selName)   selName.value   = String(smartNameIdx !== -1 ? smartNameIdx : 0);
      if (selCourse) selCourse.value = String(smartCourseIdx);
      if (selDate)   selDate.value   = String(smartDateIdx);
      if (selCertId) selCertId.value = String(smartCertIdx);

      // Show column mapping section
      const mapSec = el('columnMappingSection');
      if (mapSec) mapSec.style.display = 'flex';

      // Parse and display recipients
      applyColumnMapping();

      const ufn = el('uploadedFileName'); if (ufn) ufn.textContent = `${file.name} (${state.recipients.length} names)`;
      const ufi = el('fileUploadInfo');   if (ufi) ufi.style.display = 'flex';
      const fdz = el('fileDropzone');     if (fdz) fdz.style.display = 'none';
      if (window.lucide) lucide.createIcons();

      const mappedNameHeader = rawHeaders[smartNameIdx !== -1 ? smartNameIdx : 0];
      showToast(`Loaded ${state.recipients.length} recipients using "${mappedNameHeader}" column!`, 'success');
    } catch (err) {
      console.error('File parsing error:', err);
      showToast('Error reading file: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function populateColumnMapperDropdowns(headers) {
  const optionsHtml = headers.map((h, i) => `<option value="${i}">${escapeHtml(h)}</option>`).join('');
  const optionalOptionsHtml = '<option value="-1">-- None / Default --</option>' + optionsHtml;

  const selName   = el('mapColName');
  const selCourse = el('mapColCourse');
  const selDate   = el('mapColDate');
  const selCertId = el('mapColCertId');

  if (selName)   selName.innerHTML   = optionsHtml;
  if (selCourse) selCourse.innerHTML = optionalOptionsHtml;
  if (selDate)   selDate.innerHTML   = optionalOptionsHtml;
  if (selCertId) selCertId.innerHTML = optionalOptionsHtml;
}

function applyColumnMapping() {
  if (!state.uploadedFile || !state.uploadedFile.rows) return;

  const { rows, dataStartRow } = state.uploadedFile;
  const nameIdx   = parseInt(el('mapColName')?.value   ?? '0', 10);
  const courseIdx = parseInt(el('mapColCourse')?.value ?? '-1', 10);
  const dateIdx   = parseInt(el('mapColDate')?.value   ?? '-1', 10);
  const certIdx   = parseInt(el('mapColCertId')?.value ?? '-1', 10);

  const parsedRecipients = [];
  for (let i = dataStartRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const name = String(row[nameIdx] || '').trim();
    if (name) {
      parsedRecipients.push({
        name,
        course: courseIdx !== -1 && row[courseIdx] ? String(row[courseIdx]).trim() : state.fields.course.sampleText,
        date:   dateIdx !== -1   && row[dateIdx]   ? String(row[dateIdx]).trim()   : state.fields.date.sampleText,
        certId: certIdx !== -1   && row[certIdx]   ? String(row[certIdx]).trim()   : ('CERT-2026-' + (1000 + i))
      });
    }
  }

  state.recipients = parsedRecipients;
  updateRecipientsTable();
  const ufn = el('uploadedFileName');
  if (ufn && state.uploadedFile.name) {
    ufn.textContent = `${state.uploadedFile.name} (${parsedRecipients.length} names)`;
  }

  // Auto-enable fields if a column was mapped
  if (courseIdx !== -1) state.fields.course.enabled = true;
  if (dateIdx !== -1)   state.fields.date.enabled = true;
  if (certIdx !== -1)   state.fields.certId.enabled = true;

  // Immediately display first recipient on the certificate canvas
  updatePreviewRecipient(0);
}

// ================= EVENT LISTENERS =================

function setupEventListeners() {
  // Mode toggle buttons
  safeOn('btnModePaste', 'click', () => {
    el('btnModePaste').classList.add('active');
    el('btnModeFile').classList.remove('active');
    const pm = el('pasteModeSection'); if (pm) pm.style.display = 'block';
    const fm = el('fileModeSection');  if (fm) fm.style.display = 'none';
  });
  safeOn('btnModeFile', 'click', () => {
    el('btnModeFile').classList.add('active');
    el('btnModePaste').classList.remove('active');
    const pm = el('pasteModeSection'); if (pm) pm.style.display = 'none';
    const fm = el('fileModeSection');  if (fm) fm.style.display = 'block';
  });

  // Text area
  safeOn('rawNamesInput', 'input', parsePastedNames);
  safeOn('btnLoadSampleNames', 'click', loadSampleRecipients);
  safeOn('btnClearNames', 'click', () => {
    const t = el('rawNamesInput'); if (t) t.value = '';
    state.recipients = [];
    updateRecipientsTable();
  });

  // File
  safeOn('btnBrowseFile', 'click', () => { const dp = el('dataFilePicker'); if (dp) dp.click(); });
  safeOn('dataFilePicker', 'change', (e) => handleFileUpload(e.target.files[0]));
  safeOn('fileDropzone', 'dragover', (e) => { e.preventDefault(); el('fileDropzone').classList.add('dragover'); });
  safeOn('fileDropzone', 'dragleave', () => { const fd = el('fileDropzone'); if (fd) fd.classList.remove('dragover'); });
  safeOn('fileDropzone', 'drop', (e) => {
    e.preventDefault();
    const fd = el('fileDropzone'); if (fd) fd.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files[0]);
  });
  safeOn('btnRemoveUploadedFile', 'click', () => {
    const ufi = el('fileUploadInfo');       if (ufi) ufi.style.display = 'none';
    const map = el('columnMappingSection'); if (map) map.style.display = 'none';
    const fdz = el('fileDropzone');         if (fdz) fdz.style.display = 'flex';
    const dp  = el('dataFilePicker');       if (dp)  dp.value = '';
    state.uploadedFile = null;
    state.recipients = [];
    updateRecipientsTable();
  });

  // Column Mapping selector events
  safeOn('mapColName', 'change', applyColumnMapping);
  safeOn('mapColCourse', 'change', applyColumnMapping);
  safeOn('mapColDate', 'change', applyColumnMapping);
  safeOn('mapColCertId', 'change', applyColumnMapping);

  // Template upload
  safeOn('templateUploadInput', 'change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('template', file);
    try {
      showToast('Uploading & processing new master template...', 'info');
      const res  = await fetch('/api/upload-template', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        showToast(`Master template updated to "${data.originalName}"!`, 'success');
        e.target.value = '';
        await loadTemplateAndRender();
      } else {
        showToast(data.error || 'Upload failed', 'error');
        e.target.value = '';
      }
    } catch (err) {
      showToast('Upload error: ' + err.message, 'error');
      e.target.value = '';
    }
  });

  // Field selector chips
  safeOn('fieldSelectorChips', 'click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip && chip.dataset.field) selectActiveField(chip.dataset.field);
  });

  // Field controls
  safeOn('fieldEnabledCheck', 'change', (e) => {
    state.fields[state.activeFieldKey].enabled = e.target.checked;
    updateAllOverlays();
    commitCanvasState();
  });
  safeOn('fieldSampleText', 'input', (e) => {
    state.fields[state.activeFieldKey].sampleText = e.target.value;
    updateAllOverlays();
  });
  safeOn('fieldSampleText', 'change', () => {
    commitCanvasState();
  });
  safeOn('fieldFontFamily', 'change', (e) => {
    state.fields[state.activeFieldKey].fontId = e.target.value;
    updateAllOverlays();
    commitCanvasState();
  });
  safeOn('fieldFontSize', 'input', (e) => {
    const val = parseInt(e.target.value) || 30;
    state.fields[state.activeFieldKey].fontSize = val;
    const fsd = el('fontSizeDisplay'); if (fsd) fsd.textContent = val + ' pt';
    updateAllOverlays();
  });
  safeOn('fieldFontSize', 'change', () => {
    commitCanvasState();
  });
  safeOn('fieldColorPicker', 'input', (e) => {
    const hex = e.target.value;
    state.fields[state.activeFieldKey].color = hex;
    const cht = el('colorHexText'); if (cht) cht.textContent = hex;
    updateAllOverlays();
  });
  safeOn('fieldColorPicker', 'change', () => {
    commitCanvasState();
  });

  // Color presets
  document.querySelectorAll('.preset-colors .color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const color = dot.dataset.color;
      state.fields[state.activeFieldKey].color = color;
      const fcp = el('fieldColorPicker'); if (fcp) fcp.value = color;
      const cht = el('colorHexText');     if (cht) cht.textContent = color;
      updateAllOverlays();
      commitCanvasState();
    });
  });

  // Alignment
  document.querySelectorAll('.align-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.fields[state.activeFieldKey].align = btn.dataset.align;
      updateAllOverlays();
      commitCanvasState();
    });
  });

  // Coordinate inputs
  safeOn('coordX', 'input', (e) => {
    state.fields[state.activeFieldKey].x = parseFloat(e.target.value) || 0;
    updateAllOverlays();
  });
  safeOn('coordX', 'change', () => {
    commitCanvasState();
  });
  safeOn('coordY', 'input', (e) => {
    state.fields[state.activeFieldKey].y = parseFloat(e.target.value) || 0;
    updateAllOverlays();
  });
  safeOn('coordY', 'change', () => {
    commitCanvasState();
  });

  // Lock / Unlock
  safeOn('btnLockField', 'click', () => {
    const field = state.fields[state.activeFieldKey];
    field.locked = !field.locked;
    updateActiveFieldUI();
    updateAllOverlays();
    commitCanvasState();
    showToast(field.locked ? '🔒 Position locked' : '🔓 Position unlocked', 'info');
  });

  // Center field
  safeOn('btnCenterField', 'click', () => {
    state.fields[state.activeFieldKey].x = Math.round(state.templateInfo.width / 2);
    updateActiveFieldUI();
    updateAllOverlays();
    commitCanvasState();
  });

  // Canvas Undo & Redo Controls
  safeOn('btnUndo', 'click', undoCanvas);
  safeOn('btnRedo', 'click', redoCanvas);

  // Global Keyboard Shortcuts (Undo, Redo, Canvas Arrow Nudges)
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const activeTag = activeEl ? activeEl.tagName.toLowerCase() : '';
    const isTextInput = (activeTag === 'input' && activeEl.type !== 'checkbox' && activeEl.type !== 'radio' && activeEl.type !== 'button') || activeTag === 'textarea';

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? e.metaKey : e.ctrlKey;

    // Check for Undo: Cmd+Z (Mac) or Ctrl+Z (Win/Linux) without Shift
    if (modKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (!isTextInput) {
        e.preventDefault();
        undoCanvas();
      }
      return;
    }

    // Check for Redo: Cmd+Shift+Z, Ctrl+Shift+Z, or Ctrl+Y
    const isRedo = (modKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
                   (modKey && (e.key === 'y' || e.key === 'Y'));
    if (isRedo) {
      if (!isTextInput) {
        e.preventDefault();
        redoCanvas();
      }
      return;
    }

    // Canvas arrow key nudges when not actively typing in an input
    if (!isTextInput && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      const field = state.fields[state.activeFieldKey];
      if (field && !field.locked && field.enabled) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowUp') field.y += step;
        if (e.key === 'ArrowDown') field.y = Math.max(0, field.y - step);
        if (e.key === 'ArrowLeft') field.x = Math.max(0, field.x - step);
        if (e.key === 'ArrowRight') field.x += step;
        updateActiveFieldUI();
        updateAllOverlays();
        commitCanvasStateDebounced(300);
      }
    }
  });

  // Zoom controls
  safeOn('btnZoomIn', 'click', () => {
    state.displayZoom = Math.min(2.0, state.displayZoom + 0.1);
    updateZoomDisplay();
    resizeCanvas();
  });
  safeOn('btnZoomOut', 'click', () => {
    state.displayZoom = Math.max(0.2, state.displayZoom - 0.1);
    updateZoomDisplay();
    resizeCanvas();
  });
  safeOn('btnFitWidth', 'click', () => {
    const viewport = el('canvasViewport');
    if (viewport) {
      const availW = viewport.clientWidth - 80;
      state.displayZoom = Math.min(1.0, Math.max(0.2, availW / state.templateInfo.width));
    }
    updateZoomDisplay();
    resizeCanvas();
  });
  safeOn('btnZoomReset', 'click', () => {
    state.displayZoom = 1.0;
    updateZoomDisplay();
    resizeCanvas();
    showToast('Reset to 100% (Provided Size)', 'info');
  });

  // Guidelines & Show all fields
  safeOn('showGuidelinesCheck', 'change', (e) => {
    const gv = el('guideV'); const gh = el('guideH');
    if (gv) gv.style.display = e.target.checked ? '' : 'none';
    if (gh) gh.style.display = e.target.checked ? '' : 'none';
  });
  safeOn('showAllFieldsCheck', 'change', () => updateAllOverlays());

  // Output folder
  safeOn('btnOpenOutputFolder', 'click', async () => {
    const input = el('outputFolderInput');
    const folderPath = input ? input.value : 'output';
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath })
      });
    } catch (e) {}
  });
  safeOn('btnRefreshOutputFiles', 'click', refreshOutputFolderStatus);

  // Preview modal
  safeOn('btnInstantPreview', 'click', openPreviewModal);
  safeOn('btnClosePreviewModal', 'click', closePreviewModal);
  safeOn('btnClosePreviewModalBottom', 'click', closePreviewModal);
  safeOn('previewModal', 'click', (e) => {
    if (e.target === el('previewModal')) closePreviewModal();
  });
  safeOn('btnPreviewDownloadSingle', 'click', downloadSinglePreview);

  // Batch generation
  safeOn('btnGenerateBatch', 'click', runBatchGeneration);
  safeOn('btnDownloadZip', 'click', downloadBatchZip);
  safeOn('btnCloseModal', 'click', () => {
    const pm = el('progressModal'); if (pm) pm.classList.remove('active');
  });
  safeOn('btnModalOpenFolder', 'click', async () => {
    const fp = el('fullPathDisplay');
    if (!fp) return;
    try {
      await fetch('/api/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: fp.textContent })
      });
    } catch (e) {}
  });
  safeOn('btnModalDownloadZip', 'click', downloadBatchZip);
}

function resizeCanvas() {
  const imgEl = el('pdfCanvas');
  const container = el('canvasContainer');
  if (!imgEl || !container) return;

  const displayW = Math.round(state.templateInfo.width  * state.displayZoom);
  const displayH = Math.round(state.templateInfo.height * state.displayZoom);

  imgEl.style.width  = displayW + 'px';
  imgEl.style.height = displayH + 'px';
  container.style.width  = displayW + 'px';
  container.style.height = displayH + 'px';

  updateAllOverlays();
}

// ================= PREVIEW =================

function buildFieldConfigs() {
  return Object.values(state.fields).filter(f => f.enabled).map(f => ({
    key: f.key, label: f.label, fontId: f.fontId, fontSize: f.fontSize,
    color: f.color, align: f.align, x: f.x, y: f.y
  }));
}

async function openPreviewModal() {
  const modal = el('previewModal');
  const frame = el('previewPdfFrame');
  const loader = el('previewLoader');
  const openTabBtn = el('btnPreviewOpenTab');
  if (!modal || !frame) return;

  modal.classList.add('active');
  if (loader) loader.style.display = 'flex';
  frame.style.opacity = '0.2';
  frame.src = 'about:blank';
  if (openTabBtn) openTabBtn.style.display = 'none';

  const currentIdx = state.previewRecipientIndex || 0;
  const sampleRecord = (state.recipients && state.recipients.length > currentIdx)
    ? state.recipients[currentIdx]
    : {
        name: state.fields.name.sampleText,
        course: state.fields.course.sampleText,
        date: state.fields.date.sampleText,
        certId: state.fields.certId.sampleText
      };

  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleRecord, fields: buildFieldConfigs() })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    frame.src = blobUrl;
    frame.onload = () => {
      if (loader) loader.style.display = 'none';
      frame.style.opacity = '1';
    };
    if (openTabBtn) {
      openTabBtn.href = blobUrl;
      openTabBtn.style.display = 'inline-flex';
    }
    setTimeout(() => {
      if (loader) loader.style.display = 'none';
      frame.style.opacity = '1';
    }, 1200);
  } catch (err) {
    if (loader) loader.style.display = 'none';
    frame.style.opacity = '1';
    console.error('Preview error:', err);
    showToast('Preview error: ' + err.message, 'error');
  }
}

function closePreviewModal() {
  const modal = el('previewModal');
  if (modal) modal.classList.remove('active');
  const frame = el('previewPdfFrame');
  if (frame) frame.src = 'about:blank';
  const loader = el('previewLoader');
  if (loader) loader.style.display = 'none';
  const openTabBtn = el('btnPreviewOpenTab');
  if (openTabBtn) openTabBtn.style.display = 'none';
}

async function downloadSinglePreview() {
  const currentIdx = state.previewRecipientIndex || 0;
  const sampleRecord = (state.recipients && state.recipients.length > currentIdx)
    ? state.recipients[currentIdx]
    : { name: 'Sample_Recipient' };

  try {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sampleRecord, fields: buildFieldConfigs() })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error (${res.status})`);
    }
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const safeName = (sampleRecord.name || 'Sample').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
    a.download = `${safeName}_Certificate.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded preview for ${sampleRecord.name || 'Sample'}`, 'success');
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
}

// ================= BATCH GENERATION =================

async function runBatchGeneration() {
  if (state.recipients.length === 0) {
    showToast('Please load recipient names first.', 'error');
    return;
  }

  const modal = el('progressModal');
  if (modal) modal.classList.add('active');

  const mtitle = el('modalProgressTitle');
  const msub   = el('modalProgressSubtitle');
  const pbFill = el('progressBarFill');
  const pText  = el('progressText');
  const pPct   = el('progressPercent');
  const cfBox  = el('completedFilesBox');

  if (mtitle) mtitle.textContent = 'Generating Certificates...';
  if (msub)   msub.textContent   = 'Creating PDFs with embedded fonts...';
  if (pbFill) pbFill.style.width = '0%';
  if (pText)  pText.textContent  = '0 / ' + state.recipients.length;
  if (pPct)   pPct.textContent   = '0%';
  if (cfBox)  cfBox.style.display = 'none';

  const outputFolderInput = el('outputFolderInput');
  const outputFolder = outputFolderInput ? outputFolderInput.value : 'output';

  try {
    const res = await fetch('/api/generate-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: state.recipients,
        fields: buildFieldConfigs(),
        outputFolder,
        filenameKey: 'name'
      })
    });
    const data = await res.json();

    if (data.success) {
      if (pbFill) pbFill.style.width = '100%';
      if (pText)  pText.textContent  = data.count + ' / ' + data.count;
      if (pPct)   pPct.textContent   = '100%';
      if (mtitle) mtitle.textContent = '✅ Generation Complete!';
      if (msub)   msub.textContent   = data.count + ' certificates saved successfully.';
      if (cfBox)  cfBox.style.display = 'flex';

      const sc = el('successCount');
      const sfp = el('successFolderPath');
      if (sc)  sc.textContent  = data.count;
      if (sfp) sfp.textContent = data.outputDir;

      refreshOutputFolderStatus();
    } else {
      showToast(data.error || 'Batch generation failed', 'error');
      if (modal) modal.classList.remove('active');
    }
  } catch (err) {
    console.error('Batch generation error:', err);
    showToast('Generation failed: ' + err.message, 'error');
    if (modal) modal.classList.remove('active');
  }
}

async function downloadBatchZip() {
  if (state.recipients.length === 0) {
    showToast('Please load recipient names first.', 'error');
    return;
  }
  try {
    showToast('Generating ZIP archive...', 'info');
    const res = await fetch('/api/download-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: state.recipients,
        fields: buildFieldConfigs(),
        filenameKey: 'name'
      })
    });
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'Certificates_Batch.zip';
    a.click();
    URL.revokeObjectURL(url);
    showToast('ZIP downloaded successfully!', 'success');
  } catch (err) {
    showToast('ZIP download failed: ' + err.message, 'error');
  }
}

// ================= OUTPUT FOLDER STATUS =================

async function refreshOutputFolderStatus() {
  try {
    const res  = await fetch('/api/list-output');
    const data = await res.json();
    if (data.success) {
      const ofc = el('outputFileCount'); if (ofc) ofc.textContent = data.files.length;
      const fpd = el('fullPathDisplay'); if (fpd) fpd.textContent = data.outputDir;
    }
  } catch (e) {
    console.warn('Could not refresh output status:', e.message);
  }
}

// ================= UTILITIES =================

function safeOn(id, event, handler) {
  const elem = el(id);
  if (elem) elem.addEventListener(event, handler);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

function showToast(message, type) {
  type = type || 'info';
  const container = el('toastContainer');
  if (!container) { console.log('[Toast]', type, message); return; }

  const toast = document.createElement('div');
  toast.className = 'toast toast-' + type;
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error')   iconName = 'alert-triangle';
  toast.innerHTML = `<i data-lucide="${iconName}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
