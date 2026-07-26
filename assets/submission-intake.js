/* Soul Cafe Project Indlela Portal Submission Intake Client
 * Version: SC-05
 * Requires window.SOUL_CAFE_SUBMISSION_CONFIG = { endpoint: 'https://script.google.com/.../exec' }
 * Does not update compliance/readiness state. It only submits intake data for review.
 */
(function(){
  const TOPICS = [
    'CLUB DETAILS','NPC / CIPC EVIDENCE','RESPONSIBLE PERSON','RESPONSIBLE PERSON APPOINTMENT',
    'FOUNDER / MANAGER DETAILS','PHYSICAL AREA / ADDRESS','PREMISES EVIDENCE','STORAGE LOCATION',
    'SECURITY ARRANGEMENT','EMERGENCY CONTACT','CONSTITUTION ADOPTION','MEMBERSHIP / MEMBER ONBOARDING',
    'BITOU SUPPLY INTERFACE','LEAP HERE CONFIGURATION','OTHER SOUL CAFE EVIDENCE'
  ];
  const EXT_OK = ['pdf','docx','xlsx','jpg','jpeg','png'];
  const MAX_FILES = 5;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const cfg = window.SOUL_CAFE_SUBMISSION_CONFIG || {};
  const endpoint = cfg.endpoint || '';
  let lastTrigger = {};

  function qs(sel, root=document){ return root.querySelector(sel); }
  function esc(s){ return String(s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function topicFromButton(btn){
    const t = (btn && btn.dataset && btn.dataset.topic) ? btn.dataset.topic : 'OTHER SOUL CAFE EVIDENCE';
    const map = [
      [/npc|cipc/i,'NPC / CIPC EVIDENCE','SC-CMP-004','A. CLUB IDENTITY AND ENTITY'],
      [/responsible person/i,'RESPONSIBLE PERSON','SC-CMP-007','B. GOVERNANCE'],
      [/constitution/i,'CONSTITUTION ADOPTION','SC-CMP-011','B. GOVERNANCE'],
      [/premises|physical|address/i,'PHYSICAL AREA / ADDRESS','SC-CMP-005','K. PREMISES'],
      [/storage/i,'STORAGE LOCATION','SC-CMP-037','F. STORAGE / STOCK'],
      [/security/i,'SECURITY ARRANGEMENT','SC-CMP-038','F. STORAGE / STOCK'],
      [/supply|bitou/i,'BITOU SUPPLY INTERFACE','SC-CMP-030','E. SUPPLY / RECEIPT'],
      [/leap/i,'LEAP HERE CONFIGURATION','SC-CMP-050','H. LEAP HERE / DIGITAL RECORDS'],
      [/membership/i,'MEMBERSHIP / MEMBER ONBOARDING','SC-CMP-014','C. MEMBERSHIP']
    ];
    for (const [re, topic, control, area] of map){ if(re.test(t)) return {topic, control_id:control, area}; }
    return {topic: TOPICS.includes(t) ? t : 'OTHER SOUL CAFE EVIDENCE', control_id:'', area:''};
  }

  function ensureModal(){
    let m = qs('#sc05SubmitModal');
    if(m) return m;
    m = document.createElement('div');
    m.id = 'sc05SubmitModal';
    m.className = 'modal';
    m.innerHTML = `<div class="modal-box" style="max-width:760px">
      <h3>Submit Information / Evidence</h3>
      <p class="sub">Submissions go to private Project Indlela intake for review. They do not change readiness or compliance status until reviewed and verified.</p>
      <form id="sc05Form">
        <input type="text" name="website" autocomplete="off" tabindex="-1" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true">
        <input type="hidden" name="participant_id" value="PI-CLUB-002">
        <input type="hidden" name="control_id" id="sc05ControlId">
        <input type="hidden" name="area" id="sc05Area">
        <label>Submission Topic<br><select name="topic" id="sc05Topic" required>${TOPICS.map(t=>`<option>${esc(t)}</option>`).join('')}</select></label>
        <label>Related Requirement / Control<br><input id="sc05ControlDisplay" readonly></label>
        <label>Your Name<br><input name="submitted_by_name" required maxlength="120"></label>
        <label>Your Role / Relationship to Soul Cafe<br><input name="submitted_by_role" required maxlength="120"></label>
        <label>Email or Contact Number<br><input name="contact" required maxlength="160"></label>
        <label>Information / Comment<br><textarea name="information" required maxlength="10000" rows="5"></textarea></label>
        <label>Optional evidence upload<br><input name="files" type="file" multiple accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png"></label>
        <p class="sub">Allowed: PDF, DOCX, XLSX, JPG, JPEG, PNG. Max ${MAX_FILES} files, 10 MB each. Do not upload executable files.</p>
        <div id="sc05Status" class="note" style="display:none"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
          <button class="button" type="submit">SUBMIT FOR REVIEW</button>
          <button class="button" type="button" id="sc05Close">CLOSE</button>
          <button class="button" type="button" id="sc05Another" style="display:none">SUBMIT ANOTHER ITEM</button>
        </div>
      </form>
      <iframe name="sc05SubmissionFrame" id="sc05SubmissionFrame" style="display:none"></iframe>
    </div>`;
    document.body.appendChild(m);
    qs('#sc05Close',m).addEventListener('click', closeModal);
    qs('#sc05Another',m).addEventListener('click', () => { qs('#sc05Form',m).reset(); setStatus('', false); qs('#sc05Another',m).style.display='none'; prefill(lastTrigger); });
    qs('#sc05Form',m).addEventListener('submit', submitForm);
    window.addEventListener('message', receiveResult);
    return m;
  }

  function setStatus(html, show=true, bad=false){ const s=qs('#sc05Status'); if(!s) return; s.style.display=show?'block':'none'; s.innerHTML=html; s.style.borderColor=bad?'#efc2bd':'#e4d6c3'; }
  function openModal(trigger){ lastTrigger = trigger || {}; const m=ensureModal(); m.classList.add('open'); prefill(lastTrigger); }
  function closeModal(){ const m=qs('#sc05SubmitModal'); if(m) m.classList.remove('open'); }
  function prefill(trigger){ const t=topicFromButton(trigger); qs('#sc05Topic').value=t.topic; qs('#sc05ControlId').value=t.control_id; qs('#sc05Area').value=t.area; qs('#sc05ControlDisplay').value=[t.control_id,t.area].filter(Boolean).join(' — ') || 'Not linked'; }

  async function submitForm(ev){
    ev.preventDefault();
    if(!endpoint || endpoint.indexOf('script.google.com') === -1){ setStatus('<b>SUBMISSION NOT COMPLETED</b><br>Submission endpoint is not configured yet.', true, true); return; }
    const form=ev.target;
    if(form.website && form.website.value){ setStatus('<b>SUBMISSION NOT COMPLETED</b><br>Submission rejected.', true, true); return; }
    try{
      setStatus('Preparing submission…');
      const files = await readFiles(form.files.files);
      const payload = {
        participant_id: form.participant_id.value,
        honeypot: form.website.value,
        topic: form.topic.value,
        control_id: form.control_id.value,
        area: form.area.value,
        submitted_by_name: form.submitted_by_name.value,
        submitted_by_role: form.submitted_by_role.value,
        contact: form.contact.value,
        information: form.information.value,
        files
      };
      postViaIframe(payload);
    }catch(err){ setStatus('<b>SUBMISSION NOT COMPLETED</b><br>'+esc(err.message), true, true); }
  }

  function readFiles(fileList){
    const files = Array.from(fileList || []);
    if(files.length > MAX_FILES) return Promise.reject(new Error('Too many files. Maximum '+MAX_FILES+'.'));
    return Promise.all(files.map(f => new Promise((resolve,reject)=>{
      const ext=(f.name.split('.').pop()||'').toLowerCase();
      if(!EXT_OK.includes(ext)) return reject(new Error('File type not allowed: '+ext));
      if(f.size > MAX_FILE_BYTES) return reject(new Error('File is too large: '+f.name));
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Could not read file: '+f.name));
      reader.onload=()=>resolve({name:f.name,mimeType:f.type || 'application/octet-stream',size:f.size,data:reader.result});
      reader.readAsDataURL(f);
    })));
  }

  function postViaIframe(payload){
    const form=document.createElement('form');
    form.method='POST'; form.action=endpoint; form.target='sc05SubmissionFrame'; form.style.display='none';
    const input=document.createElement('textarea'); input.name='payload'; input.value=JSON.stringify(payload); form.appendChild(input);
    document.body.appendChild(form); form.submit(); form.remove();
    setStatus('Submitting to Project Indlela intake…');
  }

  function receiveResult(event){
    const data=event.data || {};
    if(typeof data !== 'object' || (!('success' in data) && !data.submission_id)) return;
    if(data.success){
      setStatus(`<b>SUBMISSION RECEIVED</b><br>Reference: <b>${esc(data.submission_id)}</b><br>Status: <b>${esc(data.status)}</b><br>Thank you. Your submission has been received for controlled Project Indlela review. Submission does not change Soul Cafe's readiness or compliance status until it has been reviewed and verified.`);
      const another=qs('#sc05Another'); if(another) another.style.display='inline-block';
    } else {
      setStatus(`<b>SUBMISSION NOT COMPLETED</b><br>${esc(data.message || 'Please check the form and try again.')}`, true, true);
    }
  }

  document.addEventListener('click', function(ev){
    const btn=ev.target.closest && ev.target.closest('.mock-action');
    if(!btn) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    openModal(btn);
  }, true);
})();
