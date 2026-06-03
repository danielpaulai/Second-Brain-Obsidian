import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv(path = ".env.local") {
  try {
    const text = readFileSync(path, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Environment variables may already be provided by the shell or deployment runtime.
  }
}

loadEnv();

const email = process.argv[2] || process.env.OWNER_EMAIL;
const password = process.argv[3] || process.env.OWNER_PASSWORD;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey || !email || !password) {
  console.error(
    "Usage: node scripts/ensure-owner-user.mjs <email> <password>\n" +
      "Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicAuth = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail(targetEmail) {
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === targetEmail.toLowerCase()
    );
    if (user) return user;
    if (data.users.length < 100) return null;
    page += 1;
  }
}

const existing = await findUserByEmail(email);
const metadata = { role: "owner" };
const ownerEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();

if (ownerEmail && ownerEmail !== email.toLowerCase()) {
  throw new Error(`OWNER_EMAIL is ${process.env.OWNER_EMAIL}, not ${email}`);
}

const { data, error } = existing
  ? await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      app_metadata: { ...(existing.app_metadata || {}), ...metadata },
      user_metadata: { ...(existing.user_metadata || {}), full_name: "Danny" },
    })
  : await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: { full_name: "Danny" },
    });

if (error) throw error;

const user = data.user;
const { error: profileError } = await supabase.from("profiles").upsert({
  id: user.id,
  email,
  full_name: "Danny",
  role: "owner",
});

if (profileError) throw profileError;

const { data: profile, error: profileReadError } = await supabase
  .from("profiles")
  .select("id,email,role")
  .eq("id", user.id)
  .single();

if (profileReadError) throw profileReadError;
if (profile.role !== "owner") {
  throw new Error(`Profile role is ${profile.role}, expected owner`);
}
if (user.app_metadata?.role !== "owner") {
  throw new Error(`Auth app_metadata.role is ${user.app_metadata?.role}, expected owner`);
}
if (ownerEmail !== email.toLowerCase()) {
  throw new Error("OWNER_EMAIL must match the signed-in owner email for app owner access");
}

const { data: signInData, error: signInError } = await publicAuth.auth.signInWithPassword({
  email,
  password,
});

if (signInError) throw signInError;

const signedInEmail = signInData.user?.email?.toLowerCase();
if (signedInEmail !== email.toLowerCase()) {
  throw new Error(`Password verification signed in unexpected user: ${signedInEmail}`);
}

await publicAuth.auth.signOut();

console.log(`${existing ? "Updated" : "Created"} owner user ${email} (${user.id})`);
console.log("Verified password sign-in with Supabase Auth.");
console.log("Verified OWNER_EMAIL, auth metadata, and profile role all grant owner access.");
