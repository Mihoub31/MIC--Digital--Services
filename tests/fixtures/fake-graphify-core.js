const fs = require('fs');
const path = require('path');

const HTML_OK = [
  '<!doctype html>',
  '<html><head><meta charset="utf-8"><title>fake graph</title></head>',
  '<body><div id="graph">fake graph viewer</div>',
  '<script>document.title = "fake graph";</script>',
  '</body></html>'
].join('\n');

const HTML_EXTERNAL = HTML_OK.replace(
  '<script>',
  '<script src="https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js"></script>\n<script>'
);

module.exports = function run(mode) {
  const command = process.argv[2];
  const outDir = path.join(process.cwd(), 'graphify-out');

  if (mode === 'timeout') {
    setInterval(() => {}, 1000);
    return;
  }

  if (mode === 'missing') {
    console.log(`fake graphify ${command}: no output`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });

  if (command === 'extract') {
    fs.writeFileSync(
      path.join(outDir, 'graph.json'),
      JSON.stringify({ nodes: [{ id: 'fake-node', label: 'fakeNode()' }], edges: [] })
    );
    console.log('fake graphify extract: 1 node');
    return;
  }

  if (command === 'cluster-only') {
    fs.writeFileSync(
      path.join(outDir, 'GRAPH_REPORT.md'),
      '# Graph Report - fake\n\nfake graph report for MIC tests\n'
    );
    fs.writeFileSync(
      path.join(outDir, 'graph.html'),
      mode === 'external' ? HTML_EXTERNAL : HTML_OK
    );
    console.log('fake graphify cluster-only: report and viewer written');
    return;
  }

  console.error(`fake graphify: unknown command ${command}`);
  process.exit(2);
};
