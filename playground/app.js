import { createSwiftEditor } from './editor.js';
let editor, configuration, compileEndpoint;
const status = document.querySelector('#status');
const diagnostics = document.querySelector('#diagnostics');
const auto = document.querySelector('#auto');
const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d', { alpha: false });
let example, timer, generation = 0, busy = false, queued = false, worker, watchdog, lastAlive, precompiled;
function report(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function startPreview(wasm, message, ticket) {
  worker?.terminate(); clearInterval(watchdog);
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  const active = worker;
  lastAlive = performance.now();
  watchdog = setInterval(() => {
    if (performance.now() - lastAlive > 4000) {
      active.terminate(); clearInterval(watchdog);
      report('Preview stopped: no response for 4 seconds. Edit and rebuild to recover.', true);
    }
  }, 1000);
  active.onmessage = ({ data }) => {
    if (active !== worker) return;
    lastAlive = performance.now();
    if (data.type === 'frame') {
      context.putImageData(new ImageData(data.rgba, 240, 320), 0, 0);
      if (ticket === generation) report(message);
    } else if (data.type === 'error') {
      report(`Preview error: ${data.message}`, true);
      active.terminate(); clearInterval(watchdog);
    }
  };
  active.onerror = event => {
    report(event.message, true); active.terminate(); clearInterval(watchdog);
  };
  active.postMessage({ type: 'load', wasm }, [wasm]);
}
async function compile() {
  if (!compileEndpoint) return;
  clearTimeout(timer);
  if (busy) { queued = true; return; }
  busy = true; queued = false;
  const ticket = generation;
  const source = editor.value;
  const start = performance.now();
  report('Compiling ContentView…'); diagnostics.textContent = '';
  try {
    const response = await fetch(compileEndpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source }),
    });
    if (!response.ok) {
      const { error } = await response.json();
      if (ticket === generation) { report('Build failed — previous preview retained', true); diagnostics.textContent = error; }
      return;
    }
    const wasm = await response.arrayBuffer();
    if (ticket !== generation) return;
    const seconds = ((performance.now() - start) / 1000).toFixed(2);
    const message = `Live · ${seconds}s build round trip · ${(wasm.byteLength / 1024).toFixed(0)} KiB WASM`;
    startPreview(wasm, message, ticket);
  } catch (error) { if (ticket === generation) report(error.message, true); }
  finally { busy = false; if (queued || (ticket !== generation && auto.checked)) compile(); }
}
function edited() {
  ++generation; clearTimeout(timer);
  report(auto.checked ? 'Waiting for edits…' : 'Edited — press Build & Run');
  if (auto.checked) timer = setTimeout(compile, 650);
}
document.querySelector('#run').onclick = compile;
auto.onchange = () => { clearTimeout(timer); if (auto.checked) compile(); };
document.querySelector('#reset').onclick = () => {
  editor.value = example; ++generation;
  if (compileEndpoint) compile();
  else startPreview(precompiled.slice(0), 'Live · precompiled example · runs entirely in your browser', generation);
};
document.querySelectorAll('[data-button]').forEach(button => button.onclick = () => worker?.postMessage({ type: 'button', button: Number(button.dataset.button) }));
async function initialize() {
  configuration = await (await fetch(new URL('./config.json', import.meta.url))).json();
  example = await (await fetch(new URL('./ContentView.swift', import.meta.url))).text();
  compileEndpoint = configuration.compileEndpoint ? new URL(configuration.compileEndpoint, location.href) : null;
  if (compileEndpoint && compileEndpoint.protocol !== 'https:' && compileEndpoint.origin !== location.origin) {
    throw new Error('A remote compiler endpoint must use HTTPS');
  }
  editor = createSwiftEditor(document.querySelector('#source'), { doc: example, readOnly: !compileEndpoint, onChange: edited });
  const simulator = document.querySelector('#simulator-link');
  simulator.hidden = !configuration.simulatorUrl;
  if (configuration.simulatorUrl) simulator.href = configuration.simulatorUrl;
  const note = document.querySelector('#mode-note');
  if (!compileEndpoint) {
    document.querySelector('#run').hidden = true;
    document.querySelector('#auto-label').hidden = true;
    auto.checked = false;
    document.querySelector('#reset').textContent = 'Restart example';
    note.hidden = false;
    note.textContent = 'Interactive example · source is read-only. Editing Swift requires a compiler service.';
  } else if (compileEndpoint.origin !== location.origin) {
    note.hidden = false;
    note.textContent = `Edits are sent to ${compileEndpoint.host} for compilation.`;
  }
  if (configuration.precompiled) {
    const response = await fetch(new URL(configuration.precompiled.file, location.href));
    if (!response.ok) throw new Error('Unable to load the precompiled example');
    precompiled = await response.arrayBuffer();
    const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
    const digest = hex(await crypto.subtle.digest('SHA-256', precompiled));
    const sourceDigest = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(example)));
    if (digest !== configuration.precompiled.sha256 || sourceDigest !== configuration.precompiled.sourceSha256) {
      throw new Error('Example source or WASM checksum mismatch');
    }
    document.querySelector('#licenses-link').hidden = false;
    startPreview(precompiled.slice(0), 'Live · precompiled example · runs entirely in your browser', generation);
  } else if (compileEndpoint) compile();
  else throw new Error('No compiled example or compiler configured');
}
initialize().catch(error => report(error.message, true));
