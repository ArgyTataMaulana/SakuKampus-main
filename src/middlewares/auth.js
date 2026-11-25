import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const JWT_SECRET = process.env.JWT_SECRET || 'sakukampus-team7-secret-key-2026';

export function signUserToken(user) {
  return jwt.sign(
    {
      id: user.id,
      google_sub: user.google_sub,
      email: user.email,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function resolveOrHydrateUser(decoded) {
  if (!decoded) return null;

  let query = supabase
    .from('users')
    .select('id, google_sub, email, name, picture_url');

  if (decoded.google_sub) {
    query = query.eq('google_sub', decoded.google_sub);
  } else if (decoded.id) {
    query = query.eq('id', decoded.id);
  } else {
    return null;
  }

  const { data: existingUser, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Supabase user lookup failed: ${error.message}`);
  }

  if (existingUser) {
    return existingUser;
  }

  // Re-hydrate user into Supabase if JWT is valid
  if (decoded.google_sub) {
    const picture = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(decoded.name || 'User')}`;
    const { data: createdUser, error: upsertError } = await supabase
      .from('users')
      .upsert(
        {
          google_sub: decoded.google_sub,
          email: decoded.email || '',
          name: decoded.name || 'Mahasiswa UMY',
          picture_url: picture,
          last_login_at: new Date().toISOString()
        },
        { onConflict: 'google_sub' }
      )
      .select('id, google_sub, email, name, picture_url')
      .single();

    if (upsertError) {
      throw new Error(`Supabase user hydration failed: ${upsertError.message}`);
    }
    return createdUser;
  }

  return null;
}

export async function authMiddleware(req, res, next) {
  const token = req.cookies?.sakukampus_token || req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan login terlebih dahulu.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await resolveOrHydrateUser(decoded);
    if (!user) {
      res.clearCookie('sakukampus_token');
      return res.status(401).json({ error: 'Pengguna tidak valid.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.message && err.message.startsWith('Supabase')) {
      console.error('[AUTH] Database error:', err.message);
      return res.status(503).json({ error: 'Layanan autentikasi cloud sedang sibuk. Silakan coba lagi.' });
    }
    res.clearCookie('sakukampus_token');
    return res.status(401).json({ error: 'Sesi kedaluwarsa atau tidak valid.' });
  }
}
