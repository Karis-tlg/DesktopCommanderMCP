'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const announce = message => {
    const output = $('#copy-status');
    if (output) output.textContent = message;
  };
  const openModal = (name, focusId) => {
    const dialog = document.getElementById(name);
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (!dialog.open) dialog.showModal();
    dialog.querySelectorAll('.device-selected').forEach(row => row.classList.remove('device-selected'));
    if (focusId) {
      const row = [...dialog.querySelectorAll('[data-device-id]')].find(el => el.dataset.deviceId === focusId);
      if (row) {
        row.scrollIntoView({block:'nearest'});
        row.classList.add('device-selected');
        (row.querySelector('button, summary') || row).focus({preventScroll:true});
        return;
      }
    }
    if (name === 'add-device-dialog') dialog.querySelector('#device-name')?.focus();
  };

  document.addEventListener('click', async event => {
    const start = event.target.closest('[data-open-dialog]');
    if (start) {
      openModal(start.dataset.openDialog, start.dataset.deviceFocus);
      return;
    }
    if (event.target.closest('[data-close-dialog]')) {
      event.target.closest('dialog')?.close();
      return;
    }
    const copy = event.target.closest('[data-copy-target]');
    if (copy) {
      const field = document.getElementById(copy.dataset.copyTarget);
      if (!field) return;
      try {
        await navigator.clipboard.writeText(field.value);
        announce('Đã sao chép địa chỉ MCP.');
        const original = copy.innerHTML;
        copy.textContent = 'Đã sao chép';
        setTimeout(() => { if (copy.isConnected) copy.innerHTML = original; }, 1600);
      } catch {
        field.focus();
        field.select();
        announce('Địa chỉ đã được chọn. Nhấn Ctrl+C để sao chép.');
      }
    }
  });
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
  });
  document.querySelector('dialog[data-auto-open]')?.showModal();

  const liveHealth = $('#live-health');
  const updateHealth = (ok, label) => {
    if (!liveHealth) return;
    liveHealth.classList.toggle('is-delayed', !ok);
    liveHealth.innerHTML = '<span class="status-dot ' + (ok ? 'is-online' : '') + '"></span><span>' + label + '</span>';
  };

  let fetching = false;
  let needAnother = false;
  let dirtyModal = false;
  let previousRevision = null;
  let latestEvent = Date.now();

  const refreshVisible = async () => {
    if (fetching) { needAnother = true; return; }
    if (document.visibilityState === 'hidden') return;
    fetching = true;
    try {
      const response = await fetch(location.pathname + location.search, {
        method:'GET', credentials:'same-origin', headers:{'Accept':'text/html'}, cache:'no-store'
      });
      if (!response.ok) {
        if (response.status === 401) updateHealth(false,'Phiên đăng nhập hết hạn');
        return;
      }
      const parsed = new DOMParser().parseFromString(await response.text(), 'text/html');
      for (const name of ['metrics','preview-devices','recent-activities','activity-list','client-list','device-full-list','modal-device-list','mcp-status']) {
        const selector = '[data-live-region="' + name + '"]';
        const oldNode = $(selector), newNode = parsed.querySelector(selector);
        if (!oldNode || !newNode) continue;
        if (oldNode.closest('dialog[open]')) { dirtyModal = true; continue; } // Do not interrupt active controls.
        oldNode.replaceWith(newNode);
      }
      const newCount = parsed.querySelector('[data-device-total]');
      const oldCount = $('[data-device-total]');
      if (oldCount && newCount) oldCount.textContent = newCount.textContent;
      updateHealth(true,'Trực tiếp');
    } catch {
      updateHealth(false,'Đang kết nối lại');
    } finally {
      fetching = false;
      if (needAnother) { needAnother = false; void refreshVisible(); }
    }
  };

  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('close', () => {
    if (dirtyModal) { dirtyModal = false; void refreshVisible(); }
  }));

  // Native SSE reconnects automatically. No polling loops or public status endpoints.
  if ('EventSource' in window) {
    const events = new EventSource('/dashboard/events', {withCredentials:true});
    events.addEventListener('change', event => {
      latestEvent = Date.now();
      try {
        const detail = JSON.parse(event.data);
        if (detail.revision === previousRevision) return;
        previousRevision = detail.revision;
        updateHealth(true,'Trực tiếp');
        // Reconcile the initial SSE revision too; state may change between HTML load and subscription.
        void refreshVisible();
      } catch {}
    });
    events.addEventListener('heartbeat', () => {
      latestEvent = Date.now();
      updateHealth(true,'Trực tiếp');
    });
    events.onerror = () => updateHealth(false,'Đang kết nối lại');
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refreshVisible();
    });
    window.addEventListener('pagehide', () => events.close(), {once:true});
    // Do not leave "live" displayed if the client stops receiving any events.
    setInterval(() => {
      if (document.visibilityState === 'visible' && Date.now() - latestEvent > 36000)
        updateHealth(false,'Mất kết nối cập nhật');
    }, 12000);
  } else {
    updateHealth(false,'Chưa hỗ trợ cập nhật trực tiếp');
  }
})();
