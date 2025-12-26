/* Home In One Solution - Single page app (vanilla JS)
   Data persisted to localStorage.
*/

const STORAGE_KEY = "home-in-one-solution:data:v1";

async function loadSeed() {
  const res = await fetch("./seed-data.json");
  return await res.json();
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "";
  return x.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function computeBudgetTotals(budget) {
  const estimate = budget.reduce((a,b)=>a+num(b.estimate), 0);
  const paid = budget.reduce((a,b)=>a+num(b.paid), 0);
  const owed = estimate - paid;
  const management = estimate * 0.20;
  return { estimate, paid, owed, management, withManagement: estimate + management };
}

function statusDot(status){
  if (status === "done") return "good";
  if (status === "in_progress") return "warn";
  if (status === "blocked") return "bad";
  return "";
}

function statusLabel(status){
  switch(status){
    case "done": return "Done";
    case "in_progress": return "In progress";
    case "blocked": return "Blocked";
    default: return "Not started";
  }
}

function loadDataFromLocalStorage(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function downloadJSON(data){
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "home-in-one-solution-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setActiveNav(route){
  document.querySelectorAll("#nav a").forEach(a=>{
    a.classList.toggle("active", a.dataset.route === route);
  });
}

function renderNav(data, route){
  const nav = document.getElementById("nav");
  nav.innerHTML = "";

  const allTasksCount = Object.values(data.tasks).reduce((acc,arr)=>acc+arr.length,0);

  const links = [
    {route:"dashboard", label:"Dashboard", pill:"Budget"},
    {route:"tasks:all", label:"All Tasks", pill:String(allTasksCount)}
  ];

  Object.keys(data.tasks).sort().forEach(group=>{
    const done = data.tasks[group].filter(t=>t.status==="done").length;
    links.push({route:`tasks:${group}`, label:group, pill:`${done}/${data.tasks[group].length}`});
  });

  links.forEach(l=>{
    const a = document.createElement("a");
    a.href = "#";
    a.dataset.route = l.route;
    a.innerHTML = `<span>${l.label}</span><span class="pill">${l.pill}</span>`;
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      navigate(l.route);
    });
    nav.appendChild(a);
  });

  setActiveNav(route);
}

let state = { data:null, route:"dashboard" };

function renderDashboard(){
  const data = state.data;
  const view = document.getElementById("view");
  const totals = computeBudgetTotals(data.budget);

  const rows = data.budget.map((it, idx)=>{
    const owed = num(it.estimate) - num(it.paid);
    return `
      <tr>
        <td style="width:80px;"><strong>${it.id ?? (idx+1)}</strong></td>
        <td style="min-width:220px;"><div><strong>${escapeHtml(it.category ?? "")}</strong></div><div class="small">${escapeHtml(it.desc ?? "")}</div></td>
        <td style="width:160px;">
          <input class="input" inputmode="decimal" placeholder="0.00" value="${it.estimate ?? ""}" data-type="budget" data-field="estimate" data-index="${idx}" />
        </td>
        <td style="width:160px;">
          <input class="input" inputmode="decimal" placeholder="0.00" value="${it.paid ?? ""}" data-type="budget" data-field="paid" data-index="${idx}" />
        </td>
        <td style="width:160px;"><strong>${money(owed)}</strong></td>
        <td style="width:220px;">
          <input class="input" placeholder="Notes…" value="${escapeAttr(it.notes ?? "")}" data-type="budget" data-field="notes" data-index="${idx}" />
        </td>
      </tr>
    `;
  }).join("");

  view.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h1 class="h1">Dashboard</h1>
          <p class="p">Track estimates vs. payments, and keep notes as you build.</p>
        </div>
        <div class="badge">
          <span class="dot ${totals.owed > 0 ? "warn" : "good"}"></span>
          <span>${totals.owed > 0 ? "Budget items outstanding" : "All items paid (per inputs)"}</span>
        </div>
      </div>

      <hr class="sep"/>

      <div class="kpis">
        <div class="kpi"><div class="label">Estimated Total</div><div class="value">${money(totals.estimate)}</div></div>
        <div class="kpi"><div class="label">Paid Total</div><div class="value">${money(totals.paid)}</div></div>
        <div class="kpi"><div class="label">Owed</div><div class="value">${money(totals.owed)}</div></div>
        <div class="kpi"><div class="label">Management (20%)</div><div class="value">${money(totals.management)}</div></div>
      </div>

      <div class="small" style="margin-top:10px;">Estimated + Management: <strong>${money(totals.withManagement)}</strong></div>

      <hr class="sep"/>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Budget Item</th>
              <th>Estimate</th>
              <th>Paid</th>
              <th>Owed</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="small" style="margin-top:10px;">
        Tip: leave Estimate blank until you have a bid. Export JSON regularly as a backup.
      </div>
    </div>
  `;

  attachInputListeners();
}

function renderTasks(group){
  const data = state.data;
  const view = document.getElementById("view");

  let groupsToShow = [];
  if (group === "all") {
    groupsToShow = Object.keys(data.tasks).sort().map(g=>({name:g, tasks:data.tasks[g]}));
  } else {
    groupsToShow = [{name:group, tasks:data.tasks[group] || []}];
  }

  const sectionHtml = groupsToShow.map(sec=>{
    const rows = sec.tasks.map((t, idx)=>{
      return `
        <tr>
          <td style="width:80px;"><strong>${t.id ?? (idx+1)}</strong></td>
          <td style="min-width:260px;">
            <div><strong>${escapeHtml(t.title ?? "")}</strong></div>
            <div class="small">${escapeHtml(t.notes ?? "")}</div>
          </td>
          <td style="width:160px;">
            <select class="input" data-type="task" data-group="${escapeAttr(sec.name)}" data-index="${idx}" data-field="status">
              ${["not_started","in_progress","blocked","done"].map(s=>`<option value="${s}" ${t.status===s?"selected":""}>${statusLabel(s)}</option>`).join("")}
            </select>
          </td>
          <td style="width:170px;">
            <input class="input" type="date" value="${escapeAttr(t.dueDate ?? "")}" data-type="task" data-group="${escapeAttr(sec.name)}" data-index="${idx}" data-field="dueDate" />
          </td>
          <td style="width:220px;">
            <input class="input" placeholder="Notes…" value="${escapeAttr(t.notes ?? "")}" data-type="task" data-group="${escapeAttr(sec.name)}" data-index="${idx}" data-field="notes" />
          </td>
          <td style="width:110px;">
            <button class="btn btn-danger" data-action="deleteTask" data-group="${escapeAttr(sec.name)}" data-index="${idx}">Delete</button>
          </td>
        </tr>
      `;
    }).join("");

    const done = sec.tasks.filter(t=>t.status==="done").length;
    const badgeClass = done===sec.tasks.length ? "good" : (done>0 ? "warn" : "");
    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="row">
          <div>
            <h2 class="h2">${escapeHtml(sec.name)} Tasks</h2>
            <p class="p">${done}/${sec.tasks.length} complete</p>
          </div>
          <div class="badge"><span class="dot ${badgeClass}"></span><span>Progress</span></div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
          <input id="newTaskTitle:${escapeAttr(sec.name)}" class="input" style="flex:1; min-width:240px;" placeholder="Add a task (title)…" />
          <button class="btn" data-action="addTask" data-group="${escapeAttr(sec.name)}">Add Task</button>
        </div>

        <hr class="sep"/>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Task</th>
                <th>Status</th>
                <th>Due</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="6" class="small">No tasks yet.</td></tr>`}</tbody>
          </table>
        </div>
      </div>
    `;
  }).join("");

  view.innerHTML = `
    ${sectionHtml}
    <div class="card">
      <h2 class="h2">Create a new task group</h2>
      <p class="p">Example: Framing, Plumbing, HVAC, Landscaping, etc.</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
        <input id="newGroupName" class="input" style="flex:1; min-width:240px;" placeholder="Group name…" />
        <button class="btn" id="btnAddGroup">Add Group</button>
      </div>
    </div>
  `;

  attachInputListeners();
  attachTaskButtons();
}

function attachInputListeners(){
  document.querySelectorAll(".input").forEach(el=>{
    el.addEventListener("change", (e)=>{
      const target = e.target;
      const type = target.dataset.type;
      if (!type) return;

      if (type === "budget"){
        const idx = Number(target.dataset.index);
        const field = target.dataset.field;
        const val = target.value;

        if (field === "estimate" || field === "paid"){
          state.data.budget[idx][field] = val === "" ? "" : Number(val);
        } else {
          state.data.budget[idx][field] = val;
        }
        saveData(state.data);
        renderDashboard();
      }

      if (type === "task"){
        const group = target.dataset.group;
        const idx = Number(target.dataset.index);
        const field = target.dataset.field;
        state.data.tasks[group][idx][field] = target.value;
        saveData(state.data);
        renderTasks(state.route.split(":")[1] || "all");
      }
    });
  });
}

function attachTaskButtons(){
  document.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const action = e.currentTarget.dataset.action;
      const group = e.currentTarget.dataset.group;

      if (action === "addTask"){
        const input = document.getElementById(`newTaskTitle:${group}`);
        const title = (input?.value || "").trim();
        if (!title) return;
        const nextId = Math.max(0, ...state.data.tasks[group].map(t=>Number(t.id)||0)) + 1;
        state.data.tasks[group].push({ id: nextId, title, status:"not_started", dueDate:"", notes:"" });
        input.value = "";
        saveData(state.data);
        renderTasks(state.route.split(":")[1] || "all");
      }

      if (action === "deleteTask"){
        const idx = Number(e.currentTarget.dataset.index);
        state.data.tasks[group].splice(idx,1);
        saveData(state.data);
        renderTasks(state.route.split(":")[1] || "all");
      }
    });
  });

  const addGroupBtn = document.getElementById("btnAddGroup");
  if (addGroupBtn){
    addGroupBtn.addEventListener("click", ()=>{
      const name = (document.getElementById("newGroupName").value || "").trim();
      if (!name) return;
      if (state.data.tasks[name]) return alert("That group already exists.");
      state.data.tasks[name] = [];
      saveData(state.data);
      navigate(`tasks:${name}`);
    });
  }
}

function navigate(route){
  state.route = route;
  renderNav(state.data, route);
  setActiveNav(route);

  if (route === "dashboard") renderDashboard();
  else if (route.startsWith("tasks:")) renderTasks(route.split(":")[1]);
  else renderDashboard();
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (m)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g," "); }

async function init(){
  let data = loadDataFromLocalStorage();
  if (!data){
    data = await loadSeed();
    saveData(data);
  }
  state.data = data;

  // Hook up top buttons
  document.getElementById("btnExport").addEventListener("click", ()=>downloadJSON(state.data));

  document.getElementById("btnReset").addEventListener("click", async ()=>{
    const ok = confirm("Reset will overwrite your local data. Continue?");
    if (!ok) return;
    const seed = await loadSeed();
    state.data = seed;
    saveData(state.data);
    navigate("dashboard");
  });

  document.getElementById("fileImport").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if (!file) return;
    try{
      const txt = await file.text();
      const imported = JSON.parse(txt);
      if (!imported || !imported.budget || !imported.tasks) throw new Error("Invalid file format.");
      state.data = imported;
      saveData(state.data);
      navigate("dashboard");
    }catch(err){
      alert("Import failed: " + err.message);
    }finally{
      e.target.value = "";
    }
  });

  navigate("dashboard");
}

init();
