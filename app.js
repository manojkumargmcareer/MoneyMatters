/* MoneyMatters — local-first personal finance app. Financial data stays in this browser profile unless you export it. */
(() => {
  "use strict";
  const DB_NAME = "paisaos_db_v1";
  const DB_VERSION = 2;
  const STORE_NAMES = ["transactions","accounts","budgets","goals","investments","bills","settings","tradeJournal"];
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const todayISO = () => new Date().toISOString().slice(0,10);
  const monthKey = (d=todayISO()) => d.slice(0,7);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const money = n => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(n||0));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let db, activeView = "dashboard", toastTimer;
  const LOCK_KEY = "paisaos_app_lock_v1";
  const SKIP_LOCK_KEY = "paisaos_app_lock_skipped_v1";
  let lockMode = "";
  let filters = {search:"",type:"all",month:monthKey()};
  const INCOME_CATEGORIES = ["Vigyanlabs Innovations Private Limited","IPO","Earn Karo","Others (Need To Specify)"];
  const EXPENSE_CATEGORIES = ["Food","Transport","Village","Home","Recharges","Lended To","Others (Need To Specify)","Unwanted Things","Wanted Things"];

  function openDB() {
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const name of STORE_NAMES) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name,{keyPath:"id"});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function all(store) {
    return new Promise((resolve,reject) => {
      const req = db.transaction(store,"readonly").objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function put(store, value) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite");
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Database write aborted"));
    });
  }
  function remove(store,id) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,"readwrite"); tx.objectStore(store).delete(id);
      tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error);
    });
  }
  function bytesToB64(bytes) { return btoa(String.fromCharCode(...bytes)); }
  function b64ToBytes(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
  async function deriveSecretHash(secret, saltB64) {
    if (!crypto.subtle) throw new Error("Web Crypto is unavailable. Use localhost or an HTTPS address.");
    const enc = new TextEncoder();
    const material = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({name:"PBKDF2", salt:b64ToBytes(saltB64), iterations:250000, hash:"SHA-256"}, material, 256);
    return bytesToB64(new Uint8Array(bits));
  }
  function makeRecoveryCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase();
  }
  function normalizeRecovery(code) { return String(code||"").replace(/[^a-f0-9]/gi,"").toUpperCase(); }
  function hideLockGate() { const overlay=$("#lockOverlay"); overlay.hidden=true; overlay.innerHTML=""; }
  function showLockGate(mode, recoveryCode="") {
    lockMode=mode;
    const overlay=$("#lockOverlay"); overlay.hidden=false;
    let body="";
    if(mode==="setup") body=`<div class="lock-logo">₹</div><h2 id="lockTitle">Set up an app PIN</h2><p>Create a PIN to keep casual access to MoneyMatters private on this device.</p><form id="lockForm"><div class="field"><label for="newPin">New PIN (6–12 digits)</label><input id="newPin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" autocomplete="new-password" required></div><div class="field"><label for="confirmPin">Confirm PIN</label><input id="confirmPin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" autocomplete="new-password" required></div><button class="primary">Create PIN</button></form><button id="skipLock" class="secondary">Continue without app PIN</button><p class="lock-warning">This PIN is a privacy screen only. It does not encrypt the live database, and someone with technical access to this browser profile may bypass it. Use device security and encrypted backups too.</p>`;
    else if(mode==="recovery-shown") body=`<div class="lock-logo">₹</div><h2 id="lockTitle">Save your recovery code</h2><p>This code lets you reset your app PIN if you forget it. It is shown only now.</p><div class="lock-recovery" id="recoveryCodeText">${esc(recoveryCode)}</div><button id="downloadRecovery" class="secondary">Download recovery code</button><button id="copyRecovery" class="secondary">Copy recovery code</button><button id="finishRecovery" class="primary">I've saved my recovery code</button><p class="lock-warning">Store this code separately from your phone. Anyone who has it can reset the app PIN. Losing both PIN and recovery code means you may need technical help to regain access to this privacy screen.</p>`;
    else if(mode==="unlock") body=`<div class="lock-logo">₹</div><h2 id="lockTitle">Unlock MoneyMatters</h2><p>Your app PIN is required to continue on this device.</p><form id="unlockForm"><div class="field"><label for="unlockPin">App PIN</label><input id="unlockPin" type="password" inputmode="numeric" autocomplete="current-password" required autofocus></div><button class="primary">Unlock</button></form><button id="useRecovery" class="secondary">Forgot PIN? Use recovery code</button><p class="lock-warning">The app PIN blocks casual viewing; it does not encrypt the live database.</p>`;
    else if(mode==="recover") body=`<div class="lock-logo">₹</div><h2 id="lockTitle">Reset app PIN</h2><p>Enter the recovery code you saved when enabling the lock.</p><form id="recoverForm"><div class="field"><label for="recoveryInput">Recovery code</label><input id="recoveryInput" autocomplete="off" required></div><button class="primary">Verify recovery code</button></form><button id="backUnlock" class="secondary">Back to PIN</button>`;
    else if(mode==="reset-pin") body=`<div class="lock-logo">₹</div><h2 id="lockTitle">Choose a new PIN</h2><p>Recovery code verified. Create a new PIN for this device.</p><form id="resetPinForm"><div class="field"><label for="resetPin">New PIN (6–12 digits)</label><input id="resetPin" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" required></div><div class="field"><label for="resetPinConfirm">Confirm PIN</label><input id="resetPinConfirm" type="password" inputmode="numeric" pattern="[0-9]{6,12}" minlength="6" maxlength="12" required></div><button class="primary">Save new PIN</button></form>`;
    overlay.innerHTML=`<div class="lock-card">${body}</div>`;
    $("#lockForm")?.addEventListener("submit", async e=>{e.preventDefault();const pin=$("#newPin").value,confirmPin=$("#confirmPin").value;if(pin!==confirmPin){notify("PINs do not match");return;}try{const salt=bytesToB64(crypto.getRandomValues(new Uint8Array(16))),recoveryCode=makeRecoveryCode(),recoverySalt=bytesToB64(crypto.getRandomValues(new Uint8Array(16)));const config={salt,pinHash:await deriveSecretHash(pin,salt),recoverySalt,recoveryHash:await deriveSecretHash(recoveryCode,recoverySalt),createdAt:new Date().toISOString()};localStorage.setItem(LOCK_KEY,JSON.stringify(config));localStorage.removeItem(SKIP_LOCK_KEY);showLockGate("recovery-shown",recoveryCode);}catch(err){notify(err.message||"Could not create app PIN");}});
    $("#skipLock")?.addEventListener("click",()=>{localStorage.setItem(SKIP_LOCK_KEY,"1");hideLockGate();});
    $("#finishRecovery")?.addEventListener("click",()=>hideLockGate());
    $("#downloadRecovery")?.addEventListener("click",()=>downloadBlob(new Blob([`MoneyMatters app-lock recovery code\n\n${recoveryCode}\n\nKeep this code private and separate from your device. It can reset your app PIN. It does not restore a database backup.`],{type:"text/plain;charset=utf-8"}),"moneymatters-recovery-code.txt"));
    $("#copyRecovery")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText(recoveryCode);notify("Recovery code copied");}catch{notify("Copy unavailable; write down the recovery code carefully");}});
    $("#unlockForm")?.addEventListener("submit",async e=>{e.preventDefault();try{const config=JSON.parse(localStorage.getItem(LOCK_KEY)||"null");if(!config)throw new Error("App lock configuration is missing");const hash=await deriveSecretHash($("#unlockPin").value,config.salt);if(hash!==config.pinHash){notify("Incorrect PIN");$("#unlockPin").value="";return;}hideLockGate();}catch(err){notify(err.message||"Unable to unlock");}});
    $("#useRecovery")?.addEventListener("click",()=>showLockGate("recover"));
    $("#recoverForm")?.addEventListener("submit",async e=>{e.preventDefault();try{const config=JSON.parse(localStorage.getItem(LOCK_KEY)||"null");if(!config)throw new Error("No app lock is configured");const code=normalizeRecovery($("#recoveryInput").value);const hash=await deriveSecretHash(code,config.recoverySalt);if(hash!==config.recoveryHash){notify("Recovery code did not match");return;}showLockGate("reset-pin");}catch(err){notify(err.message||"Recovery failed");}});
    $("#backUnlock")?.addEventListener("click",()=>showLockGate("unlock"));
    $("#resetPinForm")?.addEventListener("submit",async e=>{e.preventDefault();const pin=$("#resetPin").value;if(pin!==$("#resetPinConfirm").value){notify("PINs do not match");return;}try{const config=JSON.parse(localStorage.getItem(LOCK_KEY)||"null"),salt=bytesToB64(crypto.getRandomValues(new Uint8Array(16)));config.salt=salt;config.pinHash=await deriveSecretHash(pin,salt);config.pinUpdatedAt=new Date().toISOString();localStorage.setItem(LOCK_KEY,JSON.stringify(config));hideLockGate();notify("App PIN reset successfully");}catch(err){notify(err.message||"Could not reset PIN");}});
  }
  function initializeLockGate() {
    const config=localStorage.getItem(LOCK_KEY);
    if(config) showLockGate("unlock");
    else if(localStorage.getItem(SKIP_LOCK_KEY)!=="1") showLockGate("setup");
    else hideLockGate();
  }
  async function getSettings() { return (await all("settings"))[0] || {id:"main",currency:"INR",createdAt:new Date().toISOString()}; }
  async function seed() {
    // Let the user create exactly the accounts they want; never seed sample accounts.
    const settings = await all("settings");
    if (!settings.length) await put("settings",{id:"main",currency:"INR",createdAt:new Date().toISOString()});
  }
  async function snapshot() {
    const out = {app:"PaisaOS",schemaVersion:2,exportedAt:new Date().toISOString(),currency:"INR",data:{}};
    for (const s of STORE_NAMES) out.data[s] = await all(s);
    return out;
  }
  function downloadBlob(blob, name) {
    const url=URL.createObjectURL(blob), a=document.createElement("a");
    a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function downloadJSON(obj,name) { downloadBlob(new Blob([JSON.stringify(obj,null,2)],{type:"application/json"}),name); }
  function csvCell(v) { const s=String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
  function parseCSV(text) {
    const rows=[]; let row=[], field="", quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i], next=text[i+1];
      if(quoted){ if(c==='"'&&next==='"'){field+='"';i++;} else if(c==='"') quoted=false; else field+=c; }
      else if(c==='"') quoted=true;
      else if(c===','){row.push(field);field="";}
      else if(c==='\n'){row.push(field.replace(/\r$/,""));rows.push(row);row=[];field="";}
      else field+=c;
    }
    if(field.length||row.length){row.push(field.replace(/\r$/,""));rows.push(row);}
    return rows.filter(r=>r.some(x=>x.trim()!==""));
  }
  function notify(message) {
    const t=$("#toast"); t.textContent=message; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),2600);
  }
  function dateLabel(d) { if(!d) return "—"; return new Date(`${d}T12:00:00`).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); }
  function monthLabel(m=monthKey()) { const [y,mo]=m.split("-").map(Number); return new Date(y,mo-1,1).toLocaleDateString("en-IN",{month:"long",year:"numeric"}); }
  function iconForCategory(c) {
    const map={Food:"🍲",Transport:"🚌",Salary:"💼",Rent:"🏠",Bills:"🧾",Shopping:"🛍️",Health:"💊",Education:"📚",Investment:"📈",Other:"•"};
    return map[c] || "•";
  }
  async function totals() {
    const [txs,accounts] = await Promise.all([all("transactions"),all("accounts")]);
    const m=monthKey(), monthly=txs.filter(t=>t.date?.startsWith(m));
    const income=monthly.filter(t=>t.type==="income").reduce((a,t)=>a+Number(t.amount),0);
    const expenses=monthly.filter(t=>t.type==="expense").reduce((a,t)=>a+Number(t.amount),0);
    const net=accounts.reduce((sum,a)=>sum+accountBalance(a,txs),0);
    return {txs,accounts,monthly,income,expenses,net,savings:income-expenses};
  }
  function accountBalance(account, txs) {
    // Credit-card balances are represented internally as negative liabilities.
    let b=account.type==="credit_card"?-Math.abs(Number(account.openingBalance||0)):Number(account.openingBalance||0);
    for(const t of txs) {
      if(account.type==="credit_card") {
        if(t.type==="expense" && t.accountId===account.id) b-=Number(t.amount);
        if(t.type==="income" && t.accountId===account.id) b+=Number(t.amount);
        if(t.type==="transfer") {
          if(t.accountId===account.id) b+=Number(t.amount); // payment from card to another account is uncommon
          if(t.toAccountId===account.id) b+=Number(t.amount); // payment into card reduces debt
        }
      } else {
        if(t.type==="income" && t.accountId===account.id) b+=Number(t.amount);
        if(t.type==="expense" && t.accountId===account.id) b-=Number(t.amount);
        if(t.type==="transfer") {
          if(t.accountId===account.id) b-=Number(t.amount);
          if(t.toAccountId===account.id) b+=Number(t.amount);
        }
      }
    }
    return b;
  }
  function head(title,desc,action="") {
    return `<div class="page-head"><div><div class="eyebrow">PERSONAL FINANCE</div><h1>${title}</h1><p>${desc}</p></div>${action?`<div>${action}</div>`:`<div class="date-label">${new Date().toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})}</div>`}</div>`;
  }
  function stat(label,value,foot,icon,cls="") {
    return `<div class="stat"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon}</span></div><div class="stat-value ${cls}">${value}</div><div class="stat-foot">${foot}</div></div>`;
  }
  function txTable(txs, limit=100) {
    if(!txs.length) return `<div class="empty"><strong>No transactions yet</strong>Add your first income or expense to start tracking your money.</div>`;
    return `<div class="table-wrap"><table class="data-table"><thead><tr><th>DATE</th><th>DESCRIPTION</th><th>TYPE</th><th style="text-align:right">AMOUNT</th><th></th></tr></thead><tbody>${txs.slice(0,limit).map(t=>`<tr><td>${dateLabel(t.date)}</td><td><strong>${esc(t.category||"Other")}</strong><div class="muted small">${esc(t.note||"")}</div></td><td><span class="tag">${esc(t.type)}</span></td><td style="text-align:right" class="amount ${t.type}">${t.type==="expense"?"−":t.type==="income"?"+":""}${money(t.amount)}</td><td><button class="text-btn" data-delete-tx="${t.id}" title="Delete transaction">Delete</button></td></tr>`).join("")}</tbody></table></div>`;
  }
  async function render() {
    const main=$("#main");
    const data=await totals();
    window.__accounts=data.accounts;
    const [budgets,goals,investments,bills]=await Promise.all([all("budgets"),all("goals"),all("investments"),all("bills")]);
    const month=monthKey(), monthTx=data.txs.filter(t=>t.date?.startsWith(month));
    const expenseByCat={};
    monthTx.filter(t=>t.type==="expense").forEach(t=>expenseByCat[t.category||"Other"]=(expenseByCat[t.category||"Other"]||0)+Number(t.amount));
    const cats=Object.entries(expenseByCat).sort((a,b)=>b[1]-a[1]);
    let html="";
    if(activeView==="dashboard") {
      const budgetTotal=budgets.filter(b=>b.month===month).reduce((s,b)=>s+Number(b.limit),0);
      const used=data.expenses;
      html=head("Good money habits start here","A clear view of your money, stored locally on this device.")+
      `<div class="stats home-stats">${stat("INCOME THIS MONTH",money(data.income),"Money received","💰","positive")}${stat("EXPENSES THIS MONTH",money(data.expenses),"Money spent","🛍️","negative")}${stat("MONTHLY NET CASH FLOW",money(data.savings),"Income minus expenses","✨",data.savings>=0?"positive":"negative")}</div>`+
      `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Cash flow</h2><div class="panel-sub">Income and expenses over the last 6 months</div></div><span class="tag">6 months</span></div><div class="chart-wrap"><canvas id="cashflowChart" aria-label="Monthly income and expenses chart"></canvas></div><div class="panel-sub">Chart uses recorded transactions. Transfers are excluded from income and expenses.</div></section><section class="panel"><div class="panel-head"><div><h2>Spending by category</h2><div class="panel-sub">${monthLabel()} · expenses only</div></div><button class="text-btn" data-goto="reports">View reports →</button></div>${cats.length?cats.slice(0,5).map(([c,v])=>`<div class="category-row"><div class="category-icon">${iconForCategory(c)}</div><div class="category-details"><strong>${esc(c)}</strong><small>${data.expenses?Math.round(v/data.expenses*100):0}% of expenses</small></div><div class="category-amount">${money(v)}</div></div>`).join(""):`<div class="empty">Your category breakdown will appear after you record expenses.</div>`}</section></div>`+
      `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Top 5 expenses this month</h2><div class="panel-sub">Largest individual expenses in ${monthLabel()}</div></div></div>${monthTx.filter(t=>t.type==="expense").sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5).length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>CATEGORY</th><th>DATE</th><th>NOTE</th><th>AMOUNT</th></tr></thead><tbody>${monthTx.filter(t=>t.type==="expense").sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5).map(t=>`<tr><td><strong>${esc(t.category||"Expense")}</strong></td><td>${dateLabel(t.date)}</td><td>${esc(t.note||"—")}</td><td class="amount expense">${money(t.amount)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty">Your top expenses will appear here after you record expenses.</div>`}</section></div>`+
      `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Recent transactions</h2><div class="panel-sub">Latest activity</div></div><button class="text-btn" data-goto="transactions">All transactions →</button></div>${txTable([...data.txs].sort((a,b)=>(b.date||"").localeCompare(a.date||"")),5)}</section><section class="panel"><div class="panel-head"><div><h2>Budget snapshot</h2><div class="panel-sub">${monthLabel()}</div></div><button class="text-btn" data-goto="budgets">Manage →</button></div>${budgets.filter(b=>b.month===month).length?budgets.filter(b=>b.month===month).map(b=>{const spent=expenseByCat[b.category]||0,pct=Number(b.limit)?spent/Number(b.limit)*100:0;return `<div class="budget-line"><div class="budget-meta"><span>${esc(b.category)}</span><span>${money(spent)} / ${money(b.limit)}</span></div><div class="progress"><span class="${pct>100?"over":""}" style="width:${Math.min(100,pct)}%"></span></div></div>`}).join(""):`<div class="empty">No budgets set for this month yet.</div>`}${budgetTotal?`<div class="notice">Budgeted ${money(budgetTotal)} · Spent ${money(used)}</div>`:""}</section></div>`;
      requestAnimationFrame(drawCashflow);
    } else if(activeView==="transactions") {
      const search=filters.search.toLowerCase();
      const txs=[...data.txs].filter(t=>(filters.type==="all"||t.type===filters.type)&&(!filters.month||t.date?.startsWith(filters.month))&&(`${t.category} ${t.note} ${t.type}`.toLowerCase().includes(search))).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
      html=head("Transactions","Every recorded transaction, with local search and filters.",`<button class="primary" id="addFromPage">+ Add transaction</button>`)+
      `<div class="toolbar"><input id="txSearch" value="${esc(filters.search)}" placeholder="Search category or note"><select id="txFilterType"><option value="all">All types</option><option value="income" ${filters.type==="income"?"selected":""}>Income</option><option value="expense" ${filters.type==="expense"?"selected":""}>Expense</option><option value="transfer" ${filters.type==="transfer"?"selected":""}>Transfer</option></select><input id="txFilterMonth" type="month" value="${esc(filters.month)}"><button class="secondary" id="clearTxFilters">Clear filters</button></div><section class="panel">${txTable(txs)}</section>`;
    } else if(activeView==="budgets") {
      const monthBudgets=budgets.filter(b=>b.month===month).sort((a,b)=>a.category.localeCompare(b.category));
      html=head("Monthly budgets","Set category limits and see how much you have spent.")+
      `<form id="budgetForm" class="inline-form"><div class="field"><label>Category</label><input name="category" required placeholder="e.g. Food"></div><div class="field"><label>Monthly limit (₹)</label><input name="limit" type="number" min="0.01" step=".01" required placeholder="5000"></div><div class="field"><label>Month</label><input name="month" type="month" value="${month}" required></div><button class="primary">Save budget</button></form>`+
      `<div class="cards-grid">${monthBudgets.length?monthBudgets.map(b=>{const spent=data.txs.filter(t=>t.type==="expense"&&t.date?.startsWith(b.month)&&t.category.toLowerCase()===b.category.toLowerCase()).reduce((s,t)=>s+Number(t.amount),0),pct=spent/Number(b.limit)*100;return `<div class="card"><div class="card-top"><span class="tag">${esc(b.month)}</span><button class="text-btn" data-delete-budget="${b.id}">Delete</button></div><h2>${esc(b.category)}</h2><div class="card-value">${money(spent)} <span class="muted small">of ${money(b.limit)}</span></div><div class="progress"><span class="${pct>100?"over":""}" style="width:${Math.min(100,pct)}%"></span></div><p class="muted small">${pct>100?`Over budget by ${money(spent-Number(b.limit))}`:`${money(Number(b.limit)-spent)} remaining`}</p></div>`}).join(""):`<div class="card empty"><strong>No budgets for ${monthLabel()}</strong>Create a category budget above.</div>`}</div>`;
    } else if(activeView==="goals") {
      html=head("Savings goals","Track the money you want to set aside for what matters.")+
      `<form id="goalForm" class="inline-form"><div class="field"><label>Goal name</label><input name="name" required placeholder="House renovation"></div><div class="field"><label>Target amount (₹)</label><input name="target" type="number" min=".01" step=".01" required placeholder="100000"></div><div class="field"><label>Already saved (₹)</label><input name="saved" type="number" min="0" step=".01" value="0" required></div><button class="primary">Add goal</button></form>`+
      `<div class="cards-grid">${goals.length?goals.map(g=>{const pct=Number(g.target)?Number(g.saved)/Number(g.target)*100:0;return `<div class="card"><div class="card-top"><span class="tag">Savings goal</span><button class="text-btn" data-delete-goal="${g.id}">Delete</button></div><h2>${esc(g.name)}</h2><div class="card-value">${money(g.saved)} <span class="muted small">saved</span></div><div class="progress"><span style="width:${Math.min(100,pct)}%"></span></div><p class="muted small">${Math.round(pct)}% · ${money(Math.max(0,Number(g.target)-Number(g.saved)))} to go</p><form class="goal-update" data-goal-id="${g.id}"><div class="form-grid"><div class="field"><label>Update saved total (₹)</label><input type="number" name="saved" min="0" step=".01" value="${Number(g.saved)}" required></div><div style="display:flex;align-items:end"><button class="secondary">Update</button></div></div></form></div>`}).join(""):`<div class="card empty"><strong>No goals yet</strong>Add a goal to start tracking progress.</div>`}</div>`;
    } else if(activeView==="investments") {
      html=head("Investments","Manually record holdings and their latest estimated values.")+
      `<form id="investmentForm" class="inline-form"><div class="field"><label>Investment name</label><input name="name" required placeholder="Index mutual fund"></div><div class="field"><label>Invested amount (₹)</label><input name="invested" type="number" min="0" step=".01" required placeholder="10000"></div><div class="field"><label>Current value (₹)</label><input name="currentValue" type="number" min="0" step=".01" required placeholder="10500"></div><button class="primary">Add holding</button></form>`+
      `<div class="stats">${stat("INVESTED",money(investments.reduce((s,i)=>s+Number(i.invested),0)),"Recorded cost","↗")}${stat("CURRENT VALUE",money(investments.reduce((s,i)=>s+Number(i.currentValue),0)),"Manually updated","◈")}${stat("GAIN / LOSS",money(investments.reduce((s,i)=>s+Number(i.currentValue)-Number(i.invested),0)),"Not a live market quote","±","")}${stat("HOLDINGS",String(investments.length),"Manual portfolio records","▤")}</div>`+
      `<div class="cards-grid">${investments.length?investments.map(i=>{const diff=Number(i.currentValue)-Number(i.invested);return `<div class="card"><div class="card-top"><span class="tag">Holding</span><button class="text-btn" data-delete-investment="${i.id}">Delete</button></div><h2>${esc(i.name)}</h2><div class="card-value">${money(i.currentValue)}</div><p class="muted small">Invested ${money(i.invested)}</p><p class="small ${diff>=0?"positive":"negative"}">${diff>=0?"+":""}${money(diff)} (${Number(i.invested)?(diff/Number(i.invested)*100).toFixed(2):"0.00"}%)</p><form class="investment-update" data-investment-id="${i.id}"><div class="field"><label>Update current value (₹)</label><input type="number" min="0" step=".01" name="currentValue" value="${Number(i.currentValue)}" required></div><button class="secondary">Update value</button></form></div>`}).join(""):`<div class="card empty"><strong>No holdings recorded</strong>Add a holding above. Values are manual; no broker connection is used.</div>`}</div><div class="notice">This is a personal record-keeping tool, not investment advice. Prices and values are not fetched automatically.</div>`;
    } else if(activeView==="trading") {
      const trades=await all("tradeJournal");
      const closed=trades.filter(t=>t.exitPrice!==null&&t.exitPrice!==undefined&&t.exitPrice!==""&&Number(t.exitPrice)>0);
      const pnl=t=>(Number(t.exitPrice)-Number(t.entryPrice))*Number(t.quantity);
      const realized=closed.reduce((sum,t)=>sum+pnl(t),0);
      const currentMonth=monthKey();
      const monthClosed=closed.filter(t=>(t.exitDate||t.tradeDate||"").startsWith(currentMonth));
      const monthPnl=monthClosed.reduce((sum,t)=>sum+pnl(t),0);
      const fmtNum=n=>Number(n||0).toLocaleString("en-IN",{maximumFractionDigits:2});
      html=head("Swing trade journal","Simple trade tracking with automatic amount and profit/loss calculation.")+
      `<div class="stats">${stat("REALIZED P/L",money(realized),`${closed.length} trades with exit prices`,"₹",realized>=0?"positive":"negative")}${stat("THIS MONTH P/L",money(monthPnl),`${monthClosed.length} trades exited this month`,"📈",monthPnl>=0?"positive":"negative")}</div>`+
      `<section class="panel trade-form-panel"><div class="panel-head"><div><h2>Add a trade</h2><div class="panel-sub">Total amount = entry price × quantity. P/L appears after you enter an exit price.</div></div></div>`+
      `<form id="tradeForm" class="trade-form">`+
      `<div class="field"><label>Security name *</label><input name="symbol" maxlength="80" placeholder="e.g. RELIANCE" required></div>`+
      `<div class="form-grid"><div class="field"><label>Entry price (₹) *</label><input name="entryPrice" type="number" min="0.01" step="any" required placeholder="100.00"></div><div class="field"><label>Exit price (₹, optional until sold)</label><input name="exitPrice" type="number" min="0.01" step="any" placeholder="110.00"></div></div>`+
      `<div class="field"><label>Quantity *</label><input name="quantity" type="number" min="1" step="1" required placeholder="10"></div>`+
      `<div class="field"><label>Reason to trade</label><textarea name="strategy" rows="2" maxlength="1000" placeholder="Why did you enter this trade?"></textarea></div>`+
      `<div class="field"><label>Lesson</label><textarea name="lesson" rows="2" maxlength="1500" placeholder="What did you learn from this trade?"></textarea></div>`+
      `<div class="notice" id="tradeCalcPreview">Enter entry price and quantity to calculate total amount.</div>`+
      `<button class="primary" type="submit">Save trade</button></form></section>`+
      `<section class="panel"><div class="panel-head"><div><h2>Trade history</h2><div class="panel-sub">P/L = (exit price − entry price) × quantity. Charges and taxes are excluded.</div></div></div>`+
      `${trades.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>SECURITY NAME</th><th>ENTRY PRICE</th><th>EXIT PRICE</th><th>QUANTITY</th><th>TOTAL AMOUNT</th><th>P/L (₹)</th><th>REASON TO TRADE</th><th>LESSON</th><th></th></tr></thead><tbody>${[...trades].sort((a,b)=>(b.tradeDate||b.createdAt||"").localeCompare(a.tradeDate||a.createdAt||"")).map(t=>{const exit=t.exitPrice!==null&&t.exitPrice!==undefined&&t.exitPrice!==""&&Number(t.exitPrice)>0;const result=exit?pnl(t):null;return `<tr><td><strong>${esc(t.symbol||t.securityName||"")}</strong></td><td>${money(t.entryPrice)}</td><td>${exit?money(t.exitPrice):"—"}</td><td>${fmtNum(t.quantity)}</td><td>${money(Number(t.entryPrice)*Number(t.quantity))}</td><td class="amount ${result===null?"":result>=0?"income":"expense"}">${result===null?"—":`${result>0?"+":""}${money(result)}`}</td><td>${esc(t.strategy||t.reasonToTrade||"—")}</td><td>${esc(t.lesson||"—")}</td><td><button class="text-btn" data-delete-trade="${t.id}">Delete</button></td></tr>`}).join("")}</tbody></table></div>`:`<div class="empty"><strong>No trades recorded yet</strong>Add your first trade above.</div>`}</section>`+
      `<div class="notice warn">P/L is an estimate and excludes brokerage, taxes, exchange charges and slippage. For a standard buy-first swing trade, positive means profit and negative means loss.</div>`;
    } else if(activeView==="bills") {
      const sorted=[...bills].sort((a,b)=>(a.dueDate||"").localeCompare(b.dueDate||""));
      html=head("Bills & recurring","Keep track of upcoming bills and repeat transactions.")+
      `<form id="billForm" class="inline-form"><div class="field"><label>Bill / reminder</label><input name="name" required placeholder="Internet bill"></div><div class="field"><label>Amount (₹)</label><input name="amount" type="number" min="0" step=".01" required placeholder="999"></div><div class="field"><label>Due date</label><input name="dueDate" type="date" value="${todayISO()}" required></div><button class="primary">Add reminder</button></form>`+
      `<div class="notice warn">MVP reminder behavior: due dates appear in this list when you open the app. Browser push notifications and automatic recurring transaction creation are not enabled yet.</div>`+
      `<section class="panel"><div class="panel-head"><div><h2>Upcoming bills & reminders</h2><div class="panel-sub">Sorted by due date</div></div></div>${sorted.length?`<div class="table-wrap"><table class="data-table"><thead><tr><th>NAME</th><th>DUE DATE</th><th>AMOUNT</th><th>STATUS</th><th></th></tr></thead><tbody>${sorted.map(b=>`<tr><td><strong>${esc(b.name)}</strong></td><td>${dateLabel(b.dueDate)}</td><td class="amount">${money(b.amount)}</td><td><span class="tag">${b.paid?"Paid":b.dueDate<todayISO()?"Overdue":b.dueDate===todayISO()?"Due today":"Upcoming"}</span></td><td><button class="text-btn" data-toggle-bill="${b.id}">${b.paid?"Mark unpaid":"Mark paid"}</button> <button class="text-btn" data-delete-bill="${b.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty"><strong>No bills yet</strong>Add a bill or reminder above.</div>`}</section>`;
    } else if(activeView==="reports") {
      const allMonths=[...Array(6)].map((_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));return d.toISOString().slice(0,7)});
      const rows=allMonths.map(m=>{const ts=data.txs.filter(t=>t.date?.startsWith(m));return {m,income:ts.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0),expenses:ts.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0)}});
      html=head("Reports & insights","A clear, visual story of your income, spending and savings.")+
      `<div class="stats">${stat("ALL-TIME INCOME",money(data.txs.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0)),"Recorded transactions","↗","positive")}${stat("ALL-TIME EXPENSES",money(data.txs.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0)),"Recorded transactions","↘","negative")}${stat("NET CASH FLOW",money(data.txs.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0)-data.txs.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0)),"Excludes transfers","◈")}${stat("TRANSACTIONS",String(data.txs.length),"All recorded activity","⇄")}</div>`+
      `<section class="panel"><div class="panel-head"><div><h2>Six-month cash flow</h2><div class="panel-sub">Income and expenses by calendar month</div></div></div><div class="chart-wrap"><canvas id="reportChart"></canvas></div></section><section class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>This month's spending by category</h2><div class="panel-sub">Largest categories first</div></div></div>${cats.length?cats.map(([category,value])=>`<div class="category-row"><div class="category-icon">${iconForCategory(category)}</div><div class="category-details"><strong>${esc(category)}</strong><small>${data.expenses?Math.round(value/(monthTx.filter(t=>t.type==="expense").reduce((sum,t)=>sum+Number(t.amount),0)||1)*100):0}% of this month's expenses</small></div><div class="category-amount">${money(value)}</div></div>`).join(""):`<div class="empty">No expense data for this month yet.</div>`}</section><section class="panel" style="margin-top:16px"><div class="panel-head"><div><h2>Monthly totals</h2><div class="panel-sub">Based on transaction dates</div></div></div><div class="table-wrap"><table class="data-table"><thead><tr><th>MONTH</th><th>INCOME</th><th>EXPENSES</th><th>NET</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${monthLabel(r.m)}</td><td class="amount income">${money(r.income)}</td><td class="amount expense">${money(r.expenses)}</td><td class="amount ${r.income-r.expenses>=0?"positive":"negative"}">${money(r.income-r.expenses)}</td></tr>`).join("")}</tbody></table></div></section>`;
      requestAnimationFrame(()=>drawChart($("#reportChart"),rows));
    } else if(activeView==="backup") {
      html=head("Backup & restore","Export your records and keep a copy somewhere you control.")+
      `<div class="notice warn"><strong>Important:</strong> data is stored in this browser profile on this device. Clearing site data or losing the device can erase it. Export regular backups. To move to another device, export a backup and restore it there. Restore replaces existing app data.</div>`+
      `<div class="settings-grid"><section class="action-card"><h3>Complete JSON backup</h3><p>All MoneyMatters records in a portable JSON file. Keep this file private; it contains your financial data in readable form.</p><button class="primary" id="exportJSON">Export JSON</button></section><section class="action-card"><h3>Encrypted backup</h3><p>Encrypt the complete backup locally with a passphrase. If you lose the passphrase, it cannot be recovered.</p><div class="field"><label>Backup passphrase</label><input id="backupPass" type="password" minlength="8" placeholder="At least 8 characters" autocomplete="new-password"></div><button class="primary" id="exportEncrypted">Export encrypted</button></section><section class="action-card"><h3>Merge a JSON backup (recommended)</h3><p>Bring your mobile backup into desktop without clearing desktop records. Matching record IDs are updated, new IDs are added, and repeated imports should not duplicate records. Mobile should remain your main data-entry device.</p><input id="mergeFile" type="file" accept=".json,application/json" hidden><button class="primary" id="chooseMerge">Choose JSON to merge</button></section><section class="action-card"><h3>Merge an encrypted backup</h3><p>Decrypt and merge a MoneyMatters encrypted backup. You will need its passphrase. Keep your mobile as the source of truth.</p><div class="field"><label>Backup passphrase</label><input id="mergePass" type="password" placeholder="Passphrase used for export" autocomplete="current-password"></div><input id="mergeEncryptedFile" type="file" accept=".paisaos,application/json" hidden><button class="primary" id="chooseEncryptedMerge">Choose encrypted file to merge</button></section><section class="action-card"><h3>Restore a backup</h3><p>Import a MoneyMatters JSON backup. Existing records are replaced after validation and confirmation.</p><input id="restoreFile" type="file" accept=".json,.paisaos,application/json" hidden><button class="secondary" id="chooseRestore">Choose backup file</button></section><section class="action-card"><h3>Restore encrypted backup</h3><p>Choose an encrypted backup file and enter the passphrase used when exporting it.</p><div class="field"><label>Backup passphrase</label><input id="restorePass" type="password" placeholder="Your passphrase" autocomplete="current-password"></div><input id="restoreEncryptedFile" type="file" accept=".json,.paisaos,application/json" hidden><button class="secondary" id="chooseEncryptedRestore">Choose encrypted file</button></section><section class="action-card"><h3>Transactions CSV</h3><p>Export transaction rows for spreadsheets, or import a CSV using the MoneyMatters column format.</p><button class="secondary" id="exportCSV">Export CSV</button><input id="csvFile" type="file" accept=".csv,text/csv" hidden><button class="secondary" id="chooseCSV">Import CSV</button></section><section class="action-card"><h3>App lock</h3><p>Set a local PIN to reduce casual access when MoneyMatters is open. This does not encrypt the live database.</p><button class="secondary" id="manageLock">Set up / reset app PIN</button><button class="secondary" id="disableLock">Disable app PIN</button></section><section class="action-card"><h3>Local storage details</h3><p>Browser storage is not a substitute for a backup. Private browsing, browser cleanup, or device loss may remove local records.</p><div class="tag">IndexedDB · Local only</div><p class="small muted">No analytics, trackers, cloud accounts, or paid APIs are used by this MVP.</p></section></div>`;
    }
    main.innerHTML=html;
    bindViewEvents();
  }
  function drawCashflow() {
    const months=[...Array(6)].map((_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));return d.toISOString().slice(0,7)});
    const txs=window.__txCache;
    loadCashflowData().then(rows=>drawChart($("#cashflowChart"),rows));
  }
  async function loadCashflowData() {
    const txs=await all("transactions");
    return [...Array(6)].map((_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()-(5-i));const m=d.toISOString().slice(0,7),ts=txs.filter(t=>t.date?.startsWith(m));return {m,income:ts.filter(t=>t.type==="income").reduce((s,t)=>s+Number(t.amount),0),expenses:ts.filter(t=>t.type==="expense").reduce((s,t)=>s+Number(t.amount),0)}});
  }
  function drawChart(canvas, rows) {
    if(!canvas) return;
    const ctx=canvas.getContext("2d"), rect=canvas.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
    if(!rect.width||!rect.height) return;
    canvas.width=rect.width*dpr;canvas.height=rect.height*dpr;ctx.scale(dpr,dpr);
    const w=rect.width,h=rect.height,p={l:12,r:8,t:12,b:30},cw=w-p.l-p.r,ch=h-p.t-p.b;
    ctx.clearRect(0,0,w,h);
    const max=Math.max(100,...rows.flatMap(r=>[r.income,r.expenses]))*1.12;
    ctx.font="10px system-ui";ctx.fillStyle="#8b95a8";ctx.strokeStyle="#edf0f5";ctx.lineWidth=1;
    for(let i=0;i<4;i++){const y=p.t+ch*i/3;ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();}
    const group=cw/Math.max(rows.length,1),bar=Math.min(18,group*.28);
    rows.forEach((r,i)=>{const cx=p.l+group*(i+.5),ih=ch*r.income/max,eh=ch*r.expenses/max;ctx.fillStyle="#5b64e8";ctx.fillRect(cx-bar-2,p.t+ch-ih,bar,ih);ctx.fillStyle="#f29b62";ctx.fillRect(cx+2,p.t+ch-eh,bar,eh);ctx.fillStyle="#8791a4";ctx.textAlign="center";ctx.fillText(new Date(`${r.m}-01T12:00:00`).toLocaleDateString("en-IN",{month:"short"}),cx,h-8);});
    ctx.textAlign="left";ctx.fillStyle="#5b64e8";ctx.fillRect(p.l,0,7,7);ctx.fillStyle="#778196";ctx.fillText("Income",p.l+11,7);ctx.fillStyle="#f29b62";ctx.fillRect(p.l+66,0,7,7);ctx.fillStyle="#778196";ctx.fillText("Expenses",p.l+77,7);
  }
  function populateCategoryOptions(type) {
    const select=$("#txCategory");
    const options=type==="income"?INCOME_CATEGORIES:type==="expense"?EXPENSE_CATEGORIES:["Transfer"];
    select.innerHTML=options.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
    $("#customCategoryWrap").hidden=select.value!=="Others (Need To Specify)";
    $("#txCustomCategory").required=select.value==="Others (Need To Specify)";
  }
  async function showTransactionDialog() {
    $("#txDate").value=todayISO();$("#txAmount").value="";$("#txNote").value="";$("#txCustomCategory").value="";
    $("#txType").value="expense";populateCategoryOptions("expense");
    $("#transactionDialog").showModal();
  }
  function bindViewEvents() {
    $$("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
    $("#addFromPage")?.addEventListener("click",showTransactionDialog);
    $("#txSearch")?.addEventListener("input",e=>{filters.search=e.target.value;render();});
    $("#txFilterType")?.addEventListener("change",e=>{filters.type=e.target.value;render();});
    $("#txFilterMonth")?.addEventListener("change",e=>{filters.month=e.target.value;render();});
    $("#clearTxFilters")?.addEventListener("click",()=>{filters={search:"",type:"all",month:""};render();});
    $$("[data-delete-tx]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("Delete this transaction? This cannot be undone unless you have a backup.")){await remove("transactions",b.dataset.deleteTx);notify("Transaction deleted");render();}}));
    $$("[data-delete-budget]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("Delete this budget?")){await remove("budgets",b.dataset.deleteBudget);render();}}));
    $$("[data-delete-goal]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("Delete this goal?")){await remove("goals",b.dataset.deleteGoal);render();}}));
    $$("[data-delete-investment]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("Delete this holding?")){await remove("investments",b.dataset.deleteInvestment);render();}}));
    $$("[data-delete-trade]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("Delete this trade journal entry? This cannot be undone unless you have a backup.")){await remove("tradeJournal",b.dataset.deleteTrade);render();}}));
    $$("[data-delete-bill]").forEach(b=>b.addEventListener("click",async()=>{if(confirm("Delete this reminder?")){await remove("bills",b.dataset.deleteBill);render();}}));
    $$("[data-toggle-bill]").forEach(b=>b.addEventListener("click",async()=>{const bill=(await all("bills")).find(x=>x.id===b.dataset.toggleBill);if(bill){bill.paid=!bill.paid;await put("bills",bill);render();}}));
    $("#budgetForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget),category=String(f.get("category")).trim(),month=f.get("month"),limit=Number(f.get("limit"));if(!category||limit<=0)return;const old=(await all("budgets")).find(b=>b.month===month&&b.category.toLowerCase()===category.toLowerCase());await put("budgets",{id:old?.id||uid(),category,month,limit,updatedAt:new Date().toISOString()});notify("Budget saved");render();});
    $("#goalForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await put("goals",{id:uid(),name:String(f.get("name")).trim(),target:Number(f.get("target")),saved:Number(f.get("saved")),createdAt:new Date().toISOString()});notify("Savings goal added");render();});
    $$(".goal-update").forEach(form=>form.addEventListener("submit",async e=>{e.preventDefault();const goal=(await all("goals")).find(g=>g.id===form.dataset.goalId);if(goal){goal.saved=Number(new FormData(form).get("saved"));await put("goals",goal);notify("Goal updated");render();}}));
    $("#investmentForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await put("investments",{id:uid(),name:String(f.get("name")).trim(),invested:Number(f.get("invested")),currentValue:Number(f.get("currentValue")),updatedAt:new Date().toISOString()});notify("Investment added");render();});
    $("#tradeForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);const entryPrice=Number(f.get("entryPrice")),quantity=Number(f.get("quantity")),exitRaw=String(f.get("exitPrice")||"").trim();if(!Number.isFinite(entryPrice)||entryPrice<=0||!Number.isInteger(quantity)||quantity<=0){notify("Enter a valid entry price and whole-number quantity");return;}const exitPrice=exitRaw===""?null:Number(exitRaw);if(exitPrice!==null&&(!Number.isFinite(exitPrice)||exitPrice<=0)){notify("Exit price must be greater than zero");return;}const record={id:uid(),tradeDate:todayISO(),symbol:String(f.get("symbol")).trim(),securityName:String(f.get("symbol")).trim(),direction:"Long",status:exitPrice===null?"Open":"Closed",entryPrice,quantity,exitPrice,exitDate:exitPrice===null?null:todayISO(),strategy:String(f.get("strategy")||"").trim(),reasonToTrade:String(f.get("strategy")||"").trim(),lesson:String(f.get("lesson")||"").trim(),createdAt:new Date().toISOString()};await put("tradeJournal",record);notify("Trade saved");render();});
    const updateTradePreview=()=>{const form=$("#tradeForm");if(!form)return;const entry=Number(form.elements.entryPrice.value),qty=Number(form.elements.quantity.value);const total=entry>0&&qty>0?money(entry*qty):"—";const exitRaw=form.elements.exitPrice.value.trim(),exit=Number(exitRaw);const pnl=entry>0&&qty>0&&exitRaw!==""&&exit>0?money((exit-entry)*qty):"Enter exit price to calculate P/L";const preview=$("#tradeCalcPreview");if(preview)preview.textContent=`Total amount: ${total} · P/L: ${pnl}`;};
    $("#tradeForm")?.querySelectorAll('input[name="entryPrice"], input[name="exitPrice"], input[name="quantity"]').forEach(el=>el.addEventListener("input",updateTradePreview));

    $$(".investment-update").forEach(form=>form.addEventListener("submit",async e=>{e.preventDefault();const item=(await all("investments")).find(i=>i.id===form.dataset.investmentId);if(item){item.currentValue=Number(new FormData(form).get("currentValue"));item.updatedAt=new Date().toISOString();await put("investments",item);notify("Investment value updated");render();}}));
    $("#billForm")?.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await put("bills",{id:uid(),name:String(f.get("name")).trim(),amount:Number(f.get("amount")),dueDate:f.get("dueDate"),paid:false,createdAt:new Date().toISOString()});notify("Reminder added");render();});
    $("#exportJSON")?.addEventListener("click",async()=>{downloadJSON(await snapshot(),`paisaos-backup-${todayISO()}.json`);notify("JSON backup exported");});
    $("#exportCSV")?.addEventListener("click",async()=>{const txs=await all("transactions"),accounts=await all("accounts"),name=id=>accounts.find(a=>a.id===id)?.name||"";const rows=[["id","date","type","amount","category","account","toAccount","note"],...txs.map(t=>[t.id,t.date,t.type,t.amount,t.category,name(t.accountId),name(t.toAccountId),t.note])];downloadBlob(new Blob([rows.map(r=>r.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}),`paisaos-transactions-${todayISO()}.csv`);notify("CSV exported");});
    $("#chooseMerge")?.addEventListener("click",()=>$("#mergeFile").click());
    $("#mergeFile")?.addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());await mergeSnapshot(parsed);}catch(err){notify("Merge failed: "+err.message);}e.target.value="";});
    $("#chooseEncryptedMerge")?.addEventListener("click",()=>$("#mergeEncryptedFile").click());
    $("#mergeEncryptedFile")?.addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const pass=$("#mergePass").value;if(!pass)throw new Error("Enter the backup passphrase first");const payload=JSON.parse(await file.text());const parsed=await decryptBackup(payload,pass);await mergeSnapshot(parsed);$("#mergePass").value="";}catch(err){notify("Encrypted merge failed: "+err.message);}e.target.value="";});
    $("#chooseRestore")?.addEventListener("click",()=>$("#restoreFile").click());
    $("#restoreFile")?.addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const parsed=JSON.parse(await file.text());await restoreSnapshot(parsed);}catch(err){notify("Restore failed: "+err.message);}e.target.value="";});
    $("#exportEncrypted")?.addEventListener("click",async()=>{const pass=$("#backupPass").value;if(pass.length<8){notify("Use a passphrase of at least 8 characters");return;}try{const encrypted=await encryptBackup(await snapshot(),pass);downloadJSON(encrypted,`paisaos-encrypted-${todayISO()}.paisaos`);$("#backupPass").value="";notify("Encrypted backup exported");}catch(e){notify("Encryption failed: "+e.message);}});
    $("#chooseEncryptedRestore")?.addEventListener("click",()=>$("#restoreEncryptedFile").click());
    $("#restoreEncryptedFile")?.addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const pass=$("#restorePass").value;if(!pass)throw new Error("Enter the passphrase first");const payload=JSON.parse(await file.text());const parsed=await decryptBackup(payload,pass);await restoreSnapshot(parsed);}catch(err){notify("Encrypted restore failed: "+err.message);}e.target.value="";});
    $("#chooseCSV")?.addEventListener("click",()=>$("#csvFile").click());
    $("#manageLock")?.addEventListener("click",()=>showLockGate("setup"));
    $("#disableLock")?.addEventListener("click",()=>{const config=localStorage.getItem(LOCK_KEY);if(!config){notify("No app PIN is enabled");return;}if(confirm("Disable the app PIN? Your live database remains stored locally, but anyone using this browser profile may open MoneyMatters.")){localStorage.removeItem(LOCK_KEY);localStorage.setItem(SKIP_LOCK_KEY,"1");notify("App PIN disabled");render();}});
    $("#csvFile")?.addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{await importCSV(await file.text());}catch(err){notify("CSV import failed: "+err.message);}e.target.value="";});
  }
  async function encryptBackup(snapshotObj,passphrase) {
    if(!crypto.subtle) throw new Error("Web Crypto requires localhost or HTTPS");
    const enc=new TextEncoder(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const keyMaterial=await crypto.subtle.importKey("raw",enc.encode(passphrase),"PBKDF2",false,["deriveKey"]);
    const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations:250000,hash:"SHA-256"},keyMaterial,{name:"AES-GCM",length:256},false,["encrypt"]);
    const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(JSON.stringify(snapshotObj)));
    const b64=a=>btoa(String.fromCharCode(...a));
    return {app:"PaisaOS",backupFormat:"encrypted-v1",kdf:"PBKDF2-SHA-256",iterations:250000,cipher:"AES-256-GCM",salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(ciphertext)),createdAt:new Date().toISOString()};
  }
  async function decryptBackup(payload,passphrase) {
    if(payload.backupFormat!=="encrypted-v1") throw new Error("Not a MoneyMatters encrypted backup");
    const dec=new TextDecoder(),b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
    const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
    const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:b64(payload.salt),iterations:payload.iterations,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["decrypt"]);
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(payload.iv)},key,b64(payload.ciphertext));
    return JSON.parse(dec.decode(plain));
  }
  function validateSnapshot(obj) {
    if(!obj||obj.app!=="PaisaOS"||![1,2].includes(obj.schemaVersion)||!obj.data) throw new Error("This is not a supported MoneyMatters backup.");
    // v0.3 backups predate the trading journal. Accept them, but they naturally contain no trade history.
    if(!Array.isArray(obj.data.tradeJournal)) obj.data.tradeJournal=[];
    for(const store of STORE_NAMES) if(!Array.isArray(obj.data[store])) throw new Error(`Backup is missing ${store} data.`);
    const uniqueIds = (items,label) => {
      const seen=new Set();
      for(const item of items){if(!item||typeof item.id!=="string"||!item.id.trim())throw new Error(`${label} contains a record without an ID.`);if(seen.has(item.id))throw new Error(`${label} contains duplicate IDs.`);seen.add(item.id);}
      return seen;
    };
    const accountIds=uniqueIds(obj.data.accounts,"Accounts");
    uniqueIds(obj.data.transactions,"Transactions");
    uniqueIds(obj.data.budgets,"Budgets"); uniqueIds(obj.data.goals,"Goals");
    uniqueIds(obj.data.investments,"Investments"); uniqueIds(obj.data.bills,"Bills"); uniqueIds(obj.data.settings,"Settings"); uniqueIds(obj.data.tradeJournal,"Swing trade journal");
    const validDate=d=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(`${d}T12:00:00`));
    for(const a of obj.data.accounts){if(typeof a.name!=="string"||!a.name.trim()||!Number.isFinite(Number(a.openingBalance)))throw new Error("Backup contains an invalid account.");}
    for(const t of obj.data.transactions){
      if(!["income","expense","transfer"].includes(t.type)||!Number.isFinite(Number(t.amount))||Number(t.amount)<=0||!validDate(t.date))throw new Error("Backup contains an invalid transaction amount, type, or date.");
      if(t.type==="transfer"&&(!accountIds.has(t.accountId)||!accountIds.has(t.toAccountId)||t.toAccountId===t.accountId))throw new Error("Backup contains an invalid account transfer.");
      if(t.type!=="transfer"&&t.accountId!=null&&t.accountId!==""&&!accountIds.has(t.accountId))throw new Error("A transaction refers to an account that is missing from this backup.");
    }
    for(const b of obj.data.budgets){if(!b.category||!/^\d{4}-\d{2}$/.test(b.month)||!Number.isFinite(Number(b.limit))||Number(b.limit)<=0)throw new Error("Backup contains an invalid budget.");}
    for(const g of obj.data.goals){if(!g.name||!Number.isFinite(Number(g.target))||Number(g.target)<=0||!Number.isFinite(Number(g.saved))||Number(g.saved)<0)throw new Error("Backup contains an invalid savings goal.");}
    for(const i of obj.data.investments){if(!i.name||!Number.isFinite(Number(i.invested))||Number(i.invested)<0||!Number.isFinite(Number(i.currentValue))||Number(i.currentValue)<0)throw new Error("Backup contains an invalid investment record.");}
    for(const b of obj.data.bills){if(!b.name||!validDate(b.dueDate)||!Number.isFinite(Number(b.amount))||Number(b.amount)<0)throw new Error("Backup contains an invalid bill/reminder.");}
    for(const t of obj.data.tradeJournal){if(!t.symbol||!validDate(t.tradeDate)||!Number.isFinite(Number(t.entryPrice))||Number(t.entryPrice)<=0||!Number.isInteger(Number(t.quantity))||Number(t.quantity)<=0||!['Long','Short'].includes(t.direction)||!['Open','Closed'].includes(t.status))throw new Error("Backup contains an invalid swing trade journal entry.");if(t.status==='Closed'&&(!Number.isFinite(Number(t.exitPrice))||Number(t.exitPrice)<=0))throw new Error("A closed trade is missing a valid exit price.");}
    return true;
  }
  async function restoreSnapshot(obj) {
    validateSnapshot(obj);
    const counts=STORE_NAMES.map(s=>`${s}: ${obj.data[s].length}`).join("\n");
    if(!confirm(`Backup validated. Records to restore:\n${counts}\n\nRestore will replace all current MoneyMatters data on this device. Before replacement, a safety copy of the current data will be downloaded. Continue?`))return;
    // Create a safety export before touching the live database. Restore below is one IndexedDB transaction.
    downloadJSON(await snapshot(),`paisaos-pre-restore-safety-${todayISO()}.json`);
    const tx=db.transaction(STORE_NAMES,"readwrite");
    for(const storeName of STORE_NAMES){const store=tx.objectStore(storeName);store.clear();for(const item of obj.data[storeName])store.put(item);}
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("Restore aborted; existing data should remain unchanged."));});
    notify("Backup restored successfully");navigate("dashboard");
  }
  async function mergeSnapshot(obj) {
    validateSnapshot(obj);
    const current = {};
    for (const store of STORE_NAMES) current[store] = await all(store);
    const planned = {};
    const counts = {};
    const accountIdMap = new Map();
    const normalized = value => String(value || "").trim().toLocaleLowerCase();
    const accountKey = a => {
      const name = normalized(a.name);
      // Accounts are matched by ID only. User-created accounts can share names but be distinct.
      return null;
    };
    const accountById = new Map(current.accounts.map(a => [a.id, a]));
    const accountByNameType = new Map(current.accounts.filter(a => accountKey(a)).map(a => [accountKey(a), a]));
    const finalAccounts = new Map(current.accounts.map(a => [a.id, a]));
    counts.accounts = {added:0,updated:0,unchanged:0};

    // Match user-created accounts by ID. Do not auto-create or merge accounts by default name.
    for (const incoming of obj.data.accounts) {
      const key = accountKey(incoming);
      let target = accountById.get(incoming.id) || (key ? accountByNameType.get(key) : null);
      if (target) {
        accountIdMap.set(incoming.id, target.id);
        const merged = {...target, ...incoming, id:target.id};
        if (JSON.stringify(target) === JSON.stringify(merged)) counts.accounts.unchanged++;
        else counts.accounts.updated++;
        finalAccounts.set(target.id, merged);
      } else {
        accountIdMap.set(incoming.id, incoming.id);
        finalAccounts.set(incoming.id, incoming);
        accountById.set(incoming.id, incoming);
        if (key) accountByNameType.set(key, incoming);
        counts.accounts.added++;
      }
    }
    planned.accounts = [...finalAccounts.values()];

    for (const store of STORE_NAMES.filter(name => name !== "accounts")) {
      const existing = new Map(current[store].map(item => [item.id, item]));
      const merged = new Map(existing);
      counts[store] = {added:0,updated:0,unchanged:0};
      for (const original of obj.data[store]) {
        const item = {...original};
        if (store === "transactions") {
          item.accountId = accountIdMap.get(item.accountId) || item.accountId;
          if (item.toAccountId) item.toAccountId = accountIdMap.get(item.toAccountId) || item.toAccountId;
        }
        const old = existing.get(item.id);
        if (!old) { merged.set(item.id, item); counts[store].added++; }
        else if (JSON.stringify(old) === JSON.stringify(item)) { counts[store].unchanged++; }
        else { merged.set(item.id, item); counts[store].updated++; }
      }
      planned[store] = [...merged.values()];
    }

    const summary = STORE_NAMES.map(store => `${store}: +${counts[store].added} new, ${counts[store].updated} updated, ${counts[store].unchanged} unchanged`).join("\n");
    if (!confirm(`Merge preview from backup dated ${obj.exportedAt || "unknown"}:\n\n${summary}\n\nThis adds missing records and updates records with matching IDs. It does NOT delete records absent from the backup. If the same record was edited on both devices, the imported backup version wins for that record. A private safety JSON copy of this device's current data will be downloaded first. Continue?`)) return;

    // Safety copy before mutation. This is readable JSON; store it privately.
    downloadJSON(await snapshot(), `paisaos-pre-merge-safety-${todayISO()}.json`);
    const tx = db.transaction(STORE_NAMES, "readwrite");
    for (const storeName of STORE_NAMES) {
      const store = tx.objectStore(storeName);
      for (const item of planned[storeName]) store.put(item);
    }
    await new Promise((resolve,reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Merge failed"));
      tx.onabort = () => reject(tx.error || new Error("Merge was aborted; the database transaction did not complete."));
    });
    const totalAdded = STORE_NAMES.reduce((sum, store) => sum + counts[store].added, 0);
    const totalUpdated = STORE_NAMES.reduce((sum, store) => sum + counts[store].updated, 0);
    notify(`Merge complete: ${totalAdded} new, ${totalUpdated} updated. Check balances and reports.`);
    navigate("dashboard");
  }

  async function importCSV(text) {
    const rows=parseCSV(text);if(rows.length<2)throw new Error("CSV has no transaction rows");
    const headers=rows[0].map(h=>h.trim().toLowerCase()),idx=n=>headers.indexOf(n);
    for(const required of ["date","type","amount","category"])if(idx(required)<0)throw new Error(`Missing required column: ${required}`);
    const accounts=await all("accounts"),accountByName=n=>accounts.find(a=>a.name.toLowerCase()===String(n).toLowerCase());
    let count=0,skipped=0;
    for(const row of rows.slice(1)){
      const get=n=>idx(n)>=0?(row[idx(n)]||"").trim():"";
      const type=get("type").toLowerCase(),amount=Number(get("amount")),date=get("date"),category=get("category")||"Other";
      if(!["income","expense","transfer"].includes(type)||!Number.isFinite(amount)||amount<=0||!/^\d{4}-\d{2}-\d{2}$/.test(date)){skipped++;continue;}
      let account=accountByName(get("account"));
      let toAccount=accountByName(get("toaccount"));
      if(type==="transfer"&&(!account||!toAccount||account.id===toAccount.id)){skipped++;continue;}
      const existing= get("id") ? (await all("transactions")).some(t=>t.id===get("id")) : false;
      if(existing){skipped++;continue;}
      await put("transactions",{id:get("id")||uid(),date,type,amount,category,accountId:account?.id||null,toAccountId:toAccount?.id||null,note:get("note"),createdAt:new Date().toISOString()});count++;
    }
    notify(`Imported ${count} transactions${skipped?`; skipped ${skipped}`:""}`);render();
  }
  function navigate(view) { activeView=view; $$(".nav").forEach(n=>n.classList.toggle("active",n.dataset.view===view)); render(); }
  $("#quickAddBtn").addEventListener("click",showTransactionDialog);
  $("#lockBtn").addEventListener("click",()=>{if(localStorage.getItem(LOCK_KEY))showLockGate("unlock");else navigate("backup");});
  $("#closeDialog").addEventListener("click",()=>$("#transactionDialog").close());
  $("#cancelDialog").addEventListener("click",()=>$("#transactionDialog").close());
  $("#txType").addEventListener("change",e=>populateCategoryOptions(e.target.value));
  $("#txCategory").addEventListener("change",()=>{const custom=$("#txCategory").value==="Others (Need To Specify)";$("#customCategoryWrap").hidden=!custom;$("#txCustomCategory").required=custom;if(custom)$("#txCustomCategory").focus();});
  $("#transactionForm").addEventListener("submit",async e=>{
    e.preventDefault();
    const amount=Number($("#txAmount").value),type=$("#txType").value;
    if(!Number.isFinite(amount)||amount<=0){notify("Enter an amount greater than zero");return;}
    if(!["income","expense"].includes(type)){notify("Choose income or expense");return;}
    const selectedCategory=$("#txCategory").value;
    const customCategory=$("#txCustomCategory").value.trim();
    if(selectedCategory==="Others (Need To Specify)"&&!customCategory){notify("Please specify the category");return;}
    const t={id:uid(),type,amount,date:$("#txDate").value,category:selectedCategory==="Others (Need To Specify)"?customCategory:selectedCategory,categoryGroup:selectedCategory==="Others (Need To Specify)"?selectedCategory:selectedCategory,accountId:null,toAccountId:null,note:$("#txNote").value.trim(),createdAt:new Date().toISOString()};
    await put("transactions",t);$("#transactionDialog").close();notify("Transaction saved");render();
  });
  $$(".nav").forEach(n=>n.addEventListener("click",()=>navigate(n.dataset.view)));
  window.addEventListener("resize",()=>{if(activeView==="dashboard")drawCashflow();if(activeView==="reports")loadCashflowData().then(rows=>drawChart($("#reportChart"),rows));});
  window.addEventListener("online",()=>$("#offlineBadge").textContent="Local-first");
  window.addEventListener("offline",()=>$("#offlineBadge").textContent="Offline mode");
  async function init(){
    initializeLockGate();
    try{db=await openDB();await seed();await render();if("serviceWorker" in navigator && location.protocol!=="file:")navigator.serviceWorker.register("./sw.js").catch(()=>{});}
    catch(e){$("#main").innerHTML=`<div class="panel"><h2>Unable to open local database</h2><p>${esc(e.message)}</p><p>Try opening this app through localhost or a supported browser.</p></div>`;}
  }
  init();
})();