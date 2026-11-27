# Ref Manager

Ref Manager adalah aplikasi web untuk mengelola referensi riset, membaca PDF, dan menyiapkan sitasi. Aplikasi berjalan di browser dan menyimpan library di IndexedDB. Kamu bisa menjalankannya secara lokal atau menaruh hasil build di hosting statis.

## Mulai pakai

1. Di tab **Cari**, masukkan DOI atau judul. Mode batch menerima beberapa pencarian sekaligus. Hasil metadata berasal dari Crossref dan DataCite.
2. Pilih **Simpan ke Library**. Untuk sumber yang tidak ditemukan, gunakan **Library → Tambah referensi**. Buka detail referensi untuk mengedit metadata, abstrak, koleksi, tag, dan status baca.
3. Gunakan pencarian dan filter di **Library** untuk menemukan kembali referensi. Satu referensi bisa masuk beberapa koleksi. **Cari duplikat** menampilkan kandidat dari DOI, ISBN buku, serta kemiripan judul dengan penulis dan tahun. Saat digabung, referensi yang kamu pilih mempertahankan nilai yang sudah terisi dan menerima metadata yang kosong, keanggotaan koleksi, tag, catatan, dan lampiran dari referensi lain.

## PDF dan catatan

- Buka referensi, pilih **Tambah PDF**, lalu klik **Baca PDF**. Pilih teks untuk menyorotnya, tambahkan komentar atau sticky note per halaman, dan gunakan **Salin ke catatan** untuk menyimpan anotasi sebagai catatan riset.
- Cari teks di pembaca PDF atau gunakan **Library → Cari isi PDF** untuk mencari di semua lampiran. Hasil pencarian bisa langsung membuka halaman yang cocok. Pencarian dan highlight memerlukan lapisan teks. PDF hasil pindai tanpa lapisan teks bisa dibaca sebagai gambar.
- **Baca metadata PDF** menampilkan judul, penulis, dan DOI yang tersedia dalam metadata file. Tinjau hasilnya dan pilih bidang yang mau diterapkan.
- **Catatan riset** menampung catatan pribadi, insight, dan kutipan. Catatan dapat berdiri sendiri atau ditautkan ke beberapa referensi. Anotasi disimpan di library Ref Manager. Unduhan lampiran berisi PDF asli.

## Sitasi dan daftar pustaka

Detail referensi bisa menghasilkan entri daftar pustaka APA 7, IEEE, Harvard (Cite Them Right), dan Chicago Author–Date. Di **Library → Ruang sitasi**, susun sumber mengikuti urutan pemakaian di dokumen. Kamu bisa menambahkan beberapa sumber per sitasi, penunjuk halaman, serta teks sebelum atau sesudah sitasi. Ruang sitasi juga mendukung Chicago Notes–Bibliography untuk catatan kaki.

Daftar pustaka mengikuti sumber di draf. Salin hasil ke Word, LibreOffice, atau Google Docs. Pemformatan seperti huruf miring ikut tersalin di browser yang mendukung clipboard HTML. Untuk gaya tambahan, impor file `.csl` atau masukkan ID dari [katalog gaya CSL](https://www.zotero.org/styles). Gaya hasil impor tersedia selama sesi ruang sitasi. Ekspor BibTeX dan RIS tersedia dari Library.

## Penyimpanan dan pindah perangkat

Di **Library → Backup library**, unduh file JSON yang memuat referensi, koleksi, tag, catatan, PDF, dan anotasi. Impor file itu di browser lain untuk mengembalikan library. Saat ada referensi yang sudah cocok, data di browser tujuan dipertahankan dan koleksi serta tag ditambahkan. Ekspor JSON biasa hanya berisi referensi.

Aplikasi dapat digunakan tanpa akun atau VPS. Backup dapat dipindahkan secara manual. Sinkronisasi otomatis, kolaborasi langsung, dan add-in editor dokumen belum tersedia. Pencarian metadata daring dan pengambilan gaya CSL dari katalog membutuhkan internet.

## Pengembangan

Gunakan Node.js 24 dan npm.

```sh
npm ci
npm run dev
```

Pengecekan sebelum push.

```sh
npm run lint
npm run test:citation
npm run build
```

Build statis tersedia di `dist/`. Tes sitasi mencakup artikel jurnal pada semua gaya bawaan, contoh APA untuk buku suntingan dan tahun yang kosong, serta urutan IEEE, disambiguasi APA, dan catatan kaki Chicago di ruang sitasi.

### Rilis di Vercel

Push setiap fitur sebagai commit tersendiri ke `dev`. Konfigurasi `vercel.json` melewati deploy otomatis dari branch tersebut. Saat siap rilis, gabungkan `dev` ke branch Production `master` tanpa squash dan push sekali. Vercel kemudian membangun semua perubahan di `master`. Gunakan `git revert` untuk membatalkan satu commit fitur sambil menyimpan riwayatnya.
