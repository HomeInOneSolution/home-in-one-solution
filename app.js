/* Home In One Solution — Construction Management Prototype
   - Single page app (vanilla JS)
   - Data stored in localStorage
   - Attachments stored in IndexedDB (browser local)
*/
const STORAGE_KEY = "hio:data:v2";
const DB_NAME = "hio-attachments";
const DB_VER = 1;
let db = null;

function $(sel){ return document.querySelector(sel); }
function money(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString(undefined,{style:"currency", currency:"USD"});
}
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function escapeHtml(s){ return String(s ?? "").replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/\n/g," "); }

async function loadSeed(){
  const res = await fetch("./seed-data.json");
  return await res.json();
}
function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw) return null;
  try{ return JSON.parse(raw); } catch{ return null; }
}
function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function downloadJSON(data){
  const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download="home-in-one-solution-backup.json";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function computeTotals(categories){
  const estimate = categories.reduce((a,c)=>a+num(c.estimate),0);
  const actual = categories.reduce((a,c)=>a+num(c.actual),0);
  const paid = categories.reduce((a,c)=>a+num(c.paid),0);
  const outstanding = actual - paid;
  return {estimate, actual, paid, outstanding};
}

/* IndexedDB for attachments */
function openDb(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = ()=>{
      const db = req.result;
      if(!db.objectStoreNames.contains("files")){
        const store = db.createObjectStore("files", {keyPath:"id"});
        store.createIndex("byCategory","categoryId",{unique:false});
      }
    };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
function _id(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function addFile(categoryId, file){
  return new Promise((resolve, reject)=>{
    const tx = db.transaction("files","readwrite");
    const store = tx.objectStore("files");
    const rec = {
      id: _id(),
      categoryId,
      name: file.name,
      type: file.type,
      size: file.size,
      created: new Date().toISOString(),
      blob: file
    };
    store.add(rec);
    tx.oncomplete = ()=>resolve(rec.id);
    tx.onerror = ()=>reject(tx.error);
  });
}
function listFiles(categoryId){
  return new Promise((resolve, reject)=>{
    const tx = db.transaction("files","readonly");
    const store = tx.objectStore("files");
    const idx = store.index("byCategory");
    const req = idx.getAll(Number(categoryId));
    req.onsuccess = ()=>resolve(req.result || []);
    req.onerror = ()=>reject(req.error);
  });
}
function deleteFile(fileId){
  return new Promise((resolve, reject)=>{
    const tx = db.transaction("files","readwrite");
    tx.objectStore("files").delete(fileId);
    tx.oncomplete = ()=>resolve(true);
    tx.onerror = ()=>reject(tx.error);
  });
}

function setActiveNav(route){
  document.querySelectorAll("#nav a").forEach(a=>a.classList.toggle("active", a.dataset.route===route));
}
function renderNav(state){
  const nav = $("#nav");
  nav.innerHTML="";
  const links = [
    {route:"dashboard", label:"Dashboard", pill:"Overview"},
    {route:"calendar", label:"Calendar", pill:String(state.data.events.length)},
  ];
  links.forEach(l=>{
    const a=document.createElement("a");
    a.href="#";
    a.dataset.route=l.route;
    a.innerHTML=`<span>${l.label}</span><span class="pill">${l.pill}</span>`;
    a.addEventListener("click",(e)=>{e.preventDefault(); navigate(l.route);});
    nav.appendChild(a);
  });

  const sep = document.createElement("div");
  sep.className="nav-title";
  sep.textContent="Budget Items";
  nav.appendChild(sep);

  state.data.categories.forEach(c=>{
    const a=document.createElement("a");
    a.href="#";
    a.dataset.route=`item:${c.id}`;
    const paid = num(c.paid), actual=num(c.actual);
    const pill = actual>0 ? `${Math.round((paid/actual)*100)}%` : "";
    a.innerHTML=`<span>${escapeHtml(c.name)}</span><span class="pill">${pill}</span>`;
    a.addEventListener("click",(e)=>{e.preventDefault(); navigate(`item:${c.id}`);});
    nav.appendChild(a);
  });

  setActiveNav(state.route);
}

let state = { data:null, route:"dashboard" };

function renderDashboard(){
  const v = $("#view");
  const totals = computeTotals(state.data.categories);

  const rows = state.data.categories.map(c=>{
    const outstanding = num(c.actual) - num(c.paid);
    return `
      <tr>
        <td style="width:70px;"><strong>${c.id}</strong></td>
        <td style="min-width:260px;"><a href="#" data-link="item:${c.id}" class="link">${escapeHtml(c.name)}</a></td>
        <td style="width:160px;"><strong>${money(c.estimate)}</strong></td>
        <td style="width:160px;"><strong>${money(c.actual)}</strong></td>
        <td style="width:160px;"><strong>${money(c.paid)}</strong></td>
        <td style="width:160px;"><strong>${money(outstanding)}</strong></td>
        <td style="min-width:260px;"><span class="small">${escapeHtml((c.startDate||"") + (c.endDate?(" → " + c.endDate):""))}</span></td>
      </tr>
    `;
  }).join("");

  v.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h1 class="h1">Dashboard</h1>
          <p class="p">Click any item to open its page. Calendar events from every page show up in the Calendar.</p>
        </div>
        <div class="badge"><span class="dot ${totals.outstanding>0?"warn":"good"}"></span><span>${totals.outstanding>0?"Outstanding payments":"On track"}</span></div>
      </div>

      <hr class="sep"/>

      <div class="kpis">
        <div class="kpi"><div class="label">Estimated Total</div><div class="value">${money(totals.estimate)}</div></div>
        <div class="kpi"><div class="label">Actual Total</div><div class="value">${money(totals.actual)}</div></div>
        <div class="kpi"><div class="label">Paid Total</div><div class="value">${money(totals.paid)}</div></div>
        <div class="kpi"><div class="label">Outstanding</div><div class="value">${money(totals.outstanding)}</div></div>
      </div>

      <hr class="sep"/>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Estimate</th>
              <th>Actual</th>
              <th>Paid</th>
              <th>Outstanding</th>
              <th>Dates</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>

      <div class="small" style="margin-top:10px;">Prototype note: reminders work while the tab is open. For true push notifications + multi-user, we’d add a backend.</div>
    </div>
  `;

  document.querySelectorAll("[data-link]").forEach(a=>{
    a.addEventListener("click",(e)=>{e.preventDefault(); navigate(a.dataset.link);});
  });
}

function upcomingEvents(){
  const now = new Date();
  return [...state.data.events]
    .filter(ev=>new Date(ev.startISO).getTime() >= now.getTime() - 24*3600*1000)
    .sort((a,b)=>new Date(a.startISO)-new Date(b.startISO));
}

function renderCalendar(){
  const v = $("#view");
  const events = upcomingEvents();
  const rows = events.map(ev=>{
    const cat = state.data.categories.find(c=>c.id===ev.categoryId);
    return `
      <tr>
        <td style="width:220px;"><strong>${new Date(ev.startISO).toLocaleString()}</strong></td>
        <td style="min-width:220px;"><a href="#" data-link="item:${ev.categoryId}" class="link">${escapeHtml(cat?.name||"")}</a></td>
        <td style="min-width:260px;">${escapeHtml(ev.title||"")}</td>
        <td style="width:130px;">${ev.remindMinutes? `${ev.remindMinutes} min`: ""}</td>
        <td style="min-width:260px;"><span class="small">${escapeHtml(ev.notes||"")}</span></td>
        <td style="width:120px;"><button class="btn btn-danger" data-action="delEvent" data-id="${escapeAttr(ev.id)}">Delete</button></td>
      </tr>
    `;
  }).join("");

  v.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h1 class="h1">Calendar</h1>
          <p class="p">All scheduled dates (from every item page) show up here. Add general events too.</p>
        </div>
        <button class="btn" id="btnRequestNotif">Enable Reminders</button>
      </div>

      <hr class="sep"/>

      <div class="grid">
        <div>
          <h2 class="h2">Add Event</h2>
          <div class="small" style="margin-bottom:8px;">Reminders work while this tab is open.</div>
          <div style="display:grid; gap:10px;">
            <label class="small">Item
              <select class="input" id="evCategory"></select>
            </label>
            <label class="small">Title
              <input class="input" id="evTitle" placeholder="Inspection, delivery, pour, walkthrough..." />
            </label>
            <div class="grid">
              <label class="small">Start
                <input class="input" id="evStart" type="datetime-local" />
              </label>
              <label class="small">End (optional)
                <input class="input" id="evEnd" type="datetime-local" />
              </label>
            </div>
            <div class="grid">
              <label class="small">Reminder
                <select class="input" id="evRemind">
                  <option value="">None</option>
                  <option value="5">5 minutes</option>
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                  <option value="1440">1 day</option>
                </select>
              </label>
              <label class="small">Notes
                <input class="input" id="evNotes" placeholder="Gate code, contact, checklist..." />
              </label>
            </div>
            <button class="btn" id="btnAddEvent">Add to Calendar</button>
          </div>
        </div>

        <div>
          <h2 class="h2">Upcoming</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Item</th>
                  <th>Title</th>
                  <th>Reminder</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="6" class="small">No upcoming events yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  const sel = $("#evCategory");
  sel.innerHTML = state.data.categories.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  $("#btnAddEvent").addEventListener("click", ()=>{
    const categoryId = Number($("#evCategory").value);
    const title = ($("#evTitle").value||"").trim();
    const startVal = $("#evStart").value;
    if(!title || !startVal) return alert("Please enter a title and start date/time.");
    const endVal = $("#evEnd").value;
    const remind = $("#evRemind").value;
    const notes = ($("#evNotes").value||"").trim();

    const ev = {
      id: crypto.randomUUID?.() || (Math.random().toString(16).slice(2) + Date.now()),
      categoryId,
      title,
      startISO: new Date(startVal).toISOString(),
      endISO: endVal ? new Date(endVal).toISOString() : "",
      remindMinutes: remind ? Number(remind) : "",
      notes
    };
    state.data.events.push(ev);
    saveData(state.data);
    scheduleReminders();
    renderCalendar();
  });

  document.querySelectorAll('[data-action="delEvent"]').forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.id;
      state.data.events = state.data.events.filter(e=>e.id!==id);
      saveData(state.data);
      scheduleReminders();
      renderCalendar();
    });
  });

  $("#btnRequestNotif").addEventListener("click", async ()=>{
    if(!("Notification" in window)) return alert("Notifications are not supported in this browser.");
    const perm = await Notification.requestPermission();
    alert("Notification permission: " + perm);
  });

  document.querySelectorAll("[data-link]").forEach(a=>{
    a.addEventListener("click",(e)=>{e.preventDefault(); navigate(a.dataset.link);});
  });
}

function renderItem(categoryId){
  const cat = state.data.categories.find(c=>c.id===Number(categoryId));
  const v = $("#view");
  if(!cat) return v.innerHTML = `<div class="card"><h1 class="h1">Not found</h1></div>`;

  v.innerHTML = `
    <div class="card">
      <div class="row">
        <div>
          <h1 class="h1">${escapeHtml(cat.name)}</h1>
          <p class="p">Track design link, budget, dates, schedule, and attachments for this item.</p>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="btn" data-nav="calendar">View Calendar</button>
          <button class="btn" data-nav="dashboard">Back to Dashboard</button>
        </div>
      </div>

      <hr class="sep"/>

      <div class="grid">
        <div>
          <h2 class="h2">Budget</h2>
          <div style="display:grid; gap:10px;">
            <label class="small">Estimate
              <input class="input" inputmode="decimal" id="estimate" placeholder="0.00" value="${escapeAttr(cat.estimate)}" />
            </label>
            <label class="small">Actual Cost
              <input class="input" inputmode="decimal" id="actual" placeholder="0.00" value="${escapeAttr(cat.actual)}" />
            </label>
            <label class="small">Paid
              <input class="input" inputmode="decimal" id="paid" placeholder="0.00" value="${escapeAttr(cat.paid)}" />
            </label>
            <div class="small">Outstanding: <strong>${money(num(cat.actual)-num(cat.paid))}</strong></div>
          </div>

          <hr class="sep"/>

          <h2 class="h2">Dates</h2>
          <div class="grid">
            <label class="small">Date Started
              <input class="input" type="date" id="startDate" value="${escapeAttr(cat.startDate)}" />
            </label>
            <label class="small">Date Completed
              <input class="input" type="date" id="endDate" value="${escapeAttr(cat.endDate)}" />
            </label>
          </div>

          <hr class="sep"/>

          <h2 class="h2">Design Link</h2>
          <label class="small">URL (plans, invoice folder, specs, etc.)
            <input class="input" id="designLink" placeholder="https://..." value="${escapeAttr(cat.designLink)}" />
          </label>
          <div class="small" style="margin-top:6px;">
            ${cat.designLink ? `<a class="link" href="${escapeAttr(cat.designLink)}" target="_blank" rel="noreferrer">Open link</a>` : ""}
          </div>
        </div>

        <div>
          <h2 class="h2">Scheduling</h2>
          <div class="small" style="margin-bottom:8px;">Add events for this item. They show up in the Calendar.</div>
          <div style="display:grid; gap:10px;">
            <label class="small">Event Title
              <input class="input" id="evTitle" placeholder="Delivery, inspection, pour, install..." />
            </label>
            <div class="grid">
              <label class="small">Start
                <input class="input" id="evStart" type="datetime-local" />
              </label>
              <label class="small">End (optional)
                <input class="input" id="evEnd" type="datetime-local" />
              </label>
            </div>
            <label class="small">Reminder
              <select class="input" id="evRemind">
                <option value="">None</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="1440">1 day</option>
              </select>
            </label>
            <label class="small">Notes
              <input class="input" id="evNotes" placeholder="Contact, access, checklist..." />
            </label>
            <button class="btn" id="btnAddEvent">Add Event</button>
          </div>

          <hr class="sep"/>

          <h2 class="h2">Notes</h2>
          <textarea id="notes" class="input" placeholder="Notes, issues, change orders, contacts...">${escapeHtml(cat.notes||"")}</textarea>
        </div>
      </div>

      <hr class="sep"/>

      <div class="grid">
        <div>
          <h2 class="h2">Photos & Videos</h2>
          <div class="small" style="margin-bottom:8px;">Uploads stay on this device/browser. JSON Export does not include attachments.</div>
          <input class="input" type="file" id="fileUpload" accept="image/*,video/*" multiple />
          <div id="attachList" style="margin-top:12px;"></div>
        </div>
        <div>
          <h2 class="h2">Quick Progress</h2>
          <div class="kpis">
            <div class="kpi"><div class="label">Estimate</div><div class="value">${money(cat.estimate)}</div></div>
            <div class="kpi"><div class="label">Actual</div><div class="value">${money(cat.actual)}</div></div>
            <div class="kpi"><div class="label">Paid</div><div class="value">${money(cat.paid)}</div></div>
            <div class="kpi"><div class="label">Outstanding</div><div class="value">${money(num(cat.actual)-num(cat.paid))}</div></div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll("[data-nav]").forEach(b=>{
    b.addEventListener("click", ()=>navigate(b.dataset.nav));
  });

  const bindMoney = (idName, field)=>{
    $(idName).addEventListener("change", (e)=>{
      const v = e.target.value;
      cat[field] = v==="" ? "" : Number(v);
      saveData(state.data);
      renderItem(categoryId);
      renderNav(state);
    });
  };
  bindMoney("#estimate","estimate");
  bindMoney("#actual","actual");
  bindMoney("#paid","paid");

  $("#startDate").addEventListener("change",(e)=>{ cat.startDate=e.target.value; saveData(state.data); renderNav(state); });
  $("#endDate").addEventListener("change",(e)=>{ cat.endDate=e.target.value; saveData(state.data); renderNav(state); });
  $("#designLink").addEventListener("change",(e)=>{ cat.designLink=e.target.value; saveData(state.data); renderItem(categoryId); });
  $("#notes").addEventListener("change",(e)=>{ cat.notes=e.target.value; saveData(state.data); });

  $("#btnAddEvent").addEventListener("click", ()=>{
    const title = ($("#evTitle").value||"").trim();
    const startVal = $("#evStart").value;
    if(!title || !startVal) return alert("Please enter a title and start date/time.");
    const endVal = $("#evEnd").value;
    const remind = $("#evRemind").value;
    const notes = ($("#evNotes").value||"").trim();

    const ev = {
      id: crypto.randomUUID?.() || (Math.random().toString(16).slice(2) + Date.now()),
      categoryId: Number(categoryId),
      title,
      startISO: new Date(startVal).toISOString(),
      endISO: endVal ? new Date(endVal).toISOString() : "",
      remindMinutes: remind ? Number(remind) : "",
      notes
    };
    state.data.events.push(ev);
    saveData(state.data);
    scheduleReminders();
    renderItem(categoryId);
  });

  $("#fileUpload").addEventListener("change", async (e)=>{
    const files = [...(e.target.files||[])];
    if(!files.length) return;
    for(const f of files){ await addFile(Number(categoryId), f); }
    e.target.value="";
    await renderAttachments(categoryId);
  });

  renderAttachments(categoryId);
}

async function renderAttachments(categoryId){
  const box = $("#attachList");
  if(!box) return;
  const files = await listFiles(Number(categoryId));
  if(!files.length){
    box.innerHTML = `<div class="small">No uploads yet.</div>`;
    return;
  }
  box.innerHTML = `
    <div class="attach-grid">
      ${files.map(f=>{
        const url = URL.createObjectURL(f.blob);
        const isVid = (f.type||"").startsWith("video/");
        return `
          <div class="thumb">
            ${isVid ? `<video src="${url}" controls></video>` : `<img src="${url}" alt="${escapeAttr(f.name)}" />`}
            <div class="meta">
              <div class="name">${escapeHtml(f.name)}</div>
              <div class="sub">${new Date(f.created).toLocaleString()}</div>
              <div class="actions">
                <a class="btn btn-secondary" href="${url}" download="${escapeAttr(f.name)}">Download</a>
                <button class="btn btn-danger" data-action="delFile" data-id="${escapeAttr(f.id)}">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  box.querySelectorAll('[data-action="delFile"]').forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      await deleteFile(btn.dataset.id);
      await renderAttachments(categoryId);
    });
  });
}

let reminderTimers = [];
function clearReminders(){
  reminderTimers.forEach(t=>clearTimeout(t));
  reminderTimers = [];
}
function scheduleReminders(){
  clearReminders();
  if(!("Notification" in window)) return;
  const now = Date.now();

  state.data.events.forEach(ev=>{
    if(!ev.remindMinutes) return;
    const start = new Date(ev.startISO).getTime();
    const notifyAt = start - Number(ev.remindMinutes)*60*1000;
    const delay = notifyAt - now;
    if(delay <= 0 || delay > 7*24*3600*1000) return;
    const t = setTimeout(()=>{
      if(Notification.permission === "granted"){
        const cat = state.data.categories.find(c=>c.id===ev.categoryId);
        new Notification(`${cat?.name||"Event"}: ${ev.title}`, { body: `Starts at ${new Date(ev.startISO).toLocaleString()}` });
      }
    }, delay);
    reminderTimers.push(t);
  });
}

function navigate(route){
  state.route = route;
  renderNav(state);
  setActiveNav(route);

  if(route==="dashboard") renderDashboard();
  else if(route==="calendar") renderCalendar();
  else if(route.startsWith("item:")) renderItem(route.split(":")[1]);
  else renderDashboard();
}

async function init(){
  db = await openDb();
  let data = loadData();
  if(!data){
    data = await loadSeed();
    saveData(data);
  }
  state.data = data;

  $("#btnExport").addEventListener("click", ()=>downloadJSON(state.data));
  $("#btnReset").addEventListener("click", async ()=>{
    const ok = confirm("Reset will overwrite your local data. Continue?");
    if(!ok) return;
    const seed = await loadSeed();
    state.data = seed;
    saveData(state.data);
    scheduleReminders();
    navigate("dashboard");
  });
  $("#fileImport").addEventListener("change", async (e)=>{
    const file = e.target.files?.[0];
    if(!file) return;
    try{
      const txt = await file.text();
      const imported = JSON.parse(txt);
      if(!imported || !imported.categories || !imported.events) throw new Error("Invalid backup format.");
      state.data = imported;
      saveData(state.data);
      scheduleReminders();
      navigate("dashboard");
    }catch(err){
      alert("Import failed: " + err.message);
    }finally{
      e.target.value="";
    }
  });

  scheduleReminders();
  navigate("dashboard");
}

init();
