const PANEL_MIN_WIDTH = 300;
const GRAPH_MIN_WIDTH = 400;

function shortLabel(iri) {
  if (!iri) return '';
  const s = String(iri);
  const hash = s.lastIndexOf('#');
  const slash = s.lastIndexOf('/');
  const i = Math.max(hash, slash);
  return i >= 0 ? s.slice(i + 1) : s;
}

function nodeColor(type) {
  return type === 'uri'
    ? 'var(--color-node-uri)'
    : type === 'bnode'
      ? 'var(--color-node-bnode)'
      : 'var(--color-node-literal)';
}

export function createGraph(svgSelector = '#graph') {
  const svg = d3.select(svgSelector);
  const g = svg.append('g');
  const linkLayer = g.append('g').attr('stroke-width', 1.6);
  const labelLayer = g.append('g');
  const nodeLayer = g.append('g');
  const dragBehavior = d3.drag();
  let nodeHandlers = { click: null, dblclick: null };

  const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event) => {
    g.attr('transform', event.transform);
  });
  svg.call(zoom).on('dblclick.zoom', null);

  const simulation = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(80).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-250))
    .force('collide', d3.forceCollide().radius(d => d.r + 4))
    .force('center', d3.forceCenter(0, 0));

  const graph = { nodes: new Map(), links: new Set() };

  function applyNodeHandlers(selection) {
    selection.on('click', nodeHandlers.click);
    selection.on('dblclick', nodeHandlers.dblclick);
  }

  function updateGraph() {
    const nodes = Array.from(graph.nodes.values());
    const links = Array.from(graph.links.values());

    const linkSel = linkLayer.selectAll('line.link').data(links, d => d.key);
    linkSel.exit().remove();
    const linkEnter = linkSel.enter().append('line').attr('class', 'link');
    const linkMerged = linkEnter.merge(linkSel);

    const labelSel = labelLayer.selectAll('text.edge-label').data(links, d => d.key);
    labelSel.exit().remove();
    const labelEnter = labelSel.enter().append('text').attr('class', 'edge-label').text(d => shortLabel(d.predicate));
    const labelMerged = labelEnter.merge(labelSel);

    const nodeSel = nodeLayer.selectAll('g.node').data(nodes, d => d.id);
    nodeSel.exit().remove();
    const nodeEnter = nodeSel.enter().append('g').attr('class', 'node').call(dragBehavior);
    applyNodeHandlers(nodeEnter);
    nodeEnter.append('circle').attr('r', d => d.r).attr('fill', d => nodeColor(d.type));
    nodeEnter.append('text').attr('x', 12).attr('y', 4).text(d => d.label.length > 40 ? d.label.slice(0, 37) + '…' : d.label);
    const nodeMerged = nodeEnter.merge(nodeSel);
    nodeMerged.call(dragBehavior);
    applyNodeHandlers(nodeMerged);

    simulation.nodes(nodes).on('tick', () => {
      linkMerged
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      labelMerged
        .attr('x', d => (d.source.x + d.target.x) / 2)
        .attr('y', d => (d.source.y + d.target.y) / 2);
      nodeMerged.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);
    });
    simulation.force('link').links(links);
    simulation.alpha(0.7).restart();
  }

  function addNode(id, type) {
    if (!graph.nodes.has(id)) {
      const n = {
        id,
        type,
        label: type === 'literal' ? id : shortLabel(id),
        r: type === 'literal' ? 6 : (type === 'bnode' ? 8 : 10)
      };
      graph.nodes.set(id, n);
    }
    return graph.nodes.get(id);
  }

  function addLink(s, p, o) {
    const key = JSON.stringify([s.id, p, o.id]);
    for (const k of graph.links) {
      if (k.key === key) return;
    }
    graph.links.add({ source: s, target: o, predicate: p, key });
  }

  function toNodeType(term) {
    if (typeof term !== 'string') return 'literal';
    if (term.startsWith('_:')) return 'bnode';
    if (term.startsWith('http://') || term.startsWith('https://')) return 'uri';
    return 'literal';
  }

  function clearGraph() {
    graph.nodes.clear();
    graph.links.clear();
    updateGraph();
  }

  function drag(sim) {
    function dragstarted(event) {
      if (!event.active) sim.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }
    function dragended(event) {
      if (!event.active) sim.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
    return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
  }

  function resize(containerWidth, containerHeight, panelVisible, panelWidth) {
    const contribution = panelVisible ? panelWidth : 0;
    const availableWidth = Math.max(GRAPH_MIN_WIDTH, containerWidth - contribution);
    svg.attr('width', panelVisible ? availableWidth : containerWidth).attr('height', containerHeight);
    simulation.force('center', d3.forceCenter((panelVisible ? availableWidth : containerWidth) / 2, containerHeight / 2)).alpha(0.2).restart();
  }

  dragBehavior.on('start', (event) => {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }).on('drag', (event) => {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }).on('end', (event) => {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  });

  function setNodeHandlers(handlers = {}) {
    nodeHandlers = {
      click: handlers.click || null,
      dblclick: handlers.dblclick || null
    };
    applyNodeHandlers(nodeLayer.selectAll('g.node'));
  }

  return {
    svg,
    graph,
    updateGraph,
    addNode,
    addLink,
    toNodeType,
    clearGraph,
    resize,
    shortLabel,
    setNodeHandlers
  };
}

export { PANEL_MIN_WIDTH, GRAPH_MIN_WIDTH, shortLabel, nodeColor };
