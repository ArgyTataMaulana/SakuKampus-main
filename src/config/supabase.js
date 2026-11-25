import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://meyqgbmuoezdvpcalmde.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZloaGkIWyNahAw5N5pcNsA_AZuLVJ6k';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// In-memory cache for static 12 categories to minimize redundant DB roundtrips
let cachedCategories = null;
let cacheTimestamp = 0;
const CATEGORY_CACHE_TTL_MS = 5 * 60 * 1000;

export async function getAllCategories() {
  const now = Date.now();
  if (cachedCategories && now - cacheTimestamp < CATEGORY_CACHE_TTL_MS) {
    return cachedCategories;
  }

  const { data, error } = await supabase
    .from('categories')
    .select('id, name, type')
    .order('type', { ascending: false })
    .order('id', { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat kategori dari Supabase: ${error.message}`);
  }

  cachedCategories = data || [];
  cacheTimestamp = now;
  return cachedCategories;
}

export async function getCategoriesMap() {
  const categories = await getAllCategories();
  return new Map(categories.map((cat) => [String(cat.id), cat]));
}

export async function verifySupabaseConnection() {
  try {
    const categories = await getAllCategories();
    console.log('=======================================================');
    console.log('☁️  Database Backend: SUPABASE CLOUD POSTGRESQL (Single Source of Truth)');
    console.log(`🌐 Project URL: ${SUPABASE_URL}`);
    console.log(`✅ Status: Terhubung (${categories.length} kategori aktif)`);
    console.log('=======================================================');
  } catch (err) {
    console.error('⚠️ Gagal verifikasi koneksi Supabase:', err.message);
  }
}
