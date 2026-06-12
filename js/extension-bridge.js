const PENDING_JOB_KEY = 'AI_TR_PENDING_SELECTION_JOB';
const MESSAGE_SELECTION_JOB = 'AI_TR_SELECTION_JOB';

function isExtensionPage(){
  return location.protocol === 'chrome-extension:' &&
    typeof chrome !== 'undefined' &&
    !!chrome.runtime?.id;
}

if (isExtensionPage()){
  const storageArea = chrome.storage?.session || chrome.storage?.local;
  const storageAreaName = chrome.storage?.session ? 'session' : 'local';
  let lastJobId = '';

  function dispatchSelectionJob(job){
    if (!job || typeof job !== 'object') return;
    const text = String(job.text || '').trim();
    const images = Array.isArray(job.images) ? job.images : [];
    const error = String(job.error || '').trim();
    if (!text && !images.length && !error) return;

    const jobId = String(job.id || `${job.createdAt || Date.now()}-${text.slice(0, 24)}-${images.length}`);
    if (jobId === lastJobId) return;
    lastJobId = jobId;

    window.dispatchEvent(new CustomEvent('ai-tr:external-input', {
      detail: {
        jobId,
        text,
        html: job.html || '',
        images,
        error,
        autoTranslate: job.autoTranslate !== false,
        sourceTitle: job.sourceTitle || '',
        sourceUrl: job.sourceUrl || '',
        imageUrl: job.imageUrl || '',
        tabId: job.tabId,
        windowId: job.windowId
      }
    }));
  }

  async function consumePendingJob(){
    if (!storageArea) return;
    try {
      const result = await storageArea.get(PENDING_JOB_KEY);
      const job = result?.[PENDING_JOB_KEY];
      if (!job) return;
      await storageArea.remove(PENDING_JOB_KEY);
      dispatchSelectionJob(job);
    } catch (error) {
      console.warn('Failed to consume pending translation job', error);
    }
  }

  function scheduleConsumePendingJob(){
    setTimeout(() => {
      consumePendingJob();
    }, 0);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', scheduleConsumePendingJob, { once: true });
  } else {
    scheduleConsumePendingJob();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MESSAGE_SELECTION_JOB) return;
    dispatchSelectionJob(message.job);
    if (typeof sendResponse === 'function') sendResponse({ ok: true });
  });

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== storageAreaName) return;
    const pending = changes[PENDING_JOB_KEY]?.newValue;
    if (!pending) return;
    Promise.resolve(storageArea?.remove(PENDING_JOB_KEY)).catch(error => {
      console.warn('Failed to clear pending translation job', error);
    });
    dispatchSelectionJob(pending);
  });
}
