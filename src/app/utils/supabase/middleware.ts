
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const createClient = (request: NextRequest) => {
  // Create an unmodified response
  const supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
  const supabase = createSupabaseClient(supabaseUrl!, supabaseKey!);

  // Return both the supabase client and the response so callers can operate on the DB and still return the response
  return { supabase, response: supabaseResponse }
};
