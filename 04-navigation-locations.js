const BOT_USERNAME = "dealway_notify_bot";
const SUPABASE_URL = "https://xncapmzlwuisupkjlftb.supabase.co";
const SUPABASE_KEY = "sb_publishable_zPECXAiI_bDbeLtRYe3vIw_IEt_p_AS";
const API_BASE = "/api";
const ADSENSE_CLIENT = "ca-pub-4850325570689614";
const ADSENSE_SLOT = "2711865760";
const ADSENSE_LAYOUT_KEY = "-fb+5w+4e-db+86";
let sb, user=null, activeChat=null, currentLang=localStorage.getItem('lang')||'ar', selectedFiles=[], currentPromoteProductId=null, piUsdPrice=null, piPriceLastUpdated=null, isSupabaseReady=false, globalProducts=[], activeCategory='all', telegramCheckTimer=null, activeChatChannel=null;

