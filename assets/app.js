(() => {
  const app = document.getElementById("app");
  const setId = document.body.dataset.setId || new URLSearchParams(location.search).get("set");
  const assetBase = document.body.dataset.assetBase || "./";
  const storageKey = `dl-practice-v3-${setId}`;
  let paper;
  let suggestedAnswers;
  let state;
  let storageAvailable = true;

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
  const questionMarks = q => q.marks ?? q.parts.reduce((sum, part) => sum + part.marks, 0);
  const defaultState = () => ({ current: 1, results: {}, draft: {}, completed: false });
  const save = () => {
    if (!storageAvailable) return;
    try { localStorage.setItem(storageKey, JSON.stringify(state)); }
    catch { storageAvailable = false; }
  };
  const sectionName = number => number <= 10 ? "Section A · Multiple choice" : number <= 17 ? "Section B · Structured" : "Section C · Application";
  const partName = id => `Part (${id})`;

  function init() {
    if (!/^sec[12]-set[123]$/.test(setId || "")) {
      app.innerHTML = `<div class="loading-card">Practice set not found. <a href="${assetBase}index.html">View all sets</a></div>`;
      return;
    }
    try {
      const data = window.DL_PRACTICE_DATA?.[setId];
      if (!data) throw new Error("The practice files could not be loaded. Open this set from the practice home page.");
      paper = data.paper;
      suggestedAnswers = data.answers;
      if (suggestedAnswers.length !== paper.questions.length) throw new Error("The answer file does not match this set.");
      document.title = paper.title;
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
        state = saved && Number.isInteger(saved.current) && saved.results && saved.draft ? saved : defaultState();
      } catch { state = defaultState(); storageAvailable = false; }
      state.current = Math.min(Math.max(state.current, 1), 22);
      document.getElementById("restart-top").addEventListener("click", restart);
      render();
    } catch (error) {
      app.innerHTML = `<div class="loading-card">${escapeHtml(error.message)}</div>`;
    }
  }

  function header(number) {
    const answered = Object.keys(state.results).length;
    const progress = Math.round(answered / 21 * 100);
    return `<div class="paper-head">
      <div class="paper-kicker">${escapeHtml(sectionName(number <= 21 ? number : 21))}</div>
      <h1>${escapeHtml(paper.title)}</h1>
      <p class="paper-subtitle">21 questions · No timer · ${storageAvailable ? "Your work is saved in this browser" : "Browser storage is unavailable; keep this page open until you finish"}</p>
      <div class="progress-row"><span>${answered} of 21 questions submitted</span><span>${progress}% complete</span></div>
      <div class="progress-track" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${progress}%"></div></div>
    </div>`;
  }

  function tableHtml(rows) {
    if (!rows) return "";
    const [head, ...body] = rows;
    return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${head.map(cell => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function partHtml(part, readonly = false) {
    const old = state.draft[part.id];
    const prompt = `<div class="part-label">${partName(part.id)} · ${part.marks} ${part.marks === 1 ? "mark" : "marks"}</div><p class="part-prompt">${escapeHtml(part.prompt)}</p>`;
    const reference = `${part.codeBlock ? `<pre class="code-block">${escapeHtml(part.codeBlock)}</pre>` : ""}${part.starter ? `<pre class="code-block">${escapeHtml(part.starter)}</pre>` : ""}`;
    if (part.kind === "flow") return `<section class="part" data-part="${part.id}">${prompt}${flowHtml(part, readonly)}</section>`;
    const isCode = part.kind === "code";
    const isWritten = part.kind === "written";
    const field = isCode || isWritten
      ? `<textarea class="answer-field ${isCode ? "code" : "written"}" data-answer="${part.id}" aria-label="Answer to part ${part.id}" ${readonly ? "disabled" : ""} placeholder="Type your answer here">${escapeHtml(old || "")}</textarea>`
      : `<input class="answer-field" type="text" data-answer="${part.id}" aria-label="Answer to part ${part.id}" ${readonly ? "disabled" : ""} value="${escapeHtml(old || "")}" placeholder="Type your answer here">`;
    return `<section class="part" data-part="${part.id}">${prompt}${reference}${field}</section>`;
  }

  function mcqHtml(q, readonly = false) {
    return `<p class="stem">${escapeHtml(q.stem)}</p><div class="choices" role="radiogroup" aria-label="Answer choices">${q.options.map((option, index) => {
      const letter = "ABCD"[index];
      return `<label class="choice"><input type="radio" name="mcq" value="${letter}" ${state.draft.mcq === letter ? "checked" : ""} ${readonly ? "disabled" : ""}><span class="choice-letter">${letter}</span><span>${escapeHtml(option)}</span></label>`;
    }).join("")}</div>`;
  }

  function flowHtml(part, readonly) {
    const cards = part.cards.map(card => `<div class="flow-card" draggable="${readonly ? "false" : "true"}" data-card="${escapeHtml(card.id)}" data-shape="unset" tabindex="0"><span class="flow-card-text">${escapeHtml(card.text)}</span><select class="shape-select" aria-label="Symbol for ${escapeHtml(card.text)}" ${readonly ? "disabled" : ""}><option value="">Choose symbol</option><option value="terminator">Start / Stop oval</option><option value="io">Input / Output parallelogram</option><option value="process">Process rectangle</option><option value="decision">Decision diamond</option></select></div>`).join("");
    const slot = item => `<div class="flow-slot" data-slot="${escapeHtml(item.id)}"><span class="flow-slot-label">${escapeHtml(item.hint)}</span></div>`;
    const hasBranch = part.slots.some(item => item.id === "yes");
    let layout;
    if (hasBranch) {
      const byId = Object.fromEntries(part.slots.map(item => [item.id, item]));
      layout = [slot(byId.start), slot(byId.input), slot(byId.decision),
        `<div class="flow-branches">${slot(byId.yes)}${slot(byId.no)}</div>`,
        slot(byId.output), slot(byId.stop)].join(`<div class="flow-arrow" aria-hidden="true">↓</div>`);
    } else layout = part.slots.map(slot).join(`<div class="flow-arrow" aria-hidden="true">↓</div>`);
    return `<p class="flow-help">Drag each step into a position and choose the matching symbol. You can also click a card, then click a position.</p><div class="flow-tray-label">Available steps</div><div class="flow-tray" data-flow-tray="${part.id}">${cards}</div><div class="flow-slots" data-flow-part="${part.id}">${layout}</div><p class="flow-tip">Arrows show the flow; for a decision, the left path is Yes and the right path is No.</p>`;
  }

  function render() {
    if (state.current > 21) return renderSummary();
    const q = paper.questions[state.current - 1];
    const result = state.results[q.number];
    if (result) return renderFeedback(q, result);
    state.draft ||= {};
    app.innerHTML = `${header(q.number)}<article class="paper-card">
      <div class="question-top"><span class="question-badge">Question ${q.number} of 21</span><span class="marks-badge">${questionMarks(q)} marks</span></div>
      <h2 class="question-title">${escapeHtml(q.title)}</h2>
      ${q.intro ? `<p class="question-intro">${escapeHtml(q.intro)}</p>` : ""}
      ${tableHtml(q.table)}${q.diagram ? `<pre class="diagram-block">${escapeHtml(q.diagram)}</pre>` : ""}
      ${q.number <= 10 ? mcqHtml(q) : q.parts.map(part => partHtml(part)).join("")}
      <div class="actions"><button class="primary-button" id="submit-answer" type="button">Submit question</button><span class="status" id="status" role="status"></span></div>
    </article>`;
    app.querySelectorAll("[data-answer]").forEach(el => el.addEventListener("input", () => { state.draft[el.dataset.answer] = el.value; save(); }));
    app.querySelectorAll('input[name="mcq"]').forEach(el => el.addEventListener("change", () => { state.draft.mcq = el.value; save(); }));
    q.parts?.filter(part => part.kind === "flow").forEach(setupFlow);
    document.getElementById("submit-answer").addEventListener("click", () => submit(q));
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function setupFlow(part) {
    const root = app.querySelector(`[data-flow-part="${part.id}"]`);
    const tray = app.querySelector(`[data-flow-tray="${part.id}"]`);
    const cards = [...tray.querySelectorAll(".flow-card")];
    let selected = null;
    const old = state.draft[part.id] || {};
    for (const [slotId, value] of Object.entries(old)) {
      const slot = [...root.querySelectorAll(".flow-slot")].find(el => el.dataset.slot === slotId);
      const card = cards.find(el => el.dataset.card === value.card);
      if (slot && card) slot.appendChild(card);
    }
    for (const card of cards) {
      const stored = Object.values(old).find(value => value.card === card.dataset.card);
      if (stored?.shape) card.querySelector("select").value = stored.shape;
      card.dataset.shape = card.querySelector("select").value || "unset";
      card.addEventListener("dragstart", event => event.dataTransfer.setData("text/plain", card.dataset.card));
      card.addEventListener("click", event => {
        if (event.target.tagName === "SELECT") return;
        cards.forEach(el => el.classList.remove("selected"));
        selected = card;
        card.classList.add("selected");
      });
      card.querySelector("select").addEventListener("change", event => { card.dataset.shape = event.target.value || "unset"; updateFlow(part, root); });
    }
    const zones = [tray, ...root.querySelectorAll(".flow-slot")];
    for (const zone of zones) {
      zone.addEventListener("dragover", event => { event.preventDefault(); zone.classList.add("drag-over"); });
      zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
      zone.addEventListener("drop", event => {
        event.preventDefault(); zone.classList.remove("drag-over");
        const card = cards.find(el => el.dataset.card === event.dataTransfer.getData("text/plain"));
        if (card) moveCard(card, zone, tray, part, root);
      });
      zone.addEventListener("click", event => {
        if (!selected || event.target.closest(".flow-card")) return;
        moveCard(selected, zone, tray, part, root);
        selected.classList.remove("selected"); selected = null;
      });
    }
  }

  function moveCard(card, zone, tray, part, root) {
    const existing = zone.classList.contains("flow-slot") ? zone.querySelector(".flow-card") : null;
    if (existing && existing !== card) tray.appendChild(existing);
    zone.appendChild(card);
    updateFlow(part, root);
  }

  function updateFlow(part, root) {
    const mapping = {};
    root.querySelectorAll(".flow-slot").forEach(slot => {
      const card = slot.querySelector(".flow-card");
      if (card) mapping[slot.dataset.slot] = { card: card.dataset.card, shape: card.querySelector("select").value };
    });
    state.draft[part.id] = mapping;
    save();
  }

  function validate(q) {
    if (q.number <= 10) return state.draft.mcq ? "" : "Choose an answer before submitting.";
    for (const part of q.parts) {
      const value = state.draft[part.id];
      if (part.kind === "flow") {
        if (part.slots.some(slot => !value?.[slot.id]?.card || !value?.[slot.id]?.shape)) return `Complete every position and symbol in part (${part.id}).`;
      } else if (!String(value ?? "").trim()) return `Answer part (${part.id}) before submitting.`;
    }
    return "";
  }

  const normalise = value => String(value ?? "").normalize("NFKC").trim().toLowerCase()
    .replace(/[‘’“”]/g, "'").replace(/\s+/g, " ").replace(/[.!?]+$/g, "");
  const normaliseFormula = value => String(value ?? "").normalize("NFKC").toLowerCase()
    .replace(/[‘’“”]/g, '"').replace(/'/g, '"').replace(/;/g, ",")
    .replace(/\s+/g, "");

  function gradeObjective(answer, value) {
    if (answer.kind === "exact" || answer.kind === "formula") {
      const standardise = answer.kind === "formula" ? normaliseFormula : normalise;
      const correct = (answer.accepted || [answer.suggested]).some(candidate =>
        standardise(candidate) === standardise(value));
      return { marks: correct ? answer.marks : 0,
        feedback: correct ? "Your answer matches an accepted answer." : "Compare your answer with the suggested answer." };
    }
    if (answer.kind === "flow") {
      const mapping = value && typeof value === "object" ? value : {};
      let marks = 0;
      for (const group of answer.scoring) {
        if (group.slots.every(slot => mapping[slot]?.card === answer.expected[slot].card &&
          mapping[slot]?.shape === answer.expected[slot].shape)) marks += group.marks;
      }
      return { marks, feedback: marks === answer.marks
        ? "Your steps and symbols match the suggested flowchart."
        : "Compare the order, branches and symbols with the suggested flowchart." };
    }
    return null;
  }

  function gradeLocally(q, draft) {
    const answer = suggestedAnswers[q.number - 1];
    if (q.number <= 10) {
      const correct = draft.mcq === answer.key;
      return { number: q.number, marks: correct ? 1 : 0, maxMarks: 1, parts: [{
        id: "mcq", marks: correct ? 1 : 0, maxMarks: 1, submitted: draft.mcq,
        suggested: answer.suggested, alternatives: [], feedback: correct ? "Correct choice." : "Compare your choice with the suggested answer."
      }] };
    }
    const parts = q.parts.map(part => {
      const solution = answer.parts.find(item => item.id === part.id);
      if (!solution) throw new Error(`Suggested answer missing for part (${part.id}).`);
      const checked = gradeObjective(solution, draft[part.id]);
      return { id: part.id, marks: checked?.marks ?? null,
        maxMarks: checked ? part.marks : null, submitted: draft[part.id],
        suggested: solution.suggested, checkpoints: solution.checkpoints || "",
        note: solution.note || "",
        alternatives: solution.accepted?.filter(item => item !== solution.suggested) || [],
        feedback: checked?.feedback || "Compare your response with the suggested answer and the points to include. Equivalent wording may also be correct." };
    });
    return { number: q.number,
      marks: parts.reduce((sum, part) => sum + (part.marks ?? 0), 0),
      maxMarks: parts.reduce((sum, part) => sum + (part.maxMarks ?? 0), 0), parts };
  }

  function submit(q) {
    const status = document.getElementById("status");
    const error = validate(q);
    if (error) { status.textContent = error; status.classList.add("error"); return; }
    try {
      const result = gradeLocally(q, state.draft);
      state.results[q.number] = result;
      state.draft = {};
      save();
      renderFeedback(q, result);
    } catch (error) {
      status.textContent = error.message || "The suggested answer could not be shown. Please try again.";
      status.classList.add("error");
    }
  }

  function submittedText(q, part) {
    if (part.id === "mcq") {
      const index = "ABCD".indexOf(part.submitted);
      return `${part.submitted}. ${q.options[index] || ""}`;
    }
    const questionPart = q.parts.find(item => item.id === part.id);
    if (questionPart?.kind === "flow") {
      return questionPart.slots.map(slot => {
        const choice = part.submitted?.[slot.id];
        const card = questionPart.cards.find(item => item.id === choice?.card);
        return `${slot.hint}: ${card?.text || "No step"} (${choice?.shape || "no symbol"})`;
      }).join(" → ");
    }
    return String(part.submitted ?? "");
  }

  function feedbackHtml(q, result) {
    const scoreNote = result.maxMarks
      ? `Automatically checked parts: ${result.marks} / ${result.maxMarks} marks. Written and code answers are for self-check.`
      : "Compare your work with the suggested answers. Written and code answers are not automatically marked.";
    return `<div class="feedback-banner">${scoreNote}</div>${result.parts.map(part => `
      <div class="feedback-part">
        <h3>${part.id === "mcq" ? "Multiple choice" : `Part (${escapeHtml(part.id)})`}${part.maxMarks === null ? " · Self-check" : ` · ${part.marks} / ${part.maxMarks} automatically checked`}</h3>
        <p>${escapeHtml(part.feedback)}</p>
        <p class="student-response"><strong>Your answer:</strong><br>${escapeHtml(submittedText(q, part))}</p>
        <p class="model"><strong>This is a suggested answer:</strong><br>${escapeHtml(part.suggested)}</p>
        ${part.note ? `<p class="answer-points"><strong>Why this works:</strong> ${escapeHtml(part.note)}</p>` : ""}
        ${part.checkpoints ? `<p class="answer-points"><strong>Points to include:</strong> ${escapeHtml(part.checkpoints)}</p>` : ""}
        ${part.alternatives?.length ? `<p class="answer-points"><strong>Other accepted forms:</strong> ${escapeHtml(part.alternatives.join("; "))}</p>` : ""}
      </div>`).join("")}`;
  }

  function renderFeedback(q, result, reviewing = false) {
    app.innerHTML = `${header(q.number)}<article class="paper-card">
      <div class="question-top"><span class="question-badge">Question ${q.number} of 21</span><span class="marks-badge">${questionMarks(q)} marks</span></div>
      <h2 class="question-title">${escapeHtml(q.title)}</h2><p class="question-intro">${escapeHtml(q.number <= 10 ? q.stem : q.intro || "Compare your answer with the suggestions below.")}</p>
      ${feedbackHtml(q, result)}
      <div class="actions"><button class="primary-button" id="next-question" type="button">${reviewing ? "Back to results" : q.number === 21 ? "View final result" : "Continue to next question"}</button><span class="status">To try this question again, restart the full set.</span></div>
    </article>`;
    document.getElementById("next-question").addEventListener("click", () => {
      if (reviewing) return renderSummary();
      state.current = q.number + 1;
      if (state.current > 21) state.completed = true;
      save(); render();
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function renderSummary() {
    const results = Object.values(state.results);
    const checkedMarks = results.reduce((sum, result) => sum + result.marks, 0);
    const checkedMaximum = results.reduce((sum, result) => sum + result.maxMarks, 0);
    app.innerHTML = `${header(21)}<article class="result-card">
      <div class="paper-kicker">Practice set complete</div><h2 class="question-title">Your answers and suggested answers</h2><div class="result-score">${results.length}<span style="font-size:28px;color:#789087"> / 21 questions</span></div>
      <p class="question-intro">You completed the set. Your multiple-choice, exact, formula and flowchart answers earned ${checkedMarks} / ${checkedMaximum} automatically checked marks. Written and code answers were shown for self-check and are not included in that score.</p>
      <p>Review the suggested answers below, then restart the set if you want another attempt.</p>
      <h3>Question feedback</h3><ul class="result-list">${paper.questions.map(q => `<li><span>Question ${q.number} · ${escapeHtml(q.title)}</span><span><button type="button" data-review="${q.number}">Review answers</button></span></li>`).join("")}</ul>
      <div class="actions"><button class="primary-button" id="restart-bottom" type="button">Restart this set</button><a class="secondary-button" href="${assetBase}index.html">All practice sets</a></div>
    </article>`;
    document.getElementById("restart-bottom").addEventListener("click", restart);
    app.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", () => {
      const q = paper.questions[Number(button.dataset.review) - 1];
      renderFeedback(q, state.results[q.number], true);
    }));
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function restart() {
    if (!confirm("Restart this set from Question 1? This clears the current attempt and its feedback in this browser.")) return;
    state = defaultState(); save(); render();
  }

  init();
})();
