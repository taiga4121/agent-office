(function(){const i=document.createElement("link").relList;if(i&&i.supports&&i.supports("modulepreload"))return;for(const s of document.querySelectorAll('link[rel="modulepreload"]'))n(s);new MutationObserver(s=>{for(const a of s)if(a.type==="childList")for(const r of a.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&n(r)}).observe(document,{childList:!0,subtree:!0});function e(s){const a={};return s.integrity&&(a.integrity=s.integrity),s.referrerPolicy&&(a.referrerPolicy=s.referrerPolicy),s.crossOrigin==="use-credentials"?a.credentials="include":s.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function n(s){if(s.ep)return;s.ep=!0;const a=e(s);fetch(s.href,a)}})();const A={idle:"☕",working:"💻",waiting:"⏳",error:"⚠️"},g={idle:"Idle",working:"Working",waiting:"Waiting",error:"Error"},h="agent-office-project-visibility";let o=[],u=!1;async function I(){try{const t=await fetch("./projects.json");if(!t.ok)throw new Error("Failed to load project list");const i=await t.json();return Array.isArray(i)?i:i.projects||[]}catch{return[]}}function k(t){try{const i=localStorage.getItem(h);if(!i)return t.map(n=>({...n,visible:n.visible??!0}));const e=JSON.parse(i);return t.map(n=>({...n,visible:e[n.id]??n.visible??!0}))}catch{return t.map(e=>({...e,visible:e.visible??!0}))}}function f(){const t=Object.fromEntries(o.map(i=>[i.id,i.visible!==!1]));localStorage.setItem(h,JSON.stringify(t))}function $(t,i){return t?t.mainAgent&&t.mainAgent.id===i?t.mainAgent:(t.subAgents||[]).find(e=>e.id===i)||null:null}function L(t,i,e,n){const s=o.find(r=>r.id===t);if(!s)return;const a=$(s,i);a&&(a.status=e,a.activity=n,l())}function w(t,i){const e=o.find(s=>s.id===t);if(!e)return;const n=$(e,i);n&&setTimeout(()=>{(n.status==="working"||n.status==="waiting")&&(n.status="idle",n.activity="Ready for the next task",l())},4200)}function v(t,i=!1){return`
    <article class="agent-card ${i?"is-main":""}" data-status="${t.status}">
      <div class="agent-top">
        <span class="agent-role">${t.role}</span>
        <span class="agent-status">${g[t.status]}</span>
      </div>
      <div class="agent-avatar" aria-label="${t.name} ${g[t.status]}">${A[t.status]}</div>
      <h3 class="agent-name">${t.name}</h3>
      ${i?'<div class="main-badge">Main Agent</div>':'<div class="sub-badge">Sub Agent</div>'}
      <p class="agent-activity">${t.activity}</p>
    </article>
  `}function E(t){const i=t.mainAgent||{id:"main-agent",name:"Main Agent",role:"Main Agent",status:"idle",activity:"Ready for task"},e=t.subAgents||[];return`
    <section class="project-room" aria-label="${t.name} project room">
      <div class="room-header">
        <h2>${t.icon} ${t.name}</h2>
        <div class="room-controls">
          <label class="visibility-toggle">
            <input type="checkbox" data-project-id="${t.id}" ${t.visible!==!1?"checked":""}>
            <span>${t.visible!==!1?"表示":"非表示"}</span>
          </label>
          <span class="room-icon" aria-hidden="true">🗂️</span>
        </div>
      </div>
      <div class="agent-grid">
        ${v(i,!0)}
        ${e.map(n=>v(n,!1)).join("")}
      </div>

      <div class="project-command-panel" data-project-id="${t.id}">
        <label class="project-command-label" for="task-input-${t.id}">${t.name} のメインエージェントに指示</label>
        <textarea id="task-input-${t.id}" rows="2" placeholder="${t.name} に指示を入力... 例: ログイン機能を実装して"></textarea>
        <button type="button" data-project-id="${t.id}" data-agent-id="${i.id}" class="project-send-task">送信</button>
      </div>
    </section>
  `}function d(){const t=document.getElementById("project-list-panel");if(!t)return;const i=o.map(e=>`
    <label class="project-list-item ${e.visible===!1?"is-hidden":""}">
      <span class="project-list-name">${e.icon} ${e.name}</span>
      <span class="project-list-state">${e.visible===!1?"非表示":"表示中"}</span>
      <input type="checkbox" data-project-id="${e.id}" ${e.visible!==!1?"checked":""}>
    </label>
  `).join("");t.innerHTML=`
    <h3>プロジェクト一覧</h3>
    <div class="project-list-items">${i}</div>
  `,t.classList.toggle("hidden",!u),t.querySelectorAll("input[data-project-id]").forEach(e=>{e.addEventListener("change",n=>{const s=n.target.dataset.projectId,a=o.find(r=>r.id===s);a&&(a.visible=n.target.checked,f(),l(),d())})})}function l(){const t=document.getElementById("app"),i=o.filter(e=>e.visible!==!1);i.length?(t.innerHTML=i.map(E).join(""),document.querySelectorAll(".project-send-task").forEach(e=>{e.addEventListener("click",()=>y(e.dataset.projectId,e.dataset.agentId))}),document.querySelectorAll(".project-command-panel textarea").forEach(e=>{e.addEventListener("keydown",n=>{var s,a;if((n.metaKey||n.ctrlKey)&&n.key==="Enter"){const r=(s=e.closest(".project-command-panel"))==null?void 0:s.dataset.projectId,c=(a=document.querySelector(`button[data-project-id="${r}"]`))==null?void 0:a.dataset.agentId;y(r,c,e)}})}),document.querySelectorAll(".visibility-toggle input").forEach(e=>{e.addEventListener("change",n=>{const s=n.target.dataset.projectId,a=o.find(r=>r.id===s);a&&(a.visible=n.target.checked,f(),l(),d())})})):t.innerHTML=`
      <section class="project-room empty-state">
        <div class="room-header">
          <h2>📭 表示中のプロジェクトなし</h2>
        </div>
        <p class="empty-state-text">表示したいプロジェクトのチェックをオンにしてください。</p>
      </section>
    `,d()}function y(t=null,i=null,e=null){var m,p;const n=t||((m=document.querySelector(".project-command-panel"))==null?void 0:m.dataset.projectId)||null,s=e||document.querySelector(`textarea#task-input-${n}`);if(!s)return;const a=s.value.trim();if(!a||!n){s.focus();return}const r=o.find(j=>j.id===n),c=i||((p=r==null?void 0:r.mainAgent)==null?void 0:p.id)||null;if(!r||!c){s.focus();return}L(n,c,"working",a),w(n,c),s.value="",s.focus()}async function P(){const t=await I();o=t.length?k(t):[{id:"no-projects-found",name:"No Projects Found",icon:"📁",visible:!0,mainAgent:{id:"main-agent",name:"Main Agent",role:"Main Agent",status:"idle",activity:"Waiting for project folders"},subAgents:[]}],f(),l()}P();const b=document.getElementById("project-list-button");b&&b.addEventListener("click",()=>{u=!u,d()});
