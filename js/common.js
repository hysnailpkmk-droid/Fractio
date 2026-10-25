// Shared helpers for student app and teacher dashboard
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

function toEmail(input) {
  const v = String(input || "").trim().toLowerCase();
  if (v.includes("@")) return v;
  return v.replace(/[^a-z0-9._-]/g, "") + "@" + CONFIG.STUDENT_EMAIL_DOMAIN;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function getSessionUser() {
  const { data } = await sb.auth.getSession();
  return data.session ? data.session.user : null;
}

async function getProfile(userId) {
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

// Fetch every row of a table (Supabase returns max 1000 rows per request)
async function fetchAll(table, orderCol = "id") {
  const pageSize = 1000;
  let from = 0, all = [];
  for (;;) {
    const { data, error } = await sb.from(table).select("*").order(orderCol, { ascending: true }).range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
