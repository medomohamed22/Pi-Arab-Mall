const SUPABASE_URL = 'https://xncapmzlwuisupkjlftb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zPECXAiI_bDbeLtRYe3vIw_IEt_p_AS';
let sb=null, adminSession=null, allProducts=[], allUsers=[], allReports=[];

function el(id){return document.getElementById(id)}
function escapeHtml(value){return String(value??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])).replace(/'/g,'&#39;')}
function toast(msg){const t=el('toast');t.textContent=msg;t.classList.remove('hidden');setTimeout(()=>t.classList.add('hidden'),3500)}
function imgOf(p){return (Array.isArray(p.images)&&p.images[0])||p.image_url||'https://placehold.co/300x300/f1f5f9/94a3b8?text=No+Image'}
function statusLabel(s){return {pending:'بانتظار المراجعة',active:'منشور',rejected:'مرفوض',banned:'محظور'}[s||'pending']||s}
function money(p){const usd=Number(p.price_usd??p.price??0);return usd?`$${usd.toLocaleString('en-US',{maximumFractionDigits:2})}`:'-' }

async function waitForSupabaseSdk(){for(let i=0;i<50;i++){if(window.supabase&&window.supabase.createClient)return true;await new Promise(r=>setTimeout(r,100))}return false}
async function init(){await waitForSupabaseSdk();sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});el('adminLoginBtn').onclick=loginAdmin;el('adminLogoutBtn').onclick=logoutAdmin;const {data}=await sb.auth.getSession();if(data?.session){adminSession=data.session;await enterDashboard()}}

async function loginAdmin(){
  const email=el('adminEmail').value.trim();
  const password=el('adminPassword').value;
  if(!email||!password)return toast('اكتب البريد وكلمة المرور');
  el('adminLoginBtn').disabled=true;
  try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;adminSession=data.session;await enterDashboard()}catch(e){console.error(e);toast(e.message||'فشل تسجيل الدخول')}finally{el('adminLoginBtn').disabled=false}
}
async function logoutAdmin(){await sb.auth.signOut();adminSession=null;allProducts=[];allUsers=[];allReports=[];el('dashboard').classList.add('hidden');el('accessPanel').classList.remove('hidden');el('adminLogoutBtn').classList.add('hidden')}
async function enterDashboard(){el('accessPanel').classList.add('hidden');el('dashboard').classList.remove('hidden');el('adminLogoutBtn').classList.remove('hidden');await loadAdminData()}

async function adminApi(action,payload={}){const token=adminSession?.access_token;if(!token)throw new Error('جلسة الأدمن غير موجودة');const res=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},body:JSON.stringify({action,...payload})});const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||'Admin API failed');return json}

async function loadAdminData(){try{const data=await adminApi('list');allProducts=data.products||[];allUsers=data.users||[];allReports=data.reports||[];renderStats();renderAllTabs()}catch(e){console.error(e);toast(e.message||'تعذر تحميل بيانات الإدارة');if(String(e.message).includes('Not allowed'))await logoutAdmin()}}
function renderStats(){el('pendingCount').textContent=allProducts.filter(p=>(p.status||'pending')==='pending').length;el('activeCount').textContent=allProducts.filter(p=>p.status==='active').length;el('rejectedCount').textContent=allProducts.filter(p=>p.status==='rejected').length;el('bannedCount').textContent=allUsers.filter(u=>u.is_banned).length}
function switchTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));el('tab-'+name).classList.remove('hidden')}
function renderAllTabs(){renderProductsTab('pending',allProducts.filter(p=>(p.status||'pending')==='pending'));renderProductsTab('all',allProducts);renderUsers();renderReports()}
function renderProductsTab(tab,products){const box=el('tab-'+tab);if(!products.length){box.innerHTML='<div class="empty">لا توجد عناصر</div>';return}box.innerHTML=products.map(productCard).join('')}
function productCard(p){const status=p.status||'pending';return `<article class="admin-card"><img src="${escapeHtml(imgOf(p))}" onerror="this.src='https://placehold.co/300x300/f1f5f9/94a3b8?text=No+Image'"><div><h3 class="card-title">${escapeHtml(p.name||'بدون عنوان')}</h3><div class="meta"><span class="status ${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span><span>${escapeHtml(money(p))}</span><span>${escapeHtml(p.country||'')}</span><span>${escapeHtml(p.location||'')}</span><span>${escapeHtml(p.seller_username||p.seller_pi_id||'')}</span></div><p class="desc">${escapeHtml(p.description||'')}</p></div><div class="card-actions"><button class="success-btn" onclick="setProductStatus(${Number(p.id)},'active')"><i class="fa-solid fa-check"></i> موافقة</button><button class="warning-btn" onclick="setProductStatus(${Number(p.id)},'rejected')"><i class="fa-solid fa-ban"></i> رفض</button><button class="danger-btn" onclick="deleteProductAdmin(${Number(p.id)})"><i class="fa-solid fa-trash"></i> حذف</button><button class="ghost-btn" onclick="banUser('${escapeHtml(p.seller_pi_id||'')}')"><i class="fa-solid fa-user-slash"></i> حظر البائع</button></div></article>`}
async function setProductStatus(id,status){try{await adminApi('productStatus',{productId:id,status});toast(status==='active'?'تم نشر الإعلان':'تم رفض الإعلان');await loadAdminData()}catch(e){toast(e.message)}}
async function deleteProductAdmin(id){if(!confirm('حذف الإعلان نهائيًا؟'))return;try{await adminApi('deleteProduct',{productId:id});toast('تم حذف الإعلان');await loadAdminData()}catch(e){toast(e.message)}}
function renderUsers(){const box=el('tab-users');if(!allUsers.length){box.innerHTML='<div class="empty">لا توجد بيانات مستخدمين</div>';return}box.innerHTML=allUsers.map(u=>`<div class="user-row"><div><b>${escapeHtml(u.username||u.email||'User')}</b><div class="meta"><span>${escapeHtml(u.pi_id||u.id||'')}</span><span class="status ${u.is_banned?'banned':'active'}">${u.is_banned?'محظور':'نشط'}</span></div></div><div class="admin-actions"><button class="${u.is_banned?'success-btn':'danger-btn'}" onclick="setUserBan('${escapeHtml(u.pi_id||'')}',${u.is_banned?'false':'true'})">${u.is_banned?'فك الحظر':'حظر'}</button></div></div>`).join('')}
async function banUser(piId){if(!piId)return toast('لا يوجد معرف مستخدم');if(!confirm('حظر هذا المستخدم؟'))return;await setUserBan(piId,true)}
async function setUserBan(piId,isBanned){try{await adminApi('setUserBan',{piId,isBanned});toast(isBanned?'تم حظر الحساب':'تم فك الحظر');await loadAdminData()}catch(e){toast(e.message)}}
function renderReports(){const box=el('tab-reports');if(!allReports.length){box.innerHTML='<div class="empty">لا توجد بلاغات</div>';return}box.innerHTML=allReports.map(r=>`<article class="admin-card"><div style="width:110px;height:110px;display:grid;place-items:center;background:#FEF3C7;border-radius:10px;color:#92400E"><i class="fa-solid fa-flag" style="font-size:34px"></i></div><div><h3 class="card-title">بلاغ #${Number(r.id)}</h3><div class="meta"><span>إعلان: ${escapeHtml(r.product_id||'')}</span><span>المبلغ: ${escapeHtml(r.reporter_pi_id||'')}</span><span class="status ${escapeHtml(r.status||'pending')}">${escapeHtml(r.status||'open')}</span></div><p class="desc">${escapeHtml(r.reason||'')}</p></div><div class="card-actions"><button class="success-btn" onclick="setReportStatus(${Number(r.id)},'reviewed')">تمت المراجعة</button>${r.product_id?`<button class="warning-btn" onclick="setProductStatus(${Number(r.product_id)},'rejected')">رفض الإعلان</button>`:''}</div></article>`).join('')}
async function setReportStatus(id,status){try{await adminApi('reportStatus',{reportId:id,status});toast('تم تحديث البلاغ');await loadAdminData()}catch(e){toast(e.message)}}

document.addEventListener('DOMContentLoaded',init);
