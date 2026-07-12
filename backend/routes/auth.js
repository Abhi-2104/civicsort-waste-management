import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { JWT_SECRET, writeAudit, authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = db.prepare(`
    SELECT u.*, r.name as role_name FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE u.email = ? AND u.is_active = 1
  `).get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign({
    id: user.id, name: user.name, email: user.email,
    role: user.role_name, communityId: user.community_id
  }, JWT_SECRET, { expiresIn: '12h' });

  writeAudit({ userId: user.id, action: 'LOGIN', entityType: 'user', entityId: user.id, ip: req.ip });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role_name, communityId: user.community_id }
  });
});

router.post('/logout', authenticate, (req, res) => {
  writeAudit({ userId: req.user.id, action: 'LOGOUT', entityType: 'user', entityId: req.user.id, ip: req.ip });
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
