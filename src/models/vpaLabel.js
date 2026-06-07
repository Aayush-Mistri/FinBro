const db = require('../db/db');

const VPALabel = {
  upsert(userId, vpa, label, category) {
    const stmt = db.prepare(`
      INSERT INTO vpa_labels (user_id, vpa, label, category)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, vpa) DO UPDATE SET
        label = excluded.label,
        category = excluded.category
    `);
    const info = stmt.run(userId, vpa, label, category);
    return { user_id: userId, vpa, label, category };
  },

  getByVpa(userId, vpa) {
    const stmt = db.prepare('SELECT * FROM vpa_labels WHERE user_id = ? AND vpa = ?');
    return stmt.get(userId, vpa);
  },

  getAll(userId) {
    const stmt = db.prepare('SELECT * FROM vpa_labels WHERE user_id = ? ORDER BY id DESC');
    return stmt.all(userId);
  },

  delete(userId, vpa) {
    const stmt = db.prepare('DELETE FROM vpa_labels WHERE user_id = ? AND vpa = ?');
    const info = stmt.run(userId, vpa);
    return info.changes > 0;
  }
};

module.exports = VPALabel;
