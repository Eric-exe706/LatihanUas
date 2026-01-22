const express = require('express');
const path = require('path');
const session = require('express-session');
const { promisePool, testConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Session middleware
app.use(session({
  secret: 'belajarjs-secret-key-2025', // Ganti dengan secret key yang lebih aman di production
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 jam
    httpOnly: true
  }
}));

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Middleware untuk cek apakah user sudah login
const requireLogin = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  next();
};

// Login endpoint dengan database MySQL
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(200).json({ success: false, message: 'Username dan password wajib diisi.' });
  }

  try {
    // Query user dari database
    const [rows] = await promisePool.execute(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length > 0) {
      const user = rows[0];
      
      // Simpan user ke session
      req.session.user = {
        id: user.id,
        username: user.username
      };
      
      return res.status(200).json({ 
        success: true, 
        message: `Login berhasil! Selamat datang, ${user.username}`,
        redirect: '/dashboard'
      });
    } else {
      return res.status(200).json({ 
        success: false, 
        message: 'Login gagal. Username atau password salah.' 
      });
    }
  } catch (error) {
    console.error('Database error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Terjadi kesalahan server. Silakan coba lagi.' 
    });
  }
});

// Endpoint logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Gagal logout' });
    }
    res.json({ success: true, message: 'Logout berhasil' });
  });
});

// Endpoint untuk cek session (opsional)
app.get('/api/check-session', (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// Route untuk dashboard (dilindungi)
app.get('/dashboard', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Route untuk user management
app.get('/user-management', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'user-management.html'));
});

// Route untuk halaman list mahasiswa
app.get('/mahasiswa', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mahasiswa.html'));
});

// GET - Ambil semua data user
app.get('/api/users', requireLogin, async (req, res) => {
  try {
    const [rows] = await promisePool.execute('SELECT * FROM users ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data user' });
  }
});


// POST - Tambah user baru
app.post('/api/users', requireLogin, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Semua field wajib diisi' });
  }

  try {
    // Cek apakah username sudah ada
    const [existing] = await promisePool.execute('SELECT id FROM users WHERE username = ?', [username]);
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan' });
    }

    const [result] = await promisePool.execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, password]
    );

    res.json({ 
      success: true, 
      message: 'User berhasil ditambahkan',
      data: { id: result.insertId, username }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ success: false, message: 'Gagal menambahkan user' });
  }
});

// POST - Tambah mahasiswa
app.post('/api/mahasiswa', requireLogin, async (req, res) => {
  const { user_id, nim, nama, email, tanggal_lahir } = req.body;

  if (!user_id || !nim || !nama) {
    return res.status(400).json({
      success: false,
      message: 'User ID, NIM, dan Nama wajib diisi'
    });
  }

  try {
    // Cek apakah user sudah punya mahasiswa
    const [cek] = await promisePool.execute(
      'SELECT id_mahasiswa FROM mahasiswa WHERE user_id = ?',
      [user_id]
    );

    if (cek.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User ini sudah terdaftar sebagai mahasiswa'
      });
    }

    await promisePool.execute(
      `INSERT INTO mahasiswa (user_id, nim, nama, email, tanggal_lahir)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, nim, nama, email, tanggal_lahir]
    );

    res.json({
      success: true,
      message: 'Mahasiswa berhasil ditambahkan'
    });
  } catch (error) {
    console.error('Error tambah mahasiswa:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal menambahkan mahasiswa'
    });
  }
});

app.post('/api/buku', requireLogin, async (req, res) => {
  const { mahasiswa_id, judul, penulis, tahun } = req.body;

  if (!mahasiswa_id || !judul) {
    return res.status(400).json({
      success: false,
      message: 'Mahasiswa dan judul wajib diisi'
    });
  }

  await promisePool.execute(
    'INSERT INTO buku (mahasiswa_id, judul, penulis, tahun) VALUES (?, ?, ?, ?)',
    [mahasiswa_id, judul, penulis, tahun]
  );

  res.json({
    success: true,
    message: 'Buku berhasil ditambahkan'
  });
});

// GET - Ambil data user berdasarkan ID
app.get('/api/users/:id', requireLogin, async (req, res) => {
  try {
    const [rows] = await promisePool.execute('SELECT id, username, password FROM users WHERE id = ?', [req.params.id]);
    
    if (rows.length > 0) {
      res.json({ success: true, data: rows[0] });
    } else {
      res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ success: false, message: 'Gagal mengambil data user' });
  }
});

// GET - Ambil semua mahasiswa
app.get('/api/mahasiswa', requireLogin, async (req, res) => {
  try {
    const [rows] = await promisePool.execute(`
      SELECT 
        m.id_mahasiswa,
        m.nim,
        m.nama,
        m.email,
        m.tanggal_lahir,
        u.username
      FROM mahasiswa m
      JOIN users u ON m.user_id = u.id
      ORDER BY m.id_mahasiswa DESC
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error ambil mahasiswa:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data mahasiswa'
    });
  }
});

// PUT - Update mahasiswa
app.put('/api/mahasiswa/:id', requireLogin, async (req, res) => {
  const { nim, nama, email, tanggal_lahir } = req.body;
  const id = req.params.id;

  if (!nim || !nama) {
    return res.status(400).json({
      success: false,
      message: 'NIM dan Nama wajib diisi'
    });
  }

  try {
    const [result] = await promisePool.execute(
      `UPDATE mahasiswa 
       SET nim = ?, nama = ?, email = ?, tanggal_lahir = ?
       WHERE id_mahasiswa = ?`,
      [nim, nama, email, tanggal_lahir, id]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Mahasiswa berhasil diupdate' });
    } else {
      res.status(404).json({ success: false, message: 'Mahasiswa tidak ditemukan' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal update mahasiswa' });
  }
});

// DELETE - Hapus mahasiswa (buku ikut terhapus karena CASCADE)
app.delete('/api/mahasiswa/:id', requireLogin, async (req, res) => {
  try {
    const [result] = await promisePool.execute(
      'DELETE FROM mahasiswa WHERE id_mahasiswa = ?',
      [req.params.id]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Mahasiswa berhasil dihapus' });
    } else {
      res.status(404).json({ success: false, message: 'Mahasiswa tidak ditemukan' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal hapus mahasiswa' });
  }
});

// GET - Buku yang dipinjam mahasiswa
app.get('/api/mahasiswa/:id/buku', requireLogin, async (req, res) => {
  try {
    const [rows] = await promisePool.execute(
      'SELECT * FROM buku WHERE mahasiswa_id = ?',
      [req.params.id]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data buku'
    });
  }
});

// DELETE - Hapus buku
app.delete('/api/buku/:id', requireLogin, async (req, res) => {
  try {
    const [result] = await promisePool.execute(
      'DELETE FROM buku WHERE id_buku = ?',
      [req.params.id]
    );

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'Buku berhasil dihapus' });
    } else {
      res.status(404).json({ success: false, message: 'Buku tidak ditemukan' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Gagal hapus buku' });
  }
});



// PUT - Update user
app.put('/api/users/:id', requireLogin, async (req, res) => {
  const { username, password } = req.body;
  const userId = req.params.id;
  
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username wajib diisi' });
  }

  try {
    // Cek apakah username sudah digunakan oleh user lain
    const [existing] = await promisePool.execute(
      'SELECT id FROM users WHERE username = ? AND id != ?', 
      [username, userId]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Username sudah digunakan oleh user lain' });
    }

    // Update dengan atau tanpa password
    let query, params;
    if (password && password.trim() !== '') {
      query = 'UPDATE users SET username = ?, password = ? WHERE id = ?';
      params = [username, password, userId];
    } else {
      query = 'UPDATE users SET username = ? WHERE id = ?';
      params = [username, userId];
    }

    const [result] = await promisePool.execute(query, params);

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'User berhasil diupdate' });
    } else {
      res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ success: false, message: 'Gagal mengupdate user' });
  }
});

// DELETE - Hapus user
app.delete('/api/users/:id', requireLogin, async (req, res) => {
  const userId = req.params.id;

  // Cegah menghapus user yang sedang login
  if (req.session.user && req.session.user.id == userId) {
    return res.status(400).json({ success: false, message: 'Tidak dapat menghapus user yang sedang login' });
  }

  try {
    const [result] = await promisePool.execute('DELETE FROM users WHERE id = ?', [userId]);

    if (result.affectedRows > 0) {
      res.json({ success: true, message: 'User berhasil dihapus' });
    } else {
      res.status(404).json({ success: false, message: 'User tidak ditemukan' });
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ success: false, message: 'Gagal menghapus user' });
  }
});

// ===== END API CRUD USER MANAGEMENT =====

// Fallback to index.html for root
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  
  // Test koneksi database saat server start
  await testConnection();
});
