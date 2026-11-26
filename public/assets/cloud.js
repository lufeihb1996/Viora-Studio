'use strict';
const cloudClient = window.__vioraSupabaseClient || (window.__vioraSupabaseClient = window.supabase.createClient(window.MOSS_SUPABASE.url, window.MOSS_SUPABASE.key));
let cloudUser = null;
const signedUrlCache = new Map();
const SIGNED_URL_TTL_SEC = 3600;
const SIGNED_URL_REUSE_MS = 45 * 60 * 1000;

async function cloudInit() {
  const { data, error } = await cloudClient.auth.getUser();
  cloudUser = error ? null : data.user;
  showCloudAuth(false);
  return !!cloudUser;
}

function showCloudAuth(forceOpen = false) {
  const modal = document.getElementById('cloudAuth');
  if (modal) {
    const shouldShow = Boolean(forceOpen && !cloudUser);
    modal.classList.toggle('hidden', !shouldShow);
  }
  const email = cloudUser?.email || '';
  const accountEl = document.getElementById('cloudAccount');
  if (accountEl) {
    accountEl.textContent = cloudUser
      ? (email.endsWith('@viora.local.invalid') ? email.split('@')[0] : email)
      : '';
  }
  const signOutBtn = document.getElementById('cloudSignOutBtn');
  if (signOutBtn) signOutBtn.classList.toggle('hidden', !cloudUser);
  const guestBtn = document.getElementById('cloudGuestSignInBtn');
  if (guestBtn) guestBtn.classList.toggle('hidden', !!cloudUser);
  const topGuestBtn = document.getElementById('topGuestSignInBtn');
  if (topGuestBtn) topGuestBtn.classList.toggle('hidden', !!cloudUser);
  const guestBanner = document.getElementById('guestBanner');
  if (guestBanner) guestBanner.classList.toggle('hidden', !!cloudUser);
  if (window.VioraPresence && typeof window.VioraPresence.syncVisibility === 'function') {
    window.VioraPresence.syncVisibility(cloudUser);
  }
}

function closeCloudAuth() {
  const modal = document.getElementById('cloudAuth');
  if (modal) modal.classList.add('hidden');
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
    signedUrlCache.clear();
    document.getElementById('cloudPassword').value = '';
    message.textContent = '';
    showCloudAuth(false);
    if (typeof updateQueueView === 'function') updateQueueView();
    await refreshWorkspaceImages();
  } catch (_) { message.textContent = created ? 'Account created. Please sign in.' : 'Could not connect. Please try again.'; }
  finally { authBusy = false; signInButton.disabled = signUpButton.disabled = false; }
}

async function cloudSignOut() {
  if (typeof inFlightJobs !== 'undefined' && inFlightJobs.length) {
    alert(window.VioraI18n ? window.VioraI18n.text('Wait for active images to finish saving before signing out.') : 'Wait for active images to finish saving before signing out.');
    return;
  }
  const { error } = await cloudClient.auth.signOut();
  if (error) {
    console.error(error);
    alert(window.VioraI18n ? window.VioraI18n.text('Unable to sign out. Please try again.') : 'Unable to sign out. Please try again.');
    return;
  }
  cloudUser = null;
  signedUrlCache.clear();
  if (typeof cachedImages !== 'undefined') cachedImages = [];
  if (typeof selectedImageIds !== 'undefined') selectedImageIds.clear();
  if (typeof batchSelectMode !== 'undefined') batchSelectMode = false;
  if (typeof renderRealFeed === 'function') renderRealFeed([]);
  showCloudAuth(false);
  if (typeof updateQueueView === 'function') updateQueueView();
}

async function resolveSignedUrls(paths) {
  const now = Date.now();
  const result = new Map();
  const missing = [];
  for (const path of paths) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > now) {
      result.set(path, cached.url);
    } else if (!missing.includes(path)) {
      missing.push(path);
    }
  }
  if (!missing.length) return result;

  const bucket = cloudClient.storage.from('moss-images');
  if (typeof bucket.createSignedUrls === 'function') {
    const { data, error } = await bucket.createSignedUrls(missing, SIGNED_URL_TTL_SEC);
    if (error) throw error;
    for (const entry of data || []) {
      if (entry && entry.path && entry.signedUrl) {
        signedUrlCache.set(entry.path, { url: entry.signedUrl, expiresAt: now + SIGNED_URL_REUSE_MS });
        result.set(entry.path, entry.signedUrl);
      }
    }
    return result;
  }

  await Promise.all(missing.map(async path => {
    const { data: signed, error: signingError } = await bucket.createSignedUrl(path, SIGNED_URL_TTL_SEC);
    if (signingError) throw signingError;
    signedUrlCache.set(path, { url: signed.signedUrl, expiresAt: now + SIGNED_URL_REUSE_MS });
    result.set(path, signed.signedUrl);
  }));
  return result;
}

async function cloudList() {
  if (!cloudUser) return [];
  const { data, error } = await cloudClient.from('moss_images').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  if (!data || !data.length) return [];
  const urlMap = await resolveSignedUrls(data.map(row => row.storage_path));
  return data.map(row => ({ ...row, media_url: urlMap.get(row.storage_path) || '' }));
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
  signedUrlCache.delete(storagePath);
  const rawElapsed = Number(item.elapsed) > 0 ? Number(item.elapsed) : Number(job.elapsed);
  const elapsed = Number.isFinite(rawElapsed) && rawElapsed > 0 ? Number(rawElapsed.toFixed(1)) : null;
  const row = { user_id: cloudUser.id, prompt_id: job.prompt_id, storage_path: storagePath, prompt: job.prompt, aspect_ratio: job.aspect_ratio, width: job.width, height: job.height, steps: job.steps, cfg: job.cfg, seed: job.seed, elapsed };
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
  signedUrlCache.delete(data.storage_path);
}

async function cloudBatchDelete(ids) {
  const cleanIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!cleanIds.length) return 0;
  const { data, error } = await cloudClient.from('moss_images').select('id, storage_path').in('id', cleanIds);
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return 0;
  const { error: deleteError } = await cloudClient.from('moss_images').delete().in('id', rows.map(r => r.id));
  if (deleteError) throw deleteError;
  const paths = rows.map(r => r.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await cloudClient.storage.from('moss-images').remove(paths);
    if (storageError) throw storageError;
    paths.forEach(p => signedUrlCache.delete(p));
  }
  return rows.length;
}

async function cloudClearAll() {
  if (!cloudUser) return 0;
  let totalDeleted = 0;
  while (true) {
    const { data, error } = await cloudClient
      .from('moss_images')
      .select('id, storage_path')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    const rows = data || [];
    if (!rows.length) break;
    const { error: deleteError } = await cloudClient.from('moss_images').delete().in('id', rows.map(r => r.id));
    if (deleteError) throw deleteError;
    const paths = rows.map(r => r.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await cloudClient.storage.from('moss-images').remove(paths);
      if (storageError) throw storageError;
      paths.forEach(p => signedUrlCache.delete(p));
    }
    totalDeleted += rows.length;
    if (rows.length < 100) break;
  }
  signedUrlCache.clear();
  return totalDeleted;
}
