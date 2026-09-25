# Rencana Optimasi Asteroid3D

## Tujuan

Meningkatkan responsivitas pada perangkat mobile dan mengurangi tekanan garbage collector
tanpa mengubah aturan permainan, tampilan utama, atau dukungan WebGPU.

## Temuan Audit Awal

- Resolusi canvas dibatasi pada DPR `1.75`, yang dapat menghasilkan beban fill-rate tinggi
  pada perangkat mobile beresolusi besar.
- `renderer.js` membuat matriks `Float32Array`, objek draw queue, dan array warna/glow
  baru pada setiap frame.
- Uniform object ditulis dengan `queue.writeBuffer` untuk setiap draw call.
- Jalur collision membuat salinan array melalui spread saat memproses peluru.
- Particle, ring, dan entitas proyektil dihapus dengan `splice`, sehingga menghasilkan
  pergeseran elemen berulang saat jumlah efek meningkat.
- Tekstur depth dihancurkan dan dibuat ulang pada setiap event resize, termasuk resize
  yang berulang pada browser mobile.

## Ruang Lingkup

### Fase 1 — Responsivitas Render

1. Terapkan skala resolusi adaptif untuk mobile dengan batas DPR yang lebih konservatif
   dan tetap mempertahankan kualitas desktop.
2. Hindari rekreasi resource depth yang tidak diperlukan saat ukuran efektif canvas tidak
   berubah.
3. Kurangi alokasi sementara pada jalur render dengan memakai buffer/struktur reusable.

### Fase 2 — Penggunaan Memori Simulasi

1. Hilangkan salinan array collision yang tidak diperlukan.
2. Ganti penghapusan entitas efek/proyektil yang sering dengan strategi compaction yang
   lebih hemat alokasi.
3. Pertahankan batas partikel dan draw call yang sudah ada sebagai pengaman memori.

### Fase 3 — Validasi

1. Jalankan pemeriksaan sintaks/modul dan uji manual melalui server HTTP lokal.
2. Verifikasi mode menu, gameplay, jeda, game over, kontrol sentuh, dan resize.
3. Bandingkan perilaku pada desktop dan viewport mobile; pastikan tidak ada perubahan
   aturan skor, collision, atau lifecycle game.

## Kriteria Keberhasilan

- Tidak ada error JavaScript/WebGPU saat startup, resize, atau pergantian mode.
- Tidak ada alokasi array salinan pada loop collision peluru.
- Resize berulang tidak membuat ulang depth texture jika dimensi efektif sama.
- Canvas mobile menggunakan batas resolusi yang lebih hemat tanpa membuat HUD atau kontrol
  sentuh tidak responsif.
- Perubahan gameplay dan visual tetap setara secara fungsional dengan versi awal.

## Risiko dan Mitigasi

- **Risiko:** DPR terlalu rendah menurunkan ketajaman pada tablet.
  **Mitigasi:** gunakan batas berbeda untuk mobile dan desktop, serta ukur dimensi efektif.
- **Risiko:** strategi compaction mengubah urutan entitas.
  **Mitigasi:** pertahankan urutan selama penghapusan dan validasi collision/efek.
- **Risiko:** optimasi buffer menyulitkan debugging.
  **Mitigasi:** gunakan helper terisolasi dengan ukuran maksimum yang eksplisit.

## Urutan Eksekusi

1. Persetujuan rencana.
2. Implementasi perubahan renderer dan simulasi.
3. Pemeriksaan masalah/sintaks.
4. Validasi manual dan pelaporan hasil.
