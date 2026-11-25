// ==========================================
// 1. อ้างอิง DOM Elements
// ==========================================
const video = document.getElementById('video');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const roiOverlay = document.getElementById('roiOverlay');
const roiBox = document.getElementById('roiBox');
const roiGuideText = document.getElementById('roiGuideText');
const toggleCamBtn = document.getElementById('toggleCamBtn');
const torchBtn = document.getElementById('torchBtn');
const cameraErrorBox = document.getElementById('cameraErrorBox');
const cameraErrorDetail = document.getElementById('cameraErrorDetail');
const imageUpload = document.getElementById('imageUpload');

const processedCanvas = document.getElementById('processedCanvas');
const pCtx = processedCanvas.getContext('2d', { willReadFrequently: true });

const ocrBadge = document.getElementById('ocrBadge');
const stabilityText = document.getElementById('stabilityText');

const currentDateLabel = document.getElementById('currentDateLabel');
const currentSlotBadge = document.getElementById('currentSlotBadge');
const liveClockLabel = document.getElementById('liveClockLabel');

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
const saveRoundBtn = document.getElementById('saveRoundBtn');
const resetSlotsBtn = document.getElementById('resetSlotsBtn');

const sheetWebhookUrl = document.getElementById('sheetWebhookUrl');
const saveWebhookBtn = document.getElementById('saveWebhookBtn');
const sheetStatusText = document.getElementById('sheetStatusText');

const historyList = document.getElementById('historyList');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const clearAllBtn = document.getElementById('clearAllBtn');

// ==========================================
// 2. ตัวแปรสถานะของระบบ
// ==========================================
let mediaStream = null;
let isCameraActive = false;
let isTorchOn = false;
let ocrWorker = null;
let isOcrReady = false;
let isProcessingFrame = false;
let scanTimer = null;

const scannerState = {
  activeSlot: 1,
  requiredMatches: 2,
  stabilityBuffer: [],
  lastOcrValue: { 1: '', 2: '' },
  wasManuallyEdited: { 1: false, 2: false }
};

const STORAGE_KEY_RECORDS = 'meter_2hr_records_v2';
const STORAGE_KEY_WEBHOOK = 'meter_2hr_webhook_url';

let savedRecords = JSON.parse(localStorage.getItem(STORAGE_KEY_RECORDS) || '[]');
const savedWebhook = localStorage.getItem(STORAGE_KEY_WEBHOOK) || '';
if (savedWebhook) {
  sheetWebhookUrl.value = savedWebhook;
  sheetStatusText.textContent = 'พร้อมส่งเข้าชีต';
  sheetStatusText.className = 'text-[11px] text-emerald-600 font-medium';
}

// ==========================================
// 3. แถบแจ้งเตือน (Toast)
// ==========================================
let toastTimeout = null;
function showToast(message, icon = '✅') {
  const toast = document.getElementById('toast');
  document.getElementById('toastText').textContent = message;
  document.getElementById('toastIcon').textContent = icon;
  toast.classList.remove('hidden');

  requestAnimationFrame(() => {
    toast.classList.remove('scale-95', 'opacity-0');
    toast.classList.add('scale-100', 'opacity-100');
  });

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('scale-100', 'opacity-100');
    toast.classList.add('scale-95', 'opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2400);
}

// ==========================================
// 4. คำนวณวันที่และรอบเวลาทุก 2 ชม. (เริ่ม 02:00)
// ==========================================
function getTwoHourSlotInfo(dateObj = new Date()) {
  const hour = dateObj.getHours();
  const slotHour = Math.floor(hour / 2) * 2;
  const slotLabel = `${String(slotHour).padStart(2, '0')}:00`;

  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const timeStr = dateObj.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  return { dateStr, slotLabel, timeStr };
}

function updateClockAndSlot() {
  const info = getTwoHourSlotInfo(new Date());
  currentDateLabel.textContent = info.dateStr;
  currentSlotBadge.textContent = info.slotLabel;
  liveClockLabel.textContent = info.timeStr;
}

// ==========================================
// 5. สลับช่อง 1 / ช่อง 2 และรีเซ็ต Buffer ความนิ่ง
// ==========================================
function selectSlot(slotNum) {
  scannerState.activeSlot = slotNum;
  resetStabilityBuffer();

  const isSlot1 = slotNum === 1;
  selectSlot1Btn.className = isSlot1
    ? 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white transition'
    : 'px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition';
  selectSlot2Btn.className = !isSlot1
    ? 'px-3 py-1 rounded-lg text-xs font-bold bg-emerald-600 text-white transition'
    : 'px-3 py-1 rounded-lg text-xs font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition';

  slot1Card.className = isSlot1
    ? 'p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/40 transition space-y-2'
    : 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50/60 transition space-y-2';
  slot2Card.className = !isSlot1
    ? 'p-3 rounded-xl border-2 border-emerald-500 bg-emerald-50/40 transition space-y-2'
    : 'p-3 rounded-xl border-2 border-slate-200 bg-slate-50/60 transition space-y-2';

  roiGuideText.textContent = `กำลังสแกนใส่: ค่าที่ ${slotNum} (เล็ง 1 บรรทัดตัวเลข)`;
  showToast(`สลับไปสแกน "ค่าที่ ${slotNum}" แล้ว`, '🎯');
}

function resetStabilityBuffer() {
  scannerState.stabilityBuffer = [];
  stabilityText.textContent = `รอจับเลขทศนิยมสำหรับ "ค่าที่ ${scannerState.activeSlot}" (0/${scannerState.requiredMatches})`;
  roiBox.classList.remove('bg-emerald-400/15');
}

function markManualEdit(slotNum) {
  const inputEl = slotNum === 1 ? valueSlot1 : valueSlot2;
  const tagEl = slotNum === 1 ? slot1EditTag : slot2EditTag;
  const currentVal = inputEl.value.trim();

  if (currentVal && currentVal !== scannerState.lastOcrValue[slotNum]) {
    scannerState.wasManuallyEdited[slotNum] = true;
    tagEl.textContent = 'แก้ไขแล้ว';
    tagEl.className = 'text-[11px] font-semibold text-amber-600';
  } else if (!currentVal) {
    scannerState.wasManuallyEdited[slotNum] = false;
    tagEl.textContent = 'ยังไม่แก้';
    tagEl.className = 'text-[11px] font-medium text-slate-400';
  }
}

valueSlot1.addEventListener('input', () => markManualEdit(1));
valueSlot2.addEventListener('input', () => markManualEdit(2));
selectSlot1Btn.addEventListener('click', () => selectSlot(1));
selectSlot2Btn.addEventListener('click', () => selectSlot(2));

clearSlot1Btn.addEventListener('click', () => {
  valueSlot1.value = '';
  scannerState.lastOcrValue[1] = '';
  scannerState.wasManuallyEdited[1] = false;
  slot1EditTag.textContent = 'ยังไม่แก้';
  slot1EditTag.className = 'text-[11px] font-medium text-slate-400';
  if (scannerState.activeSlot === 1) resetStabilityBuffer();
});

clearSlot2Btn.addEventListener('click', () => {
  valueSlot2.value = '';
  scannerState.lastOcrValue[2] = '';
  scannerState.wasManuallyEdited[2] = false;
  slot2EditTag.textContent = 'ยังไม่แก้';
  slot2EditTag.className = 'text-[11px] font-medium text-slate-400';
  if (scannerState.activeSlot === 2) resetStabilityBuffer();
});

resetSlotsBtn.addEventListener('click', () => {
  valueSlot1.value = '';
  valueSlot2.value = '';
  scannerState.lastOcrValue = { 1: '', 2: '' };
  scannerState.wasManuallyEdited = { 1: false, 2: false };
  slot1EditTag.textContent = 'ยังไม่แก้';
  slot2EditTag.textContent = 'ยังไม่แก้';
  slot1EditTag.className = 'text-[11px] font-medium text-slate-400';
  slot2EditTag.className = 'text-[11px] font-medium text-slate-400';
  resetStabilityBuffer();
  showToast('ล้างค่าทั้ง 2 ช่องแล้ว', '🧹');
});

// ==========================================
// 6. กรองเฉพาะตัวเลขและจุดทศนิยม (เช่น 0000254652.60)
// ==========================================
function extractMeterNumber(rawText) {
  if (!rawText) return null;

  const firstLine = rawText.split(/\r?\n/)[0] || '';
  const cleaned = firstLine
    .replace(/\s+/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^0-9.]/g, '');

  const decimalMatch = cleaned.match(/\d+\.\d{1,2}/);
  if (decimalMatch) return decimalMatch[0];

  const integerMatch = cleaned.match(/\d{4,}/);
  return integerMatch ? integerMatch[0] : null;
}

// ==========================================
// 7. โหลด Tesseract OCR
// ==========================================
async function initTesseract() {
  try {
    ocrWorker = await Tesseract.createWorker('eng');
    await ocrWorker.setParameters({
      tessedit_char_whitelist: '0123456789.',
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    });
    isOcrReady = true;
    ocrBadge.className = 'px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 flex items-center gap-1.5 shrink-0';
    ocrBadge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span>AI พร้อมสแกน</span>';
  } catch (err) {
    console.error('OCR Init Error:', err);
    ocrBadge.className = 'px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 flex items-center gap-1.5 shrink-0';
    ocrBadge.innerHTML = '<span>โหลด AI ไม่สำเร็จ</span>';
  }
}

// ==========================================
// 8. ควบคุมกล้องและไฟฉาย
// ==========================================
async function toggleCamera() {
  if (isCameraActive) stopCamera();
  else await startCamera();
}

async function startCamera() {
  cameraErrorBox.classList.add('hidden');
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง');
    }

    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    video.srcObject = mediaStream;
    await video.play();

    isCameraActive = true;
    video.classList.remove('hidden');
    cameraPlaceholder.classList.add('hidden');
    roiOverlay.classList.remove('hidden');
    toggleCamBtn.className = 'flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-sm';
    toggleCamBtn.innerHTML = '<span>หยุดกล้อง</span>';

    checkTorchSupport();
    resetStabilityBuffer();
    startScanningLoop();
    showToast('เปิดกล้องแล้ว เล็งกรอบให้ตรง 1 บรรทัดตัวเลข', '📷');
  } catch (err) {
    console.error('Camera Error:', err);
    cameraErrorBox.classList.remove('hidden');
    if (err.name === 'NotAllowedError') {
      cameraErrorDetail.textContent = 'ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตสิทธิ์กล้องในเบราว์เซอร์หรือเปิดผ่าน HTTPS บนมือถือ';
    }
    showToast('เปิดกล้องไม่ได้', '⚠️');
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
  isTorchOn = false;
  torchBtn.classList.add('hidden');
  video.classList.add('hidden');
  roiOverlay.classList.add('hidden');
  cameraPlaceholder.classList.remove('hidden');
  toggleCamBtn.className = 'flex-1 min-w-[140px] py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold text-sm flex items-center justify-center gap-2 transition shadow-sm';
  toggleCamBtn.innerHTML = '<span>เปิดกล้องสแกน</span>';
}

function checkTorchSupport() {
  if (!mediaStream) return;
  const track = mediaStream.getVideoTracks()[0];
  if (track && typeof track.getCapabilities === 'function') {
    const caps = track.getCapabilities();
    if (caps.torch) torchBtn.classList.remove('hidden');
  }
}

torchBtn.addEventListener('click', async () => {
  if (!mediaStream) return;
  const track = mediaStream.getVideoTracks()[0];
  try {
    isTorchOn = !isTorchOn;
    await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
    torchBtn.classList.toggle('bg-amber-500', isTorchOn);
    torchBtn.classList.toggle('text-slate-950', isTorchOn);
  } catch (e) {
    showToast('อุปกรณ์ไม่รองรับไฟฉาย', '⚠️');
  }
});

// ==========================================
// 9. Crop เฉพาะแถบ 1 บรรทัด + รัน OCR
// ==========================================
function captureAndPreprocessFrame(sourceEl, isFullImage = false) {
  const srcW = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width;
  const srcH = sourceEl.videoHeight || sourceEl.naturalHeight || sourceEl.height;
  if (!srcW || !srcH) return false;

  let sx, sy, cropW, cropH;
  if (isFullImage) {
    sx = 0; sy = 0; cropW = srcW; cropH = srcH;
  } else {
    cropW = Math.floor(srcW * 0.86);
    cropH = Math.floor(srcH * 0.11);
    sx = Math.floor((srcW - cropW) / 2);
    sy = Math.floor((srcH - cropH) / 2);
  }

  const maxW = 560;
  const scale = cropW > maxW ? maxW / cropW : 1;
  const targetW = Math.floor(cropW * scale);
  const targetH = Math.floor(cropH * scale);

  processedCanvas.width = targetW;
  processedCanvas.height = targetH;
  pCtx.drawImage(sourceEl, sx, sy, cropW, cropH, 0, 0, targetW, targetH);

  const imgData = pCtx.getImageData(0, 0, targetW, targetH);
  const data = imgData.data;
  const contrast = 1.5;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    let adj = (gray - 128) * contrast + 128;
    adj = Math.max(0, Math.min(255, adj));
    data[i] = adj;
    data[i + 1] = adj;
    data[i + 2] = adj;
  }
  pCtx.putImageData(imgData, 0, 0);
  return true;
}

function startScanningLoop() {
  if (scanTimer) clearInterval(scanTimer);
  scanTimer = setInterval(async () => {
    if (!isCameraActive || !isOcrReady || isProcessingFrame) return;
    isProcessingFrame = true;
    try {
      if (captureAndPreprocessFrame(video, false)) {
        await runOcrOnCanvas(false);
      }
    } finally {
      isProcessingFrame = false;
    }
  }, 550);
}

async function runOcrOnCanvas(forceSingleShot = false) {
  if (!ocrWorker) return;
  const { data: { text } } = await ocrWorker.recognize(processedCanvas);
  const parsed = extractMeterNumber(text);
  if (!parsed) return;

  const activeSlot = scannerState.activeSlot;
  const targetInput = activeSlot === 1 ? valueSlot1 : valueSlot2;
  const tagEl = activeSlot === 1 ? slot1EditTag : slot2EditTag;

  if (forceSingleShot) {
    targetInput.value = parsed;
    scannerState.lastOcrValue[activeSlot] = parsed;
    scannerState.wasManuallyEdited[activeSlot] = false;
    tagEl.textContent = 'ยังไม่แก้';
    tagEl.className = 'text-[11px] font-medium text-slate-400';
    stabilityText.textContent = `อ่านจากรูปได้: ${parsed} (ตรวจหรือแก้ก่อนกดบันทึก)`;
    return;
  }

  const buf = scannerState.stabilityBuffer;
  const prev = buf[buf.length - 1];
  if (parsed === prev) {
    buf.push(parsed);
  } else {
    scannerState.stabilityBuffer = [parsed];
  }

  const count = scannerState.stabilityBuffer.length;
  const req = scannerState.requiredMatches;
  stabilityText.textContent = `ค่าที่ ${activeSlot}: ${parsed} (${count}/${req})`;

  if (count >= req) {
    roiBox.classList.add('bg-emerald-400/15');
    if (!scannerState.wasManuallyEdited[activeSlot]) {
      targetInput.value = parsed;
      scannerState.lastOcrValue[activeSlot] = parsed;
      tagEl.textContent = 'ยังไม่แก้';
      tagEl.className = 'text-[11px] font-medium text-slate-400';
    }
  } else {
    roiBox.classList.remove('bg-emerald-400/15');
  }
}

imageUpload.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!isOcrReady) {
    showToast('รอระบบ AI โหลดสักครู่ครับ', '⏳');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = async () => {
      showToast('กำลังอ่านตัวเลขจากรูปภาพ...', '🔍');
      captureAndPreprocessFrame(img, true);
      await runOcrOnCanvas(true);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
});

// ==========================================
// 10. แคปภาพหลักฐานขนาดต่ำสุดที่อ่านออก (480px, JPEG 0.55)
// ==========================================
function captureEvidenceImage(maxWidth = 480, quality = 0.55) {
  let source = null;
  let srcW = 0;
  let srcH = 0;

  if (isCameraActive && video && video.videoWidth && video.videoHeight) {
    source = video;
    srcW = video.videoWidth;
    srcH = video.videoHeight;
  } else if (processedCanvas && processedCanvas.width && processedCanvas.height) {
    source = processedCanvas;
    srcW = processedCanvas.width;
    srcH = processedCanvas.height;
  }

  if (!source) return null;

  const scale = srcW > maxWidth ? maxWidth / srcW : 1;
  const targetW = Math.round(srcW * scale);
  const targetH = Math.round(srcH * scale);

  const evidenceCanvas = document.createElement('canvas');
  evidenceCanvas.width = targetW;
  evidenceCanvas.height = targetH;

  const ctx = evidenceCanvas.getContext('2d');
  ctx.drawImage(source, 0, 0, targetW, targetH);

  const mimeType = 'image/jpeg';
  const dataUrl = evidenceCanvas.toDataURL(mimeType, quality);
  const base64 = dataUrl.split(',')[1] || '';

  return { dataUrl, base64, mimeType };
}

// ==========================================
// 11. บันทึกรอบ + ส่ง Google Sheets / Drive + CSV
// ==========================================
function getEditStatusLabel() {
  const e1 = scannerState.wasManuallyEdited[1];
  const e2 = scannerState.wasManuallyEdited[2];
  if (e1 && e2) return 'แก้ทั้ง 2 ค่า';
  if (e1) return 'แก้ค่าที่ 1';
  if (e2) return 'แก้ค่าที่ 2';
  return 'ไม่แก้';
}

saveWebhookBtn.addEventListener('click', () => {
  const url = sheetWebhookUrl.value.trim();
  localStorage.setItem(STORAGE_KEY_WEBHOOK, url);
  if (url) {
    sheetStatusText.textContent = 'พร้อมส่งเข้าชีต';
    sheetStatusText.className = 'text-[11px] text-emerald-600 font-medium';
    showToast('บันทึกลิงก์ Google Apps Script แล้ว', '🔗');
  } else {
    sheetStatusText.textContent = 'ไม่ได้ตั้งค่าลิงก์';
    sheetStatusText.className = 'text-[11px] text-slate-400';
    showToast('ล้างลิงก์ Google Apps Script แล้ว', '🗑️');
  }
});

async function sendRecordToSheet(payload) {
  const url = (localStorage.getItem(STORAGE_KEY_WEBHOOK) || '').trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('Webhook error:', err);
  }
}

function persistRecordsSafe() {
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(savedRecords));
  } catch (e) {
    // หากพื้นที่ localStorage เต็ม ให้ตัดรูปตัวอย่างในรายการเก่าสุดออกเพื่อเก็บข้อมูลตัวเลขไว้เสมอ
    for (let i = savedRecords.length - 1; i >= 0; i--) {
      if (savedRecords[i].evidencePreview) {
        savedRecords[i].evidencePreview = '';
        break;
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(savedRecords));
    } catch (_) {}
  }
}

saveRoundBtn.addEventListener('click', async () => {
  const v1 = valueSlot1.value.trim();
  const v2 = valueSlot2.value.trim();
  if (!v1 && !v2) {
    showToast('กรุณาสแกนหรือกรอกอย่างน้อย 1 ค่าก่อนบันทึก', '⚠️');
    return;
  }

  const now = new Date();
  const slotInfo = getTwoHourSlotInfo(now);
  const editStatus = getEditStatusLabel();
  const evidence = captureEvidenceImage(480, 0.55);
  const fileName = `${slotInfo.dateStr}_${slotInfo.slotLabel.replace(':', '-')}.jpg`;

  const record = {
    id: Date.now(),
    date: slotInfo.dateStr,
    slot: slotInfo.slotLabel,
    timestamp: slotInfo.timeStr,
    value1: v1,
    value2: v2,
    editStatus,
    evidenceFileName: evidence ? fileName : 'ไม่มีภาพ',
    evidencePreview: evidence ? evidence.dataUrl : ''
  };

  savedRecords.unshift(record);
  persistRecordsSafe();
  renderRecords();

  if (navigator.vibrate) navigator.vibrate(60);

  // ส่งเข้า Google Apps Script (รวม base64 ของรูปหลักฐาน)
  await sendRecordToSheet({
    date: record.date,
    slot: record.slot,
    timestamp: record.timestamp,
    value1: record.value1,
    value2: record.value2,
    editStatus: record.editStatus,
    evidenceFileName: fileName,
    evidenceBase64: evidence ? evidence.base64 : '',
    evidenceMimeType: evidence ? evidence.mimeType : 'image/jpeg'
  });

  showToast(`บันทึกรอบ ${record.slot}${evidence ? ' + ภาพหลักฐาน' : ''} เรียบร้อย`, '📝');
});

function deleteRecord(id) {
  savedRecords = savedRecords.filter(r => r.id !== id);
  persistRecordsSafe();
  renderRecords();
  showToast('ลบรายการแล้ว', '🗑️');
}
window.deleteRecord = deleteRecord;

function renderRecords() {
  itemCount.textContent = savedRecords.length;
  Array.from(historyList.children).forEach(child => {
    if (child.id !== 'emptyState') child.remove();
  });

  if (savedRecords.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  savedRecords.forEach(item => {
    const li = document.createElement('li');
    li.className = 'p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-2.5';

    const thumbHtml = item.evidencePreview
      ? `<img src="${item.evidencePreview}" alt="หลักฐาน" class="w-16 h-12 object-cover rounded-lg border border-slate-300 shrink-0 bg-slate-200" />`
      : `<div class="w-16 h-12 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 shrink-0">ไม่มีรูป</div>`;

    li.innerHTML = `
      <div class="flex items-start gap-2.5 min-w-0">
        ${thumbHtml}
        <div class="space-y-1 min-w-0">
          <div class="flex flex-wrap items-center gap-1 text-[11px]">
            <span class="font-bold text-slate-800">${escapeHtml(item.date)}</span>
            <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">รอบ ${escapeHtml(item.slot)}</span>
            <span class="text-slate-400 font-mono">(${escapeHtml(item.timestamp)})</span>
            <span class="px-1.5 py-0.5 rounded font-medium ${item.editStatus === 'ไม่แก้' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'}">${escapeHtml(item.editStatus)}</span>
          </div>
          <div class="text-xs sm:text-sm font-bold text-slate-900 font-mono flex flex-wrap gap-x-3 gap-y-0.5">
            <span>ค่า 1: <span class="text-emerald-700">${escapeHtml(item.value1 || '-')}</span></span>
            <span>ค่า 2: <span class="text-blue-700">${escapeHtml(item.value2 || '-')}</span></span>
          </div>
        </div>
      </div>
      <button type="button" onclick="deleteRecord(${item.id})" class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0" title="ลบ">✕</button>
    `;
    historyList.appendChild(li);
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

exportCsvBtn.addEventListener('click', () => {
  if (savedRecords.length === 0) {
    showToast('ไม่มีรายการสำหรับส่งออก CSV', '⚠️');
    return;
  }
  let csv = '\uFEFFวันที่,รอบเวลา,เวลาบันทึกจริง,ค่าที่ 1,ค่าที่ 2,สถานะการแก้ค่า,ไฟล์รูปหลักฐาน\n';
  [...savedRecords].reverse().forEach(r => {
    csv += `"${r.date}","${r.slot}","${r.timestamp}","${r.value1}","${r.value2}","${r.editStatus}","${r.evidenceFileName || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meter-2hr-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('ดาวน์โหลดไฟล์ CSV เรียบร้อย', '📊');
});

clearAllBtn.addEventListener('click', () => {
  if (savedRecords.length === 0) return;
  savedRecords = [];
  localStorage.setItem(STORAGE_KEY_RECORDS, '[]');
  renderRecords();
  showToast('ล้างประวัติทั้งหมดแล้ว', '🧹');
});

toggleCamBtn.addEventListener('click', toggleCamera);

// ==========================================
// 12. เริ่มต้นทำงานเมื่อโหลดหน้าเว็บ
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
  updateClockAndSlot();
  setInterval(updateClockAndSlot, 1000);
  renderRecords();
  initTesseract();
});