(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))s(n);new MutationObserver(n=>{for(const o of n)if(o.type==="childList")for(const l of o.addedNodes)l.tagName==="LINK"&&l.rel==="modulepreload"&&s(l)}).observe(document,{childList:!0,subtree:!0});function i(n){const o={};return n.integrity&&(o.integrity=n.integrity),n.referrerPolicy&&(o.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?o.credentials="include":n.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function s(n){if(n.ep)return;n.ep=!0;const o=i(n);fetch(n.href,o)}})();const H={idle:"🧑‍💼",working:"💻",waiting:"🧑‍💻",error:"⚠️"},J={idle:"Idle",working:"Working",waiting:"Waiting",error:"Error"},C="agent-office-project-visibility",M="agent-office-chat-history";let c=[],$=!1,v=null,p={},f={},g=null;async function K(){try{const t=await fetch("./projects.json");if(!t.ok)throw new Error("Failed to load project list");const e=await t.json();return Array.isArray(e)?e:e.projects||[]}catch{return[]}}function W(t){try{const e=localStorage.getItem(C);if(!e)return t.map(s=>({...s,visible:s.visible??!0}));const i=JSON.parse(e);return t.map(s=>({...s,visible:i[s.id]??s.visible??!0}))}catch{return t.map(i=>({...i,visible:i.visible??!0}))}}function O(){const t=Object.fromEntries(c.map(e=>[e.id,e.visible!==!1]));localStorage.setItem(C,JSON.stringify(t))}function T(t,e){return t?t.mainAgent&&t.mainAgent.id===e?t.mainAgent:(t.subAgents||[]).find(i=>i.id===e)||null:null}function A(t,e,i,s){const n=c.find(l=>l.id===t);if(!n)return;const o=T(n,e);o&&(o.status=i,o.activity=s,y())}function x(t,e){const i=c.find(n=>n.id===t);if(!i)return;const s=T(i,e);s&&setTimeout(()=>{(s.status==="working"||s.status==="waiting")&&(s.status="idle",s.activity="Ready for the next task",y())},4200)}function R(t){const e=t.mainAgent||{id:"main-agent",name:"Main Agent",role:"Main Agent",status:"idle",activity:"Ready for task"},i=Array.isArray(t.subAgents)?t.subAgents:[],s=[e,...i],n=[{x:18,y:42,role:"left"},{x:50,y:42,role:"center"},{x:82,y:42,role:"right"},{x:28,y:70,role:"left"},{x:50,y:70,role:"center"},{x:72,y:70,role:"right"},{x:18,y:86,role:"left"},{x:50,y:86,role:"center"},{x:82,y:86,role:"right"}],o=s.slice(0,n.length).map((a,d)=>({agent:a,x:n[d].x,y:n[d].y,role:n[d].role})),l=({agent:a,x:d,y:m,role:b})=>`
    <div class="world-object world-agent world-agent--${b}" data-status="${a.status}" style="left:${d}%; top:${m}%">
      <div class="desk-unit" aria-hidden="true">
        <span class="desk-surface">💻</span>
      </div>
      <div class="agent-avatar-world">${H[a.status]}</div>
      <div class="agent-tag">
        <span>${a.name}</span>
        <small>${J[a.status]}</small>
      </div>
    </div>
  `;return`
    <section class="project-room ${v===t.id?"is-selected":""}" data-project-id="${t.id}" aria-label="${t.name} project room">
      <div class="room-header is-visible">
        <div class="room-title-wrap">
          <span class="room-title-icon">💻</span>
          <h2>${t.name}</h2>
        </div>
      </div>

      <div class="room-world" aria-label="${t.name} room world">
        <div class="room-wall" aria-hidden="true"></div>
        <div class="room-floor" aria-hidden="true">
          <div class="furniture-layer">
            <div class="furniture-item furniture-item--left">📚</div>
            <div class="furniture-item furniture-item--right">📋</div>
            <div class="furniture-item furniture-item--plant left">🌱</div>
            <div class="furniture-item furniture-item--plant right">🌱</div>
          </div>
          ${o.map(l).join("")}
        </div>
      </div>
    </section>
  `}function P(){const t=document.getElementById("project-list-panel");if(!t)return;const e=c.map(i=>`
    <label class="project-list-item ${i.visible===!1?"is-hidden":""}">
      <span class="project-list-name">${i.icon} ${i.name}</span>
      <span class="project-list-state">${i.visible===!1?"非表示":"表示中"}</span>
      <input type="checkbox" data-project-id="${i.id}" ${i.visible!==!1?"checked":""}>
    </label>
  `).join("");t.innerHTML=`
    <h3>プロジェクト一覧</h3>
    <div class="project-list-items">${e}</div>
  `,t.classList.toggle("hidden",!$),t.querySelectorAll("input[data-project-id]").forEach(i=>{i.addEventListener("change",s=>{var l;const n=s.target.dataset.projectId,o=c.find(u=>u.id===n);o&&(o.visible=s.target.checked,O(),!o.visible&&v===n&&(v=((l=c.find(u=>u.visible!==!1))==null?void 0:l.id)||null),y(),P())})})}function N(){localStorage.setItem(M,JSON.stringify(f))}function V(){try{const t=localStorage.getItem(M);if(!t)return{};const e=JSON.parse(t);return e&&typeof e=="object"?e:{}}catch{return{}}}function q(t){return`${t}-session-${Date.now()}-${Math.random().toString(16).slice(2,8)}`}function w(t){const e=Array.isArray(f[t])?f[t]:[],i=[...new Set(e.map(n=>n==null?void 0:n.sessionId).filter(n=>typeof n=="string"&&n.length>0))];if(i.length)return i;const s=q(t);return f[t]=[],p[t]=s,[s]}function k(t){const e=w(t);return(!p[t]||!e.includes(p[t]))&&(p[t]=e[0]),p[t]}function z(t,e){w(t).includes(e)&&(p[t]=e,h())}function D(t){const e=q(t);return p[t]=e,e}function F(t,e=null){const i=e||k(t),s=Array.isArray(f[t])?f[t]:[],n=s.some(o=>typeof(o==null?void 0:o.sessionId)=="string"&&o.sessionId.length>0);return s.filter(o=>!o||typeof o.text!="string"?!1:o.sessionId===i||!o.sessionId?!0:!n)}function S(t,e){f[t]||(f[t]=[]),f[t].push(e),N()}function j(t){return String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;")}function h(){const t=document.getElementById("chat-panel");if(!t)return;const e=c.find(r=>r.id===v)||c[0];if(!e){t.innerHTML="";return}const i=k(e.id),s=F(e.id,i),n=w(e.id).map(r=>`
    <button
      type="button"
      class="chat-session-button ${r===i?"is-active":""}"
      data-session-id="${r}"
      aria-pressed="${r===i}"
    >
      ${r===i?"現在の会話":`会話 ${r.slice(-2)}`}
    </button>
  `).join(""),o=s.length?s.map(r=>`
    <div class="chat-message ${r.role==="user"?"is-user":"is-assistant"}">
      <span class="chat-bubble">${j(r.text)}</span>
    </div>
  `).join(""):`
    <div class="chat-empty-state">履歴なし</div>
  `,l=window.__agentOfficeThinkingForProject===e.id?`
    <div class="chat-message is-assistant is-thinking">
      <span class="chat-bubble chat-bubble--thinking">
        <span class="thinking-dots" aria-label="考え中"><span></span><span></span><span></span></span>
        Claude Code が考えています...
      </span>
    </div>
  `:"",u=g&&g.projectId===e.id?`
    <div class="permission-dialog" role="dialog" aria-modal="true" aria-label="Claude Code approval dialog">
      <div class="permission-dialog__header">
        <span class="permission-dialog__icon">⚠️</span>
        <span>Agent 実行許可</span>
      </div>
      <p class="permission-dialog__text">エージェントが次の操作を実行しようとしています。許可しますか?</p>
      <div class="permission-dialog__body">
        <div class="permission-dialog__label">許可対象</div>
        <div class="permission-dialog__action">${j(g.actionLabel||"ファイル編集とコマンド実行")}</div>
      </div>
      <div class="permission-dialog__actions">
        <button type="button" class="permission-dialog__button permission-dialog__button--secondary" data-permission="deny">拒否</button>
        <button type="button" class="permission-dialog__button permission-dialog__button--primary" data-permission="allow">許可</button>
      </div>
    </div>
  `:"";t.innerHTML=`
    <div class="chat-header">
      <div class="chat-header-title">
        <span class="chat-header-icon">💬</span>
        <span>${e.name}</span>
      </div>
      <span class="chat-status-badge">Local Claude</span>
    </div>
    <div class="chat-session-switcher">
      <div class="chat-session-buttons">${n}</div>
      <button type="button" class="chat-new-session-button" data-new-session="${e.id}">+ 新規セッション</button>
    </div>
    ${u}
    <div class="chat-body">
      ${o}
      ${l}
    </div>
    <div class="chat-composer">
      <textarea id="chat-input" rows="3" placeholder="${e.name} に指示を入力..."></textarea>
      <button id="chat-send-button" type="button" data-project-id="${e.id}" ${window.__agentOfficeThinkingForProject===e.id?"disabled":""}>${window.__agentOfficeThinkingForProject===e.id?"考え中":"送信"}</button>
    </div>
  `;const a=document.getElementById("chat-input"),d=document.getElementById("chat-send-button"),m=t.querySelectorAll(".chat-session-button[data-session-id]"),b=t.querySelector(".chat-new-session-button[data-new-session]"),_=t.querySelector('[data-permission="allow"]'),E=t.querySelector('[data-permission="deny"]');m.forEach(r=>{r.addEventListener("click",()=>{z(e.id,r.dataset.sessionId)})}),b&&b.addEventListener("click",()=>{const r=D(e.id);p[e.id]=r,h()}),_&&_.addEventListener("click",()=>{U()}),E&&E.addEventListener("click",()=>{g=null,h()}),a&&a.addEventListener("keydown",r=>{var L;(r.metaKey||r.ctrlKey)&&r.key==="Enter"&&I(e.id,((L=e.mainAgent)==null?void 0:L.id)||null,a)}),d&&d.addEventListener("click",()=>{var r;I(e.id,((r=e.mainAgent)==null?void 0:r.id)||null,a)})}function y(){const t=document.getElementById("app"),e=c.filter(i=>i.visible!==!1);e.length<=1?t.className="office-layout project-count-1":e.length<=4?t.className="office-layout project-count-2":t.className="office-layout project-count-3",e.length?(t.innerHTML=e.map(R).join(""),document.querySelectorAll(".project-room").forEach(i=>{i.addEventListener("click",()=>{v=i.dataset.projectId,y()})})):t.innerHTML=`
      <section class="project-room empty-state">
        <div class="room-header">
          <h2>📭 表示中のプロジェクトなし</h2>
        </div>
        <p class="empty-state-text">表示したいプロジェクトのチェックをオンにしてください。</p>
      </section>
    `,P(),h()}async function G(t,e=[],i=null){const s=await fetch("http://localhost:3001/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:t,history:e,sessionId:i})}),n=await s.json();if(!s.ok||!n.ok)throw new Error(n.error||"Claude Code への接続に失敗しました。");return n.response||"Claude Code から応答がありませんでした。"}function Q(t,e,i){var u;const s=c.find(a=>a.id===t),n=i||((u=s==null?void 0:s.mainAgent)==null?void 0:u.id)||null;if(!s||!n)return;const o=k(t);S(t,{role:"user",text:e,sessionId:o}),A(t,n,"working",e),x(t,n),window.__agentOfficeThinkingForProject=t,h();const l=document.getElementById("chat-send-button");l&&(l.disabled=!0,l.textContent="考え中"),G(e,F(t,o),o).then(a=>{S(t,{role:"assistant",text:a,sessionId:o}),A(t,n,"idle","Claude Code responded"),x(t,n)}).catch(a=>{S(t,{role:"assistant",text:`Claude Code との接続に失敗しました: ${a.message}`,sessionId:o}),A(t,n,"error",a.message)}).finally(()=>{g=null,delete window.__agentOfficeThinkingForProject,h();const a=document.getElementById("chat-input");a&&(a.value="");const d=document.getElementById("chat-send-button");d&&(d.disabled=!1,d.textContent="送信")})}function U(){if(!g)return;const{projectId:t,task:e,agentId:i}=g;g=null,Q(t,e,i)}async function I(t=null,e=null,i=null){var d;const s=c.find(m=>m.id===t)||c[0],n=s?s.id:null,o=i||document.getElementById("chat-input");if(!o||!n)return;const l=o.value.trim();if(!l){o.focus();return}const u=c.find(m=>m.id===n);if(!u){o.focus();return}const a=/修正|編集|変更|リファクタ|fix|update|write|delete|test|実行|run|npm|yarn|pnpm|git/i.test(l)?"ファイル編集とコマンド実行を行う":"コードの確認と提案を行う";g={projectId:n,task:l,actionLabel:a,agentId:e||((d=u.mainAgent)==null?void 0:d.id)||null},h()}async function X(){var i;const t=await K();c=t.length?W(t):[{id:"no-projects-found",name:"No Projects Found",icon:"📁",visible:!0,mainAgent:{id:"main-agent",name:"Main Agent",role:"Main Agent",status:"idle",activity:"Waiting for project folders"},subAgents:[]}],f=V(),c.forEach(s=>{f[s.id]||(f[s.id]=[]),p[s.id]||(p[s.id]=w(s.id)[0])}),N(),v=((i=c.find(s=>s.visible!==!1))==null?void 0:i.id)||null,O(),y()}X();const B=document.getElementById("project-list-button");B&&B.addEventListener("click",()=>{$=!$,P()});
