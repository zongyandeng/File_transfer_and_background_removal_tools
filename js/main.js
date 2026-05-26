import { removeBackground } from 'https://cdn.jsdelivr.net/npm/@imgly/background-removal/+esm';

// ==========================================
// 全域狀態管理 (Global State Management)
// ==========================================
let filesQueue = [];       // 佇列檔案清單 { id, file, originalSize, processedBlob, status, progress, processedSize, format, previewUrl, originalUrl }
let currentPreviewId = null; // 當前選中並預覽的圖片 ID
let isProcessing = false;    // 是否正在批次處理中
let currentMode = 'both';    // 預設模式：both (去背 + 轉 WebP), bg-only (僅去背), webp-only (僅轉 WebP)
let webpQuality = 0.8;       // 預設 WebP 品質 (0.05 - 1.0)
let isModelPreloaded = false;// 模型是否已預載完成

// ==========================================
// DOM 元素參考 (DOM Element References)
// ==========================================
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const qualitySlider = document.getElementById('qualitySlider');
const qualityValue = document.getElementById('qualityValue');
const qualityControlGroup = document.getElementById('qualityControlGroup');
const queueList = document.getElementById('queueList');
const queueEmptyState = document.getElementById('queueEmptyState');
const btnClearQueue = document.getElementById('btnClearQueue');
const btnStartProcess = document.getElementById('btnStartProcess');
const btnDownloadAll = document.getElementById('btnDownloadAll');
const globalProgressBox = document.getElementById('globalProgressBox');
const progressStatusText = document.getElementById('progressStatusText');
const progressPercentText = document.getElementById('progressPercentText');
const globalProgressFill = document.getElementById('globalProgressFill');

// 預覽與對照區元素
const previewPlaceholder = document.getElementById('previewPlaceholder');
const sliderWrapper = document.getElementById('sliderWrapper');
const imgBefore = document.getElementById('imgBefore');
const imgAfter = document.getElementById('imgAfter');
const imgOverlay = document.getElementById('imgOverlay');
const sliderHandle = document.getElementById('sliderHandle');
const sliderRangeInput = document.getElementById('sliderRangeInput');
const previewImageInfo = document.getElementById('previewImageInfo');
const previewZoomInfo = document.getElementById('previewZoomInfo');

// ==========================================
// 初始化設置與監聽 (Initialization & Listeners)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initUploadListeners();
  initModeListeners();
  initQualityListeners();
  initSliderListeners();
  initActionListeners();
  
  // 視窗大小改變時，同步預覽對照圖寬度
  window.addEventListener('resize', syncSliderImagesWidth);
});

// ==========================================
// 1. 上傳與拖放區域邏輯 (Upload & Drag & Drop)
// ==========================================
function initUploadListeners() {
  // 點擊上傳區域觸發隱藏的 input
  dropzone.addEventListener('click', () => {
    if (!isProcessing) fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      addFilesToQueue(e.target.files);
      fileInput.value = ''; // 重置 input 讓同檔名可以重複上傳
    }
  });

  // 拖放事件處理
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing) dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    if (isProcessing) return;
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      addFilesToQueue(files);
    }
  }, false);
}

// 將上傳的檔案加入佇列陣列中
function addFilesToQueue(files) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
  let addedCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // 檢查是否為圖片
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|bmp|tiff)$/i)) {
      alert(`不支援檔案格式: ${file.name}\n請上傳常見照片格式。`);
      continue;
    }

    const fileId = 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const originalUrl = URL.createObjectURL(file);

    filesQueue.push({
      id: fileId,
      file: file,
      name: file.name,
      originalSize: file.size,
      processedBlob: null,
      status: 'waiting', // waiting, loading, processing, converting, success, error
      progress: 0,
      processedSize: 0,
      format: '', // png or webp
      previewUrl: null,
      originalUrl: originalUrl
    });
    addedCount++;
  }

  if (addedCount > 0) {
    updateQueueUI();
    // 預設將第一張圖片加載至預覽區 (如果當前無預覽)
    if (!currentPreviewId) {
      selectPreviewItem(filesQueue[filesQueue.length - addedCount].id);
    }
  }
}

// ==========================================
// 2. 模式選擇與品質調整邏輯 (Modes & Quality)
// ==========================================
function initModeListeners() {
  const modeOptions = document.querySelectorAll('.mode-option');
  modeOptions.forEach(option => {
    option.addEventListener('click', () => {
      if (isProcessing) return; // 處理中不允許更改模式

      modeOptions.forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      currentMode = option.getAttribute('data-mode');

      // 如果是「僅去背(bg-only)」，儲存格式為 PNG，隱藏/淡出 WebP 品質控制項
      if (currentMode === 'bg-only') {
        qualityControlGroup.style.opacity = '0.3';
        qualitySlider.disabled = true;
      } else {
        qualityControlGroup.style.opacity = '1';
        qualitySlider.disabled = false;
      }
    });
  });
}

function initQualityListeners() {
  qualitySlider.addEventListener('input', (e) => {
    const val = e.target.value;
    qualityValue.textContent = val + '%';
    webpQuality = parseInt(val) / 100;
  });
}

// ==========================================
// 3. 佇列 UI 與狀態渲染 (Queue Rendering & UI)
// ==========================================
function updateQueueUI() {
  const count = filesQueue.length;
  document.getElementById('btnStartProcess').disabled = count === 0 || isProcessing;
  
  // 更新清除按鈕與打包下載按鈕狀態
  const hasProcessed = filesQueue.some(item => item.status === 'success');
  btnDownloadAll.disabled = !hasProcessed || isProcessing;

  if (count === 0) {
    queueEmptyState.style.display = 'block';
    // 移除所有手動生成的 queue-item DOM
    const items = queueList.querySelectorAll('.queue-item');
    items.forEach(el => el.remove());
    
    // 重置預覽區
    resetPreviewArea();
    return;
  }

  queueEmptyState.style.display = 'none';

  // 清除現有的項目，重新繪製
  const existingItems = queueList.querySelectorAll('.queue-item');
  existingItems.forEach(el => el.remove());

  filesQueue.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `queue-item ${item.id === currentPreviewId ? 'active' : ''}`;
    itemEl.setAttribute('data-id', item.id);
    
    // 設定點擊事件：點小卡切換預覽
    itemEl.addEventListener('click', (e) => {
      // 避免點擊下載或刪除按鈕觸發卡片選取
      if (e.target.closest('.btn-item-download') || e.target.closest('.btn-item-delete')) return;
      selectPreviewItem(item.id);
    });

    const statusBadgeHtml = getStatusBadgeHtml(item.status, item.progress);
    const sizeHtml = getFileSizeHtml(item);

    itemEl.innerHTML = `
      <img src="${item.originalUrl}" class="queue-item-thumb" alt="thumb">
      <div class="queue-item-info">
        <div class="queue-item-name" title="${item.name}">${item.name}</div>
        <div class="queue-item-meta">
          <span>原圖: ${(item.originalSize / 1024 / 1024).toFixed(2)} MB</span>
          ${sizeHtml}
        </div>
      </div>
      <div class="queue-item-actions">
        ${statusBadgeHtml}
        ${item.status === 'success' ? `
          <div class="btn-item-download" title="下載此影像">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </div>
        ` : ''}
        ${!isProcessing ? `
          <div class="btn-item-delete" title="移除此影像">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </div>
        ` : ''}
      </div>
    `;

    // 綁定按鈕事件
    const btnDownload = itemEl.querySelector('.btn-item-download');
    if (btnDownload) {
      btnDownload.addEventListener('click', () => downloadSingleItem(item));
    }

    const btnDelete = itemEl.querySelector('.btn-item-delete');
    if (btnDelete) {
      btnDelete.addEventListener('click', () => deleteItemFromQueue(item.id));
    }

    queueList.appendChild(itemEl);
  });
}

// 根據狀態取得對應的 Badge HTML
function getStatusBadgeHtml(status, progress) {
  switch (status) {
    case 'waiting':
      return `<span class="status-badge status-waiting">排隊中</span>`;
    case 'loading':
      return `<span class="status-badge status-loading">模型載入中 ${progress}%</span>`;
    case 'processing':
      return `<span class="status-badge status-processing">AI 去背中...</span>`;
    case 'converting':
      return `<span class="status-badge status-converting">WebP 壓縮中</span>`;
    case 'success':
      return `<span class="status-badge status-success">已完成</span>`;
    case 'error':
      return `<span class="status-badge status-error" title="點擊檢視錯誤原因">錯誤</span>`;
    default:
      return '';
  }
}

// 取得處理後檔案大小與縮減百分比的 HTML
function getFileSizeHtml(item) {
  if (item.status !== 'success' || !item.processedSize) return '';
  const ratio = ((1 - (item.processedSize / item.originalSize)) * 100).toFixed(0);
  const sizeMb = (item.processedSize / 1024 / 1024).toFixed(2);
  const reductionColor = ratio > 0 ? 'var(--color-success)' : 'var(--color-error)';
  const sign = ratio > 0 ? '減少' : '增加';
  return `
    <span>•</span>
    <span>後: ${sizeMb} MB</span>
    <span>•</span>
    <span style="color: ${reductionColor}; font-weight: 700;">${sign} ${Math.abs(ratio)}%</span>
  `;
}

// 刪除佇列中的指定項目
function deleteItemFromQueue(id) {
  const index = filesQueue.findIndex(item => item.id === id);
  if (index === -1) return;

  const item = filesQueue[index];
  // 釋放資源物件 URL 避免記憶體洩漏
  if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);

  filesQueue.splice(index, 1);

  if (currentPreviewId === id) {
    currentPreviewId = filesQueue.length > 0 ? filesQueue[0].id : null;
  }

  updateQueueUI();
  if (currentPreviewId) {
    selectPreviewItem(currentPreviewId);
  } else {
    resetPreviewArea();
  }
}

// ==========================================
// 4. 行動控制項與按鈕事件 (Actions & Buttons)
// ==========================================
function initActionListeners() {
  // 清空佇列
  btnClearQueue.addEventListener('click', () => {
    if (isProcessing) return;
    if (confirm('確定要清空當前佇列中所有的照片嗎？')) {
      filesQueue.forEach(item => {
        if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      filesQueue = [];
      currentPreviewId = null;
      updateQueueUI();
    }
  });

  // 開始批次處理
  btnStartProcess.addEventListener('click', () => {
    if (filesQueue.length === 0 || isProcessing) return;
    startBatchProcessing();
  });

  // 打包下載全部 (ZIP)
  btnDownloadAll.addEventListener('click', () => {
    downloadAllAsZip();
  });
}

// ==========================================
// 5. 核心：批次處理佇列管理器 (Core Queue Manager)
// ==========================================
async function startBatchProcessing() {
  isProcessing = true;
  document.getElementById('btnStartProcess').disabled = true;
  disableControlInputs(true);
  
  // 準備開始
  globalProgressBox.style.display = 'block';
  
  // 過濾出尚未處理或處理失敗的項目
  const pendingItems = filesQueue.filter(item => item.status === 'waiting' || item.status === 'error');
  
  // 將所有 pending 項目設為 waiting 狀態
  pendingItems.forEach(item => {
    item.status = 'waiting';
    item.progress = 0;
  });
  updateQueueUI();

  try {
    for (let i = 0; i < pendingItems.length; i++) {
      const item = pendingItems[i];
      await processSingleItem(item);
    }
  } catch (err) {
    console.error('批次處理時發生未預期錯誤:', err);
  } finally {
    isProcessing = false;
    globalProgressBox.style.display = 'none';
    disableControlInputs(false);
    updateQueueUI();
    
    // 批次結束後，重新刷新當前預覽區
    if (currentPreviewId) {
      selectPreviewItem(currentPreviewId);
    }
  }
}

// 鎖定/解鎖所有設定輸入項，避免處理中途被修改
function disableControlInputs(disable) {
  const modeOptions = document.querySelectorAll('.mode-option');
  modeOptions.forEach(el => {
    if (disable) el.style.pointerEvents = 'none';
    else el.style.pointerEvents = 'auto';
  });
  
  if (currentMode !== 'bg-only') {
    qualitySlider.disabled = disable;
  }
  btnClearQueue.style.pointerEvents = disable ? 'none' : 'auto';
  btnClearQueue.style.opacity = disable ? '0.3' : '1';
}

// 全域進度條更新
function updateGlobalProgress(statusText, percent) {
  progressStatusText.textContent = statusText;
  progressPercentText.textContent = percent + '%';
  globalProgressFill.style.width = percent + '%';
}

// 處理單一圖片的核心非同步任務
async function processSingleItem(item) {
  console.log(`開始處理影像: ${item.name}, 模式: ${currentMode}`);
  
  try {
    let activeBlob = item.file; // 預設使用原檔案
    
    // ==========================================
    // 步驟 A: AI 去背處理 (如果模式為 both 或 bg-only)
    // ==========================================
    if (currentMode === 'both' || currentMode === 'bg-only') {
      item.status = 'loading';
      item.progress = 0;
      updateQueueUI();
      updateGlobalProgress(`正在初始化去背模型 [${item.name}]`, 0);

      const bgRemovalConfig = {
        progress: (key, current, total) => {
          // 下載進度
          const percent = Math.round((current / total) * 100);
          item.progress = percent;
          updateQueueUI();
          updateGlobalProgress(`正在下載 AI 模型檔案: ${Math.round(current/1024/1024)}MB / ${Math.round(total/1024/1024)}MB`, percent);
        }
      };

      item.status = 'processing';
      updateQueueUI();
      updateGlobalProgress(`AI 去背引擎分析中 [${item.name}]...`, 100);
      
      // 調用 AI 去背庫，此操作可能需要數秒
      const removedBgBlob = await removeBackground(item.file, bgRemovalConfig);
      activeBlob = removedBgBlob;
    }

    // ==========================================
    // 步驟 B: WebP 轉換與壓縮 (如果模式為 both 或 webp-only)
    // ==========================================
    if (currentMode === 'both' || currentMode === 'webp-only') {
      item.status = 'converting';
      updateQueueUI();
      updateGlobalProgress(`正在進行 Canvas WebP 效能壓縮...`, 100);

      const compressedWebpBlob = await convertToWebP(activeBlob, webpQuality);
      item.processedBlob = compressedWebpBlob;
      item.format = 'webp';
    } else {
      // 僅去背模式：保留 AI 產出的透明 PNG Blob
      item.processedBlob = activeBlob;
      item.format = 'png';
    }

    // ==========================================
    // 步驟 C: 完成儲存與資源生成
    // ==========================================
    item.processedSize = item.processedBlob.size;
    item.status = 'success';
    
    // 如果之前有預覽物件 URL，釋放它
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    item.previewUrl = URL.createObjectURL(item.processedBlob);
    
    console.log(`處理成功: ${item.name}. 壓縮後大小: ${(item.processedSize/1024).toFixed(1)} KB`);

  } catch (error) {
    console.error(`影像處理失敗 [${item.name}]:`, error);
    item.status = 'error';
    updateGlobalProgress(`影像處理出錯: ${item.name}`, 100);
  } finally {
    updateQueueUI();
  }
}

// Canvas 影像轉換與品質壓縮
function convertToWebP(imageBlob, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imageBlob);
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        // 清理畫布，確保透明背景在繪製時為透明 (Alpha)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        
        canvas.toBlob((webpBlob) => {
          URL.revokeObjectURL(objectUrl); // 釋放記憶體
          if (webpBlob) {
            resolve(webpBlob);
          } else {
            reject(new Error('Canvas toBlob 轉換 WebP 失敗'));
          }
        }, 'image/webp', quality);
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Canvas 影像載入失敗'));
    };

    img.src = objectUrl;
  });
}

// ==========================================
// 6. Before-After 拖曳滑動對照列 (Interactive Slider)
// ==========================================
function initSliderListeners() {
  // 當拉動 input range 滑桿時，同步更新 Overlay 與 Handle 的 CSS 位置
  sliderRangeInput.addEventListener('input', (e) => {
    const val = e.target.value;
    updateSliderPosition(val);
  });
}

// 更新 Before/After 對照介面的遮罩寬度與滑桿位置
function updateSliderPosition(percent) {
  sliderHandle.style.left = percent + '%';
  imgOverlay.style.width = percent + '%';
}

// 同步 before 與 after 圖片的顯示像素尺寸，防止 object-fit 導致兩者縮放不一致
function syncSliderImagesWidth() {
  if (sliderWrapper.style.display === 'none') return;

  // 讀取 imgBefore（底層原圖）的實際顯示寬高尺寸，強制將 imgAfter 也設為相同尺寸
  const rect = imgBefore.getBoundingClientRect();
  
  // 設定 imgOverlay 內部 imgAfter 的固定尺寸
  imgAfter.style.width = rect.width + 'px';
  imgAfter.style.height = rect.height + 'px';
  
  // 由於圖片是置中的，我們需要確保 clipping 容器 (imgOverlay) 的內部圖片也是對齊同一基準
  // 取得 sliderWrapper 的矩形尺寸
  const wrapperRect = sliderWrapper.getBoundingClientRect();
  
  // 計算圖片在容器中的置中 offset 偏移量，並補償給 imgAfter
  const leftOffset = (wrapperRect.width - rect.width) / 2;
  const topOffset = (wrapperRect.height - rect.height) / 2;
  
  imgAfter.style.position = 'absolute';
  imgAfter.style.left = leftOffset + 'px';
  imgAfter.style.top = topOffset + 'px';
}

// 選取並加載預覽圖片
function selectPreviewItem(id) {
  currentPreviewId = id;
  
  // 更新佇列中 Active 項目的外觀
  const items = queueList.querySelectorAll('.queue-item');
  items.forEach(el => {
    if (el.getAttribute('data-id') === id) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  const item = filesQueue.find(x => x.id === id);
  if (!item) return;

  previewImageInfo.textContent = `${item.name} (${(item.originalSize/1024/1024).toFixed(2)} MB)`;

  // 如果已成功處理，載入 Before-After 滑動對比
  if (item.status === 'success' && item.previewUrl) {
    previewPlaceholder.style.display = 'none';
    sliderWrapper.style.display = 'flex';
    
    // 設定圖片路徑
    imgBefore.src = item.originalUrl;
    imgAfter.src = item.previewUrl;
    
    // 重置對照滑桿至 50%
    sliderRangeInput.value = 50;
    updateSliderPosition(50);
    
    // 圖片載入完成後同步尺寸
    imgBefore.onload = () => {
      syncSliderImagesWidth();
    };
    
    // 強制再次同步（如果圖片已經被快取直接載入）
    setTimeout(syncSliderImagesWidth, 80);
    
  } else {
    // 尚未處理完成，僅顯示原圖
    previewPlaceholder.style.display = 'none';
    sliderWrapper.style.display = 'flex';
    
    imgBefore.src = item.originalUrl;
    imgAfter.src = item.originalUrl; // 也是原圖
    
    // 重置滑桿
    sliderRangeInput.value = 100;
    updateSliderPosition(100);
    
    imgBefore.onload = () => {
      syncSliderImagesWidth();
    };
    setTimeout(syncSliderImagesWidth, 80);
    
    if (item.status === 'error') {
      previewImageInfo.textContent = `${item.name} (處理出錯，請嘗試重新處理)`;
    } else {
      previewImageInfo.textContent = `${item.name} (等待處理中)`;
    }
  }
}

// 重置預覽區至預設狀態
function resetPreviewArea() {
  previewPlaceholder.style.display = 'flex';
  sliderWrapper.style.display = 'none';
  imgBefore.src = '';
  imgAfter.src = '';
  previewImageInfo.textContent = '未選取圖片';
  currentPreviewId = null;
}

// ==========================================
// 7. 下載控制 (Download Logic)
// ==========================================

// 下載單張處理後影像
function downloadSingleItem(item) {
  if (item.status !== 'success' || !item.processedBlob) return;
  
  const link = document.createElement('a');
  
  // 自動命名：檔名_processed.webp (或 .png)
  const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
  link.download = `${baseName}_processed.${item.format}`;
  link.href = item.previewUrl;
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// 批次打包為 ZIP 並下載
async function downloadAllAsZip() {
  const successItems = filesQueue.filter(item => item.status === 'success' && item.processedBlob);
  if (successItems.length === 0) return;

  isProcessing = true;
  disableControlInputs(true);
  btnDownloadAll.textContent = '正在打包 ZIP 壓縮檔...';

  try {
    const zip = new JSZip();
    
    // 將每張處理成功的圖片加入 zip
    successItems.forEach(item => {
      const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
      const fileName = `${baseName}_processed.${item.format}`;
      zip.file(fileName, item.processedBlob);
    });

    // 產生 zip 壓縮檔案
    const content = await zip.generateAsync({ type: 'blob' });
    
    // 下載壓縮包
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    link.download = `iDeer_Processed_Images_${timestamp}.zip`;
    link.href = URL.createObjectURL(content);
    
    document.body.appendChild(link);
    link.click();
    
    // 釋放記憶體
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }, 100);

  } catch (err) {
    console.error('打包壓縮檔時發生錯誤:', err);
    alert('打包下載失敗，請嘗試手動單張下載！');
  } finally {
    isProcessing = false;
    disableControlInputs(false);
    btnDownloadAll.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      打包下載全部 (ZIP)
    `;
    updateQueueUI();
  }
}
