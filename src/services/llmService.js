import dotenv from 'dotenv';
import { aiGenerateJson, getActiveProvider } from './aiProvider.js';
dotenv.config();

const VALID_CATEGORIES = [
  'Makan', 'Transportasi', 'Belanja', 'Tagihan', 'Hiburan',
  'Kesehatan', 'Pendidikan', 'Lain-lain pengeluaran',
  'Gaji', 'Uang saku', 'Bonus', 'Lain-lain pemasukan'
];

/**
 * Call Universal AI Provider (Groq / Gemini) with structured JSON output as secondary fallback
 * (Compliant with T8-3 & T8-4 cost mitigation: AI is only called if rule parser fails)
 */
export async function parseSentenceWithLLM(text) {
  const provider = getActiveProvider();
  if (provider === 'none') {
    return { success: false, reason: 'Tidak ada API Key AI (GROQ_API_KEY atau GEMINI_API_KEY) yang aktif di .env' };
  }

  const prompt = `Anda adalah asisten pencatat keuangan mahasiswa SakuKampus UMY.
Tugas Anda: Ekstrak informasi transaksi dari kalimat bahasa Indonesia berikut:
"${text}"

Kategori yang diizinkan HANYA salah satu dari:
Pengeluaran: Makan, Transportasi, Belanja, Tagihan, Hiburan, Kesehatan, Pendidikan, Lain-lain pengeluaran
Pemasukan: Gaji, Uang saku, Bonus, Lain-lain pemasukan

Tipe transaksi: "income" atau "expense".
Tanggal hari ini adalah: ${new Date().toISOString().split('T')[0]}.

ATURAN KHUSUS UTANG / PINJAMAN:
Jika kalimat menyatakan memiliki utang, berutang, atau meminjam uang (misal: "aku punya utang 50rb", "minjam uang 100rb", "pinjam 50k", "ngutang 25rb"), WAJIB dikategorikan sebagai "Tagihan" dengan tipe "expense" (karena merupakan beban kewajiban yang mengurangi saldo bersih).

Balas HANYA dalam format JSON murni tanpa markdown, dengan struktur:
{
  "is_transaction": true / false,
  "nominal": integer_rupiah_positif,
  "type": "income" | "expense",
  "category": "salah satu kategori di atas",
  "description": "deskripsi singkat ringkas",
  "date": "YYYY-MM-DD"
}
Jika kalimat BUKAN transaksi keuangan atau nominal tidak jelas, balas dengan {"is_transaction": false}.`;

  try {
    const parsed = await aiGenerateJson({ prompt, temperature: 0.1 });

    if (!parsed) {
      return { success: false, reason: 'Respons AI tidak dapat diproses' };
    }

    if (!parsed.is_transaction || !parsed.nominal || parsed.nominal <= 0) {
      return { success: false, reason: 'AI menyatakan bukan transaksi yang valid' };
    }

    // Validate category
    let category = parsed.category;
    if (!VALID_CATEGORIES.includes(category)) {
      category = parsed.type === 'income' ? 'Lain-lain pemasukan' : 'Lain-lain pengeluaran';
    }

    const type = ['Gaji', 'Uang saku', 'Bonus', 'Lain-lain pemasukan'].includes(category) ? 'income' : 'expense';

    return {
      success: true,
      data: {
        amount: Math.round(Number(parsed.nominal)),
        type,
        category,
        description: parsed.description || 'Transaksi SakuKampus',
        occurred_on: parsed.date || new Date().toISOString().split('T')[0],
        raw_text: text,
        parsed_by: `ai (${provider})`
      }
    };
  } catch (err) {
    console.error('Error invoking AI:', err.message);
    return { success: false, reason: err.message };
  }
}
