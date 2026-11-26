const video = document.getElementById('video');
const capturedPreviewImg = document.getElementById('capturedPreviewImg');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const roiOverlay = document.getElementById('roiOverlay');
const roiBox = document.getElementById('roiBox');
const roiGuideText = document.getElementById('roiGuideText');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const snapPhotoBtn = document.getElementById('snapPhotoBtn');
const cameraErrorBox = document.getElementById('cameraErrorBox');
const cameraErrorDetail = document.getElementById('cameraErrorDetail');
const uploadBtn = document.getElementById('uploadBtn');
const imageUpload = document.getElementById('imageUpload');

const processedCanvas = document.getElementById('processedCanvas');
const pCtx = processedCanvas.getContext('2d', { willReadFrequently: true });

const ocrBadge = document.getElementById('ocrBadge');
const stabilityText = document.getElementById('stabilityText');

const currentDateLabel = document.getElementById('currentDateLabel');
const liveClockLabel = document.getElementById('liveClockLabel');
const meterPointSelect = document.getElementById('meterPointSelect');
const customMeterInput = document.getElementById('customMeterInput');
const fileNamePreview = document.getElementById('fileNamePreview');

const slot1Card = document.getElementById('slot1Card');
const slot2Card = document.getElementById('slot2Card');
const selectSlot1Btn = document.getElementById('selectSlot1Btn');
const selectSlot2Btn = document.getElementById('selectSlot2Btn');
const valueSlot1 = document.getElementById('valueSlot1');
const valueSlot2 = document.getElementById('valueSlot2');
const clearSlot1Btn = document.getElementById('clearSlot1Btn');
const clearSlot2Btn = document.getElementById('clearSlot2Btn');
const slot1EditTag = document.getElementById('slot1EditTag');
const slot2EditTag = document.getElementById('slot2EditTag');
const liveQualityBadge = document.getElementById('liveQualityBadge');
const saveBtn = document.getElementById('saveBtn');
const resetSlotsBtn = document.getElementById('resetSlotsBtn');

const sheetWebhookUrl = document.getElementById('sheetWebhookUrl');
const saveWebhookBtn = document.getElementById('saveWebhookBtn');
const sheetStatusText = document.getElementById('sheetStatusText');

const historyList = document.getElementById('historyList');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

const tabScanBtn = document.getElementById('tabScanBtn');
const tabDashBtn = document.getElementById('tabDashBtn');
const scanView = document.getElementById('scanView');
const dashView = document.getElementById('dashView');
const dashSourceLabel = document.getElementById('dashSourceLabel');
const dashMeterSelect = document.getElementById('dashMeterSelect');
const refreshDashBtn = document.getElementById('refreshDashBtn');
const statTotal = document.getElementById('statTotal');
const statNoEdit = document.getElementById('statNoEdit');
const statAvgDelta = document.getElementById('statAvgDelta');
const statAnomaly = document.getElementById('statAnomaly');
const trendDirectionBadge = document.getElementById('trendDirectionBadge');
const dashTableBody = document.getElementById('dashTableBody');

let mediaStream = null;
let isCameraActive = false;
let ocrWorker = null;
let isOcrReady = false;
let isProcessingFrame = false;
let scanTimer = null;
let latestStillDataUrl = '';
let deltaChart = null;
let qualityChart = null;
let remoteRowsCache = null;

const state = {
  activeSlot: 1,
  requiredMatches: 2,
  stabilityBuffer: [],
  lastOcrValue: { 1: '', 2: '' },
  wasManuallyEdited: { 1: false, 2: false }
};

const STORAGE_RECORDS = 'kwh_simple_photo_records_v1';
const STORAGE_WEBHOOK = 'kwh_simple_webhook_v1';
const STORAGE_METER = 'kwh_simple_meter_v1';

let records = [];
try {
  const raw = JSON.parse(localStorage.getItem(STORAGE_RECORDS) || '[]');
  if (Array.isArray(raw)) records = raw;
} catch (_) {}

const savedUrl = localStorage.getItem(STORAGE_WEBHOOK) || '';
if (savedUrl) {
  sheetWebhookUrl.value = savedUrl;
  sheetStatusText.textContent = 'พร้อมส่งเข้าชีต';
  sheetStatusText.className = 'text-[11px] text-emerald-600 font-medium';
}

const savedMeter = localStorage.getItem(STORAGE_METER);
if (savedMeter) {
  const hasOption = Array.from(meterPointSelect.options).some(o => o.value === savedMeter);
  if (hasOption && savedMeter !== 'CUSTOM') {
    meterPointSelect.value = savedMeter;
  } else {
    meterPointSelect.value = 'CUSTOM';
    customMeterInput.classList.remove('hidden');
    customMeterInput.value = savedMeter;
  }
}

let toastTimer = null;
function showToast(msg, icon = '✅') {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = msg;
  document.getElementById('toastIcon').textContent = icon;
  toast.classList.remove('hidden');
  requestAnimationFrame(() => {
    toast.classList.remove('scale-95', 'opacity-0');
    toast.classList.add('scale-100', 'opacity-100');
  });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('scale-100', 'opacity-100');
    toast.classList.add('scale-95', 'opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 250);
  }, 2200);
}

function getDateTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}:${ss}` };
}

function getMeterCode() {
  if (meterPointSelect.value === 'CUSTOM') {
    const clean = customMeterInput.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    return clean || 'M01';
  }
  return meterPointSelect.value || 'M01';
}

function buildPhotoName(meter, date, time) {
  const safeTime = (time || '00-00-00').replace(/:/g, '-');
  return `${meter}_${date}_${safeTime}.jpg`;
}

function updateFileNamePreview() {
  const dt = getDateTime();
  fileNamePreview.textContent = buildPhotoName(getMeterCode(), dt.date, dt.time);
}

function toNum(v) {
  const s = String(v || '').replace(/,/g, '').trim();
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// ตรวจสอบคุณภาพข้อมูลก่อนบันทึกเทียบกับค่ารอบก่อนหน้าของมิเตอร์เดียวกัน
function evaluateDataQuality(meter, v1Str, v2Str) {
  const v1 = v1Str.trim();
  const v2 = v2Str.trim();
  if (!v1 && !v2) {
    return { status: 'ค่าว่าง', level: 'warn', delta1: null };
  }

  const n1 = v1 ? toNum(v1) : null;
  const n2 = v2 ? toNum(v2) : null;
  if ((v1 && n1 === null) || (v2 && n2 === null)) {
    return { status: 'รูปแบบตัวเลขผิดปกติ', level: 'error', delta1: null };
  }

  const prevRec = records.find(r => (r.meter || 'M01') === meter && toNum(r.value1) !== null);
  const prev1 = prevRec ? toNum(prevRec.value1) : null;
  const delta1 = (n1 !== null && prev1 !== null) ? Number((n1 - prev1).toFixed(2)) : null;

  if (delta1 !== null && delta1 < 0) {
    return { status: `ค่าลดลงผิดปกติ (${delta1})`, level: 'error', delta1 };
  }

  return { status: 'ปกติ (ผ่านเกณฑ์)', level: 'ok', delta1 };
}

function refreshLiveQuality() {
  const res = evaluateDataQuality(getMeterCode(), valueSlot1.value, valueSlot2.value);
  liveQualityBadge.textContent = res.status;
  if (!valueSlot1.value.trim() && !valueSlot2.value.trim()) {
    liveQualityBadge.className = 'px-2 py-0.5 rounded-md font-semibold bg-slate-200 text-slate-700';
  } else if (res.level === 'error') {
    liveQualityBadge.className = 'px-2 py-0.5 rounded-md font-semibold bg-rose-100 text-rose-700';
  } else {
    liveQualityBadge.className = 'px-2 py-0.5 rounded-md font-semibold bg-emerald-100 text-emerald-700';
  }
}

meterPointSelect.addEventListener('change', () => {
  if (meterPointSelect.value === 'CUSTOM') {
    customMeterInput.classList.remove('hidden');
    customMeterInput.focus();
  } else {
    customMeterInput.classList.add('hidden');
    localStorage.setItem(STORAGE_METER, meterPointSelect.value);
  }
  updateFileNamePreview();
  refreshLiveQuality();
});

customMeterInput.addEventListener('input', () => {
  localStorage.setItem(STORAGE_METER, getMeterCode());
  updateFileNamePreview();
  refreshLiveQuality();
});

function updateClock() {
  const dt = getDateTime();
  currentDateLabel.textContent = dt.date;
  liveClockLabel.textContent = dt.time;
  updateFileNamePreview();
}

function selectSlot(slot) {
  state.activeSlot = slot;
  state.stabilityBuffer = [];
  stabilityText.textContent = `รอจับเลขสำหรับ "ค่าที่ ${slot}" (0/${state.requiredMatches})`;
  roiBox.classList.remove('bg-emerald-400/20');

  const is1 = slot === 1;
  selectSlot1Btn.className = is1
    ? 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white transition'
    : 'px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition';
  selectSlot2Btn.className = !is1
    ? 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white transition'
    : 'px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition';

  slot1Card.className = is1
    ? 'p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/40 transition space-y-2'
    : 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50/60 transition space-y-2';
  slot2Card.className = !is1
    ? 'p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/40 transition space-y-2'
    : 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50/60 transition space-y-2';

  roiGuideText.textContent = `กำลังสแกนลง: ค่าที่ ${slot}`;
}

function checkManualEdit(slot) {
  const el = slot === 1 ? valueSlot1 : valueSlot2;
  const tag = slot === 1 ? slot1EditTag : slot2EditTag;
  const val = el.value.trim();
  if (val && val !== state.lastOcrValue[slot]) {
    state.wasManuallyEdited[slot] = true;
    tag.textContent = 'แก้ไขแล้ว';
    tag.className = 'text-[11px] font-semibold text-amber-600';
  } else if (!val) {
    state.wasManuallyEdited[slot] = false;
    tag.textContent = 'ยังไม่แก้';
    tag.className = 'text-[11px] font-medium text-slate-400';
  }
  refreshLiveQuality();
}

valueSlot1.addEventListener('input', () => checkManualEdit(1));
valueSlot2.addEventListener('input', () => checkManualEdit(2));
selectSlot1Btn.addEventListener('click', () => selectSlot(1));
selectSlot2Btn.addEventListener('click', () => selectSlot(2));

clearSlot1Btn.addEventListener('click', () => {
  valueSlot1.value = '';
  state.lastOcrValue[1] = '';
  state.wasManuallyEdited[1] = false;
  slot1EditTag.textContent = 'ยังไม่แก้';
  slot1EditTag.className = 'text-[11px] font-medium text-slate-400';
  refreshLiveQuality();
});

clearSlot2Btn.addEventListener('click', () => {
  valueSlot2.value = '';
  state.lastOcrValue[2] = '';
  state.wasManuallyEdited[2] = false;
  slot2EditTag.textContent = 'ยังไม่แก้';
  slot2EditTag.className = 'text-[11px] font-medium text-slate-400';
  refreshLiveQuality();
});

resetSlotsBtn.addEventListener('click', () => {
  valueSlot1.value = '';
  valueSlot2.value = '';
  state.lastOcrValue = { 1: '', 2: '' };
  state.wasManuallyEdited = { 1: false, 2: false };
  slot1EditTag.textContent = 'ยังไม่แก้';
  slot2EditTag.textContent = 'ยังไม่แก้';
  slot1EditTag.className = 'text-[11px] font-medium text-slate-400';
  slot2EditTag.className = 'text-[11px] font-medium text-slate-400';
  state.stabilityBuffer = [];
  stabilityText.textContent = `รอจับเลขสำหรับ "ค่าที่ ${state.activeSlot}" (0/${state.requiredMatches})`;
  refreshLiveQuality();
  showToast('ล้าง 2 ช่องแล้ว', '🧹');
});

function extractNumbers(rawText) {
  if (!rawText) return [];
  const cleaned = rawText.replace(/(\d),(\d)/g, '$1.$2').replace(/[^0-9.\r\n]/g, ' ');
  const decimals = cleaned.match(/\d+\.\d{1,3}/g) || [];
  if (decimals.length > 0) return decimals.slice(0, 2);
  return (cleaned.match(/\d{2,}/g) || []).slice(0, 2);
}

async function initOcr() {
  try {
    ocrWorker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
      corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.0/',
      langPath: 'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',
      workerBlobURL: true
    });
    await ocrWorker.setParameters({
      tessedit_char_whitelist: '0123456789.',
      tessedit_pageseg_mode: '6'
    });
    isOcrReady = true;
    ocrBadge.className = 'px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 flex items-center gap-1.5 shrink-0';
    ocrBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>AI พร้อม</span>';
  } catch (e) {
    ocrBadge.className = 'px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 flex items-center gap-1.5 shrink-0';
    ocrBadge.innerHTML = '<span>AI โหลดไม่ได้ (พิมพ์เองได้)</span>';
  }
}

async function toggleCamera() {
  if (isCameraActive) {
    stopCamera();
  } else {
    cameraErrorBox.classList.add('hidden');
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      }).catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }));

      video.srcObject = mediaStream;
      await video.play();
      isCameraActive = true;
      capturedPreviewImg.classList.add('hidden');
      video.classList.remove('hidden');
      cameraPlaceholder.classList.add('hidden');
      roiOverlay.classList.remove('hidden');
      toggleCamBtn.className = 'py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs sm:text-sm transition';
      toggleCamBtn.textContent = 'หยุดกล้อง';
      startScanLoop();
    } catch (err) {
      cameraErrorBox.classList.remove('hidden');
      if (err.name === 'NotAllowedError') {
        cameraErrorDetail.textContent = 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตสิทธิ์กล้องหรือเปิดผ่าน HTTPS';
      }
    }
  }
}

function stopCamera() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = null;
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  isCameraActive = false;
  video.classList.add('hidden');
  roiOverlay.classList.add('hidden');
  if (!latestStillDataUrl) {
    cameraPlaceholder.classList.remove('hidden');
  }
  toggleCamBtn.className = 'py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm transition';
  toggleCamBtn.textContent = 'เปิดกล้องสแกน';
}

function showStillImage(dataUrl) {
  latestStillDataUrl = dataUrl;
  capturedPreviewImg.src = dataUrl;
  capturedPreviewImg.classList.remove('hidden');
  cameraPlaceholder.classList.add('hidden');
}

async function processImageElement(imgEl, fullMode = true) {
  preprocessToCanvas(imgEl, fullMode);
  if (isOcrReady) {
    showToast('กำลังอ่านค่าหน่วยไฟจากภาพ...', '🔍');
    await runOcr(true);
  } else {
    showToast('เตรียมภาพเรียบร้อย พิมพ์ค่าหน่วยไฟได้เลย', '🖼️');
  }
}

snapPhotoBtn.addEventListener('click', async () => {
  if (!isCameraActive || !video.videoWidth || !video.videoHeight) {
    showToast('เปิดกล้องก่อน แล้วกด "ถ่ายภาพ" ได้เลยครับ', '📷');
    return;
  }

  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = video.videoWidth;
  snapCanvas.height = video.videoHeight;
  snapCanvas.getContext('2d').drawImage(video, 0, 0);
  const stillDataUrl = snapCanvas.toDataURL('image/jpeg', 0.8);

  stopCamera();
  showStillImage(stillDataUrl);

  const img = new Image();
  img.onload = async () => {
    await processImageElement(img, true);
  };
  img.src = stillDataUrl;
  showToast('ถ่ายภาพหน้าจอมิเตอร์แล้ว', '📸');
});

function preprocessToCanvas(srcEl, fullMode = false) {
  const w = srcEl.videoWidth || srcEl.naturalWidth || srcEl.width;
  const h = srcEl.videoHeight || srcEl.naturalHeight || srcEl.height;
  if (!w || !h) return false;

  const cropW = Math.floor(w * (fullMode ? 0.78 : 0.86));
  const cropH = Math.floor(h * (fullMode ? 0.34 : 0.18));
  const sx = Math.floor((w - cropW) / 2);
  const sy = Math.floor((h - cropH) / 2);

  const scale = cropW > 760 ? 760 / cropW : Math.max(1, 560 / Math.max(1, cropW));
  const dw = Math.max(1, Math.floor(cropW * scale));
  const dh = Math.max(1, Math.floor(cropH * scale));
  const pad = 16;

  processedCanvas.width = dw + pad * 2;
  processedCanvas.height = dh + pad * 2;
  pCtx.fillStyle = '#ffffff';
  pCtx.fillRect(0, 0, processedCanvas.width, processedCanvas.height);
  pCtx.drawImage(srcEl, sx, sy, cropW, cropH, pad, pad, dw, dh);

  const img = pCtx.getImageData(0, 0, processedCanvas.width, processedCanvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = gray < 180 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  pCtx.putImageData(img, 0, 0);
  return true;
}

function setSlotValue(slot, val) {
  if (state.wasManuallyEdited[slot]) return;
  const input = slot === 1 ? valueSlot1 : valueSlot2;
  input.value = val;
  state.lastOcrValue[slot] = val;
  refreshLiveQuality();
}

async function runOcr(singleShot = false) {
  if (!ocrWorker) return;
  const { data: { text } } = await ocrWorker.recognize(processedCanvas);
  const nums = extractNumbers(text);
  if (!nums.length) {
    if (singleShot) stabilityText.textContent = 'ไม่พบตัวเลขในรูป (พิมพ์เองได้เลย)';
    return;
  }

  if (singleShot) {
    if (nums.length >= 2) {
      setSlotValue(1, nums[0]);
      setSlotValue(2, nums[1]);
      stabilityText.textContent = `อ่านได้ 2 ค่า: ${nums[0]} และ ${nums[1]}`;
    } else {
      setSlotValue(state.activeSlot, nums[0]);
      stabilityText.textContent = `อ่านได้ (ค่าที่ ${state.activeSlot}): ${nums[0]}`;
    }
    return;
  }

  const val = nums[0];
  const buf = state.stabilityBuffer;
  if (buf[buf.length - 1] === val) buf.push(val);
  else state.stabilityBuffer = [val];

  stabilityText.textContent = `ค่าที่ ${state.activeSlot}: ${val} (${state.stabilityBuffer.length}/${state.requiredMatches})`;
  if (state.stabilityBuffer.length >= state.requiredMatches) {
    roiBox.classList.add('bg-emerald-400/20');
    setSlotValue(state.activeSlot, val);
    if (nums.length >= 2 && state.activeSlot === 1) setSlotValue(2, nums[1]);
  }
}

function startScanLoop() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(async () => {
    if (!isCameraActive || !isOcrReady || isProcessingFrame) return;
    isProcessingFrame = true;
    try {
      if (preprocessToCanvas(video, false)) await runOcr(false);
    } finally {
      isProcessingFrame = false;
    }
  }, 550);
}

uploadBtn.addEventListener('click', () => imageUpload.click());
imageUpload.addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  stopCamera();
  const reader = new FileReader();
  reader.onload = (ev) => {
    const dataUrl = ev.target.result;
    showStillImage(dataUrl);
    const img = new Image();
    img.onload = async () => {
      await processImageElement(img, true);
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

function capturePhoto(maxWidth = 480, quality = 0.55) {
  let src = null;
  let w = 0;
  let h = 0;

  if (isCameraActive && video.videoWidth && video.videoHeight) {
    src = video;
    w = video.videoWidth;
    h = video.videoHeight;
  } else if (latestStillDataUrl && capturedPreviewImg.naturalWidth && capturedPreviewImg.naturalHeight) {
    src = capturedPreviewImg;
    w = capturedPreviewImg.naturalWidth;
    h = capturedPreviewImg.naturalHeight;
  } else if (processedCanvas.width && processedCanvas.height) {
    src = processedCanvas;
    w = processedCanvas.width;
    h = processedCanvas.height;
  }

  if (!src) return null;

  const scale = w > maxWidth ? maxWidth / w : 1;
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);

  const c = document.createElement('canvas');
  c.width = tw;
  c.height = th;
  c.getContext('2d').drawImage(src, 0, 0, tw, th);

  const mimeType = 'image/jpeg';
  const dataUrl = c.toDataURL(mimeType, quality);
  const base64 = dataUrl.split(',')[1] || '';
  return { dataUrl, base64, mimeType };
}

function saveRecordsLocal() {
  try {
    localStorage.setItem(STORAGE_RECORDS, JSON.stringify(records));
  } catch (_) {
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].photoPreview) {
        records[i].photoPreview = '';
        break;
      }
    }
    try {
      localStorage.setItem(STORAGE_RECORDS, JSON.stringify(records));
    } catch (_) {}
  }
}

saveWebhookBtn.addEventListener('click', () => {
  const url = sheetWebhookUrl.value.trim();
  localStorage.setItem(STORAGE_WEBHOOK, url);
  remoteRowsCache = null;
  if (url) {
    sheetStatusText.textContent = 'พร้อมส่งเข้าชีต';
    sheetStatusText.className = 'text-[11px] text-emerald-600 font-medium';
    showToast('บันทึกลิงก์แล้ว', '🔗');
  } else {
    sheetStatusText.textContent = 'ไม่ได้ตั้งค่าลิงก์';
    sheetStatusText.className = 'text-[11px] text-slate-400';
    showToast('ล้างลิงก์แล้ว', '🗑️');
  }
});

function getEditStatus() {
  const e1 = state.wasManuallyEdited[1];
  const e2 = state.wasManuallyEdited[2];
  if (e1 && e2) return 'แก้ทั้ง 2 ค่า';
  if (e1) return 'แก้ค่าที่ 1';
  if (e2) return 'แก้ค่าที่ 2';
  return 'ไม่แก้';
}

saveBtn.addEventListener('click', async () => {
  const v1 = valueSlot1.value.trim();
  const v2 = valueSlot2.value.trim();
  if (!v1 && !v2) {
    showToast('กรอกหรือสแกนค่าหน่วยไฟอย่างน้อย 1 ค่าก่อน', '⚠️');
    return;
  }

  const dt = getDateTime();
  const meter = getMeterCode();
  const qRes = evaluateDataQuality(meter, v1, v2);
  const photo = capturePhoto(480, 0.55);
  const photoName = buildPhotoName(meter, dt.date, dt.time);

  const item = {
    id: Date.now(),
    date: dt.date,
    time: dt.time,
    meter,
    value1: v1,
    value2: v2,
    editStatus: getEditStatus(),
    qualityStatus: qRes.status,
    photoName: photo ? photoName : 'ไม่มีรูป',
    photoPreview: photo ? photo.dataUrl : ''
  };

  records.unshift(item);
  remoteRowsCache = null;
  saveRecordsLocal();
  renderList();
  refreshLiveQuality();

  const url = (localStorage.getItem(STORAGE_WEBHOOK) || '').trim();
  if (url) {
    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          date: item.date,
          time: item.time,
          meter: item.meter,
          value1: item.value1,
          value2: item.value2,
          editStatus: item.editStatus,
          qualityStatus: item.qualityStatus,
          photoName: photo ? photoName : 'ไม่มีรูป',
          photoBase64: photo ? photo.base64 : '',
          photoMimeType: photo ? photo.mimeType : 'image/jpeg'
        })
      });
    } catch (_) {}
  }

  showToast(`บันทึก [${item.meter}] (${item.qualityStatus})`, qRes.level === 'error' ? '⚠️' : '📝');
});

function removeItem(id) {
  records = records.filter(r => r.id !== id);
  saveRecordsLocal();
  renderList();
  refreshLiveQuality();
}
window.removeItem = removeItem;

function renderList() {
  itemCount.textContent = records.length;
  Array.from(historyList.children).forEach(el => {
    if (el.id !== 'emptyState') el.remove();
  });
  if (!records.length) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  records.forEach(r => {
    const li = document.createElement('li');
    li.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-2.5';

    const thumb = r.photoPreview
      ? `<img src="${r.photoPreview}" alt="รูปมิเตอร์" class="w-16 h-12 object-cover rounded-lg border border-slate-300 shrink-0 bg-slate-200" />`
      : `<div class="w-16 h-12 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 shrink-0">ไม่มีรูป</div>`;

    const qStatus = r.qualityStatus || 'ปกติ (ผ่านเกณฑ์)';
    const qBadgeCls = qStatus.includes('ผิดปกติ')
      ? 'bg-rose-100 text-rose-700'
      : 'bg-emerald-100 text-emerald-700';

    li.innerHTML = `
      <div class="flex items-start gap-2.5 min-w-0">
        ${thumb}
        <div class="space-y-1 min-w-0">
          <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span class="px-1.5 py-0.5 rounded bg-slate-800 text-white font-bold">${r.meter}</span>
            <span class="font-semibold text-slate-700">${r.date}</span>
            <span class="text-slate-500 font-mono">${r.time}</span>
            <span class="px-1.5 py-0.5 rounded ${r.editStatus === 'ไม่แก้' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'}">${r.editStatus}</span>
            <span class="px-1.5 py-0.5 rounded font-semibold ${qBadgeCls}">${qStatus}</span>
          </div>
          <div class="text-xs sm:text-sm font-bold font-mono flex flex-wrap gap-x-3">
            <span>ค่าที่ 1: <span class="text-emerald-700">${r.value1 || '-'}</span></span>
            <span>ค่าที่ 2: <span class="text-blue-700">${r.value2 || '-'}</span></span>
          </div>
          <p class="text-[10px] text-slate-400 font-mono truncate">${r.photoName || ''}</p>
        </div>
      </div>
      <button type="button" onclick="removeItem(${r.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0">✕</button>
    `;
    historyList.appendChild(li);
  });
}

exportCsvBtn.addEventListener('click', () => {
  if (!records.length) {
    showToast('ไม่มีข้อมูลสำหรับส่งออก CSV', '⚠️');
    return;
  }
  let csv = '\uFEFFวันที่,เวลา,จุดตรวจ,ค่าที่ 1,ค่าที่ 2,สถานะการแก้ค่า,คุณภาพข้อมูล,ชื่อไฟล์รูป\n';
  [...records].reverse().forEach(r => {
    csv += `"${r.date}","${r.time}","${r.meter}","${r.value1}","${r.value2}","${r.editStatus}","${r.qualityStatus || 'ปกติ'}","${r.photoName || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `meter-kwh-${getDateTime().date}.csv`;
  link.click();
  showToast('ดาวน์โหลด CSV แล้ว', '📊');
});

clearAllBtn.addEventListener('click', () => {
  if (!records.length) return;
  records = [];
  localStorage.setItem(STORAGE_RECORDS, '[]');
  renderList();
  refreshLiveQuality();
  showToast('ล้างทั้งหมดแล้ว', '🧹');
});

toggleCamBtn.addEventListener('click', toggleCamera);

// =====================================
// แดชบอร์ดคุณภาพข้อมูล & แนวโน้มอนุกรมเวลา
// =====================================
function setActiveTab(mode) {
  const isDash = mode === 'dash';
  scanView.classList.toggle('hidden', isDash);
  dashView.classList.toggle('hidden', !isDash);

  tabScanBtn.className = !isDash
    ? 'py-2 px-3 rounded-lg text-xs font-bold bg-white text-emerald-700 shadow-sm transition'
    : 'py-2 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition';
  tabDashBtn.className = isDash
    ? 'py-2 px-3 rounded-lg text-xs font-bold bg-white text-emerald-700 shadow-sm transition'
    : 'py-2 px-3 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition';

  if (isDash) renderDashboard(false);
}

tabScanBtn.addEventListener('click', () => setActiveTab('scan'));
tabDashBtn.addEventListener('click', () => setActiveTab('dash'));

function computeLinearTrend(values) {
  const n = values.length;
  if (n < 2) return { line: values.slice(), slope: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  const slope = denom === 0 ? 0 : (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const line = values.map((_, i) => Number((intercept + slope * i).toFixed(2)));
  return { line, slope };
}

async function loadDashboardRows(force = false) {
  const url = (localStorage.getItem(STORAGE_WEBHOOK) || '').trim();
  if (!url) {
    dashSourceLabel.textContent = 'แสดงข้อมูลในเครื่องนี้ (ยังไม่ได้ตั้งค่าลิงก์ Google Apps Script)';
    return [...records].reverse().map(r => ({
      date: r.date,
      time: r.time,
      meter: r.meter || 'M01',
      value1: r.value1 || '',
      value2: r.value2 || '',
      editStatus: r.editStatus || 'ไม่แก้',
      qualityStatus: r.qualityStatus || 'ปกติ',
      photoUrl: ''
    }));
  }

  if (remoteRowsCache && !force) {
    dashSourceLabel.textContent = `ข้อมูลจาก Google Sheets (${remoteRowsCache.length} รายการ)`;
    return remoteRowsCache;
  }

  try {
    dashSourceLabel.textContent = 'กำลังดึงข้อมูลจาก Google Sheets...';
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    if (data && data.status === 'ok' && Array.isArray(data.rows)) {
      remoteRowsCache = data.rows.map(row => ({
        date: row[0] || '',
        time: row[1] || '',
        meter: row[2] || 'M01',
        value1: row[3] || '',
        value2: row[4] || '',
        editStatus: row[5] || 'ไม่แก้',
        photoUrl: (row[7] && String(row[7]).startsWith('http')) ? row[7] : ''
      }));
      dashSourceLabel.textContent = `อัปเดตจาก Google Sheets แล้ว (${remoteRowsCache.length} รายการ)`;
      return remoteRowsCache;
    }
  } catch (_) {
    dashSourceLabel.textContent = 'ดึงชีตไม่ได้ชั่วคราว แสดงข้อมูลในเครื่องแทน';
  }

  return [...records].reverse().map(r => ({
    date: r.date,
    time: r.time,
    meter: r.meter || 'M01',
    value1: r.value1 || '',
    value2: r.value2 || '',
    editStatus: r.editStatus || 'ไม่แก้',
    qualityStatus: r.qualityStatus || 'ปกติ',
    photoUrl: ''
  }));
}

async function renderDashboard(force = false) {
  const allRows = await loadDashboardRows(force);
  const meters = Array.from(new Set(allRows.map(r => r.meter || 'M01')));
  const prevChoice = dashMeterSelect.value || 'ALL';
  dashMeterSelect.innerHTML = '<option value="ALL">ทุกจุดตรวจ</option>' +
    meters.map(m => `<option value="${m}">${m}</option>`).join('');
  if (meters.includes(prevChoice)) dashMeterSelect.value = prevChoice;

  const chosen = dashMeterSelect.value;
  const filtered = chosen === 'ALL' ? allRows : allRows.filter(r => (r.meter || 'M01') === chosen);

  const lastByMeter = {};
  let anomalyCount = 0;
  let editedCount = 0;
  let noEditCount = 0;
  let cleanNormalCount = 0;

  const computed = filtered.map(r => {
    const m = r.meter || 'M01';
    const n1 = toNum(r.value1);
    const prev1 = lastByMeter[m];
    const delta1 = (n1 !== null && prev1 !== null && prev1 !== undefined)
      ? Number((n1 - prev1).toFixed(2))
      : null;
    if (n1 !== null) lastByMeter[m] = n1;

    const isInvalidFormat = Boolean(r.value1 && n1 === null);
    const isDrop = delta1 !== null && delta1 < 0;
    const isEdited = r.editStatus && r.editStatus !== 'ไม่แก้';

    let computedQuality = 'ปกติ';
    if (isDrop) {
      computedQuality = 'ค่าลดลงผิดปกติ';
      anomalyCount += 1;
    } else if (isInvalidFormat) {
      computedQuality = 'รูปแบบผิดปกติ';
      anomalyCount += 1;
    } else if (isEdited) {
      computedQuality = 'แก้ไขด้วยมือ';
    } else {
      cleanNormalCount += 1;
    }

    if (isEdited) editedCount += 1;
    else noEditCount += 1;

    return { ...r, delta1, computedQuality };
  });

  const validDeltas = computed.filter(r => r.delta1 !== null && r.delta1 >= 0).map(r => r.delta1);
  const avgDelta = validDeltas.length > 0
    ? (validDeltas.reduce((a, b) => a + b, 0) / validDeltas.length)
    : 0;

  statTotal.textContent = String(computed.length);
  statNoEdit.textContent = computed.length > 0 ? `${Math.round((noEditCount / computed.length) * 100)}%` : '0%';
  statAvgDelta.textContent = avgDelta.toFixed(2);
  statAnomaly.textContent = String(anomalyCount);

  const recentRows = [...computed].reverse().slice(0, 25);
  if (!recentRows.length) {
    dashTableBody.innerHTML = '<tr><td colspan="7" class="py-4 text-center text-slate-400">ยังไม่มีข้อมูล</td></tr>';
  } else {
    dashTableBody.innerHTML = recentRows.map(r => {
      const dStr = r.delta1 === null ? '-' : (r.delta1 >= 0 ? `+${r.delta1}` : `${r.delta1}`);
      const dCls = r.delta1 === null ? 'text-slate-400' : (r.delta1 < 0 ? 'text-rose-600 font-bold' : 'text-emerald-700 font-bold');
      const qCls = r.computedQuality.includes('ผิดปกติ')
        ? 'bg-rose-100 text-rose-700'
        : (r.computedQuality === 'แก้ไขด้วยมือ' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700');
      const linkHtml = r.photoUrl
        ? `<a href="${r.photoUrl}" target="_blank" rel="noopener" class="text-emerald-700 underline font-semibold">เปิด</a>`
        : `<span class="text-slate-400">-</span>`;
      return `
        <tr>
          <td class="py-2 pr-2 font-mono whitespace-nowrap">${r.date || ''} ${r.time || ''}</td>
          <td class="py-2 px-2 font-bold">${r.meter || 'M01'}</td>
          <td class="py-2 px-2 font-mono">${r.value1 || '-'}</td>
          <td class="py-2 px-2 font-mono ${dCls}">${dStr}</td>
          <td class="py-2 px-2 font-mono">${r.value2 || '-'}</td>
          <td class="py-2 px-2"><span class="px-1.5 py-0.5 rounded font-semibold ${qCls}">${r.computedQuality}</span></td>
          <td class="py-2 pl-2">${linkHtml}</td>
        </tr>
      `;
    }).join('');
  }

  if (typeof Chart !== 'undefined') {
    const seriesRows = computed.filter(r => r.delta1 !== null).slice(-20);
    const deltaValues = seriesRows.map(r => r.delta1);
    const { line: trendLine, slope } = computeLinearTrend(deltaValues);
    const meanLine = deltaValues.map(() => Number(avgDelta.toFixed(2)));

    if (deltaValues.length < 2) {
      trendDirectionBadge.textContent = 'รอข้อมูลผลต่างอย่างน้อย 2 รอบ';
      trendDirectionBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600';
    } else if (slope > 0.05) {
      trendDirectionBadge.textContent = `แนวโน้มเพิ่มขึ้น (+${slope.toFixed(2)} / รอบ)`;
      trendDirectionBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800';
    } else if (slope < -0.05) {
      trendDirectionBadge.textContent = `แนวโน้มลดลง (${slope.toFixed(2)} / รอบ)`;
      trendDirectionBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800';
    } else {
      trendDirectionBadge.textContent = `แนวโน้มทรงตัว (${slope.toFixed(2)} / รอบ)`;
      trendDirectionBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-100 text-blue-800';
    }

    const ctx = document.getElementById('deltaChartCanvas');
    if (ctx) {
      if (deltaChart) deltaChart.destroy();
      deltaChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: seriesRows.map(r => `${r.meter || 'M01'} ${r.time || ''}`),
          datasets: [
            {
              label: 'Δ ค่าที่ 1 (kWh)',
              data: deltaValues,
              borderColor: '#059669',
              backgroundColor: 'rgba(16, 185, 129, 0.14)',
              tension: 0.25,
              fill: true
            },
            {
              label: 'เส้นแนวโน้ม (Linear Trend)',
              data: trendLine,
              borderColor: '#2563eb',
              borderDash: [6, 4],
              pointRadius: 0,
              fill: false
            },
            {
              label: 'ค่าเฉลี่ย (Mean)',
              data: meanLine,
              borderColor: '#f59e0b',
              borderDash: [2, 3],
              pointRadius: 0,
              fill: false
            }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    const qCtx = document.getElementById('qualityChartCanvas');
    if (qCtx) {
      if (qualityChart) qualityChart.destroy();
      qualityChart = new Chart(qCtx, {
        type: 'bar',
        data: {
          labels: ['ผ่านเกณฑ์ปกติ (ไม่แก้)', 'แก้ไขด้วยมือ', 'พบความผิดปกติ (ลดลง/รูปแบบผิด)'],
          datasets: [{
            label: 'จำนวนรายการ',
            data: [cleanNormalCount, editedCount, anomalyCount],
            backgroundColor: ['#10b981', '#f59e0b', '#e11d48'],
            borderRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
  }
}

dashMeterSelect.addEventListener('change', () => renderDashboard(false));
refreshDashBtn.addEventListener('click', () => renderDashboard(true));

updateClock();
setInterval(updateClock, 1000);
renderList();
refreshLiveQuality();
initOcr();