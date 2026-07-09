// =====================================================================
// Kabalega Portal backend
// Connects to your MySQL "mydatabase" and serves the /api/state
// endpoint the portal's HTML file already calls (API_BASE = localhost:4000).
//
// GET  /api/state  -> reassembles the full app state as JSON from the DB
// POST /api/state  -> receives the full app state JSON and rewrites the DB
// =====================================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json({ limit: "25mb" })); // uploaded files travel as base64

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "1123",
  database: process.env.DB_NAME || "mydatabase",
  waitForConnections: true,
  connectionLimit: 10,
});

const dateOnly = (v) => (v ? new Date(v).toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------
// GET /api/state — read every table and rebuild the STATE shape
// ---------------------------------------------------------------
app.get("/api/state", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [students] = await conn.query("SELECT * FROM students");
    const [teachersRows] = await conn.query("SELECT * FROM teachers");
    const [admins] = await conn.query("SELECT id, name, pass FROM admins");
    const [feesRows] = await conn.query("SELECT * FROM fees_structure");
    const [payments] = await conn.query("SELECT * FROM payments");
    const [results] = await conn.query("SELECT * FROM results");
    const [testsRows] = await conn.query("SELECT * FROM tests");
    const [submissions] = await conn.query("SELECT * FROM submissions");
    const [attemptsRows] = await conn.query("SELECT * FROM attempts");
    const [lateRows] = await conn.query("SELECT * FROM late_permissions");
    const [notes] = await conn.query("SELECT * FROM notes");
    const [issuesRows] = await conn.query("SELECT * FROM issues");
    const [notifRows] = await conn.query("SELECT * FROM notifications");
    const [library] = await conn.query("SELECT * FROM library");
    const [positions] = await conn.query("SELECT * FROM voting_positions");
    const [candidates] = await conn.query("SELECT * FROM voting_candidates");
    const [ballotsRows] = await conn.query("SELECT * FROM ballots");
    const [groupsRows] = await conn.query("SELECT * FROM chat_groups");
    const [messages] = await conn.query(
      "SELECT * FROM chat_messages ORDER BY ts ASC, id ASC"
    );

    const feesStructure = {};
    feesRows.forEach((r) => (feesStructure[r.cls] = r.amount));

    const attempts = {};
    attemptsRows.forEach(
      (r) => (attempts[`${r.test_id}|${r.student_id}`] = Number(r.started_at))
    );

    const latePermissions = {};
    lateRows.forEach((r) => (latePermissions[`${r.test_id}|${r.student_id}`] = true));

    const ballots = {};
    ballotsRows.forEach(
      (r) => (ballots[`${r.student_id}|${r.position_id}`] = r.candidate_id)
    );

    // votes are derived by counting ballots per (position, candidate)
    const votes = {};
    ballotsRows.forEach((r) => {
      const key = `${r.position_id}|${r.candidate_id}`;
      votes[key] = (votes[key] || 0) + 1;
    });

    const tests = testsRows.map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subject,
      cls: t.cls,
      teacherId: t.teacher_id,
      duration: t.duration,
      type: t.type,
      active: !!t.active,
      questions: t.questions || undefined,
      fileData: t.file_data || undefined,
      fileName: t.file_name || undefined,
    }));

    const teachers = teachersRows.map((t) => ({
      id: t.id,
      name: t.name,
      pass: t.pass,
      status: t.status,
      paid: !!t.paid,
      subjects: t.subjects || [],
      classes: t.classes || [],
    }));

    const votingPositions = positions.map((p) => ({
      id: p.id,
      title: p.title,
      startAt: p.start_at ? Number(p.start_at) : null,
      endAt: p.end_at ? Number(p.end_at) : null,
      announced: !!p.announced,
      candidates: candidates
        .filter((c) => c.position_id === p.id)
        .map((c) => ({ id: c.id, name: c.name, cls: c.cls })),
    }));

    const groups = {};
    groupsRows.forEach((g) => {
      groups[g.key_name] = {
        name: g.display_name,
        messages: messages
          .filter((m) => m.group_key === g.key_name)
          .map((m) => ({ who: m.who, text: m.msg_text, time: m.msg_time })),
      };
    });

    const notifications = notifRows
      .map((n) => ({
        id: n.id,
        audience: {
          type: n.audience_type,
          ...(n.audience_cls ? { cls: n.audience_cls } : {}),
          ...(n.audience_id ? { id: n.audience_id } : {}),
        },
        text: n.text,
        date: dateOnly(n.notif_date),
        ts: Number(n.ts),
        readBy: n.read_by || [],
      }))
      .sort((a, b) => b.ts - a.ts);

    const state = {
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        cls: s.cls,
        adm: s.adm,
        pass: s.pass,
        status: s.status,
      })),
      teachers,
      admins,
      feesStructure,
      payments: payments.map((p) => ({
        id: p.id,
        studentId: p.student_id,
        amount: p.amount,
        date: dateOnly(p.pay_date),
        method: p.method,
      })),
      results: results.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        subject: r.subject,
        term: r.term,
        score: r.score,
        type: r.type,
      })),
      tests,
      submissions: submissions.map((s) => ({
        id: s.id,
        testId: s.test_id,
        studentId: s.student_id,
        score: s.score,
        total: s.total,
        date: dateOnly(s.sub_date),
      })),
      attempts,
      latePermissions,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        subject: n.subject,
        cls: n.cls,
        teacherId: n.teacher_id,
        body: n.body,
        date: dateOnly(n.note_date),
        fileData: n.file_data || undefined,
        fileName: n.file_name || undefined,
        fileType: n.file_type || undefined,
      })),
      issues: issuesRows.map((i) => ({
        id: i.id,
        by: i.by_id,
        role: i.role,
        category: i.category,
        title: i.title,
        desc: i.description,
        status: i.status,
        date: dateOnly(i.issue_date),
      })),
      notifications,
      library: library.map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        subject: b.subject,
        cls: b.cls,
        category: b.category,
        uploaderId: b.uploader_id,
        uploaderRole: b.uploader_role,
        fileData: b.file_data || undefined,
        fileName: b.file_name || undefined,
        date: dateOnly(b.lib_date),
      })),
      voting: { positions: votingPositions, votes, ballots },
      groups,
    };

    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load state", detail: err.message });
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------
// POST /api/state — receives the full state blob, rewrites the DB
// ---------------------------------------------------------------
app.post("/api/state", async (req, res) => {
  const s = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Disable FK checks while we wipe + reload everything in one shot.
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");

    // ---- people ----
    await conn.query("DELETE FROM students");
    for (const st of s.students || []) {
      await conn.query(
        "INSERT INTO students (id,name,cls,adm,pass,status) VALUES (?,?,?,?,?,?)",
        [st.id, st.name, st.cls, st.adm, st.pass, st.status || "approved"]
      );
    }

    await conn.query("DELETE FROM teachers");
    for (const t of s.teachers || []) {
      await conn.query(
        "INSERT INTO teachers (id,name,pass,status,paid,subjects,classes) VALUES (?,?,?,?,?,?,?)",
        [
          t.id,
          t.name,
          t.pass,
          t.status || "approved",
          !!t.paid,
          JSON.stringify(t.subjects || []),
          JSON.stringify(t.classes || []),
        ]
      );
    }

    await conn.query("DELETE FROM admins");
    for (const a of s.admins || []) {
      await conn.query("INSERT INTO admins (id,name,pass) VALUES (?,?,?)", [
        a.id,
        a.name,
        a.pass,
      ]);
    }

    // ---- fees ----
    await conn.query("DELETE FROM fees_structure");
    for (const cls of Object.keys(s.feesStructure || {})) {
      await conn.query(
        "INSERT INTO fees_structure (cls, amount) VALUES (?,?)",
        [cls, s.feesStructure[cls]]
      );
    }

    await conn.query("DELETE FROM payments");
    for (const p of s.payments || []) {
      await conn.query(
        "INSERT INTO payments (id,student_id,amount,pay_date,method) VALUES (?,?,?,?,?)",
        [p.id, p.studentId, p.amount, p.date, p.method || "Front Office"]
      );
    }

    // ---- results ----
    await conn.query("DELETE FROM results");
    for (const r of s.results || []) {
      await conn.query(
        "INSERT INTO results (id,student_id,subject,term,score,type) VALUES (?,?,?,?,?,?)",
        [r.id, r.studentId, r.subject, r.term, r.score, r.type]
      );
    }

    // ---- tests / submissions / attempts / late permissions ----
    await conn.query("DELETE FROM tests");
    for (const t of s.tests || []) {
      await conn.query(
        `INSERT INTO tests (id,title,subject,cls,teacher_id,duration,type,active,questions,file_data,file_name)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          t.id,
          t.title,
          t.subject,
          t.cls,
          t.teacherId,
          t.duration,
          t.type,
          !!t.active,
          t.questions ? JSON.stringify(t.questions) : null,
          t.fileData || null,
          t.fileName || null,
        ]
      );
    }

    await conn.query("DELETE FROM submissions");
    for (const sub of s.submissions || []) {
      await conn.query(
        "INSERT INTO submissions (id,test_id,student_id,score,total,sub_date) VALUES (?,?,?,?,?,?)",
        [sub.id, sub.testId, sub.studentId, sub.score, sub.total, sub.date]
      );
    }

    await conn.query("DELETE FROM attempts");
    for (const key of Object.keys(s.attempts || {})) {
      const [testId, studentId] = key.split("|");
      await conn.query(
        "INSERT INTO attempts (test_id,student_id,started_at) VALUES (?,?,?)",
        [testId, studentId, s.attempts[key]]
      );
    }

    await conn.query("DELETE FROM late_permissions");
    for (const key of Object.keys(s.latePermissions || {})) {
      const [testId, studentId] = key.split("|");
      await conn.query(
        "INSERT INTO late_permissions (test_id,student_id) VALUES (?,?)",
        [testId, studentId]
      );
    }

    // ---- notes ----
    await conn.query("DELETE FROM notes");
    for (const n of s.notes || []) {
      await conn.query(
        `INSERT INTO notes (id,title,subject,cls,teacher_id,body,note_date,file_data,file_name,file_type)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          n.id,
          n.title,
          n.subject,
          n.cls,
          n.teacherId,
          n.body || null,
          n.date,
          n.fileData || null,
          n.fileName || null,
          n.fileType || null,
        ]
      );
    }

    // ---- issues ----
    await conn.query("DELETE FROM issues");
    for (const i of s.issues || []) {
      await conn.query(
        "INSERT INTO issues (id,by_id,role,category,title,description,status,issue_date) VALUES (?,?,?,?,?,?,?,?)",
        [i.id, i.by, i.role, i.category, i.title, i.desc, i.status, i.date]
      );
    }

    // ---- notifications ----
    await conn.query("DELETE FROM notifications");
    for (const n of s.notifications || []) {
      await conn.query(
        `INSERT INTO notifications (id,audience_type,audience_cls,audience_id,text,notif_date,ts,read_by)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          n.id,
          n.audience?.type || "all",
          n.audience?.cls || null,
          n.audience?.id || null,
          n.text,
          n.date,
          n.ts,
          JSON.stringify(n.readBy || []),
        ]
      );
    }

    // ---- library ----
    await conn.query("DELETE FROM library");
    for (const b of s.library || []) {
      await conn.query(
        `INSERT INTO library (id,title,author,subject,cls,category,uploader_id,uploader_role,file_data,file_name,lib_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          b.id,
          b.title,
          b.author || null,
          b.subject,
          b.cls,
          b.category,
          b.uploaderId,
          b.uploaderRole,
          b.fileData || null,
          b.fileName || null,
          b.date,
        ]
      );
    }

    // ---- voting ----
    await conn.query("DELETE FROM voting_candidates");
    await conn.query("DELETE FROM voting_positions");
    for (const p of s.voting?.positions || []) {
      await conn.query(
        "INSERT INTO voting_positions (id,title,start_at,end_at,announced) VALUES (?,?,?,?,?)",
        [p.id, p.title, p.startAt || null, p.endAt || null, !!p.announced]
      );
      for (const c of p.candidates || []) {
        await conn.query(
          "INSERT INTO voting_candidates (id,position_id,name,cls) VALUES (?,?,?,?)",
          [c.id, p.id, c.name, c.cls || null]
        );
      }
    }

    await conn.query("DELETE FROM ballots");
    for (const key of Object.keys(s.voting?.ballots || {})) {
      const [studentId, positionId] = key.split("|");
      const candidateId = s.voting.ballots[key];
      await conn.query(
        "INSERT INTO ballots (student_id,position_id,candidate_id) VALUES (?,?,?)",
        [studentId, positionId, candidateId]
      );
    }

    // ---- chat groups / messages ----
    await conn.query("DELETE FROM chat_messages");
    for (const key of Object.keys(s.groups || {})) {
      const g = s.groups[key];
      await conn.query(
        "INSERT INTO chat_groups (key_name, display_name) VALUES (?,?) ON DUPLICATE KEY UPDATE display_name=VALUES(display_name)",
        [key, g.name || key]
      );
      let ts = Date.now();
      for (const m of g.messages || []) {
        await conn.query(
          "INSERT INTO chat_messages (group_key, who, msg_text, msg_time, ts) VALUES (?,?,?,?,?)",
          [key, m.who, m.text, m.time, ts++]
        );
      }
    }

    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to save state", detail: err.message });
  } finally {
    conn.release();
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Kabalega portal API listening on http://localhost:${PORT}`);
});