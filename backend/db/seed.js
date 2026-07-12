import { db } from './index.js';
import bcrypt from 'bcryptjs';

const roles = ['Administrator', 'Maker', 'Supervisor', 'Resident'];
const insertRole = db.prepare('INSERT OR IGNORE INTO roles (name) VALUES (?)');
roles.forEach(r => insertRole.run(r));

const roleId = (name) => db.prepare('SELECT id FROM roles WHERE name=?').get(name).id;

// Community
let community = db.prepare('SELECT * FROM communities LIMIT 1').get();
if (!community) {
  const info = db.prepare(`INSERT INTO communities (name, address, contact_phone, contact_email)
    VALUES (?, ?, ?, ?)`).run('Green Meadows Residency', '12 Lake View Road, Chennai', '+91-9840000000', 'admin@greenmeadows.example');
  community = db.prepare('SELECT * FROM communities WHERE id=?').get(info.lastInsertRowid);
}
const communityId = community.id;

// Users
const insertUser = db.prepare(`INSERT OR IGNORE INTO users (community_id, name, email, mobile_number, password_hash, role_id)
  VALUES (?, ?, ?, ?, ?, ?)`);
const pw = bcrypt.hashSync('password123', 10);
insertUser.run(communityId, 'Ananya Rao (Admin)', 'admin@demo.com', '+91-9000000001', pw, roleId('Administrator'));
insertUser.run(communityId, 'Karthik Iyer (Maker)', 'maker@demo.com', '+91-9000000002', pw, roleId('Maker'));
insertUser.run(communityId, 'Divya Menon (Supervisor)', 'supervisor@demo.com', '+91-9000000003', pw, roleId('Supervisor'));

// Blocks
const insertBlock = db.prepare(`INSERT OR IGNORE INTO blocks (community_id, name, ward, street) VALUES (?, ?, ?, ?)`);
['Block A', 'Block B', 'Block C'].forEach((b, i) => insertBlock.run(communityId, b, `Ward ${i + 1}`, `Street ${i + 1}`));

const blocks = db.prepare('SELECT * FROM blocks WHERE community_id=?').all(communityId);

// Flats
const insertFlat = db.prepare(`INSERT OR IGNORE INTO flats
  (community_id, block_id, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

const sampleResidents = [
  ['101', 'R. Suresh Kumar', 'R. Suresh Kumar', '+91-9123456701', 'suresh101@demo.com'],
  ['102', 'Lakshmi Narayanan', 'Priya Lakshmi', '+91-9123456702', 'priya102@demo.com'],
  ['201', 'Mohammed Faizal', 'Mohammed Faizal', '+91-9123456703', 'faizal201@demo.com'],
  ['202', 'Anitha Reddy', 'Anitha Reddy', '+91-9123456704', 'anitha202@demo.com'],
  ['301', 'Vikram Singh', 'Vikram Singh', '+91-9123456705', 'vikram301@demo.com'],
];
blocks.forEach(block => {
  sampleResidents.forEach(([flat, owner, resident, mobile, email]) => {
    insertFlat.run(communityId, block.id, flat, owner, resident, mobile, email, 'Occupied');
  });
});

// Violation categories
const insertCat = db.prepare(`INSERT OR IGNORE INTO violation_categories (community_id, name, description) VALUES (?, ?, ?)`);
const categories = [
  ['Mixed Waste Disposal', 'Wet and dry waste disposed together.'],
  ['Dry Waste on Non-designated Day', 'Dry waste disposed on a day not designated for dry waste collection.'],
  ['Unapproved Sanitary Waste Disposal', 'Sanitary waste disposed without an approved sanitary disposal bag.'],
  ['Waste Handed to Unauthorized Person', 'Waste handed over to anyone other than the designated janitor.'],
];
categories.forEach(([name, desc]) => insertCat.run(communityId, name, desc));

const cats = db.prepare('SELECT * FROM violation_categories WHERE community_id=?').all(communityId);
const catId = (name) => cats.find(c => c.name === name).id;

// Penalty rules
const insertRule = db.prepare(`INSERT INTO penalty_rules (category_id, warnings_before_penalty, penalty_amount, effective_date)
  SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM penalty_rules WHERE category_id=?)`);
const today = new Date().toISOString().slice(0, 10);
insertRule.run(catId('Mixed Waste Disposal'), 3, 500, today, catId('Mixed Waste Disposal'));
insertRule.run(catId('Dry Waste on Non-designated Day'), 2, 200, today, catId('Dry Waste on Non-designated Day'));
insertRule.run(catId('Unapproved Sanitary Waste Disposal'), 1, 300, today, catId('Unapproved Sanitary Waste Disposal'));
insertRule.run(catId('Waste Handed to Unauthorized Person'), 1, 250, today, catId('Waste Handed to Unauthorized Person'));

// Communication templates
const insertTpl = db.prepare(`INSERT OR IGNORE INTO communication_templates
  (community_id, channel, event_type, subject_template, body_template) VALUES (?, ?, ?, ?, ?)`);
insertTpl.run(communityId, 'Email', 'Warning',
  'Waste Disposal Warning - Flat {{flat_number}}',
  'Dear {{resident_name}}, this is warning #{{warning_number}} for {{category_name}} recorded on {{date}} at Flat {{flat_number}}. Remarks: {{remarks}}. Please dispose waste as per community guidelines.');
insertTpl.run(communityId, 'Email', 'Penalty',
  'Waste Disposal Penalty - Flat {{flat_number}}',
  'Dear {{resident_name}}, a penalty of Rs.{{penalty_amount}} (Penalty No. {{penalty_number}}) has been levied for {{category_name}} recorded on {{date}} at Flat {{flat_number}}. Remarks: {{remarks}}.');

console.log('Seed complete.');
console.log('Login users (password: password123):');
console.log(' Admin:      admin@demo.com');
console.log(' Maker:      maker@demo.com');
console.log(' Supervisor: supervisor@demo.com');
