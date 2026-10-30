'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const announce = message => {
    const output = $('#copy-status');
    if (output) output.textContent = message;
  };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const filterDevices = () => {
    const dialog = $('#devices-dialog');
    const search = $('#device-filter');
    if (!dialog || !search) return;
    const query = normalize(search.value.trim());
    const items = [...dialog.querySelectorAll('[data-live-region="modal-device-list"] .device-tile')];
    let count = 0;
    for (const item of items) {
      const name = item.querySelector('.device-info')?.textContent || '';
      const alias = item.dataset.deviceAlias || '';
      const matched = normalize(name + ' ' + alias).includes(query);
      item.hidden = !matched;
      if (matched) count++;
    }
    $('#device-filter-count').textContent = count + ' / ' + items.length + ' thiết bị';
    $('#device-filter-empty').hidden = count !== 0;
  };
  const openModal = (name, focusId) => {
    const dialog = document.getElementById(name);
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (!dialog.open) dialog.showModal();
    if (name === 'devices-dialog') {
      $('#device-filter').value = '';
      filterDevices();
      const row = focusId ? [...dialog.querySelectorAll('.device-tile')].find(x => x.dataset.deviceId === focusId) : null;
      if (row) {
        row.scrollIntoView({block:'nearest'});
        row.querySelector('.device-options-trigger')?.focus({preventScroll:true});
      } else {
        $('#device-filter')?.focus({preventScroll:true});
      }
    } else if (name === 'add-device-dialog') {
      dialog.querySelector('#device-name')?.focus();
    } else {
      dialog.querySelector('.dialog-head h2')?.focus({preventScroll:true});
    }
  };
  document.addEventListener('input', event => { if (event.target?.id === 'device-filter') filterDevices(); });

  // Native popovers are dropdowns in the browser's top layer, never modal windows.
  const positionDropdown = panel => {
    const trigger = document.querySelector('[popovertarget="' + panel.id + '"]');
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const w = Math.min(344, window.innerWidth - 20);
    panel.style.width = w + 'px';
    panel.style.maxHeight = Math.max(160, window.innerHeight - 20) + 'px';
    const height = Math.min(panel.scrollHeight, window.innerHeight - 20);
    const below = window.innerHeight - bounds.bottom;
    const top = below >= height + 9 ? bounds.bottom + 8 : Math.max(10, bounds.top - height - 8);
    panel.style.left = Math.max(10, Math.min(bounds.right - w, window.innerWidth - w - 10)) + 'px';
    panel.style.top = top + 'px';
  };
  document.addEventListener('toggle', event => {
    const panel = event.target;
    if (!(panel instanceof HTMLElement)) return;
    if (panel.matches('.dropdown-disclosure')) {
      const parent = panel.closest('[data-device-popover]');
      if (parent?.matches(':popover-open')) requestAnimationFrame(() => positionDropdown(parent));
      return;
    }
    if (!panel.matches('[data-device-popover]')) return;
    const button = document.querySelector('[popovertarget="' + panel.id + '"]');
    button?.setAttribute('aria-expanded', String(event.newState === 'open'));
    if (event.newState === 'open') positionDropdown(panel);
    else if (managerNeedsSync) { managerNeedsSync = false; void refreshVisible(); }
  }, true);
  const closeDropdowns = () => document.querySelectorAll('[data-device-popover]:popover-open').forEach(panel => panel.hidePopover());
  document.addEventListener('scroll', () => {
    for (const panel of document.querySelectorAll('[data-device-popover]:popover-open')) {
      const trigger = document.querySelector('[popovertarget="' + panel.id + '"]');
      if (!trigger) { panel.hidePopover(); continue; }
      const r = trigger.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) panel.hidePopover();
      else positionDropdown(panel);
    }
  }, true);
  window.addEventListener('resize', closeDropdowns);

  document.addEventListener('click', async event => {
    const start = event.target.closest('[data-open-dialog]');
    if (start) { openModal(start.dataset.openDialog, start.dataset.deviceFocus); return; }
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
  const autoDialog = document.querySelector('dialog[data-auto-open]');
  if (autoDialog) {
    autoDialog.showModal();
    autoDialog.querySelector('.dialog-head h2')?.focus({preventScroll:true});
  }

  const liveHealth = $('#live-health');
  const updateHealth = (ok, label) => {
    if (!liveHealth) return;
    liveHealth.classList.toggle('is-delayed', !ok);
    liveHealth.innerHTML = '<span class="status-dot ' + (ok ? 'is-online' : '') + '"></span><span>' + label + '</span>';
  };

  let fetching = false;
  let needAnother = false;
  let managerNeedsSync = false;
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
      for (const name of ['metrics','preview-devices','recent-activities','activity-list','activity-pagination','client-list','device-full-list','modal-device-list','mcp-status']) {
        const selector = '[data-live-region="' + name + '"]';
        const oldNode = $(selector), newNode = parsed.querySelector(selector);
        if (!oldNode || !newNode) continue;
        const existingRows = [...oldNode.querySelectorAll('[data-device-id]')];
        const incomingRows = [...newNode.querySelectorAll('[data-device-id]')];
        const sameDevices = existingRows.length === incomingRows.length &&
          existingRows.every((row,i) => row.dataset.deviceId === incomingRows[i].dataset.deviceId);
        const modalIsOpen = name === 'modal-device-list' && !!$('#devices-dialog')?.open;
        if ((name === 'preview-devices' && sameDevices) || modalIsOpen) {
          const incoming = new Map(incomingRows.map(row => [row.dataset.deviceId,row]));
          for (const row of existingRows) {
            const badge = row.querySelector('.status-badge');
            const fresh = incoming.get(row.dataset.deviceId)?.querySelector('.status-badge');
            if (badge && fresh && badge.outerHTML !== fresh.outerHTML) badge.replaceWith(fresh.cloneNode(true));
            // Keep an open dropdown's startup controls consistent with the newly
            // reported agent state, without replacing the device row/popover.
            const currentStartup = row.querySelector('.dropdown-startup');
            const nextStartup = incoming.get(row.dataset.deviceId)?.querySelector('.dropdown-startup');
            if (currentStartup && nextStartup) {
              const currentSummary = currentStartup.querySelector('.startup-status');
              const nextSummary = nextStartup.querySelector('.startup-status');
              if (currentSummary && nextSummary) currentSummary.textContent = nextSummary.textContent;
              const currentBody = currentStartup.querySelector('.dropdown-disclosure-body');
              const nextBody = nextStartup.querySelector('.dropdown-disclosure-body');
              if (currentBody && nextBody && currentBody.innerHTML !== nextBody.innerHTML) {
                currentBody.innerHTML = nextBody.innerHTML;
                const panel = row.querySelector('[data-device-popover]:popover-open');
                if (panel) requestAnimationFrame(() => positionDropdown(panel));
              }
            }
          }
          if (modalIsOpen && !sameDevices) managerNeedsSync = true;
          continue; // Preserve button nodes, focus and open popovers during realtime refreshes.
        }
        if (name === 'preview-devices' && !!oldNode.querySelector('[data-device-popover]:popover-open')) {
          managerNeedsSync = true;
          continue; // Defer structural preview changes while a quick menu is open.
        }
        oldNode.replaceWith(newNode);
        if (name === 'modal-device-list') filterDevices();
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

  $('#devices-dialog')?.addEventListener('close', () => {
    closeDropdowns();
    if (managerNeedsSync) { managerNeedsSync = false; void refreshVisible(); }
  });
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
