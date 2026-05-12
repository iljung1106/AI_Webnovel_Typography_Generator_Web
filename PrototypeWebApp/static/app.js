const state = {
  title: "",
  items: [],
  originalItems: [],
  selectedIndex: null,
  drag: null,
  prompt: "",
  samples: [],
  currentStep: 1,
};

const dom = {
  titleInput: document.getElementById("titleInput"),
  generateLayoutButton: document.getElementById("generateLayoutButton"),
  step1Next: document.getElementById("step1Next"),
  step1Status: document.getElementById("step1Status"),
  resetLayoutButton: document.getElementById("resetLayoutButton"),
  step2Prev: document.getElementById("step2Prev"),
  step2Next: document.getElementById("step2Next"),
  elementsInput: document.getElementById("elementsInput"),
  keywordsInput: document.getElementById("keywordsInput"),
  generatePromptButton: document.getElementById("generatePromptButton"),
  promptOutput: document.getElementById("promptOutput"),
  step3Prev: document.getElementById("step3Prev"),
  step3Next: document.getElementById("step3Next"),
  sampleCountInput: document.getElementById("sampleCountInput"),
  sampleCountValue: document.getElementById("sampleCountValue"),
  generateSamplesButton: document.getElementById("generateSamplesButton"),
  step4Prev: document.getElementById("step4Prev"),
  restartFlowButton: document.getElementById("restartFlowButton"),
  editorSvg: document.getElementById("editorSvg"),
  editorStatus: document.getElementById("editorStatus"),
  inspectorEmpty: document.getElementById("inspectorEmpty"),
  inspectorFields: document.getElementById("inspectorFields"),
  selectedGlyphLabel: document.getElementById("selectedGlyphLabel"),
  glyphXInput: document.getElementById("glyphXInput"),
  glyphYInput: document.getElementById("glyphYInput"),
  glyphSizeInput: document.getElementById("glyphSizeInput"),
  glyphRotationInput: document.getElementById("glyphRotationInput"),
  glyphValueReadout: document.getElementById("glyphValueReadout"),
  samplesGrid: document.getElementById("samplesGrid"),
  toast: document.getElementById("toast"),
  summaryTitle: document.getElementById("summaryTitle"),
  summaryLayout: document.getElementById("summaryLayout"),
  summaryPrompt: document.getElementById("summaryPrompt"),
  summarySamples: document.getElementById("summarySamples"),
  stepPanels: [...document.querySelectorAll(".step-panel")],
  stepChips: [...document.querySelectorAll("[data-step-link]")],
};

const SVG_NS = "http://www.w3.org/2000/svg";
let toastTimer = null;

function showToast(message, isError = false) {
  dom.toast.textContent = message;
  dom.toast.classList.remove("hidden");
  dom.toast.style.background = isError ? "rgba(124, 22, 22, 0.94)" : "rgba(23, 20, 20, 0.92)";
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => dom.toast.classList.add("hidden"), 3600);
}

function linesToList(value) {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function cloneItems(items) {
  return items.map((item) => ({ ...item }));
}

function getSvgPoint(event) {
  const pt = dom.editorSvg.createSVGPoint();
  pt.x = event.clientX;
  pt.y = event.clientY;
  return pt.matrixTransform(dom.editorSvg.getScreenCTM().inverse());
}

function rotatePoint(point, center, degrees) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function inverseRotatePoint(point, center, degrees) {
  return rotatePoint(point, center, -degrees);
}

function selectedItem() {
  if (state.selectedIndex == null) return null;
  return state.items[state.selectedIndex] || null;
}

function setSelectedIndex(index) {
  state.selectedIndex = index;
  updateInspector();
  renderEditor();
}

function completedStepCount() {
  let count = 1;
  if (state.items.length) count = 2;
  if (dom.promptOutput.value.trim()) count = 3;
  if (state.samples.length) count = 4;
  return count;
}

function canOpenStep(step) {
  if (step <= 1) return true;
  if (step === 2) return state.items.length > 0;
  if (step === 3) return state.items.length > 0;
  if (step === 4) return dom.promptOutput.value.trim().length > 0;
  return false;
}

function updateStepUI() {
  dom.stepPanels.forEach((panel) => {
    panel.classList.toggle("active", Number(panel.dataset.step) === state.currentStep);
  });

  dom.stepChips.forEach((chip) => {
    const step = Number(chip.dataset.stepLink);
    chip.classList.toggle("active", step === state.currentStep);
    chip.classList.toggle("complete", step < state.currentStep && canOpenStep(step));
    chip.classList.toggle("locked", !canOpenStep(step));
  });

  dom.summaryTitle.textContent = state.title || "아직 없음";
  dom.summaryLayout.textContent = state.items.length ? `${state.items.length} glyphs ready` : "대기 중";
  dom.summaryPrompt.textContent = dom.promptOutput.value.trim() ? "준비됨" : "대기 중";
  dom.summarySamples.textContent = dom.sampleCountInput.value;

  dom.step1Next.disabled = !state.items.length;
  dom.step2Next.disabled = !state.items.length;
  dom.step3Next.disabled = !dom.promptOutput.value.trim();
}

function goToStep(step) {
  if (!canOpenStep(step)) {
    if (step === 2) showToast("먼저 제목으로 레이아웃을 생성하세요.", true);
    if (step === 3) showToast("먼저 레이아웃 편집 단계까지 진행하세요.", true);
    if (step === 4) showToast("먼저 프롬프트를 생성하거나 입력하세요.", true);
    return;
  }
  state.currentStep = step;
  updateStepUI();
  updateInspector();
  renderEditor();
  renderSamples();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function invalidateFromTitleChange() {
  state.items = [];
  state.originalItems = [];
  state.selectedIndex = null;
  state.prompt = "";
  state.samples = [];
  dom.promptOutput.value = "";
  dom.resetLayoutButton.disabled = true;
  dom.editorStatus.textContent = "레이아웃이 생성되면 편집기가 활성화됩니다.";
  dom.step1Status.textContent = "제목이 변경되었습니다. 레이아웃을 다시 생성하세요.";
  renderEditor();
  renderSamples();
  updateInspector();
  updateStepUI();
  if (state.currentStep > 1) {
    state.currentStep = 1;
    updateStepUI();
  }
}

function updateInspector() {
  const item = selectedItem();
  if (!item) {
    dom.inspectorEmpty.classList.remove("hidden");
    dom.inspectorFields.classList.add("hidden");
    return;
  }

  dom.inspectorEmpty.classList.add("hidden");
  dom.inspectorFields.classList.remove("hidden");
  dom.selectedGlyphLabel.textContent = item.char;
  dom.glyphXInput.value = Math.round(item.x);
  dom.glyphYInput.value = Math.round(item.y);
  dom.glyphSizeInput.value = Math.round(item.fs);
  dom.glyphRotationInput.value = Math.round(item.rotation || 0);
  dom.glyphValueReadout.textContent =
    `x: ${Math.round(item.x)} / y: ${Math.round(item.y)} / size: ${Math.round(item.fs)} / rot: ${Math.round(item.rotation || 0)}°`;
}

function buildSelectionGeometry(item) {
  const center = { x: item.x + item.fs / 2, y: item.y - item.fs / 2 };
  const corners = [
    { x: item.x, y: item.y - item.fs },
    { x: item.x + item.fs, y: item.y - item.fs },
    { x: item.x + item.fs, y: item.y },
    { x: item.x, y: item.y },
  ].map((point) => rotatePoint(point, center, item.rotation || 0));

  const topCenter = rotatePoint(
    { x: center.x, y: item.y - item.fs - 70 },
    center,
    item.rotation || 0
  );
  const scaleHandle = corners[2];
  return { corners, topCenter, scaleHandle };
}

function renderEditor() {
  const svg = dom.editorSvg;
  svg.replaceChildren();

  const bgRect = document.createElementNS(SVG_NS, "rect");
  bgRect.setAttribute("x", "0");
  bgRect.setAttribute("y", "0");
  bgRect.setAttribute("width", "2000");
  bgRect.setAttribute("height", "1000");
  bgRect.setAttribute("fill", "#ffffff");
  svg.appendChild(bgRect);

  state.items.forEach((item, index) => {
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", item.x);
    text.setAttribute("y", item.y);
    text.setAttribute("font-size", item.fs);
    text.setAttribute("class", `svg-glyph${state.selectedIndex === index ? " selected" : ""}`);
    text.setAttribute(
      "transform",
      `rotate(${item.rotation || 0} ${item.x + item.fs / 2} ${item.y - item.fs / 2})`
    );
    text.textContent = item.char;
    text.dataset.index = String(index);
    text.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const point = getSvgPoint(event);
      setSelectedIndex(index);
      state.drag = {
        kind: "move",
        index,
        startPoint: point,
        origin: { x: item.x, y: item.y },
      };
      svg.setPointerCapture(event.pointerId);
    });
    svg.appendChild(text);
  });

  const item = selectedItem();
  if (!item) return;

  const geometry = buildSelectionGeometry(item);
  const polygon = document.createElementNS(SVG_NS, "polygon");
  polygon.setAttribute(
    "points",
    geometry.corners.map((point) => `${point.x},${point.y}`).join(" ")
  );
  polygon.setAttribute("class", "selection-box");
  svg.appendChild(polygon);

  const scaleHandle = document.createElementNS(SVG_NS, "circle");
  scaleHandle.setAttribute("cx", geometry.scaleHandle.x);
  scaleHandle.setAttribute("cy", geometry.scaleHandle.y);
  scaleHandle.setAttribute("r", "20");
  scaleHandle.setAttribute("class", "handle scale");
  scaleHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.drag = { kind: "scale", index: state.selectedIndex };
    svg.setPointerCapture(event.pointerId);
  });
  svg.appendChild(scaleHandle);

  const rotateHandle = document.createElementNS(SVG_NS, "circle");
  rotateHandle.setAttribute("cx", geometry.topCenter.x);
  rotateHandle.setAttribute("cy", geometry.topCenter.y);
  rotateHandle.setAttribute("r", "20");
  rotateHandle.setAttribute("class", "handle rotate");
  rotateHandle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    state.drag = { kind: "rotate", index: state.selectedIndex };
    svg.setPointerCapture(event.pointerId);
  });
  svg.appendChild(rotateHandle);
}

function updateDrag(event) {
  if (!state.drag) return;
  const item = state.items[state.drag.index];
  if (!item) return;

  const point = getSvgPoint(event);
  if (state.drag.kind === "move") {
    const dx = point.x - state.drag.startPoint.x;
    const dy = point.y - state.drag.startPoint.y;
    item.x = Math.max(-200, Math.min(2200, state.drag.origin.x + dx));
    item.y = Math.max(-200, Math.min(1200, state.drag.origin.y + dy));
  }

  if (state.drag.kind === "scale") {
    const center = { x: item.x + item.fs / 2, y: item.y - item.fs / 2 };
    const local = inverseRotatePoint(point, center, item.rotation || 0);
    const nextSize = Math.max(
      40,
      Math.min(420, Math.max(Math.abs(local.x - center.x), Math.abs(local.y - center.y)) * 2)
    );
    item.fs = nextSize;
    item.x = center.x - item.fs / 2;
    item.y = center.y + item.fs / 2;
  }

  if (state.drag.kind === "rotate") {
    const center = { x: item.x + item.fs / 2, y: item.y - item.fs / 2 };
    item.rotation = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
  }

  updateInspector();
  renderEditor();
}

function renderSamples() {
  if (!state.samples.length) {
    dom.samplesGrid.classList.add("empty");
    dom.samplesGrid.innerHTML = "<p>샘플 생성 결과가 여기에 표시됩니다.</p>";
    return;
  }

  dom.samplesGrid.classList.remove("empty");
  dom.samplesGrid.innerHTML = "";
  state.samples.forEach((sample) => {
    const card = document.createElement("article");
    card.className = "sample-card";
    card.innerHTML = `
      <img src="${sample.image_data_url}" alt="Generated sample ${sample.index}">
      <div class="sample-meta">
        <strong>Sample ${sample.index}</strong>
        <span>seed: ${sample.seed}</span>
        <span>prompt_id: ${sample.prompt_id}</span>
        <span>${sample.image_path}</span>
      </div>
    `;
    dom.samplesGrid.appendChild(card);
  });
}

async function generateLayout() {
  const title = dom.titleInput.value.trim();
  if (!title) {
    showToast("제목을 입력하세요.", true);
    return;
  }

  dom.generateLayoutButton.disabled = true;
  dom.step1Status.textContent = "레이아웃을 생성하고 있습니다...";
  try {
    const payload = await postJson("/api/layout", { title });
    state.title = payload.title;
    state.items = cloneItems(payload.items);
    state.originalItems = cloneItems(payload.items);
    state.samples = [];
    state.prompt = "";
    dom.promptOutput.value = "";
    state.selectedIndex = state.items.length ? 0 : null;
    dom.resetLayoutButton.disabled = false;
    dom.step1Status.textContent = "레이아웃이 생성되었습니다. 다음 단계로 이동하세요.";
    dom.editorStatus.textContent = "글자를 드래그해서 이동하고, 핸들을 드래그해서 크기와 각도를 조절하세요.";
    updateInspector();
    renderEditor();
    renderSamples();
    updateStepUI();
    goToStep(2);
    showToast("초기 레이아웃을 생성했습니다.");
  } catch (error) {
    dom.step1Status.textContent = "레이아웃 생성에 실패했습니다.";
    showToast(error.message, true);
  } finally {
    dom.generateLayoutButton.disabled = false;
  }
}

async function generatePrompt() {
  const title = dom.titleInput.value.trim();
  if (!title) {
    showToast("제목을 먼저 입력하세요.", true);
    return;
  }

  dom.generatePromptButton.disabled = true;
  try {
    const payload = await postJson("/api/prompt", {
      title,
      keywords: linesToList(dom.keywordsInput.value),
      required_elements: linesToList(dom.elementsInput.value),
    });
    state.prompt = payload.prompt;
    dom.promptOutput.value = payload.prompt;
    updateStepUI();
    showToast("프롬프트를 생성했습니다.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    dom.generatePromptButton.disabled = false;
  }
}

async function generateSamples() {
  const title = dom.titleInput.value.trim();
  const prompt = dom.promptOutput.value.trim();
  if (!title) {
    showToast("제목이 비어 있습니다.", true);
    return;
  }
  if (!state.items.length) {
    showToast("먼저 레이아웃을 생성하세요.", true);
    return;
  }
  if (!prompt) {
    showToast("프롬프트를 먼저 생성하거나 입력하세요.", true);
    return;
  }

  dom.generateSamplesButton.disabled = true;
  dom.samplesGrid.classList.remove("empty");
  dom.samplesGrid.innerHTML = "<p>Comfy Cloud에서 샘플을 생성하고 있습니다. 잠시 기다리세요...</p>";

  try {
    const payload = await postJson("/api/generate", {
      title,
      prompt,
      items: state.items,
      sample_count: Number(dom.sampleCountInput.value),
    });
    state.samples = payload.samples || [];
    renderSamples();
    updateStepUI();
    showToast(`${state.samples.length}개의 샘플을 생성했습니다.`);
  } catch (error) {
    state.samples = [];
    renderSamples();
    updateStepUI();
    showToast(error.message, true);
  } finally {
    dom.generateSamplesButton.disabled = false;
  }
}

function resetLayout() {
  if (!state.originalItems.length) return;
  state.items = cloneItems(state.originalItems);
  state.selectedIndex = state.items.length ? 0 : null;
  updateInspector();
  renderEditor();
  showToast("초기 배치로 되돌렸습니다.");
}

function restartFlow() {
  state.currentStep = 1;
  state.samples = [];
  updateStepUI();
  renderSamples();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function bindInspector() {
  dom.glyphXInput.addEventListener("input", () => {
    const item = selectedItem();
    if (!item) return;
    item.x = Number(dom.glyphXInput.value);
    updateInspector();
    renderEditor();
  });
  dom.glyphYInput.addEventListener("input", () => {
    const item = selectedItem();
    if (!item) return;
    item.y = Number(dom.glyphYInput.value);
    updateInspector();
    renderEditor();
  });
  dom.glyphSizeInput.addEventListener("input", () => {
    const item = selectedItem();
    if (!item) return;
    const center = { x: item.x + item.fs / 2, y: item.y - item.fs / 2 };
    item.fs = Number(dom.glyphSizeInput.value);
    item.x = center.x - item.fs / 2;
    item.y = center.y + item.fs / 2;
    updateInspector();
    renderEditor();
  });
  dom.glyphRotationInput.addEventListener("input", () => {
    const item = selectedItem();
    if (!item) return;
    item.rotation = Number(dom.glyphRotationInput.value);
    updateInspector();
    renderEditor();
  });
}

function bindEvents() {
  dom.generateLayoutButton.addEventListener("click", generateLayout);
  dom.generatePromptButton.addEventListener("click", generatePrompt);
  dom.generateSamplesButton.addEventListener("click", generateSamples);
  dom.resetLayoutButton.addEventListener("click", resetLayout);

  dom.step1Next.addEventListener("click", () => goToStep(2));
  dom.step2Prev.addEventListener("click", () => goToStep(1));
  dom.step2Next.addEventListener("click", () => goToStep(3));
  dom.step3Prev.addEventListener("click", () => goToStep(2));
  dom.step3Next.addEventListener("click", () => goToStep(4));
  dom.step4Prev.addEventListener("click", () => goToStep(3));
  dom.restartFlowButton.addEventListener("click", restartFlow);

  dom.stepChips.forEach((chip) => {
    chip.addEventListener("click", () => goToStep(Number(chip.dataset.stepLink)));
  });

  dom.sampleCountInput.addEventListener("input", () => {
    dom.sampleCountValue.textContent = dom.sampleCountInput.value;
    updateStepUI();
  });

  dom.promptOutput.addEventListener("input", () => {
    state.prompt = dom.promptOutput.value.trim();
    updateStepUI();
  });

  dom.titleInput.addEventListener("input", () => {
    const current = dom.titleInput.value.trim();
    if (state.title && current !== state.title) {
      invalidateFromTitleChange();
    }
  });

  dom.editorSvg.addEventListener("pointermove", updateDrag);
  dom.editorSvg.addEventListener("pointerup", () => {
    state.drag = null;
  });
  dom.editorSvg.addEventListener("pointerleave", () => {
    state.drag = null;
  });
}

bindEvents();
bindInspector();
updateStepUI();
renderEditor();
renderSamples();
