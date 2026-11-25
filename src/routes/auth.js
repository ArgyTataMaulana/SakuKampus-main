import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

import { supabase } from '../config/supabase.js';
import { signUserToken, resolveOrHydrateUser } from '../middlewares/auth.js';

export const authRouter = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
};

/**
 * Helper to find or create/update a user in Supabase
 */
async function upsertSupabaseUser({ google_sub, email, name, picture_url }) {
  const { data: existingBySub } = await supabase
    .from('users')
    .select('id, google_sub, email, name, picture_url')
    .eq('google_sub', google_sub)
    .maybeSingle();

  if (existingBySub) {
    const { data: updated, error } = await supabase
      .from('users')
      .update({
        email,
        name,
        picture_url,
        last_login_at: new Date().toISOString()
      })
      .eq('id', existingBySub.id)
      .select('id, google_sub, email, name, picture_url')
      .single();

    if (error) throw new Error(error.message);
    return updated;
  }

  // Fallback check by email in case user was previously created with another sub
  if (email) {
    const { data: existingByEmail } = await supabase
      .from('users')
      .select('id, google_sub, email, name, picture_url')
      .eq('email', email)
      .maybeSingle();

    if (existingByEmail) {
      const { data: updated, error } = await supabase
        .from('users')
        .update({
          name,
          picture_url,
          last_login_at: new Date().toISOString()
        })
        .eq('id', existingByEmail.id)
        .select('id, google_sub, email, name, picture_url')
        .single();

      if (error) throw new Error(error.message);
      return updated;
    }
  }

  const { data: created, error: insertError } = await supabase
    .from('users')
    .insert({
      google_sub,
      email,
      name,
      picture_url,
      last_login_at: new Date().toISOString()
    })
    .select('id, google_sub, email, name, picture_url')
    .single();

  if (insertError) throw new Error(insertError.message);
  return created;
}

/**
 * Initiate Google OAuth 2.0 flow
 */
authRouter.get('/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

  if (!clientId || !clientSecret) {
    console.warn('[AUTH] GOOGLE_CLIENT_ID atau GOOGLE_CLIENT_SECRET belum terbaca di .env! Mengarahkan ke modal...');
    return res.redirect('/login.html?action=google_login');
  }

  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('oauth_state', state, {
    httpOnly: true,
    maxAge: 10 * 60 * 1000, // 10 minutes
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

/**
 * Handle Google OAuth callback
 */
authRouter.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const savedState = req.cookies?.oauth_state;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

  if (error === 'access_denied' || error) {
    return res.redirect('/login.html?error=cancelled');
  }

  if (!state || !savedState || state !== savedState) {
    return res.redirect('/login.html?error=invalid_state');
  }

  res.clearCookie('oauth_state');

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenRes.ok) {
      console.error('Failed to exchange code:', await tokenRes.text());
      return res.redirect('/login.html?error=invalid_token');
    }

    const tokenData = await tokenRes.json();
    const userinfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });

    if (!userinfoRes.ok) {
      return res.redirect('/login.html?error=profile_fetch_failed');
    }

    const profile = await userinfoRes.json();
    const googleSub = profile.sub;
    const email = profile.email;
    const name = profile.name || email.split('@')[0];
    const picture = profile.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;

    const user = await upsertSupabaseUser({
      google_sub: googleSub,
      email,
      name,
      picture_url: picture
    });

    const token = signUserToken(user);
    res.cookie('sakukampus_token', token, COOKIE_OPTIONS);
    res.redirect('/index.html');
  } catch (err) {
    console.error('OAuth Callback Exception:', err);
    res.redirect('/login.html?error=oauth_exception');
  }
});

/**
 * Direct Google Sign-In (Demo / Instant Account Modal)
 */
authRouter.post('/google-direct', async (req, res) => {
  try {
    const {
      email = 'dimas.pratama@student.umy.ac.id',
      name = 'Dimas Pratama',
      google_sub
    } = req.body || {};

    const cleanEmail = (typeof email === 'string' && email.trim()) ? email.trim() : 'dimas.pratama@student.umy.ac.id';
    const cleanName = (typeof name === 'string' && name.trim()) ? name.trim() : 'Dimas Pratama';
    const sub = google_sub || 'google-sub-' + Buffer.from(cleanEmail).toString('hex').slice(0, 16);
    const picture = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(cleanName)}`;

    const user = await upsertSupabaseUser({
      google_sub: sub,
      email: cleanEmail,
      name: cleanName,
      picture_url: picture
    });

    const token = signUserToken(user);
    res.cookie('sakukampus_token', token, COOKIE_OPTIONS);
    return res.json({ success: true, user });
  } catch (err) {
    console.error('[AUTH] /google-direct error:', err.message);
    return res.status(503).json({ error: 'Gagal menghubungi database cloud.' });
  }
});

/**
 * Demo Login (For instant local evaluation & testing)
 */
authRouter.post('/demo-login', async (req, res) => {
  try {
    const user = await upsertSupabaseUser({
      google_sub: 'demo-mahasiswa-108',
      email: 'dimas.pratama@student.umy.ac.id',
      name: 'Dimas Pratama (Demo Mahasiswa)',
      picture_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Dimas'
    });

    const token = signUserToken(user);
    res.cookie('sakukampus_token', token, COOKIE_OPTIONS);
    return res.json({ success: true, user });
  } catch (err) {
    console.error('[AUTH] /demo-login error:', err.message);
    return res.status(503).json({ error: 'Gagal menghubungi database cloud.' });
  }
});

/**
 * Check authentication status & get profile
 */
authRouter.get('/me', async (req, res) => {
  const token = req.cookies?.sakukampus_token;
  if (!token) {
    return res.json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sakukampus-team7-secret-key-2026');
    const user = await resolveOrHydrateUser(decoded);
    if (!user) {
      return res.json({ authenticated: false });
    }
    return res.json({ authenticated: true, user });
  } catch {
    return res.json({ authenticated: false });
  }
});

/**
 * Logout (F-01)
 */
authRouter.post('/logout', (req, res) => {
  res.clearCookie('sakukampus_token');
  res.json({ success: true, message: 'Berhasil logout' });
});

authRouter.get('/logout', (req, res) => {
  res.clearCookie('sakukampus_token');
  res.redirect('/login.html');
});
