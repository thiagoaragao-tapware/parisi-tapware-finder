/* ==========================================================================
   PARISI TAPWARE FINDER — script.js
   Dados carregados de data.js (const PRODUCTS). Toda a busca, filtros,
   favoritos e "recent searches" rodam no navegador — nada é enviado a
   nenhum servidor.
   ========================================================================== */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  let products = normalizeProducts(PRODUCTS);
  let query = '';
  let activeFilter = 'all';       // all | hasLoc | noLoc | hasShelf | noShelf | favorites
  let sectionFilter = '';
  let statusFilter = '';
  let currentView = 'cards';      // cards | table
  let visibleCount = 60;
  const PAGE_SIZE = 60;

  const favorites = new Set(JSON.parse(localStorage.getItem('ptf_favorites') || '[]'));
  const recentSearches = JSON.parse(localStorage.getItem('ptf_recent') || '[]');

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const searchInput   = $('#searchInput');
  const btnClear      = $('#btnClear');
  const cardsGrid      = $('#cardsGrid');
  const tableBody      = $('#tableBody');
  const tableWrap      = $('#tableWrap');
  const emptyState     = $('#emptyState');
  const resultsCount   = $('#resultsCount');
  const loadMoreWrap   = $('#loadMoreWrap');
  const btnLoadMore    = $('#btnLoadMore');
  const recentWrap     = $('#recentWrap');
  const recentChips    = $('#recentChips');
  const overlay        = $('#overlay');
  const detailPanel    = $('#detailPanel');
  const detailInner    = $('#detailPanelInner');
  const toast          = $('#toast');
  const filterSection  = $('#filterSection');
  const filterStatus   = $('#filterStatus');
  const footerCount    = $('#footerCount');
  const favCountEl     = $('#favCount');
  const clockEl        = $('#clock');

  // ---------------------------------------------------------------------
  // Normalize raw data: {code,name,stock,locs:[{l,s,q,sec,st}]} -> richer shape
  // ---------------------------------------------------------------------
  function normalizeProducts(raw) {
    return raw.map((p) => {
      const locs = p.locs || [];
      const hasLoc = locs.some((l) => l.l);
      const hasShelf = locs.some((l) => l.s);
      const sections = [...new Set(locs.map((l) => l.sec).filter(Boolean))];
      const statuses = [...new Set(locs.map((l) => l.st).filter(Boolean))];
      return {
        code: p.code,
        name: p.name,
        stock: p.stock,
        locs,
        hasLoc,
        hasShelf,
        sections,
        statuses,
        searchBlob: (p.code + ' ' + p.name).toLowerCase(),
      };
    });
  }

  // ---------------------------------------------------------------------
  // Populate section / status filter dropdowns from data
  // ---------------------------------------------------------------------
  function populateFilterOptions() {
    const sections = new Set();
    const statuses = new Set();
    products.forEach((p) => {
      p.sections.forEach((s) => sections.add(s));
      p.statuses.forEach((s) => statuses.add(s));
    });
    [...sections].sort().forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      filterSection.appendChild(opt);
    });
    [...statuses].sort().forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      filterStatus.appendChild(opt);
    });
  }

  // ---------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------
  function renderStats() {
    const total = products.length;
    const withLoc = products.filter((p) => p.hasLoc).length;
    const withShelf = products.filter((p) => p.hasShelf).length;
    $('#statTotal').textContent = total.toLocaleString('pt-BR');
    $('#statWithLoc').textContent = withLoc.toLocaleString('pt-BR');
    $('#statNoLoc').textContent = (total - withLoc).toLocaleString('pt-BR');
    $('#statWithShelf').textContent = withShelf.toLocaleString('pt-BR');
    $('#statNoShelf').textContent = (total - withShelf).toLocaleString('pt-BR');
    footerCount.textContent = `${total.toLocaleString('pt-BR')} produtos carregados`;
  }

  // ---------------------------------------------------------------------
  // Search + filter + rank
  // ---------------------------------------------------------------------
  function scoreMatch(p, q) {
    if (!q) return 1;
    const code = p.code.toLowerCase();
    const name = p.name.toLowerCase();
    if (code === q) return 100;
    if (code.startsWith(q)) return 80;
    if (code.includes(q)) return 60;
    if (name.startsWith(q)) return 45;
    if (name.includes(q)) return 30;
    return 0;
  }

  function getFiltered() {
    const q = query.trim().toLowerCase();
    let list = products;

    if (q) {
      list = list
        .map((p) => ({ p, score: scoreMatch(p, q) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.p);
    }

    if (activeFilter === 'hasLoc') list = list.filter((p) => p.hasLoc);
    if (activeFilter === 'noLoc') list = list.filter((p) => !p.hasLoc);
    if (activeFilter === 'hasShelf') list = list.filter((p) => p.hasShelf);
    if (activeFilter === 'noShelf') list = list.filter((p) => !p.hasShelf);
    if (activeFilter === 'favorites') list = list.filter((p) => favorites.has(p.code));

    if (sectionFilter) list = list.filter((p) => p.sections.includes(sectionFilter));
    if (statusFilter) list = list.filter((p) => p.statuses.includes(statusFilter));

    return list;
  }

  // ---------------------------------------------------------------------
  // Highlight helper
  // ---------------------------------------------------------------------
  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    return (
      escapeHtml(text.slice(0, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>' +
      escapeHtml(text.slice(idx + q.length))
    );
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------------------------------------------------------------------
  // Render: main entry point
  // ---------------------------------------------------------------------
  function render() {
    const list = getFiltered();
    const q = query.trim();

    resultsCount.innerHTML = q || activeFilter !== 'all' || sectionFilter || statusFilter
      ? `<strong>${list.length.toLocaleString('pt-BR')}</strong> produto${list.length === 1 ? '' : 's'} encontrado${list.length === 1 ? '' : 's'}`
      : `Digite algo para buscar, ou explore os <strong>${list.length.toLocaleString('pt-BR')}</strong> produtos abaixo`;

    if (list.length === 0) {
      cardsGrid.innerHTML = '';
      tableBody.innerHTML = '';
      emptyState.hidden = false;
      loadMoreWrap.hidden = true;
      cardsGrid.hidden = true;
      tableWrap.hidden = true;
      return;
    }

    emptyState.hidden = true;
    const visible = list.slice(0, visibleCount);
    loadMoreWrap.hidden = visible.length >= list.length;

    if (currentView === 'cards') {
      cardsGrid.hidden = false;
      tableWrap.hidden = true;
      cardsGrid.innerHTML = visible.map((p) => renderCard(p, q)).join('');
    } else {
      cardsGrid.hidden = true;
      tableWrap.hidden = false;
      tableBody.innerHTML = renderTableRows(visible, q);
    }
  }

  function primaryLoc(p) {
    // First entry that has a location or shelf, else first entry, else null
    return p.locs.find((l) => l.l || l.s) || p.locs[0] || null;
  }

  function renderCard(p, q) {
    const loc = primaryLoc(p);
    const isFav = favorites.has(p.code);
    const extraCount = p.locs.length > 1 ? p.locs.length : 0;

    return `
      <article class="card" data-code="${escapeHtml(p.code)}">
        <div class="card__top">
          <div class="card__code">${highlight(p.code, q)}</div>
          <button class="card__fav ${isFav ? 'is-fav' : ''}" data-action="fav" data-code="${escapeHtml(p.code)}" title="Favoritar" aria-label="Favoritar">
            <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M12 17.3 5.8 21l1.6-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.4 4.7L18.2 21z"/></svg>
          </button>
        </div>

        <div class="card__name">${highlight(p.name, q)}</div>

        <div class="card__badges">
          ${p.hasLoc ? '<span class="badge badge--ok">LOCATION OK</span>' : '<span class="badge badge--danger">NO LOCATION</span>'}
          ${p.hasShelf ? '<span class="badge badge--ok">SHELF OK</span>' : '<span class="badge badge--danger">NO SHELF</span>'}
          ${p.statuses[0] ? `<span class="badge badge--neutral">${escapeHtml(p.statuses[0])}</span>` : ''}
        </div>

        <div class="card__coords">
          <div class="coord">
            <div class="coord__label">
              <span>LOCATION</span>
              ${loc && loc.l ? `<button class="copy-btn" data-action="copy" data-value="${escapeHtml(loc.l)}" title="Copiar location">${iconCopy()}</button>` : ''}
            </div>
            <div class="coord__value ${loc && loc.l ? '' : 'is-empty'}">${loc && loc.l ? escapeHtml(loc.l) : '—'}</div>
          </div>
          <div class="coord">
            <div class="coord__label">
              <span>SHELF</span>
              ${loc && loc.s ? `<button class="copy-btn" data-action="copy" data-value="${escapeHtml(loc.s)}" title="Copiar shelf">${iconCopy()}</button>` : ''}
            </div>
            <div class="coord__value ${loc && loc.s ? '' : 'is-empty'}">${loc && loc.s ? escapeHtml(loc.s) : '—'}</div>
          </div>
        </div>

        <div class="card__footer">
          <span class="card__stock">Stock: <strong>${p.stock ?? '—'}</strong></span>
          ${extraCount > 1 ? `<span class="card__multi">+${extraCount - 1} local${extraCount - 1 > 1 ? 'is' : ''}</span>` : '<span></span>'}
        </div>
      </article>
    `;
  }

  function renderTableRows(list, q) {
    return list.map((p) => {
      const loc = primaryLoc(p);
      return `
        <tr data-code="${escapeHtml(p.code)}">
          <td class="mono">${highlight(p.code, q)}</td>
          <td>${highlight(p.name, q)}</td>
          <td class="mono">${loc && loc.l ? escapeHtml(loc.l) : '—'}</td>
          <td class="mono">${loc && loc.s ? escapeHtml(loc.s) : '—'}</td>
          <td class="mono">${loc && loc.q != null ? loc.q : '—'}</td>
          <td>${loc && loc.sec ? escapeHtml(loc.sec) : '—'}</td>
          <td>${loc && loc.st ? escapeHtml(loc.st) : '—'}</td>
        </tr>
      `;
    }).join('');
  }

  function iconCopy() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>';
  }

  // ---------------------------------------------------------------------
  // Detail panel
  // ---------------------------------------------------------------------
  function openDetail(code) {
    const p = products.find((x) => x.code === code);
    if (!p) return;
    const isFav = favorites.has(p.code);

    const locRows = p.locs.length
      ? p.locs.map((l) => `
        <div class="dp-loc-card">
          <div class="dp-loc-card__row"><span class="dp-loc-card__k">Location</span><span class="dp-loc-card__v">${l.l ? escapeHtml(l.l) : '—'}</span></div>
          <div class="dp-loc-card__row"><span class="dp-loc-card__k">Shelf</span><span class="dp-loc-card__v">${l.s ? escapeHtml(l.s) : '—'}</span></div>
          <div class="dp-loc-card__row"><span class="dp-loc-card__k">Qty</span><span class="dp-loc-card__v">${l.q != null ? l.q : '—'}</span></div>
          ${l.sec ? `<div class="dp-loc-card__row"><span class="dp-loc-card__k">Section</span><span class="dp-loc-card__v">${escapeHtml(l.sec)}</span></div>` : ''}
          ${l.st ? `<div class="dp-loc-card__row"><span class="dp-loc-card__k">Status</span><span class="dp-loc-card__v">${escapeHtml(l.st)}</span></div>` : ''}
        </div>`).join('')
      : '<p style="color:var(--text-faint);font-size:13px;">Nenhum registro de localização para este produto.</p>';

    detailInner.innerHTML = `
      <button class="dp-close" id="dpClose" aria-label="Fechar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6 18 18M6 18 18 6"/></svg>
      </button>

      <div class="dp-code">${escapeHtml(p.code)}</div>
      <div class="dp-name">${escapeHtml(p.name)}</div>

      <button class="dp-fav ${isFav ? 'is-fav' : ''}" data-action="fav" data-code="${escapeHtml(p.code)}">
        <svg viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8"><path d="M12 17.3 5.8 21l1.6-7.1L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.4 4.7L18.2 21z"/></svg>
        ${isFav ? 'Favoritado' : 'Adicionar aos favoritos'}
      </button>

      <div class="dp-section-title">Resumo</div>
      <div class="dp-field">
        <span class="dp-field__label">Product Code</span>
        <span class="dp-field__actions">
          <span class="dp-field__value">${escapeHtml(p.code)}</span>
          <button class="copy-btn" data-action="copy" data-value="${escapeHtml(p.code)}" title="Copiar código">${iconCopy()}</button>
        </span>
      </div>
      <div class="dp-field">
        <span class="dp-field__label">Stock total</span>
        <span class="dp-field__value">${p.stock ?? '—'}</span>
      </div>
      <div class="dp-field">
        <span class="dp-field__label">Location OK?</span>
        <span class="dp-field__value">${p.hasLoc ? '<span class="badge badge--ok">SIM</span>' : '<span class="badge badge--danger">NÃO</span>'}</span>
      </div>
      <div class="dp-field">
        <span class="dp-field__label">Shelf OK?</span>
        <span class="dp-field__value">${p.hasShelf ? '<span class="badge badge--ok">SIM</span>' : '<span class="badge badge--danger">NÃO</span>'}</span>
      </div>

      <div class="dp-section-title">Localizações registradas (${p.locs.length})</div>
      ${locRows}

      ${!p.hasLoc || !p.hasShelf ? `
        <div class="dp-alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>
          <span>Este produto está ${!p.hasLoc ? 'sem location' : ''}${!p.hasLoc && !p.hasShelf ? ' e ' : ''}${!p.hasShelf ? 'sem shelf' : ''} cadastrado. Verifique fisicamente e atualize a planilha de origem.</span>
        </div>` : ''}
    `;

    overlay.classList.add('is-visible');
    detailPanel.classList.add('is-open');
    detailPanel.setAttribute('aria-hidden', 'false');
  }

  function closeDetail() {
    overlay.classList.remove('is-visible');
    detailPanel.classList.remove('is-open');
    detailPanel.setAttribute('aria-hidden', 'true');
  }

  // ---------------------------------------------------------------------
  // Favorites
  // ---------------------------------------------------------------------
  function toggleFavorite(code) {
    if (favorites.has(code)) favorites.delete(code);
    else favorites.add(code);
    localStorage.setItem('ptf_favorites', JSON.stringify([...favorites]));
    favCountEl.textContent = favorites.size;
    render();
    if (detailPanel.classList.contains('is-open')) openDetail(code);
  }

  // ---------------------------------------------------------------------
  // Recent searches
  // ---------------------------------------------------------------------
  function pushRecent(q) {
    if (!q) return;
    const trimmed = q.trim();
    if (!trimmed) return;
    const idx = recentSearches.indexOf(trimmed);
    if (idx > -1) recentSearches.splice(idx, 1);
    recentSearches.unshift(trimmed);
    while (recentSearches.length > 6) recentSearches.pop();
    localStorage.setItem('ptf_recent', JSON.stringify(recentSearches));
    renderRecent();
  }

  function renderRecent() {
    if (!recentSearches.length) { recentWrap.hidden = true; return; }
    recentWrap.hidden = false;
    recentChips.innerHTML = recentSearches.map((r) =>
      `<button class="rchip" data-recent="${escapeHtml(r)}">${escapeHtml(r)}</button>`
    ).join('');
  }

  // ---------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------
  let toastTimer;
  function showToast(msg) {
    toast.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6 9 17l-5-5"/></svg><span>${escapeHtml(msg)}</span>`;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 1800);
  }

  function copyToClipboard(value) {
    navigator.clipboard?.writeText(value).then(() => showToast(`Copiado: ${value}`))
      .catch(() => showToast('Não foi possível copiar'));
  }

  // ---------------------------------------------------------------------
  // CSV export (filtered results)
  // ---------------------------------------------------------------------
  function exportCsv() {
    const list = getFiltered();
    if (!list.length) { showToast('Nada para exportar'); return; }
    const rows = [['Product Code', 'Description', 'Location', 'Shelf', 'Qty', 'Stock', 'Section', 'Status']];
    list.forEach((p) => {
      if (p.locs.length === 0) {
        rows.push([p.code, p.name, '', '', '', p.stock ?? '', '', '']);
      } else {
        p.locs.forEach((l) => {
          rows.push([p.code, p.name, l.l || '', l.s || '', l.q ?? '', p.stock ?? '', l.sec || '', l.st || '']);
        });
      }
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'parisi-tapware-finder-export.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exportado');
  }

  // ---------------------------------------------------------------------
  // Import spreadsheet (CSV or XLSX via SheetJS, loaded on demand)
  // ---------------------------------------------------------------------
  let sheetJsLoaded = false;
  function ensureSheetJs(cb) {
    if (sheetJsLoaded || window.XLSX) { cb(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = () => { sheetJsLoaded = true; cb(); };
    script.onerror = () => showToast('Falha ao carregar leitor de planilha');
    document.head.appendChild(script);
  }

  function importFile(file) {
    ensureSheetJs(() => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = window.XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '' });
          const rebuilt = rebuildFromRows(rows);
          products = normalizeProducts(rebuilt);
          filterSection.innerHTML = '<option value="">Todas as sections</option>';
          filterStatus.innerHTML = '<option value="">Todos os status</option>';
          populateFilterOptions();
          sectionFilter = ''; statusFilter = ''; activeFilter = 'all'; query = ''; searchInput.value = '';
          visibleCount = PAGE_SIZE;
          renderStats();
          render();
          showToast(`Planilha importada: ${products.length} produtos`);
        } catch (err) {
          console.error(err);
          showToast('Não foi possível ler este arquivo');
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function rebuildFromRows(rows) {
    const find = (row, names) => {
      for (const n of names) {
        const key = Object.keys(row).find((k) => k.trim().toLowerCase() === n.toLowerCase());
        if (key && row[key] !== '') return row[key];
      }
      return null;
    };
    const map = new Map();
    rows.forEach((row) => {
      const code = find(row, ['Product', 'Product Code', 'Code']);
      if (!code) return;
      const name = find(row, ['Description', 'Product Name', 'Name']) || '';
      const stockRaw = find(row, ['Available Stock', 'Stock', 'Quantity']);
      const loc = find(row, ['Location/Shelf', 'Location']);
      const shelf = find(row, ['Column1', 'Shelf']);
      const qty = find(row, ['Qty']);
      const section = find(row, ['Section']);
      const status = find(row, ['Status']);

      if (!map.has(code)) {
        map.set(code, { code: String(code), name: String(name), stock: stockRaw != null ? Number(stockRaw) : null, locs: [] });
      }
      const entry = { l: loc ? String(loc) : null, s: shelf ? String(shelf) : null, q: qty != null ? Number(qty) : null, sec: section ? String(section) : null, st: status ? String(status) : null };
      if (entry.l || entry.s || entry.q != null || entry.sec || entry.st) {
        map.get(code).locs.push(entry);
      }
    });
    return [...map.values()];
  }

  // ---------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------
  function tickClock() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('pt-BR', { hour12: false });
  }

  // ---------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------
  function wireEvents() {
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      btnClear.classList.toggle('is-visible', !!query);
      visibleCount = PAGE_SIZE;
      render();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') pushRecent(searchInput.value);
    });
    searchInput.addEventListener('blur', () => pushRecent(searchInput.value));

    btnClear.addEventListener('click', () => {
      query = ''; searchInput.value = ''; btnClear.classList.remove('is-visible');
      visibleCount = PAGE_SIZE; render(); searchInput.focus();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault(); searchInput.focus();
      }
      if (e.key === 'Escape') closeDetail();
    });

    // Filter chips
    document.querySelectorAll('.chip[data-filter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeFilter = chip.dataset.filter;
        document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('is-active', c === chip));
        visibleCount = PAGE_SIZE;
        render();
      });
    });
    document.querySelectorAll('.stat[data-filter]').forEach((stat) => {
      stat.addEventListener('click', () => {
        const f = stat.dataset.filter;
        activeFilter = f;
        document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('is-active', c.dataset.filter === f));
        visibleCount = PAGE_SIZE;
        render();
      });
    });

    filterSection.addEventListener('change', () => { sectionFilter = filterSection.value; visibleCount = PAGE_SIZE; render(); });
    filterStatus.addEventListener('change', () => { statusFilter = filterStatus.value; visibleCount = PAGE_SIZE; render(); });

    $('#btnClearFilters').addEventListener('click', () => {
      activeFilter = 'all'; sectionFilter = ''; statusFilter = '';
      filterSection.value = ''; filterStatus.value = '';
      document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('is-active', c.dataset.filter === 'all'));
      visibleCount = PAGE_SIZE;
      render();
    });

    // View toggle
    document.querySelectorAll('.view-toggle__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentView = btn.dataset.view;
        document.querySelectorAll('.view-toggle__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        render();
      });
    });

    btnLoadMore.addEventListener('click', () => { visibleCount += PAGE_SIZE; render(); });

    // Delegated clicks: cards grid + table (open detail / fav / copy)
    function delegatedClick(e) {
      const copyBtn = e.target.closest('[data-action="copy"]');
      if (copyBtn) { e.stopPropagation(); copyToClipboard(copyBtn.dataset.value); return; }

      const favBtn = e.target.closest('[data-action="fav"]');
      if (favBtn) { e.stopPropagation(); toggleFavorite(favBtn.dataset.code); return; }

      const card = e.target.closest('[data-code]');
      if (card) { openDetail(card.dataset.code); pushRecent(query); }
    }
    cardsGrid.addEventListener('click', delegatedClick);
    tableBody.addEventListener('click', delegatedClick);

    // Recent search chips
    recentChips.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-recent]');
      if (!chip) return;
      query = chip.dataset.recent;
      searchInput.value = query;
      btnClear.classList.add('is-visible');
      visibleCount = PAGE_SIZE;
      render();
    });

    // Favorites shortcut button -> filter
    $('#btnFavorites').addEventListener('click', () => {
      activeFilter = 'favorites';
      document.querySelectorAll('.chip[data-filter]').forEach((c) => c.classList.toggle('is-active', c.dataset.filter === 'favorites'));
      visibleCount = PAGE_SIZE;
      render();
      window.scrollTo({ top: document.querySelector('.results').offsetTop - 20, behavior: 'smooth' });
    });

    // Detail panel close
    overlay.addEventListener('click', closeDetail);
    detailInner.addEventListener('click', (e) => {
      if (e.target.closest('#dpClose')) closeDetail();
      const favBtn = e.target.closest('[data-action="fav"]');
      if (favBtn) toggleFavorite(favBtn.dataset.code);
      const copyBtn = e.target.closest('[data-action="copy"]');
      if (copyBtn) copyToClipboard(copyBtn.dataset.value);
    });

    // Export
    $('#btnExport').addEventListener('click', exportCsv);

    // Import
    $('#btnImport').addEventListener('click', () => $('#fileImport').click());
    $('#fileImport').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importFile(file);
      e.target.value = '';
    });
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    populateFilterOptions();
    renderStats();
    renderRecent();
    favCountEl.textContent = favorites.size;
    wireEvents();
    render();
    tickClock();
    setInterval(tickClock, 1000);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
