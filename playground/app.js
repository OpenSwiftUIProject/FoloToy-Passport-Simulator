const editor = document.querySelector('#source');
const status = document.querySelector('#status');
const diagnostics = document.querySelector('#diagnostics');
const auto = document.querySelector('#auto');
const canvas = document.querySelector('#screen');
const context = canvas.getContext('2d', { alpha: false });
let example, timer, generation = 0, busy = false, queued = false, worker, watchdog, lastAlive;
function report(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function startPreview(wasm, message, ticket) {
  worker?.terminate(); clearInterval(watchdog);
  worker = new Worker('/worker.js', { type: 'module' });
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
  clearTimeout(timer);
  if (busy) { queued = true; return; }
  busy = true; queued = false;
  const ticket = generation;
  const source = editor.value;
  const start = performance.now();
  report('Compiling ContentView…'); diagnostics.textContent = '';
  try {
    const response = await fetch('/compile', {
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
editor.addEventListener('input', () => {
  ++generation; clearTimeout(timer);
  report(auto.checked ? 'Waiting for edits…' : 'Edited — press Build & Run');
  if (auto.checked) timer = setTimeout(compile, 650);
});
document.querySelector('#run').onclick = compile;
auto.onchange = () => { clearTimeout(timer); if (auto.checked) compile(); };
document.querySelector('#reset').onclick = () => { editor.value = example; ++generation; compile(); };
document.querySelectorAll('[data-button]').forEach(button => button.onclick = () => worker?.postMessage({ type: 'button', button: Number(button.dataset.button) }));
example = await (await fetch('/ContentView.swift')).text();
editor.value = example;
compile();
