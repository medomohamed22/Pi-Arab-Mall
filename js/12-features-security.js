let favoriteIds = new Set(JSON.parse(localStorage.getItem('dealway_favorites') || '[]'));

function saveLocalFavorites(){localStorage.setItem('dealway_favorites', JSON.stringify([...favoriteIds]))}
function getProductCondition(p){return p.condition || p.product_condition || 'used'}
function conditionLabel(value){const map={new:t('condition_new'),used:t('condition_used'),negotiable:t('condition_negotiable')};return map[value]||map.used}
function getProductPriceUsdForFilter(p){const v=getProductUsdPrice(p);return Number.isFinite(v)?v:0}
function rateLimit(key,limit,windowMs){const now=Date.now();const raw=JSON.parse(localStorage.getItem(key)||'[]').filter(ts=>now-ts<windowMs);if(raw.length>=limit)return false;raw.push(now);localStorage.setItem(key,JSON.stringify(raw));return true}
function validateImageFiles(files){const valid=[];for(const file of files){if(!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)){showToast('invalid_image_type','warning');continue}if(file.size>5*1024*1024){showToast('image_too_large','warning');continue}valid.push(file)}return valid}

function ensureFeatureControls(){
  const search=document.querySelector('.search-container');
  if(search&&!el('minPriceFilter')){
    search.insertAdjacentHTML('beforeend',`<input id="minPriceFilter" type="number" class="filter-select" placeholder="${escapeAttr(t('min_price'))}" oninput="filterProducts()"><input id="maxPriceFilter" type="number" class="filter-select" placeholder="${escapeAttr(t('max_price'))}" oninput="filterProducts()"><select id="sortFilter" class="filter-select" onchange="filterProducts()"><option value="latest">${escapeHtml(t('sort_latest'))}</option><option value="price_asc">${escapeHtml(t('sort_price_asc'))}</option><option value="price_desc">${escapeHtml(t('sort_price_desc'))}</option><option value="views_desc">${escapeHtml(t('sort_views_desc'))}</option></select>`);
  }
  const modalSheet=document.querySelector('#addModal .sheet');
  if(modalSheet&&!el('addCondition')){
    const priceGroup=el('addPrice')?.closest('.form-group');
    priceGroup?.insertAdjacentHTML('afterend',`<div class="form-group"><label class="form-label"><i class="fa-solid fa-circle-info"></i><span data-i18n="label_condition">${escapeHtml(t('label_condition'))}</span></label><select id="addCondition" class="input-box"><option value="used">${escapeHtml(t('condition_used'))}</option><option value="new">${escapeHtml(t('condition_new'))}</option><option value="negotiable">${escapeHtml(t('condition_negotiable'))}</option></select></div>`);
  }
  const profileLinks=document.querySelector('#profile-user .links-list');
  if(profileLinks&&!el('favoritesLink')){
    profileLinks.insertAdjacentHTML('afterbegin',`<button id="favoritesLink" class="link-item" type="button" onclick="showFavoritesView()"><i class="fa-solid fa-heart"></i><span>${escapeHtml(t('favorites'))}</span><i class="fa-solid fa-chevron-left"></i></button>`);
    profileLinks.insertAdjacentHTML('beforeend',`<button id="adminLink" class="link-item" type="button" onclick="showAdminPanel()"><i class="fa-solid fa-user-shield"></i><span>${escapeHtml(t('admin_panel'))}</span><i class="fa-solid fa-chevron-left"></i></button>`);
  }
}

function sortFilteredProducts(products){
  const sort=el('sortFilter')?.value||'latest';
  return [...products].sort((a,b)=>{if(sort==='price_asc')return getProductPriceUsdForFilter(a)-getProductPriceUsdForFilter(b);if(sort==='price_desc')return getProductPriceUsdForFilter(b)-getProductPriceUsdForFilter(a);if(sort==='views_desc')return (b.views||0)-(a.views||0);return sortProductsByPromotion(a,b)})
}

window.renderProducts=function renderProducts(){
  ensureFeatureControls();
  const list=el('products-list');if(!list)return;list.innerHTML='';
  const st=(el('searchInput')?.value||'').toLowerCase(),cf=el('countryFilter')?.value||'all',sf=el('stateFilter')?.value||'all';
  const min=Number(el('minPriceFilter')?.value||0),max=Number(el('maxPriceFilter')?.value||0);
  let filtered=globalProducts.filter(p=>{const usd=getProductPriceUsdForFilter(p);if(activeCategory!=='all'&&p.category!==activeCategory)return false;if(st&&!String(p.name||'').toLowerCase().includes(st))return false;if(cf!=='all'&&p.country!==cf)return false;if(sf!=='all'&&p.location!==sf)return false;if(min&&usd<min)return false;if(max&&usd>max)return false;return true});
  filtered=sortFilteredProducts(filtered);
  if(!filtered.length){list.innerHTML=`<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon"><i class="fa-solid fa-box-open"></i></div><h3>${escapeHtml(t('no_products'))}</h3></div>`;return}
  const now=new Date();
  filtered.forEach((p,i)=>{let img='https://placehold.co/400x400/f1f5f9/94a3b8?text=No+Image';if(p.images&&Array.isArray(p.images)&&p.images.length>0)img=p.images[0];else if(p.image_url)img=p.image_url;const isPromoted=p.promoted_until&&new Date(p.promoted_until)>now;const locText=`${p.country||''} - ${p.location||''}`;const fav=favoriteIds.has(String(p.id));list.innerHTML+=`<div class="card ${isPromoted?'promoted':''}" onclick="openProductDetails(${Number(p.id)})">${isPromoted?`<div class="promo-badge"><i class="fa-solid fa-crown"></i> ${escapeHtml(t('promoted_badge'))}</div>`:''}<button class="favorite-btn ${fav?'active':''}" onclick="event.stopPropagation();toggleFavorite(${Number(p.id)})"><i class="fa-${fav?'solid':'regular'} fa-heart"></i></button><div class="card-img-wrap"><img src="${escapeAttr(img)}" class="card-img" loading="lazy" onerror="this.src='https://placehold.co/400x400/f1f5f9/94a3b8?text=No+Image'"><div class="location-tag"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(locText)}</div></div><div class="card-body"><h4 class="card-title">${escapeHtml(p.name)}</h4><div class="price-pill">${renderProductPrice(p)}</div><div class="condition-pill">${escapeHtml(conditionLabel(getProductCondition(p)))}</div><div class="card-desc">${escapeHtml(p.description||'')}</div></div></div>`;if((i+1)%6===0)list.innerHTML+=renderAdBanner()});pushAdsenseAds();
}

async function toggleFavorite(pid){if(favoriteIds.has(String(pid)))favoriteIds.delete(String(pid));else favoriteIds.add(String(pid));saveLocalFavorites();renderProducts();const p=globalProducts.find(x=>String(x.id)===String(pid));if(p&&el('view-details')&&!el('view-details').classList.contains('hidden'))renderDetailFeatureActions(pid)}
async function showFavoritesView(){document.querySelectorAll('.view-section').forEach(e=>e.classList.add('hidden'));el('view-home').classList.remove('hidden');document.querySelectorAll('.nav-item').forEach(e=>e.classList.remove('active'));const favs=globalProducts.filter(p=>favoriteIds.has(String(p.id)));safeSetHtml('cat-filters',`<button class="btn btn-ghost" onclick="closeFavoritesView()"><i class="fa-solid fa-arrow-right"></i> ${escapeHtml(t('btn_back'))}</button>`);if(!favs.length)return safeSetHtml('products-list',`<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon"><i class="fa-solid fa-heart"></i></div><h3>${escapeHtml(t('no_favorites'))}</h3></div>`);const previous=globalProducts;globalProducts=favs;activeCategory='all';renderProducts();globalProducts=previous}
function closeFavoritesView(){initCategories();activeCategory='all';renderProducts();document.querySelectorAll('.nav-item')[0]?.classList.add('active')}

const baseOpenProductDetails=window.openProductDetails;
window.openProductDetails=async function(pid){await baseOpenProductDetails(pid);renderDetailFeatureActions(pid)}
function renderDetailFeatureActions(pid){const p=globalProducts.find(x=>String(x.id)===String(pid));if(!p)return;document.querySelector('#detail-actions .feature-actions')?.remove();const actions=el('detail-actions');if(!actions)return;const fav=favoriteIds.has(String(pid));const extra=document.createElement('div');extra.className='feature-actions';extra.innerHTML=`<button class="btn btn-ghost" onclick="toggleFavorite(${Number(pid)})"><i class="fa-${fav?'solid':'regular'} fa-heart"></i> ${escapeHtml(fav?t('remove_favorite'):t('add_favorite'))}</button><button class="btn btn-ghost" onclick="shareProduct(${Number(pid)})"><i class="fa-solid fa-share-nodes"></i> ${escapeHtml(t('share'))}</button><button class="btn btn-ghost" onclick="openSellerProfile('${escapeAttr(p.seller_pi_id)}')"><i class="fa-solid fa-store"></i> ${escapeHtml(t('seller_profile'))}</button>`;actions.prepend(extra)}
async function shareProduct(pid){const url=`${location.origin}${location.pathname}?product=${pid}`;try{if(navigator.share)await navigator.share({title:'Deal Way',url});else{await navigator.clipboard.writeText(url);showToast('link_copied','success')}}catch(e){console.warn(e)}}
async function openSellerProfile(sellerId){const ads=globalProducts.filter(p=>p.seller_pi_id===sellerId);const seller=ads[0]?.seller_username||'Seller';alert(`${t('seller_profile')}\n${seller}\n${t('my_ads')}: ${ads.length}`)}
function showAdminPanel(){window.location.href='admin.html'}

const baseHandleFileSelect=window.handleFileSelect;
window.handleFileSelect=function(input){if(input.files){const files=validateImageFiles(Array.from(input.files));if(selectedFiles.length+files.length>3){showToast('toast_max_images','error');input.value='';return}selectedFiles=[...selectedFiles,...files];updateImagePreviews()}input.value=''}
const baseSendMsg=window.sendMsg;
window.sendMsg=async function(){if(!rateLimit('dealway_message_rate',20,60*1000))return showToast('rate_limited','warning');return baseSendMsg()}

function applyFeatureTranslations(){if(translations.ar){Object.assign(translations.ar,{favorites:'المفضلة',no_favorites:'لا توجد إعلانات مفضلة',add_favorite:'إضافة للمفضلة',remove_favorite:'إزالة من المفضلة',share:'مشاركة',seller_profile:'ملف البائع',admin_panel:'لوحة الإدارة',link_copied:'تم نسخ الرابط',min_price:'أقل سعر $',max_price:'أعلى سعر $',sort_latest:'الأحدث',sort_price_asc:'السعر من الأقل',sort_price_desc:'السعر من الأعلى',sort_views_desc:'الأكثر مشاهدة',label_condition:'حالة المنتج',condition_new:'جديد',condition_used:'مستعمل',condition_negotiable:'قابل للتفاوض',invalid_image_type:'نوع الصورة غير مدعوم',image_too_large:'حجم الصورة كبير جدًا',rate_limited:'انتظر قليلًا قبل تكرار العملية'})}if(translations.en){Object.assign(translations.en,{favorites:'Favorites',no_favorites:'No favorite ads yet',add_favorite:'Add to favorites',remove_favorite:'Remove favorite',share:'Share',seller_profile:'Seller profile',admin_panel:'Admin panel',link_copied:'Link copied',min_price:'Min price $',max_price:'Max price $',sort_latest:'Latest',sort_price_asc:'Lowest price',sort_price_desc:'Highest price',sort_views_desc:'Most viewed',label_condition:'Item condition',condition_new:'New',condition_used:'Used',condition_negotiable:'Negotiable',invalid_image_type:'Unsupported image type',image_too_large:'Image is too large',rate_limited:'Please wait before repeating this action'})}}
const baseUpdateLanguage=window.updateLanguage;
window.updateLanguage=function(){applyFeatureTranslations();baseUpdateLanguage();ensureFeatureControls()}
document.addEventListener('DOMContentLoaded',()=>{applyFeatureTranslations();ensureFeatureControls();setTimeout(()=>{ensureFeatureControls();renderProducts()},300)});
