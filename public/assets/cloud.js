'use strict';
const cloudClient = window.supabase.createClient(window.MOSS_SUPABASE.url, window.MOSS_SUPABASE.key);
let cloudUser = null;

async function cloudInit() {
  const { data, error } = await cloudClient.auth.getUser();
  cloudUser = error ? null : data.user;
  showCloudAuth();
  return !!cloudUser;
}
function showCloudAuth() {
  document.getElementById('cloudAuth').classList.toggle('hidden', !!cloudUser);
  const email = cloudUser?.email || '';
  document.getElementById('cloudAccount').textContent = email.endsWith('@viora.local.invalid') ? email.split('@')[0] : email;
}
let authBusy = false;
async function cloudSignIn(signUp) {
  if (authBusy) return;
  const input = document.getElementById('cloudUsername').value.trim().toLowerCase();
  const password = document.getElementById('cloudPassword').value;
  const message = document.getElementById('cloudAuthMessage');
  const isLegacyEmail = !signUp && input.includes('@');
  if (!isLegacyEmail && !/^[a-z0-9_]{3,24}$/.test(input)) {
    message.textContent = 'Username: 3–24 letters, numbers, or underscores.'; return;
  }
  if (!password || (signUp && (password.length < 8 || password.length > 72))) {
    message.textContent = signUp ? 'Password must be 8–72 characters.' : 'Enter your password.'; return;
  }
  authBusy = true;
  const signInButton = document.getElementById('cloudSignInBtn');
  const signUpButton = document.getElementById('cloudSignUpBtn');
  signInButton.disabled = signUpButton.disabled = true;
  message.textContent = 'Please wait...';
  let created = false;
  try {
    if (signUp) {
      const { error } = await cloudClient.functions.invoke('viora-signup', { body: { username: input, password } });
      if (error) {
        let detail = '';
        try { detail = (await error.context.json()).error || ''; } catch (_) {}
        message.textContent = detail || 'Could not create account. Please try again.';
        return;
      }
      created = true;
    }
    const email = isLegacyEmail ? input : `${input}@viora.local.invalid`;
    const { data, error } = await cloudClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      message.textContent = created ? 'Account created. Please sign in with your username and password.' : 'Incorrect username or password.';
      return;
    }
    cloudUser = data.user;
    document.getElementById('cloudPassword').value = '';
    message.textContent = '';
    showCloudAuth();
    if (typeof updateQueueView === "function") updateQueueView();
    await refreshWorkspaceImages();
  } catch (_) { message.textContent = created ? 'Account created. Please sign in.' : 'Could not connect. Please try again.'; }
  finally { authBusy = false; signInButton.disabled = signUpButton.disabled = false; }
}
async function cloudSignOut() {
  if (inFlightJobs.length) { alert(window.VioraI18n ? window.VioraI18n.text('Wait for active images to finish saving before signing out.') : 'Wait for active images to finish saving before signing out.'); return; }
  const { error } = await cloudClient.auth.signOut();
  if (error) { console.error(error); alert(window.VioraI18n ? window.VioraI18n.text('Unable to sign out. Please try again.') : 'Unable to sign out. Please try again.'); return; }
  cloudUser = null;
  cachedImages = [];
  renderRealFeed([]);
  showCloudAuth();
  if (typeof updateQueueView === "function") updateQueueView();
}
async function cloudList() {
  if (!cloudUser) return [];
  const { data, error } = await cloudClient.from('moss_images').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return await Promise.all(data.map(async row => {
    const { data: signed, error: signingError } = await cloudClient.storage.from('moss-images').createSignedUrl(row.storage_path, 3600);
    if (signingError) throw signingError;
    return { ...row, media_url: signed.signedUrl };
  }));
}
async function cloudSave(job, item) {
  if (!cloudUser) throw new Error('Please sign in again to save your image.');
  const response = await fetch(item.media_url);
  if (!response.ok) throw new Error('Unable to retrieve the generated image.');
  const blob = await response.blob();
  if (!blob.size) throw new Error('The generated image is empty.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(job.prompt_id));
  const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
  const storagePath = `${cloudUser.id}/${hash}.png`;
  const { error: uploadError } = await cloudClient.storage.from('moss-images').upload(storagePath, blob, { contentType: 'image/png', upsert: true });
  if (uploadError) throw uploadError;
  const row = { user_id: cloudUser.id, prompt_id: job.prompt_id, storage_path: storagePath, prompt: job.prompt, aspect_ratio: job.aspect_ratio, width: job.width, height: job.height, steps: job.steps, cfg: job.cfg, seed: job.seed, elapsed: item.elapsed || null };
  const { error } = await cloudClient.from('moss_images').upsert(row, { onConflict: 'user_id,prompt_id' });
  if (error) throw error;
}
async function cloudDelete(id) {
  const { data, error } = await cloudClient.from('moss_images').select('storage_path').eq('id', id).single();
  if (error) throw error;
  const { error: deleteError } = await cloudClient.from('moss_images').delete().eq('id', id);
  if (deleteError) throw deleteError;
  const { error: storageError } = await cloudClient.storage.from('moss-images').remove([data.storage_path]);
  if (storageError) throw storageError;
}
