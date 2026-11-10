/* =========================================================
   KONFIGURASI: ubah bagian ini sesuai kebutuhan Anda
   ========================================================= */
const CONFIG = {
  judul: "Help Build New Classrooms - Syafana Madani Center",
  target: 100000000,                  // target dana (Rp)
  terkumpulAwal: 0,                   // dana awal (Rp) jika sheet kosong / belum diisi
  batasAkhir: "2026-12-31",           // tanggal akhir kampanye (YYYY-MM-DD)
  nominalCepat: [10000, 25000, 50000, 100000, 250000, 500000],
  minimalDonasi: 10000,
  whatsapp: "6289510836198",          // nomor WA admin (format 62...)
  qrisGambar: "qris.png",             // taruh file gambar QRIS di folder yang sama
  kursUSD: 16000,
  nominalCepatUSD: [5, 10, 25, 50, 100, 250],
  minimalDonasiUSD: 5,
  paypalMe: "ZaenudinRozak",               // Ubah dengan username PayPal.Me Anda
  paypalQR: "paypal-qr.png",                       // opsional: nama file QR PayPal, mis. "paypal-qr.png"

  /* DATA DONASI TERVERIFIKASI
     Isi dengan link CSV dari Google Sheet (File > Share > Publish to web > CSV).
     Kolom baris pertama (header) harus persis: nama,nilai,mata,pesan,waktu
       - nama  : nama donatur (atau Hamba Allah)
       - nilai : jumlah donasi dalam mata uangnya (angka saja, mis. 50000)
       - mata  : IDR atau USD
       - pesan : doa/pesan (boleh kosong)
       - waktu : tanggal, mis. 2026-11-09 atau 2026-11-09T14:30:00
     Admin HANYA menambah baris setelah mengecek uang benar-benar masuk. */
  sheetCSV: "https://docs.google.com/spreadsheets/d/1_hP1QRuhm3i3b98t0ewUrvw_KKbnZWJQz2aGMbWxFGY/gviz/tq?tqx=out:csv&gid=2097638416",
  refreshDetik: 60,                   // cek ulang data sheet tiap N detik

  rekening: [
    { bank: "Bank Syariah Indonesia (BSI)", no: "1234567890", nama: "Committee Syafana Madani Center" },
    { bank: "Bank Negara Indonesia (BNI)", no: "1854465763", nama: "Committee Syafana Madani Center" }
  ]
};

/* =========================================================
   UTILITAS
   ========================================================= */
const rupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
let mataUang = "IDR";
const fmt = (n, m = mataUang) =>
  m === "USD" ? "$" + Number(n || 0).toLocaleString("en-US") : rupiah(n);

const METODE = { IDR: ["qris", "bank"], USD: ["paypal"] };
const NAMA_METODE = { qris: "QRIS", bank: "Transfer Bank", paypal: "PayPal" };
const $ = (id) => document.getElementById(id);

function waktuRelatif(ts) {
  const menit = Math.floor((Date.now() - ts) / 60000);
  if (menit < 1) return "just now";
  if (menit < 60) return menit + " minutes ago";
  const jam = Math.floor(menit / 60);
  if (jam < 24) return jam + " hours ago";
  return Math.floor(jam / 24) + " days ago";
}

/* Parser CSV sederhana (mendukung tanda kutip & koma di dalam teks) */
function parseCSV(teks) {
  const baris = [];
  let sel = "", row = [], kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ",") { row.push(sel); sel = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && teks[i + 1] === "\n") i++;
      row.push(sel); sel = "";
      if (row.some((x) => x.trim() !== "")) baris.push(row);
      row = [];
    } else sel += c;
  }
  row.push(sel);
  if (row.some((x) => x.trim() !== "")) baris.push(row);
  return baris;
}

/* Kode unik donasi, mis. DN-7K3QX */
function buatKodeDonasi() {
  const huruf = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let k = "";
  for (let i = 0; i < 5; i++) k += huruf[Math.floor(Math.random() * huruf.length)];
  return "DN-" + k;
}

/* =========================================================
   STATE
   ========================================================= */
let donatur = [];                    // hanya dari sheet terverifikasi
let terkumpul = CONFIG.terkumpulAwal;
let nominalDipilih = 0;
let donasiTertunda = null;

/* =========================================================
   DATA TERVERIFIKASI (dari Google Sheet)
   ========================================================= */
async function muatDonasiTerverifikasi() {
  if (!CONFIG.sheetCSV) return;
  try {
    const res = await fetch(CONFIG.sheetCSV + (CONFIG.sheetCSV.includes("?") ? "&" : "?") + "t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const rows = parseCSV(await res.text());
    if (rows.length < 2) { donatur = []; terkumpul = CONFIG.terkumpulAwal; return; }

    const head = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (n) => head.indexOf(n);
    const iNama = idx("nama"), iNilai = idx("nilai"), iMata = idx("mata"), iPesan = idx("pesan"), iWaktu = idx("waktu");

    const list = [];
    let total = CONFIG.terkumpulAwal;
    rows.slice(1).forEach((r) => {
      const nilai = Number(String(r[iNilai] || "").replace(/[^\d.]/g, "")) || 0;
      if (!nilai) return;
      const mata = (r[iMata] || "IDR").trim().toUpperCase() === "USD" ? "USD" : "IDR";
      const jumlah = mata === "USD" ? Math.round(nilai * CONFIG.kursUSD) : nilai;
      const waktu = Date.parse(r[iWaktu]) || Date.now();
      list.push({
        nama: (r[iNama] || "").trim() || "Hamba Allah",
        nilai, mata, jumlah,
        pesan: (r[iPesan] || "").trim(),
        waktu
      });
      total += jumlah;
    });
    list.sort((a, b) => b.waktu - a.waktu);
    donatur = list;
    terkumpul = total;
  } catch (e) {
    console.warn("Gagal memuat data donasi:", e);
  }
}

async function segarkan() {
  await muatDonasiTerverifikasi();
  renderProgres();
  renderDonatur();
}

/* =========================================================
   TAMPILAN: progres, hari, donatur
   ========================================================= */
function renderProgres() {
  const persen = Math.min(100, Math.round((terkumpul / CONFIG.target) * 100));
  $("terkumpulUSD").textContent = "≈ " + fmt(Math.round(terkumpul / CONFIG.kursUSD), "USD");
  $("terkumpul").textContent = rupiah(terkumpul);
  $("target").textContent = rupiah(CONFIG.target);
  $("persen").textContent = persen + "%";
  $("progressFill").style.width = persen + "%";
  $("progressWrap").setAttribute("aria-valuenow", persen);

  const sisa = Math.ceil((new Date(CONFIG.batasAkhir + "T23:59:59") - Date.now()) / 86400000);
  $("sisaHari").textContent = Math.max(0, sisa);
}

function renderDonatur() {
  const ul = $("daftarDonatur");
  ul.innerHTML = "";
  $("jumlahDonatur").textContent = donatur.length + " person";

  donatur.slice(0, 20).forEach((d) => {
    const li = document.createElement("li");

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = (d.nama || "A").charAt(0).toUpperCase();

    const info = document.createElement("div");
    const nama = document.createElement("div");
    nama.className = "d-name";
    nama.textContent = d.nama + " ";
    const jml = document.createElement("span");
    jml.className = "d-amount";
    jml.textContent = "· " + fmt(d.nilai, d.mata || "IDR");
    nama.appendChild(jml);
    info.appendChild(nama);

    if (d.pesan) {
      const p = document.createElement("p");
      p.className = "d-msg";
      p.textContent = "“" + d.pesan + "”";
      info.appendChild(p);
    }
    const t = document.createElement("div");
    t.className = "d-time";
    t.textContent = waktuRelatif(d.waktu);
    info.appendChild(t);

    li.append(avatar, info);
    ul.appendChild(li);
  });
}

/* =========================================================
   NOMINAL CEPAT & INPUT
   ========================================================= */
function renderNominalCepat() {
  const wadah = $("nominalCepat");
  wadah.innerHTML = "";
  const daftar = mataUang === "USD" ? CONFIG.nominalCepatUSD : CONFIG.nominalCepat;
  daftar.forEach((n) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = fmt(n);
    b.dataset.nilai = n;
    b.addEventListener("click", () => setNominal(n));
    wadah.appendChild(b);
  });
}

function tandaiAktif() {
  document.querySelectorAll("#nominalCepat button").forEach((b) => {
    b.classList.toggle("active", Number(b.dataset.nilai) === nominalDipilih);
  });
}

function setNominal(n) {
  nominalDipilih = Number(n) || 0;
  $("nominal").value = nominalDipilih ? fmt(nominalDipilih) : "";
  tandaiAktif();
}

$("nominal").addEventListener("input", (e) => {
  nominalDipilih = Number(e.target.value.replace(/\D/g, "")) || 0;
  e.target.value = nominalDipilih ? fmt(nominalDipilih) : "";
  tandaiAktif();
});

function renderMetode() {
  const daftar = METODE[mataUang];
  const wadah = $("metodeList");
  wadah.innerHTML = "";
  daftar.forEach((m, i) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "metode";
    radio.value = m;
    radio.checked = i === 0;
    label.append(radio, document.createTextNode(" " + NAMA_METODE[m]));
    wadah.appendChild(label);
  });
}

$("mataUang").addEventListener("change", (e) => {
  mataUang = e.target.value;
  setNominal(0);
  $("nominal").placeholder = fmt(0);
  $("calcHari").value = mataUang === "USD" ? 1 : 5000;
  $("error").textContent = "";
  renderNominalCepat();
  renderMetode();
  hitungKalkulator();
});

/* =========================================================
   KALKULATOR DONASI RUTIN
   ========================================================= */
function hitungKalkulator() {
  const hari = Number($("calcHari").value) || 0;
  const bulan = Number($("calcBulan").value) || 0;
  const total = hari * 30 * bulan;
  $("calcTotal").textContent = fmt(total);
  return total;
}
$("calcHari").addEventListener("input", hitungKalkulator);
$("calcBulan").addEventListener("input", hitungKalkulator);
$("calcPakai").addEventListener("click", () => {
  setNominal(hitungKalkulator());
  $("donasi").scrollIntoView({ behavior: "smooth" });
});

/* =========================================================
   FORM & PEMBAYARAN
   ========================================================= */
$("formDonasi").addEventListener("submit", (e) => {
  e.preventDefault();
  const err = $("error");
  err.textContent = "";

  const min = mataUang === "USD" ? CONFIG.minimalDonasiUSD : CONFIG.minimalDonasi;
  if (nominalDipilih < min) {
    err.textContent = "Minimal donasi " + fmt(min) + ".";
    return;
  }
  const anonim = $("anonim").checked;
  const nama = $("nama").value.trim();
  if (!anonim && !nama) {
    err.textContent = "Isi nama Anda atau centang sembunyikan nama.";
    return;
  }

  // Kode unik 3 digit (hanya IDR) ditambahkan ke nominal agar admin
  // mudah mencocokkan dengan mutasi rekening.
  const kodeUnik = mataUang === "IDR" ? Math.floor(100 + Math.random() * 900) : 0;

  donasiTertunda = {
    ref: buatKodeDonasi(),
    nama: anonim ? "Hamba Allah" : nama,
    namaAsli: nama || "Anonim",
    mata: mataUang,
    nilai: nominalDipilih,
    kodeUnik: kodeUnik,
    totalBayar: nominalDipilih + kodeUnik,
    pesan: $("pesan").value.trim(),
    metode: document.querySelector('input[name="metode"]:checked').value
  };
  bukaModal(donasiTertunda);
});

function kartu(ul, judul, baris, salinNilai, salinLabel) {
  const li = document.createElement("li");
  const s = document.createElement("strong");
  s.textContent = judul;
  li.appendChild(s);
  baris.forEach(([label, nilai]) => {
    li.appendChild(document.createTextNode(label + ": " + nilai));
    li.appendChild(document.createElement("br"));
  });
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = salinLabel;
  btn.addEventListener("click", () => {
    if (navigator.clipboard) navigator.clipboard.writeText(salinNilai);
    btn.textContent = "Copied ✓";
  });
  li.appendChild(btn);
  ul.appendChild(li);
}

function bukaModal(d) {
  ["Qris", "Bank", "Swift", "Paypal"].forEach((p) => { $("panel" + p).hidden = true; });
  $("modalNominal").textContent = fmt(d.totalBayar, d.mata);

  // Info kode referensi & nominal persis (dibuat dinamis, tanpa ubah HTML)
  let info = $("modalRefInfo");
  if (!info) {
    info = document.createElement("p");
    info.id = "modalRefInfo";
    info.className = "muted small";
    $("modalNominal").parentElement.after(info);
  }
  info.textContent = d.kodeUnik
    ? "Please transfer the EXACT amount above (includes unique code " + d.kodeUnik + "). Reference: " + d.ref
    : "Reference code: " + d.ref;

  if (d.metode === "qris") {
    $("panelQris").hidden = false;
    const img = $("qrisImg");
    img.src = CONFIG.qrisGambar;
    img.onerror = () => { img.removeAttribute("src"); img.alt = "Letakkan file qris.png di folder yang sama"; };
  }

  if (d.metode === "bank") {
    $("panelBank").hidden = false;
    const ul = $("listBank");
    ul.innerHTML = "";
    CONFIG.rekening.forEach((r) =>
      kartu(ul, r.bank, [["Account No", r.no], ["Account name", r.nama]], r.no, "Copy Account No"));
  }

  if (d.metode === "paypal") {
    $("panelPaypal").hidden = false;
    const paypalUser = CONFIG.paypalMe;

    let infoText = document.getElementById("paypalInfoText");
    if (!infoText) {
      infoText = document.createElement("p");
      infoText.id = "paypalInfoText";
      infoText.className = "muted small";
      $("panelPaypal").prepend(infoText);
    }
    infoText.textContent = "Send via PayPal to: @" + paypalUser + ". Please write this reference in the PayPal note: " + d.ref;

    // QR PayPal (opsional): tampil hanya jika CONFIG.paypalQR diisi
    let qr = document.getElementById("paypalQrImg");
    if (CONFIG.paypalQR) {
      if (!qr) {
        qr = document.createElement("img");
        qr.id = "paypalQrImg";
        qr.className = "qris";
        qr.alt = "QR PayPal";
        $("panelPaypal").appendChild(qr);
      }
      qr.src = CONFIG.paypalQR;
      qr.hidden = false;
      qr.onerror = () => { qr.hidden = true; };
    } else if (qr) {
      qr.hidden = true;
    }

    $("paypalBtn").href = "https://www.paypal.me/" + encodeURIComponent(paypalUser) + "/" + d.nilai + "USD";
  }

  $("modal").hidden = false;
}

function tutupModal() { $("modal").hidden = true; }
$("tutup").addEventListener("click", tutupModal);
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") tutupModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") tutupModal(); });

/* Konfirmasi: TIDAK mengubah total/daftar donatur.
   Hanya membuka WhatsApp admin. Donasi baru tampil setelah admin
   memverifikasi mutasi dan menambahkannya ke Google Sheet. */
$("konfirmasi").addEventListener("click", () => {
  if (!donasiTertunda) return;
  const d = donasiTertunda;

  const teks =
    "Hai, I have donated.\n" +
    "Ref: " + d.ref + "\n" +
    "Program: " + CONFIG.judul + "\n" +
    "Name: " + d.namaAsli + "\n" +
    "Amount transferred: " + fmt(d.totalBayar, d.mata) + "\n" +
    "Method: " + NAMA_METODE[d.metode] +
    (d.pesan ? "\nPrayer: " + d.pesan : "") +
    "\nPlease kindly confirm, thank you.";
  window.open("https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(teks), "_blank");

  tutupModal();
  $("nama").value = "";
  $("pesan").value = "";
  $("anonim").checked = false;
  setNominal(0);
  donasiTertunda = null;
});

/* =========================================================
   INISIALISASI
   ========================================================= */
document.title = CONFIG.judul;
$("judul").textContent = CONFIG.judul;
$("tahun").textContent = new Date().getFullYear();
renderNominalCepat();
renderMetode();
renderProgres();
renderDonatur();
hitungKalkulator();
segarkan();
if (CONFIG.sheetCSV && CONFIG.refreshDetik > 0) setInterval(segarkan, CONFIG.refreshDetik * 1000);
