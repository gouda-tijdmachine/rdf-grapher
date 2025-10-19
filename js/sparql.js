export const PREFIXES = [
  ['http://xmlns.com/foaf/0.1/', 'foaf'],
  ['http://www.opengis.net/ont/geosparql#', 'geo'],
  ['http://www.opengis.net/def/function/geosparql/', 'geof'],
  ['https://www.goudatijdmachine.nl/def#', 'gtm'],
  ['http://rdf.histograph.io/', 'hg'],
  ['http://omeka.org/s/vocabs/o#', 'o'],
  ['http://www.w3.org/2002/07/owl#', 'owl'],
  ['https://personsincontext.org/model#', 'picom'],
  ['http://www.w3.org/ns/prov#', 'prov'],
  ['https://w3id.org/roar#', 'roar'],
  ['https://schema.org/', 'sdo'],
  ['https://www.ica.org/standards/RiC/ontology#', 'rico'],
  ['http://www.w3.org/2001/XMLSchema#', 'xsd'],
  ['http://www.w3.org/1999/02/22-rdf-syntax-ns#', 'rdf'],
  ['http://www.w3.org/2000/01/rdf-schema#', 'rdfs']
];

export function compactIri(value) {
  if (typeof value !== 'string') return value;
  for (const [ns, prefix] of PREFIXES) {
    if (value.startsWith(ns)) {
      return `${prefix}:${value.slice(ns.length)}`;
    }
  }
  return value;
}

export async function sparqlQuery(endpoint, query) {
  const params = new URLSearchParams();
  params.append('query', query);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/sparql-results+json',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString(),
    mode: 'cors'
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`SPARQL error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

function termForQuery(term) {
  if (typeof term !== 'string') return term;
  return term.startsWith('_:') ? term : `<${term}>`;
}

export async function fetchOutgoing(endpoint, subject) {
  const query = `SELECT ?p ?o WHERE { ${termForQuery(subject)} ?p ?o } LIMIT 100`;
  const json = await sparqlQuery(endpoint, query);
  return json.results.bindings.map((b) => ({
    p: b.p.value,
    o:
      b.o.type === 'bnode'
        ? `_:${b.o.value}`
        : b.o.type === 'uri'
        ? b.o.value
        : b.o.value
  }));
}

export async function fetchResourceDetails(endpoint, subject) {
  const query = `SELECT ?p ?o WHERE { ${termForQuery(subject)} ?p ?o } LIMIT 250`;
  const json = await sparqlQuery(endpoint, query);
  return json.results.bindings.map((b) => ({ p: b.p.value, o: b.o }));
}

export async function fetchIncoming(endpoint, object) {
  const query = `SELECT ?s ?p WHERE { ?s ?p ${termForQuery(object)} } LIMIT 25`;
  const json = await sparqlQuery(endpoint, query);
  return json.results.bindings.map((b) => ({
    s: b.s,
    p: b.p.value
  }));
}

export async function fetchClassStats(endpoint) {
  const query = `SELECT ?class (COUNT(?s) AS ?count)
WHERE {
  ?s a ?class .
}
GROUP BY ?class
ORDER BY DESC(?count)
LIMIT 50`;
  const json = await sparqlQuery(endpoint, query);
  return json.results.bindings.map((b) => ({
    class: b.class.value,
    count: Number(b.count.value)
  }));
}

export async function fetchResourceTypes(endpoint, subject) {
  const query = `SELECT ?type WHERE { ${termForQuery(subject)} a ?type } LIMIT 20`;
  const json = await sparqlQuery(endpoint, query);
  return json.results.bindings.map((b) => b.type?.value).filter(Boolean);
}
