'use strict';

(() => {
  const $ = selector => document.querySelector(selector);
  const announce = message => {
    const output = $('#copy-status');
    if (output) output.textContent = message;
  };
  const filterDevices = () => {
    const search = $('#device-filter');
    if (!search) return;
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const query = normalize(search.value.trim());
    const items = [...document.querySelectorAll('#devices-dialog .device-tile')];
    let visible = 0;
    for (const item of items) {
      const visibleText = item.querySelector('.device-info')?.textContent || '';
      const alias = item.querySelector('[data-device-actions]')?.dataset.alias || '';
      const matches = normalize(visibleText + ' ' + alias).includes(query);
      item.hidden = !matches;
      if (matches) visible++;
    }
    const count = $('#device-filter-count');
    if (count) count.textContent = visible + ' / ' + items.length + ' thiết bị';
    const empty = $('#device-filter-empty');
    if (empty) empty.hidden = visible !== 0;
  };
  document.addEventListener('input', event => {
    if (event.target?.id === 'device-filter') filterDevices();
  });

  const openModal = (name, focusId) => {
    const dialog = document.getElementById(name);
    if (!(dialog instanceof HTMLDialogElement)) return;
    if (!dialog.open) dialog.showModal();
    if (name === 'devices-dialog') {
      const field = $('#device-filter');
      if (field) field.value = '';
      filterDevices();
    }
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
    else if (name === 'devices-dialog') $('#device-filter')?.focus();
    else dialog.querySelector('.dialog-head h2')?.focus({preventScroll:true});
  };

  const openDeviceActions = trigger => {
    const template = [...document.querySelectorAll('template[data-device-action-template]')]
      .find(el => el.dataset.deviceActionTemplate === trigger.dataset.id);
    if (!template) return;
    const content = $('#device-actions-content');
    content.replaceChildren(template.content.cloneNode(true));
    openModal('device-actions-dialog');
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
    const details = event.target.closest('[data-connect-device]');
    if (details) {
      const name = details.dataset.deviceName || 'Thiết bị';
      const alias = details.dataset.deviceAlias || 'device';
      $('#connection-device-name').textContent = name;
      $('#connection-device-alias').textContent = 'Alias: ' + alias;
      const command = $('#connection-command');
      command.value = 'npx --yes --package=' + (command.dataset.agentPackage || '') +
        ' desktop-commander remote --endpoint <LINK_GHEP_NOI> --name ' + alias;
      openModal('device-connection-dialog');
      return;
    }
    const option = event.target.closest('[data-device-actions]');
    if (option) { openDeviceActions(option); return; }
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
      for (const name of ['metrics','preview-devices','recent-activities','activity-list','activity-pagination','client-list','device-full-list','modal-device-list','mcp-status']) {
        const selector = '[data-live-region="' + name + '"]';
        const oldNode = $(selector), newNode = parsed.querySelector(selector);
        if (!oldNode || !newNode) continue;
        if (oldNode.closest('dialog[open]')) {
          // Keep input and expanded controls intact while refreshing live status.
          if (name === 'modal-device-list') {
            const currentRows = [...oldNode.querySelectorAll('[data-device-id]')];
            const nextRows = new Map([...newNode.querySelectorAll('[data-device-id]')].map(el => [el.dataset.deviceId, el]));
            for (const row of currentRows) {
              const replacement = nextRows.get(row.dataset.deviceId)?.querySelector('.status-badge');
              const badge = row.querySelector('.status-badge');
              if (replacement && badge && replacement.outerHTML !== badge.outerHTML) {
                badge.replaceWith(replacement.cloneNode(true));
              }
            }
          }
          dirtyModal = true;
          continue;
        }
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
