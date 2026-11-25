// API Client & Core Utilities for SakuKampus UMY

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const api = {
  async get(url) {
    const res = await fetch(url);
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    return res.json();
  },

  async post(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    return res.json();
  },

  async put(url, body) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    return res.json();
  },

  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      throw new Error('Unauthorized');
    }
    return res.json();
  }
};
