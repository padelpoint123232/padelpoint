
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://wdycggjnhuezyrwufgzd.supabase.co";

const SUPABASE_KEY = "sb_publishable_nj_LRUzuV3oCyndSwfwVvg_QbVj44cW";

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);
