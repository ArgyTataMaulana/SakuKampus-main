import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://meyqgbmuoezdvpcalmde.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZloaGkIWyNahAw5N5pcNsA_AZuLVJ6k';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('=======================================================');
console.log('☁️  Database Backend: SUPABASE CLOUD POSTGRESQL');
console.log(`🌐 Project URL: ${SUPABASE_URL}`);
console.log('✅ Status: Terhubung ke Cloud Database Supabase');
console.log('=======================================================');

export async function initDatabase() {
  try {
    const { data, error } = await supabase.from('categories').select('id, name');
    if (error) {
      console.warn('⚠️ Periksa koneksi Supabase:', error.message);
    } else {
      console.log(`✅ Supabase terverifikasi: ${data.length} kategori aktif.`);
    }
  } catch (err) {
    console.error('Gagal inisialisasi Supabase:', err);
  }
}
