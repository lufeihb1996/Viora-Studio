(() => {
  'use strict';

  const CHANNEL_NAME = 'viora_live_presence';
  const VISITOR_STORAGE_KEY = 'viora_visitor_id';
  let onlineCount = 1;
  let channel = null;
  let reconnectTimer = null;

  function getSharedSupabaseClient() {
    if (window.__vioraSupabaseClient) return window.__vioraSupabaseClient;
    if (!window.supabase || !window.MOSS_SUPABASE || !window.MOSS_SUPABASE.url || !window.MOSS_SUPABASE.key) {
      return null;
    }
    window.__vioraSupabaseClient = window.supabase.createClient(
      window.MOSS_SUPABASE.url,
      window.MOSS_SUPABASE.key
    );
    return window.__vioraSupabaseClient;
  }

  function getVisitorId() {
    try {
      let existing = localStorage.getItem(VISITOR_STORAGE_KEY);
      if (existing && /^[a-z0-9_-]{8,64}$/i.test(existing)) return existing;
      existing = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        ? crypto.randomUUID()
        : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(VISITOR_STORAGE_KEY, existing);
      return existing;
    } catch (_) {
      return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    }
  }

  function formatOnlineText(count) {
    const zh = !window.VioraI18n || window.VioraI18n.language !== 'en';
    return zh ? `${count} 人在线` : `${count} online`;
  }

  function renderOnlineBadges() {
    const text = formatOnlineText(onlineCount);
    document.querySelectorAll('[data-online-label]').forEach(el => {
      el.textContent = text;
    });
    document.querySelectorAll('[data-online-count]').forEach(el => {
      el.textContent = String(onlineCount);
    });
  }

  function syncPresenceCount() {
    if (!channel) return;
    try {
      const state = channel.presenceState() || {};
      const keys = Object.keys(state);
      onlineCount = Math.max(1, keys.length);
      renderOnlineBadges();
    } catch (_) {}
  }

  function connectPresence() {
    const client = getSharedSupabaseClient();
    if (!client) return;
    if (channel) {
      try { client.removeChannel(channel); } catch (_) {}
      channel = null;
    }

    const visitorId = getVisitorId();
    channel = client.channel(CHANNEL_NAME, {
      config: { presence: { key: visitorId } }
    });

    channel
      .on('presence', { event: 'sync' }, syncPresenceCount)
      .on('presence', { event: 'join' }, syncPresenceCount)
      .on('presence', { event: 'leave' }, syncPresenceCount)
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({
              page: window.location.pathname || '/',
              online_at: new Date().toISOString()
            });
            syncPresenceCount();
          } catch (_) {}
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(connectPresence, 5000);
        }
      });
  }

  document.addEventListener('viora-language-change', renderOnlineBadges);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!channel || channel.state === 'closed' || channel.state === 'errored')) {
      connectPresence();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderOnlineBadges();
      connectPresence();
    });
  } else {
    renderOnlineBadges();
    connectPresence();
  }

  window.VioraPresence = {
    get count() { return onlineCount; },
    refresh: syncPresenceCount
  };
})();
