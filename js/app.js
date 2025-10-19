import { sparqlQuery, fetchOutgoing, fetchResourceDetails, fetchIncoming, fetchResourceTypes, fetchClassStats, compactIri } from './sparql.js';
import { initTheme } from './theme.js';
import { STORAGE_KEYS, getStoredValue, setStoredValue, removeStoredValue } from './localstorage.js';
import { createGraph, PANEL_MIN_WIDTH, GRAPH_MIN_WIDTH } from './d3.js';

(function(){
  const endpointInput = document.getElementById('endpoint');
  const uriInput = document.getElementById('uri');
  const suggestions = document.getElementById('suggestions');
  const loadBtn = document.getElementById('load');
  const mainEl = document.querySelector('main');
  const panel = document.getElementById('panel');
  const panelResizer = document.getElementById('panel-resizer');
  const closePanel = document.getElementById('close-panel');
  const panelBody = document.getElementById('panel-body');
  const themeToggle = document.getElementById('theme-toggle');
  const classSelect = document.getElementById('class-selector');
  const endpointDialog = document.getElementById('endpoint-dialog');
  const endpointDialogOpen = document.getElementById('endpoint-dialog-open');
  const endpointDialogClose = document.getElementById('endpoint-dialog-close');
  const endpointDialogOverlay = endpointDialog ? endpointDialog.querySelector('.modal-overlay') : null;

  const graphApi = createGraph('#graph');
  const { svg, graph, updateGraph, addNode, addLink, toNodeType, clearGraph, resize: resizeGraph, shortLabel, setNodeHandlers } = graphApi;
  function setStatus(){ /* status display removed */ }
  let panelWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--panel-width')) || 360;
  let lastEndpointValue = endpointInput ? endpointInput.value.trim() : '';

  let selectedClass = getStoredValue(STORAGE_KEYS.class) || '';

  const updateSelectedClass = (value, { persist = true, ensureOptionExists = false } = {})=>{
    selectedClass = value || '';
    if(classSelect){
      if(ensureOptionExists && selectedClass){
        const exists = Array.from(classSelect.options || []).some(opt => opt.value === selectedClass);
        if(!exists){
          selectedClass = '';
        }
      }
      classSelect.value = selectedClass;
    }
    if(persist){
      if(selectedClass){
        setStoredValue(STORAGE_KEYS.class, selectedClass);
      }else{
        removeStoredValue(STORAGE_KEYS.class);
      }
    }
    return selectedClass;
  };

  const STORAGE_CLASS_PLACEHOLDER = 'Select a class to use in uri lookup';
  initTheme(themeToggle);

  const clampPanelWidth = (value)=>{
    const container = svg.node().parentElement;
    const containerWidth = container ? container.clientWidth : window.innerWidth;
    const maxWidth = Math.max(PANEL_MIN_WIDTH, containerWidth - GRAPH_MIN_WIDTH);
    return Math.min(Math.max(value, PANEL_MIN_WIDTH), maxWidth);
  };

  const setPanelWidth = (value)=>{
    panelWidth = clampPanelWidth(value);
    document.documentElement.style.setProperty('--panel-width', `${panelWidth}px`);
  };

  setPanelWidth(panelWidth);

  const resize = () => {
    const container = svg.node().parentElement;
    const panelVisible = !panel.classList.contains('hidden');
    if(panelVisible){
      setPanelWidth(panelWidth);
    }
    const containerWidth = container.clientWidth;
    const height = container.clientHeight;
    resizeGraph(containerWidth, height, panelVisible, panelWidth);
  };
  window.addEventListener('resize', resize);

  if(panelResizer){
    let activeResizeId = null;
    let panelRightEdge = 0;

    const stopResizing = (pointerId)=>{
      if(activeResizeId === null || activeResizeId !== pointerId) return;
      if(typeof panelResizer.hasPointerCapture === 'function' && panelResizer.hasPointerCapture(activeResizeId)){
        panelResizer.releasePointerCapture(activeResizeId);
      }else if(typeof panelResizer.releasePointerCapture === 'function'){
        try{ panelResizer.releasePointerCapture(activeResizeId); }catch(_err){ /* ignore */ }
      }
      activeResizeId = null;
    };

    panelResizer.addEventListener('pointerdown', (event)=>{
      if(panel.classList.contains('hidden')) return;
      if(typeof panelResizer.setPointerCapture === 'function'){
        try{ panelResizer.setPointerCapture(event.pointerId); }catch(_err){ /* ignore */ }
      }
      activeResizeId = event.pointerId;
      panelRightEdge = panel.getBoundingClientRect().right;
      event.preventDefault();
    });

    panelResizer.addEventListener('pointermove', (event)=>{
      if(activeResizeId !== event.pointerId) return;
      const desiredWidth = panelRightEdge - event.clientX;
      setPanelWidth(desiredWidth);
      resize();
      event.preventDefault();
    });

    panelResizer.addEventListener('pointerup', (event)=>{
      stopResizing(event.pointerId);
    });
    panelResizer.addEventListener('pointercancel', (event)=>{
      stopResizing(event.pointerId);
    });
  }

  let classFetchId = 0;

  const createClassSelectOption = (value, label)=>{
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    return opt;
  };

  const populateClassSelector = async ()=>{
    if(!classSelect) return;
    const fetchId = ++classFetchId;
    const endpoint = endpointInput.value.trim();
    classSelect.disabled = true;
    classSelect.innerHTML = '';
    if(!endpoint){
      classSelect.appendChild(createClassSelectOption('', STORAGE_CLASS_PLACEHOLDER));
      updateSelectedClass('', { persist: false });
      return;
    }
    classSelect.appendChild(createClassSelectOption('', 'Loading classes…'));
    try{
      const stats = await fetchClassStats(endpoint);
      if(fetchId !== classFetchId) return;
      classSelect.innerHTML = '';
      classSelect.appendChild(createClassSelectOption('', STORAGE_CLASS_PLACEHOLDER));
      stats.forEach(({ class: classIri, count })=>{
        const label = `${compactIri(classIri)} (${count.toLocaleString()})`;
        classSelect.appendChild(createClassSelectOption(classIri, label));
      });
      const previous = selectedClass;
      const resolved = updateSelectedClass(previous, { persist: false, ensureOptionExists: true });
      if(resolved !== previous){
        updateSelectedClass(resolved, { persist: true });
      }
    }catch(err){
      if(fetchId !== classFetchId) return;
      classSelect.innerHTML = '';
      classSelect.appendChild(createClassSelectOption('', 'Failed to load classes'));
      updateSelectedClass('', { persist: true });
      setStatus(`Class fetch failed: ${err.message}`, 'error');
    }finally{
      if(fetchId !== classFetchId) return;
      classSelect.disabled = false;
    }
  };

  let endpointDialogLastFocus = null;

  const handleEndpointUpdated = (force = false)=>{
    const endpointValue = endpointInput.value.trim();
    const previousValue = lastEndpointValue;
    lastEndpointValue = endpointValue;
    if(endpointValue){
      setStoredValue(STORAGE_KEYS.endpoint, endpointValue);
    }else{
      removeStoredValue(STORAGE_KEYS.endpoint);
    }
    if(endpointValue !== previousValue){
      updateSelectedClass('', { persist: true });
    }
    if(endpointValue !== previousValue || force){
      populateClassSelector();
      suggestReset();
    }
  };

  const openEndpointDialog = ()=>{
    if(!endpointDialog) return;
    endpointDialogLastFocus = document.activeElement;
    endpointDialog.classList.remove('hidden');
    document.body.classList.add('modal-open');
    if(endpointDialogOpen){
      endpointDialogOpen.setAttribute('aria-expanded', 'true');
    }
    requestAnimationFrame(()=>{ endpointInput.focus(); });
  };

  const closeEndpointDialog = ()=>{
    if(!endpointDialog) return;
    endpointDialog.classList.add('hidden');
    document.body.classList.remove('modal-open');
    if(endpointDialogOpen){
      endpointDialogOpen.setAttribute('aria-expanded', 'false');
    }
    handleEndpointUpdated();
    if(endpointDialogLastFocus && typeof endpointDialogLastFocus.focus === 'function'){
      endpointDialogLastFocus.focus();
    }
  };

  if(endpointDialogOpen){
    endpointDialogOpen.addEventListener('click', openEndpointDialog);
  }
  if(endpointDialogClose){
    endpointDialogClose.addEventListener('click', closeEndpointDialog);
  }
  if(endpointDialogOverlay){
    endpointDialogOverlay.addEventListener('click', closeEndpointDialog);
  }
  document.addEventListener('keydown', (event)=>{
    if(event.key === 'Escape' && endpointDialog && !endpointDialog.classList.contains('hidden')){
      closeEndpointDialog();
    }
  });

  async function expand(subject){
    const endpoint = endpointInput.value.trim();
    setStatus('Fetching triples for '+subject+' …');
    try{
      const triples = await fetchOutgoing(endpoint, subject);
      const s = addNode(subject, 'uri');
      for(const {p,o} of triples){
        const t = addNode(o, toNodeType(o));
        addLink(s, p, t);
      }
      updateGraph();
      setStatus(`Added ${triples.length} triple(s) from ${shortLabel(subject)}.`);
    }catch(err){
      console.error(err);
      setStatus(err.message, 'error');
    }
  }

  async function onNodeClick(node){
    if(node.type === 'literal') return; // literals not clickable
    const endpoint = endpointInput.value.trim();
    mainEl.classList.add('panel-open');
    panel.classList.remove('hidden');
    setPanelWidth(panelWidth);
    resize();
    panelBody.innerHTML = '<div class="tip">Loading...</div>';
    try{
      const [outgoingRows, incomingRows, types] = await Promise.all([
        fetchResourceDetails(endpoint, node.id),
        fetchIncoming(endpoint, node.id),
        fetchResourceTypes(endpoint, node.id)
      ]);
      const frag = document.createDocumentFragment();

      const subjectRow = document.createElement('div'); subjectRow.className = 'row subject';
      const subjectLabel = document.createElement('div'); subjectLabel.className = 'pred'; subjectLabel.textContent = 'Subject';
      const subjectValue = document.createElement('div'); subjectValue.className = 'obj';
      if(node.id.startsWith('http://') || node.id.startsWith('https://')){
        const subjLink = document.createElement('a'); subjLink.href = node.id; subjLink.textContent = compactIri(node.id); subjLink.title = node.id; subjLink.target = '_blank'; subjectValue.appendChild(subjLink);
      }else{
        subjectValue.textContent = node.id;
      }
      subjectRow.appendChild(subjectLabel); subjectRow.appendChild(subjectValue); frag.appendChild(subjectRow);

      if(types.length){
        const typeRow = document.createElement('div'); typeRow.className = 'row subject-type';
        const typeLabel = document.createElement('div'); typeLabel.className = 'pred'; typeLabel.textContent = 'rdf:type';
        const typeValue = document.createElement('div'); typeValue.className = 'obj';
        types.forEach((typeIri, index)=>{
          if(index>0) typeValue.appendChild(document.createElement('br'));
          if(typeIri.startsWith('http://') || typeIri.startsWith('https://')){
            const a = document.createElement('a'); a.href = typeIri; a.textContent = compactIri(typeIri); a.title = typeIri; a.target = '_blank'; typeValue.appendChild(a);
          }else{
            typeValue.appendChild(document.createTextNode(typeIri));
          }
        });
        typeRow.appendChild(typeLabel); typeRow.appendChild(typeValue); frag.appendChild(typeRow);
      }

      if(uriInput.value.trim() !== node.id){
        const subjectActions = document.createElement('div'); subjectActions.className = 'panel-actions';
        const makeRootBtn = document.createElement('button'); 
        makeRootBtn.type = 'button'; 
        makeRootBtn.textContent = 'Explore from this subject';
        makeRootBtn.className = 'primary';
        makeRootBtn.addEventListener('click', async ()=>{
          uriInput.value = node.id;
          panel.classList.add('hidden');
          mainEl.classList.remove('panel-open');
          await loadResource();
        });
        subjectActions.appendChild(makeRootBtn);
        frag.appendChild(subjectActions);
      }

      const outgoingTitle = document.createElement('div'); outgoingTitle.className = 'section-title'; outgoingTitle.textContent = 'Outgoing properties';
      frag.appendChild(outgoingTitle);
      if(outgoingRows.length===0){
        const empty = document.createElement('div'); empty.className = 'tip'; empty.textContent = 'No outgoing properties found for this subject.';
        frag.appendChild(empty);
      }else{
        outgoingRows.forEach(({p,o})=>{
          const row = document.createElement('div'); row.className = 'row';
          const pred = document.createElement('div'); pred.className = 'pred';
          if(p.startsWith('http://') || p.startsWith('https://')){
            const link = document.createElement('a'); link.href = p; link.textContent = compactIri(p); link.title = p; link.target = '_blank'; pred.appendChild(link);
          }else{
            pred.textContent = p;
          }
          const obj = document.createElement('div'); obj.className = 'obj';
          if(o.type==='uri'){
            const a = document.createElement('a'); a.href = o.value; a.textContent = compactIri(o.value); a.title = o.value; a.target = '_blank'; obj.appendChild(a);
          } else if(o.type==='bnode'){
            obj.textContent = o.value.startsWith('_:') ? o.value : '_:'+o.value;
          } else {
            const literalValue = document.createElement('span'); literalValue.textContent = o.value;
            if(o['xml:lang']){
              literalValue.appendChild(document.createTextNode(' '));
              const langTag = document.createElement('sup'); langTag.className = 'lang-tag'; langTag.textContent = `@${o['xml:lang']}`;
              literalValue.appendChild(langTag);
            }
            obj.appendChild(literalValue);
            if(o.datatype){
              const datatypeSpan = document.createElement('span'); datatypeSpan.className = 'literal-meta'; datatypeSpan.textContent = `^^${compactIri(o.datatype)}`;
              obj.appendChild(document.createElement('br'));
              obj.appendChild(datatypeSpan);
            }
          }
          row.appendChild(pred); row.appendChild(obj); frag.appendChild(row);
        });
      }

      const incomingTitle = document.createElement('div'); incomingTitle.className = 'section-title'; incomingTitle.textContent = 'Incoming references';
      frag.appendChild(incomingTitle);
      if(incomingRows.length===0){
        const emptyIncoming = document.createElement('div'); emptyIncoming.className = 'tip'; emptyIncoming.textContent = 'No incoming references where this resource is the object.';
        frag.appendChild(emptyIncoming);
      }else{
        incomingRows.forEach(({s,p})=>{
          const row = document.createElement('div'); row.className = 'row';
          const pred = document.createElement('div'); pred.className = 'pred';
          if(p.startsWith('http://') || p.startsWith('https://')){
            const link = document.createElement('a'); link.href = p; link.textContent = compactIri(p); link.title = p; link.target = '_blank'; pred.appendChild(link);
          }else{
            pred.textContent = p;
          }
          const subj = document.createElement('div'); subj.className = 'obj';
          if(s.type === 'uri' && (s.value.startsWith('http://') || s.value.startsWith('https://'))){
            const a = document.createElement('a'); a.href = s.value; a.textContent = compactIri(s.value); a.title = s.value; a.target = '_blank'; subj.appendChild(a);
          } else if(s.type === 'bnode'){
            subj.textContent = s.value.startsWith('_:') ? s.value : '_:'+s.value;
          } else {
            subj.textContent = s.value;
          }
          row.appendChild(pred); row.appendChild(subj); frag.appendChild(row);
        });
      }

      panelBody.innerHTML=''; panelBody.appendChild(frag);
    }catch(err){
      setStatus(err.message, 'error');
      panelBody.innerHTML = `<div class="tip" style="color: var(--color-status-error)">${err.message}</div>`;
    }
  }

  async function onNodeDblClick(node){
    if(node.type==='literal') return;
    await expand(node.id);
  }

  setNodeHandlers({
    click: (_event, node) => { onNodeClick(node); },
    dblclick: (_event, node) => { onNodeDblClick(node); }
  });

  async function loadResource(){
    const endpoint = endpointInput.value.trim();
    const uri = uriInput.value.trim();
    if(!endpoint || !uri) { setStatus('Provide an endpoint and a resource URI.', 'error'); return; }
    setStoredValue(STORAGE_KEYS.endpoint, endpoint);
    setStoredValue(STORAGE_KEYS.uri, uri);
    lastEndpointValue = endpoint;
    clearGraph();
    const rootType = toNodeType(uri);
    addNode(uri, rootType);
    updateGraph();
    await expand(uri);
    const rootNode = graph.nodes.get(uri);
    if(rootNode && rootNode.type !== 'literal'){
      await onNodeClick(rootNode);
    }
  }

  let suggestTimer = null;
  let lastTerm = '';

  const scheduleSuggestions = ()=>{
    if(!uriInput) return;
    const term = uriInput.value.trim();
    if(suggestTimer) clearTimeout(suggestTimer);
    if(term === lastTerm && term.length >= 3) return;
    lastTerm = term;
    if(term.length < 3){
      suggestions.innerHTML = '';
      return;
    }
    const endpoint = endpointInput.value.trim();
    if(!endpoint) return;
    suggestTimer = setTimeout(async ()=>{
      const hasClassFilter = selectedClass && (selectedClass.startsWith('http://') || selectedClass.startsWith('https://'));
      const classFilter = hasClassFilter ? `?s a <${selectedClass}> .` : '';
      const sanitizedTerm = term.replace(/"/g,'\\"');
      const q = `SELECT DISTINCT ?s WHERE { ${classFilter} { ?s ?p ?o } UNION { ?s a ?t } FILTER(CONTAINS(LCASE(STR(?s)), LCASE("${sanitizedTerm}"))) } LIMIT 20`;
      try{
        const json = await sparqlQuery(endpoint, q);
        suggestions.innerHTML = '';
        json.results.bindings.forEach(b=>{
          const opt = document.createElement('option'); opt.value = b.s.value; suggestions.appendChild(opt);
        });
      }catch(_err){ /* silently ignore suggestions errors */ }
    }, 250);
  };

  function suggestReset(){
    lastTerm = '';
    suggestions.innerHTML = '';
    if(uriInput.value.trim().length >= 3){
      scheduleSuggestions();
    }
  }

  uriInput.addEventListener('input', scheduleSuggestions);

  if(classSelect){
    updateSelectedClass(selectedClass, { persist: false });
    classSelect.addEventListener('change', ()=>{
      updateSelectedClass(classSelect.value);
      suggestReset();
    });
  }

  if(endpointInput){
    endpointInput.addEventListener('change', handleEndpointUpdated);
    endpointInput.addEventListener('blur', handleEndpointUpdated);
  }

  // Buttons & keyboard
  loadBtn.addEventListener('click', loadResource);
  uriInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ loadResource(); }});
  closePanel.addEventListener('click', ()=>{
    panel.classList.add('hidden');
    mainEl.classList.remove('panel-open');
    resize();
  });

  // Initial sizing
  requestAnimationFrame(()=>{ resize(); });

  const searchParams = new URLSearchParams(window.location.search);
  const isValidUrl = (value)=>{
    if(!value) return false;
    try{
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    }catch(_err){
      return false;
    }
  };

  const queryEndpoint = searchParams.get('endpoint');
  const queryUri = searchParams.get('uri');
  const hasQueryEndpoint = isValidUrl(queryEndpoint);
  const hasQueryUri = isValidUrl(queryUri);
  let shouldAutoLoad = false;

  if(hasQueryEndpoint){
    endpointInput.value = queryEndpoint;
  } else {
    const storedEndpoint = getStoredValue(STORAGE_KEYS.endpoint);
    if(storedEndpoint){ endpointInput.value = storedEndpoint; }
  }

  lastEndpointValue = endpointInput.value.trim();
  populateClassSelector();
  suggestReset();

  if(hasQueryUri){
    uriInput.value = queryUri;
  } else {
    const storedUri = getStoredValue(STORAGE_KEYS.uri);
    if(storedUri){ uriInput.value = storedUri; }
  }

  shouldAutoLoad = hasQueryEndpoint && hasQueryUri;

  if(shouldAutoLoad){
    requestAnimationFrame(()=>{ loadResource(); });
  }

  // Accessibility: show hint
  setStatus();

  // CORS note (console)
  console.info('Note: Some endpoints may block cross-origin requests. If you hit CORS issues, use an endpoint that allows CORS or a proxy.');
})();
