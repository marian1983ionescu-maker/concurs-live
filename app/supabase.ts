import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://jokekmdkusonsoobjrtd.supabase.co";

const supabaseKey = "sb_publishable_Wd65QOXz9ZGHvI-v3Aq0XA_NDVdjEKU";

export const supabase = createClient(supabaseUrl, supabaseKey);