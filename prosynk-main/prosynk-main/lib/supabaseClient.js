//import { createClient } from "@supabase/supabase-js";

//const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
//const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

//export const supabase = createClient(supabaseUrl, supabaseKey);

// content of lib/supabaseClient.js

//import { createBrowserClient } from '@supabase/ssr'

//export function createClient() {
//  return createBrowserClient(
//    process.env.NEXT_PUBLIC_SUPABASE_URL,
//    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
//  )
//}
// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

