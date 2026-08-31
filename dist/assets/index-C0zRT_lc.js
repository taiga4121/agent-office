(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))s(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const a of r.addedNodes)a.tagName==="LINK"&&a.rel==="modulepreload"&&s(a)}).observe(document,{childList:!0,subtree:!0});function i(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function s(n){if(n.ep)return;n.ep=!0;const r=i(n);fetch(n.href,r)}})();const L={idle:"🧑‍💼",working:"💻",waiting:"🧑‍💻",error:"⚠️"},E={idle:"Idle",working:"Working",waiting:"Waiting",error:"Error"},j="agent-office-project-visibility";let o=[],v=!1,d=null,p={};async function I(){try{const e=await fetch("./projects.json");if(!e.ok)throw new Error("Failed to load project list");const t=await e.json();return Array.isArray(t)?t:t.projects||[]}catch{return[]}}function k(e){try{const t=localStorage.getItem(j);if(!t)return e.map(s=>({...s,visible:s.visible??!0}));const i=JSON.parse(t);return e.map(s=>({...s,visible:i[s.id]??s.visible??!0}))}catch{return e.map(i=>({...i,visible:i.visible??!0}))}}function A(){const e=Object.fromEntries(o.map(t=>[t.id,t.visible!==!1]));localStorage.setItem(j,JSON.stringify(e))}function $(e,t){return e?e.mainAgent&&e.mainAgent.id===t?e.mainAgent:(e.subAgents||[]).find(i=>i.id===t)||null:null}function M(e,t,i,s){const n=o.find(a=>a.id===e);if(!n)return;const r=$(n,t);r&&(r.status=i,r.activity=s,f())}function x(e,t){const i=o.find(n=>n.id===e);if(!i)return;const s=$(i,t);s&&setTimeout(()=>{(s.status==="working"||s.status==="waiting")&&(s.status="idle",s.activity="Ready for the next task",f())},4200)}function B(e){const t=e.mainAgent||{id:"main-agent",name:"Main Agent",role:"Main Agent",status:"idle",activity:"Ready for task"},i=e.subAgents||[],s=[i[0],i[1]].filter(Boolean),n=[i[2]||i[0]||t].filter(Boolean),r=[{agent:s[0]||t,x:18,y:52,role:"left"},{agent:s[1]||i[0]||t,x:58,y:52,role:"right"},{agent:n[0]||t,x:50,y:74,role:"center"}],a=({agent:c,x:m,y:g,role:u})=>`
    <div class="world-object world-agent world-agent--${u}" data-status="${c.status}" style="left:${m}%; top:${g}%">
      <div class="desk-unit" aria-hidden="true">
        <span class="desk-surface">💻</span>
      </div>
      <div class="agent-avatar-world">${L[c.status]}</div>
      <div class="agent-tag">
        <span>${c.name}</span>
        <small>${E[c.status]}</small>
      </div>
    </div>
  `;return`
    <section class="project-room ${d===e.id?"is-selected":""}" data-project-id="${e.id}" aria-label="${e.name} project room">
      <div class="room-header is-visible">
        <div class="room-title-wrap">
          <span class="room-title-icon">💻</span>
          <h2>${e.name}</h2>
        </div>
      </div>

      <div class="room-world" aria-label="${e.name} room world">
        <div class="room-wall" aria-hidden="true"></div>
        <div class="room-floor" aria-hidden="true">
          <div class="furniture-layer">
            <div class="furniture-item furniture-item--left">📚</div>
            <div class="furniture-item furniture-item--right">📋</div>
            <div class="furniture-item furniture-item--plant left">🌱</div>
            <div class="furniture-item furniture-item--plant right">🌱</div>
          </div>
          ${r.map(a).join("")}
        </div>
      </div>
    </section>
  `}function h(){const e=document.getElementById("project-list-panel");if(!e)return;const t=o.map(i=>`
    <label class="project-list-item ${i.visible===!1?"is-hidden":""}">
      <span class="project-list-name">${i.icon} ${i.name}</span>
      <span class="project-list-state">${i.visible===!1?"非表示":"表示中"}</span>
      <input type="checkbox" data-project-id="${i.id}" ${i.visible!==!1?"checked":""}>
    </label>
  `).join("");e.innerHTML=`
    <h3>プロジェクト一覧</h3>
    <div class="project-list-items">${t}</div>
  `,e.classList.toggle("hidden",!v),e.querySelectorAll("input[data-project-id]").forEach(i=>{i.addEventListener("change",s=>{var a;const n=s.target.dataset.projectId,r=o.find(l=>l.id===n);r&&(r.visible=s.target.checked,A(),!r.visible&&d===n&&(d=((a=o.find(l=>l.visible!==!1))==null?void 0:a.id)||null),f(),h())})})}function w(e){if(!p[e]){const t=o.find(s=>s.id===e),i=(t==null?void 0:t.name)||"Project";p[e]=[{role:"assistant",text:`${i} の部屋が開きました。指示を入力してください。`}]}return p[e]}function P(){const e=document.getElementById("chat-panel");if(!e)return;const t=o.find(a=>a.id===d)||o[0];if(!t){e.innerHTML="";return}const s=w(t.id).map(a=>`
    <div class="chat-message ${a.role==="user"?"is-user":"is-assistant"}">
      <span class="chat-bubble">${a.text}</span>
    </div>
  `).join("");e.innerHTML=`
    <div class="chat-header">
      <div class="chat-header-title">
        <span class="chat-header-icon">💬</span>
        <span>${t.name}</span>
      </div>
    </div>
    <div class="chat-body">
      ${s}
    </div>
    <div class="chat-composer">
      <textarea id="chat-input" rows="3" placeholder="${t.name} に指示を入力..."></textarea>
      <button id="chat-send-button" type="button" data-project-id="${t.id}">送信</button>
    </div>
  `;const n=document.getElementById("chat-input"),r=document.getElementById("chat-send-button");n&&n.addEventListener("keydown",a=>{var l;(a.metaKey||a.ctrlKey)&&a.key==="Enter"&&y(t.id,((l=t.mainAgent)==null?void 0:l.id)||null,n)}),r&&r.addEventListener("click",()=>{var a;y(t.id,((a=t.mainAgent)==null?void 0:a.id)||null,n)})}function f(){const e=document.getElementById("app"),t=o.filter(i=>i.visible!==!1);t.length<=1?e.className="office-layout project-count-1":t.length<=4?e.className="office-layout project-count-2":e.className="office-layout project-count-3",t.length?(e.innerHTML=t.map(B).join(""),document.querySelectorAll(".project-room").forEach(i=>{i.addEventListener("click",()=>{d=i.dataset.projectId,f()})})):e.innerHTML=`
      <section class="project-room empty-state">
        <div class="room-header">
          <h2>📭 表示中のプロジェクトなし</h2>
        </div>
        <p class="empty-state-text">表示したいプロジェクトのチェックをオンにしてください。</p>
      </section>
    `,h(),P()}function y(e=null,t=null,i=null){var g;const s=o.find(u=>u.id===e)||o[0],n=s?s.id:null,r=i||document.getElementById("chat-input");if(!r||!n)return;const a=r.value.trim();if(!a){r.focus();return}const l=o.find(u=>u.id===n),c=t||((g=l==null?void 0:l.mainAgent)==null?void 0:g.id)||null;if(!l||!c){r.focus();return}const m=w(n);m.push({role:"user",text:a}),M(n,c,"working",a),x(n,c),m.push({role:"assistant",text:`${l.name} に対して「${a}」を受け取りました。`}),P(),r.value=""}async function S(){var i;const e=await I();o=e.length?k(e):[{id:"no-projects-found",name:"No Projects Found",icon:"📁",visible:!0,mainAgent:{id:"main-agent",name:"Main Agent",role:"Main Agent",status:"idle",activity:"Waiting for project folders"},subAgents:[]}],d=((i=o.find(s=>s.visible!==!1))==null?void 0:i.id)||null,A(),f()}S();const b=document.getElementById("project-list-button");b&&b.addEventListener("click",()=>{v=!v,h()});
